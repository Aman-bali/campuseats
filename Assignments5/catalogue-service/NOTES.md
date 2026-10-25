# CampusEats — Assignment 4 Notes
### Rebuilding the Catalogue Service in REST

**Team:** Aman Bali (20251651015), Bhupesh Karir (20251651032)
**Repository:** https://github.com/Aman-bali/campuseats
**Service folder:** `catalogue-service/` (sibling to `tutorial4/`)

---

## Part A — Modelling the service

### A1. Service chosen
**Catalogue Service** — not Payments (done in Tutorial 4). Boundary and data ownership are
taken as-is from Assignment 2: Catalogue owns `Restaurants`, `Categories`, `FoodItems`, and
is responsible for *Browse & Search Catalogue* and *Manage Menu*. Nothing about that
boundary is redesigned here — only the wire protocol changes.

### A2. Operations as they would have been written in SOAP
(See `assignment3-reference/CatalogueService.wsdl` for the full contract these are drawn from.)

1. `addMenuItem(restaurantRef, name, description, price, category)`
2. `getMenu(restaurantRef)`
3. `setAvailability(itemRef, isAvailable)`
4. `removeMenuItem(itemRef)`
5. `searchFoodItems(query, category?)`

### A3. Finding the nouns
| Verb-shaped operation | Durable thing it creates/changes | Noun |
|---|---|---|
| `addMenuItem` | a listing for sale | **menu item** |
| `getMenu` / `searchFoodItems` | (read-only — no state change) | **menu items** (collection) |
| `setAvailability` | whether a menu item can currently be ordered | **availability** (a property of a menu item) |
| `removeMenuItem` | the listing stops existing | **menu item** (deleted) |

No `add`, `set`, `get` or `search` verb survives into a URL — the resource is always
`menu-items`, optionally scoped under a restaurant, optionally with an `/availability`
sub-resource.

### A4. Resource table

| Method | URL | What it does | Success | Failure codes |
|---|---|---|---|---|
| `POST` | `/restaurants/{restaurantId}/menu-items` | Create a new menu item for sale under a restaurant | `201 Created` (+ `Location`) | `400` |
| `GET` | `/menu-items/{itemId}` | Read a single menu item | `200 OK` | `404` |
| `GET` | `/menu-items?restaurantId=&category=&query=&available=` | Browse / search the catalogue with filters | `200 OK` | `400` |
| `PATCH` | `/menu-items/{itemId}/availability` | **Sub-resource.** Flip whether the item can currently be ordered | `200 OK` | `400`, `404`, `409`, `422` |
| `DELETE` | `/menu-items/{itemId}` | Remove a menu item (only once it is already unavailable) | `200 OK` | `404`, `409` |

Five rows, four required shapes (create / read-one / filtered-list / state-changing
sub-resource) all present, and `/menu-items/{itemId}/availability` is the sub-resource.

### A5. The hard choice — `setAvailability`
`setAvailability` mapped least comfortably onto a resource. The tempting shortcut was to
fold `isAvailable` into a general `PATCH /menu-items/{itemId}` alongside name, price and
description — one endpoint, less code. We rejected that: availability is not a descriptive
field a restaurant edits occasionally, it is an **operational state** that changes far more
often (sold out mid-lunch-rush, restaurant closes early) and carries its own conflict rules —
our domain refuses to reopen an item whose restaurant just failed a payments health check
(`422`), and refuses a no-op flip (`409`). Bundling that logic into a catch-all item-update
endpoint would force every caller who just wants to rename an item to also reason about
availability conflicts. Modelling `/availability` as its own sub-resource keeps the
state-machine's rules in one small place and keeps the plain item-edit path (not required by
this assignment, but the natural next endpoint) free of them.

---

## Part B — Publishing the contract

`openapi.yaml` is written before any handler code, with `info`, `servers`, five `paths`, and
every request/response shape declared once under `components.schemas` and referenced with
`$ref` (`MenuItemCreateRequest`, `AvailabilityUpdateRequest`, `MenuItem`, `DeleteResult`,
`Problem`). Every operation documents at least its happy path plus every failure code it can
actually return — nothing is left as "happy path only". The Assignment 3 WSDL's two faults on
`addMenuItem`/`setAvailability`/`removeMenuItem` (`Unauthorized`, `InvalidItemData`) both
appear here as status codes (`401` scope is out of this assignment's four required endpoints;
`InvalidItemData` → `400`).

**Validation:** run through `openapi-spec-validator` — see `validator_output.txt`:
```
openapi.yaml: OK
openapi.yaml: OK - 0 errors, 0 warnings
```

---

## Part C — Implementation

