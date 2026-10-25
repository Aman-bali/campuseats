const { BadRequest } = require("./errors");

const CATEGORIES = ["starters", "mains", "desserts", "beverages", "snacks", "uncategorised"];
const SORT_FIELDS = {
  name: "name",
  price: "price_cents",
  createdAt: "created_at",
};

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequest("Body must be a JSON object.");
  }
}

function parsePriceCents(value) {
  if (typeof value === "boolean" || typeof value !== "number" || Number.isNaN(value)) {
    throw new BadRequest("`price` must be a number.");
  }
  if (value <= 0) {
    throw new BadRequest("`price` must be greater than zero.");
  }
  return Math.round(value * 100);
}

function parseName(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequest("`name` is required and must be a non-empty string.");
  }
  if (value.length > 120) {
    throw new BadRequest("`name` must be at most 120 characters.");
  }
  return value.trim();
}

function parseCategory(value) {
  if (!CATEGORIES.includes(value)) {
    throw new BadRequest(`\`category\` must be one of ${CATEGORIES.join(", ")}.`);
  }
  return value;
}

function parseDescription(value) {
  if (typeof value !== "string") {
    throw new BadRequest("`description` must be a string.");
  }
  return value;
}

function validateCreateMenuItem(body) {
  requireObject(body);
  if (!("name" in body) || !("price" in body)) {
    throw new BadRequest("`name` and `price` are required.");
  }
  const isAvailable = "isAvailable" in body ? body.isAvailable : true;
  if (typeof isAvailable !== "boolean") {
    throw new BadRequest("`isAvailable` must be a boolean.");
  }
  return {
    name: parseName(body.name),
    price_cents: parsePriceCents(body.price),
    description: parseDescription(body.description !== undefined ? body.description : ""),
    category: parseCategory(body.category !== undefined ? body.category : "uncategorised"),
    is_available: isAvailable,
  };
}

function validateReplaceMenuItem(body) {
  requireObject(body);
  if ("isAvailable" in body) {
    throw new BadRequest("`isAvailable` cannot be set here; use PATCH /menu-items/{id}/availability.");
  }
  if (!("name" in body) || !("price" in body)) {
    throw new BadRequest("`name` and `price` are required for a full replacement.");
  }
  return {
    name: parseName(body.name),
    price_cents: parsePriceCents(body.price),
    description: parseDescription(body.description !== undefined ? body.description : ""),
    category: parseCategory(body.category !== undefined ? body.category : "uncategorised"),
  };
}

function validateAvailabilityUpdate(body) {
  requireObject(body);
  if (typeof body.isAvailable !== "boolean") {
    throw new BadRequest("`isAvailable` is required and must be a boolean.");
  }
  return body.isAvailable;
}

function validateListParams(args) {
  const out = {};
  if ("category" in args) {
    out.category = parseCategory(args.category);
  }
  if ("available" in args) {
    if (args.available !== "true" && args.available !== "false") {
      throw new BadRequest("`available` must be 'true' or 'false'.");
    }
    out.available = args.available === "true";
  }
  out.restaurantId = args.restaurantId || null;
  out.query = (args.query || "").trim().toLowerCase() || null;

  const sort = args.sort || "createdAt";
  if (!SORT_FIELDS[sort]) {
    throw new BadRequest(`\`sort\` must be one of ${Object.keys(SORT_FIELDS).join(", ")}.`);
  }
  out.sort = SORT_FIELDS[sort];

  const order = args.order || "asc";
  if (order !== "asc" && order !== "desc") {
    throw new BadRequest("`order` must be 'asc' or 'desc'.");
  }
  out.desc = order === "desc";

  const rawLimit = args.limit !== undefined ? args.limit : "20";
  const rawOffset = args.offset !== undefined ? args.offset : "0";

  const limit = Number(rawLimit);
  const offset = Number(rawOffset);

  if (!Number.isInteger(limit) || !Number.isInteger(offset) || Number.isNaN(limit) || Number.isNaN(offset)) {
    throw new BadRequest("`limit` and `offset` must be integers.");
  }
  if (limit < 1 || limit > 100) {
    throw new BadRequest("`limit` must be between 1 and 100.");
  }
  if (offset < 0) {
    throw new BadRequest("`offset` must be zero or greater.");
  }

  out.limit = limit;
  out.offset = offset;
  return out;
}

module.exports = {
  CATEGORIES,
  SORT_FIELDS,
  validateCreateMenuItem,
  validateReplaceMenuItem,
  validateAvailabilityUpdate,
  validateListParams,
};
