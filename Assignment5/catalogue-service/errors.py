"""
One error shape for the whole service (Assignment 4 / C6).

Every failure — validation, not-found, conflict, or domain refusal —
is rendered by the same problem() helper into an RFC-7807-flavoured
body: {type, title, status, detail}. No endpoint is allowed to invent
its own error JSON.
"""
from __future__ import annotations


class ApiError(Exception):
    """Base class for every error the API can raise on purpose."""
    status = 500
    type_ = "about:blank"
    title = "Internal Server Error"

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class ValidationError(ApiError):
    status = 400
    type_ = "https://campuseats.dev/errors/validation-error"
    title = "Malformed request body"


class NotFoundError(ApiError):
    status = 404
    type_ = "https://campuseats.dev/errors/not-found"
    title = "Resource not found"


class ConflictError(ApiError):
    status = 409
    type_ = "https://campuseats.dev/errors/conflict"
    title = "Request conflicts with current state"


class UnprocessableError(ApiError):
    status = 422
    type_ = "https://campuseats.dev/errors/unprocessable"
    title = "Request understood but refused by domain rules"


def problem(error: ApiError) -> tuple[dict, int]:
    """Render any ApiError into the single shared problem+json body."""
    body = {
        "type": error.type_,
        "title": error.title,
        "status": error.status,
        "detail": error.detail,
    }
    return body, error.status
