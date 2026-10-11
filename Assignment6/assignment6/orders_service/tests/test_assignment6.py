"""Assignment 6 - honest responses: status codes, one error shape, validation, negotiation."""
import logging
import xml.etree.ElementTree as ET

import pytest

from app import create_app
from availability import StaticAvailability
from errors import BASE
from ratelimit import RateLimiter
from test_orders import ORDER, FakePayments

PROBLEM = "application/problem+json; charset=utf-8"


def make(**kw):
    kw.setdefault("payments", FakePayments())
    return create_app(**kw).test_client()


def order_with(**changes):
    return {**ORDER, **changes}


# ---------------------------------------------------------------- Part A ----
def test_a3_create_is_201_with_location_pointing_at_the_order():
    c = make()
    r = c.post("/orders", json=ORDER)
    assert r.status_code == 201
    loc = r.headers["Location"]
    assert loc == "/orders/" + r.get_json()["id"]
    assert c.get(loc).status_code == 200                     # Location really resolves


def test_a1_unknown_id_is_404_not_200():
    r = make().get("/orders/ORD-9999")
    assert r.status_code == 404
    assert r.get_json()["type"] == BASE + "order-not-found"
    assert "ok" not in r.get_json()                          # A2: never {"ok": false}


def test_a1_patch_and_delete_are_405_with_allow():
    c = make()
    oid = c.post("/orders", json=ORDER).get_json()["id"]
    for method in ("patch", "delete"):
        for url in ("/orders", f"/orders/{oid}"):
            r = getattr(c, method)(url)
            assert r.status_code == 405 and r.content_type == PROBLEM
            assert "Allow" in r.headers
    assert "DELETE" not in c.delete("/orders").headers["Allow"]


def test_a1_illegal_transition_is_409():
    c = make()
    oid = c.post("/orders", json=ORDER).get_json()["id"]
    assert c.post(f"/orders/{oid}/cancellation", json={"reason": "x"}).status_code == 201
    r = c.post(f"/orders/{oid}/cancellation", json={"reason": "x"})
    assert r.status_code == 409
    assert r.get_json()["type"] == BASE + "illegal-transition"


def test_a4_rate_limit_is_429_with_retry_after():
    clock = [0.0]
    c = make(limiter=RateLimiter(2, 60, clock=lambda: clock[0]))
    assert c.get("/orders").status_code == 200
    assert c.get("/orders").status_code == 200
    r = c.get("/orders")
    assert r.status_code == 429 and r.content_type == PROBLEM
    assert int(r.headers["Retry-After"]) == 60
    assert r.get_json()["type"] == BASE + "rate-limited"
    clock[0] = 61                                            # window over -> allowed again
    assert c.get("/orders").status_code == 200


def test_a4_503_has_retry_after_and_stores_nothing():
    import requests
    from payments_client import PaymentsClient

    class Down:
        def post(self, *a, **k):
            raise requests.ConnectionError("10.1.2.3:5002 refused")
    pay = PaymentsClient("http://p", attempts=2, sleep=lambda d: None, session=Down())
    c = make(payments=pay)
    r = c.post("/orders", json=ORDER)
    assert r.status_code == 503 and r.headers["Retry-After"] == "5"
    assert "10.1.2.3" not in r.get_data(as_text=True)        # B4: reason stays in the log
    assert c.get("/orders").get_json()["count"] == 0


# ---------------------------------------------------------------- Part B ----
def test_b1_every_failure_has_one_shape_and_content_type():
    c = make()
    failures = [
        c.get("/orders/ORD-9999"),                                       # 404
        c.get("/nope"),                                                  # 404 route
        c.delete("/orders"),                                             # 405
        c.post("/orders", json=order_with(items=[])),                    # 422 empty-cart
        c.post("/orders", data="{", content_type="application/json"),    # 400
        c.post("/orders", data="x", content_type="text/plain"),          # 415
        c.get("/orders", headers={"Accept": "text/html"}),               # 406
        c.get("/orders?status=bogus"),                                   # 422
    ]
    for r in failures:
        body = r.get_json()
        assert r.status_code >= 400
        assert r.content_type == PROBLEM, r.status_code
        assert {"type", "title", "status", "detail"} <= set(body)
        assert body["status"] == r.status_code
        assert body["type"].startswith(BASE)


