"""One error shape for every failure (Part B).

    {"type": ..., "title": ..., "status": ..., "detail": ..., ["errors": [...]]}
    Content-Type: application/problem+json; charset=utf-8

Handlers never build an error body themselves. They `raise ProblemError(slug,
detail)`; one Flask error handler turns it into a response via problem().
The CATALOGUE below is the single source of truth for slug -> (status, title),
so a type string can never drift away from its status code.
"""
from negotiation import respond

BASE = "https://campuseats.example.com/problems/"

# slug: (status, title)
CATALOGUE = {
    # --- B2: the five domain types required by the assignment --------------
    "empty-cart":             (422, "Cart is empty"),
    "item-unavailable":       (422, "Item unavailable"),
    "payment-declined":       (422, "Payment declined"),
    "order-not-found":        (404, "Order not found"),
    "illegal-transition":     (409, "Illegal state transition"),
    # --- supporting types (still stable, still documented) -----------------
    "validation-failed":      (422, "Validation failed"),
    "idempotency-key-reused": (422, "Idempotency key reused"),
    "cancellation-not-found": (404, "Cancellation not found"),
    "malformed-json":         (400, "Malformed JSON"),
    "unsupported-media-type": (415, "Unsupported media type"),
    "not-acceptable":         (406, "Not acceptable"),
    "not-found":              (404, "Not found"),
    "method-not-allowed":     (405, "Method not allowed"),
    "rate-limited":           (429, "Too many requests"),
    "payments-unavailable":   (503, "Payments unavailable"),
    "internal-error":         (500, "Internal error"),
}

XML_CHILD_TAGS = {"errors": "error"}


class ProblemError(Exception):
    """Raise this from any handler to fail with a catalogued problem."""

    def __init__(self, slug, detail, *, headers=None, errors=None):
        super().__init__(detail)
        if slug not in CATALOGUE:
            raise KeyError(f"unknown problem type {slug!r} - add it to CATALOGUE")
        self.slug, self.detail = slug, detail
        self.headers, self.errors = headers, errors


def render_problem(status, slug, title, detail, headers=None, errors=None):
    """Low-level renderer; also used for HTTP errors outside the catalogue."""
    body = {"type": BASE + slug, "title": title, "status": status, "detail": detail}
    if errors:
        body["errors"] = errors
    return respond(body, status, root="problem", child_tags=XML_CHILD_TAGS,
                   headers=headers, problem=True)


def problem(slug, detail, headers=None, errors=None):
    """The one helper every failure goes through."""
    status, title = CATALOGUE[slug]
    return render_problem(status, slug, title, detail, headers, errors)
