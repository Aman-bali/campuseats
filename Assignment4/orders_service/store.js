class OrderStore {
  constructor() {
    this._orders = new Map(); // public_id -> Order
    this._byKey = new Map();  // idempotency_key -> public_id
    this._seq = 0;
  }

  nextSeq() {
    this._seq += 1;
    return this._seq;
  }

  add(order) {
    this._orders.set(order.public_id, order);
    if (order.idempotency_key) {
      this._byKey.set(order.idempotency_key, order.public_id);
    }
  }

  get(publicId) {
    return this._orders.get(publicId) || null;
  }

  byKey(key) {
    const pid = this._byKey.get(key);
    return pid ? this.get(pid) : null;
  }

  list(studentId = null, status = null) {
    let out = Array.from(this._orders.values());
    if (studentId) {
      out = out.filter((o) => o.student_id === studentId);
    }
    if (status) {
      out = out.filter((o) => o.status === status);
    }
    return out;
  }
}

module.exports = {
  OrderStore,
};
