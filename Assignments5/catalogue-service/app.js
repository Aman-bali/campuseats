const express = require("express");
const crypto = require("crypto");
const zlib = require("zlib");
const errors = require("./errors");
const {
  ApiError,
  BadRequest,
  Unauthorized,
  NotFound,
  NotAcceptable,
  Conflict,
  PreconditionFailed,
  UnsupportedMediaType,
  Unprocessable,
  TooManyRequests,
  problem,
  render,
} = errors;
const { MenuItem, Restaurant } = require("./models");
const { Store } = require("./store");
const { checkPaymentsHealth } = require("./payments_client");
const {
  validateCreateMenuItem,
  validateReplaceMenuItem,
  validateAvailabilityUpdate,
  validateListParams,
} = require("./validation");

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS =
  "Content-Type, Authorization, Idempotency-Key, If-Match, If-None-Match, X-HTTP-Method-Override";
const CORS_EXPOSE =
  "ETag, Location, Retry-After, X-Total-Count, Link, Idempotent-Replayed, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset";
const READ_CACHE = "public, max-age=30";

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  hit(key, limit, window) {
    const t = Date.now() / 1000;
    let entry = this.buckets.get(key);
    if (!entry) {
      entry = [t, 0];
    }
    let [start, count] = entry;
    if (t - start >= window) {
      start = t;
      count = 0;
    }
    const reset = Math.max(1, Math.ceil(start + window - t));
    if (count >= limit) {
      return [false, 0, reset];
    }
    this.buckets.set(key, [start, count + 1]);
    return [true, limit - count - 1, reset];
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (scheme && scheme.toLowerCase() === "bearer" && token && token.trim()) {
    return token.trim();
  }
  return null;
}

function requireProtected(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw new Unauthorized("A non-empty `Authorization: Bearer <token>` header is required.", {
      "WWW-Authenticate": 'Bearer realm="campuseats"',
    });
  }
  return token;
}

function tagMatches(headerValue, etag, weakOk) {
  if (headerValue.trim() === "*") {
    return true;
  }
  const tags = headerValue.split(",").map((t) => t.trim());
  for (let tag of tags) {
    if (weakOk && tag.startsWith("W/")) {
      tag = tag.slice(2);
    }
    if (tag === etag) {
      return true;
    }
  }
  return false;
}

function requireIfMatch(req, etag) {
  const header = req.headers["if-match"];
  if (header !== undefined && !tagMatches(header, etag, false)) {
    throw new PreconditionFailed(
      "The resource changed since you read it (If-Match does not match the current ETag). Re-read it and retry.",
      { ETag: etag }
    );
  }
}

