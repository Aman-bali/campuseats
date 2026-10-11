"""Fixed-window, per-client rate limiter (A4: 429 + Retry-After).

In-process and per-instance: fine for this assignment. A real deployment with
several instances would keep the counters in a shared store (e.g. Redis).
"""
import math
import threading
import time


class RateLimiter:
    def __init__(self, max_requests=60, window=60.0, clock=time.monotonic):
        self.max, self.window, self.clock = max_requests, window, clock
        self._hits = {}                     # client -> (window_start, count)
        self._lock = threading.Lock()

    def check(self, client):
        """Return (allowed, retry_after_seconds)."""
        now = self.clock()
        with self._lock:
            if len(self._hits) > 10_000:    # forget clients whose window ended
                self._hits = {k: v for k, v in self._hits.items()
                              if now - v[0] < self.window}
            start, count = self._hits.get(client, (now, 0))
            if now - start >= self.window:
                start, count = now, 0
            if count >= self.max:
                return False, max(1, math.ceil(start + self.window - now))
            self._hits[client] = (start, count + 1)
            return True, 0
