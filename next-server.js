/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("https");
const next = require("next");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { attachSocketServer } = require("./socket-server");

const dev = !process.argv.includes("--production");
const hostname = "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "certificates", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certificates", "cert.pem")),
};

let handle;
const httpsServer = createServer(httpsOptions, (req, res) => {
  handle(req, res);
});
const app = next({
  dev,
  hostname,
  port,
  httpServer: httpsServer,
});

handle = app.getRequestHandler();
attachSocketServer(httpsServer);

app.prepare().then(() => {
  httpsServer.listen(port, hostname, () => {
    const lanAddresses = Object.values(os.networkInterfaces())
      .flatMap((interfaces) => interfaces ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => address.address);

    console.log(`> Ready on https://localhost:${port}`);
    lanAddresses.forEach((address) => {
      console.log(`> Network: https://${address}:${port}`);
    });
    console.log(`> Socket.IO: https://localhost:${port}/socket.io/`);
  });
});
