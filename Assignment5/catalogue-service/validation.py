"""
Hand-written validation (Assignment 4 / C4).

In the Assignment 3 SOAP design this job was done for free by the WSDL's
XML Schema: a request that didn't match <xsd:element name="ChargeRequest">
never reached our code at all. REST has no such gate, so every field is
checked here, by hand, before app.py touches a single key of the body.
"""
from __future__ import annotations

from errors import ValidationError

VALID_CATEGORIES = {
    "starters", "mains", "desserts", "beverages", "snacks", "uncategorised",
}


def validate_create_menu_item(body: dict) -> None:
    if not isinstance(body, dict):
        raise ValidationError("Request body must be a JSON object.")

    name = body.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValidationError("`name` is required and must be a non-empty string.")
    if len(name) > 120:
        raise ValidationError("`name` must be 120 characters or fewer.")

    description = body.get("description", "")
    if description is not None and not isinstance(description, str):
        raise ValidationError("`description` must be a string.")

    price = body.get("price")
    if not isinstance(price, (int, float)) or isinstance(price, bool):
        raise ValidationError("`price` is required and must be a number.")
    if price <= 0:
        raise ValidationError("`price` must be greater than zero.")
    if price > 100000:
        raise ValidationError("`price` is outside the accepted range.")

    category = body.get("category", "uncategorised")
    if category not in VALID_CATEGORIES:
        raise ValidationError(
            f"`category` must be one of: {', '.join(sorted(VALID_CATEGORIES))}."
        )

    is_available = body.get("isAvailable", True)
    if not isinstance(is_available, bool):
        raise ValidationError("`isAvailable` must be a boolean if provided.")


def validate_availability_update(body: dict) -> None:
    if not isinstance(body, dict):
        raise ValidationError("Request body must be a JSON object.")
    if "isAvailable" not in body:
        raise ValidationError("`isAvailable` is required.")
    if not isinstance(body["isAvailable"], bool):
        raise ValidationError("`isAvailable` must be a boolean.")


def validate_list_query(args) -> dict:
    """Validate and normalise ?restaurantId=&category=&query=&available= ."""
    filters: dict = {}

    restaurant_id = args.get("restaurantId")
    if restaurant_id:
        filters["restaurant_id"] = restaurant_id

    category = args.get("category")
    if category:
        if category not in VALID_CATEGORIES:
            raise ValidationError(
                f"`category` must be one of: {', '.join(sorted(VALID_CATEGORIES))}."
            )
        filters["category"] = category

    query = args.get("query")
    if query:
        if len(query) > 200:
            raise ValidationError("`query` is too long.")
        filters["query"] = query.lower()

    available = args.get("available")
    if available is not None:
        if available.lower() not in {"true", "false"}:
            raise ValidationError("`available` must be `true` or `false`.")
        filters["available"] = available.lower() == "true"

    return filters
