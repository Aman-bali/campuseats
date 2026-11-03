/**
 * CampusEats — CS543 Assignment 8
 * Automated API Test Suite
 * Authors: Aman Bali (20251651015) & Bhupesh Kumar (20251651032)
 */

const http = require('http');
const { app, resetSeedData } = require('../server');

const TEST_PORT = 3899;
let server;

function startTestServer() {
  return new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      resolve();
    });
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

// Helper to make HTTP requests
async function request(path, options = {}) {
  const url = `http://localhost:${TEST_PORT}${path}`;
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return {
    status: response.status,
    headers: response.headers,
    body: json,
    rawText: text
  };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log(`=======================================================`);
  console.log(` CampusEats Assignment 8: Automated REST API Test Suite`);
  console.log(`=======================================================\n`);

  await startTestServer();
  resetSeedData();

  try {
    // ----------------------------------------------------
    // Test 1: GET /items returns all seed records (HTTP 200)
    // ----------------------------------------------------
    console.log(`[Test Suite 1] GET /items`);
    const res1 = await request('/items');
    assert(res1.status === 200, 'GET /items returns HTTP 200');
    assert(Array.isArray(res1.body), 'GET /items returns an array');
    assert(res1.body.length === 4, `GET /items returns 4 seed records (found ${res1.body.length})`);
    assert(res1.body[0].name === 'Paneer Butter Masala', 'First item is "Paneer Butter Masala"');
    assert(res1.body[0].price === 180.00, 'First item price is 180.00');

    // ----------------------------------------------------
    // Test 2: GET /items/:id returns specific item (HTTP 200)
    // ----------------------------------------------------
    console.log(`\n[Test Suite 2] GET /items/:id (Existing Item)`);
    const res2 = await request('/items/2');
    assert(res2.status === 200, 'GET /items/2 returns HTTP 200');
    assert(res2.body.id === 2, 'Item ID matches 2');
    assert(res2.body.name === 'Masala Dosa', 'Item name is "Masala Dosa"');
    assert(res2.body.price === 80.00, 'Item price is 80.00');
    assert(res2.body.available === true, 'Item available is true');

    // ----------------------------------------------------
    // Test 3: GET /items/:id with nonexistent ID (HTTP 404)
    // ----------------------------------------------------
    console.log(`\n[Test Suite 3] GET /items/:id (Nonexistent Item)`);
    const res3 = await request('/items/999');
    assert(res3.status === 404, 'GET /items/999 returns HTTP 404 Not Found');
    assert(res3.body && res3.body.error === 'Item not found', 'Response body includes { error: "Item not found" }');

    const res3b = await request('/items/invalid-id');
    assert(res3b.status === 404, 'GET /items/invalid-id returns HTTP 404 Not Found');

    // ----------------------------------------------------
    // Test 4: POST /items creates new record (HTTP 201)
    // ----------------------------------------------------
    console.log(`\n[Test Suite 4] POST /items (Valid Item Creation)`);
    const newItemPayload = {
      name: 'Chole Bhature',
      price: 95.00,
      available: true,
      category: 'North Indian'
    };
    const res4 = await request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItemPayload)
    });
    assert(res4.status === 201, 'POST /items returns HTTP 201 Created');
    assert(res4.body && res4.body.id === 5, 'Server assigns auto-incremented id=5');
    assert(res4.body.name === 'Chole Bhature', 'Created item name matches');
    assert(res4.body.price === 95.00, 'Created item price matches');
    assert(res4.body.available === true, 'Created item available matches');

    // Verify it is now present in GET /items
    const res4_verify = await request('/items');
    assert(res4_verify.body.length === 5, 'GET /items now contains 5 items');

    // Verify it can be retrieved via GET /items/5
    const res4_getItem = await request('/items/5');
    assert(res4_getItem.status === 200, 'GET /items/5 returns HTTP 200');
    assert(res4_getItem.body.name === 'Chole Bhature', 'Fetched item by ID matches');

    // ----------------------------------------------------
    // Test 5: POST /items validation failures (HTTP 422)
    // ----------------------------------------------------
    console.log(`\n[Test Suite 5] POST /items Validation (HTTP 422 Unprocessable Content)`);
    
    // Missing name
    const res5a = await request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 50.00 })
    });
    assert(res5a.status === 422, 'POST /items without name returns HTTP 422');
    assert(res5a.body.field === 'name', 'Error response indicates "name" field');

    // Empty string name
    const res5b = await request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ', price: 50.00 })
    });
    assert(res5b.status === 422, 'POST /items with blank name returns HTTP 422');

    // Missing price
    const res5c = await request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Veg Sandwich' })
    });
    assert(res5c.status === 422, 'POST /items without price returns HTTP 422');
    assert(res5c.body.field === 'price', 'Error response indicates "price" field');

    // Negative price
    const res5d = await request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Veg Sandwich', price: -10 })
    });
    assert(res5d.status === 422, 'POST /items with negative price returns HTTP 422');

    // Non-numeric price
    const res5e = await request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Veg Sandwich', price: 'free' })
    });
    assert(res5e.status === 422, 'POST /items with non-numeric price returns HTTP 422');

    // ----------------------------------------------------
    // Test 6: Static frontend served from public/ (HTTP 200)
    // ----------------------------------------------------
    console.log(`\n[Test Suite 6] Static Frontend Delivery`);
    const res6a = await request('/');
    assert(res6a.status === 200, 'GET / returns HTTP 200 OK');
    assert(res6a.rawText.includes('CampusEats'), 'GET / HTML contains "CampusEats"');
    assert(res6a.rawText.includes('addItemForm'), 'GET / HTML contains "addItemForm"');

    const res6b = await request('/style.css');
    assert(res6b.status === 200, 'GET /style.css returns HTTP 200 OK');

    const res6c = await request('/script.js');
    assert(res6c.status === 200, 'GET /script.js returns HTTP 200 OK');

    // ----------------------------------------------------
    // Test Summary
    // ----------------------------------------------------
    console.log(`\n=======================================================`);
    console.log(` Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=======================================================`);

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    await stopTestServer();
  }

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

runTests();