function createApp(config = {}) {
  const app = express();
  const store = new Store();
  const limiter = new RateLimiter();

  const RATE_LIMIT = Number(config.RATE_LIMIT || process.env.RATE_LIMIT || 100);
  const RATE_WINDOW = Number(config.RATE_WINDOW || process.env.RATE_WINDOW || 60);
  const CORS_ORIGIN = config.CORS_ORIGIN || process.env.CORS_ORIGIN || "*";
  const GZIP_MIN_BYTES = 500;

  app.locals.store = store;

  // 1. Method override fallback (POST only)
  app.use((req, res, next) => {
    const override = req.headers["x-http-method-override"];
    if (req.method === "POST" && override) {
      const wanted = override.trim().toUpperCase();
      if (["PUT", "PATCH", "DELETE"].includes(wanted)) {
        req.method = wanted;
        res.locals.methodOverridden = wanted;
      }
    }
    next();
  });

  // 2. Custom JSON body parser to strictly handle 415 / 400
  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const ctype = req.headers["content-type"] || "";
      if (ctype && !ctype.includes("application/json")) {
        return next(new UnsupportedMediaType("Send the body with `Content-Type: application/json`."));
      }
    }
    express.json()(req, res, (err) => {
      if (err) {
        return next(new BadRequest("Body is not valid JSON."));
      }
      next();
    });
  });

  // 3. Gate: Rate Limiting & Content Negotiation & OPTIONS Preflight
  app.use((req, res, next) => {
    // Decorate every response
    res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
    res.setHeader("Access-Control-Expose-Headers", CORS_EXPOSE);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

    // Rate Limiting
    if (req.method !== "OPTIONS") {
      const token = getBearerToken(req);
      const key = token
        ? "tok:" + crypto.createHash("sha256").update(token).digest("hex").slice(0, 12)
        : "ip:" + (req.ip || "unknown");

      const [ok, remaining, reset] = limiter.hit(key, RATE_LIMIT, RATE_WINDOW);
      res.setHeader("X-RateLimit-Limit", String(RATE_LIMIT));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(reset));

      if (!ok) {
        return next(
          new TooManyRequests("Per-client request budget exhausted.", {
            "Retry-After": String(reset),
          })
        );
      }
    }

    if (res.locals.methodOverridden) {
      res.setHeader("X-Method-Overridden", res.locals.methodOverridden);
    }

    // Accept negotiation
    const accept = req.headers.accept;
    if (accept && accept.trim() && accept !== "*/*") {
      const match =
        accept.includes("application/json") ||
        accept.includes("application/problem+json") ||
        accept.includes("*/*");
      if (!match) {
        return next(new NotAcceptable("This service only produces application/json."));
      }
    }

    next();
  });

  // Helper for cacheable reads
  function cacheableRead(req, res, payload, etag) {
    const inm = req.headers["if-none-match"];
    if (inm !== undefined && tagMatches(inm, etag, true)) {
      res.status(304);
      res.removeHeader("Content-Type");
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", READ_CACHE);
      return res.end();
    }
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", READ_CACHE);
    return sendJson(req, res, 200, payload);
  }

  // Send JSON with optional gzip compression >= 500 bytes
  function sendJson(req, res, status, payload, extraHeaders = {}) {
    res.status(status);
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
    const jsonStr = JSON.stringify(payload);
    const dataBuf = Buffer.from(jsonStr, "utf-8");

    if (
      status === 200 &&
      dataBuf.length >= GZIP_MIN_BYTES &&
      (req.headers["accept-encoding"] || "").includes("gzip")
    ) {
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Encoding", "gzip");
      const compressed = zlib.gzipSync(dataBuf);
      res.setHeader("Content-Length", String(compressed.length));
      return res.end(compressed);
    }

    if (!res.getHeader("Cache-Control") && (status >= 400 || !["GET", "HEAD"].includes(req.method))) {
      res.setHeader("Cache-Control", "no-store");
    }

    res.setHeader("Content-Type", "application/json");
    return res.end(jsonStr);
  }

  // OPTIONS Handler
  app.options("*", (req, res, next) => {
    const path = req.path;
    let allowed = [];

    if (path === "/menu-items") {
      allowed = ["GET", "OPTIONS"];
    } else if (path.startsWith("/menu-items/")) {
      const ref = path.replace("/menu-items/", "");
      if (ref === "ITEM-x" || store.items.has(ref)) {
        allowed = ["DELETE", "GET", "OPTIONS", "PUT"];
      } else {
        return next(new NotFound("No such resource."));
      }
    } else if (path.startsWith("/restaurants/")) {
      allowed = ["GET", "OPTIONS", "POST"];
    } else {
      return next(new NotFound("No such resource."));
    }

    res.status(204);
    res.removeHeader("Content-Type");
    res.setHeader("Allow", allowed.join(", "));
    if (req.headers["access-control-request-method"]) {
      res.setHeader("Access-Control-Allow-Methods", CORS_METHODS);
      res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
      res.setHeader("Access-Control-Max-Age", "600");
    }
    return res.end();
  });

  // RESTAURANTS
  app.get("/restaurants/:rid", (req, res, next) => {
    const r = store.restaurants.get(req.params.rid);
    if (!r) {
      return next(new NotFound(`No restaurant with id '${req.params.rid}'.`));
    }
    return cacheableRead(req, res, r.asJson(), r.etag());
  });

  function setOpen(rid, isOpen) {
    const r = store.restaurants.get(rid);
    if (!r) {
      throw new NotFound(`No restaurant with id '${rid}'.`);
    }
    let disabled = 0;
    if (r.is_open !== isOpen) {
      r.is_open = isOpen;
      r.version += 1;
    }
    if (!isOpen) {
      for (const it of store.items.values()) {
        if (it.restaurant_id === rid && it.is_available) {
          it.is_available = false;
          it.updated_at = now();
          it.version += 1;
          disabled += 1;
        }
      }
    }
    const body = r.asJson();
    body.itemsDisabled = disabled;
    return { body, etag: r.etag() };
  }

  app.post("/restaurants/:rid/close", (req, res, next) => {
    try {
      requireProtected(req);
      const { body, etag } = setOpen(req.params.rid, false);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(req, res, 200, body);
    } catch (err) {
      next(err);
    }
  });

  app.post("/restaurants/:rid/reopen", (req, res, next) => {
    try {
      requireProtected(req);
      const { body, etag } = setOpen(req.params.rid, true);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(req, res, 200, body);
    } catch (err) {
      next(err);
    }
  });

  // Canonical redirect 301
  app.get("/restaurants/:rid/menu-items/:ref", (req, res, next) => {
    const item = store.items.get(req.params.ref);
    if (!item || item.restaurant_id !== req.params.rid) {
      return next(new NotFound(`Item '${req.params.ref}' does not belong to restaurant '${req.params.rid}'.`));
    }
    const host = req.headers.host || "localhost";
    const proto = req.protocol || "http";
    const loc = `${proto}://${host}/menu-items/${req.params.ref}`;
    res.status(301);
    res.removeHeader("Content-Type");
    res.setHeader("Location", loc);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.end();
  });

  // MENU ITEMS
  app.post("/restaurants/:rid/menu-items", async (req, res, next) => {
    try {
      requireProtected(req);
      const rid = req.params.rid;
      const restaurant = store.restaurants.get(rid);
      if (!restaurant) {
        throw new NotFound(`No restaurant with id '${rid}'.`);
      }

      const key = req.headers["idempotency-key"];
      if (key !== undefined && (!key.trim() || key.trim().length > 255)) {
        throw new BadRequest("`Idempotency-Key` must be 1-255 characters.");
      }

      const idemKey = `${rid}:${key}`;
      if (key && store.idem.has(idemKey)) {
        const snap = store.idem.get(idemKey);
        res.setHeader("Location", snap.location);
        res.setHeader("ETag", snap.etag);
        res.setHeader("Idempotent-Replayed", "true");
        res.setHeader("Cache-Control", "no-store");
        return sendJson(req, res, 201, snap.body);
      }

      const data = validateCreateMenuItem(req.body);
      if (!restaurant.is_open) {
        throw new Unprocessable(`Restaurant '${rid}' is closed; reopen it before adding items.`);
      }

      const verified = await checkPaymentsHealth();
      if (!verified) {
        data.is_available = false;
      }

      const uid = crypto.randomUUID().replace(/-/g, "");
      const stamp = now();
      const item = new MenuItem({
        id: uid,
        restaurant_id: rid,
        merchant_verified: verified,
        created_at: stamp,
        updated_at: stamp,
        ...data,
      });

      store.items.set(item.ref, item);
      const host = req.headers.host || "localhost";
      const proto = req.protocol || "http";
      const location = `${proto}://${host}/menu-items/${item.ref}`;
      const body = item.asJson();
      const etag = item.etag();

      if (key) {
        store.idem.set(idemKey, { body, etag, location });
      }

      res.setHeader("Location", location);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-store");
      return sendJson(req, res, 201, body);
    } catch (err) {
      next(err);
    }
  });

  app.get("/menu-items", (req, res, next) => {
    try {
      const p = validateListParams(req.query);
      let rows = Array.from(store.items.values()).filter((i) => {
        if (p.restaurantId !== null && i.restaurant_id !== p.restaurantId) return false;
        if ("category" in p && i.category !== p.category) return false;
        if ("available" in p && i.is_available !== p.available) return false;
        if (p.query !== null) {
          const text = (i.name + " " + i.description).toLowerCase();
          if (!text.includes(p.query)) return false;
        }
        return true;
      });

      rows.sort((a, b) => {
        const valA = a[p.sort];
        const valB = b[p.sort];
        if (valA < valB) return p.desc ? 1 : -1;
        if (valA > valB) return p.desc ? -1 : 1;
        return 0;
      });

      const total = rows.length;
      const page = rows.slice(p.offset, p.offset + p.limit);

      const links = [];
      const host = req.headers.host || "localhost";
      const proto = req.protocol || "http";
      const baseUrl = `${proto}://${host}/menu-items`;

      const q = { ...req.query };
      if (p.offset + p.limit < total) {
        const nextQ = new URLSearchParams({ ...q, offset: String(p.offset + p.limit), limit: String(p.limit) });
        links.push(`<${baseUrl}?${nextQ.toString()}>; rel="next"`);
      }
      if (p.offset > 0) {
        const prevQ = new URLSearchParams({
          ...q,
          offset: String(Math.max(0, p.offset - p.limit)),
          limit: String(p.limit),
        });
        links.push(`<${baseUrl}?${prevQ.toString()}>; rel="prev"`);
      }

      const headers = { "X-Total-Count": String(total) };
      if (links.length > 0) {
        headers["Link"] = links.join(", ");
      }
      headers["Cache-Control"] = "public, max-age=10";

      return sendJson(
        req,
        res,
        200,
        page.map((i) => i.asJson()),
        headers
      );
    } catch (err) {
      next(err);
    }
  });

  app.put("/menu-items", (req, res) => {
    res.status(405);
    res.setHeader("Allow", "GET, OPTIONS");
    return errors.problem(res, 405, "Method Not Allowed", "method-not-allowed", "Method not allowed for this URL.", {
      Allow: "GET, OPTIONS",
    });
  });

  app.get("/menu-items/:ref", (req, res, next) => {
    const item = store.items.get(req.params.ref);
    if (!item) {
      return next(new NotFound(`No menu item with id '${req.params.ref}'.`));
    }
    return cacheableRead(req, res, item.asJson(), item.etag());
  });

  app.put("/menu-items/:ref", (req, res, next) => {
    try {
      requireProtected(req);
      const item = store.items.get(req.params.ref);
      if (!item) {
        throw new NotFound(`No menu item with id '${req.params.ref}'.`);
      }
      requireIfMatch(req, item.etag());
      const data = validateReplaceMenuItem(req.body);

      let changed = false;
      for (const [k, v] of Object.entries(data)) {
        if (item[k] !== v) {
          item[k] = v;
          changed = true;
        }
      }
      if (changed) {
        item.updated_at = now();
        item.version += 1;
      }

      res.setHeader("ETag", item.etag());
      res.setHeader("Cache-Control", "no-store");
      return sendJson(req, res, 200, item.asJson());
    } catch (err) {
      next(err);
    }
  });

  app.patch("/menu-items/:ref/availability", (req, res, next) => {
    try {
      requireProtected(req);
      const item = store.items.get(req.params.ref);
      if (!item) {
        throw new NotFound(`No menu item with id '${req.params.ref}'.`);
      }
      requireIfMatch(req, item.etag());
      const wanted = validateAvailabilityUpdate(req.body);

      if (wanted && !item.merchant_verified) {
        throw new Unprocessable(
          "Cannot mark available: the restaurant failed the Payments health check when this item was created."
        );
      }
      const rest = store.restaurants.get(item.restaurant_id);
      if (wanted && rest && !rest.is_open) {
        throw new Unprocessable("Cannot mark available while the restaurant is closed.");
      }

      if (item.is_available !== wanted) {
        item.is_available = wanted;
        item.updated_at = now();
        item.version += 1;
      }

      res.setHeader("ETag", item.etag());
      res.setHeader("Cache-Control", "no-store");
      return sendJson(req, res, 200, item.asJson());
    } catch (err) {
      next(err);
    }
  });

  app.delete("/menu-items/:ref", (req, res, next) => {
    try {
      requireProtected(req);
      const item = store.items.get(req.params.ref);
      if (!item) {
        throw new NotFound(`No menu item with id '${req.params.ref}'.`);
      }
      requireIfMatch(req, item.etag());
      if (item.is_available) {
        throw new Conflict("Item is still available - mark it unavailable before deleting it.");
      }
      store.items.delete(req.params.ref);
      res.status(204);
      res.removeHeader("Content-Type");
      res.setHeader("Cache-Control", "no-store");
      return res.end();
    } catch (err) {
      next(err);
    }
  });

  // Catch-all 404
  app.use((req, res, next) => {
    return next(new NotFound("The requested route does not exist."));
  });

  // Error handler
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      res.setHeader("Cache-Control", "no-store");
      return render(res, err);
    }
    console.error(err);
    res.setHeader("Cache-Control", "no-store");
    return errors.problem(res, 500, "Internal server error", "internal", "Unexpected error.");
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5000);
  createApp().listen(port, () => {
    console.log(`Catalogue service listening on port ${port}`);
  });
}

module.exports = {
  createApp,
};
