import { describe, expect, it } from "vitest";

import {
  applySettingsImportPreview,
  buildSettingsExportDocument,
  previewSettingsImport,
  serializeSettingsExport,
  settingsExportFormat,
  settingsExportVersion,
  type SettingsImportPreview
} from "../src/settingsBackup/settingsBackup";
import type { DomainRule } from "../src/rules/ruleTypes";
import type { LocalSettings, StorageAreaAdapter, SyncSettings } from "../src/storage/storageTypes";

type MemoryStorageArea = StorageAreaAdapter & {
  dump(): Record<string, unknown>;
};

type ReadySettingsImportPreview = Extract<SettingsImportPreview, { ok: true }>;

const createdAt = "2026-06-24T00:00:00.000Z";
const importedAt = "2026-06-29T00:00:00.000Z";

function createMemoryStorage(initialState: Record<string, unknown> = {}): MemoryStorageArea {
  let state = { ...initialState };

  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (keys === undefined || keys === null) {
        return { ...state };
      }

      if (typeof keys === "string") {
        return { [keys]: state[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, state[key]]));
      }

      return {
        ...keys,
        ...Object.fromEntries(Object.keys(keys).filter((key) => key in state).map((key) => [key, state[key]]))
      };
    },
    async set(items: Record<string, unknown>) {
      state = {
        ...state,
        ...items
      };
    },
    dump() {
      return { ...state };
    }
  };
}

