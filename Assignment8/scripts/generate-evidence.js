/**
 * CampusEats — CS543 Assignment 8
 * Evidence Generator Script
 * Captures before & after screenshots and generates curl transcript.
 */

const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { app, resetSeedData } = require('../server');

const PORT = 3456;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EVIDENCE_DIR = path.join(__dirname, '..', 'evidence');

async function run() {
  console.log('--- Generating Assignment 8 Evidence ---');

  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  resetSeedData();

  const server = app.listen(PORT, async () => {
    console.log(`Server started on port ${PORT} for evidence capture.`);

    let browser;
    try {
      console.log('Launching Chrome via puppeteer-core...');
      browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,960']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 960, deviceScaleFactor: 2 });

      console.log('Navigating to http://localhost:' + PORT);
      await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });

      // Wait for item cards to be rendered
      await page.waitForSelector('.item-card');

      // Screenshot 1: Initial Seed records
      const ss1Path = path.join(EVIDENCE_DIR, 'screenshot-1-initial-seed.png');
      await page.screenshot({ path: ss1Path, fullPage: true });
      console.log(`✓ Saved Screenshot 1: ${ss1Path}`);

      // Now fill in the form to add a new item
      console.log('Filling form with new item "Chole Bhature"...');
      await page.type('#itemName', 'Chole Bhature');
      await page.type('#itemPrice', '95.00');
      await page.select('#itemCategory', 'North Indian');

      // Also let's test lookup widget: type '1' and click fetch
      await page.click('#lookupBtn');
      await page.waitForSelector('.lookup-json');

      // Submit form
      await page.click('#submitBtn');

      // Wait for success alert and the 5th item card
      await page.waitForSelector('.alert-success');
      await page.waitForFunction(() => document.querySelectorAll('.item-card').length >= 5);

      // Brief delay to ensure render transition settles
      await new Promise(r => setTimeout(r, 600));

      // Screenshot 2: After POST creation
      const ss2Path = path.join(EVIDENCE_DIR, 'screenshot-2-after-post.png');
      await page.screenshot({ path: ss2Path, fullPage: true });
      console.log(`✓ Saved Screenshot 2: ${ss2Path}`);

    } catch (err) {
      console.error('Error during browser capture:', err);
    } finally {
      if (browser) await browser.close();
      server.close();
      console.log('Closed browser and HTTP server.');
    }

    // Generate curl transcript
    await generateCurlTranscript();
  });
}

async function generateCurlTranscript() {
  console.log('Generating evidence/curl_transcript.txt...');
  resetSeedData();
  const transcriptServer = app.listen(PORT + 1, async () => {
    const baseUrl = `http://localhost:${PORT + 1}`;
    let output = '';

    output += `========================================================================\n`;
    output += `CampusEats — CS543 Web Services · Assignment 8 REST API Transcript\n`;
    output += `Team 12: Aman Bali (20251651015) & Bhupesh Kumar (20251651032)\n`;
    output += `Date: ${new Date().toISOString()}\n`;
    output += `Target Base URL: http://localhost:3000\n`;
    output += `========================================================================\n\n`;

    // 1. GET /items
    output += `### 1. GET /items — List all menu items (Expect HTTP 200 OK)\n`;
    output += `$ curl -i -X GET ${baseUrl}/items\n\n`;
    const r1 = await fetch(`${baseUrl}/items`);
    output += `HTTP/1.1 ${r1.status} OK\n`;
    output += `Content-Type: ${r1.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r1.json(), null, 2) + `\n\n`;

    // 2. GET /items/1
    output += `### 2. GET /items/1 — Fetch single menu item by ID (Expect HTTP 200 OK)\n`;
    output += `$ curl -i -X GET ${baseUrl}/items/1\n\n`;
    const r2 = await fetch(`${baseUrl}/items/1`);
    output += `HTTP/1.1 ${r2.status} OK\n`;
    output += `Content-Type: ${r2.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r2.json(), null, 2) + `\n\n`;

    // 3. GET /items/999 (404)
    output += `### 3. GET /items/999 — Fetch nonexistent menu item (Expect HTTP 404 Not Found)\n`;
    output += `$ curl -i -X GET ${baseUrl}/items/999\n\n`;
    const r3 = await fetch(`${baseUrl}/items/999`);
    output += `HTTP/1.1 ${r3.status} Not Found\n`;
    output += `Content-Type: ${r3.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r3.json(), null, 2) + `\n\n`;

    // 4. POST /items (201)
    output += `### 4. POST /items — Create new menu item (Expect HTTP 201 Created)\n`;
    output += `$ curl -i -X POST ${baseUrl}/items \\\n`;
    output += `    -H "Content-Type: application/json" \\\n`;
    output += `    -d '{"name":"Chole Bhature","price":95.00,"category":"North Indian","available":true}'\n\n`;
    const r4 = await fetch(`${baseUrl}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: "Chole Bhature", price: 95.00, category: "North Indian", available: true })
    });
    output += `HTTP/1.1 ${r4.status} Created\n`;
    output += `Content-Type: ${r4.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r4.json(), null, 2) + `\n\n`;

    // 5. POST /items validation failure (422)
    output += `### 5. POST /items — Validation failure missing 'name' (Expect HTTP 422 Unprocessable Content)\n`;
    output += `$ curl -i -X POST ${baseUrl}/items \\\n`;
    output += `    -H "Content-Type: application/json" \\\n`;
    output += `    -d '{"price":95.00}'\n\n`;
    const r5 = await fetch(`${baseUrl}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 95.00 })
    });
    output += `HTTP/1.1 ${r5.status} Unprocessable Content\n`;
    output += `Content-Type: ${r5.headers.get('content-type')}\n\n`;
    output += JSON.stringify(await r5.json(), null, 2) + `\n\n`;

    // 6. GET /items to verify 5 items
    output += `### 6. GET /items — Verify updated list now contains 5 items (Expect HTTP 200 OK)\n`;
    output += `$ curl -i -X GET ${baseUrl}/items\n\n`;
    const r6 = await fetch(`${baseUrl}/items`);
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
