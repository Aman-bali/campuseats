const BASE = "https://campuseats.dev/errors/";

class ApiError extends Error {
  constructor(detail, headers = {}) {
    super(detail);
    this.name = this.constructor.name;
    this.status = 500;
    this.title = "Internal server error";
    this.slug = "internal";
    this.detail = detail;
    this.headers = headers || {};
  }
}

class BadRequest extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 400;
    this.title = "Malformed request body";
    this.slug = "validation-error";
  }
}

class Unauthorized extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 401;
    this.title = "Authentication required";
    this.slug = "unauthorized";
  }
}

class NotFound extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 404;
    this.title = "Resource not found";
    this.slug = "not-found";
  }
}

class NotAcceptable extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 406;
    this.title = "Not Acceptable";
    this.slug = "not-acceptable";
  }
}

class Conflict extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 409;
    this.title = "Request conflicts with current state";
    this.slug = "conflict";
  }
}

class PreconditionFailed extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 412;
    this.title = "Precondition Failed";
    this.slug = "precondition-failed";
  }
}

class UnsupportedMediaType extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 415;
    this.title = "Unsupported Media Type";
    this.slug = "unsupported-media-type";
  }
}

class Unprocessable extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 422;
    this.title = "Request refused by domain rules";
    this.slug = "domain-refusal";
  }
}

class TooManyRequests extends ApiError {
  constructor(detail, headers = {}) {
    super(detail, headers);
    this.status = 429;
    this.title = "Too Many Requests";
    this.slug = "rate-limited";
  }
}

function problem(res, status, title, slug, detail, headers = {}) {
  const body = {
    type: BASE + slug,
    title,
    status,
    detail,
  };
  res.status(status);
  res.setHeader("Content-Type", "application/problem+json");
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }
  }
  return res.json(body);
}

function render(res, err) {
  return problem(res, err.status, err.title, err.slug, err.detail, err.headers);
}

module.exports = {
  BASE,
  ApiError,
  BadRequest,
  Unauthorized,
  NotFound,
  NotAcceptable,
  Conflict,
  PreconditionFailed,
  UnsupportedMediaType,
  Unprocessable,
  TooManyRequests,
  problem,
  render,
};
