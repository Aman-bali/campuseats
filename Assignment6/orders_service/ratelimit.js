class RateLimiter {
  constructor(maxRequests = 60, window = 60.0, clock = null) {
    this.max = maxRequests;
    this.window = window;
    this.clock = clock || (() => Date.now() / 1000);
    this._hits = new Map(); // client -> [start, count]
  }

  check(client) {
    const now = this.clock();
    if (this._hits.size > 10000) {
      for (const [k, v] of this._hits.entries()) {
        if (now - v[0] >= this.window) {
          this._hits.delete(k);
        }
      }
    }
    let entry = this._hits.get(client);
    if (!entry) {
      entry = [now, 0];
    }
    let [start, count] = entry;
    if (now - start >= this.window) {
      start = now;
      count = 0;
    }
    if (count >= this.max) {
      const retryAfter = Math.max(1, Math.ceil(start + this.window - now));
      return [false, retryAfter];
    }
    this._hits.set(client, [start, count + 1]);
    return [true, 0];
  }
}

module.exports = {
  RateLimiter,
};
