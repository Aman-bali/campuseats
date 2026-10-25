function nowIso() {
  const d = new Date();
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

class Order {
  constructor({
    seq,
    student_id,
    items,
    total,
    currency,
    card_token,
    idempotency_key = null,
    request_fingerprint,
    payment_txn_id,
    status = "paid",
    created_at = null,
    cancellation = null,
  }) {
    this.seq = seq;
    this.student_id = student_id;
    this.items = items;
    this.total = Number(total);
    this.currency = currency;
    this.card_token = card_token;
    this.idempotency_key = idempotency_key;
    this.request_fingerprint = request_fingerprint;
    this.payment_txn_id = payment_txn_id;
    this.status = status;
    this.created_at = created_at || nowIso();
    this.cancellation = cancellation;
  }

  get public_id() {
    return `ORD-${String(this.seq).padStart(4, "0")}`;
  }

  asJson() {
    const d = {
      id: this.public_id,
      studentId: this.student_id,
      items: this.items,
      total: Number(this.total).toFixed(2),
      currency: this.currency,
      status: this.status,
      createdAt: this.created_at,
      links: {
        self: `/orders/${this.public_id}`,
      },
    };
    if (this.cancellation) {
      d.links.cancellation = `/orders/${this.public_id}/cancellation`;
    }
    return d;
  }
}

module.exports = {
  nowIso,
  Order,
};
