"""Tiny stand-in for the Tutorial 4 Payments service, for demo only.
Token tok_declined -> 422; header X-Fail-Mode via env STUB_FAIL=503 -> always 503."""
import os
import uuid
from flask import Flask, request, jsonify

app = Flask(__name__)
seen = {}


@app.post("/payments")
def pay():
    if os.environ.get("STUB_FAIL"):
        return jsonify({"detail": "down"}), int(os.environ["STUB_FAIL"])
    key = request.headers.get("Idempotency-Key")
    if key in seen:
        return jsonify(seen[key]), 201
    body = request.get_json()
    if body["cardToken"] == "tok_declined":
        return jsonify({"type": "payment-declined", "title": "Declined", "status": 422,
                        "detail": "Issuing bank declined the transaction (insufficient funds)"}), 422
    rec = {"id": "pay_" + uuid.uuid4().hex[:8], "status": "captured"}
    seen[key] = rec
    print(f"CHARGE {body['orderRef']} {body['amount']} key={key}", flush=True)
    return jsonify(rec), 201


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 5002)))
