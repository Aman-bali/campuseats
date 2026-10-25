const crypto = require("crypto");

function sortKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeys(obj[k]);
  }
  return sorted;
}

class MenuItem {
  constructor({
    id,
    restaurant_id,
    name,
    description = "",
    price_cents,
    category = "uncategorised",
    is_available = true,
    merchant_verified = true,
    created_at,
    updated_at,
    version = 1,
  }) {
    this.id = id;
    this.restaurant_id = restaurant_id;
    this.name = name;
    this.description = description;
    this.price_cents = price_cents;
    this.category = category;
    this.is_available = is_available;
    this.merchant_verified = merchant_verified;
    this.created_at = created_at;
    this.updated_at = updated_at;
    this.version = version;
  }

  get ref() {
    return "ITEM-" + this.id.slice(0, 8);
  }

  asJson() {
    return {
      itemId: this.ref,
      restaurantId: this.restaurant_id,
      name: this.name,
      description: this.description,
      price: this.price_cents / 100,
      category: this.category,
      isAvailable: this.is_available,
      createdAt: this.created_at,
      updatedAt: this.updated_at,
    };
  }

  etag() {
    const raw = JSON.stringify(sortKeys(this.asJson())) + `|v${this.version}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
    return `"${hash}"`;
  }
}

class Restaurant {
  constructor(id, name, is_open = true, version = 1) {
    this.id = id;
    this.name = name;
    this.is_open = is_open;
    this.version = version;
  }

  asJson() {
    return {
      restaurantId: this.id,
      name: this.name,
      isOpen: this.is_open,
    };
  }

  etag() {
    const raw = JSON.stringify(sortKeys(this.asJson())) + `|v${this.version}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
    return `"${hash}"`;
  }
}

module.exports = {
  MenuItem,
  Restaurant,
};
