/**
 * CampusEats — CS543 Web Services: Assignment 8 of 12
 * REST API Implementation for Menu / Catalogue Service
 * 
 * Team ID: 12
 * Members:
 *  1. Aman Bali       (Roll: 20251651015)
 *  2. Bhupesh Kumar   (Roll: 20251651032)
 * Course Instructor: Dr. Pramit Mazumdar (IIIT Vadodara)
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// Middleware Configuration
// ==========================================

// 1. Parse incoming JSON payloads in request bodies (REQUIRED for POST /items)
app.use(express.json());

// 2. Serve static frontend files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// In-Memory Data Store (Source of Truth)
// ==========================================
// Initialized with 3-4 realistic seed records from the CampusEats menu catalogue.
// In accordance with CS543 Assignment 8 guidelines, an in-memory array is used.
// (Persistent databases are introduced in Lecture 10).
let items = [
  {
    id: 1,
    name: "Paneer Butter Masala",
    price: 180.00,
    available: true,
    category: "North Indian"
  },
  {
    id: 2,
    name: "Masala Dosa",
    price: 80.00,
    available: true,
    category: "South Indian"
  },
  {
    id: 3,
    name: "Veg Hakka Noodles",
    price: 120.00,
    available: true,
    category: "Chinese"
  },
  {
    id: 4,
    name: "Cold Coffee with Ice Cream",
    price: 70.00,
    available: false,
    category: "Beverages"
  }
];

// Server-managed auto-incrementing counter for unique ID generation
let nextId = items.length + 1;

// Function to reset seed data (useful for automated testing)
function resetSeedData() {
  items = [
    { id: 1, name: "Paneer Butter Masala", price: 180.00, available: true, category: "North Indian" },
    { id: 2, name: "Masala Dosa", price: 80.00, available: true, category: "South Indian" },
    { id: 3, name: "Veg Hakka Noodles", price: 120.00, available: true, category: "Chinese" },
    { id: 4, name: "Cold Coffee with Ice Cream", price: 70.00, available: false, category: "Beverages" }
  ];
  nextId = 5;
}

// ==========================================
// REST API Routes
// ==========================================

/**
 * 1. GET /items
 * Purpose: Fetch all menu items from the catalogue.
 * Response: HTTP 200 OK with the array of items.
 */
app.get('/items', (req, res) => {
  return res.status(200).json(items);
});

/**
 * 2. GET /items/:id
 * Purpose: Fetch a single menu item by its unique ID.
 * Request Params: req.params.id (route parameter)
 * Responses:
 *   - HTTP 200 OK with the item object if found.
 *   - HTTP 404 Not Found if no item matches the given ID.
 */
app.get('/items/:id', (req, res) => {
  const parsedId = parseInt(req.params.id, 10);

  // Validate ID format
  if (isNaN(parsedId)) {
    return res.status(404).json({
      error: "Item not found",
      message: `Invalid ID format '${req.params.id}'. ID must be an integer.`
    });
  }

  const foundItem = items.find((item) => item.id === parsedId);

  if (!foundItem) {
    return res.status(404).json({
      error: "Item not found",
      message: `Menu item with ID ${req.params.id} does not exist in the catalogue.`
    });
  }

  return res.status(200).json(foundItem);
});

/**
 * 3. POST /items
 * Purpose: Create a new menu item in the catalogue.
 * Request Body: req.body (parsed by express.json())
 * Responses:
 *   - HTTP 422 Unprocessable Content if required fields (name, price) are missing or invalid.
 *   - HTTP 201 Created with the newly created item object upon success.
 */
app.post('/items', (req, res) => {
  const { name, price, available, category } = req.body;

  // Validation 1: Required field 'name'
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(422).json({
      error: "Validation failed",
      field: "name",
      message: "The 'name' field is required and must be a non-empty string."
    });
  }

  // Validation 2: Required field 'price'
  if (price === undefined || price === null || price === '') {
    return res.status(422).json({
      error: "Validation failed",
      field: "price",
      message: "The 'price' field is required."
    });
  }

  const numericPrice = Number(price);
  if (isNaN(numericPrice) || numericPrice < 0) {
    return res.status(422).json({
      error: "Validation failed",
      field: "price",
      message: "The 'price' field must be a valid non-negative number."
    });
  }

  // Determine availability (defaults to true if not specified)
  let isAvailable = true;
  if (typeof available === 'boolean') {
    isAvailable = available;
  } else if (typeof available === 'string') {
    isAvailable = available.toLowerCase() === 'true';
  }

  // Construct new menu item with server-assigned unique ID
  const newItem = {
    id: nextId++,
    name: name.trim(),
    price: parseFloat(numericPrice.toFixed(2)),
    available: isAvailable,
    category: (category && typeof category === 'string' && category.trim()) ? category.trim() : "Campus Special"
  };

  // Append to the in-memory source of truth
  items.push(newItem);

  // Return HTTP 201 Created with the newly created record
  return res.status(201).json(newItem);
});

// ==========================================
// Graceful Error Handling Middleware
// ==========================================

// Handle malformed JSON payloads gracefully
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Malformed JSON payload in request body."
    });
  }
  next(err);
});

// Start the server if executed directly
let serverInstance = null;
if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  CampusEats — Menu / Catalogue REST Service`);
    console.log(`  CS543 Web Services · Assignment 8 · Team 12`);
    console.log(`=======================================================`);
    console.log(`  Server running at:  http://localhost:${PORT}`);
    console.log(`  GET  all items:     http://localhost:${PORT}/items`);
    console.log(`  GET  item by id:    http://localhost:${PORT}/items/1`);
    console.log(`  POST new item:      http://localhost:${PORT}/items`);
    console.log(`  Static Web Page:    http://localhost:${PORT}/`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, resetSeedData, getItems: () => items };
