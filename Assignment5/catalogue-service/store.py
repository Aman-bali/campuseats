"""
In-process storage for the Catalogue Service (Assignment 4 / C1).

This module is private to catalogue-service. Per the Assignment 2
boundary rule, no other CampusEats service may import it directly —
they call the HTTP contract in openapi.yaml instead.
"""
from __future__ import annotations

from typing import Optional

from models import MenuItem


class MenuItemStore:
    def __init__(self) -> None:
        self._items: dict[str, MenuItem] = {}          # internal id -> record
        self._public_index: dict[str, str] = {}         # public itemId -> internal id

    # -- helpers -----------------------------------------------------
    def _public_id(self, item: MenuItem) -> str:
        return f"ITEM-{item.id[:8]}"

    def resolve(self, public_item_id: str) -> Optional[MenuItem]:
        internal_id = self._public_index.get(public_item_id)
        if internal_id is None:
            return None
        item = self._items.get(internal_id)
        if item is None or item.deleted:
            return None
        return item

    # -- create with idempotency support ------------------------------
    def create(self, restaurant_id: str, fields: dict, idempotency_key: Optional[str]):
        """
        Returns (item, replayed: bool). If idempotency_key was already
        used for a create under this restaurant, the *original* item is
        returned and replayed=True — no new record is made.
        """
        if idempotency_key:
            existing_id = self._idempotency_lookup(restaurant_id, idempotency_key)
            if existing_id is not None:
                return self._items[existing_id], True

        item = MenuItem(
            restaurant_id=restaurant_id,
            name=fields["name"],
            description=fields.get("description", "") or "",
            price_cents=round(fields["price"] * 100),
            category=fields.get("category", "uncategorised"),
            is_available=fields.get("isAvailable", True),
        )
        self._items[item.id] = item
        self._public_index[self._public_id(item)] = item.id

        if idempotency_key:
            item.idempotency_keys[idempotency_key] = item.id

        return item, False

    def _idempotency_lookup(self, restaurant_id: str, key: str) -> Optional[str]:
        for item in self._items.values():
            if item.restaurant_id == restaurant_id and key in item.idempotency_keys:
                return item.id
        return None

    # -- read ----------------------------------------------------------
    def get(self, public_item_id: str) -> Optional[MenuItem]:
        return self.resolve(public_item_id)

    def list(self, filters: dict) -> list[MenuItem]:
        results = [i for i in self._items.values() if not i.deleted]

        if "restaurant_id" in filters:
            results = [i for i in results if i.restaurant_id == filters["restaurant_id"]]
        if "category" in filters:
            results = [i for i in results if i.category == filters["category"]]
        if "query" in filters:
            q = filters["query"]
            results = [i for i in results if q in i.name.lower() or q in i.description.lower()]
        if "available" in filters:
            results = [i for i in results if i.is_available == filters["available"]]

        return results

    # -- state changes ---------------------------------------------------
    def set_availability(self, item: MenuItem, is_available: bool) -> None:
        item.is_available = is_available
        item.touch()

    def delete(self, item: MenuItem) -> None:
        item.deleted = True
        item.touch()
