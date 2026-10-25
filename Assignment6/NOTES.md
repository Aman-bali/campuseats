# CS543 · Assignment 6 — Honest responses: status codes, errors & validation

**Team:** Group 12 — Aman Bali (20251651015) · Bhupesh Kumar (20251651032)
**Repository:** https://github.com/Aman-bali/campuseats
**Service:** Orders (`Assignment6/orders_service/`, Flask) — the Assignment 4 service, hardened. Outbound dependency: Payments (`PAYMENTS_URL`).
**Evidence:** `transcript.txt` (live `curl -i` run, 32 responses), `pytest_output.txt` (43 passed), `validator_output.txt` (OpenAPI valid), `openapi.yaml`.

```
pip install -r orders_service/requirements.txt
cd orders_service
python -m pytest tests -q                         # 43 tests
python -m openapi_spec_validator openapi.yaml     # contract check
bash run_demo.sh                                  # starts stubs + services, rewrites ../transcript.txt
```

**Where the code lives (so the marker can find each requirement):**
`errors.py` (B1/B2 — `ProblemError`, `problem()`, type catalogue) · `validation.py` (C1/C2/B3) · `negotiation.py` (C3/C4 — Accept parsing, XML, the single place a body is written) · `ratelimit.py` (A4 429) · `availability.py` (`item-unavailable`) · `app.py` (pipeline + handlers).

---

## Answers to the 7 submission questions

### 1. Status map

| Endpoint | Success | Failures | One-line reason |
|---|---|---|---|
| `POST /orders` | **201** + `Location: /orders/{id}` (also 201 on an idempotent replay, with `Idempotent-Replay: true`) | 400 | body is not parseable JSON |
| | | 415 | body not sent as `application/json` |
| | | 422 `empty-cart` | `items` is `[]` |
| | | 422 `validation-failed` | a field is missing/wrong (all listed in `errors`) |
| | | 422 `item-unavailable` | an item is sold out; nothing charged |
| | | 422 `payment-declined` | Payments refused the card |
| | | 422 `idempotency-key-reused` | same key, different body |
| | | 406 / 429 | cannot produce the `Accept` type / too many requests |
| | | 503 | Payments unreachable after retries; nothing stored |
| | | 500 | unexpected fault (clean body, details only in the log) |
| `GET /orders` | **200** (`{"items":[…],"count":n}`, possibly empty) | 422 | bad `?status=` value |
| | | 406 / 429 / 500 | as above |
| `GET /orders/{id}` | **200** | 404 `order-not-found` | no such order |
| | | 406 / 429 / 500 | as above |
| `PATCH /orders`, `PATCH /orders/{id}` | — not supported | **405** + `Allow` | we expose no partial update; state changes go through the cancellation sub-resource |
| `DELETE /orders`, `DELETE /orders/{id}` | — not supported | **405** + `Allow` | orders are never deleted; they stay readable for audit/refunds |
| `POST /orders/{id}/cancellation` | **201** + `Location: /orders/{id}/cancellation` | 404 `order-not-found` | no such order |
| | | 422 `validation-failed` | `reason` missing/empty/>200 chars |
| | | 409 `illegal-transition` | order is already `cancelled` |
| | | 400 / 415 / 406 / 429 / 500 | as above |
| `GET /orders/{id}/cancellation` | **200** | 404 `order-not-found` / `cancellation-not-found` | no such order / order not cancelled |

*Design note:* the Assignment 4 design deliberately has no `PATCH`/`DELETE` on orders (cancel = `POST …/cancellation`). I kept that and made the unsupported verbs answer an honest **405 + `Allow`** instead of inventing endpoints just to fill the table.

**A2 audit — "no 200 for a failure".** I read every handler: none returned `200` with `{"ok": false}`. What the audit *did* find, and fixed:

| Before | Problem | Now |
|---|---|---|
| validation failure → `400` with one joined string | status family wrong (the JSON was understood), only a string, no per-field data | `422` + `errors[]` |
| body without `Content-Type: application/json` → silently parsed as `None` → misleading "invalid body" `400` | blames the content, not the media type | `415 unsupported-media-type` |
| unparseable JSON mixed in with field errors | different failure, same code | `400 malformed-json` |
| `409 order-not-cancellable` | not the catalogued name | `409 illegal-transition` |
| `?status=bogus` → `400` string | validation, not syntax | `422` + `errors[]` |
| `GET …/cancellation` on a missing order said "no cancellation" | wrong resource named | `404 order-not-found` |
| `unitPrice: "Infinity"` passed validation → would crash the total (a 500 from bad input) | validator hole | rejected as a 422 (must be finite and > 0) |
| 503 `detail` contained the raw Payments error text | leaked internals | generic text (see Q6) |

