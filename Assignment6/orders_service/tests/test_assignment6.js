const { test, describe } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { XMLParser } = require("fast-xml-parser");
const { createApp } = require("../app");
const { StaticAvailability } = require("../availability");
const { BASE } = require("../errors");
const { RateLimiter } = require("../ratelimit");
const { FakePayments, ORDER } = require("./conftest");

const PROBLEM = "application/problem+json; charset=utf-8";
const xmlParser = new XMLParser({ removeNSPrefix: true });

function make(kw = {}) {
  const payments = kw.payments || new FakePayments();
  return createApp({ ...kw, payments });
}

function orderWith(changes = {}) {
  return { ...ORDER, ...changes };
}

describe("Assignment 6 - Hardened Orders Service Tests", () => {
  // ---------------------------------------------------------------- Part A ----
  test("a3 create is 201 with location pointing at the order", async () => {
    const app = make();
    const r = await request(app).post("/orders").send(ORDER);
    assert.strictEqual(r.status, 201);
    const loc = r.headers.location;
    assert.strictEqual(loc, `/orders/${r.body.id}`);
    const getRes = await request(app).get(loc);
    assert.strictEqual(getRes.status, 200);
  });

  test("a1 unknown id is 404 not 200", async () => {
    const r = await request(make()).get("/orders/ORD-9999");
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.type, BASE + "order-not-found");
    assert.strictEqual(r.body.ok, undefined);
  });

  test("a1 patch and delete are 405 with allow", async () => {
    const app = make();
    const created = await request(app).post("/orders").send(ORDER);
    const oid = created.body.id;

    for (const method of ["patch", "delete"]) {
      for (const url of ["/orders", `/orders/${oid}`]) {
        const r = await request(app)[method](url);
        assert.strictEqual(r.status, 405);
        assert.strictEqual(r.headers["content-type"], PROBLEM);
        assert.ok(r.headers.allow);
      }
    }
    const delRes = await request(app).delete("/orders");
    assert.ok(!delRes.headers.allow.includes("DELETE"));
  });

  test("a1 illegal transition is 409", async () => {
    const app = make();
    const created = await request(app).post("/orders").send(ORDER);
    const oid = created.body.id;

    const first = await request(app)
      .post(`/orders/${oid}/cancellation`)
      .send({ reason: "x" });
    assert.strictEqual(first.status, 201);

    const second = await request(app)
      .post(`/orders/${oid}/cancellation`)
      .send({ reason: "x" });
    assert.strictEqual(second.status, 409);
    assert.strictEqual(second.body.type, BASE + "illegal-transition");
  });

  test("a4 rate limit is 429 with retry after", async () => {
    const clock = [0.0];
    const limiter = new RateLimiter(2, 60, () => clock[0]);
    const app = make({ limiter });

    assert.strictEqual((await request(app).get("/orders")).status, 200);
    assert.strictEqual((await request(app).get("/orders")).status, 200);

    const r = await request(app).get("/orders");
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.headers["content-type"], PROBLEM);
    assert.strictEqual(Number(r.headers["retry-after"]), 60);
    assert.strictEqual(r.body.type, BASE + "rate-limited");

    clock[0] = 61; // window over -> allowed again
    assert.strictEqual((await request(app).get("/orders")).status, 200);
  });

  test("a4 503 has retry after and stores nothing", async () => {
    const DownSession = {
      async post() {
        const err = new Error("Connection refused 10.1.2.3:5002");
        err.name = "ConnectionError";
        throw err;
      },
    };
    const { PaymentsClient } = require("../payments_client");
    const pay = new PaymentsClient({
      baseUrl: "http://p",
      attempts: 2,
      sleep: () => {},
      session: DownSession,
    });
    const app = make({ payments: pay });

    const r = await request(app).post("/orders").send(ORDER);
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.headers["retry-after"], "5");
    assert.ok(!r.text.includes("10.1.2.3"));

    const listRes = await request(app).get("/orders");
    assert.strictEqual(listRes.body.count, 0);
  });

  // ---------------------------------------------------------------- Part B ----
  test("b1 every failure has one shape and content type", async () => {
    const app = make();
    const failures = [
      await request(app).get("/orders/ORD-9999"),
      await request(app).get("/nope"),
      await request(app).delete("/orders"),
      await request(app).post("/orders").send(orderWith({ items: [] })),
      await request(app)
        .post("/orders")
        .set("Content-Type", "application/json")
        .send("{"),
      await request(app)
        .post("/orders")
        .set("Content-Type", "text/plain")
        .send("x"),
      await request(app).get("/orders").set("Accept", "text/html"),
      await request(app).get("/orders?status=bogus"),
    ];

    for (const r of failures) {
      assert.ok(r.status >= 400);
      assert.strictEqual(r.headers["content-type"], PROBLEM);
      const body = r.body;
      assert.ok(
        ["type", "title", "status", "detail"].every((k) => k in body)
      );
      assert.strictEqual(body.status, r.status);
      assert.ok(body.type.startsWith(BASE));
    }
  });

  test("b2 empty cart type", async () => {
    const r = await request(make())
      .post("/orders")
      .send(orderWith({ items: [] }));
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.body.type, BASE + "empty-cart");
    assert.strictEqual(r.body.errors[0].field, "items");
  });

  test("b2 item unavailable type and no charge", async () => {
    const pay = new FakePayments();
    const app = make({
      payments: pay,
      availability: new StaticAvailability(["ITM-1"]),
    });
    const r = await request(app).post("/orders").send(ORDER);
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.body.type, BASE + "item-unavailable");
    assert.strictEqual(pay.calls, 0);
  });

  test("b2 payment declined type", async () => {
    const r = await request(make())
      .post("/orders")
      .send(orderWith({ cardToken: "tok_declined" }));
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.body.type, BASE + "payment-declined");
  });

  test("b3 two bad fields reported at once", async () => {
    const bad = orderWith({
      address: "",
      items: [
        { itemId: "ITM-1", name: "Dosa", quantity: 0, unitPrice: "60.00" },
      ],
    });
    const r = await request(make()).post("/orders").send(bad);
    assert.strictEqual(r.status, 422);
    const fields = new Set(r.body.errors.map((e) => e.field));
    assert.ok(fields.has("address"));
    assert.ok(fields.has("items[0].quantity"));
    assert.ok(r.body.errors.every((e) => e.message));
  });

  test("b4 unexpected exception is hidden but logged", async () => {
    const Boom = {
      async charge() {
        throw new Error(
          "psycopg2.OperationalError: password for user campus_admin"
        );
      },
    };
    const app = make({ payments: Boom });

    const origError = console.error;
    let logged = "";
    console.error = (...args) => {
      logged += args.join(" ") + "\n";
    };

    try {
      const r = await request(app).post("/orders").send(ORDER);
      assert.strictEqual(r.status, 500);
      assert.strictEqual(r.headers["content-type"], PROBLEM);
      assert.ok(!r.text.includes("psycopg2"));
      assert.ok(!r.text.includes("campus_admin"));
      assert.ok(logged.includes("campus_admin"));
      const ref = r.body.detail.split("reference ")[1].split(" ")[0];
      assert.ok(logged.includes(ref));
    } finally {
      console.error = origError;
    }
  });

  // ---------------------------------------------------------------- Part C ----
  test("c2 validate before acting", async () => {
    const pay = new FakePayments();
    const app = make({ payments: pay });
    const r = await request(app)
      .post("/orders")
      .send(
        orderWith({
          items: [
            { itemId: "", name: "Dosa", quantity: -1, unitPrice: "abc" },
          ],
        })
      );
    assert.strictEqual(r.status, 422);
    assert.strictEqual(pay.calls, 0);

    const listRes = await request(app).get("/orders");
    assert.strictEqual(listRes.body.count, 0);

    const fields = r.body.errors.map((e) => e.field);
    assert.deepStrictEqual(fields, [
      "items[0].itemId",
      "items[0].quantity",
      "items[0].unitPrice",
    ]);
  });

  test("c1 quantity must be integer ge 1", async () => {
    for (const qty of [0, -3, 1.5, "2", true, null, 21]) {
      const item = {
        itemId: "ITM-1",
        name: "Dosa",
        unitPrice: "60.00",
        quantity: qty,
      };
      const r = await request(make())
        .post("/orders")
        .send(orderWith({ items: [item] }));
      assert.strictEqual(r.status, 422);
      assert.strictEqual(r.body.errors[0].field, "items[0].quantity");
    }
  });

  test("c1 address is required", async () => {
    const body = { ...ORDER };
    delete body.address;
    const r = await request(make()).post("/orders").send(body);
    assert.strictEqual(r.status, 422);
    assert.deepStrictEqual(r.body.errors, [
      { field: "address", message: "is required" },
    ]);
  });

  test("c1 price must be finite positive string", async () => {
    for (const price of ["NaN", "Infinity", "-1", "0", 60]) {
      const item = {
        itemId: "ITM-1",
        name: "Dosa",
        quantity: 1,
        unitPrice: price,
      };
      const r = await request(make())
        .post("/orders")
        .send(orderWith({ items: [item] }));
      assert.strictEqual(r.status, 422);
    }
  });

  test("c3 default is json", async () => {
    const app = make();
    await request(app).post("/orders").send(ORDER);
    for (const accept of [null, "*/*", "application/json"]) {
      const req = request(app).get("/orders/ORD-0001");
      if (accept) {
        req.set("Accept", accept);
      }
      const r = await req;
      assert.strictEqual(r.headers["content-type"], "application/json; charset=utf-8");
    }
  });

  test("c3 xml when asked and well formed", async () => {
    const app = make();
    await request(app)
      .post("/orders")
      .send(orderWith({ address: "A & B <Hostel>" }));

    const r = await request(app)
      .get("/orders/ORD-0001")
      .set("Accept", "application/xml");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers["content-type"], "application/xml; charset=utf-8");

    const parsed = xmlParser.parse(r.text);
    assert.ok(parsed.order);
    assert.strictEqual(parsed.order.id, "ORD-0001");
    assert.strictEqual(parsed.order.address, "A & B <Hostel>");
    assert.ok(!r.text.includes("cardToken"));
  });

  test("c3 list in xml", async () => {
    const app = make();
    await request(app).post("/orders").send(ORDER);
    const r = await request(app)
      .get("/orders")
      .set("Accept", "application/xml");
    const parsed = xmlParser.parse(r.text);
    assert.ok(parsed.orderList);
    assert.strictEqual(String(parsed.orderList.count), "1");
    assert.ok(parsed.orderList.items.order);
  });

  test("c3 q values and 406", async () => {
    const app = make();
    await request(app).post("/orders").send(ORDER);

    const preferXml = {
      Accept: "application/xml;q=0.9, application/json;q=0.5",
    };
    const rXml = await request(app).get("/orders").set(preferXml);
    assert.ok(rXml.headers["content-type"].startsWith("application/xml"));

    const rHtml = await request(app)
      .get("/orders/ORD-0001")
      .set("Accept", "text/html");
    assert.strictEqual(rHtml.status, 406);
    assert.strictEqual(rHtml.headers["content-type"], PROBLEM);
    assert.strictEqual(rHtml.body.type, BASE + "not-acceptable");
  });

  test("c3 errors can be xml too", async () => {
    const r = await request(make())
      .get("/orders/ORD-9999")
      .set("Accept", "application/xml");
    assert.strictEqual(r.status, 404);
    assert.strictEqual(
      r.headers["content-type"],
      "application/problem+xml; charset=utf-8"
    );
    const parsed = xmlParser.parse(r.text);
    assert.ok(parsed.problem);
    assert.strictEqual(String(parsed.problem.status), "404");
  });

  test("c3 xml 422 lists errors", async () => {
    const r = await request(make())
      .post("/orders")
      .set("Accept", "application/xml")
      .send(orderWith({ address: "" }));
    assert.strictEqual(r.status, 422);
    const parsed = xmlParser.parse(r.text);
    assert.ok(parsed.problem);
    assert.strictEqual(parsed.problem.errors.error.field, "address");
  });

  test("c4 every response has charset", async () => {
    const app = make();
    await request(app).post("/orders").send(ORDER);
    const responses = [
      await request(app).get("/orders"),
      await request(app).get("/orders/ORD-0001"),
      await request(app).get("/orders/ORD-9999"),
      await request(app).post("/orders").send(orderWith({ items: [] })),
      await request(app).get("/x"),
      await request(app).options("/orders"),
      await request(app).get("/orders").set("Accept", "application/xml"),
      await request(app).post("/orders").send(ORDER),
      await request(app).get("/orders").set("Accept", "text/html"),
    ];

    for (const r of responses) {
      if (r.text) {
        assert.ok(
          r.headers["content-type"].toLowerCase().includes("charset=utf-8")
        );
      }
    }
    assert.ok(
      responses.every((r) => (r.headers.vary || "").includes("Accept"))
    );
  });

  // ------------------------------------------------------- D4: regressions ----
  test("d4 idempotency still holds and replay is not rate or validation blocked", async () => {
    const pay = new FakePayments();
    const app = make({ payments: pay });
    const h = { "Idempotency-Key": "k-6" };

    const first = await request(app).post("/orders").set(h).send(ORDER);
    const again = await request(app).post("/orders").set(h).send(ORDER);
    assert.strictEqual(again.status, 201);
    assert.deepStrictEqual(again.body, first.body);
    assert.strictEqual(again.headers["idempotent-replay"], "true");
    assert.strictEqual(pay.calls, 1);

    const clash = await request(app)
      .post("/orders")
      .set(h)
      .send(orderWith({ studentId: "S-2" }));
    assert.strictEqual(clash.status, 422);
    assert.strictEqual(clash.body.type, BASE + "idempotency-key-reused");
  });

  test("d4 cancellation body is validated with field errors", async () => {
    const app = make();
    const created = await request(app).post("/orders").send(ORDER);
    const oid = created.body.id;

    const r = await request(app)
      .post(`/orders/${oid}/cancellation`)
      .send({ reason: "" });
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.body.errors[0].field, "reason");
  });
});
