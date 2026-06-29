import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const keyEnvName = "SPRH_EXTENSION_PUBLIC_KEY";
const defaultKeyPath = ".local/extension-public-key.txt";

function parseArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    skipBuild: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }

    if (arg === "--repo-root") {
      const repoRoot = argv[index + 1];

      if (!repoRoot) {
        throw new Error("--repo-root requires a path.");
      }

      options.repoRoot = resolve(repoRoot);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function formatMissingKeyMessage(repoRoot) {
  return [
    "Missing local extension public key.",
    "",
    `Create ${resolve(repoRoot, defaultKeyPath)} with the manifest public key string, or set ${keyEnvName}.`,
    "Use only the public manifest key. Do not place private key material in this file or environment variable."
  ].join("\n");
}

function normalizeManifestPublicKey(rawKey) {
  const trimmed = rawKey.trim();

  if (!trimmed) {
    throw new Error("The local extension public key is empty.");
  }

  if (/PRIVATE KEY/i.test(trimmed)) {
    throw new Error("Private key material is not allowed. Use only the public manifest key string.");
  }

  if (/-----BEGIN|-----END/i.test(trimmed)) {
    throw new Error("Use the manifest public key string without PEM headers or footers.");
  }

  const compactKey = trimmed.replace(/\s+/g, "");

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compactKey)) {
    throw new Error("The local extension public key must look like a base64 manifest key string.");
  }

  if (compactKey.length < 64 || compactKey.length % 4 !== 0) {
    throw new Error("The local extension public key is too short to look like a manifest key string.");
  }

  return compactKey;
}

async function readTextIfExists(path) {
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    return null;
  }

  return readFile(path, "utf8");
}

async function readManifestPublicKey(repoRoot, env = process.env) {
  const envKey = env[keyEnvName];

  if (envKey !== undefined) {
    return normalizeManifestPublicKey(envKey);
  }

  const keyPath = resolve(repoRoot, defaultKeyPath);
  const fileKey = await readTextIfExists(keyPath);

  if (fileKey === null) {
    throw new Error(formatMissingKeyMessage(repoRoot));
  }

  return normalizeManifestPublicKey(fileKey);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function withManifestKey(manifest, publicKey) {
  const nextManifest = {};
  let inserted = false;

  for (const [key, value] of Object.entries(manifest)) {
    nextManifest[key] = value;

    if (key === "version") {
      nextManifest.key = publicKey;
      inserted = true;
    }
  }

  if (!inserted) {
    nextManifest.key = publicKey;
  }

  return nextManifest;
}

function assertNoManifestKey(manifest, label) {
  if (Object.prototype.hasOwnProperty.call(manifest, "key")) {
    throw new Error(`${label} already contains manifest.key. Remove it before building a local stable-ID package.`);
  }
}

async function runBuild(repoRoot) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("npm", ["run", "build"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`npm run build failed with exit code ${code}.`));
    });
  });
}

async function buildLocalStableId(options) {
  const repoRoot = resolve(options.repoRoot);
  const distPath = resolve(repoRoot, "dist");
  const distManifestPath = resolve(distPath, "manifest.json");
  const distLocalPath = resolve(repoRoot, "dist-local");
  const distLocalManifestPath = resolve(distLocalPath, "manifest.json");
  const sourceManifestPath = resolve(repoRoot, "manifest.json");
  const publicKey = await readManifestPublicKey(repoRoot, options.env);

  const sourceManifest = await readJson(sourceManifestPath);
  assertNoManifestKey(sourceManifest, "Source manifest.json");

  if (!options.skipBuild) {
    await runBuild(repoRoot);
  }

  const distManifest = await readJson(distManifestPath);
  assertNoManifestKey(distManifest, "dist/manifest.json");

  await rm(distLocalPath, { recursive: true, force: true });
  await mkdir(distLocalPath, { recursive: true });
  await cp(distPath, distLocalPath, { recursive: true });

  const distLocalManifest = await readJson(distLocalManifestPath);
  const keyedManifest = withManifestKey(distLocalManifest, publicKey);
  await writeFile(distLocalManifestPath, `${JSON.stringify(keyedManifest, null, 2)}\n`);

  return {
    distLocalPath,
    distLocalManifestPath
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await buildLocalStableId(options);

  console.log(`Local stable-ID build is ready: ${result.distLocalPath}`);
  console.log(`Load unpacked path: ${result.distLocalPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