### 2. Type catalogue (stable strings)

Full URI = `https://campuseats.example.com/problems/` + slug. The slug→status/title pairs live in **one** dict (`errors.CATALOGUE`); a handler cannot attach the wrong status to a type. `openapi.yaml` lists the same 16 slugs (cross-checked against the dict).

| Slug | Status | Triggered when |
|---|---|---|
| `empty-cart` | 422 | `POST /orders` with `items: []` |
| `item-unavailable` | 422 | an `itemId` in the order is sold out (checked before any charge) |
| `payment-declined` | 422 | Payments answered 422 (card refused) |
| `order-not-found` | 404 | `GET/POST` on an order id that does not exist |
| `illegal-transition` | 409 | cancelling an order whose status is not `paid` |
| `validation-failed` | 422 | any other field-level failure (body, `?status=`, cancellation `reason`) |
| `idempotency-key-reused` | 422 | `Idempotency-Key` seen before with a different body |
| `cancellation-not-found` | 404 | `GET …/cancellation` on an order that was not cancelled |
| `malformed-json` | 400 | body is not parseable JSON |
| `unsupported-media-type` | 415 | `Content-Type` is not `application/json` |
| `not-acceptable` | 406 | `Accept` names nothing we can produce |
| `not-found` | 404 | unknown URL |
| `method-not-allowed` | 405 | verb not supported on that URL (`Allow` header set) |
| `rate-limited` | 429 | more than the allowed requests in the window (`Retry-After` set) |
| `payments-unavailable` | 503 | Payments unreachable/timing out after retries (`Retry-After` set) |
| `internal-error` | 500 | anything unexpected |

### 3. A sample Problem Details body, fields labelled

Real response (`transcript.txt`, D2.5) — `POST /orders/ORD-0001/cancellation` a second time:

```
HTTP/1.1 409 CONFLICT
Content-Type: application/problem+json; charset=utf-8

{
  "type":   "https://campuseats.example.com/problems/illegal-transition",
  "title":  "Illegal state transition",
  "status": 409,
  "detail": "Order ORD-0001 is cancelled; only a paid order can be cancelled (cancelled -> cancelled is not allowed)."
}
```

| Field | Meaning | Rule |
|---|---|---|
| `type` | stable identifier of the *kind* of failure; clients `switch` on this | never changes once published |
| `title` | short human summary of the type | same text for every occurrence of the type |
| `status` | the HTTP status again, for clients that only see the body | always equals the status line |
| `detail` | explanation of *this* occurrence | may change; never contains stack traces, SQL, hosts or config names |
| `errors` *(422 only)* | list of `{field, message}` | see Q4 |

The same body is produced as `application/problem+xml` (namespace `urn:ietf:params:xml:ns:problem`) when the client asks for XML.

### 4. A field-level `422` reporting two bad fields at once

Real response (`transcript.txt`, D2.3): `address` missing **and** `items[0].quantity` = −2 in the same request:

```
HTTP/1.1 422 UNPROCESSABLE ENTITY
Content-Type: application/problem+json; charset=utf-8

{
  "type": "https://campuseats.example.com/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "2 fields failed validation; see 'errors'.",
  "errors": [
    {"field": "address",           "message": "is required"},
    {"field": "items[0].quantity", "message": "must be an integer between 1 and 20"}
  ]
}
```

The validator never stops at the first problem and never touches the store or Payments (`test_c2_validate_before_acting` checks `payments.calls == 0`). When the problem is an empty `items` array the `type` is `empty-cart`, and `errors` still lists *every* bad field.

### 5. Retry-safe endpoints and the headers involved

Rule: **retry only transient failures — `429`, `503`, network error/timeout — wait the `Retry-After` seconds, and never resend a `4xx` unchanged** (400/404/405/406/409/415/422 will fail identically; fix the request first).

