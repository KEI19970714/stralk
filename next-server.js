/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("https");
const next = require("next");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dev = !process.argv.includes("--production");
const hostname = "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "certificates", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certificates", "cert.pem")),
};

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    handle(req, res);
  }).listen(port, hostname, () => {
    const lanAddresses = Object.values(os.networkInterfaces())
      .flatMap((interfaces) => interfaces ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => address.address);

    console.log(`> Ready on https://localhost:${port}`);
    lanAddresses.forEach((address) => {
      console.log(`> Network: https://${address}:${port}`);
    });
  });
});
