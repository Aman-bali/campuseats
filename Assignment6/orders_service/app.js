const express = require("express");
const crypto = require("crypto");
const { StaticAvailability } = require("./availability");
const { ProblemError, problem, renderProblem } = require("./errors");
const { Order, nowIso } = require("./models");
const { chooseFormat, respond, JSON_FMT } = require("./negotiation");
const { PaymentsClient, PaymentDeclined, PaymentsUnavailable } = require("./payments_client");
const { RateLimiter } = require("./ratelimit");
const { OrderStore } = require("./store");
const {
  validateOrder,
  cartIsEmpty,
  validateCancellation,
  validateListQuery,
} = require("./validation");

const ORDER_TAGS = { "orderList/items": "order" };

function sortObject(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObject(obj[key]);
  }
  return sorted;
}

function fingerprint(body) {
  const jsonStr = JSON.stringify(sortObject(body));
  return crypto.createHash("sha256").update(jsonStr).digest("hex");
}

function createApp({
  payments = null,
  store = null,
  availability = null,
  limiter = null,
} = {}) {
  const app = express();
  const S = store || new OrderStore();
  const P = payments || new PaymentsClient();
  const avail = availability || new StaticAvailability();
  const rateLimiter =
    limiter ||
    new RateLimiter(
      Number(process.env.RATE_LIMIT_MAX || 60),
      Number(process.env.RATE_LIMIT_WINDOW || 60)
    );

  // 1. Gate: Content Negotiation & Rate Limiting
  app.use((req, res, next) => {
    res.locals.fmt = JSON_FMT;
    const fmt = chooseFormat(req.headers.accept);
    if (fmt === null) {
      return next(
        new ProblemError(
          "not-acceptable",
          "This API can produce application/json (default) and application/xml."
        )
      );
    }
    res.locals.fmt = fmt;

    if (req.method !== "OPTIONS") {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const [ok, retry] = rateLimiter.check(clientIp);
      if (!ok) {
        return next(
          new ProblemError(
            "rate-limited",
            `More than ${rateLimiter.max} requests in ${Math.round(rateLimiter.window)} s. Wait ${retry} s and retry.`,
            { headers: { "Retry-After": String(retry) } }
          )
        );
      }
    }

    next();
  });

  // 2. Custom JSON Parser with 64 KiB limit and strict 415 / 400 checking
  app.use((req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const ctype = req.headers["content-type"] || "";
      if (ctype && !ctype.includes("application/json")) {
        return next(
          new ProblemError(
            "unsupported-media-type",
            "Send the body as JSON with 'Content-Type: application/json'."
          )
        );
      }
    }
    express.json({ limit: "64kb" })(req, res, (err) => {
      if (err) {
        if (err.type === "entity.too.large" || err.status === 413) {
          res.status(413);
          return renderProblem(
            req,
            res,
            413,
            "payload-too-large",
            "Payload Too Large",
            "Request payload exceeds 64 KiB limit."
          );
        }
        return next(
          new ProblemError("malformed-json", "The request body is not valid JSON.")
        );
      }
      next();
    });
  });

  // 3. Disallowed Methods on collection and item (A1: 405 with Allow header)
  app.all("/orders", (req, res, next) => {
    if (["PATCH", "DELETE"].includes(req.method)) {
      return next(
        new ProblemError(
          "method-not-allowed",
          `${req.method} is not supported here. Allowed: GET, POST, OPTIONS.`,
          { headers: { Allow: "GET, POST, OPTIONS" } }
        )
      );
    }
    next();
  });

  app.all("/orders/:oid", (req, res, next) => {
    if (["PATCH", "DELETE"].includes(req.method)) {
      return next(
        new ProblemError(
          "method-not-allowed",
          `${req.method} is not supported here. Allowed: GET, OPTIONS.`,
          { headers: { Allow: "GET, OPTIONS" } }
        )
      );
    }
    next();
  });

  // OPTIONS handler
  app.options("/orders", (req, res) => {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return respond(req, res, {}, 204, { root: "options" });
  });

  app.options("/orders/:oid", (req, res) => {
    res.setHeader("Allow", "GET, OPTIONS");
    return respond(req, res, {}, 204, { root: "options" });
  });

  // 4. Routes
  app.post("/orders", async (req, res, next) => {
    try {
      const body = req.body;
      const errs = validateOrder(body);
      if (errs.length > 0) {
        if (cartIsEmpty(body)) {
          throw new ProblemError(
            "empty-cart",
            "The order contains no items. Add at least one item.",
            { errors: errs }
          );
        }
        const n = errs.length;
        throw new ProblemError(
          "validation-failed",
          `${n} field${n !== 1 ? "s" : ""} failed validation; see 'errors'.`,
          { errors: errs }
        );
      }

      const key = req.headers["idempotency-key"] || null;
      const fp = fingerprint(body);

      if (key) {
        const prior = S.by_key(key);
        if (prior) {
          if (prior.request_fingerprint !== fp) {
            throw new ProblemError(
              "idempotency-key-reused",
              "This Idempotency-Key was already used with a different request body."
            );
          }
          return respond(req, res, prior.asJson(), 201, {
            root: "order",
            headers: {
              Location: `/orders/${prior.public_id}`,
              "Idempotent-Replay": "true",
            },
          });
        }
      }

      const gone = avail.unavailable_among(body.items.map((i) => i.itemId));
      if (gone.length > 0) {
        throw new ProblemError(
          "item-unavailable",
          `Not available right now: ${gone.join(", ")}. Remove the unavailable item${
            gone.length > 1 ? "s" : ""
          } and retry.`
        );
      }

      const total = body.items.reduce(
        (sum, item) => sum + Number(item.unitPrice) * item.quantity,
        0
      );
      const currency = body.currency || "INR";
      const seq = S.next_seq();
      const orderRef = `ORD-${String(seq).padStart(4, "0")}`;
      const payKey = key || `order-${crypto.randomUUID()}`;

      let txn;
      try {
        txn = await P.charge(orderRef, total, currency, body.cardToken, payKey);
      } catch (e) {
        if (e instanceof PaymentDeclined || e.name === "PaymentDeclined") {
          throw new ProblemError("payment-declined", e.detail);
        }
        if (e instanceof PaymentsUnavailable || e.name === "PaymentsUnavailable") {
          console.warn("payments unavailable for %s: %s", orderRef, e.message);
          throw new ProblemError(
            "payments-unavailable",
            "The payment service is temporarily unavailable. The order was not placed and you were not charged. Retry with the same Idempotency-Key.",
            { headers: { "Retry-After": "5" } }
          );
        }
        throw e;
      }

      const order = new Order({
        seq,
        student_id: body.studentId,
        address: body.address,
        items: body.items,
        total,
        currency,
        card_token: body.cardToken,
        idempotency_key: key,
        request_fingerprint: fp,
        payment_txn_id: String((txn && txn.id) || ""),
      });
      S.add(order);

      return respond(req, res, order.asJson(), 201, {
        root: "order",
        headers: { Location: `/orders/${order.public_id}` },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/orders", (req, res, next) => {
    try {
      const errs = validateListQuery(req.query);
      if (errs.length > 0) {
        const n = errs.length;
        throw new ProblemError(
          "validation-failed",
          `${n} field${n !== 1 ? "s" : ""} failed validation; see 'errors'.`,
          { errors: errs }
        );
      }
      const found = S.list(req.query.studentId || null, req.query.status || null);
      return respond(
        req,
        res,
        { items: found.map((o) => o.asJson()), count: found.length },
        200,
        { root: "orderList", childTags: ORDER_TAGS }
      );
    } catch (err) {
      next(err);
    }
  });

  app.get("/orders/:oid", (req, res, next) => {
    const o = S.get(req.params.oid);
    if (!o) {
      return next(
        new ProblemError("order-not-found", `No order with id ${req.params.oid}.`)
      );
    }
    return respond(req, res, o.asJson(), 200, { root: "order" });
  });

  app.post("/orders/:oid/cancellation", (req, res, next) => {
    try {
      const o = S.get(req.params.oid);
      if (!o) {
        throw new ProblemError("order-not-found", `No order with id ${req.params.oid}.`);
      }
      const body = req.body;
      const errs = validateCancellation(body);
      if (errs.length > 0) {
        const n = errs.length;
        throw new ProblemError(
          "validation-failed",
          `${n} field${n !== 1 ? "s" : ""} failed validation; see 'errors'.`,
          { errors: errs }
        );
      }
      if (o.status !== "paid") {
        throw new ProblemError(
          "illegal-transition",
          `Order ${req.params.oid} is ${o.status}; only a paid order can be cancelled (${o.status} -> cancelled is not allowed).`
        );
      }
      o.status = "cancelled";
      o.cancellation = {
        orderId: req.params.oid,
        reason: body.reason,
        cancelledAt: nowIso(),
      };
      return respond(req, res, o.cancellation, 201, {
        root: "cancellation",
        headers: { Location: `/orders/${req.params.oid}/cancellation` },
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/orders/:oid/cancellation", (req, res, next) => {
    const o = S.get(req.params.oid);
    if (!o) {
      return next(
        new ProblemError("order-not-found", `No order with id ${req.params.oid}.`)
      );
    }
    if (!o.cancellation) {
      return next(
        new ProblemError(
          "cancellation-not-found",
          `Order ${req.params.oid} has no cancellation.`
        )
      );
    }
    return respond(req, res, o.cancellation, 200, { root: "cancellation" });
  });

  // Catch-all 404
  app.use((req, res, next) => {
    return next(new ProblemError("not-found", "No such route."));
  });

  // Unified Error Handler
  app.use((err, req, res, next) => {
    if (err instanceof ProblemError) {
      return problem(req, res, err.slug, err.detail, err.headers, err.errors);
    }
    const ref = crypto.randomBytes(4).toString("hex");
    console.error(`unhandled error ref=${ref} ${req.method} ${req.path}`, err);
    return problem(
      req,
      res,
      "internal-error",
      `An unexpected error occurred. Quote reference ${ref} if you contact support.`
    );
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5001);
  createApp().listen(port, () => {
    console.log(`Orders service listening on port ${port}`);
  });
}

module.exports = {
  createApp,
};
