# CampusEats — Assignment 5 Notes
### HTTP Methods & Headers on the Catalogue Service

**Team ID:** Group 12
**Team members:**

| Name | Roll No |
|---|---|
| Aman Bali | 20251651015 |
| Bhupesh Kumar | 20251651032 |

**Repository:** https://github.com/Aman-bali/campuseats
**Service folder:** `Assignment5/catalogue-service/` (source, `openapi.yaml`, `tests/`)
**Evidence:** `curl-transcript.txt` (live `curl -v` run), `pytest_output.txt` (24 passed), `validator_output.txt` (OpenAPI valid)

Run it: `pip install -r requirements.txt && python3 app.py` (port 5000) · tests: `python3 -m pytest tests -v` · regenerate transcript: `bash run_demo.sh`

---

## A1. Method map — action → method + URL

| Action | Method + URL | Success | Failures |
|---|---|---|---|
| Add a menu item to a restaurant | `POST /restaurants/{restaurantId}/menu-items` | `201` + `Location` + `ETag` | 400, 401, 404, 415, 422, 429 |
| Read one menu item | `GET /menu-items/{itemId}` | `200` (or `304`) | 404, 406 |
| Browse / search / paginate | `GET /menu-items?restaurantId=&category=&query=&available=&sort=&order=&limit=&offset=` | `200` + `X-Total-Count` | 400, 406 |
| Replace an item's details | `PUT /menu-items/{itemId}` | `200` + new `ETag` | 400, 401, 404, 412 |
| Set availability | `PATCH /menu-items/{itemId}/availability` | `200` | 400, 401, 404, 412, 422 |
| Remove an item | `DELETE /menu-items/{itemId}` | `204` | 401, 404, 409, 412 |
| Read a restaurant | `GET /restaurants/{restaurantId}` | `200` (or `304`) | 404 |
| Close a restaurant (action) | `POST /restaurants/{restaurantId}/close` | `200` | 401, 404 |
| Reopen a restaurant (action) | `POST /restaurants/{restaurantId}/reopen` | `200` | 401, 404 |
| Discover methods / CORS preflight | `OPTIONS` on any resource | `204` + `Allow` | 404 |
| Nested alias of an item | `GET /restaurants/{rid}/menu-items/{itemId}` | `301` + `Location` | 404 |

**Audit result (A1).** Every verb matches its action; no verb leaked into a URL (`close`/`reopen` are action
*sub-resources* under `POST`, per A2 — there is no `/closeRestaurant`). Changes made to the Assignment 4 design:

| Change | Why |
|---|---|
| `DELETE` `200 + body` → `204` | Assignment B2: `204` on delete; nothing useful to return once the item is gone. |
| `PATCH …/availability` to the value it already has: `409` → `200` (no change) | A `409` on a repeat makes a retry look like a failure. Setting an absolute value is now genuinely idempotent. `409` is kept for *delete-while-available*. |
| Added `PUT /menu-items/{id}` | Assignment C2 needs an update endpoint to attach `If-Match` to. `PUT` never touches `isAvailable` (A4 decision A5: availability is operational state with its own rules), so a body containing it is a `400`. |
| Added `POST …/close` and `…/reopen` | The non-CRUD actions (A2). Closing switches every item off. |
| Added `GET /restaurants/{id}`, `OPTIONS`, the `301` alias | Restaurant read for `ETag`/`304`; `OPTIONS` for A5; the alias gives Question 8 a real `3xx`. |

## A2. Non-CRUD actions
`close` and `reopen` are not plain create/read/update/delete, so they are `POST /restaurants/{id}/close` and
`POST /restaurants/{id}/reopen` (compare `POST /orders/42/cancel`). `setAvailability` from A4 stays a `PATCH`
on the `/availability` sub-resource because it sets one absolute value (a property update), not an event.

## A3. Safe & idempotent

| Endpoint | Safe (changes nothing)? | Idempotent (repeat = same effect)? | Retry-safe on its own? |
|---|---|---|---|
| `GET /menu-items`, `GET /menu-items/{id}`, `GET /restaurants/{id}` | ✅ | ✅ | ✅ yes |
| `OPTIONS` (any) | ✅ | ✅ | ✅ yes |
| `PUT /menu-items/{id}` | ❌ | ✅ (same body twice → same state and same ETag) | ✅ yes |
| `PATCH …/availability` | ❌ | ✅ (absolute value, not a toggle) | ✅ yes |
| `DELETE /menu-items/{id}` | ❌ | ✅ (end state identical; 2nd call answers `404`, which a client treats as "already gone") | ✅ yes |
| `POST …/close`, `…/reopen` | ❌ | ✅ *in effect here* (same end state), but `POST` gives generic clients no such promise | ⚠️ by our implementation only |
| **`POST /restaurants/{id}/menu-items`** | ❌ | ❌ | ❌ **no** → needs `Idempotency-Key` |

