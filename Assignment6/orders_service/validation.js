const STATUSES = new Set(["paid", "cancelled"]);
const MAX_ITEMS = 50;
const MAX_QTY = 20;

function err(errs, field, message) {
  errs.push({ field, message });
}

function nonEmptyStr(body, key, errs, field, maxLen = null) {
  const v = body[key];
  if (!(key in body) || v === null || v === undefined) {
    err(errs, field, "is required");
  } else if (typeof v !== "string" || !v.trim()) {
    err(errs, field, "must be a non-empty string");
  } else if (maxLen && v.length > maxLen) {
    err(errs, field, `must be at most ${maxLen} characters`);
  }
}

function isValidDecimalString(val) {
  if (typeof val !== "string" || !val.trim()) return false;
  const num = Number(val);
  return !Number.isNaN(num) && Number.isFinite(num) && num > 0;
}

function validateOrder(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [{ field: "(body)", message: "must be a JSON object" }];
  }
  const errs = [];

  nonEmptyStr(body, "studentId", errs, "studentId");
  nonEmptyStr(body, "address", errs, "address", 200);

  const tok = body.cardToken;
  if (tok === undefined || tok === null) {
    err(errs, "cardToken", "is required");
  } else if (typeof tok !== "string" || !tok.startsWith("tok_")) {
    err(errs, "cardToken", "must be a string starting with 'tok_'");
  }

  const cur = body.currency !== undefined ? body.currency : "INR";
  if (typeof cur !== "string" || cur.length !== 3) {
    err(errs, "currency", "must be a 3-letter code");
  }

  const items = body.items;
  if (items === undefined || items === null) {
    err(errs, "items", "is required");
  } else if (!Array.isArray(items)) {
    err(errs, "items", "must be an array");
  } else if (items.length === 0) {
    err(errs, "items", "must contain at least one item");
  } else if (items.length > MAX_ITEMS) {
    err(errs, "items", `must contain at most ${MAX_ITEMS} items`);
  } else {
    items.forEach((it, i) => {
      const p = `items[${i}]`;
      if (!it || typeof it !== "object" || Array.isArray(it)) {
        err(errs, p, "must be an object");
        return;
      }
      nonEmptyStr(it, "itemId", errs, `${p}.itemId`);
      nonEmptyStr(it, "name", errs, `${p}.name`);

      const q = it.quantity;
      if (q === undefined || q === null) {
        err(errs, `${p}.quantity`, "is required");
      } else if (
        typeof q !== "number" ||
        typeof q === "boolean" ||
        !Number.isInteger(q) ||
        q < 1 ||
        q > MAX_QTY
      ) {
        err(errs, `${p}.quantity`, `must be an integer between 1 and ${MAX_QTY}`);
      }

      const price = it.unitPrice;
      if (price === undefined || price === null) {
        err(errs, `${p}.unitPrice`, "is required");
      } else if (!isValidDecimalString(price)) {
        err(errs, `${p}.unitPrice`, 'must be a positive decimal string such as "60.00"');
      }
    });
  }

  return errs;
}

function cartIsEmpty(body) {
  return (
    body &&
    typeof body === "object" &&
    Array.isArray(body.items) &&
    body.items.length === 0
  );
}

function validateCancellation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [{ field: "(body)", message: "must be a JSON object" }];
  }
  const errs = [];
  const r = body.reason;
  if (r === undefined || r === null) {
    err(errs, "reason", "is required");
  } else if (typeof r !== "string" || !r.trim()) {
    err(errs, "reason", "must be a non-empty string");
  } else if (r.length > 200) {
    err(errs, "reason", "must be at most 200 characters");
  }
  return errs;
}

function validateListQuery(args) {
  const errs = [];
  const status = args.status;
  if (status && !STATUSES.has(status)) {
    const sortedStatuses = Array.from(STATUSES).sort();
    err(errs, "status", `must be one of [${sortedStatuses.map((s) => `'${s}'`).join(", ")}]`);
  }
  return errs;
}

module.exports = {
  STATUSES,
  validateOrder,
  cartIsEmpty,
  validateCancellation,
  validateListQuery,
};
