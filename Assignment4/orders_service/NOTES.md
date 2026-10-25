# CS543 · Assignment 4 — CampusEats **Orders** Service in REST

**Team:** Aman Bali (20251651015) · Bhupesh Kumar (20251651032)

**Service chosen:** Orders (not Payments). Outbound dependency: Payments (`POST /payments`, address from `PAYMENTS_URL`).

**Assumptions (stated openly):** the Assignment 2 contract and Tutorial 4 code were not in the files I could read, so I took the Orders names from our Assignment 3 report (`placeOrder`, `PaymentFailed`, `PaymentDeclined`, `GatewayTimeout`, `InvalidAmount`, `PaymentNotFound`) and assumed Tutorial 4's Payments accepts `POST /payments` with an `Idempotency-Key` and answers 201 / 422. `payments_stub.py` imitates it for the demo. Item prices are a snapshot sent by the client from the Catalogue; a production Orders service would verify them against Catalogue.

## How to run
```
pip install -r requirements.txt
python -m pytest -v                                   # tests
python -m openapi_spec_validator openapi.yaml         # contract check
PORT=5002 python payments_stub.py &                   # fake Payments
PAYMENTS_URL=http://localhost:5002 python app.py      # Orders on :5001
```
Evidence files: `validator_output.txt`, `pytest_output.txt`, `curl_transcript.txt`.

---
## Part A

### A2 · The SOAP-style operations
1. `placeOrder(studentId, items[], cardToken)` → `orderId` — fault `PaymentFailed`
2. `getOrder(orderId)` → `Order` — fault `OrderNotFound`
3. `listOrders(studentId, status)` → `Order[]`
4. `cancelOrder(orderId, reason)` → `confirmation` — faults `OrderNotFound`, `NotCancellable`

### A3 · The nouns
`placeOrder` creates an **order**; `getOrder` and `listOrders` read **orders**; `cancelOrder` creates a **cancellation** belonging to one order. Nouns: `orders`, `cancellation`. No verb survives in any URL.

### A4 · Resource table
| Method | URL | What it does | Success | Failure codes |
|---|---|---|---|---|
| POST | `/orders` | Place an order and charge Payments; honours `Idempotency-Key` | 201 + `Location` | 400 bad body, 422 payment declined / key reused with different body, 503 Payments unreachable |
| GET | `/orders?studentId=&status=` | Filtered list | 200 | 400 invalid `status` |
| GET | `/orders/{orderId}` | Read one order | 200 | 404 |
| POST | `/orders/{orderId}/cancellation` | Cancel (creates the sub-resource) | 201 + `Location` | 400, 404, 409 already cancelled |
| GET | `/orders/{orderId}/cancellation` | Read the cancellation record | 200 | 404 |

### A5 · The hard choice: `cancelOrder`
`cancelOrder` is a pure verb with no obvious noun, so it mapped least comfortably. I resolved it by treating the cancellation as a thing that comes into existence: `POST /orders/{id}/cancellation` creates a cancellation record and moves the order to `cancelled`. I rejected `DELETE /orders/{id}` because the order must stay readable for audit and refunds, and a DELETE implies it is gone. I rejected `PATCH /orders/{id}` with `status=cancelled` because it lets any client write any state and hides the state machine (and the 409 rule) in the client. I rejected `POST /orders/{id}/cancel` because it is just the SOAP verb moved into the URL.

### Fault mapping (every Assignment 3 fault appears as a status code)
| Assignment 3 / 2 error | REST status |
|---|---|
| `card_declined` → `PaymentDeclined` → `PaymentFailed` | **422** `payment-declined` |
| `gateway_unavailable`, SOAP timeout, unknown fault → `GatewayTimeout` | **503** `payments-unavailable` + `Retry-After` |
| `invalid_amount` → `InvalidAmount` | **400** (items validated before any charge, so total is always > 0) |
| `OrderNotFound` / `PaymentNotFound` | **404** |
| not cancellable | **409** |

REST lets us split what `PaymentFailed` lumped together: a decline (do not retry) is now 422, an outage (retry later) is 503.

