const { test, describe } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { createApp } = require("../app");
const { PaymentsClient } = require("../payments_client");
const { FakePayments, ORDER } = require("./conftest");

class Resp {
  constructor(code, body = null) {
    this.status_code = code;
    this._b = body || {};
  }
  json() {
    return this._b;
  }
}

class Seq {
  constructor(items) {
    this.items = [...items];
    this.calls = 0;
    this.headers = [];
  }
  async post(url, payload, headers, timeout) {
    this.calls += 1;
    this.headers.push(headers);
    const x = this.items.shift();
    if (x instanceof Error) {
      throw x;
    }
    return x;
  }
}

function client(items, attempts = 4) {
  const s = new Seq(items);
  const c = new PaymentsClient({
    baseUrl: "http://p",
    attempts,
    sleep: () => {},
    session: s,
  });
  return [c, s];
}

describe("Assignment 4 - test_resilience", () => {
  test("retries transient failures with same key", async () => {
    const timeoutErr = new Error("Timeout");
    timeoutErr.name = "Timeout";
    const [c, s] = client([timeoutErr, new Resp(503), new Resp(201, { id: "p1" })]);
    const res = await c.charge("O", 1, "INR", "tok_x", "K");
    assert.strictEqual(res.id, "p1");
    assert.strictEqual(s.calls, 3);
    assert.ok(s.headers.every((h) => h["Idempotency-Key"] === "K"));
  });

  test("4xx is never retried", async () => {
    const [c, s] = client([new Resp(400), new Resp(201, { id: "p1" })]);
    try {
      await c.charge("O", 1, "INR", "tok_x", "K");
    } catch {}
    assert.strictEqual(s.calls, 1);
  });

  test("dependency down gives 503 and stores nothing", async () => {
    const connErr = new Error("ConnectionError");
    connErr.name = "ConnectionError";
    const [c] = client([connErr, connErr, connErr, connErr]);
    const app = createApp({ payments: c });
    const r = await request(app).post("/orders").send(ORDER);

    assert.strictEqual(r.status, 503);
    assert.ok(r.headers["retry-after"]);
    const listRes = await request(app).get("/orders");
    assert.strictEqual(listRes.body.count, 0);
  });

  test("cancel twice is 409 and decline is 422", async () => {
    const app = createApp({ payments: new FakePayments() });
    const createRes = await request(app).post("/orders").send(ORDER);
    const oid = createRes.body.id;

    const firstCancel = await request(app)
      .post(`/orders/${oid}/cancellation`)
      .send({ reason: "x" });
    assert.strictEqual(firstCancel.status, 201);

    const secondCancel = await request(app)
      .post(`/orders/${oid}/cancellation`)
      .send({ reason: "x" });
    assert.strictEqual(secondCancel.status, 409);

    const bad = { ...ORDER, cardToken: "tok_declined" };
    const declineRes = await request(app).post("/orders").send(bad);
    assert.strictEqual(declineRes.status, 422);
  });
});