def test_b2_empty_cart_type():
    r = make().post("/orders", json=order_with(items=[]))
    assert r.status_code == 422
    assert r.get_json()["type"] == BASE + "empty-cart"
    assert r.get_json()["errors"][0]["field"] == "items"


def test_b2_item_unavailable_type_and_no_charge():
    pay = FakePayments()
    c = make(payments=pay, availability=StaticAvailability({"ITM-1"}))
    r = c.post("/orders", json=ORDER)
    assert r.status_code == 422
    assert r.get_json()["type"] == BASE + "item-unavailable"
    assert pay.calls == 0


def test_b2_payment_declined_type():
    r = make().post("/orders", json=order_with(cardToken="tok_declined"))
    assert r.status_code == 422 and r.get_json()["type"] == BASE + "payment-declined"


def test_b3_two_bad_fields_reported_at_once():
    bad = order_with(address="", items=[
        {"itemId": "ITM-1", "name": "Dosa", "quantity": 0, "unitPrice": "60.00"}])
    r = make().post("/orders", json=bad)
    assert r.status_code == 422
    fields = {e["field"] for e in r.get_json()["errors"]}
    assert {"address", "items[0].quantity"} <= fields
    assert all(e["message"] for e in r.get_json()["errors"])


def test_b4_unexpected_exception_is_hidden_but_logged(caplog):
    class Boom:
        def charge(self, *a, **k):
            raise RuntimeError("psycopg2.OperationalError: password for user campus_admin")
    c = make(payments=Boom())
    with caplog.at_level(logging.ERROR, logger="campuseats.orders"):
        r = c.post("/orders", json=ORDER)
    text = r.get_data(as_text=True)
    assert r.status_code == 500 and r.content_type == PROBLEM
    assert "psycopg2" not in text and "Traceback" not in text and "campus_admin" not in text
    assert "campus_admin" in caplog.text                     # ... but the log has it
    ref = r.get_json()["detail"].split("reference ")[1].split(" ")[0]
    assert ref in caplog.text                                # client ref lets us find it


# ---------------------------------------------------------------- Part C ----
def test_c2_validate_before_acting():
    pay = FakePayments()
    c = make(payments=pay)
    r = c.post("/orders", json=order_with(items=[
        {"itemId": "", "name": "Dosa", "quantity": -1, "unitPrice": "abc"}]))
    assert r.status_code == 422 and pay.calls == 0
    assert c.get("/orders").get_json()["count"] == 0
    fields = [e["field"] for e in r.get_json()["errors"]]
    assert fields == ["items[0].itemId", "items[0].quantity", "items[0].unitPrice"]  # ALL, not first


@pytest.mark.parametrize("qty", [0, -3, 1.5, "2", True, None, 21])
def test_c1_quantity_must_be_integer_ge_1(qty):
    item = {"itemId": "ITM-1", "name": "Dosa", "unitPrice": "60.00", "quantity": qty}
    r = make().post("/orders", json=order_with(items=[item]))
    assert r.status_code == 422
    assert r.get_json()["errors"][0]["field"] == "items[0].quantity"


def test_c1_address_is_required():
    body = {k: v for k, v in ORDER.items() if k != "address"}
    r = make().post("/orders", json=body)
    assert r.status_code == 422
    assert r.get_json()["errors"] == [{"field": "address", "message": "is required"}]


@pytest.mark.parametrize("price", ["NaN", "Infinity", "-1", "0", 60])
def test_c1_price_must_be_finite_positive_string(price):
    item = {"itemId": "ITM-1", "name": "Dosa", "quantity": 1, "unitPrice": price}
    r = make().post("/orders", json=order_with(items=[item]))
    assert r.status_code == 422


