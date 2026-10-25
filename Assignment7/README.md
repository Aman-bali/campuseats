# CampusEats — Assignment 7: GraphQL Menu Service

**Course:** CS543 · Web Services · Assignment 7 of 12  
**Instructor:** Dr. Pramit Mazumdar (`pramit.mazumdar@iiitvadodara.ac.in`)  
**Institution:** Indian Institute of Information Technology Vadodara (IIITV)  
**Team Submission:**
- **Aman Bali** — Student ID / Roll No: `20251651015`
- **Bhupesh Karir** — Student ID / Roll No: `20251651032`

---

## 1. Objective

Build one focused GraphQL service for CampusEats that exposes a `Dish` entity (Menu Service) through a GraphQL API, backed by MySQL using `mysql2/promise`, and demonstrated through a responsive plain HTML/CSS/JavaScript web interface.

This service is completely isolated in the `Assignment7-GraphQL/` directory to prevent any breaking changes to previous assignments (Assignments 1–6) or the main CampusEats backend.

---

## 2. Selected Service & Entity

- **Selected Service:** Menu / Catalogue Service
- **Entity:** `Dish` (representing a food item on a restaurant's campus menu)
- **GraphQL Type:**
  ```graphql
  type Dish {
    id: ID!
    name: String!
    price: Float!
    available: Boolean!
  }
  ```
- **GraphQL Input:**
  ```graphql
  input AddDishInput {
    name: String!
    price: Float!
    available: Boolean
  }
  ```

---

## 3. Technology Stack

- **Runtime:** Node.js (v18.0.0+ / tested on v24.14.0)
- **GraphQL Server:** Apollo Server v4 (`@apollo/server`) with Express 4 (`@apollo/server/express4`)
- **Schema & Execution:** `graphql` v16
- **Database Driver:** `mysql2` (using `mysql2/promise` connection pool)
- **Database:** MySQL 8.0 / MariaDB
- **Frontend:** Plain Semantic HTML5, Modern CSS3, Native JavaScript (`fetch` API, no React/build tools)

---

## 4. Project File Structure

```text
Assignment7-GraphQL/
├── .env.example          # Template for environment settings (port, MySQL connection)
├── .env                  # Local environment file (git-ignored)
├── .gitignore            # Excludes node_modules, .env, and system logs
├── db.js                 # Reusable MySQL connection pool configuration
├── package.json          # Node.js project manifest & dependencies
├── README.md             # Complete documentation and assignment answers
├── schema.graphql        # GraphQL schema definition (types, queries, mutation)
├── schema.sql            # MySQL schema creation and seed data insertion
├── server.js             # Apollo Server + Express HTTP server & resolvers
├── public/
│   └── index.html        # Interactive HTML/CSS frontend with live GraphQL fetch
└── tests/
    └── test.js           # Automated end-to-end and resolver test suite
```

---

## 5. MySQL Database Setup

1. Open your MySQL client (PowerShell, Command Prompt, or MySQL Workbench).
2. Execute the included `schema.sql` script:

```powershell
# Using mysql command-line client
Get-Content schema.sql | mysql -u root -p
```

This script will:
1. Create the `campuseats_graphql` database (`CREATE DATABASE IF NOT EXISTS campuseats_graphql;`).
2. Create the `dishes` table with an auto-incrementing integer `id`, `name VARCHAR(255)`, `price DECIMAL(10,2)`, and `available BOOLEAN DEFAULT TRUE`.
3. Seed the table with 4 realistic dishes:
   - `Paneer Butter Masala` (₹180.00, available: `TRUE`)
   - `Masala Dosa` (₹80.00, available: `TRUE`)
   - `Veg Hakka Noodles` (₹120.00, available: `TRUE`)
   - `Cold Coffee with Ice Cream` (₹70.00, available: `FALSE`)

---

## 6. Environment Configuration

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Ensure the configuration matches your local MySQL instance:

```env
# Server Port
PORT=4000

# MySQL Connection Settings
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=campuseats_graphql
```

> **Note for Local XAMPP / Alternative Ports:**  
> If MySQL is running on port 3307 or another port, simply set `DB_PORT=3307` in your `.env` file.

---

## 7. How to Install and Run on Windows

Open PowerShell in the `Assignment7-GraphQL` directory:

```powershell
# 1. Install dependencies
npm.cmd install

# 2. Run automated verification tests
npm.cmd test

# 3. Start the server
npm.cmd start
```

Once running:
- **Web Frontend:** Open [http://localhost:4000/](http://localhost:4000/) in your browser.
- **GraphQL Endpoint:** Access [http://localhost:4000/graphql](http://localhost:4000/graphql) (or Apollo Studio Sandbox).

---

## 8. GraphQL Operations & Examples

### 8.1 Query All Dishes (List Query)

```graphql
query {
  dishes {
    id
    name
    price
    available
  }
}
```

**Sample Response:**
```json
{
  "data": {
    "dishes": [
      { "id": "1", "name": "Paneer Butter Masala", "price": 180, "available": true },
      { "id": "2", "name": "Masala Dosa", "price": 80, "available": true },
      { "id": "3", "name": "Veg Hakka Noodles", "price": 120, "available": true },
      { "id": "4", "name": "Cold Coffee with Ice Cream", "price": 70, "available": false }
    ]
  }
}
```

### 8.2 Query Dish by ID

```graphql
query {
  dish(id: "1") {
    id
    name
    price
    available
  }
}
```

### 8.3 Add Dish Mutation (Minimum Required)

When `available` is omitted, the resolver defaults it to `true`:

```graphql
mutation {
  addDish(input: { name: "Paneer Roll", price: 90 }) {
    id
    name
    price
  }
}
```

**Sample Response:**
```json
{
  "data": {
    "addDish": {
      "id": "5",
      "name": "Paneer Roll",
      "price": 90
    }
  }
}
```

---

## 9. cURL Commands for Testing

### List all dishes via cURL:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { dishes { id name price available } }"}'
```

### Add a new dish via cURL:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { addDish(input: { name: \"Paneer Roll\", price: 90 }) { id name price available } }"}'
```

### Query single dish by ID:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { dish(id: \"1\") { id name price available } }"}'
```

---

## 10. Frontend Behavior & User Interface

The plain HTML/CSS page at `http://localhost:4000/` provides:
1. **Header Banner:** Displays the service title, course code, student team names, and direct link to `/graphql`.
2. **Live Menu Table:** Automatically queries `dishes { id name price available }` on page load and renders dishes in a clean table with dynamic status badges (Green "Available", Red "Out of Stock").
3. **Add Dish Form:** Fields for Dish Name (`*` required), Price in ₹ (`*` required), and an Available checkbox (checked by default).
4. **Client-side Validation:** Prevents submission of empty names, whitespace, non-numeric values, or negative prices.
5. **Immediate UI Feedback:** When "Add Dish" is clicked:
   - Displays a loading indicator (`Adding...`).
   - Fires the `addDish` mutation to `/graphql`.
   - On success, displays a green confirmation banner and updates the "⚡ Just Added to Database" spotlight box.
   - Automatically refreshes the table to show the newly inserted row persisted in MySQL.
6. **Live Refresh Button:** Re-executes the GraphQL query at any time to re-sync with the database.

---

## 11. Answers to Assignment Questions

### Q1. Which CampusEats service did you pick?

> **Answer:**  
> We picked the **Menu / Dish Service** (Catalogue Service) from CampusEats. It exposes the restaurant's menu items along with their unique identifier (`id`), title (`name`), cost (`price` in INR), and ordering availability (`available`).

---

### Q2. Name one field a client can skip and one it cannot. Why do we use the "!" sign?

> **Answer:**  
> - **Field a client CAN skip:** In the selection set of a query or mutation response, a client can omit the `available` field (or `price` or `id`) and request only `{ id name price }` or `{ name }`. Furthermore, in the `AddDishInput` input object, the `available: Boolean` field is optional, so a client can omit it during mutation execution and rely on the server's default value (`true`).
> - **Field a client CANNOT skip:** In `AddDishInput`, the `name: String!` and `price: Float!` fields are marked as non-null. The client cannot omit `name` or pass `null`; doing so causes GraphQL to reject the request with a validation error before any resolver runs.
> - **Why we use the `!` sign:** In GraphQL Schema Definition Language (SDL), the exclamation mark `!` denotes a **Non-Null type modifier**. By default, all GraphQL types are nullable. Placing `!` on an input field (e.g., `name: String!`) guarantees that the client must provide a non-null value, enforcing strict contract-level validation at runtime. Placing `!` on an output field (e.g., `id: ID!`) guarantees that the resolver must return a non-null value, providing strong type safety to frontend consumers.

---

### Q3. Map it to SQL: which part of your query became the WHERE, and which resolver ran the INSERT?

> **Answer:**  
> - **Query argument to SQL `WHERE` clause:**  
>   When a client executes `dish(id: "1")`, the `id` argument passed to the GraphQL query is forwarded directly into the `Query.dish` resolver (`args.id`). The resolver constructs and executes the parameterized SQL statement:
>   ```sql
>   SELECT id, name, price, available FROM dishes WHERE id = ?
>   ```
>   The GraphQL argument `id: "1"` maps directly to the SQL `WHERE id = ?` parameter.
> - **Resolver that executed the `INSERT` statement:**  
>   The `Mutation.addDish` resolver executed the parameterized SQL `INSERT` statement:
>   ```sql
>   INSERT INTO dishes (name, price, available) VALUES (?, ?, ?)
>   ```
>   It extracts `name`, `price`, and `available` from `args.input`, binds them as parameterized values to prevent SQL injection, executes the query via `pool.query()`, and uses the generated `insertId` to return the newly created `Dish` object:
>   ```js
>   return {
>     id: String(result.insertId),
>     name: name.trim(),
>     price: numPrice,
>     available: isAvailable,
>   };
>   ```
