"""CampusEats Orders service (REST)."""
import hashlib
import json
import uuid
from decimal import Decimal, InvalidOperation

from flask import Flask, request, jsonify

from errors import problem
from models import Order, now_iso
from payments_client import PaymentsClient, PaymentDeclined, PaymentsUnavailable
from store import OrderStore

STATUSES = {"paid", "cancelled"}


def validate(body):
    """Hand-written replacement for the XML Schema of Assignment 3.
    Returns a list of error strings; empty list means valid."""
    errs = []
    if not isinstance(body, dict):
        return ["body must be a JSON object"]
    sid = body.get("studentId")
    if not isinstance(sid, str) or not sid.strip():
        errs.append("studentId must be a non-empty string")
    tok = body.get("cardToken")
    if not isinstance(tok, str) or not tok.startswith("tok_"):
        errs.append("cardToken must be a string starting with 'tok_'")
    cur = body.get("currency", "INR")
    if not isinstance(cur, str) or len(cur) != 3:
        errs.append("currency must be a 3-letter code")
    items = body.get("items")
    if not isinstance(items, list) or not items:
        errs.append("items must be a non-empty array")
    else:
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                errs.append(f"items[{i}] must be an object")
                continue
            for f in ("itemId", "name"):
                if not isinstance(it.get(f), str) or not it[f].strip():
                    errs.append(f"items[{i}].{f} must be a non-empty string")
            q = it.get("quantity")
            if isinstance(q, bool) or not isinstance(q, int) or not 1 <= q <= 20:
                errs.append(f"items[{i}].quantity must be an integer 1..20")
            p = it.get("unitPrice")
            try:
                if not isinstance(p, str) or Decimal(p) <= 0:
                    raise InvalidOperation
            except InvalidOperation:
                errs.append(f"items[{i}].unitPrice must be a positive decimal string")
    return errs


def validate_cancellation(body):
    if not isinstance(body, dict):
        return ["body must be a JSON object"]
    r = body.get("reason")
    if not isinstance(r, str) or not r.strip() or len(r) > 200:
        return ["reason must be a non-empty string of at most 200 characters"]
    return []


def fingerprint(body):
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def create_app(payments=None, store=None):
    app = Flask(__name__)
    app.config["store"] = store or OrderStore()
    app.config["payments"] = payments or PaymentsClient()
    S = app.config["store"]

    def body_or_none():
        return request.get_json(silent=True)

    @app.post("/orders")
    def create_order():
        body = body_or_none()
        errs = validate(body)
        if errs:
            return problem(400, "invalid-request", "Invalid request body", "; ".join(errs))
        key = request.headers.get("Idempotency-Key")
        fp = fingerprint(body)
        with S.lock:
            if key:
                prior = S.by_key(key)
                if prior:
                    if prior.request_fingerprint != fp:
                        return problem(422, "idempotency-key-reused", "Idempotency key reused",
                                       "This Idempotency-Key was already used with a different request body.")
                    # Repeat: return the original, do no work.
                    resp = jsonify(prior.as_json())
                    resp.status_code = 201
                    resp.headers["Location"] = f"/orders/{prior.public_id}"
                    resp.headers["Idempotent-Replay"] = "true"
                    return resp
            total = sum(Decimal(i["unitPrice"]) * i["quantity"] for i in body["items"])
            currency = body.get("currency", "INR")
            seq = S.next_seq()
            order_ref = f"ORD-{seq:04d}"
            pay_key = key or f"order-{uuid.uuid4()}"
            try:
                txn = app.config["payments"].charge(order_ref, total, currency,
                                                    body["cardToken"], pay_key)
            except PaymentDeclined as e:
                return problem(422, "payment-declined", "Payment declined", e.detail)
            except PaymentsUnavailable as e:
                # Fallback = fail, not degrade (see NOTES.md D3).
                return problem(503, "payments-unavailable", "Payments unavailable",
                               f"The order was not placed and you were not charged. {e}",
                               headers={"Retry-After": "5"})
            order = Order(seq=seq, student_id=body["studentId"], items=body["items"],
                          total=total, currency=currency, card_token=body["cardToken"],
                          idempotency_key=key, request_fingerprint=fp,
                          payment_txn_id=str(txn.get("id", "")))
            S.add(order)
        resp = jsonify(order.as_json())
        resp.status_code = 201
        resp.headers["Location"] = f"/orders/{order.public_id}"
        return resp

    @app.get("/orders")
    def list_orders():
        status = request.args.get("status")
        if status and status not in STATUSES:
            return problem(400, "invalid-parameter", "Invalid query parameter",
                           f"status must be one of {sorted(STATUSES)}")
        found = S.list(request.args.get("studentId"), status)
        return jsonify({"items": [o.as_json() for o in found], "count": len(found)})

    @app.get("/orders/<oid>")
    def get_order(oid):
        o = S.get(oid)
        if not o:
            return problem(404, "order-not-found", "Order not found", f"No order with id {oid}.")
        return jsonify(o.as_json())

    @app.post("/orders/<oid>/cancellation")
    def cancel(oid):
        o = S.get(oid)
        if not o:
            return problem(404, "order-not-found", "Order not found", f"No order with id {oid}.")
        body = body_or_none()
        errs = validate_cancellation(body)
        if errs:
            return problem(400, "invalid-request", "Invalid request body", "; ".join(errs))
        with S.lock:
            if o.status != "paid":
                return problem(409, "order-not-cancellable", "Order cannot be cancelled",
                               f"Order {oid} is already {o.status}.")
            o.status = "cancelled"
            o.cancellation = {"orderId": oid, "reason": body["reason"], "cancelledAt": now_iso()}
        resp = jsonify(o.cancellation)
        resp.status_code = 201
        resp.headers["Location"] = f"/orders/{oid}/cancellation"
        return resp

    @app.get("/orders/<oid>/cancellation")
    def get_cancellation(oid):
        o = S.get(oid)
        if not o or not o.cancellation:
            return problem(404, "cancellation-not-found", "Cancellation not found",
                           f"Order {oid} has no cancellation.")
        return jsonify(o.cancellation)

    @app.errorhandler(404)
    def _404(e):
        return problem(404, "not-found", "Not found", "No such route.")

    @app.errorhandler(405)
    def _405(e):
        return problem(405, "method-not-allowed", "Method not allowed", "Method not allowed for this URL.")

    @app.errorhandler(500)
    def _500(e):
        return problem(500, "internal-error", "Internal error", "Unexpected server error.")

    return app


if __name__ == "__main__":
    import os
    create_app().run(port=int(os.environ.get("PORT", 5001)))
