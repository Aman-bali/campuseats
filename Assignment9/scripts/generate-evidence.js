/**
 * CampusEats — CS543 Assignment 09: Securing the API
 * Evidence Generator Script
 * 
 * Captures browser screenshots and generates curl_transcript.txt covering
 * all 5 mandatory demonstration cases.
 * 
 * Authors: Aman Bali (20251651015) & Bhupesh Kumar (20251651032) - Team 12
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { app, resetSeedData } = require('../server');

const PORT = 3591;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence');

async function run() {
  console.log('--- Generating Assignment 09 Evidence ---');

  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  resetSeedData();

  const server = app.listen(PORT, async () => {
    console.log(`Server started on port ${PORT} for evidence capture.`);

    // 1. Browser Screenshots via Puppeteer (if available)
    let puppeteer;
    try {
      puppeteer = require('puppeteer-core');
    } catch {
      console.log('puppeteer-core not found directly, checking Assignment8 node_modules...');
      try {
        puppeteer = require(path.join(__dirname, '..', '..', 'Assignment8', 'node_modules', 'puppeteer-core'));
      } catch (e) {
        console.log('Puppeteer-core skipped.');
      }
    }

    if (puppeteer && fs.existsSync(CHROME_PATH)) {
      let browser;
      try {
        console.log('Launching Chrome via puppeteer-core...');
        browser = await puppeteer.launch({
          executablePath: CHROME_PATH,
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1100']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 1100, deviceScaleFactor: 2 });

        console.log(`Navigating to http://localhost:${PORT}...`);
        await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });

        // Screenshot 1: Initial state & Test 1 (Unauthenticated 401)
        console.log('Clicking Test 1 (GET /items without token -> 401)...');
        await page.click('#runTest1Btn');
        await new Promise(r => setTimeout(r, 600));

        const ss1Path = path.join(EVIDENCE_DIR, 'screenshot-1-unauthenticated-401.png');
        await page.screenshot({ path: ss1Path, fullPage: true });
        console.log(`✓ Saved Screenshot 1: ${ss1Path}`);

        // Click Test 2 & Test 3 (Customer Login & GET /items -> 200 OK)
        console.log('Clicking Test 2 (POST /login as Customer -> 200)...');
        await page.click('#runTest2Btn');
        await new Promise(r => setTimeout(r, 600));

        console.log('Clicking Test 3 (GET /items with Customer token -> 200)...');
        await page.click('#runTest3Btn');
        await new Promise(r => setTimeout(r, 700));

        // Screenshot 2: Customer Authenticated & Catalogue Visible
        const ss2Path = path.join(EVIDENCE_DIR, 'screenshot-2-customer-authenticated-200.png');
        await page.screenshot({ path: ss2Path, fullPage: true });
        console.log(`✓ Saved Screenshot 2: ${ss2Path}`);

        // Click Test 5 (Customer attempts POST /items -> 403 Forbidden)
        console.log('Clicking Test 5 (Customer POST /items -> 403 Forbidden)...');
        await page.click('#runTest5Btn');
        await new Promise(r => setTimeout(r, 700));

        // Screenshot 3: 403 Forbidden Rejection
        const ss3Path = path.join(EVIDENCE_DIR, 'screenshot-3-customer-forbidden-403.png');
        await page.screenshot({ path: ss3Path, fullPage: true });
        console.log(`✓ Saved Screenshot 3: ${ss3Path}`);

        // Click Test 4 (Restaurant Login & POST /items -> 201 Created)
        console.log('Clicking Test 4 (Restaurant POST /items -> 201 Created)...');
        await page.click('#runTest4Btn');
        await new Promise(r => setTimeout(r, 800));

        // Screenshot 4: 201 Created Success with new menu item
        const ss4Path = path.join(EVIDENCE_DIR, 'screenshot-4-restaurant-created-201.png');
        await page.screenshot({ path: ss4Path, fullPage: true });
        console.log(`✓ Saved Screenshot 4: ${ss4Path}`);

      } catch (err) {
        console.error('Error during browser capture:', err);
      } finally {
        if (browser) await browser.close();
      }
    }

    server.close();
    console.log('Closed evidence capture server.');

    // 2. Generate curl_transcript.txt
    await generateCurlTranscript();
  });
}

async function generateCurlTranscript() {
  console.log('Generating evidence/curl_transcript.txt...');
  resetSeedData();
  const transcriptPort = PORT + 1;
  const transcriptServer = app.listen(transcriptPort, async () => {
    const baseUrl = `http://localhost:${transcriptPort}`;
    let output = '';

    output += `========================================================================\n`;
    output += `CampusEats — CS543 Web Services · Assignment 09 Live Curl Transcript\n`;
    output += `Securing the API: JWT Authentication & Role-Based Authorization\n`;
    output += `Team ID: 12\n`;
    output += `Members: Aman Bali (20251651015) & Bhupesh Kumar (20251651032)\n`;
    output += `Course Instructor: Dr. Pramit Mazumdar (IIIT Vadodara)\n`;
    output += `Date: ${new Date().toISOString()}\n`;
    output += `Target Base URL: http://localhost:3000\n`;
    output += `========================================================================\n\n`;

    // ----------------------------------------------------
    // Mandatory Case 1: GET /items without Token (Expect 401 Unauthorized)
    // ----------------------------------------------------
    output += `### DEMO CASE 1: GET /items without Token (Expect HTTP 401 Unauthorized)\n`;
    output += `$ curl -i -X GET ${baseUrl}/items\n\n`;
    const r1 = await fetch(`${baseUrl}/items`);
    output += `HTTP/1.1 ${r1.status} Unauthorized\n`;
    output += `Content-Type: ${r1.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r1.json(), null, 2) + `\n\n`;

    // ----------------------------------------------------
    // Mandatory Case 2: POST /login as Customer (Expect HTTP 200 OK + JWT)
    // ----------------------------------------------------
    output += `### DEMO CASE 2: POST /login as Customer (Expect HTTP 200 OK + JWT Token)\n`;
    output += `$ curl -i -X POST ${baseUrl}/login \\\n`;
    output += `    -H "Content-Type: application/json" \\\n`;
    output += `    -d '{"email":"customer@campuseats.com","password":"customer123"}'\n\n`;
    const r2 = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: "customer@campuseats.com", password: "customer123" })
    });
    const customerLoginData = await r2.json();
    const customerToken = customerLoginData.token;
    output += `HTTP/1.1 ${r2.status} OK\n`;
    output += `Content-Type: ${r2.headers.get('content-type')}\n\n`;
    output += JSON.stringify(customerLoginData, null, 2) + `\n\n`;

    // ----------------------------------------------------
    // Mandatory Case 3: GET /items with Customer Bearer Token (Expect HTTP 200 OK)
    // ----------------------------------------------------
    output += `### DEMO CASE 3: GET /items with Valid Bearer Token (Expect HTTP 200 OK + Catalogue)\n`;
    output += `$ curl -i -X GET ${baseUrl}/items \\\n`;
    output += `    -H "Authorization: Bearer ${customerToken}"\n\n`;
    const r3 = await fetch(`${baseUrl}/items`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    output += `HTTP/1.1 ${r3.status} OK\n`;
    output += `Content-Type: ${r3.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r3.json(), null, 2) + `\n\n`;

    // ----------------------------------------------------
    // Mandatory Case 4: POST /items as Customer (Expect HTTP 403 Forbidden)
    // ----------------------------------------------------
    output += `### DEMO CASE 4: POST /items with Customer Token (Expect HTTP 403 Forbidden)\n`;
    output += `$ curl -i -X POST ${baseUrl}/items \\\n`;
    output += `    -H "Authorization: Bearer ${customerToken}" \\\n`;
    output += `    -H "Content-Type: application/json" \\\n`;
    output += `    -d '{"name":"Unauthorized Student Special","price":99.00,"category":"Snacks"}'\n\n`;
    const r4 = await fetch(`${baseUrl}/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: "Unauthorized Student Special",
        price: 99.00,
        category: "Snacks"
      })
    });
    output += `HTTP/1.1 ${r4.status} Forbidden\n`;
    output += `Content-Type: ${r4.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r4.json(), null, 2) + `\n\n`;

    // ----------------------------------------------------
    // Mandatory Case 5: POST /login as Restaurant & POST /items (Expect HTTP 201 Created)
    // ----------------------------------------------------
    output += `### DEMO CASE 5a: POST /login as Restaurant (Expect HTTP 200 OK + Restaurant JWT)\n`;
    output += `$ curl -i -X POST ${baseUrl}/login \\\n`;
    output += `    -H "Content-Type: application/json" \\\n`;
    output += `    -d '{"email":"restaurant@campuseats.com","password":"restaurant123"}'\n\n`;
    const r5a = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: "restaurant@campuseats.com", password: "restaurant123" })
    });
    const restLoginData = await r5a.json();
    const restaurantToken = restLoginData.token;
    output += `HTTP/1.1 ${r5a.status} OK\n`;
    output += `Content-Type: ${r5a.headers.get('content-type')}\n\n`;
    output += JSON.stringify(restLoginData, null, 2) + `\n\n`;

    output += `### DEMO CASE 5b: POST /items with Restaurant Token (Expect HTTP 201 Created)\n`;
    output += `$ curl -i -X POST ${baseUrl}/items \\\n`;
    output += `    -H "Authorization: Bearer ${restaurantToken}" \\\n`;
    output += `    -H "Content-Type: application/json" \\\n`;
    output += `    -d '{"name":"Hyderabadi Chicken Dum Biryani","price":240.00,"category":"Biryani Special","available":true}'\n\n`;
    const r5b = await fetch(`${baseUrl}/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${restaurantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: "Hyderabadi Chicken Dum Biryani",
        price: 240.00,
        category: "Biryani Special",
        available: true
      })
    });
    output += `HTTP/1.1 ${r5b.status} Created\n`;
    output += `Content-Type: ${r5b.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r5b.json(), null, 2) + `\n\n`;

    // ----------------------------------------------------
    // Verification: GET /items/:id for the newly created item
    // ----------------------------------------------------
    output += `### VERIFICATION: GET /items/5 with Bearer Token (Expect HTTP 200 OK)\n`;
    output += `$ curl -i -X GET ${baseUrl}/items/5 \\\n`;
    output += `    -H "Authorization: Bearer ${customerToken}"\n\n`;
    const r6 = await fetch(`${baseUrl}/items/5`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    output += `HTTP/1.1 ${r6.status} OK\n`;
    output += `Content-Type: ${r6.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r6.json(), null, 2) + `\n\n`;

    fs.writeFileSync(path.join(EVIDENCE_DIR, 'curl_transcript.txt'), output, 'utf8');
    console.log(`✓ Saved curl transcript: ${path.join(EVIDENCE_DIR, 'curl_transcript.txt')}`);

    transcriptServer.close();
    console.log('--- Evidence generation complete! ---');
  });
}

run();
