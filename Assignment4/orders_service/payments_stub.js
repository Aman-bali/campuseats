const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const seen = new Map();

app.post("/payments", (req, res) => {
  if (process.env.STUB_FAIL) {
    return res.status(Number(process.env.STUB_FAIL)).json({ detail: "down" });
  }
  const key = req.headers["idempotency-key"];
  if (key && seen.has(key)) {
    return res.status(201).json(seen.get(key));
  }
  const body = req.body || {};
  if (body.cardToken === "tok_declined") {
    return res.status(422).json({
      type: "payment-declined",
      title: "Declined",
      status: 422,
      detail: "Issuing bank declined the transaction (insufficient funds)",
    });
  }
  const rec = {
    id: `pay_${crypto.randomBytes(4).toString("hex")}`,
    status: "captured",
  };
  if (key) {
    seen.set(key, rec);
  }
  console.log(`CHARGE ${body.orderRef} ${body.amount} key=${key}`);
  return res.status(201).json(rec);
});

if (require.main === module) {
  const port = Number(process.env.PORT || 5002);
  app.listen(port, () => {
    console.log(`Payments stub listening on port ${port}`);
  });
}

module.exports = app;