No `GET` changes state: `test_get_never_changes_state` calls the list twice and asserts identical results and an unchanged item count.

## A4. Reads take query params
`GET /menu-items` filters (`restaurantId`, `category`, `available`, `query`), sorts (`sort=name|price|createdAt`, `order=asc|desc`)
and paginates (`limit` 1–100, `offset`) purely through the query string. Bad values are `400`. The response carries
`X-Total-Count` and `Link: <…>; rel="next"/"prev"`. See `curl-transcript.txt` step 15.

## A5. OPTIONS + Allow, and method override
`OPTIONS /menu-items/{id}` returns `204` with `Allow: DELETE, GET, HEAD, OPTIONS, PUT` (transcript step 11).
The list is built from the routes that really exist on that path, so it cannot drift from the code.
For a constrained client, `POST` + `X-HTTP-Method-Override: PUT|PATCH|DELETE` is honoured as a **documented fallback only**
(only on `POST`, still requires the bearer token, and the response is tagged `X-Method-Overridden`) — transcript step 17.

## A6. One full exchange (from `curl -v`, transcript step 1)

**Request**
```
[request line]   POST /restaurants/rest-001/menu-items HTTP/1.1
[headers]        Host: 127.0.0.1:5000
                 User-Agent: curl/8.5.0
                 Accept: */*
                 Authorization: Bearer demo-token
                 Content-Type: application/json
                 Idempotency-Key: demo-key-1
                 Content-Length: 118
[blank line]
[body]           {"name":"Masala Dosa","description":"Crispy rice-and-lentil crepe with potato filling.","price":80,"category":"mains"}
```
The HTTP version on the request line is **HTTP/1.1**.

**Response**
```
[status line]    HTTP/1.1 201 CREATED
[headers]        Server: Werkzeug/3.1.7 Python/3.12.3
                 Date: Sun, 20 Sep 2026 08:55:39 GMT
                 Content-Type: application/json
                 Content-Length: 271
                 ETag: "17c78e471c4ead19"
                 Location: http://127.0.0.1:5000/menu-items/ITEM-2642a3c2
                 Access-Control-Allow-Origin: *
                 Access-Control-Expose-Headers: ETag, Location, Retry-After, X-Total-Count, Link, Idempotent-Replayed, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
                 X-Content-Type-Options: nosniff
                 Strict-Transport-Security: max-age=31536000; includeSubDomains
                 X-RateLimit-Limit: 100
                 X-RateLimit-Remaining: 99
                 X-RateLimit-Reset: 60
                 Cache-Control: no-store
                 Connection: close
[blank line]
[body]           {"category":"mains","createdAt":"2026-09-20T08:55:39+00:00","description":"Crispy rice-and-lentil crepe with potato filling.","isAvailable":true,"itemId":"ITEM-2642a3c2","name":"Masala Dosa","price":80.0,"restaurantId":"rest-001","updatedAt":"2026-09-20T08:55:39+00:00"}
```

---

## B. Headers implemented (where to see each)

