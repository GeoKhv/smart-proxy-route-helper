import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptsDir, "..");
const distDir = join(rootDir, "dist");
const releaseDir = join(rootDir, "release");
const manifestPath = join(distDir, "manifest.json");

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  });
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();

  return { time, day };
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function shouldPackageFile(path) {
  const normalized = path.split(sep).join("/");

  return !normalized.includes("/node_modules/")
    && !normalized.endsWith(".map")
    && !normalized.includes(".env")
    && !basename(normalized).startsWith(".");
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile() && shouldPackageFile(path)) {
      files.push(path);
    }
  }

  return files;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const { time, day } = dosDateTime(entry.modifiedAt);

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(time),
      uint16(day),
      uint32(checksum),
      uint32(entry.data.length),
      uint32(entry.data.length),
      uint16(name.length),
      uint16(0),
      name
    ]);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(time),
      uint16(day),
      uint32(checksum),
      uint32(entry.data.length),
      uint32(entry.data.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      name
    ]);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

async function main() {
  const rawManifest = await readFile(manifestPath, "utf8").catch(() => {
    throw new Error("Build output is missing. Run npm run build before npm run package.");
  });
  const manifest = JSON.parse(rawManifest);
  const version = manifest.version;

  if (typeof version !== "string" || version.length === 0) {
    throw new Error("dist/manifest.json is missing a valid version.");
  }

  const files = await listFiles(distDir);
  const entries = await Promise.all(files.map(async (path) => {
    const info = await stat(path);
    return {
      name: relative(distDir, path).split(sep).join("/"),
      data: await readFile(path),
      modifiedAt: info.mtime
    };
  }));

  if (entries.length === 0) {
    throw new Error("Build output is empty.");
  }

  await mkdir(releaseDir, { recursive: true });

  const outputPath = join(releaseDir, `smart-proxy-route-helper-v${version}.zip`);
  await writeFile(outputPath, createZip(entries.sort((left, right) => left.name.localeCompare(right.name))));

  console.log(`Packaged ${entries.length} files into ${relative(rootDir, outputPath)}.`);
}

await main();
