const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { createApp } = require("../app");
const { FakePayments, ORDER } = require("./conftest");

describe("Assignment 4 - test_orders", () => {
  let app;
  let pay;

  beforeEach(() => {
    pay = new FakePayments();
    app = createApp({ payments: pay });
  });

  test("create returns 201 and location", async () => {
    const r = await request(app)
      .post("/orders")
      .set("Idempotency-Key", "k1")
      .send(ORDER);

    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.headers.location, `/orders/${r.body.id}`);
    assert.strictEqual(r.body.cardToken, undefined);
    assert.strictEqual(r.body.total, "120.00");
  });

  test("idempotent repeat returns original without recharging", async () => {
    const h = { "Idempotency-Key": "k2" };
    const first = await request(app).post("/orders").set(h).send(ORDER);
    const again = await request(app).post("/orders").set(h).send(ORDER);

    assert.strictEqual(again.status, 201);
    assert.deepStrictEqual(again.body, first.body);
    assert.strictEqual(pay.calls, 1);
  });

  test("malformed body returns 400 problem", async () => {
    const r = await request(app)
      .post("/orders")
      .send({ studentId: "S-1", items: [] });

    assert.strictEqual(r.status, 400);
    const keys = Object.keys(r.body).sort();
    assert.deepStrictEqual(keys, ["detail", "status", "title", "type"]);
    assert.strictEqual(r.headers["content-type"], "application/problem+json; charset=utf-8");
  });

  test("unknown id returns 404", async () => {
    const r = await request(app).get("/orders/ORD-9999");
    assert.strictEqual(r.status, 404);
  });
});