| Req | What the service does | Proof |
|---|---|---|
| B1 | Every success body is `Content-Type: application/json`. `Accept` is honoured (`*/*`, `application/json`, or absent are fine); `Accept: text/html` → `406`. A non-JSON request body → `415`. Large JSON is gzip-encoded (`Content-Encoding: gzip`, `Vary: Accept-Encoding`) when the client sends `Accept-Encoding: gzip`. | steps 13, 14, 15 |
| B2 | `201`+`Location`; `200` read; `204` delete; `400` malformed; `404` missing; `409` conflict; `422` domain refusal. | steps 1, 8, 9, 16, 20 |
| B3 | All write endpoints need `Authorization: Bearer <token>`; missing/empty/non-Bearer → `401` + `WWW-Authenticate: Bearer realm="campuseats"`. Reads are public. Header handling only. | step 10 |
| B4 | Single-item GET: `ETag` + `Cache-Control: public, max-age=30`. The ETag is a hash of the representation *and* an internal version counter, so it changes exactly when the resource changes. | steps 3, 5, 7 |
| B5 | `X-RateLimit-Limit` / `-Remaining` / `-Reset` on every response; over budget → `429` + `Retry-After`. The budget is per client (a hash of the bearer token, else the client IP), not global. | step 21 |
| B6 | `Access-Control-Allow-Origin` on every response, `Access-Control-Expose-Headers` so a page can read `ETag`/`Location`/`Retry-After`, and `OPTIONS` preflight answered with `Allow-Methods`, `Allow-Headers`, `Max-Age`. | step 12 |
| B7 | `X-Content-Type-Options: nosniff` and `Strict-Transport-Security` on every response. `Date` and `Server: Werkzeug/3.1.7 Python/3.12.3` are added by the framework's server. HSTS is only honoured by browsers over HTTPS; production must terminate TLS in front of the service (the local demo is plain HTTP). | every step |

## C. Caching & safe retries

- **C1 — conditional GET → 304** (step 4): `If-None-Match: "17c78e471c4ead19"` → `304 Not Modified`, empty body, `ETag` and `Cache-Control` repeated.
- **C2 — conditional write → 412** (steps 5–6): `PUT` with `If-Match` matching → `200` and a new ETag `"92d1c0cf8a21cdb3"`; a second editor still holding `"17c78e471c4ead19"` → `412`, and the price stays 90. `If-Match` is also honoured on `PATCH …/availability` and `DELETE`. (It is optional so plain clients still work; making it mandatory would use `428 Precondition Required`.)
- **C3 — idempotency key** (steps 1–2b): the same `Idempotency-Key: demo-key-1` returns the *original* `201`, same `itemId`, same `Location`, with `Idempotent-Replayed: true`, even though the second body was different; the list still holds one item. Keys are scoped per restaurant. **Where a duplicate does real damage:** `POST` create. A retry after a lost response would list the dish twice — students see duplicate menu entries, the two copies get different `itemId`s so carts/orders can reference either, and a later `PATCH` on one copy leaves the other still orderable (e.g. the sold-out dish keeps being sold).

### C4. Safe-retry plan

| Risky endpoint | Mechanism | Why (from the safe × idempotent split in A3) |
|---|---|---|
| `POST /restaurants/{id}/menu-items` | **Idempotency-Key** | Neither safe nor idempotent — the only endpoint where a blind retry changes the outcome (duplicate item). The key makes the *server* de-duplicate. |
| `PUT /menu-items/{id}` | **If-Match** | Idempotent, so retrying is harmless; the risk is a *lost update* from a concurrent editor. The ETag makes stale writes fail (`412`). |
| `PATCH …/availability` | If-Match (optional); retry freely | Idempotent by construction (absolute value). If-Match only protects against overriding someone else's newer decision. |
| `DELETE /menu-items/{id}` | If-Match (optional); retry freely | Idempotent in effect; a retry after success gets `404`, meaning "already gone". If-Match stops deleting an item someone just changed. |
| `GET /menu-items/{id}`, `GET /restaurants/{id}` | **If-None-Match** | Safe — nothing to protect. The conditional request saves bandwidth (`304`), not correctness. |
| `POST …/close`, `…/reopen` | none needed here | `POST`, so not guaranteed idempotent by the protocol; our implementation converges to the same state, so a retry is harmless. Add an `Idempotency-Key` if it ever triggers side-effects (e.g. notifications). |
| Any request, on `429` | wait `Retry-After` seconds, then retry | The request was not processed. |

## D2. Headers table (each endpoint × request headers × response headers)

**Response headers set on *every* response:** `Date`, `Server`, `Content-Type`, `Content-Length`, `Access-Control-Allow-Origin`, `Access-Control-Expose-Headers`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (not on `OPTIONS`). Errors use `Content-Type: application/problem+json`. Any `4xx` also gets `Cache-Control: no-store`; a `429` adds `Retry-After`.

