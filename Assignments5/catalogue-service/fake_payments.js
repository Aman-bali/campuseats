const http = require("http");

const server = http.createServer((req, res) => {
  const ok = req.url === "/health";
  const body = ok ? JSON.stringify({ status: "ok" }) : JSON.stringify({ error: "not found" });
  res.writeHead(ok ? 200 : 404, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
});

if (require.main === module) {
  server.listen(5001, "127.0.0.1", () => {
    console.log("Fake payments listening on 127.0.0.1:5001");
  });
}

module.exports = server;
