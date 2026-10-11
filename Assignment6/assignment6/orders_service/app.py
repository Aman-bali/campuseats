"""CampusEats Orders service (REST) - Assignment 6: honest responses.

Pipeline for every request:
    before_request  ->  negotiate Accept (406)  ->  rate limit (429)
    handler         ->  parse body (415/400)    ->  validate (422)
                    ->  business rules (404/409/422) -> do the work
    on any failure  ->  ProblemError / HTTP error / unexpected exception
                    ->  ONE renderer: application/problem+json (or +xml)
"""
import hashlib
import json
import logging
import os
import uuid
from decimal import Decimal

from flask import Flask, g, request
from werkzeug.exceptions import BadRequest, HTTPException

from availability import StaticAvailability
from errors import ProblemError, problem, render_problem
from models import Order, now_iso
from negotiation import JSON, choose_format, respond
from payments_client import PaymentDeclined, PaymentsClient, PaymentsUnavailable
from ratelimit import RateLimiter
from store import OrderStore
from validation import (cart_is_empty, validate_cancellation,
                        validate_list_query, validate_order)

log = logging.getLogger("campuseats.orders")

ORDER_TAGS = {"orderList/items": "order"}      # XML: <items><order>..</order></items>


def fingerprint(body):
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def create_app(payments=None, store=None, availability=None, limiter=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024            # 413 beyond 64 KiB
    app.config["store"] = store or OrderStore()
    app.config["payments"] = payments or PaymentsClient()
    S = app.config["store"]
    avail = availability or StaticAvailability()
    limiter = limiter or RateLimiter(
        max_requests=int(os.environ.get("RATE_LIMIT_MAX", 60)),
        window=float(os.environ.get("RATE_LIMIT_WINDOW", 60)))

    # ------------------------------------------------------------ gates ----
    @app.before_request
    def gate():
        g.fmt = JSON                                        # safe default for errors below
        fmt = choose_format(request.headers.get("Accept"))
        if fmt is None:                                     # C3: cannot produce it -> 406
            raise ProblemError("not-acceptable",
                               "This API can produce application/json (default) "
                               "and application/xml.")
        g.fmt = fmt
        ok, retry = limiter.check(request.remote_addr or "unknown")
        if not ok:                                          # A4: 429 + Retry-After
            raise ProblemError(
                "rate-limited",
                f"More than {limiter.max} requests in {int(limiter.window)} s. "
                f"Wait {retry} s and retry.",
                headers={"Retry-After": str(retry)})

    @app.after_request
    def label(resp):
        # C4 safety net: even a response we did not build gets a charset.
        ct = resp.headers.get("Content-Type", "")
        if ct and "charset" not in ct.lower() and (
                ct.startswith("text/") or "json" in ct or "xml" in ct):
            resp.headers["Content-Type"] = ct + "; charset=utf-8"
        resp.headers.add("Vary", "Accept")                  # body depends on Accept
        return resp

    def read_json():
        if not request.is_json:
            raise ProblemError("unsupported-media-type",
                               "Send the body as JSON with 'Content-Type: application/json'.")
        try:
            return request.get_json()
        except BadRequest:
            raise ProblemError("malformed-json", "The request body is not valid JSON.")

    def fail_validation(errs):
        n = len(errs)
        raise ProblemError("validation-failed",
                           f"{n} field{'s' if n != 1 else ''} failed validation; see 'errors'.",
                           errors=errs)

    def order_or_404(oid):
        o = S.get(oid)
        if not o:
            raise ProblemError("order-not-found", f"No order with id {oid}.")
        return o

    # ----------------------------------------------------------- routes ----
    @app.post("/orders")
    def create_order():
        body = read_json()
        errs = validate_order(body)                         # C2: validate BEFORE any work
        if errs:
            if cart_is_empty(body):
                raise ProblemError("empty-cart",
                                   "The order contains no items. Add at least one item.",
                                   errors=errs)
            fail_validation(errs)

        key = request.headers.get("Idempotency-Key")
        fp = fingerprint(body)
        with S.lock:
            if key:
                prior = S.by_key(key)
                if prior:
                    if prior.request_fingerprint != fp:
                        raise ProblemError("idempotency-key-reused",
                                           "This Idempotency-Key was already used with a different request body.")
                    # Repeat: return the original, do no work.
                    return respond(prior.as_json(), 201, root="order", headers={
                        "Location": f"/orders/{prior.public_id}",
                        "Idempotent-Replay": "true"})

            gone = avail.unavailable_among([i["itemId"] for i in body["items"]])
            if gone:
                raise ProblemError("item-unavailable",
                                   f"Not available right now: {', '.join(gone)}. Remove the unavailable "
                                   f"item{'s' if len(gone) > 1 else ''} and retry.")

            total = sum(Decimal(i["unitPrice"]) * i["quantity"] for i in body["items"])
            currency = body.get("currency", "INR")
            seq = S.next_seq()
            order_ref = f"ORD-{seq:04d}"
            pay_key = key or f"order-{uuid.uuid4()}"
            try:                                            # B4: risky outbound call
                txn = app.config["payments"].charge(order_ref, total, currency,
                                                    body["cardToken"], pay_key)
            except PaymentDeclined as e:
                raise ProblemError("payment-declined", e.detail)
            except PaymentsUnavailable as e:
                # The raw reason (host names, env var names, attempt counts) stays in the log.
                log.warning("payments unavailable for %s: %s", order_ref, e)
                raise ProblemError(
                    "payments-unavailable",
                    "The payment service is temporarily unavailable. The order was not "
                    "placed and you were not charged. Retry with the same Idempotency-Key.",
                    headers={"Retry-After": "5"})
            order = Order(seq=seq, student_id=body["studentId"], address=body["address"],
                          items=body["items"], total=total, currency=currency,
                          card_token=body["cardToken"], idempotency_key=key,
                          request_fingerprint=fp, payment_txn_id=str(txn.get("id", "")))
            S.add(order)
        return respond(order.as_json(), 201, root="order",             # A3
                       headers={"Location": f"/orders/{order.public_id}"})

    @app.get("/orders")
    def list_orders():
        errs = validate_list_query(request.args)
        if errs:
            fail_validation(errs)
        found = S.list(request.args.get("studentId"), request.args.get("status"))
        return respond({"items": [o.as_json() for o in found], "count": len(found)},
                       200, root="orderList", child_tags=ORDER_TAGS)

    @app.get("/orders/<oid>")
    def get_order(oid):
        return respond(order_or_404(oid).as_json(), 200, root="order")

    @app.post("/orders/<oid>/cancellation")
    def cancel(oid):
        o = order_or_404(oid)
        body = read_json()
        errs = validate_cancellation(body)
        if errs:
            fail_validation(errs)
        with S.lock:
            if o.status != "paid":
                raise ProblemError(
                    "illegal-transition",
                    f"Order {oid} is {o.status}; only a paid order can be cancelled "
                    f"({o.status} -> cancelled is not allowed).")
            o.status = "cancelled"
            o.cancellation = {"orderId": oid, "reason": body["reason"], "cancelledAt": now_iso()}
        return respond(o.cancellation, 201, root="cancellation",
                       headers={"Location": f"/orders/{oid}/cancellation"})

    @app.get("/orders/<oid>/cancellation")
    def get_cancellation(oid):
        o = S.get(oid)
        if not o:
            raise ProblemError("order-not-found", f"No order with id {oid}.")
        if not o.cancellation:
            raise ProblemError("cancellation-not-found", f"Order {oid} has no cancellation.")
        return respond(o.cancellation, 200, root="cancellation")

    # ----------------------------------------------- error -> one shape ----
    @app.errorhandler(ProblemError)
    def _problem_error(e):
        return problem(e.slug, e.detail, headers=e.headers, errors=e.errors)

    @app.errorhandler(HTTPException)
    def _http_error(e):
        if e.code is not None and e.code < 400:             # redirects pass through
            return e
        if e.code == 404:
            return problem("not-found", "No such route.")
        if e.code == 405:
            allow = ", ".join(sorted(e.valid_methods or []))
            return problem("method-not-allowed",
                           f"{request.method} is not supported here. Allowed: {allow}.",
                           headers={"Allow": allow})
        return render_problem(e.code or 500, "http-error", e.name, e.description)

    @app.errorhandler(Exception)
    def _unexpected(e):                                     # B4: never leak internals
        ref = uuid.uuid4().hex[:8]
        log.exception("unhandled error ref=%s %s %s", ref, request.method, request.path)
        return problem("internal-error",
                       f"An unexpected error occurred. Quote reference {ref} if you contact support.")

    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_app().run(port=int(os.environ.get("PORT", 5001)))
