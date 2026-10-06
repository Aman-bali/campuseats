"""
Catalogue Service — REST implementation (Assignment 4 / Part C).

Endpoints (all four required shapes are present, and all four appear
in openapi.yaml):
  POST   /restaurants/<restaurantId>/menu-items   create
  GET    /menu-items/<itemId>                     read a single item
  GET    /menu-items                              filtered list
  PATCH  /menu-items/<itemId>/availability         state-changing sub-resource
  DELETE /menu-items/<itemId>                      remove
"""
from __future__ import annotations

from flask import Flask, jsonify, request

from errors import ApiError, ConflictError, NotFoundError, UnprocessableError, problem
from payments_client import check_payments_health
from store import MenuItemStore
from validation import (
    validate_availability_update,
    validate_create_menu_item,
    validate_list_query,
)

app = Flask(__name__)
store = MenuItemStore()


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    body, status = problem(error)
    response = jsonify(body)
    response.status_code = status
    response.headers["Content-Type"] = "application/problem+json"
    return response


@app.errorhandler(404)
def handle_flask_404(_error):
    body, status = problem(NotFoundError("The requested route does not exist."))
    response = jsonify(body)
    response.status_code = status
    return response


def _get_json_body() -> dict:
    body = request.get_json(silent=True)
    if body is None:
        from errors import ValidationError
        raise ValidationError("Request body must be valid JSON.")
    return body


# ---------------------------------------------------------------- create
@app.post("/restaurants/<restaurant_id>/menu-items")
def create_menu_item(restaurant_id: str):
    body = _get_json_body()
    validate_create_menu_item(body)

    idempotency_key = request.headers.get("Idempotency-Key")
    item, replayed = store.create(restaurant_id, body, idempotency_key)

    if not replayed:
        # D1/D2: consult the Payments health probe before an item goes
        # live. Unreachable/unhealthy => degrade, don't fail the create.
        health = check_payments_health()
        if not health.healthy:
            item.merchant_verified = False
            store.set_availability(item, False)

    payload = item.as_json()
    response = jsonify(payload)
    response.status_code = 201
    response.headers["Location"] = f"/menu-items/{payload['itemId']}"
    return response


# ------------------------------------------------------------------ read
@app.get("/menu-items/<item_id>")
def get_menu_item(item_id: str):
    item = store.get(item_id)
    if item is None:
        raise NotFoundError(f"No menu item with id '{item_id}'.")
    return jsonify(item.as_json()), 200


# ------------------------------------------------------------------ list
@app.get("/menu-items")
def list_menu_items():
    filters = validate_list_query(request.args)
    items = store.list(filters)
    return jsonify([i.as_json() for i in items]), 200


# ------------------------------------------------------- availability (sub-resource)
@app.patch("/menu-items/<item_id>/availability")
def set_menu_item_availability(item_id: str):
    item = store.get(item_id)
    if item is None:
        raise NotFoundError(f"No menu item with id '{item_id}'.")

    body = _get_json_body()
    validate_availability_update(body)
    desired = body["isAvailable"]

    if desired and not item.merchant_verified:
        # A valid request the domain refuses: we will not let an item
        # go available while its restaurant failed the last payments
        # health check.
        raise UnprocessableError(
            "Item cannot be marked available until the merchant's "
            "payment pipeline is verified healthy again."
        )

    if item.is_available == desired:
        raise ConflictError(
            f"Item is already {'available' if desired else 'unavailable'}."
        )

    store.set_availability(item, desired)
    return jsonify(item.as_json()), 200


# ---------------------------------------------------------------- delete
@app.delete("/menu-items/<item_id>")
def delete_menu_item(item_id: str):
    item = store.get(item_id)
    if item is None:
        raise NotFoundError(f"No menu item with id '{item_id}'.")

    if item.is_available:
        raise ConflictError(
            "Item is still available - mark it unavailable before deleting it."
        )

    store.delete(item)
    return jsonify({"itemId": f"ITEM-{item.id[:8]}", "deleted": True}), 200


if __name__ == "__main__":
    app.run(port=5000, debug=False)
