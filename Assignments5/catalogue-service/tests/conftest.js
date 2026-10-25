const request = require("supertest");
const { createApp } = require("../app");

const AUTH = { Authorization: "Bearer test-token" };

function getClient(config = {}) {
  return createApp({ RATE_LIMIT: 1000, ...config });
}

function makeItemHelper(app) {
  return async function make(name = "Masala Dosa", price = 80, key = null, rid = "rest-001", extra = {}) {
    const headers = { ...AUTH };
    if (key) {
      headers["Idempotency-Key"] = key;
    }
    const req = request(app).post(`/restaurants/${rid}/menu-items`);
    for (const [k, v] of Object.entries(headers)) {
      req.set(k, v);
    }
    return await req.send({ name, price, ...extra });
  };
}

function refOf(resp) {
  const body = typeof resp.body === "string" ? JSON.parse(resp.body) : resp.body;
  return body.itemId;
}

module.exports = {
  AUTH,
  getClient,
  makeItemHelper,
  refOf,
};
