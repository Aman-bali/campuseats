"""One error shape for every failure: type, title, status, detail."""
from flask import jsonify

BASE = "https://campuseats.example.com/problems/"


def problem(status, slug, title, detail, headers=None):
    body = {"type": BASE + slug, "title": title, "status": status, "detail": detail}
    resp = jsonify(body)
    resp.status_code = status
    resp.headers["Content-Type"] = "application/problem+json"
    for k, v in (headers or {}).items():
        resp.headers[k] = v
    return resp