Layout follows the Tutorial 4 shape:
```
catalogue-service/
  app.py            # Flask routes, error handling, wiring
  models.py         # MenuItem record + as_json() representation
  store.py          # in-process dict store (private — no other service imports this)
  errors.py         # ApiError hierarchy + single problem() renderer
  validation.py     # hand-written validate_* functions
  payments_client.py# hardened outbound call to Payments
  openapi.yaml
  tests/test_catalogue.py
```

**Record vs. representation (C2):** `MenuItem` stores `id` (full uuid4 hex),
`price_cents` (integer), `merchant_verified` (bool), and an `idempotency_keys` ledger.
`as_json()` returns `itemId` (a shortened, prefixed reference derived from `id`), `price`
(a decimal rupee amount derived from `price_cents`), and never exposes
`merchant_verified` or `idempotency_keys` at all. Confirmed by
`test_create_returns_201_with_location_header`, which asserts `id`,
`merchant_verified` and `idempotency_keys` are absent from the response body.

**Idempotency (C7):** `POST /restaurants/{id}/menu-items` is the endpoint we chose to make
safely retryable — a duplicated create is the one failure mode here that does real damage
(a restaurant's menu silently doubling up, students seeing the same dish twice). An
`Idempotency-Key` header is stored against the created record; a repeat with the same key
(even with a *different* body — see the curl transcript, step 2) returns the original 201
response unchanged rather than creating a second item.

**Tests (C8):** `pytest_output.txt`
```
tests/test_catalogue.py::test_create_returns_201_with_location_header PASSED
tests/test_catalogue.py::test_idempotent_repeat_returns_original PASSED
tests/test_catalogue.py::test_malformed_body_returns_400 PASSED
tests/test_catalogue.py::test_unknown_id_returns_404 PASSED
4 passed
```

---

## Part D — Surviving the network

**D1/D2 — the call and its hardening:** before a new menu item goes live, Catalogue calls
`GET {PAYMENTS_SERVICE_URL}/health` on the Payments service from Tutorial 4 (address read
from the `PAYMENTS_SERVICE_URL` environment variable, never hard-coded — see
`payments_client.py`). The call carries a 1s connect / 2s read timeout, and retries up to
three times with exponential backoff and full jitter (`sleep(uniform(0, base * 2**attempt))`).
Only connection errors, timeouts, and `5xx` are retried; a `4xx` is treated as a final,
non-transient answer and is never retried. This GET has no side effects, so it needs no
idempotency key of its own — the requirement that *"any retried create must carry an
idempotency key"* is satisfied one level up, by the `Idempotency-Key` header on the actual
`POST /menu-items` create call it guards.

**D3 — the fallback, and why:** when Payments cannot be reached after retries, Catalogue does
**not** fail the create. It still creates the item, but forces `isAvailable: false` and marks
it internally unverified — demonstrated live in the curl transcript's final block, where
Payments is killed and the subsequent create still returns `201` with `isAvailable: false`.
We chose to degrade rather than fail because catalogue population and checkout-readiness are
two different concerns on two different clocks: a restaurant builds out its menu long before
it goes live for ordering, so a five-minute Payments blip should never stop a restaurant
manager from typing in tomorrow's specials. Failing the whole create would re-introduce
exactly the coupling Assignment 2's own validation table flagged as a risk (Catalogue's
"Partial — note 1" loose-coupling score, caused by another synchronous dependency,
`checkItemAvailability`) — we are not willing to add a second one. Failing would have been
the wrong call here specifically *because* the item is created invisible to shoppers
(`isAvailable: false`); if instead a broken Payments pipeline meant an *order* could go
through with no way to actually charge for it, failing outright would be correct — the
stakes, not the pattern, decide the answer.

---

## Answers

### 1. Line counts
- `assignment3-reference/CatalogueService.wsdl`: **239 lines**
- `openapi.yaml`: **272 lines**

The difference is not really about verbosity — it is about what each format has to spell
out by hand versus what it gets from convention. The OpenAPI file is longer despite covering
fewer operations (5 SOAP operations vs. 5 REST endpoints, roughly at parity) because YAML's
indentation-heavy `components.schemas` + `$ref` style adds line count per field that WSDL's
denser XML Schema packs more tightly, and because OpenAPI requires every response — including
every failure — to carry its own documented `content`/`schema` block per status code, whereas
WSDL just points every fault at one shared `<message>`. Two things the WSDL had to declare
that OpenAPI does not need:
1. **The `binding` section** — WSDL has to say, in the contract itself, that this is SOAP 1.1
   over HTTP, `document` style, with an explicit `soapAction` per operation. OpenAPI's
   `servers` + HTTP method on the path *is* the binding; there is no separate transport layer
   to describe.
2. **A `message` indirection layer** between `types` and `portType`.  WSDL cannot point a
   `portType` operation straight at an XML Schema element — it has to wrap every element in a
   named `<message>` first, even when that message has exactly one part. OpenAPI lets a path's
   `requestBody`/`responses` reference a schema directly via `$ref`, with no equivalent
   indirection.