---
## Part C/D design notes
- **Record vs representation (C2):** `models.Order` stores integer `seq`, `card_token`, `idempotency_key`, request fingerprint and `payment_txn_id`; `as_json()` publishes `ORD-0001`-style `id`, money as strings, and `links`, and omits all of the former.
- **One error shape (C6):** every failure goes through `errors.problem()` → `type, title, status, detail`, `application/problem+json` (including Flask's own 404/405/500).
- **Idempotency (C7):** `POST /orders` is the endpoint where a duplicate would charge a student twice. The key is stored on the order; a repeat with the same body returns the original (`Idempotent-Replay: true`) with no new charge; the same key with a different body is 422. The same key is forwarded to Payments on every retry.
- **Hardening (D2):** connect timeout 1 s, read timeout 3 s, up to 4 attempts, delay = random(0, min(2 s, 0.2·2ⁿ)) (exponential backoff, full jitter). Retried only on connection error, timeout, 502/503/504. Any 4xx is never retried (422 → decline, other 4xx → fail at once).

### D3 · Fallback: fail, do not degrade
If Payments is unreachable after retries, Orders returns **503 with `Retry-After` and stores nothing**. The alternative was to accept the order as "pending payment" and charge later, but that would let the canteen start cooking food that may never be paid for, and would leave the student holding an order whose state is unknown. Failing cleanly means the student is told nothing happened and can safely retry with the same `Idempotency-Key`. Known limit: if the process died after Payments captured but before the order was saved, the retry with the same key makes Payments return the original charge instead of billing again.

---
## Answers

**1. Line counts.** `partner.wsdl` = **131** lines; `openapi.yaml` = **307** lines. The OpenAPI file is *longer*, and the comparison is not like for like: the WSDL describes one operation (`charge`), while the OpenAPI file describes five endpoints. What fills the extra lines is things the WSDL never had to say: the failure responses for every operation (400/404/409/422/503), query and path parameters, the `Idempotency-Key` and `Retry-After` headers, and the `Problem` schema. Two things the WSDL declared that OpenAPI does not need: (a) the `message` / `portType` / `binding` layers with `soap:binding style="document"` and `soapAction` — HTTP's method and URL already say what is being done; (b) the `soap:header` `Credentials` element (apiKey, merchantId) — authentication moves to an HTTP `Authorization` header over TLS, not an element of the contract.

**2. A fault and its replacement.** From `soap-fault.xml`:
```xml
<faultcode>soap:Server</faultcode>
<faultstring>Charge could not be authorized</faultstring>
<sptypes:faultCode>card_declined</sptypes:faultCode>
<sptypes:faultReason>Issuing bank declined the transaction (insufficient funds)</sptypes:faultReason>
```
replaced by (`curl_transcript.txt`, step 7 pattern):
```
HTTP/1.1 422 UNPROCESSABLE ENTITY
Content-Type: application/problem+json

{"type":"https://campuseats.example.com/problems/payment-declined","title":"Payment declined","status":422,"detail":"Issuing bank declined the transaction (insufficient funds)"}
```
Returning an error inside a `200 OK` hides it from everything between client and server. Proxies, load balancers, CDNs and API gateways, monitoring and alerting, and retry middleware all decide by status code. They would count the failure as a success, might cache it, would never alert on it, and a client library would treat it as a good result. With a 4xx/5xx the network can do the right thing (don't retry a 422, retry a 503, raise an alarm on a spike).

**3. Publish / find / bind.** *Publish* still exists: `openapi.yaml` is the published contract (in the repo and the internal catalogue entry from Assignment 3). *Find* survives in a much smaller form: the address of Payments is looked up as configuration (`PAYMENTS_URL` / the catalogue entry), not by querying a UDDI registry at run time. *Bind* disappeared as a separate step: there is no per-service binding (`soapAction`, document/literal) to negotiate, because every service speaks the same HTTP uniform interface (method + URL + status code). The OpenAPI document, the service catalogue, and environment configuration took over the jobs of UDDI and the WSDL binding.

**4. Who enforces the schema now.** `validate()` in `app.py` (plus `validate_cancellation()`). Without it, a body such as `{"items":[{"itemId":"X","name":"Dosa","quantity":1,"unitPrice":"-60.00"}], ...}` would reach the charge call and send a **negative total** to Payments; a `quantity` of `"two"` would crash with a 500 instead of a clean 400.

**5. Where I'd still pick SOAP.** The edge to the external gateway (SecurePay), as in Assignment 3, not the Orders API itself. What I'd be buying is **message-level security (WS-Security)**: the credentials and the charge body are signed/encrypted as part of the message, so integrity and authenticity hold even if the message passes through an intermediary that terminates TLS, and the signed message can serve as audit evidence. REST over TLS only protects each hop. For the Orders API itself I see no such need, since Orders talks to its own callers over a single TLS hop, and its reliability needs (retry safety) are met by idempotency keys.
