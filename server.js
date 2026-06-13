/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { attachSocketServer } = require("./socket-server");

const certPath = path.join(__dirname, "certificates", "cert.pem");
const keyPath = path.join(__dirname, "certificates", "key.pem");
const hasHttpsCertificates = fs.existsSync(certPath) && fs.existsSync(keyPath);
const port = Number.parseInt(process.env.SOCKET_PORT || "3001", 10);

const httpServer = hasHttpsCertificates
  ? https.createServer({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    })
  : http.createServer();

attachSocketServer(httpServer);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(
    `Socket.IO server running on ${hasHttpsCertificates ? "https" : "http"}://0.0.0.0:${port}`,
  );
});
