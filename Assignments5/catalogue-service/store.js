const { Restaurant } = require("./models");

class Store {
  constructor() {
    this.items = new Map(); // ref -> MenuItem
    this.idem = new Map();  // `${restaurantId}:${key}` -> { body, etag, location }
    this.restaurants = new Map([
      ["rest-001", new Restaurant("rest-001", "Main Canteen")],
      ["rest-002", new Restaurant("rest-002", "Hostel Cafe")],
    ]);
  }
}

module.exports = {
  Store,
};
