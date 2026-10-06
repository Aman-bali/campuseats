"""Record (what we store) vs representation (what we publish)."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class Order:
    seq: int                       # internal integer id - never published
    student_id: str
    items: list
    total: Decimal
    currency: str
    card_token: str                # credential - never published
    idempotency_key: str | None    # stored with the record (C7)
    request_fingerprint: str       # hash of body, detects key reuse with new body
    payment_txn_id: str            # internal Payments reference - never published
    status: str = "paid"           # stored as lower-case state
    created_at: str = field(default_factory=now_iso)
    cancellation: dict | None = None

    @property
    def public_id(self):
        return f"ORD-{self.seq:04d}"

    def as_json(self):
        """Representation: differs from the record (public id, string money,
        links) and omits card_token, idempotency_key, payment_txn_id, seq."""
        d = {
            "id": self.public_id,
            "studentId": self.student_id,
            "items": self.items,
            "total": f"{self.total:.2f}",
            "currency": self.currency,
            "status": self.status,
            "createdAt": self.created_at,
            "links": {"self": f"/orders/{self.public_id}"},
        }
        if self.cancellation:
            d["links"]["cancellation"] = f"/orders/{self.public_id}/cancellation"
        return d