function manualRule(domain: string, includeSubdomains = true): DomainRule {
  return {
    domain,
    includeSubdomains,
    action: "proxy",
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

function directRule(domain: string, includeSubdomains = true): DomainRule {
  return {
    ...manualRule(domain, includeSubdomains),
    action: "direct"
  };
}

function syncSettings(settings: Partial<SyncSettings> = {}): SyncSettings {
  return {
    rules: [],
    ignoredDomains: [],
    denylist: [],
    classificationOverrides: {
      global: {},
      site: {}
    },
    ...settings
  };
}

function localSettings(settings: Partial<LocalSettings> = {}): LocalSettings {
  return {
    deviceProxy: {
      enabled: true,
      config: {
        scheme: "socks5",
        host: "127.0.0.1",
        port: 10808
      }
    },
    diagnostics: {
      enabled: true
    },
    ...settings
  };
}

function expectReady(preview: SettingsImportPreview): ReadySettingsImportPreview {
  expect(preview.ok).toBe(true);

  if (!preview.ok) {
    throw new Error(preview.errors.join(", "));
  }

  return preview;
}

function exportJson(data: unknown): string {
  return JSON.stringify({
    format: settingsExportFormat,
    version: settingsExportVersion,
    exportedAt: "2026-06-29T00:00:00.000Z",
    data
  });
}

describe("settings export", () => {
  it("generates the versioned settings export format", () => {
    const document = buildSettingsExportDocument(
      syncSettings({
        rules: [manualRule("example.com")]
      }),
      localSettings(),
      {
        exportedAt: "2026-06-29T00:00:00.000Z"
      }
    );

    expect(document).toMatchObject({
      format: settingsExportFormat,
      version: settingsExportVersion,
      exportedAt: "2026-06-29T00:00:00.000Z",
      data: {
        syncSettings: {
          rules: [manualRule("example.com")]
        }
      }
    });
  });

  it("excludes local proxy config by default", () => {
    const exportText = serializeSettingsExport(syncSettings(), localSettings(), {
      exportedAt: "2026-06-29T00:00:00.000Z"
    });

    expect(exportText).not.toContain("localSettings");
    expect(exportText).not.toContain("127.0.0.1");
    expect(exportText).not.toContain("10808");
  });

  it("includes local proxy config only when explicitly requested", () => {
    const exportText = serializeSettingsExport(syncSettings(), localSettings(), {
      includeLocalProxyConfig: true,
      exportedAt: "2026-06-29T00:00:00.000Z"
    });

    expect(exportText).toContain("localSettings");
    expect(exportText).toContain("127.0.0.1");
    expect(exportText).toContain("10808");
  });

  it("exports direct route action values without changing format version", () => {
    const document = buildSettingsExportDocument(
      syncSettings({
        rules: [directRule("www.example.com", false)]
      }),
      localSettings(),
      {
        exportedAt: "2026-06-29T00:00:00.000Z"
      }
    );

    expect(document.version).toBe(1);
    expect(document.data.syncSettings.rules).toEqual([directRule("www.example.com", false)]);
  });

  it("exports domain-level settings without raw URLs or diagnostic session data", () => {
    const exportText = serializeSettingsExport(
      syncSettings({
        rules: [manualRule("https://Example.com/path?token=secret")],
        ignoredDomains: ["https://ignored.example/path?private=1"],
        denylist: ["https://blocked.example/path"],
        classificationOverrides: {
          global: {
            "https://assets.example.net/file.js?secret=1": "ignored"
          },
          site: {
            "https://site.example/path": {
              "https://cdn.example.net/asset.png?token=secret": "suggested"
            }
          }
        }
      }),
      localSettings(),
      {
        exportedAt: "2026-06-29T00:00:00.000Z"
      }
    );

    expect(exportText).toContain("example.com");
    expect(exportText).toContain("ignored.example");
    expect(exportText).toContain("blocked.example");
    expect(exportText).toContain("assets.example.net");
    expect(exportText).toContain("cdn.example.net");
    expect(exportText).not.toContain("/path");
    expect(exportText).not.toContain("token=secret");
    expect(exportText).not.toContain("private=1");
    expect(exportText).not.toContain("diagnostics");
    expect(exportText).not.toContain("relatedDomainRecordingSession");
  });
});

describe("settings import preview", () => {
  it("rejects malformed JSON without creating a preview", () => {
    const preview = previewSettingsImport("{not-json", syncSettings(), localSettings(), importedAt);

    expect(preview).toMatchObject({
      ok: false,
      errors: ["Import JSON could not be parsed."]
    });
  });

  it("rejects wrong format and unsupported version", () => {
    const preview = previewSettingsImport(
      JSON.stringify({
        format: "other-format",
        version: 99,
        data: {
          syncSettings: {}
        }
      }),
      syncSettings(),
      localSettings(),
      importedAt
    );

    expect(preview.ok).toBe(false);
    expect(preview.errors).toContain("Import JSON is not a Smart Proxy Route Helper settings export.");
    expect(preview.errors).toContain("Import JSON uses an unsupported settings export version.");
  });

  it("sanitizes domains and rejects internal or private imported domains", () => {
    const preview = expectReady(
      previewSettingsImport(
        exportJson({
          syncSettings: {
            rules: [
              {
                domain: "https://Example.com/path?token=secret",
                includeSubdomains: true,
                mode: "proxy"
              },
              {
                domain: "192.168.1.1",
                includeSubdomains: true,
                mode: "proxy"
              },
              {
                domain: "chrome://extensions",
                includeSubdomains: true,
                mode: "proxy"
              }
            ],
            ignoredDomains: ["ignored.example", "localhost"],
            denylist: ["blocked.example", "10.0.0.1"],
            classificationOverrides: {
              global: {
                "https://Track.Example/path?secret=1": "review",
                "router.local": "ignored"
              },
              site: {
                "https://Site.Example/page": {
                  "https://cdn.example.net/script.js?token=1": "suggested",
                  "172.16.0.1": "ignored"
                }
              }
            }
          }
        }),
        syncSettings(),
        localSettings(),
        importedAt
      )
    );

    expect(preview.nextSyncSettings.rules).toEqual([
      {
        domain: "example.com",
        includeSubdomains: true,
        action: "proxy",
        mode: "proxy",
        source: "import",
        createdAt: importedAt
      }
    ]);
    expect(preview.nextSyncSettings.ignoredDomains).toEqual(["ignored.example"]);
    expect(preview.nextSyncSettings.denylist).toEqual(["blocked.example"]);
    expect(preview.nextSyncSettings.classificationOverrides).toEqual({
      global: {
        "track.example": "review"
      },
      site: {
        "site.example": {
          "cdn.example.net": "suggested"
        }
      }
    });
    expect(JSON.stringify(preview.nextSyncSettings)).not.toContain("token=secret");
    expect(preview.summary.routeRules.skipped).toBe(2);
    expect(preview.summary.classificationOverrides.skipped).toBe(2);
  });

  it("merges imported settings and avoids duplicate route rules", () => {
    const preview = expectReady(
      previewSettingsImport(
        exportJson({
          syncSettings: {
            rules: [
              {
                domain: "example.com",
                includeSubdomains: true,
                mode: "proxy"
              },
              {
                domain: "new.example",
                includeSubdomains: false,
                mode: "proxy"
              }
            ],
            classificationOverrides: {
              global: {
                "track.example": "ignored"
              },
              site: {}
            }
          }
        }),
        syncSettings({
          rules: [manualRule("example.com", true)],
          classificationOverrides: {
            global: {
              "track.example": "review"
            },
            site: {}
          }
        }),
        localSettings(),
        importedAt
      )
    );

    expect(preview.summary.routeRules).toMatchObject({
      importable: 2,
      added: 1,
      duplicates: 1
    });
    expect(preview.nextSyncSettings.rules).toEqual([
      manualRule("example.com", true),
      {
        domain: "new.example",
        includeSubdomains: false,
        action: "proxy",
        mode: "proxy",
        source: "import",
        createdAt: importedAt
      }
    ]);
    expect(preview.nextSyncSettings.classificationOverrides.global).toEqual({
      "track.example": "ignored"
    });
    expect(preview.summary.classificationOverrides.addedOrUpdated).toBe(1);
  });

  it("imports direct actions and rejects malformed action values", () => {
    const preview = expectReady(
      previewSettingsImport(
        exportJson({
          syncSettings: {
            rules: [
              {
                domain: "www.example.com",
                includeSubdomains: false,
                action: "direct",
                mode: "proxy"
              },
              {
                domain: "bad-action.example",
                includeSubdomains: true,
                action: "vpn",
                mode: "proxy"
              }
            ]
          }
        }),
        syncSettings(),
        localSettings(),
        importedAt
      )
    );

    expect(preview.nextSyncSettings.rules).toEqual([
      {
        ...directRule("www.example.com", false),
        source: "import",
        createdAt: importedAt
      }
    ]);
    expect(preview.summary.routeRules.skipped).toBe(1);
  });

  it("previews local proxy import only when the export includes local settings", () => {
    const withoutLocal = expectReady(
      previewSettingsImport(exportJson({ syncSettings: {} }), syncSettings(), localSettings(), importedAt)
    );

    const withLocal = expectReady(
      previewSettingsImport(
        exportJson({
          syncSettings: {},
          localSettings: {
            deviceProxy: {
              enabled: true,
              config: {
                scheme: "http",
                host: "127.0.0.1",
                port: 8080
              }
            }
          }
        }),
        syncSettings(),
        localSettings(),
        importedAt
      )
    );

    expect(withoutLocal.nextLocalSettings).toBeNull();
    expect(withoutLocal.summary.localProxyWillBeApplied).toBe(false);
    expect(withLocal.nextLocalSettings?.deviceProxy).toEqual({
      enabled: true,
      config: {
        scheme: "http",
        host: "127.0.0.1",
        port: 8080
      }
    });
    expect(withLocal.summary.localProxyWillBeApplied).toBe(true);
  });
});

describe("settings import apply", () => {
  it("does not write storage while only previewing an import", () => {
    const syncStorage = createMemoryStorage({
      rules: [manualRule("existing.example")]
    });
    const localStorage = createMemoryStorage({
      deviceProxy: {
        enabled: true,
        config: {
          scheme: "socks5",
          host: "127.0.0.1",
          port: 10808
        }
      },
      diagnostics: {
        enabled: false
      }
    });

    expectReady(
      previewSettingsImport(
        exportJson({
          syncSettings: {
            rules: [
              {
                domain: "new.example",
                includeSubdomains: true,
                mode: "proxy"
              }
            ]
          }
        }),
        syncSettings({
          rules: [manualRule("existing.example")]
        }),
        localSettings({
          diagnostics: {
            enabled: false
          }
        }),
        importedAt
      )
    );

    expect(syncStorage.dump()).toEqual({
      rules: [manualRule("existing.example")]
    });
    expect(localStorage.dump()).toEqual({
      deviceProxy: {
        enabled: true,
        config: {
          scheme: "socks5",
          host: "127.0.0.1",
          port: 10808
        }
      },
      diagnostics: {
        enabled: false
      }
    });
  });

  it("writes imported settings only after explicit apply", async () => {
    const syncStorage = createMemoryStorage({
      rules: [manualRule("existing.example")],
      ignoredDomains: [],
      denylist: [],
      classificationOverrides: {
        global: {},
        site: {}
      }
    });
    const localStorage = createMemoryStorage({
      deviceProxy: {
        enabled: false,
        config: null
      },
      diagnostics: {
        enabled: true
      }
    });
    const preview = expectReady(
      previewSettingsImport(
        exportJson({
          syncSettings: {
            rules: [
              {
                domain: "new.example",
                includeSubdomains: true,
                mode: "proxy"
              }
            ],
            classificationOverrides: {
              global: {
                "track.example": "ignored"
              },
              site: {}
            }
          },
          localSettings: {
            deviceProxy: {
              enabled: true,
              config: {
                scheme: "http",
                host: "127.0.0.1",
                port: 8080
              }
            }
          }
        }),
        syncSettings({
          rules: [manualRule("existing.example")]
        }),
        localSettings({
          deviceProxy: {
            enabled: false,
            config: null
          },
          diagnostics: {
            enabled: true
          }
        }),
        importedAt
      )
    );

    expect(syncStorage.dump()).toEqual({
      rules: [manualRule("existing.example")],
      ignoredDomains: [],
      denylist: [],
      classificationOverrides: {
        global: {},
        site: {}
      }
    });

    const result = await applySettingsImportPreview(preview, {
      syncStorage,
      localStorage
    });

    expect(result.syncSettings.rules).toEqual([
      manualRule("existing.example"),
      {
        domain: "new.example",
        includeSubdomains: true,
        action: "proxy",
        mode: "proxy",
        source: "import",
        createdAt: importedAt
      }
    ]);
    expect(syncStorage.dump()).toEqual(result.syncSettings);
    expect(localStorage.dump()).toEqual({
      deviceProxy: {
        enabled: true,
        config: {
          scheme: "http",
          host: "127.0.0.1",
          port: 8080
        }
      },
      diagnostics: {
        enabled: true
      }
    });
  });

  it("does not write storage for malformed JSON", async () => {
    const syncStorage = createMemoryStorage({
      rules: [manualRule("existing.example")]
    });
    const preview = previewSettingsImport("{bad", syncSettings(), localSettings(), importedAt);

    await expect(applySettingsImportPreview(preview, { syncStorage })).rejects.toThrow(
      "Preview a valid settings import before applying it."
    );
    expect(syncStorage.dump()).toEqual({
      rules: [manualRule("existing.example")]
    });
  });
});
