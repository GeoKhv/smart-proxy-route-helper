import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedPermissions = ["proxy", "storage", "activeTab", "scripting"];
const forbiddenManifestPermissions = new Set(["<all_urls>", "webRequest", "webNavigation", "debugger"]);
const forbiddenArchivePrefixes = ["dist/", "src/", "tests/", "docs/", ".git/", "node_modules/", ".local/", "dist-local/"];

function fail(message) {
  throw new Error(message);
}

function sameValues(left, right) {
  return [...left].sort().join("\0") === [...right].sort().join("\0");
}

function assertManifestSurface(manifest, label) {
  if (!Array.isArray(manifest.permissions) || !sameValues(manifest.permissions, expectedPermissions)) {
    fail(`${label} permissions must be exactly: ${expectedPermissions.join(", ")}.`);
  }

  if (
    "host_permissions" in manifest ||
    "optional_host_permissions" in manifest ||
    "content_scripts" in manifest
  ) {
    fail(`${label} must not declare host permissions or content scripts.`);
  }

  const serialized = JSON.stringify(manifest);

  for (const permission of forbiddenManifestPermissions) {
    if (serialized.includes(`"${permission}"`)) {
      fail(`${label} contains forbidden manifest value ${permission}.`);
    }
  }
}

function listStoredZipEntries(buffer) {
  const entries = [];
  let offset = 0;

  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (compressionMethod !== 0 || dataEnd > buffer.length) {
      fail("Release ZIP contains an unsupported or truncated entry.");
    }

    entries.push({
      name: buffer.subarray(nameStart, nameStart + nameLength).toString("utf8"),
      data: buffer.subarray(dataStart, dataEnd)
    });
    offset = dataEnd;
  }

  return entries;
}

const packageJson = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(rootDir, "manifest.json"), "utf8"));
const packageLock = JSON.parse(await readFile(join(rootDir, "package-lock.json"), "utf8"));

if (
  manifest.version !== packageJson.version ||
  packageLock.version !== packageJson.version ||
  packageLock.packages?.[""]?.version !== packageJson.version
) {
  fail("manifest.json, package.json, and package-lock.json versions must match.");
}

assertManifestSurface(manifest, "Source manifest");

const archivePath = join(rootDir, "release", `smart-proxy-route-helper-v${packageJson.version}.zip`);
const entries = listStoredZipEntries(await readFile(archivePath));
const entryNames = entries.map((entry) => entry.name);

if (entryNames.length === 0 || !entryNames.includes("manifest.json")) {
  fail("Release ZIP must contain manifest.json at the archive root.");
}

for (const name of entryNames) {
  const lowerName = name.toLowerCase();
  const fileName = basename(lowerName);

  if (
    forbiddenArchivePrefixes.some((prefix) => lowerName.startsWith(prefix)) ||
    lowerName.endsWith(".map") ||
    fileName === ".env" ||
    fileName.startsWith(".env.") ||
    lowerName.endsWith(".pem") ||
    lowerName.endsWith(".key") ||
    fileName === "id_rsa" ||
    fileName === "id_ed25519"
  ) {
    fail(`Release ZIP contains a forbidden file: ${name}`);
  }
}

const packagedManifest = JSON.parse(entries.find((entry) => entry.name === "manifest.json").data.toString("utf8"));

if (packagedManifest.version !== packageJson.version) {
  fail("Packaged manifest version does not match package.json.");
}

assertManifestSurface(packagedManifest, "Packaged manifest");

console.log(`Validated release surface for v${packageJson.version}: ${entries.length} packaged files.`);
