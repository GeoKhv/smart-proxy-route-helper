import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(repoRoot, "scripts/build-local-stable-id.mjs");
const fakePublicKey = "A".repeat(128);

async function createFixture() {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "sprh-local-id-"));
  const manifest = {
    manifest_version: 3,
    name: "Smart Proxy Route Helper",
    version: "0.1.0",
    permissions: ["proxy", "storage", "activeTab", "scripting"]
  };

  await mkdir(resolve(fixtureRoot, "dist"), { recursive: true });
  await writeFile(resolve(fixtureRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(fixtureRoot, "dist/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(fixtureRoot, "dist/example.js"), "export {};\n");

  return fixtureRoot;
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("local stable-ID build script", () => {
  it("injects manifest.key only into dist-local", async () => {
    const fixtureRoot = await createFixture();

    try {
      await execFileAsync("node", [scriptPath, "--skip-build", "--repo-root", fixtureRoot], {
        env: {
          ...process.env,
          SPRH_EXTENSION_PUBLIC_KEY: fakePublicKey
        }
      });

      const sourceManifest = await readJson(resolve(fixtureRoot, "manifest.json"));
      const distManifest = await readJson(resolve(fixtureRoot, "dist/manifest.json"));
      const distLocalManifest = await readJson(resolve(fixtureRoot, "dist-local/manifest.json"));

      expect(sourceManifest).not.toHaveProperty("key");
      expect(distManifest).not.toHaveProperty("key");
      expect(distLocalManifest).toMatchObject({
        key: fakePublicKey,
        permissions: ["proxy", "storage", "activeTab", "scripting"]
      });
      expect(distLocalManifest.permissions).toEqual(distManifest.permissions);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("fails clearly when the key is missing", async () => {
    const fixtureRoot = await createFixture();

    try {
      await expect(
        execFileAsync("node", [scriptPath, "--skip-build", "--repo-root", fixtureRoot], {
          env: {
            ...process.env,
            SPRH_EXTENSION_PUBLIC_KEY: undefined
          }
        })
      ).rejects.toThrow("Missing local extension public key.");
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
