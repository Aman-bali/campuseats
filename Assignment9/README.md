# CampusEats — CS543 Web Services: Assignment 09
## Securing the API: JWT Authentication & Role-Based Access Control (RBAC)

**Course:** CS543 · Web Services  
**Instructor:** Dr. Pramit Mazumdar (IIIT Vadodara)  
**Team ID:** 12  
**Team Members:**  
1. **Aman Bali** (Roll: `20251651015`)  
2. **Bhupesh Kumar** (Roll: `20251651032`)  

**Companion Documents:**
- [`docs/SECURITY_OVERVIEW.md`](../docs/SECURITY_OVERVIEW.md) &mdash; Threat modeling, cryptographic controls, and rate-limiting defense.
- [`docs/API_TESTING.md`](../docs/API_TESTING.md) &mdash; Detailed test matrix and live curl transcripts.

---

## 1. Executive Summary & Architecture Overview

Assignment 09 hardens the RESTful Menu / Catalogue Service (previously implemented in Assignment 08) by introducing industry-standard **JSON Web Token (JWT) Authentication** and a **Two-Guard Role-Based Access Control (RBAC)** architecture using Node.js and Express.

### Storage Architecture Note
In strict accordance with CS543 coursework progression, persistent databases are introduced in subsequent lectures. Assignment 09 utilizes structured **in-memory demonstration stores** ([`Assignment9/data/users.js`](data/users.js) and [`Assignment9/data/items.js`](data/items.js)), pre-seeded with baseline catalogue items and bcrypt-hashed demonstration user credentials.

### Guard Pipeline Architecture

Every incoming HTTP request travels through two sequential middleware guards:

```
                      Incoming Request
                             │
                             ▼
              ┌─────────────────────────────┐
              │      auth Middleware        │ ──[ Missing / Invalid / Expired Token ]──► 401 Unauthorized
              └─────────────────────────────┘
                             │
                             ▼ (Valid Bearer Token; req.user populated)
              ┌─────────────────────────────┐
              │   requireRole Middleware    │ ──[ Role Not in Allowed List ]──────────► 403 Forbidden
              └─────────────────────────────┘
                             │
                             ▼ (Role Authorized)
              ┌─────────────────────────────┐
              │      Route Controller       │ ──► 200 OK / 201 Created
              └─────────────────────────────┘
```

1. **Guard 1 (`auth` middleware):**
   - Validates that the client supplied an `Authorization: Bearer <token>` header.
   - Enforces cryptographic verification using `jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })`.
   - Validates required identity claims (`id`, `email`, `role`).
   - On missing, malformed, expired, or tampered tokens, immediately returns **HTTP 401 Unauthorized**.
   - On success, attaches decoded payload `{ id, email, role, exp }` to `req.user` and calls `next()`.

2. **Guard 2 (`requireRole(...allowedRoles)` middleware factory):**
   - Inspects `req.user.role` attached strictly by Guard 1 (never from `req.body` or headers).
   - If the user's role is not in the allowed list (e.g., `customer` attempting to access a write endpoint), immediately aborts and returns **HTTP 403 Forbidden**.
   - If the role matches (`restaurant` or `admin`), delegates to the route handler.

3. **Demonstration Users & Password Security:**
   - Seeded in the database with passwords hashed using `bcryptjs` (salt cost factor 10).
   - Plain-text passwords are never persisted.
   - Login password verification strictly employs `bcrypt.compareSync(password, user.passwordHash)`.
   - Rate limiting is enforced on `POST /login` (max 10 attempts per minute per client IP) to block automated brute-force attacks.

---

## 2. Answers to Assignment 09 Submission Questions

### Question 1: Which route(s) require only authentication, and which also require a role?

