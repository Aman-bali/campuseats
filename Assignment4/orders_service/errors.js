const BASE = "https://campuseats.example.com/problems/";

function problem(res, status, slug, title, detail, headers = {}) {
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

module.exports = {
  BASE,
  problem,
};