| Endpoint | Safe to retry? | Notes |
|---|---|---|
| `GET /orders`, `GET /orders/{id}`, `GET …/cancellation` | **Yes**, always | read-only |
| `POST /orders` | **Only with the same `Idempotency-Key` and the same body** | a repeat returns the original order (`201` + `Idempotent-Replay: true`) with no second charge; the same key is forwarded to Payments on each of our own retries. Without a key a retry could charge twice → do not retry |
| `POST …/cancellation` | **Yes** in effect | a repeat after success is `409 illegal-transition`, never a second cancellation — treat 409 as "already done" |
| `PATCH`/`DELETE` | n/a | always `405`; retrying never helps |

| Header | Sent on | Value |
|---|---|---|
| `Retry-After` | `429 rate-limited` | whole seconds until the current window ends (60 in the demo) |
| `Retry-After` | `503 payments-unavailable` | `5` |
| `Location` | `201` on create / cancel | URL of the new resource |
| `Idempotent-Replay: true` | replayed `201` | tells the client no new work was done |
| `Allow` | `405` | methods that *are* supported |

`429` is decided before any handler work, so a rate-limited request never creates or charges anything.

### 6. Internal-error mapping — what is hidden

Layers: (1) `PaymentsClient` catches every `requests` failure and raises `PaymentsUnavailable`; (2) `create_order` wraps the charge in try/except and maps the three outcomes; (3) a global `errorhandler(Exception)` catches whatever is left. In every case the full detail goes to the server log (`logging`, with traceback) and the client gets a fixed message.

| What went wrong | Logged server-side | Client sees |
|---|---|---|
| Payments refused/unreachable/timed out (`ConnectionError`, `Timeout`, 502/503/504, `PAYMENTS_URL` not set, upstream 4xx) | e.g. `WARNING payments unavailable for ORD-0007: Payments unreachable after 4 attempts (ConnectionError)` | `503 payments-unavailable`: "…temporarily unavailable. The order was not placed and you were not charged." — **hidden:** host/port, env-var name, attempt count, exception class |
| Unexpected exception anywhere (e.g. Payments returned an HTML page → `JSONDecodeError`; `KeyError`; a DB error if a database is added later) | `ERROR unhandled error ref=3d2ab512 POST /orders` + full stack trace | `500 internal-error`: "An unexpected error occurred. Quote reference 3d2ab512 …" — **hidden:** exception text, stack trace, file paths, SQL/DB messages. The `ref` lets us find the log entry |
| Werkzeug's own 404/405/413 HTML pages | — | the same problem shape (`not-found`, `method-not-allowed`, generic) |
| Payments' decline text | — | only its `detail` string is forwarded (a business reason the student needs); nothing else from the upstream body |