| Endpoint | Request headers it needs | Response headers it sets (beyond the common set) |
|---|---|---|
| `POST /restaurants/{id}/menu-items` | `Authorization`, `Content-Type: application/json`, `Idempotency-Key` (recommended), `Accept` (optional) | `Location`, `ETag`, `Cache-Control: no-store`, `Idempotent-Replayed` (replay only), `WWW-Authenticate` (on 401) |
| `GET /menu-items` | `Accept` (optional), `Accept-Encoding: gzip` (optional) | `Cache-Control: public, max-age=10`, `X-Total-Count`, `Link`, `Content-Encoding: gzip` + `Vary: Accept-Encoding` (large bodies) |
| `GET /menu-items/{id}` | `If-None-Match` (optional), `Accept` (optional) | `ETag`, `Cache-Control: public, max-age=30`; on `304` only these two, no body |
| `PUT /menu-items/{id}` | `Authorization`, `Content-Type`, `If-Match` (recommended) | `ETag` (new), `Cache-Control: no-store`; on `412` the current `ETag` |
| `PATCH /menu-items/{id}/availability` | `Authorization`, `Content-Type`, `If-Match` (optional) | `ETag`, `Cache-Control: no-store` |
| `DELETE /menu-items/{id}` | `Authorization`, `If-Match` (optional) | `Cache-Control: no-store` (empty `204`) |
| `GET /restaurants/{id}` | `If-None-Match` (optional) | `ETag`, `Cache-Control: public, max-age=30` |
| `POST /restaurants/{id}/close`, `/reopen` | `Authorization` | `ETag`, `Cache-Control: no-store` |
| `GET /restaurants/{id}/menu-items/{itemId}` | — | `Location` (canonical URL), `Cache-Control: public, max-age=86400` (`301`) |
| `OPTIONS` (any) | preflight: `Origin`, `Access-Control-Request-Method`, `Access-Control-Request-Headers` | `Allow`; preflight adds `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age` |
| any `POST` used as a fallback | `X-HTTP-Method-Override` | `X-Method-Overridden` |

---

## Answers

### 1. Method, success status, and the one response header that matters most — three endpoints

| Endpoint | Method | Success | Header that matters most — and why |
|---|---|---|---|
| Add a menu item | `POST` | `201 Created` | **`Location`** — it is the only place the client learns the URL (and `itemId`) of the thing just created; without it the client would have to search the list to find its own item. |
| Read one item | `GET` | `200 OK` | **`ETag`** — it is the validator behind `304` (saves the download on re-reads) and behind `If-Match` (stops one editor overwriting another). Everything in Part C hangs on it. |
| Browse / search | `GET` | `200 OK` | **`X-Total-Count`** (with `Link`) — the body is only one page; the total tells the client how many pages exist and whether to fetch more. |

### 2. Safe, idempotent — and the one that is neither
Safe: `GET` (item, list, restaurant), `HEAD`, `OPTIONS`. Idempotent: all of those plus `PUT`, `PATCH …/availability`
and `DELETE` (table in A3). **`POST /restaurants/{id}/menu-items` is neither** — repeating it creates another
item. I made it retry-safe with the `Idempotency-Key` header: the server remembers the result under
`(restaurantId, key)`; the same key again returns the original `201` (same `itemId`, same `Location`, plus
`Idempotent-Replayed: true`) and does no second insert. The lookup runs twice — before and after the (slow) Payments
call, under a lock — so two *concurrent* twins also produce one item.
`test_idempotency_key_replays_original_without_duplicate` and transcript steps 1–2b show it.

### 3. ETag, 304, 412
ETag from the service: **`"17c78e471c4ead19"`** for `ITEM-2642a3c2`.

- **304** — request: `GET /menu-items/ITEM-2642a3c2` with `If-None-Match: "17c78e471c4ead19"` → `304 Not Modified`, no body.
  *Saves:* the response body and the client re-parsing/re-rendering it; a cache can keep using its copy after `max-age` expires. (Transcript step 4.)
- **412** — Editor A read the item (ETag `"17c78e471c4ead19"`) and saved a new price of 90 → ETag became `"92d1c0cf8a21cdb3"`. Editor B, still holding the old tag, sent
  `PUT /menu-items/ITEM-2642a3c2` with `If-Match: "17c78e471c4ead19"` and `{"name":"Masala Dosa","price":50}` → `412 Precondition Failed`.
  *Prevents:* the **lost update** — B silently overwriting A's price of 90 with a value based on stale data. After the `412` the price is still 90. (Steps 5–6.)

### 4. 422 vs 400 — exact requests
- **400** — `POST /restaurants/rest-001/menu-items` with body `{"name":"Free Tea","price":-5}` → `400`, `"price must be greater than zero"` (step 8). Invalid JSON (`{not json`) is also `400`.
- **422** — `PATCH /menu-items/ITEM-8e2cea76/availability` with body `{"isAvailable":true}`, where `ITEM-8e2cea76` was created while Payments was down (so it is unverified) → `422`, "the restaurant failed the Payments health check" (step 20).

