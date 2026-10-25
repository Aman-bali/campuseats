const { respond } = require("./negotiation");

const BASE = "https://campuseats.example.com/problems/";

const CATALOGUE = {
  "empty-cart": [422, "Cart is empty"],
  "item-unavailable": [422, "Item unavailable"],
  "payment-declined": [422, "Payment declined"],
  "order-not-found": [404, "Order not found"],
  "illegal-transition": [409, "Illegal state transition"],
  "validation-failed": [422, "Validation failed"],
  "idempotency-key-reused": [422, "Idempotency key reused"],
  "cancellation-not-found": [404, "Cancellation not found"],
  "malformed-json": [400, "Malformed JSON"],
  "unsupported-media-type": [415, "Unsupported media type"],
  "not-acceptable": [406, "Not acceptable"],
  "not-found": [404, "Not found"],
  "method-not-allowed": [405, "Method not allowed"],
  "rate-limited": [429, "Too many requests"],
  "payments-unavailable": [503, "Payments unavailable"],
  "internal-error": [500, "Internal error"],
};

const XML_CHILD_TAGS = { errors: "error" };

class ProblemError extends Error {
  constructor(slug, detail, { headers = null, errors = null } = {}) {
    super(detail);
    this.name = "ProblemError";
    if (!CATALOGUE[slug]) {
      throw new Error(`unknown problem type '${slug}' - add it to CATALOGUE`);
    }
    this.slug = slug;
    this.detail = detail;
    this.headers = headers;
    this.errors = errors;
  }
}

function renderProblem(req, res, status, slug, title, detail, headers = null, errors = null) {
  const body = {
    type: BASE + slug,
    title,
    status,
    detail,
  };
  if (errors) {
    body.errors = errors;
  }
  return respond(req, res, body, status, {
    root: "problem",
    childTags: XML_CHILD_TAGS,
    headers,
    problem: true,
  });
}

function problem(req, res, slug, detail, headers = null, errors = null) {
  const [status, title] = CATALOGUE[slug];
  return renderProblem(req, res, status, slug, title, detail, headers, errors);
}

module.exports = {
  BASE,
  CATALOGUE,
  XML_CHILD_TAGS,
  ProblemError,
  renderProblem,
  problem,
};
