"""Hardened outbound call to the Payments service (Part D)."""
import os
import random
import time

import requests

RETRYABLE_STATUS = {502, 503, 504}


class PaymentDeclined(Exception):
    def __init__(self, detail):
        super().__init__(detail)
        self.detail = detail


class PaymentsUnavailable(Exception):
    pass


class PaymentsClient:
    def __init__(self, base_url=None, attempts=4, base_delay=0.2, max_delay=2.0,
                 timeout=(1.0, 3.0), sleep=time.sleep, session=None):
        # D1: address comes from the environment, never hard-coded.
        self.base_url = base_url or os.environ.get("PAYMENTS_URL")
        self.attempts = attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.timeout = timeout          # (connect, read) seconds
        self.sleep = sleep
        self.session = session or requests.Session()

    def _backoff(self, attempt):
        # exponential backoff with full jitter
        cap = min(self.max_delay, self.base_delay * (2 ** attempt))
        return random.uniform(0, cap)

    def charge(self, order_ref, amount, currency, card_token, idempotency_key):
        if not self.base_url:
            raise PaymentsUnavailable("PAYMENTS_URL is not configured")
        url = self.base_url.rstrip("/") + "/payments"
        payload = {"orderRef": order_ref, "amount": str(amount),
                   "currency": currency, "cardToken": card_token}
        # The key is the same on every attempt, so a retried create can
        # never charge the student twice.
        headers = {"Idempotency-Key": idempotency_key}
        last = "no attempt made"
        for attempt in range(self.attempts):
            try:
                r = self.session.post(url, json=payload, headers=headers,
                                      timeout=self.timeout)
            except (requests.ConnectionError, requests.Timeout) as exc:
                last = f"{type(exc).__name__}"
            else:
                if r.status_code in (200, 201):
                    return r.json()
                if r.status_code == 422:
                    raise PaymentDeclined(_detail(r))
                if 400 <= r.status_code < 500:
                    # A 4xx is our fault; retrying cannot help. Never retried.
                    raise PaymentsUnavailable(
                        f"Payments rejected the request with {r.status_code}")
                if r.status_code in RETRYABLE_STATUS:
                    last = f"HTTP {r.status_code}"
                else:
                    raise PaymentsUnavailable(f"unexpected HTTP {r.status_code}")
            if attempt < self.attempts - 1:
                self.sleep(self._backoff(attempt))
        raise PaymentsUnavailable(
            f"Payments unreachable after {self.attempts} attempts ({last})")


def _detail(r):
    try:
        return r.json().get("detail", "Payment declined")
    except ValueError:
        return "Payment declined"
