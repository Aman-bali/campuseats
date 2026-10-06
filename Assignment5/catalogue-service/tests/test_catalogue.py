"""
Four tests, one per required behaviour (Assignment 4 / C8):
  1. create succeeds with the right code and header
  2. the idempotent repeat returns the original
  3. one failure path returns the right 4xx
  4. an unknown id returns 404

The Payments health probe is monkeypatched so the tests never touch
the network - they are testing catalogue-service's own behaviour, not
Payments' availability.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

import app as app_module
import payments_client
from payments_client import PaymentsHealthResult


@pytest.fixture(autouse=True)
def healthy_payments(monkeypatch):
    """By default, pretend Payments is healthy so tests aren't flaky."""
    monkeypatch.setattr(
        payments_client, "check_payments_health",
        lambda: PaymentsHealthResult(healthy=True, reason="ok"),
    )
    monkeypatch.setattr(
        app_module, "check_payments_health",
        lambda: PaymentsHealthResult(healthy=True, reason="ok"),
    )


@pytest.fixture()
def client():
    app_module.app.config["TESTING"] = True
    # Fresh store per test so tests don't leak state into each other.
    app_module.store = app_module.MenuItemStore()
    with app_module.app.test_client() as c:
        yield c


def _create_payload(**overrides):
    payload = {
        "name": "Masala Dosa",
        "description": "Crispy rice-and-lentil crepe with potato filling.",
        "price": 80,
        "category": "mains",
    }
    payload.update(overrides)
    return payload


def test_create_returns_201_with_location_header(client):
    resp = client.post(
        "/restaurants/rest-001/menu-items", json=_create_payload()
    )
    assert resp.status_code == 201
    assert "Location" in resp.headers
    body = resp.get_json()
    assert resp.headers["Location"] == f"/menu-items/{body['itemId']}"
    assert body["name"] == "Masala Dosa"
    assert body["price"] == 80
    # representation must not leak internal fields
    assert "id" not in body
    assert "merchant_verified" not in body
    assert "idempotency_keys" not in body


def test_idempotent_repeat_returns_original(client):
    key = "onboard-rest-001-dosa-001"
    first = client.post(
        "/restaurants/rest-001/menu-items",
        json=_create_payload(),
        headers={"Idempotency-Key": key},
    )
    assert first.status_code == 201
    first_body = first.get_json()

    repeat = client.post(
        "/restaurants/rest-001/menu-items",
        # even a different body must not create a second record
        json=_create_payload(name="Different Name Entirely", price=999),
        headers={"Idempotency-Key": key},
    )
    assert repeat.status_code == 201
    repeat_body = repeat.get_json()

    assert repeat_body == first_body

    listing = client.get("/menu-items", query_string={"restaurantId": "rest-001"})
    assert len(listing.get_json()) == 1


def test_malformed_body_returns_400(client):
    resp = client.post(
        "/restaurants/rest-001/menu-items",
        json=_create_payload(price=-5),
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["status"] == 400
    assert "type" in body and "title" in body and "detail" in body


def test_unknown_id_returns_404(client):
    resp = client.get("/menu-items/ITEM-doesnotexist")
    assert resp.status_code == 404
    body = resp.get_json()
    assert body["status"] == 404
    assert "type" in body and "title" in body and "detail" in body
