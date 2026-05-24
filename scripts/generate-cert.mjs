import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCA, createCert } from "mkcert";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const certificatesDir = join(rootDir, "certificates");
const certPath = join(certificatesDir, "cert.pem");
const keyPath = join(certificatesDir, "key.pem");
const caPath = join(certificatesDir, "ca.pem");

if (existsSync(certPath) && existsSync(keyPath)) {
  console.log("Local HTTPS certificate already exists.");
  process.exit(0);
}

const lanAddresses = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const domains = Array.from(new Set(["localhost", "127.0.0.1", ...lanAddresses]));

await mkdir(certificatesDir, { recursive: true });

const ca = await createCA({
  organization: "Stralk Local CA",
  countryCode: "US",
  state: "Local",
  locality: "Local",
  validity: 365,
});

const cert = await createCert({
  ca: { key: ca.key, cert: ca.cert },
  domains,
  validity: 365,
});

await writeFile(keyPath, cert.key);
await writeFile(certPath, `${cert.cert}${ca.cert}`);
await writeFile(caPath, ca.cert);

console.log(`Generated local HTTPS certificate for: ${domains.join(", ")}`);
