"""In-process storage. No other service imports this module."""
import threading


class OrderStore:
    def __init__(self):
        self._orders = {}      # public_id -> Order
        self._by_key = {}      # idempotency key -> public_id
        self._seq = 0
        self.lock = threading.RLock()

    def next_seq(self):
        self._seq += 1
        return self._seq

    def add(self, order):
        self._orders[order.public_id] = order
        if order.idempotency_key:
            self._by_key[order.idempotency_key] = order.public_id

    def get(self, public_id):
        return self._orders.get(public_id)

    def by_key(self, key):
        pid = self._by_key.get(key)
        return self._orders.get(pid) if pid else None

    def list(self, student_id=None, status=None):
        out = list(self._orders.values())
        if student_id:
            out = [o for o in out if o.student_id == student_id]
        if status:
            out = [o for o in out if o.status == status]
        return out