Never in any response: `cardToken`, the idempotency key, the Payments transaction id, the internal sequence number (already true from Assignment 4's record/representation split). Tests: `test_b4_unexpected_exception_is_hidden_but_logged`, `test_a4_503_has_retry_after_and_stores_nothing`; live: `transcript.txt` D2.15 shows the clean 500 and the log lines that kept the detail.

### 7. JSON vs XML for the same order, and the `Accept` header

```
$ curl -i http://localhost:5001/orders/ORD-0001                           # no Accept → JSON (default; abbreviated)
Content-Type: application/json; charset=utf-8
{"id":"ORD-0001","studentId":"S-20251651015","address":"Hostel B, Room 214","items":[{"itemId":"ITM-17","name":"Masala Dosa","quantity":2,"unitPrice":"60.00"},…],"total":"145.00","currency":"INR","status":"cancelled",…}

$ curl -i -H 'Accept: application/xml' http://localhost:5001/orders/ORD-0001
Content-Type: application/xml; charset=utf-8
<?xml version="1.0" encoding="UTF-8"?>
<order><id>ORD-0001</id><studentId>S-20251651015</studentId><address>Hostel B, Room 214</address><items><item><itemId>ITM-17</itemId><name>Masala Dosa</name><quantity>2</quantity><unitPrice>60.00</unitPrice></item>…</items><total>145.00</total><currency>INR</currency><status>cancelled</status>…</order>

$ curl -i -H 'Accept: text/html' http://localhost:5001/orders/ORD-0001
HTTP/1.1 406 NOT ACCEPTABLE
Content-Type: application/problem+json; charset=utf-8
```

Rules implemented (`negotiation.choose_format`): no header or `*/*` or `application/json` → JSON; `application/xml` → XML; q-values are honoured (`xml;q=0.9, json;q=0.5` → XML); anything we cannot produce → **406**. The 406 itself is always `problem+json` (we can't honour the client's wish, so we fall back to the one error format). Errors follow the same negotiation: `Accept: application/xml` on a missing order gives `404` as `application/problem+xml`. Every response carries `Vary: Accept` because the body depends on it. XML is generated by ElementTree, so `&`, `<` in an address are escaped (`test_c3_xml_when_asked_and_well_formed`).

---

## Part-by-part checklist

| Item | Where it is satisfied |
|---|---|
| A1 map every outcome | Q1 table |
| A2 fix wrong responses | Q1 audit table; no handler can return `200 {"ok": false}` — failures are only produced by `raise ProblemError` |
| A3 `201` + `Location` | `create_order`; `test_a3_create_is_201_with_location_pointing_at_the_order` (and the Location is followed with a GET) |
| A4 `Retry-After` + retry-safety | Q5; `ratelimit.py`; transcript D2.6 / D2.14 |
| B1 one shape via one helper | `ProblemError` → `problem()`; `test_b1_every_failure_has_one_shape_and_content_type` hits 8 different failures |
| B2 type catalogue | Q2; `errors.CATALOGUE` |
| B3 field-level 422 | Q4; `validation.py` |
| B4 don't leak internals | Q6 |
| C1 describe the body | `validation.validate_order` + `OrderRequest` in `openapi.yaml`: `items` non-empty (≤50); each `quantity` integer 1–20; `address` required (≤200); `studentId`, `cardToken` (`tok_…`), `itemId`, `name`, `unitPrice` (finite decimal string > 0) |
| C2 validate, then act | order in `create_order`: parse (415/400) → validate all (422) → replay check → availability → charge → store |
| C3 negotiation | Q7 |
| C4 label every body | all bodies built by `negotiation.respond()`; `after_request` adds a charset to anything else; `test_c4_every_response_has_charset` checks 9 response kinds |
| D1–D3 | `transcript.txt` sections D1, D2.1–D2.15, D3.1–D3.6 |
| D4 no regressions | below |

**D4 regressions (all still hold):** idempotent repeat → same order, `Idempotent-Replay: true`, Payments stub logged **one** charge per key (transcript D4.1–D4.2); key reuse with a new body → 422; outage → 4 attempts with backoff → 503 in under 2 s (backoff is random; 0.5 s in the last run), nothing stored (D4.3, D4.5); a hanging Payments (3 s read timeout × 4 attempts) → 503 after ~13 s instead of hanging (D4.4); Assignment 4's 8 tests still pass beside the 35 new ones.

---

## Assumptions and honest limits

- **"Cart".** There is no cart resource; the order body carries `items`, so `empty-cart` means `items: []`.
- **`address` is new.** Assignment 6 C1 requires it, so `POST /orders` now needs `address` (≤200 chars) and the order representation echoes it. This is a contract change from Assignment 4.
- **Item availability** needs a menu source. Orders owns none, so `availability.py` reads sold-out ids from `UNAVAILABLE_ITEMS` (demo uses `ITM-99`); the real version calls Catalogue (Assignment 5) with the same timeout/retry rules as Payments. Unit prices are still a client snapshot, as noted in Assignment 4.
- **400 vs 422.** 400 = the bytes are not JSON; 422 = the JSON was understood but its content is unacceptable. `item-unavailable` and `payment-declined` are 422 as well (well-formed request, domain refuses).
- **Rate limiter** is in-process, fixed-window, per client IP (`remote_addr`); behind a proxy it would need the forwarded address, and with several instances a shared store. Configurable with `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` (default 60 per 60 s). The demo runs a separate instance with limit 3 so the earlier curl steps are not blocked.
- **Order ids can skip numbers** (e.g. `ORD-0002` is missing in the transcript): the id is reserved before the Payments call and not reused if the charge fails — behaviour carried over from Assignment 4.
- **A replay returns the order's current representation**, so if the order was cancelled in between, the replay shows `cancelled`. It still does no new work.
- Everything runs against local stubs (`payments_stub.py`); `STUB_FAIL`, `STUB_SLEEP`, `STUB_GARBAGE` exist only to drive the 503 / timeout / 500 demos.
