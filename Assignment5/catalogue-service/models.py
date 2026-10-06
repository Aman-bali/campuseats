"""
Domain model for the Catalogue Service's menu-items resource.

Design note (Assignment 4 / C2):
MenuItem is the *record* — everything the service stores, including
internal bookkeeping that must never reach a caller (the full internal
id, the raw idempotency-key ledger, and the merchant-verification flag
set by the hardened Payments health check in payments_client.py).

as_json() is the *representation* — the public shape a caller of the
REST API actually sees. It differs from the record in more than one
way:
  - `id` (internal uuid4 hex) is never returned; `itemId` is a shorter,
    presentation-friendly reference derived from it.
  - `price_cents` (integer, stored so money math never touches floats)
    is converted to `price` (a decimal amount in rupees) on the way out.
  - `merchant_verified` and `idempotency_keys` are internal-only and are
    dropped entirely.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class MenuItem:
    # --- record fields (internal storage) ---
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    restaurant_id: str = ""
    name: str = ""
    description: str = ""
    price_cents: int = 0
    category: str = "uncategorised"
    is_available: bool = True
    merchant_verified: bool = True          # set by the Payments health check
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    # idempotency ledger for THIS record's create call: {key: response_body}
    idempotency_keys: dict = field(default_factory=dict)
    deleted: bool = False

    # --- public representation ---
    def as_json(self) -> dict:
        return {
            "itemId": f"ITEM-{self.id[:8]}",
            "restaurantId": self.restaurant_id,
            "name": self.name,
            "description": self.description,
            "price": round(self.price_cents / 100, 2),
            "category": self.category,
            "isAvailable": self.is_available,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }

    def touch(self) -> None:
        self.updated_at = _now()
