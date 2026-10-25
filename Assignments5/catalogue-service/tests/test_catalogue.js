const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const zlib = require("zlib");
const { createApp } = require("../app");
const { setPaymentsHealthChecker } = require("../payments_client");
const { AUTH, makeItemHelper, refOf } = require("./conftest");

describe("Assignment 5 - Catalogue Service Tests", () => {
  let app;
  let makeItem;

  beforeEach(() => {
    setPaymentsHealthChecker(null);
    app = createApp({ RATE_LIMIT: 1000 });
    makeItem = makeItemHelper(app);
  });

  afterEach(() => {
    setPaymentsHealthChecker(null);
  });

  // ------------------------------------------------------------------ A: methods
  test("create returns 201 with location and etag", async () => {
    const r = await makeItem();
    assert.strictEqual(r.status, 201);
    assert.ok(r.headers["content-type"].includes("application/json"));
    assert.ok(r.headers.location.endsWith("/menu-items/" + refOf(r)));
    assert.ok(r.headers.etag.startsWith('"'));
    const body = r.body;
    for (const hidden of ["id", "merchant_verified", "idempotency_keys", "price_cents"]) {
      assert.strictEqual(body[hidden], undefined);
    }
  });

  test("get never changes state", async () => {
    await makeItem();
    const first = await request(app).get("/menu-items?query=dosa");
    const second = await request(app).get("/menu-items?query=dosa");
    assert.deepStrictEqual(first.body, second.body);
    const countRes = await request(app).get("/menu-items");
    assert.strictEqual(countRes.headers["x-total-count"], "1");
  });

  test("list filters, sorts, paginates", async () => {
    const items = [
      ["Tea", 10, "beverages"],
      ["Samosa", 15, "snacks"],
      ["Thali", 120, "mains"],
      ["Coffee", 20, "beverages"],
    ];
    for (const [n, p, c] of items) {
      await makeItem(n, p, null, "rest-001", { category: c });
    }

    const r = await request(app).get("/menu-items?category=beverages&sort=price&order=desc");
    const names = r.body.map((i) => i.name);
    assert.deepStrictEqual(names, ["Coffee", "Tea"]);

    const page = await request(app).get("/menu-items?sort=name&limit=2&offset=0");
    assert.strictEqual(page.headers["x-total-count"], "4");
    assert.ok(page.headers.link.includes('rel="next"'));
    assert.strictEqual(page.body.length, 2);

    assert.strictEqual((await request(app).get("/menu-items?limit=0")).status, 400);
    assert.strictEqual((await request(app).get("/menu-items?sort=colour")).status, 400);
    assert.strictEqual((await request(app).get("/menu-items?category=pizza")).status, 400);
  });

  test("options returns allow header", async () => {
    const item = await makeItem();
    const ref = refOf(item);
    const r = await request(app).options(`/menu-items/${ref}`);
    assert.strictEqual(r.status, 204);
    const allow = new Set(r.headers.allow.split(",").map((s) => s.trim()));
    assert.ok(allow.has("GET") && allow.has("PUT") && allow.has("DELETE") && allow.has("OPTIONS"));
    assert.ok(!allow.has("POST"));
    assert.strictEqual((await request(app).options("/nowhere")).status, 404);
  });

  test("method override is a post only fallback", async () => {
    const item = await makeItem();
    const ref = refOf(item);
    await request(app)
      .patch(`/menu-items/${ref}/availability`)
      .set(AUTH)
      .send({ isAvailable: false });

    const r = await request(app)
      .post(`/menu-items/${ref}`)
      .set({ ...AUTH, "X-HTTP-Method-Override": "DELETE" });
    assert.strictEqual(r.status, 204);
    assert.strictEqual(r.headers["x-method-overridden"], "DELETE");

    // still protected: no token -> 401 even through the override
    const unauth = await request(app)
      .post(`/menu-items/${ref}`)
      .set({ "X-HTTP-Method-Override": "DELETE" });
    assert.strictEqual(unauth.status, 401);

    // only honoured on POST: a GET carrying the header stays a GET
    const getRes = await request(app)
      .get("/menu-items")
      .set({ "X-HTTP-Method-Override": "DELETE" });
    assert.strictEqual(getRes.status, 200);
  });

  test("close action is post to subresource", async () => {
    const item = await makeItem();
    const ref = refOf(item);

    const r = await request(app).post("/restaurants/rest-001/close").set(AUTH);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.itemsDisabled, 1);

    const getRes = await request(app).get(`/menu-items/${ref}`);
    assert.strictEqual(getRes.body.isAvailable, false);

    const newRes = await makeItem("Chai", 10);
    assert.strictEqual(newRes.status, 422);

    const reopen = await request(app).post("/restaurants/rest-001/reopen").set(AUTH);
    assert.strictEqual(reopen.body.isOpen, true);

    const badRoute = await request(app).post("/closeRestaurant").set(AUTH);
    assert.strictEqual(badRoute.status, 404);
  });

  test("wrong method gets 405 with allow", async () => {
    const r = await request(app).put("/menu-items").set(AUTH).send({});
    assert.strictEqual(r.status, 405);
    assert.ok(r.headers.allow.includes("GET"));
  });

  // ------------------------------------------------------------------ B: headers
  test("missing or empty bearer token is 401", async () => {
    const body = { name: "X", price: 1 };
    const r1 = await request(app).post("/restaurants/rest-001/menu-items").send(body);
    assert.strictEqual(r1.status, 401);
    assert.ok(r1.headers["www-authenticate"].includes("Bearer"));

    const r2 = await request(app)
      .post("/restaurants/rest-001/menu-items")
      .set({ Authorization: "Bearer " })
      .send(body);
    assert.strictEqual(r2.status, 401);

    const r3 = await request(app)
      .post("/restaurants/rest-001/menu-items")
      .set({ Authorization: "Basic abc" })
      .send(body);
    assert.strictEqual(r3.status, 401);

    const getRes = await request(app).get("/menu-items");
    assert.strictEqual(getRes.status, 200);
  });

  test("accept negotiation and 406", async () => {
    assert.strictEqual(
      (await request(app).get("/menu-items").set("Accept", "application/json")).status,
      200
    );
    assert.strictEqual((await request(app).get("/menu-items").set("Accept", "*/*")).status, 200);

    const r = await request(app).get("/menu-items").set("Accept", "text/html");
    assert.strictEqual(r.status, 406);
    assert.ok(r.headers["content-type"].includes("application/problem+json"));
  });

  test("request body must be json 415", async () => {
    const r = await request(app)
      .post("/restaurants/rest-001/menu-items")
      .set({ ...AUTH, "Content-Type": "text/plain" })
      .send("name=Tea");
    assert.strictEqual(r.status, 415);
  });

  test("gzip for large json", async () => {
    for (let i = 0; i < 12; i++) {
      await makeItem(`Dish number ${i}`, 10 + i, null, "rest-001", {
        description: "A reasonably long description ".repeat(3),
      });
    }

    const r = await request(app)
      .get("/menu-items")
      .set("Accept-Encoding", "gzip");

    assert.strictEqual(r.headers["content-encoding"], "gzip");
    assert.ok(r.headers.vary.includes("Accept-Encoding"));
    assert.strictEqual(r.body.length, 12);

    const plain = await request(app)
      .get("/menu-items")
      .set("Accept-Encoding", "identity");
    assert.strictEqual(plain.headers["content-encoding"], undefined);
  });

  test("400 404 and 422 are distinct", async () => {
    const bad = await request(app)
      .post("/restaurants/rest-001/menu-items")
      .set(AUTH)
      .send({ name: "Tea", price: -5 });
    assert.strictEqual(bad.status, 400);
    assert.ok(bad.headers["content-type"].includes("application/problem+json"));

    const junk = await request(app)
      .post("/restaurants/rest-001/menu-items")
      .set({ ...AUTH, "Content-Type": "application/json" })
      .send("{not json");
    assert.strictEqual(junk.status, 400);

    assert.strictEqual((await request(app).get("/menu-items/ITEM-doesnotexist")).status, 404);
    assert.strictEqual(
      (
        await request(app)
          .post("/restaurants/nope/menu-items")
          .set(AUTH)
          .send({ name: "a", price: 1 })
      ).status,
      404
    );

    setPaymentsHealthChecker(() => false);
    const unverified = await makeItem("Pizza", 200);
    assert.strictEqual(unverified.status, 201);
    assert.strictEqual(unverified.body.isAvailable, false);

    const patchRes = await request(app)
      .patch(`/menu-items/${refOf(unverified)}/availability`)
      .set(AUTH)
      .send({ isAvailable: true });
    assert.strictEqual(patchRes.status, 422);
  });

  test("delete 204 then 404 and 409 when available", async () => {
    const item = await makeItem();
    const ref = refOf(item);

    const delAvail = await request(app).delete(`/menu-items/${ref}`).set(AUTH);
    assert.strictEqual(delAvail.status, 409);

    await request(app)
      .patch(`/menu-items/${ref}/availability`)
      .set(AUTH)
      .send({ isAvailable: false });

    const delSuccess = await request(app).delete(`/menu-items/${ref}`).set(AUTH);
    assert.strictEqual(delSuccess.status, 204);

    const delAgain = await request(app).delete(`/menu-items/${ref}`).set(AUTH);
    assert.strictEqual(delAgain.status, 404);
  });

  test("cache control allowed on reads no-store on writes", async () => {
    const created = await makeItem();
    const ref = refOf(created);
    assert.strictEqual(created.headers["cache-control"], "no-store");

    const getRes = await request(app).get(`/menu-items/${ref}`);
    assert.ok(getRes.headers["cache-control"].includes("max-age"));

    const missing = await request(app).get("/menu-items/ITEM-missing");
    assert.strictEqual(missing.headers["cache-control"], "no-store");

    const badPost = await request(app).post("/restaurants/rest-001/menu-items").send({});
    assert.strictEqual(badPost.headers["cache-control"], "no-store");
  });

  test("rate limit is per client with retry after", async () => {
    const c = createApp({ RATE_LIMIT: 3 });
    const alice = { Authorization: "Bearer alice" };
    const bob = { Authorization: "Bearer bob" };

    const first = await request(c).get("/menu-items").set(alice);
    assert.strictEqual(first.headers["x-ratelimit-limit"], "3");
    assert.strictEqual(first.headers["x-ratelimit-remaining"], "2");

    for (let i = 0; i < 2; i++) {
      await request(c).get("/menu-items").set(alice);
    }

    const blocked = await request(c).get("/menu-items").set(alice);
    assert.strictEqual(blocked.status, 429);
    assert.ok(Number(blocked.headers["retry-after"]) >= 1);
    assert.strictEqual(blocked.headers["x-ratelimit-remaining"], "0");

    const bobRes = await request(c).get("/menu-items").set(bob);
    assert.strictEqual(bobRes.status, 200);
  });

  test("cors headers and preflight", async () => {
    const r = await request(app)
      .get("/menu-items")
      .set("Origin", "https://other.example");
    assert.strictEqual(r.headers["access-control-allow-origin"], "*");
    assert.ok(r.headers["access-control-expose-headers"].includes("ETag"));

    const pre = await request(app)
      .options("/menu-items/ITEM-x")
      .set({
        Origin: "https://other.example",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "authorization,if-match",
      });
    assert.strictEqual(pre.status, 204);
    assert.ok(pre.headers["access-control-allow-methods"].includes("PUT"));
    assert.ok(pre.headers["access-control-allow-headers"].includes("Authorization"));
    assert.ok(pre.headers["access-control-allow-headers"].includes("If-Match"));
  });

  test("security headers on every response", async () => {
    for (const res of [
      await request(app).get("/menu-items"),
      await request(app).get("/menu-items/ITEM-none"),
      await request(app).options("/menu-items"),
    ]) {
      assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
      assert.ok(res.headers["strict-transport-security"].includes("max-age"));
    }
  });

  test("nested url redirects 301 with location", async () => {
    const item = await makeItem();
    const ref = refOf(item);
    const r = await request(app).get(`/restaurants/rest-001/menu-items/${ref}`);
    assert.strictEqual(r.status, 301);
    assert.ok(r.headers.location.endsWith(`/menu-items/${ref}`));
    assert.strictEqual(
      (await request(app).get(`/restaurants/rest-002/menu-items/${ref}`)).status,
      404
    );
  });

  // ------------------------------------------------------------------ C: caching & retries
  test("idempotency key replays original without duplicate", async () => {
    const first = await makeItem("Masala Dosa", 80, "k-1");
    const again = await makeItem("Different Name", 999, "k-1");
    assert.strictEqual(again.status, 201);
    assert.deepStrictEqual(again.body, first.body);
    assert.strictEqual(again.headers.location, first.headers.location);
    assert.strictEqual(again.headers["idempotent-replayed"], "true");
    assert.strictEqual(first.headers["idempotent-replayed"], undefined);

    const countRes = await request(app).get("/menu-items");
    assert.strictEqual(countRes.headers["x-total-count"], "1");

    const other = await makeItem("Other", 5, "k-2");
    assert.notStrictEqual(other.body.itemId, first.body.itemId);

    const elsewhere = await makeItem("Elsewhere", 5, "k-1", "rest-002");
    assert.strictEqual(elsewhere.status, 201);
  });

  test("conditional get 304", async () => {
    const item = await makeItem();
    const ref = refOf(item);

    const ok = await request(app).get(`/menu-items/${ref}`);
    const etag = ok.headers.etag;
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.headers["cache-control"].includes("max-age"));

    const notModified = await request(app)
      .get(`/menu-items/${ref}`)
      .set("If-None-Match", etag);
    assert.strictEqual(notModified.status, 304);
    assert.strictEqual(notModified.headers.etag, etag);

    const weakMatch = await request(app)
      .get(`/menu-items/${ref}`)
      .set("If-None-Match", "W/" + etag);
    assert.strictEqual(weakMatch.status, 304);

    const stale = await request(app)
      .get(`/menu-items/${ref}`)
      .set("If-None-Match", '"stale"');
    assert.strictEqual(stale.status, 200);
  });

  test("etag changes when resource changes", async () => {
    const item = await makeItem();
    const ref = refOf(item);
    const before = (await request(app).get(`/menu-items/${ref}`)).headers.etag;

    await request(app)
      .put(`/menu-items/${ref}`)
      .set(AUTH)
      .send({ name: "Masala Dosa", price: 90 });

    const after = (await request(app).get(`/menu-items/${ref}`)).headers.etag;
    assert.notStrictEqual(after, before);

    const staleRes = await request(app)
      .get(`/menu-items/${ref}`)
      .set("If-None-Match", before);
    assert.strictEqual(staleRes.status, 200);
  });

  test("conditional put 412 and success", async () => {
    const item = await makeItem();
    const ref = refOf(item);
    const etag = (await request(app).get(`/menu-items/${ref}`)).headers.etag;

    const winner = await request(app)
      .put(`/menu-items/${ref}`)
      .set({ ...AUTH, "If-Match": etag })
      .send({ name: "Masala Dosa", price: 90 });
    assert.strictEqual(winner.status, 200);
    assert.strictEqual(winner.body.price, 90);

    const loser = await request(app)
      .put(`/menu-items/${ref}`)
      .set({ ...AUTH, "If-Match": etag })
      .send({ name: "Masala Dosa", price: 50 });
    assert.strictEqual(loser.status, 412);

    const finalGet = await request(app).get(`/menu-items/${ref}`);
    assert.strictEqual(finalGet.body.price, 90);
    assert.strictEqual(loser.headers.etag, winner.headers.etag);
  });

  test("stale if match blocks delete and patch", async () => {
    const item = await makeItem();
    const ref = refOf(item);

    await request(app)
      .patch(`/menu-items/${ref}/availability`)
      .set(AUTH)
      .send({ isAvailable: false });

    const stale = { "If-Match": '"stale"', ...AUTH };
    assert.strictEqual((await request(app).delete(`/menu-items/${ref}`).set(stale)).status, 412);
    assert.strictEqual(
      (
        await request(app)
          .patch(`/menu-items/${ref}/availability`)
          .set(stale)
          .send({ isAvailable: true })
      ).status,
      412
    );
    assert.strictEqual((await request(app).get(`/menu-items/${ref}`)).status, 200);
  });

  test("put and patch repeat are idempotent", async () => {
    const item = await makeItem();
    const ref = refOf(item);
    const body = { name: "Masala Dosa", price: 95, category: "mains" };

    const a = await request(app).put(`/menu-items/${ref}`).set(AUTH).send(body);
    const b = await request(app).put(`/menu-items/${ref}`).set(AUTH).send(body);
    assert.strictEqual(a.headers.etag, b.headers.etag);
    assert.deepStrictEqual(a.body, b.body);

    const p1 = await request(app)
      .patch(`/menu-items/${ref}/availability`)
      .set(AUTH)
      .send({ isAvailable: false });
    const p2 = await request(app)
      .patch(`/menu-items/${ref}/availability`)
      .set(AUTH)
      .send({ isAvailable: false });
    assert.strictEqual(p1.status, 200);
    assert.strictEqual(p2.status, 200);
    assert.strictEqual(p1.headers.etag, p2.headers.etag);

    const badPut = await request(app)
      .put(`/menu-items/${ref}`)
      .set(AUTH)
      .send({ name: "x", price: 1, isAvailable: true });
    assert.strictEqual(badPut.status, 400);
  });
});
