const RETRYABLE_STATUS = new Set([502, 503, 504]);

class PaymentDeclined extends Error {
  constructor(detail) {
    super(detail);
    this.name = "PaymentDeclined";
    this.detail = detail;
  }
}

class PaymentsUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = "PaymentsUnavailable";
  }
}

function detailFromResponse(res) {
  try {
    const data = typeof res.json === "function" ? res.json() : res.data;
    if (data && typeof data.then === "function") {
      // Async
      return "Payment declined";
    }
    return (data && data.detail) || "Payment declined";
  } catch {
    return "Payment declined";
  }
}

class PaymentsClient {
  constructor({
    baseUrl = null,
    attempts = 4,
    baseDelay = 0.2,
    maxDelay = 2.0,
    timeout = 3000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    session = null,
  } = {}) {
    this.baseUrl = baseUrl || process.env.PAYMENTS_URL;
    this.attempts = attempts;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.timeout = timeout;
    this.sleep = sleep;
    this.session = session;
  }

  _backoff(attempt) {
    const cap = Math.min(this.maxDelay, this.baseDelay * Math.pow(2, attempt));
    return Math.random() * cap;
  }

  async charge(orderRef, amount, currency, cardToken, idempotencyKey) {
    if (!this.baseUrl) {
      throw new PaymentsUnavailable("PAYMENTS_URL is not configured");
    }
    const url = `${this.baseUrl.replace(/\/+$/, "")}/payments`;
    const payload = {
      orderRef,
      amount: String(amount),
      currency,
      cardToken,
    };
    const headers = { "Idempotency-Key": idempotencyKey };

    let last = "no attempt made";

    for (let attempt = 0; attempt < this.attempts; attempt++) {
      try {
        let r;
        if (this.session && typeof this.session.post === "function") {
          // Supports test mocks: post(url, { json, headers, timeout }) or post(url, json, headers, timeout)
          if (this.session.post.length <= 2) {
            r = await this.session.post(url, { json: payload, headers, timeout: this.timeout });
          } else {
            r = await this.session.post(url, payload, headers, this.timeout);
          }
        } else {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeout);
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timer);
          const jsonBody = await response.json().catch(() => ({}));
          r = {
            status_code: response.status,
            statusCode: response.status,
            status: response.status,
            json: () => jsonBody,
          };
        }

        const statusCode = r.status_code || r.statusCode || r.status;
        if (statusCode === 200 || statusCode === 201) {
          return typeof r.json === "function" ? await r.json() : r.data;
        }
        if (statusCode === 422) {
          const d = typeof r.json === "function" ? (await r.json()).detail : "Payment declined";
          throw new PaymentDeclined(d || "Payment declined");
        }
        if (statusCode >= 400 && statusCode < 500) {
          throw new PaymentsUnavailable(`Payments rejected the request with ${statusCode}`);
        }
        if (RETRYABLE_STATUS.has(statusCode)) {
          last = `HTTP ${statusCode}`;
        } else {
          throw new PaymentsUnavailable(`unexpected HTTP ${statusCode}`);
        }
      } catch (exc) {
        if (exc instanceof PaymentDeclined || exc instanceof PaymentsUnavailable) {
          throw exc;
        }
        last = exc.name || "NetworkError";
      }

      if (attempt < this.attempts - 1) {
        const delay = this._backoff(attempt);
        if (typeof this.sleep === "function") {
          await this.sleep(delay * 1000);
        }
      }
    }

    throw new PaymentsUnavailable(
      `Payments unreachable after ${this.attempts} attempts (${last})`
    );
  }
}

module.exports = {
  PaymentDeclined,
  PaymentsUnavailable,
  PaymentsClient,
};
