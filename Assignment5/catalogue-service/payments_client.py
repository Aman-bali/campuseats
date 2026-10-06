"""
Outbound call to the Payments service (Assignment 4 / D1, D2).

Why Catalogue calls Payments at all: before a new menu item goes live,
Catalogue asks Payments whether the payment pipeline is healthy. There
is no point letting students browse an item they will never be able to
pay for. This reuses the already-built Payments service from Tutorial 4
as a lightweight readiness probe rather than inventing a new
merchant-onboarding contract that Assignment 2 never defined.

Hardening applied:
  - a hard timeout per attempt (CONNECT_TIMEOUT / READ_TIMEOUT)
  - retry with exponential backoff + full jitter, capped at MAX_RETRIES
  - only *safe* failures are retried: connection errors, timeouts, and
    5xx responses. A 4xx is a final answer and is never retried.
  - this call is a GET (no side effects), so it needs no idempotency
    key of its own — that requirement only bites the retried *create*
    call in app.py, which does carry one (Idempotency-Key header).
"""
from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass

import requests

PAYMENTS_SERVICE_URL = os.environ.get(
    "PAYMENTS_SERVICE_URL", "http://localhost:5001"
)

CONNECT_TIMEOUT = 1.0     # seconds
READ_TIMEOUT = 2.0        # seconds
MAX_RETRIES = 3
BASE_BACKOFF = 0.2        # seconds


@dataclass
class PaymentsHealthResult:
    healthy: bool
    reason: str            # "ok" | "unreachable" | "unhealthy" | "client_error"


def _sleep_with_jitter(attempt: int) -> None:
    # Exponential backoff with full jitter: sleep in [0, base * 2**attempt)
    ceiling = BASE_BACKOFF * (2 ** attempt)
    time.sleep(random.uniform(0, ceiling))


def check_payments_health() -> PaymentsHealthResult:
    """
    Calls GET {PAYMENTS_SERVICE_URL}/health.
    Retries connection errors / timeouts / 5xx up to MAX_RETRIES times.
    Never retries a 4xx — that is a definitive, non-transient answer.
    """
    url = f"{PAYMENTS_SERVICE_URL}/health"

    last_reason = "unreachable"
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.get(
                url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT)
            )
        except (requests.ConnectionError, requests.Timeout):
            last_reason = "unreachable"
            if attempt < MAX_RETRIES:
                _sleep_with_jitter(attempt)
                continue
            return PaymentsHealthResult(healthy=False, reason=last_reason)

        if response.status_code >= 500:
            last_reason = "unhealthy"
            if attempt < MAX_RETRIES:
                _sleep_with_jitter(attempt)
                continue
            return PaymentsHealthResult(healthy=False, reason=last_reason)

        if response.status_code >= 400:
            # A 4xx from a health endpoint is a final, non-transient
            # answer (e.g. misconfigured client) - do not retry it.
            return PaymentsHealthResult(healthy=False, reason="client_error")

        return PaymentsHealthResult(healthy=True, reason="ok")

    return PaymentsHealthResult(healthy=False, reason=last_reason)
