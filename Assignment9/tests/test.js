/**
 * CampusEats — CS543 Assignment 09: Securing the API
 * Comprehensive Automated Test Suite (Hardened & Extended)
 * 
 * Verifies all 5 Mandatory Assignment Scenarios + 11 Required Security Edge Cases
 * Authors: Aman Bali (20251651015) & Bhupesh Kumar (20251651032) - Team 12
 */

require('dotenv').config();
const path = require('path');
const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');
const { app, resetSeedData, resetRateLimits, JWT_SECRET } = require('../server');

const TEST_PORT = 3995;
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

async function request(endpoint, options = {}) {
  const url = `http://localhost:${TEST_PORT}${endpoint}`;
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
  console.log(`==================================================================`);
  console.log(` CampusEats Assignment 09: Automated Security & RBAC Test Suite`);
  console.log(` CS543 Web Services · Team 12 (Aman Bali & Bhupesh Kumar)`);
  console.log(`==================================================================\n`);

  await startTestServer();
  resetSeedData();

  try {
    // ----------------------------------------------------
    // TEST 1 (Mandatory): GET /items without Token returns 401
    // ----------------------------------------------------
    console.log(`[Mandatory Test 1] GET without token returns HTTP 401 Unauthorized`);
    const resNoToken = await request('/items');
    assert(resNoToken.status === 401, 'GET /items without token returns HTTP 401 Unauthorized');
    assert(resNoToken.body && resNoToken.body.error === 'Unauthorized', 'Response body contains error: "Unauthorized"');
    assert(resNoToken.body.message.includes('missing'), 'Error message states Authorization header missing');

    const resItem1NoToken = await request('/items/1');
    assert(resItem1NoToken.status === 401, 'GET /items/1 without token returns HTTP 401');

    // ----------------------------------------------------
    // TEST 2 (Mandatory): Successful login returns 200 and JWT
    // ----------------------------------------------------
    console.log(`\n[Mandatory Test 2] Successful login returns HTTP 200 and signed JWT`);
    const resCustomerLogin = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@campuseats.com', password: 'customer123' })
    });
    assert(resCustomerLogin.status === 200, 'Customer POST /login returns HTTP 200 OK');
    assert(typeof resCustomerLogin.body.token === 'string', 'Returns signed JWT token string');
    assert(resCustomerLogin.body.user.role === 'customer', 'User payload role claim is "customer"');

    const customerToken = resCustomerLogin.body.token;
    const decodedCustomer = jwt.verify(customerToken, JWT_SECRET, { algorithms: ['HS256'] });
    assert(decodedCustomer.role === 'customer', 'JWT signature verified with HS256 and role matches');
    assert(decodedCustomer.email === 'customer@campuseats.com', 'JWT payload email matches');

    // ----------------------------------------------------
    // TEST 3 (Mandatory): GET with valid JWT returns 200
    // ----------------------------------------------------
    console.log(`\n[Mandatory Test 3] GET /items with valid JWT returns HTTP 200 OK`);
    const resAuthItems = await request('/items', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(resAuthItems.status === 200, 'GET /items with customer token returns HTTP 200 OK');
    assert(Array.isArray(resAuthItems.body), 'Response body is an array');
    assert(resAuthItems.body.length === 4, `Catalogue contains 4 seed items (found ${resAuthItems.body.length})`);

    const resAuthItem1 = await request('/items/1', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(resAuthItem1.status === 200, 'GET /items/1 with customer token returns HTTP 200 OK');
    assert(resAuthItem1.body.name === 'Paneer Butter Masala', 'Retrieved item name is "Paneer Butter Masala"');

    // ----------------------------------------------------
    // TEST 4 (Mandatory): Restaurant POST returns 201 Created
    // ----------------------------------------------------
    console.log(`\n[Mandatory Test 4] Restaurant POST /items returns HTTP 201 Created`);
    const resRestLogin = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'restaurant@campuseats.com', password: 'restaurant123' })
    });
    assert(resRestLogin.status === 200, 'Restaurant POST /login returns HTTP 200 OK');
    const restaurantToken = resRestLogin.body.token;

    const resRestPost = await request('/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restaurantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Hyderabadi Chicken Dum Biryani',
        price: 240.00,
        available: true,
        category: 'Biryani Special'
      })
    });
    assert(resRestPost.status === 201, 'POST /items with restaurant token returns HTTP 201 Created');
    assert(resRestPost.body.id === 5, 'New menu item assigned auto-incremented ID 5');
    assert(resRestPost.body.name === 'Hyderabadi Chicken Dum Biryani', 'Created item name matches');
    assert(resRestPost.body.price === 240.00, 'Created item price matches');

    // ----------------------------------------------------
    // TEST 5 (Mandatory): Customer POST returns 403 Forbidden
    // ----------------------------------------------------
    console.log(`\n[Mandatory Test 5] Customer POST /items returns HTTP 403 Forbidden`);
    const resCustPost = await request('/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Unauthorized Student Snack',
        price: 50.00,
        category: 'Snacks'
      })
    });
    assert(resCustPost.status === 403, 'POST /items with customer token returns HTTP 403 Forbidden');
    assert(resCustPost.body && resCustPost.body.error === 'Forbidden', 'Response error is "Forbidden"');
    assert(resCustPost.body.message.includes('not authorized'), 'Message states role "customer" is not authorized');

    // Verify catalogue length unchanged
    const resVerifyItems = await request('/items', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(resVerifyItems.body.length === 5, 'Catalogue items count remained 5 (unauthorized write rejected)');

    // ----------------------------------------------------
    // TEST 6: Invalid JWT returns 401
    // ----------------------------------------------------
    console.log(`\n[Security Test 6] Invalid JWT returns HTTP 401`);
    const resInvalidJwt = await request('/items', {
      headers: { 'Authorization': 'Bearer totally.invalid.token' }
    });
    assert(resInvalidJwt.status === 401, 'Invalid JWT structure returns HTTP 401');

    // ----------------------------------------------------
    // TEST 7: Tampered JWT returns 401
    // ----------------------------------------------------
    console.log(`\n[Security Test 7] Tampered JWT returns HTTP 401`);
    const parts = customerToken.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.TAMPERED_SIG`;
    const resTampered = await request('/items', {
      headers: { 'Authorization': `Bearer ${tamperedToken}` }
    });
    assert(resTampered.status === 401, 'Tampered JWT signature returns HTTP 401 Unauthorized');

    // ----------------------------------------------------
    // TEST 8: Expired JWT returns 401
    // ----------------------------------------------------
    console.log(`\n[Security Test 8] Expired JWT returns HTTP 401`);
    const expiredToken = jwt.sign(
      { id: 'user_cust_001', email: 'customer@campuseats.com', role: 'customer' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );
    const resExpired = await request('/items', {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    assert(resExpired.status === 401, 'Expired JWT returns HTTP 401');
    assert(resExpired.body.message.includes('expired'), 'Response notes that token has expired');

    // ----------------------------------------------------
    // TEST 9: Missing Bearer prefix returns 401
    // ----------------------------------------------------
    console.log(`\n[Security Test 9] Missing Bearer prefix returns HTTP 401`);
    const resBasic = await request('/items', {
      headers: { 'Authorization': `Basic dXNlcjpwYXNz` }
    });
    assert(resBasic.status === 401, 'Basic Authorization scheme returns HTTP 401');
    assert(resBasic.body.message.includes('Bearer'), 'Error message specifies Bearer format required');

    const resRawToken = await request('/items', {
      headers: { 'Authorization': customerToken } // Missing Bearer prefix
    });
    assert(resRawToken.status === 401, 'Missing Bearer prefix returns HTTP 401');

    // ----------------------------------------------------
    // TEST 10: Incorrect password returns 401
    // ----------------------------------------------------
    console.log(`\n[Security Test 10] Incorrect password returns HTTP 401`);
    const resWrongPass = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@campuseats.com', password: 'wrongpassword' })
    });
    assert(resWrongPass.status === 401, 'Incorrect password returns HTTP 401');
    assert(resWrongPass.body.message === 'Invalid email or password.', 'Generic error message returned');

    // ----------------------------------------------------
    // TEST 11: Missing login credentials return 400
    // ----------------------------------------------------
    console.log(`\n[Security Test 11] Missing login credentials return HTTP 400`);
    const resEmptyLogin = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(resEmptyLogin.status === 400, 'Missing email & password returns HTTP 400 Bad Request');

    const resNoPass = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@campuseats.com' })
    });
    assert(resNoPass.status === 400, 'Missing password returns HTTP 400');

    // ----------------------------------------------------
    // TEST 12: Invalid menu item data returns 422
    // ----------------------------------------------------
    console.log(`\n[Security Test 12] Invalid menu item data returns HTTP 422`);
    // Missing name
    const resMissingName = await request('/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restaurantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ price: 150 })
    });
    assert(resMissingName.status === 422, 'POST /items without name returns HTTP 422 Unprocessable Content');

    // Negative price
    const resNegativePrice = await request('/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restaurantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Chai', price: -5 })
    });
    assert(resNegativePrice.status === 422, 'POST /items with negative price returns HTTP 422');

    // Non-finite price
    const resNonFinite = await request('/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restaurantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Chai', price: 'not-a-number' })
    });
    assert(resNonFinite.status === 422, 'POST /items with NaN price returns HTTP 422');

    // ----------------------------------------------------
    // TEST 13: Malformed item ID is rejected (404)
    // ----------------------------------------------------
    console.log(`\n[Security Test 13] Malformed item ID is rejected`);
    const resMalformedId = await request('/items/abc', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(resMalformedId.status === 404, 'GET /items/abc returns HTTP 404');

    const resNegativeId = await request('/items/-1', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(resNegativeId.status === 404, 'GET /items/-1 returns HTTP 404');

    // ----------------------------------------------------
    // TEST 14: Nonexistent item returns 404
    // ----------------------------------------------------
    console.log(`\n[Security Test 14] Nonexistent item returns HTTP 404`);
    const resNotFound = await request('/items/9999', {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    assert(resNotFound.status === 404, 'GET /items/9999 returns HTTP 404 Not Found');

    // ----------------------------------------------------
    // TEST 15: Missing JWT_SECRET prevents secure server startup
    // ----------------------------------------------------
    console.log(`\n[Security Test 15] Missing JWT_SECRET halts server startup`);
    let missingSecretHalted = false;
    try {
      execSync('node -e "process.env.JWT_SECRET = \'\'; require(\'./server\')"', {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch {
      missingSecretHalted = true;
    }
    assert(missingSecretHalted, 'Missing JWT_SECRET halts server startup with non-zero exit code');

    // ----------------------------------------------------
    // TEST 16: Login rate limiting behaves correctly
    // ----------------------------------------------------
    console.log(`\n[Security Test 16] Login rate limiting blocks excessive attempts`);
    resetRateLimits();

    // Perform 10 failed login attempts (allowed limit)
    for (let i = 0; i < 10; i++) {
      await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'rate_test@campuseats.com', password: 'bad' })
      });
    }

    // 11th attempt must trigger HTTP 429 Too Many Requests
    const resRateLimited = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rate_test@campuseats.com', password: 'bad' })
    });
    assert(resRateLimited.status === 429, '11th login attempt returns HTTP 429 Too Many Requests');
    assert(resRateLimited.body && resRateLimited.body.error === 'Too Many Requests', 'Error type is "Too Many Requests"');
    assert(resRateLimited.headers.get('retry-after') !== null, 'Response includes Retry-After header');

    // Reset rate limits for subsequent test runs
    resetRateLimits();

    // ----------------------------------------------------
    // Additional Verification: Admin Write & Role Coverage
    // ----------------------------------------------------
    console.log(`\n[Role Verification] Admin permitted write operations`);
    const resAdminLogin = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@campuseats.com', password: 'admin123' })
    });
    assert(resAdminLogin.status === 200, 'Admin login returns HTTP 200');
    const adminToken = resAdminLogin.body.token;

    const resAdminPost = await request('/items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Admin Exclusive Dish',
        price: 350.00,
        available: true,
        category: 'Executive'
      })
    });
    assert(resAdminPost.status === 201, 'Admin role can write items via POST /items (HTTP 201)');

  } finally {
    await stopTestServer();
  }

  console.log(`\n==================================================================`);
  console.log(` Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} Tests`);
  console.log(`==================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
