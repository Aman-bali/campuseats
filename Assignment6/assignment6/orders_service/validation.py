"""Validate, then act (Part C). Hand-written replacement for a JSON Schema.

Every validator COLLECTS all problems and returns them as a list of
{"field": ..., "message": ...}. An empty list means the body is valid.
Nothing here touches the store, the payment service or any other side effect.
"""
from decimal import Decimal, InvalidOperation

STATUSES = {"paid", "cancelled"}
MAX_ITEMS = 50
MAX_QTY = 20


def _err(errs, field, message):
    errs.append({"field": field, "message": message})


def _non_empty_str(body, key, errs, field, max_len=None):
    v = body.get(key)
    if key not in body or v is None:
        _err(errs, field, "is required")
    elif not isinstance(v, str) or not v.strip():
        _err(errs, field, "must be a non-empty string")
    elif max_len and len(v) > max_len:
        _err(errs, field, f"must be at most {max_len} characters")


def validate_order(body):
    """C1/C2 - rules for POST /orders."""
    if not isinstance(body, dict):
        return [{"field": "(body)", "message": "must be a JSON object"}]
    errs = []

    _non_empty_str(body, "studentId", errs, "studentId")
    _non_empty_str(body, "address", errs, "address", max_len=200)   # required

    tok = body.get("cardToken")
    if tok is None:
        _err(errs, "cardToken", "is required")
    elif not isinstance(tok, str) or not tok.startswith("tok_"):
        _err(errs, "cardToken", "must be a string starting with 'tok_'")

    cur = body.get("currency", "INR")
    if not isinstance(cur, str) or len(cur) != 3:
        _err(errs, "currency", "must be a 3-letter code")

    items = body.get("items")
    if items is None:
        _err(errs, "items", "is required")
    elif not isinstance(items, list):
        _err(errs, "items", "must be an array")
    elif not items:
        _err(errs, "items", "must contain at least one item")
    elif len(items) > MAX_ITEMS:
        _err(errs, "items", f"must contain at most {MAX_ITEMS} items")
    else:
        for i, it in enumerate(items):
            p = f"items[{i}]"
            if not isinstance(it, dict):
                _err(errs, p, "must be an object")
                continue
            _non_empty_str(it, "itemId", errs, f"{p}.itemId")
            _non_empty_str(it, "name", errs, f"{p}.name")

            q = it.get("quantity")
            if q is None:
                _err(errs, f"{p}.quantity", "is required")
            elif isinstance(q, bool) or not isinstance(q, int) or not 1 <= q <= MAX_QTY:
                _err(errs, f"{p}.quantity", f"must be an integer between 1 and {MAX_QTY}")

            price = it.get("unitPrice")
            if price is None:
                _err(errs, f"{p}.unitPrice", "is required")
            else:
                try:
                    if not isinstance(price, str):
                        raise InvalidOperation
                    d = Decimal(price)
                    if not d.is_finite() or d <= 0:
                        raise InvalidOperation
                except InvalidOperation:
                    _err(errs, f"{p}.unitPrice", "must be a positive decimal string such as \"60.00\"")
    return errs


def cart_is_empty(body):
    return isinstance(body, dict) and isinstance(body.get("items"), list) and not body["items"]


def validate_cancellation(body):
    if not isinstance(body, dict):
        return [{"field": "(body)", "message": "must be a JSON object"}]
    errs = []
    r = body.get("reason")
    if r is None:
        _err(errs, "reason", "is required")
    elif not isinstance(r, str) or not r.strip():
        _err(errs, "reason", "must be a non-empty string")
    elif len(r) > 200:
        _err(errs, "reason", "must be at most 200 characters")
    return errs


def validate_list_query(args):
    errs = []
    status = args.get("status")
    if status and status not in STATUSES:
        _err(errs, "status", f"must be one of {sorted(STATUSES)}")
    return errs
