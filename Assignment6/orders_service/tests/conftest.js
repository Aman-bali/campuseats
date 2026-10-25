const { PaymentDeclined } = require("../payments_client");

class FakePayments {
  constructor() {
    this.calls = 0;
  }

  async charge(order_ref, amount, currency, card_token, idempotency_key) {
    this.calls += 1;
    if (card_token === "tok_declined") {
      throw new PaymentDeclined("Issuing bank declined the transaction");
    }
    return { id: `pay_${this.calls}`, status: "captured" };
  }
}

const ORDER = {
  studentId: "S-1",
  cardToken: "tok_4242",
  address: "Hostel B, Room 214",
  items: [{ itemId: "ITM-1", name: "Dosa", quantity: 2, unitPrice: "60.00" }],
};

module.exports = {
  FakePayments,
  ORDER,
};