def test_c3_default_is_json():
    c = make()
    c.post("/orders", json=ORDER)
    for accept in (None, "*/*", "application/json"):
        r = c.get("/orders/ORD-0001", headers={"Accept": accept} if accept else {})
        assert r.content_type == "application/json; charset=utf-8"


def test_c3_xml_when_asked_and_well_formed():
    c = make()
    c.post("/orders", json=order_with(address="A & B <Hostel>"))
    r = c.get("/orders/ORD-0001", headers={"Accept": "application/xml"})
    assert r.status_code == 200
    assert r.content_type == "application/xml; charset=utf-8"
    root = ET.fromstring(r.get_data())                       # parses -> escaping is right
    assert root.tag == "order" and root.findtext("id") == "ORD-0001"
    assert root.findtext("address") == "A & B <Hostel>"
    assert len(root.findall("items/item")) == 1
    assert "cardToken" not in r.get_data(as_text=True)


def test_c3_list_in_xml():
    c = make()
    c.post("/orders", json=ORDER)
    root = ET.fromstring(c.get("/orders", headers={"Accept": "application/xml"}).get_data())
    assert root.tag == "orderList" and root.findtext("count") == "1"
    assert len(root.findall("items/order")) == 1


def test_c3_q_values_and_406():
    c = make()
    c.post("/orders", json=ORDER)
    prefer_xml = {"Accept": "application/xml;q=0.9, application/json;q=0.5"}
    assert c.get("/orders", headers=prefer_xml).content_type.startswith("application/xml")
    r = c.get("/orders/ORD-0001", headers={"Accept": "text/html"})
    assert r.status_code == 406 and r.content_type == PROBLEM
    assert r.get_json()["type"] == BASE + "not-acceptable"


def test_c3_errors_can_be_xml_too():
    r = make().get("/orders/ORD-9999", headers={"Accept": "application/xml"})
    assert r.status_code == 404
    assert r.content_type == "application/problem+xml; charset=utf-8"
    root = ET.fromstring(r.get_data())
    assert root.tag.endswith("problem") and root.find("{*}status").text == "404"


def test_c3_xml_422_lists_errors():
    r = make().post("/orders", json=order_with(address=""),
                    headers={"Accept": "application/xml"})
    root = ET.fromstring(r.get_data())
    assert r.status_code == 422
    assert root.find("{*}errors/{*}error/{*}field").text == "address"


def test_c4_every_response_has_charset():
    c = make()
    c.post("/orders", json=ORDER)
    responses = [
        c.get("/orders"), c.get("/orders/ORD-0001"), c.get("/orders/ORD-9999"),
        c.post("/orders", json=order_with(items=[])), c.get("/x"),
        c.options("/orders"), c.get("/orders", headers={"Accept": "application/xml"}),
        c.post("/orders", json=ORDER), c.get("/orders", headers={"Accept": "text/html"}),
    ]
    for r in responses:
        if r.get_data():
            assert "charset=utf-8" in r.headers["Content-Type"].lower(), r.status_code
    assert all("Accept" in r.headers.get("Vary", "") for r in responses)


# ------------------------------------------------------- D4: regressions ----
def test_d4_idempotency_still_holds_and_replay_is_not_rate_or_validation_blocked():
    pay = FakePayments()
    c = make(payments=pay)
    h = {"Idempotency-Key": "k-6"}
    first = c.post("/orders", json=ORDER, headers=h)
    again = c.post("/orders", json=ORDER, headers=h)
    assert again.status_code == 201 and again.get_json() == first.get_json()
    assert again.headers["Idempotent-Replay"] == "true" and pay.calls == 1
    clash = c.post("/orders", json=order_with(studentId="S-2"), headers=h)
    assert clash.status_code == 422
    assert clash.get_json()["type"] == BASE + "idempotency-key-reused"


def test_d4_cancellation_body_is_validated_with_field_errors():
    c = make()
    oid = c.post("/orders", json=ORDER).get_json()["id"]
    r = c.post(f"/orders/{oid}/cancellation", json={"reason": ""})
    assert r.status_code == 422 and r.get_json()["errors"][0]["field"] == "reason"
