"""Tiny stand-in for the Tutorial 4 Payments service, for demo only.
Token tok_declined -> 422. Env switches (demo only):
  STUB_FAIL=503     always answer with that status (outage)
  STUB_SLEEP=10     hang for 10 s before answering (read-timeout demo)
  STUB_GARBAGE=1    answer 201 with a non-JSON body that mentions internals (500 demo)"""
import os
import time
import uuid
from flask import Flask, request, jsonify

app = Flask(__name__)
seen = {}


@app.post("/payments")
def pay():
    if os.environ.get("STUB_SLEEP"):
        time.sleep(float(os.environ["STUB_SLEEP"]))
    if os.environ.get("STUB_GARBAGE"):
        return "<html>Traceback: psycopg2.OperationalError password for campus_admin</html>", 201
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