| Endpoint | HTTP Method | Guard Stack | Requirement | Permitted Roles | Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/login` | `POST` | *Public (Rate-Limited)* | Valid credentials | Anyone | Verifies bcrypt hash, returns signed JWT |
| `/items` | `GET` | `auth` | Authentication Only | Any valid user (`customer`, `restaurant`, `admin`) | Returns array of catalogue items (200 OK) |
| `/items/:id` | `GET` | `auth` | Authentication Only | Any valid user (`customer`, `restaurant`, `admin`) | Returns single menu item by ID (200 OK) |
| `/items` | `POST` | `auth` + `requireRole('restaurant', 'admin')` | Authentication **AND** Role | `restaurant`, `admin` | Creates new menu item in catalogue (201 Created). A `customer` role receives **403 Forbidden**. |

**Rationale:**  
Viewing the campus menu catalogue (`GET /items`, `GET /items/:id`) is a read-only operation available to all authenticated campus members. Conversely, modifying the menu catalogue (`POST /items`) is a privileged write operation reserved strictly for canteen vendors and platform administrators; unprivileged consumers (`customer`) are forbidden from altering prices or menu listings.

---

### Question 2: Show one 401 and one 403 from your demonstration with explanations.

#### 1. HTTP 401 Unauthorized Example (Missing or Invalid Authentication)
* **Trigger:** An unauthenticated client attempts to query `GET /items` without providing an `Authorization` header.
* **HTTP Request:**
  ```http
  GET /items HTTP/1.1
  Host: localhost:3000
  ```
* **HTTP Response:**
  ```http
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8

  {
    "error": "Unauthorized",
    "message": "Authorization header missing. Expected format: Bearer <token>"
  }
  ```
* **Explanation:**  
  The `auth` guard executed first. Because the request omitted credentials, the server cannot establish the caller's identity (Who are you?). Per RFC 9110 §15.5.2, the server returns `401 Unauthorized` indicating that authentication credentials must be supplied.

#### 2. HTTP 403 Forbidden Example (Authenticated, but Unauthorized Role)
* **Trigger:** A student logs in as `customer@campuseats.com`, receives a valid JWT with `role: "customer"`, and attempts to add a new dish via `POST /items`.
* **HTTP Request:**
  ```http
  POST /items HTTP/1.1
  Host: localhost:3000
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: application/json

  {
    "name": "Unauthorized Student Special",
    "price": 99.00,
    "category": "Snacks"
  }
  ```
* **HTTP Response:**
  ```http
  HTTP/1.1 403 Forbidden
  Content-Type: application/json; charset=utf-8

  {
    "error": "Forbidden",
    "message": "Forbidden: role 'customer' is not authorized to perform this action. Required role(s): [restaurant, admin]"
  }
  ```
* **Explanation:**  
  Here, the caller's identity was successfully authenticated by `auth` (they are genuinely `customer@campuseats.com`). However, when the request reached the second guard `requireRole('restaurant', 'admin')`, the server checked `req.user.role`. Because `customer` lacks the administrative authority required to create catalogue items, the server returns `403 Forbidden`. Unlike 401, re-authenticating with the same credentials will not grant access because the role itself lacks sufficient privileges.

---

### Question 3: What is inside the JWT payload? Why is it safe to trust the role claim, and why must the secret stay out of code?

#### A. Anatomy of the JWT Payload
A JSON Web Token consists of three base64url-encoded components separated by dots: `Header.Payload.Signature`.  
In CampusEats Assignment 09, our JWT payload carries:

```json
{
  "id": "user_cust_001",
  "email": "customer@campuseats.com",
  "role": "customer",
  "iat": 1793964300,
  "exp": 1793967900
}
```
* `id`: Unique user identifier in the backend store.
* `email`: User's registered email address.
* `role`: RBAC authorization claim (`customer`, `restaurant`, or `admin`).
* `iat`: Issued At Unix timestamp.
* `exp`: Expiration Unix timestamp (configured for 1 hour).

#### B. Why is it safe to trust the `role` claim?
Although the JWT payload is merely Base64-encoded and readable by any client, **it cannot be modified without invalidating the cryptographic signature**.  
The signature is generated as:
$$\text{Signature} = \text{HMAC-SHA256}(\text{Base64Url}(\text{Header}) + "." + \text{Base64Url}(\text{Payload}), \text{JWT\_SECRET})$$
When a client sends a token in `Authorization: Bearer <token>`, `jwt.verify()` recomputes the signature using the server's private secret and compares it with the token's signature. If an attacker attempts to elevate their privileges by changing `"role": "customer"` to `"role": "admin"`, the recomputed signature will not match, `jwt.verify()` throws a `JsonWebTokenError`, and the request is immediately rejected with HTTP 401. Therefore, the role claim is cryptographically untamperable.

#### C. Why must the secret stay out of code?
1. **Source Code Exposure:** Code stored in version control systems (e.g., GitHub, GitLab) is accessible to team members, CI/CD pipelines, and potentially the public if a repository is open-sourced or leaked.
2. **Total Security Compromise:** If an attacker discovers the secret key, they can forge arbitrary tokens with any user ID and elevate their role to `admin`, completely bypassing all authentication and authorization controls without needing valid credentials.
3. **Environment Separation:** Storing secrets in environment variables (`process.env.JWT_SECRET`) loaded from `.env` (which is excluded from Git via `.gitignore`) allows different environments (Development, Staging, Production) to utilize unique, high-entropy secrets without code modifications.

---

## 3. Seeded Demonstration Credentials

| User Type | Email | Password | Password Storage | Role Claim |
| :--- | :--- | :--- | :--- | :--- |
| **Customer** | `customer@campuseats.com` | `customer123` | `$2b$10$...` (`bcryptjs` hash) | `customer` |
| **Restaurant** | `restaurant@campuseats.com` | `restaurant123` | `$2b$10$...` (`bcryptjs` hash) | `restaurant` |
| **Administrator** | `admin@campuseats.com` | `admin123` | `$2b$10$...` (`bcryptjs` hash) | `admin` |

---

## 4. Setup, Run & Verification Commands

### Prerequisites
- Node.js (v18+)
- npm

### 1. Install Dependencies
```bash
cd Assignment9
npm install
```

### 2. Configure Environment
A `.env` file is loaded by `dotenv`. A template `.env.example` is provided:
```ini
PORT=3000
JWT_SECRET=
```
*(In your local `.env`, set a strong 256-bit secret. The server halts if `JWT_SECRET` is missing).*

### 3. Run the Automated Test Suite (46 Tests)
```bash
npm test
```
*Executes all 5 mandatory demonstration scenarios plus 11 security edge cases (malformed headers, forged signatures, negative prices, missing fields, expired tokens, rate limiting, and startup validation).*

### 4. Start the Standalone Server & Security Console
```bash
npm start
```
The server will bind to `http://localhost:3000`. Open this URL in any browser to access the **CampusEats Security Console**, complete with quick-login role cards, real-time JWT inspector, dedicated test cards, and a live HTTP wire inspector.

### 5. Generate Evidence & Live Curl Transcripts
```bash
npm run evidence
```
Captures full-page browser screenshots and saves the execution log to `Assignment9/evidence/curl_transcript.txt`.

---

## 5. Summary of 5 Mandatory Demonstration Cases

| Case | Scenario | Command / Action | Expected Result | Verified Result |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Unauthorized Access | `GET /items` without token | `401 Unauthorized` | **PASSED (401)** |
| **2** | Customer Login | `POST /login` (`customer@campuseats.com`) | `200 OK` + signed JWT (`role: customer`) | **PASSED (200)** |
| **3** | Authenticated Read | `GET /items` with Customer Bearer token | `200 OK` + 4 catalogue items | **PASSED (200)** |
| **4** | Forbidden Role Write | `POST /items` with Customer Bearer token | `403 Forbidden` (`role customer not authorized`) | **PASSED (403)** |
| **5** | Authorized Role Write | `POST /items` with Restaurant Bearer token | `201 Created` + new item record | **PASSED (201)** |

---

*CampusEats CS543 Web Services · Assignment 09 · Team 12 (Aman Bali & Bhupesh Kumar)*
