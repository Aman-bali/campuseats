# CampusEats — Assignment 8: Build One CampusEats Service as a REST API

> **Quick Start (One-Line):**
> ```bash
> npm install && npm start
> ```
> *Then open [http://localhost:3000](http://localhost:3000) in your browser.*

---

## 1. Team & Submission Metadata

- **Course:** CS543 · Web Services · Assignment 8 of 12
- **Instructor:** Dr. Pramit Mazumdar (`pramit.mazumdar@iiitvadodara.ac.in`)
- **Institution:** Indian Institute of Information Technology Vadodara (IIITV)
- **Team ID:** 12
- **Team Members:**
  1. **Aman Bali** — Student ID / Roll No: `20251651015`
  2. **Bhupesh Kumar** — Student ID / Roll No: `20251651032`
- **GitHub Repository:** [https://github.com/Aman-bali/campuseats/tree/main/Assignment8](https://github.com/Aman-bali/campuseats/tree/main/Assignment8)
- **Google Drive Demonstration Evidence Link:** [https://drive.google.com/drive/folders/1bAyAUmro1hKsEnA3JFv8uMdGFDdAJpoE?usp=drive_link](https://drive.google.com/drive/folders/1bAyAUmro1hKsEnA3JFv8uMdGFDdAJpoE?usp=drive_link)

---

## 2. Answers to Assignment Questions

### Q1. Which CampusEats service did you pick, and what are its routes (method + path)?

**Selected CampusEats Service:**  
We selected the **Menu / Catalogue Service** (`Item` entity representing a canteen menu item / dish).

In the CampusEats microservice architecture, the Catalogue service is the authoritative source for food items, pricing, and live kitchen availability across campus canteens.

#### Implemented REST Routes Table:

| HTTP Method | Route Path | Purpose / Description | Expected Status Code |
| :--- | :--- | :--- | :--- |
| **`GET`** | `/items` | **List all menu items:** Returns the entire in-memory collection of catalogue items as a JSON array. | `200 OK` |
| **`GET`** | `/items/:id` | **Fetch one item by ID:** Reads the requested `id` from the URL parameter and returns the corresponding single menu item JSON object. If absent or invalid, returns a 404 error object. | `200 OK` (found)<br>`404 Not Found` (absent) |
| **`POST`** | `/items` | **Create a new menu item:** Accepts a JSON payload (`name`, `price`, `available`, `category`), validates all required fields, assigns a unique server-generated ID, appends the record to the in-memory array, and returns the newly created item. | `201 Created` (success)<br>`422 Unprocessable Content` (invalid) |

---

### Q2. Which status codes did you return, and for which outcomes (200 / 201 / 404 / 422)?

We returned standard RFC HTTP status codes strictly tailored to each outcome:

1. **`200 OK`**
   - **`GET /items`**: Returned when the catalogue list is successfully retrieved and returned to the caller.
   - **`GET /items/:id`**: Returned when a menu item matching the requested `id` exists in the in-memory store and is successfully returned.

2. **`201 Created`**
   - **`POST /items`**: Returned when a valid JSON payload is submitted, passes all server validations, is assigned a unique server-side `id`, and is successfully appended to the in-memory catalogue. The response body contains the newly persisted item representation.

3. **`404 Not Found`**
   - **`GET /items/:id`**: Returned when the requested integer `id` does not match any existing record in the catalogue (e.g. `GET /items/999`), or when an unparseable non-integer identifier is passed (e.g. `GET /items/abc`). The response body includes an informative JSON error: `{ "error": "Item not found", "message": "..." }`.

4. **`422 Unprocessable Content`**
   - **`POST /items`**: Returned when the request payload contains semantic validation errors. Specifically:
     - Missing or empty `name` field (`""` or whitespace-only).
     - Missing `price` field, negative price (`price < 0`), or non-numeric price (`"abc"`).  
     The response body indicates which field failed validation: `{ "error": "Validation failed", "field": "name", "message": "..." }`.

---

### Q3. Where did you use `req.params` and where `req.body`? Why does POST need `express.json()`?

#### A. Usage of `req.params` vs. `req.body`:

- **`req.params`** is used in the **`GET /items/:id`** route handler:
  ```javascript
  app.get('/items/:id', (req, res) => {
    const parsedId = parseInt(req.params.id, 10);
    // ...
  });
  ```
  `req.params` contains route parameters captured directly from the **URL path**. Here, `:id` is a path variable defined in the route pattern, allowing the server to extract the target resource ID from the request URI.

- **`req.body`** is used in the **`POST /items`** route handler:
  ```javascript
  app.post('/items', (req, res) => {
    const { name, price, available, category } = req.body;
    // ...
  });
  ```
  `req.body` contains key-value pairs of data submitted in the **HTTP request payload (body)** by the client (such as our HTML form using `fetch()` with `Content-Type: application/json`).

#### B. Why does POST need `express.json()`?

By default in Node.js and Express, incoming HTTP request bodies arrive as raw readable streams of binary data chunks (`Buffer`). Express does **not** parse the HTTP request body automatically.

Without the `express.json()` middleware:
- `req.body` remains `undefined`.
- Attempting to destructure `{ name, price } = req.body` throws a runtime `TypeError: Cannot destructure property 'name' of 'req.body' as it is undefined`.

When `app.use(express.json())` is mounted:
1. It intercepts incoming HTTP requests containing a `Content-Type: application/json` header.
2. It buffers the incoming stream data and parses the raw JSON string into a native JavaScript object.
3. It attaches the parsed object to `req.body` before subsequent route handlers execute.

---

## 3. Project Architecture & File Structure

This assignment is implemented as an isolated, self-contained Express REST service under `Assignment8/` to prevent interference with prior assignments (Assignments 1–7) or the main microservices backend:

```text
Assignment8/
├── .gitignore                    # Excludes node_modules and log artifacts
├── package.json                  # Dependencies (Express) and npm run scripts
├── server.js                     # Express REST API, in-memory seed store, routes & static delivery
├── public/                       # Static frontend delivered via express.static('public')
│   ├── index.html                # Semantic HTML5 UI with CampusEats design identity
│   ├── style.css                 # Responsive CSS3 styling (CampusEats orange & slate palette)
│   └── script.js                 # Native fetch() client (GET list, POST create, GET :id test)
├── tests/
│   └── test.js                   # Automated integration test suite (33 automated assertions)
├── scripts/
│   └── generate-evidence.js      # Headless verification script for screenshots & transcripts
└── evidence/
    ├── screenshot-1-initial-seed.png   # Frontend showing 4 initial seed records
    ├── screenshot-2-after-post.png     # Frontend showing 5 records after live POST
    └── curl_transcript.txt             # Full HTTP request/response curl session log
```

---

## 4. In-Memory Data Model (Source of Truth)

In accordance with the assignment instructions (Lecture 10 covers database persistence), state is stored in an in-memory JavaScript array. The initial 4 seed records represent realistic CampusEats canteen items:

```javascript
let items = [
  { id: 1, name: "Paneer Butter Masala", price: 180.00, available: true,  category: "North Indian" },
  { id: 2, name: "Masala Dosa",          price: 80.00,  available: true,  category: "South Indian" },
  { id: 3, name: "Veg Hakka Noodles",     price: 120.00, available: true,  category: "Chinese" },
  { id: 4, name: "Cold Coffee with Ice Cream", price: 70.00, available: false, category: "Beverages" }
];
```

Unique IDs are strictly generated on the server using `let nextId = items.length + 1; nextId++`, preventing client tampering.

---

## 5. How to Run the Application

### Prerequisites
- **Node.js** v18.0.0 or higher (Tested on `v24.14.0`)
- **npm** v9.0.0 or higher (Tested on `11.9.0`)

### Step-by-Step Instructions

1. **Open a terminal** and navigate into the `Assignment8` directory:
   ```powershell
   cd C:\Users\computer\Documents\CAMPUEATS\Assignment8
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Express server:**
   ```bash
   npm start
   ```
   *Expected output:*
   ```text
   =======================================================
     CampusEats — Menu / Catalogue REST Service
     CS543 Web Services · Assignment 8 · Team 12
   =======================================================
     Server running at:  http://localhost:3000
     GET  all items:     http://localhost:3000/items
     GET  item by id:    http://localhost:3000/items/1
     POST new item:      http://localhost:3000/items
     Static Web Page:    http://localhost:3000/
   =======================================================
   ```

4. **Open the application in your browser:**  
   Navigate to [http://localhost:3000](http://localhost:3000).

5. **Interact with the Frontend:**
   - **View Menu Items:** The page automatically executes `GET /items` on load and displays the 4 seeded dishes.
   - **Add a Dish:** Fill in the *Dish Name*, *Price (₹)*, *Category*, and *Availability*, then click **"Add to Menu Catalogue"**.
   - **Observe Live Refresh:** A `POST /items` request is dispatched. On HTTP `201 Created`, a green toast alert confirms success, the form resets, and the list re-renders with the new record.
   - **Test Single-Item Lookup (`GET /items/:id`):** Enter ID `1` in the inspector widget to observe `200 OK`, or enter `999` to observe `404 Not Found`.

---

## 6. Automated Testing & Verification

An automated integration test suite is provided in [`tests/api.test.js`](tests/api.test.js). To run the test suite:

```bash
npm test
```

### Test Suite Output (33 Passed, 0 Failed):

```text
> campuseats-assignment8-rest-api@1.0.0 test
> node tests/api.test.js

=======================================================
 CampusEats Assignment 8: Automated REST API Test Suite
=======================================================

[Test Suite 1] GET /items
  ✓ PASS: GET /items returns HTTP 200
  ✓ PASS: GET /items returns an array
  ✓ PASS: GET /items returns 4 seed records (found 4)
  ✓ PASS: First item is "Paneer Butter Masala"
  ✓ PASS: First item price is 180.00

[Test Suite 2] GET /items/:id (Existing Item)
  ✓ PASS: GET /items/2 returns HTTP 200
  ✓ PASS: Item ID matches 2
  ✓ PASS: Item name is "Masala Dosa"
  ✓ PASS: Item price is 80.00
  ✓ PASS: Item available is true

[Test Suite 3] GET /items/:id (Nonexistent Item)
  ✓ PASS: GET /items/999 returns HTTP 404 Not Found
  ✓ PASS: Response body includes { error: "Item not found" }
  ✓ PASS: GET /items/invalid-id returns HTTP 404 Not Found

[Test Suite 4] POST /items (Valid Item Creation)
  ✓ PASS: POST /items returns HTTP 201 Created
  ✓ PASS: Server assigns auto-incremented id=5
  ✓ PASS: Created item name matches
  ✓ PASS: Created item price matches
  ✓ PASS: Created item available matches
  ✓ PASS: GET /items now contains 5 items
  ✓ PASS: GET /items/5 returns HTTP 200
  ✓ PASS: Fetched item by ID matches

[Test Suite 5] POST /items Validation (HTTP 422 Unprocessable Content)
  ✓ PASS: POST /items without name returns HTTP 422
  ✓ PASS: Error response indicates "name" field
  ✓ PASS: POST /items with blank name returns HTTP 422
  ✓ PASS: POST /items without price returns HTTP 422
  ✓ PASS: Error response indicates "price" field
  ✓ PASS: POST /items with negative price returns HTTP 422
  ✓ PASS: POST /items with non-numeric price returns HTTP 422

[Test Suite 6] Static Frontend Delivery
  ✓ PASS: GET / returns HTTP 200 OK
  ✓ PASS: GET / HTML contains "CampusEats"
  ✓ PASS: GET / HTML contains "addItemForm"
  ✓ PASS: GET /style.css returns HTTP 200 OK
  ✓ PASS: GET /script.js returns HTTP 200 OK

=======================================================
 Test Results: 33 PASSED, 0 FAILED
=======================================================
```

---

## 7. Demonstration Evidence & Screenshots

All demonstration artifacts have been generated and saved in the [`evidence/`](evidence/) folder:

1. **Screenshot 1 (Before POST — 4 Seed Records):**  
   Saved at [`evidence/screenshot-1-initial-seed.png`](evidence/screenshot-1-initial-seed.png).  
   Shows the initial 4 catalogue dishes loaded via `GET /items`.

2. **Screenshot 2 (After POST — Newly Added Record):**  
   Saved at [`evidence/screenshot-2-after-post.png`](evidence/screenshot-2-after-post.png).  
   Shows the newly added item (`Chole Bhature`, ID #5, ₹95.00) added via `POST /items`, the success banner, and the refreshed 5-item grid.

3. **Curl Transcript:**  
   Saved at [`evidence/curl_transcript.txt`](evidence/curl_transcript.txt).  
   Complete terminal transcript verifying HTTP headers, methods, and status codes (200, 201, 404, 422).

---

## 8. Troubleshooting & Common Issues

- **Port Conflict (`EADDRINUSE: address already in use :::3000`):**
  If port 3000 is occupied by another process, specify a custom port via the `PORT` environment variable:
  ```powershell
  $env:PORT=3008; npm start
  ```
- **Form submission does not refresh the list:**
  Ensure JavaScript is enabled in your web browser. Check the Developer Tools Console (`F12` -> Console) for any network blocking.
- **Data resets to 4 items after server restart:**
  This is expected behavior. The assignment specifies an in-memory array as the source of truth for demonstration. Persistent databases are introduced in Lecture 10.
