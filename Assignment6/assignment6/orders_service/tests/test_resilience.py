"""Extra tests for the hardened Payments call and the 409/422/503 paths."""
import requests
from app import create_app
from payments_client import PaymentsClient
from test_orders import ORDER, FakePayments


class Resp:
    def __init__(self, code, body=None):
        self.status_code, self._b = code, body or {}
    def json(self):
        return self._b


class Seq:
    def __init__(self, items):
        self.items, self.calls, self.headers = list(items), 0, []
    def post(self, url, json=None, headers=None, timeout=None):
        self.calls += 1
        self.headers.append(headers)
        x = self.items.pop(0)
        if isinstance(x, Exception):
            raise x
        return x


def client(items, attempts=4):
    s = Seq(items)
    return PaymentsClient("http://p", attempts=attempts, sleep=lambda d: None, session=s), s


def test_retries_transient_failures_with_same_key():
    c, s = client([requests.Timeout(), Resp(503), Resp(201, {"id": "p1"})])
    assert c.charge("O", 1, "INR", "tok_x", "K")["id"] == "p1"
    assert s.calls == 3 and all(h["Idempotency-Key"] == "K" for h in s.headers)


def test_4xx_is_never_retried():
    c, s = client([Resp(400), Resp(201, {"id": "p1"})])
    try:
        c.charge("O", 1, "INR", "tok_x", "K")
    except Exception:
        pass
    assert s.calls == 1


def test_dependency_down_gives_503_and_stores_nothing():
    c, s = client([requests.ConnectionError()] * 4)
    app = create_app(payments=c)
    cl = app.test_client()
    r = cl.post("/orders", json=ORDER)
    assert r.status_code == 503 and r.headers["Retry-After"]
    assert cl.get("/orders").get_json()["count"] == 0


def test_cancel_twice_is_409_and_decline_is_422():
    cl = create_app(payments=FakePayments()).test_client()
    oid = cl.post("/orders", json=ORDER).get_json()["id"]
    assert cl.post(f"/orders/{oid}/cancellation", json={"reason": "x"}).status_code == 201
    assert cl.post(f"/orders/{oid}/cancellation", json={"reason": "x"}).status_code == 409
    bad = dict(ORDER, cardToken="tok_declined")
    assert cl.post("/orders", json=bad).status_code == 422
