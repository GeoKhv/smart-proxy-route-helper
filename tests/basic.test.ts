import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ExtensionManifest = {
  manifest_version: number;
  name?: string;
  version?: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
  icons?: Record<string, string>;
};

type PackageJson = {
  version?: string;
};

const manifestPath = resolve(__dirname, "../manifest.json");
const packageJsonPath = resolve(__dirname, "../package.json");

async function readManifest(): Promise<ExtensionManifest> {
  const rawManifest = await readFile(manifestPath, "utf8");
  return JSON.parse(rawManifest) as ExtensionManifest;
}

async function readPackageJson(): Promise<PackageJson> {
  const rawPackageJson = await readFile(packageJsonPath, "utf8");
  return JSON.parse(rawPackageJson) as PackageJson;
}

describe("extension release manifest", () => {
  it("keeps manifest and package versions aligned", async () => {
    const manifest = await readManifest();
    const packageJson = await readPackageJson();

    expect(manifest.version).toBe("0.1.0");
    expect(manifest.version).toBe(packageJson.version);
  });

  it("uses neutral release metadata", async () => {
    const manifest = await readManifest();
    const metadata = `${manifest.name ?? ""} ${manifest.description ?? ""}`.toLowerCase();

    expect(manifest.name).toBe("Smart Proxy Route Helper");
    expect(manifest.description).toContain("per-domain proxy routing");
    expect(metadata).not.toContain("bypass");
    expect(metadata).not.toContain("unblock");
    expect(metadata).not.toContain("censorship");
    expect(metadata).not.toContain("sanctions");
  });

  it("uses Manifest V3 with only the expected required permissions", async () => {
    const manifest = await readManifest();

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions?.sort()).toEqual(["activeTab", "proxy", "scripting", "storage"]);
  });

  it("does not declare host permissions or content scripts", async () => {
    const manifest = await readManifest();

    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.content_scripts ?? []).toEqual([]);
    expect(manifest.permissions ?? []).not.toContain("<all_urls>");
    expect(manifest.permissions ?? []).not.toContain("webRequest");
    expect(manifest.permissions ?? []).not.toContain("webNavigation");
  });

  it("declares bundled release icons", async () => {
    const manifest = await readManifest();

    expect(manifest.icons).toEqual({
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    });

    for (const [size, iconPath] of Object.entries(manifest.icons ?? {})) {
      const iconFile = resolve(__dirname, "../src/public", iconPath);
      const iconInfo = await stat(iconFile);

      expect(iconInfo.isFile()).toBe(true);
      expect(iconPath).toBe(`icons/icon-${size}.png`);
    }
  });
});