### 2. A soap:Fault, and why status-code-inside-200 is a problem
From the Assignment 3 WSDL's `addMenuItem` / `setAvailability` / `removeMenuItem` operations,
the fault carries:
```xml
<ManageMenuFaultDetail>
  <faultCode>InvalidItemData</faultCode>
  <faultReason>...</faultReason>
</ManageMenuFaultDetail>
```
as a `soap:Fault`, which SOAP 1.1 over HTTP conventionally carries with an HTTP `500`.

In the REST rebuild the same failure is `POST /restaurants/{id}/menu-items` returning:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://campuseats.dev/errors/validation-error",
  "title": "Malformed request body",
  "status": 400,
  "detail": "`price` must be greater than zero."
}
```
Returning an error like this inside a `200 OK` — a pattern some SOAP/RPC stacks fall back to
when the transport-level fault mapping is inconvenient — is a problem for everything sitting
between client and server that is not the application itself: a load balancer's health check,
a CDN's cache layer, a proxy's retry policy, and browser/`fetch` error handling all key off
the HTTP status line, not the body. A `200` tells every one of those intermediaries "this
succeeded" and they will happily cache it, retry a different request thinking this one worked,
or report a healthy backend — while the actual caller has to open the body and parse
application-specific JSON just to discover it failed. Putting the real status in the status
line (`400`, `404`, `409`, `422`) lets the network do useful, protocol-level things with the
response without understanding CampusEats' JSON at all.

### 3. UDDI's publish / find / bind
- **Publish** still exists, but informally: instead of registering with a UDDI registry,
  `openapi.yaml` is committed straight into the service's own repository folder, which is
  itself "published" the moment it is pushed — the contract lives next to the code it
  describes rather than in a separate registry server.
- **Find** still exists, but in modern form, as described in the earlier SOAP-partner
  integration assignment: a catalogue/registry entry (an internal API portal, a service mesh's
  service directory, or in the simplest case a `README`/wiki link) tells another CampusEats
  team where `openapi.yaml` lives and what base URL to call. No UDDI server runs for this.
- **Bind disappeared** as a distinct step. In SOAP/UDDI, "bind" is meaningfully separate from
  "find" because a tModel could, in principle, point at several interchangeable bindings for
  the same abstract portType. In REST, the OpenAPI `servers` entry *is* the endpoint — finding
  the contract and knowing how to call it are the same act. There is no separate
  binding-resolution step because there is no abstract portType/binding split to resolve; the
  path + method + host, once you have the file, is the whole address.

### 4. What now does the XML Schema's job, and what would slip through without it
The specific function is `validate_create_menu_item()` in `validation.py` (and its sibling
`validate_availability_update()` for the sub-resource). It is called as the very first line of
`create_menu_item()` in `app.py`, before any field of the body is touched.

One failure that would get through without it: **a negative or zero price.** JSON has no
built-in way to say "this number must be `> 0`" the way an XML Schema `<xsd:restriction
base="xsd:decimal"><xsd:minExclusive value="0"/>` can enforce it before the document is even
considered well-formed. Without the explicit `if price <= 0: raise ValidationError(...)` check,
Flask's `request.get_json()` would happily hand back `{"price": -5, ...}` as a perfectly valid
Python dict, and nothing downstream — not Python's dynamic typing, not the JSON parser, not
Flask's routing — would stop a restaurant from listing a menu item at −₹5.

### 5. Where SOAP still wins
The one edge we would still build in SOAP, not REST, is exactly the one we integrated in the
earlier SOAP-partner assignment: **the external payment gateway call itself** (CampusEats'
Payment Service → SecurePay's `charge` operation), not anything inside CampusEats' own service
mesh. The specific guarantee being bought is **a machine-checked, versioned contract for a
financial state transition that both sides can validate before a single byte of a real charge
is sent** — an XML Schema `<xsd:restriction>` on `amount` and `currency`, a WSDL `fault` that
must structurally match `ChargeFaultDetail` and cannot be silently reshaped by either party
without breaking schema validation, and message-level (not just transport-level) security on
the credentials header, which matters if the message is ever relayed through an intermediary
rather than staying on one TLS hop. REST/OpenAPI can describe the same shapes, but nothing
enforces them at the wire level the way `soap:Fault` and WS-Security do; for a reversible
`GET /menu-items` that is a fair trade for REST's simplicity, but for an irreversible charge
against a real card, we would pay the WSDL/SOAP verbosity tax again. Answering "nowhere" would
require arguing that JSON-Schema-at-runtime plus TLS-only security is *always* an acceptable
substitute for a compile-time-checkable, transport-independent contract on money movement —
that is a much harder position to defend than naming the one place the stronger guarantee is
worth its cost.
