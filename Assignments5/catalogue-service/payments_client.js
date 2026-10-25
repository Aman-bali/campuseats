let customChecker = null;

function setPaymentsHealthChecker(fn) {
  customChecker = fn;
}

async function checkPaymentsHealth() {
  if (customChecker) {
    return customChecker();
  }
  const base = process.env.PAYMENTS_SERVICE_URL;
  if (!base) {
    return true;
  }
  const backoff = parseFloat(process.env.PAYMENTS_BACKOFF_BASE || "0.2");
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${base.replace(/\/+$/, "")}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status < 500) {
        return res.status === 200;
      }
    } catch {
      // Retry
    }
    if (attempt < MAX_RETRIES) {
      const delay = Math.random() * (backoff * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
  }
  return false;
}

module.exports = {
  checkPaymentsHealth,
  setPaymentsHealthChecker,
};
