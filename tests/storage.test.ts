import { describe, expect, it } from "vitest";

import { getLocalSettings, setLocalSettings, updateLocalSettings } from "../src/storage/localStore";
import { getSyncSettings, setSyncSettings, updateSyncSettings } from "../src/storage/syncStore";
import type { StorageAreaAdapter } from "../src/storage/storageTypes";
import type { DomainRule } from "../src/rules/ruleTypes";

type MemoryStorageArea = StorageAreaAdapter & {
  dump(): Record<string, unknown>;
};

const createdAt = "2026-06-24T00:00:00.000Z";

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

describe("sync storage settings", () => {
  it("reads safe defaults from empty storage", async () => {
    await expect(getSyncSettings(createMemoryStorage())).resolves.toEqual({
      rules: [],
      ignoredDomains: [],
      denylist: [],
      classificationOverrides: {
        global: {},
        site: {}
      }
    });
  });

  it("preserves valid rules after normalizing domains", async () => {
    const settings = await getSyncSettings(
      createMemoryStorage({
        rules: [manualRule("Example.com.", true)]
      })
    );

    expect(settings.rules).toEqual([manualRule("example.com", true)]);
  });

  it("migrates old stored rules without action to proxy action", async () => {
    const settings = await getSyncSettings(
      createMemoryStorage({
        rules: [
          {
            domain: "Example.com",
            includeSubdomains: true,
            mode: "proxy",
            source: "manual",
            createdAt
          }
        ]
      })
    );

    expect(settings.rules).toEqual([manualRule("example.com", true)]);
  });

  it("filters invalid or internally protected rules", async () => {
    const settings = await getSyncSettings(
      createMemoryStorage({
        rules: [
          manualRule("example.com", true),
          manualRule("chrome://extensions", true),
          manualRule("localhost", true),
          { ...manualRule("other.test", true), includeSubdomains: "yes" },
          { ...manualRule("bad.example", true), mode: "direct" }
        ]
      })
    );

    expect(settings.rules).toEqual([manualRule("example.com", true)]);
  });

  it("preserves ignored domains and denylist entries safely", async () => {
    const settings = await getSyncSettings(
      createMemoryStorage({
        ignoredDomains: [" Example.com ", "https://sub.example.com/path", "not a host"],
        denylist: ["blocked.example", "blocked.example.", 42, "chrome://extensions"]
      })
    );

    expect(settings.ignoredDomains).toEqual(["example.com", "sub.example.com"]);
    expect(settings.denylist).toEqual(["blocked.example"]);
  });

  it("preserves valid classification overrides as synced domain-level data", async () => {
    const settings = await getSyncSettings(
      createMemoryStorage({
        classificationOverrides: {
          global: {
            "DoubleClick.net": "review",
            "noisy.example": "ignored"
          },
          site: {
            "https://Letterboxd.com/films": {
              "https://image.tmdb.org/t/p/w500/poster.jpg?token=secret": "suggested",
              "ads.example.net": "ignored"
            }
          }
        }
      })
    );

    expect(settings.classificationOverrides).toEqual({
      global: {
        "doubleclick.net": "review",
        "noisy.example": "ignored"
      },
      site: {
        "letterboxd.com": {
          "ads.example.net": "ignored",
          "image.tmdb.org": "suggested"
        }
      }
    });
    expect(JSON.stringify(settings.classificationOverrides)).not.toContain("/t/p/w500");
    expect(JSON.stringify(settings.classificationOverrides)).not.toContain("token=secret");
  });

  it("drops malformed, internal, and private classification overrides", async () => {
    const settings = await getSyncSettings(
      createMemoryStorage({
        classificationOverrides: {
          global: {
            "example.com": "ignored",
            "localhost": "ignored",
            "192.168.1.1": "review",
            "chrome://extensions": "ignored",
            "bad host": "review",
            "wrong.example": "useful"
          },
          site: {
            "example.com": {
              "assets.example.net": "suggested",
              "10.0.0.1": "ignored",
              "router.local": "ignored",
              "bad.example": "review"
            },
            "chrome://extensions": {
              "assets.example.net": "suggested"
            },
            "other.example": "not an object"
          }
        }
      })
    );

    expect(settings.classificationOverrides).toEqual({
      global: {
        "example.com": "ignored"
      },
      site: {
        "example.com": {
          "assets.example.net": "suggested"
        }
      }
    });
  });

  it("merges sync updates through the same validation path", async () => {
    const storage = createMemoryStorage({
      rules: [manualRule("example.com", false)],
      ignoredDomains: ["existing.example"],
      denylist: [],
      classificationOverrides: {
        global: {
          "doubleclick.net": "review"
        },
        site: {}
      }
    });

    const updatedSettings = await updateSyncSettings(
      (current) => ({
        rules: [...current.rules, manualRule("added.example", true)],
        ignoredDomains: [...current.ignoredDomains, "bad host"],
        classificationOverrides: {
          global: {
            ...current.classificationOverrides.global,
            "localhost": "ignored"
          },
          site: current.classificationOverrides.site
        }
      }),
      storage
    );

    expect(updatedSettings).toEqual({
      rules: [manualRule("example.com", false), manualRule("added.example", true)],
      ignoredDomains: ["existing.example"],
      denylist: [],
      classificationOverrides: {
        global: {
          "doubleclick.net": "review"
        },
        site: {}
      }
    });
    expect(storage.dump()).toEqual(updatedSettings);
  });
});

