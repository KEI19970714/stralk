import { existsSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCA, createCert } from "mkcert";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const certificatesDir = join(rootDir, "certificates");
const certPath = join(certificatesDir, "cert.pem");
const keyPath = join(certificatesDir, "key.pem");
const caPath = join(certificatesDir, "ca.pem");

const lanAddresses = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const domains = Array.from(new Set(["localhost", "127.0.0.1", ...lanAddresses]));

async function hasValidCertificate() {
  if (
    !existsSync(certPath) ||
    !existsSync(keyPath) ||
    !existsSync(caPath)
  ) {
    return false;
  }

  try {
    const [certPem, caPem] = await Promise.all([
      readFile(certPath, "utf8"),
      readFile(caPath, "utf8"),
    ]);
    const certificate = new X509Certificate(certPem);
    const ca = new X509Certificate(caPem);
    const hasAllDomains = domains.every((domain) =>
      isIP(domain)
        ? certificate.checkIP(domain) === domain
        : certificate.checkHost(domain) === domain,
    );

    return (
      certificate.verify(ca.publicKey) &&
      hasAllDomains &&
      Date.parse(certificate.validTo) > Date.now()
    );
  } catch {
    return false;
  }
}

if (await hasValidCertificate()) {
  console.log("Local HTTPS certificate is valid.");
  process.exit(0);
}

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
