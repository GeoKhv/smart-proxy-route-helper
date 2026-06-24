import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
};

const manifestPath = resolve(__dirname, "../manifest.json");

async function readManifest(): Promise<ExtensionManifest> {
  const rawManifest = await readFile(manifestPath, "utf8");
  return JSON.parse(rawManifest) as ExtensionManifest;
}

describe("extension scaffold manifest", () => {
  it("uses Manifest V3 with only the expected required permissions", async () => {
    const manifest = await readManifest();

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions?.sort()).toEqual(["activeTab", "proxy", "scripting", "storage"]);
  });

  it("does not declare host permissions or content scripts", async () => {
    const manifest = await readManifest();

    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.content_scripts ?? []).toEqual([]);
  });
});