**Difference.** `400` means the *message itself* is wrong — bad JSON, missing field, a value that breaks the schema. It can never succeed, whatever the server's state, and the client must fix the request. `422` means the message is perfectly well-formed and valid on its own, but the server's **business rules refuse it in the current situation** — the same request could succeed later (after Payments recovers). (`409` is the neighbour: the request conflicts with the resource's current state, e.g. delete while still available.)

### 5. Blocked in the browser, but the server logged 200
**The browser blocked it**, not the server. The server did receive and process the request and returned `200`, but the browser enforces the same-origin policy: because the response carried no permission for that page's origin, the browser refuses to hand the response to the page's JavaScript and reports a CORS error. The fix is on the response: **`Access-Control-Allow-Origin`** (the caller's origin, or `*` for a public read API). For "non-simple" requests (JSON `Content-Type` with `Authorization`, `PUT`, `DELETE`…), the browser first sends an `OPTIONS` preflight that must be answered with `Access-Control-Allow-Methods` and `-Headers`. Add `Access-Control-Expose-Headers` if the page needs to read `ETag`/`Location`. Note CORS protects the *reader*, not the server: the request already ran.

### 6. Cache-Control: one that allows caching, one that must be `no-store`
- **Allow caching:** `GET /menu-items/{id}` → `public, max-age=30`. Menu data is identical for every caller, changing rarely, and 30 s of staleness is harmless; after that the client revalidates cheaply with `If-None-Match` (`304`).
- **`no-store`:** every write response (`POST` create, `PUT`, `PATCH`, `DELETE`) and every error (`401`, `404`, `429`…). A write result is a one-off outcome, not a reusable representation; and a cached error does harm — a stored `404` would hide an item created a moment later, a stored `429` would keep telling the client to back off after the window ended, a stored `401` would keep rejecting a client that has since logged in. (For any endpoint returning per-user or payment data in the other services, `no-store` is the rule for the same reason.)

### 7. When is POST the right choice for search?
When the query does not fit safely in a URL: (a) very large or structured criteria — hundreds of `itemId`s, nested filters — that hit URL length limits (servers and proxies commonly cap URLs at a few KB); (b) sensitive search terms that should not end up in access logs, browser history and `Referer` headers, since a URL is logged everywhere and a body usually is not.
**What we give up:** `GET`'s guarantees are visible to every intermediary. Caches will not store `POST` responses by default (no `max-age`, no `ETag`/`304`), clients and proxies will not auto-retry it because they cannot assume it is safe, results are not bookmarkable or linkable, and tooling treats it as a write. Mitigate by naming it clearly (`POST /menu-items/search` returning `200`, not `201`), documenting that it is a read, and keeping `GET` for the common simple queries. (An IETF-proposed `QUERY` method aims to give body-carrying searches safe-method semantics, but it is not something to rely on yet.)

### 8. `Location` on a 201 and on a 3xx
- **On `201 Created`**, `Location` points to the **newly created resource** — the URL where the thing that the `POST` just made now lives: `http://127.0.0.1:5000/menu-items/ITEM-2642a3c2` (step 1).
- **On a `3xx`**, `Location` points to **where the client should go next to get the thing it asked for** — the redirect target, i.e. another URL for a resource that already existed: `GET /restaurants/rest-001/menu-items/ITEM-57dbf90a` → `301` with `Location: http://127.0.0.1:5000/menu-items/ITEM-57dbf90a` (step 18). The client re-issues the request there.
In one line: a `201` says "here is what you made", a `3xx` says "what you asked for is over there".

---

## Known limits (honest notes)
- State is in memory and per process: idempotency keys, ETags' version counters and rate-limit windows reset on restart and are not shared across several instances; production would move them to a shared store (e.g. Redis/DB).
- Rate limiting is a fixed window keyed by the token hash (or IP). Since any non-empty token is accepted (B3 is header handling only), a client could dodge its budget by rotating tokens — real auth would fix that.
- Errors are `application/problem+json` (RFC 9457 style, as in Assignment 4); every *success* body is `application/json`.
- The gzip'd and plain forms of a response share one ETag (strictly a strong validator should differ per encoding); harmless for this service, noted for completeness.
