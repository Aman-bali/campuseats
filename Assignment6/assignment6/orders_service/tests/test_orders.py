import pytest
from app import create_app
from payments_client import PaymentDeclined


class FakePayments:
    def __init__(self):
        self.calls = 0

    def charge(self, order_ref, amount, currency, card_token, idempotency_key):
        self.calls += 1
        if card_token == "tok_declined":
            raise PaymentDeclined("Issuing bank declined the transaction")
        return {"id": f"pay_{self.calls}", "status": "captured"}


ORDER = {"studentId": "S-1", "cardToken": "tok_4242", "address": "Hostel B, Room 214",
         "items": [{"itemId": "ITM-1", "name": "Dosa", "quantity": 2, "unitPrice": "60.00"}]}


@pytest.fixture
def setup():
    pay = FakePayments()
    return create_app(payments=pay).test_client(), pay


def test_create_returns_201_and_location(setup):
    client, _ = setup
    r = client.post("/orders", json=ORDER, headers={"Idempotency-Key": "k1"})
    assert r.status_code == 201
    assert r.headers["Location"] == "/orders/" + r.get_json()["id"]
    assert "cardToken" not in r.get_json() and r.get_json()["total"] == "120.00"


def test_idempotent_repeat_returns_original_without_recharging(setup):
    client, pay = setup
    h = {"Idempotency-Key": "k2"}
    first = client.post("/orders", json=ORDER, headers=h)
    again = client.post("/orders", json=ORDER, headers=h)
    assert again.status_code == 201
    assert again.get_json() == first.get_json()
    assert pay.calls == 1


def test_invalid_body_returns_422_problem(setup):
    client, _ = setup
    r = client.post("/orders", json={"studentId": "S-1", "items": []})
    assert r.status_code == 422
    assert {"type", "title", "status", "detail"} <= set(r.get_json())
    assert r.content_type == "application/problem+json; charset=utf-8"


def test_unknown_id_returns_404(setup):
    client, _ = setup
    assert client.get("/orders/ORD-9999").status_code == 404
