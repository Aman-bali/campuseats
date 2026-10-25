const express = require("express");
const crypto = require("crypto");
const { problem } = require("./errors");
const { Order, nowIso } = require("./models");
const { PaymentsClient, PaymentDeclined, PaymentsUnavailable } = require("./payments_client");
const { OrderStore } = require("./store");

const STATUSES = new Set(["paid", "cancelled"]);

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

function isValidDecimalString(val) {
  if (typeof val !== "string" || !val.trim()) return false;
  const num = Number(val);
  return !Number.isNaN(num) && Number.isFinite(num) && num > 0;
}

function validate(body) {
  const errs = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ["body must be a JSON object"];
  }
  const sid = body.studentId;
  if (typeof sid !== "string" || !sid.trim()) {
    errs.push("studentId must be a non-empty string");
  }
  const tok = body.cardToken;
  if (typeof tok !== "string" || !tok.startsWith("tok_")) {
    errs.push("cardToken must be a string starting with 'tok_'");
  }
  const cur = body.currency !== undefined ? body.currency : "INR";
  if (typeof cur !== "string" || cur.length !== 3) {
    errs.push("currency must be a 3-letter code");
  }
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    errs.push("items must be a non-empty array");
  } else {
    items.forEach((it, i) => {
      if (!it || typeof it !== "object" || Array.isArray(it)) {
        errs.push(`items[${i}] must be an object`);
        return;
      }
      for (const f of ["itemId", "name"]) {
        if (typeof it[f] !== "string" || !it[f].trim()) {
          errs.push(`items[${i}].${f} must be a non-empty string`);
        }
      }
      const q = it.quantity;
      if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 20) {
        errs.push(`items[${i}].quantity must be an integer 1..20`);
      }
      const p = it.unitPrice;
      if (!isValidDecimalString(p)) {
        errs.push(`items[${i}].unitPrice must be a positive decimal string`);
      }
    });
  }
  return errs;
}

function validateCancellation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ["body must be a JSON object"];
  }
  const r = body.reason;
  if (typeof r !== "string" || !r.trim() || r.length > 200) {
    return ["reason must be a non-empty string of at most 200 characters"];
  }
  return [];
}

function createApp({ payments = null, store = null } = {}) {
  const app = express();
  const S = store || new OrderStore();
  const P = payments || new PaymentsClient();

  app.use(express.json());

  // Handle JSON parse errors
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && "body" in err) {
      return problem(res, 400, "invalid-request", "Invalid request body", "Malformed JSON body");
    }
    next(err);
  });

  app.post("/orders", async (req, res) => {
    const body = req.body;
    const errs = validate(body);
    if (errs.length > 0) {
      return problem(res, 400, "invalid-request", "Invalid request body", errs.join("; "));
    }

    const key = req.headers["idempotency-key"] || null;
    const fp = fingerprint(body);

    if (key) {
      const prior = S.byKey(key);
      if (prior) {
        if (prior.request_fingerprint !== fp) {
          return problem(
            res,
            422,
            "idempotency-key-reused",
            "Idempotency key reused",
            "This Idempotency-Key was already used with a different request body."
          );
        }
        res.setHeader("Location", `/orders/${prior.public_id}`);
        res.setHeader("Idempotent-Replay", "true");
        return res.status(201).json(prior.asJson());
      }
    }

    const total = body.items.reduce(
      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
      0
    );
    const currency = body.currency || "INR";
    const seq = S.nextSeq();
    const orderRef = `ORD-${String(seq).padStart(4, "0")}`;
    const payKey = key || `order-${crypto.randomUUID()}`;

    let txn;
    try {
      txn = await P.charge(orderRef, total, currency, body.cardToken, payKey);
    } catch (e) {
      if (e instanceof PaymentDeclined || e.name === "PaymentDeclined") {
        return problem(res, 422, "payment-declined", "Payment declined", e.detail);
      }
      if (e instanceof PaymentsUnavailable || e.name === "PaymentsUnavailable") {
        return problem(
          res,
          503,
          "payments-unavailable",
          "Payments unavailable",
          `The order was not placed and you were not charged. ${e.message}`,
          { "Retry-After": "5" }
        );
      }
      return problem(res, 500, "internal-error", "Internal error", "Unexpected server error.");
    }

    const order = new Order({
      seq,
      student_id: body.studentId,
      items: body.items,
      total,
      currency,
      card_token: body.cardToken,
      idempotency_key: key,
      request_fingerprint: fp,
      payment_txn_id: String((txn && txn.id) || ""),
    });
    S.add(order);

    res.setHeader("Location", `/orders/${order.public_id}`);
    return res.status(201).json(order.asJson());
  });

  app.get("/orders", (req, res) => {
    const status = req.query.status;
    if (status && !STATUSES.has(status)) {
      const allowed = Array.from(STATUSES).sort();
      return problem(
        res,
        400,
        "invalid-parameter",
        "Invalid query parameter",
        `status must be one of [${allowed.map((s) => `'${s}'`).join(", ")}]`
      );
    }
    const found = S.list(req.query.studentId || null, status || null);
    return res.json({ items: found.map((o) => o.asJson()), count: found.length });
  });

  app.get("/orders/:oid", (req, res) => {
    const o = S.get(req.params.oid);
    if (!o) {
      return problem(res, 404, "order-not-found", "Order not found", `No order with id ${req.params.oid}.`);
    }
    return res.json(o.asJson());
  });

  app.post("/orders/:oid/cancellation", (req, res) => {
    const o = S.get(req.params.oid);
    if (!o) {
      return problem(res, 404, "order-not-found", "Order not found", `No order with id ${req.params.oid}.`);
    }
    const body = req.body;
    const errs = validateCancellation(body);
    if (errs.length > 0) {
      return problem(res, 400, "invalid-request", "Invalid request body", errs.join("; "));
    }
    if (o.status !== "paid") {
      return problem(
        res,
        409,
        "order-not-cancellable",
        "Order cannot be cancelled",
        `Order ${req.params.oid} is already ${o.status}.`
      );
    }
    o.status = "cancelled";
    o.cancellation = {
      orderId: req.params.oid,
      reason: body.reason,
      cancelledAt: nowIso(),
    };
    res.setHeader("Location", `/orders/${req.params.oid}/cancellation`);
    return res.status(201).json(o.cancellation);
  });

  app.get("/orders/:oid/cancellation", (req, res) => {
    const o = S.get(req.params.oid);
    if (!o || !o.cancellation) {
      return problem(
        res,
        404,
        "cancellation-not-found",
        "Cancellation not found",
        `Order ${req.params.oid} has no cancellation.`
      );
    }
    return res.json(o.cancellation);
  });

  // Catch-all 404
  app.use((req, res) => {
    return problem(res, 404, "not-found", "Not found", "No such route.");
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err);
    return problem(res, 500, "internal-error", "Internal error", "Unexpected server error.");
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