describe("local storage settings", () => {
  it("keeps device proxy settings local-only", async () => {
    const syncStorage = createMemoryStorage();
    const localStorage = createMemoryStorage();

    await setLocalSettings(
      {
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
      },
      localStorage
    );

    expect(syncStorage.dump()).toEqual({});
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

  it("normalizes invalid local proxy config to an unset disabled state", async () => {
    const settings = await getLocalSettings(
      createMemoryStorage({
        deviceProxy: {
          enabled: true,
          config: {
            scheme: "http",
            host: "127.0.0.1",
            port: 70000
          }
        }
      })
    );

    expect(settings.deviceProxy).toEqual({
      enabled: false,
      config: null
    });
  });

  it("does not preserve credential-like proxy hosts", async () => {
    const settings = await getLocalSettings(
      createMemoryStorage({
        deviceProxy: {
          enabled: true,
          config: {
            scheme: "http",
            host: "user:password@127.0.0.1",
            port: 8080
          }
        }
      })
    );

    expect(settings.deviceProxy).toEqual({
      enabled: false,
      config: null
    });
  });

  it("keeps diagnostics disabled by default", async () => {
    await expect(getLocalSettings(createMemoryStorage())).resolves.toEqual({
      deviceProxy: {
        enabled: false,
        config: null
      },
      diagnostics: {
        enabled: false
      }
    });
  });

  it("merges local updates without syncing proxy details", async () => {
    const storage = createMemoryStorage({
      deviceProxy: {
        enabled: false,
        config: {
          scheme: "http",
          host: " 127.0.0.1 ",
          port: 8080
        }
      },
      diagnostics: {
        enabled: false
      }
    });

    const updatedSettings = await updateLocalSettings(
      {
        diagnostics: {
          enabled: true
        }
      },
      storage
    );

    expect(updatedSettings).toEqual({
      deviceProxy: {
        enabled: false,
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
});

describe("storage writes", () => {
  it("sanitizes full sync writes before storing them", async () => {
    const storage = createMemoryStorage();

    await setSyncSettings(
      {
        rules: [manualRule("Example.com", true), manualRule("localhost", true)],
        ignoredDomains: ["Ignored.example", "bad host"],
        denylist: ["Denied.example"],
        classificationOverrides: {
          global: {
            "Track.Example": "ignored",
            "127.0.0.1": "review"
          },
          site: {
            "Example.com": {
              "https://assets.example.net/path?secret=1": "suggested"
            }
          }
        }
      },
      storage
    );

    expect(storage.dump()).toEqual({
      rules: [manualRule("example.com", true)],
      ignoredDomains: ["ignored.example"],
      denylist: ["denied.example"],
      classificationOverrides: {
        global: {
          "track.example": "ignored"
        },
        site: {
          "example.com": {
            "assets.example.net": "suggested"
          }
        }
      }
    });
  });
});
