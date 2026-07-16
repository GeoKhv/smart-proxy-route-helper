import { describe, expect, it } from "vitest";

import { getLocalSettings, setLocalSettings, updateLocalSettings } from "../src/storage/localStore";
import {
  addSyncRules,
  applySyncRuleChanges,
  getSyncSettings,
  resolveSyncRouteTargetConflict,
  setSyncSettings,
  updateSyncRule,
  updateSyncSettings
} from "../src/storage/syncStore";
import { getRouteTargetKey } from "../src/rules/routeTarget";
import type { StorageAreaAdapter } from "../src/storage/storageTypes";
import type { DomainRule } from "../src/rules/ruleTypes";

type MemoryStorageArea = StorageAreaAdapter & {
  dump(): Record<string, unknown>;
  setCount(): number;
};

const createdAt = "2026-06-24T00:00:00.000Z";

function createMemoryStorage(initialState: Record<string, unknown> = {}): MemoryStorageArea {
  let state = { ...initialState };
  let writes = 0;

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
      writes += 1;
      state = {
        ...state,
        ...items
      };
    },
    dump() {
      return { ...state };
    },
    setCount() {
      return writes;
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

  it("preserves contradictory stored rules for explicit repair instead of deleting either action", async () => {
    const proxy = manualRule("routing-test.test", true);
    const direct = directRule("routing-test.test", true);
    const settings = await getSyncSettings(createMemoryStorage({ rules: [proxy, direct] }));

    expect(settings.rules).toEqual([proxy, direct]);
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

  it("allows unrelated sync updates while preserving a legacy conflict byte-for-byte", async () => {
    const proxy = { ...manualRule("routing-test.test", true), id: "proxy" };
    const direct = {
      ...directRule("routing-test.test", true),
      id: "direct",
      createdAt: "2026-07-13T10:01:00.000Z"
    };
    const storage = createMemoryStorage({ rules: [proxy, direct] });

    const result = await updateSyncSettings({ ignoredDomains: ["ignored.example"] }, storage);

    expect(result.rules).toEqual([proxy, direct]);
    expect(storage.dump().rules).toEqual([proxy, direct]);
    expect(storage.setCount()).toBe(1);
  });

  it("rejects generic updates that reorder or mutate a legacy conflict", async () => {
    const proxy = { ...manualRule("routing-test.test", true), id: "proxy" };
    const direct = {
      ...directRule("routing-test.test", true),
      id: "direct",
      createdAt: "2026-07-13T10:01:00.000Z"
    };
    const storage = createMemoryStorage({ rules: [proxy, direct] });

    await expect(updateSyncSettings({ rules: [direct, proxy] }, storage)).rejects.toThrow(
      "Use Keep Proxy or Keep Direct"
    );
    expect(storage.dump().rules).toEqual([proxy, direct]);
    expect(storage.setCount()).toBe(0);
  });

  it("updates a rule atomically with one storage write and preserves its stable metadata", async () => {
    const currentRule = {
      ...manualRule("child.example.com", false),
      id: "rule-atomic"
    };
    const childException = {
      ...manualRule("login.example.com", false),
      id: "rule-exception",
      action: "direct" as const,
      createdAt: "2026-06-24T00:00:01.000Z"
    };
    const storage = createMemoryStorage({
      rules: [currentRule, childException]
    });
    const result = await updateSyncRule(
      "rule-atomic",
      {
        domain: "example.com",
        includeSubdomains: true,
        action: "proxy"
      },
      storage
    );

    expect(result).toMatchObject({
      ok: true,
      updatedRule: {
        id: "rule-atomic",
        domain: "example.com",
        includeSubdomains: true,
        action: "proxy",
        source: "manual",
        createdAt
      },
      settings: {
        rules: [
          {
            id: "rule-atomic",
            domain: "example.com"
          },
          {
            id: "rule-exception",
            domain: "login.example.com",
            action: "direct"
          }
        ]
      }
    });
    expect(storage.setCount()).toBe(1);
    expect(result.settings.rules).toHaveLength(2);
  });

  it("changes actions in place while preserving the same ID, source, and createdAt", async () => {
    const currentRule = { ...manualRule("routing-test.test", true), id: "route-action" };
    const storage = createMemoryStorage({ rules: [currentRule] });
    const toDirect = await updateSyncRule(
      currentRule.id,
      { domain: currentRule.domain, includeSubdomains: true, action: "direct" },
      storage
    );

    expect(toDirect).toMatchObject({
      ok: true,
      updatedRule: {
        id: "route-action",
        action: "direct",
        source: "manual",
        createdAt
      }
    });

    const toProxy = await updateSyncRule(
      currentRule.id,
      { domain: currentRule.domain, includeSubdomains: true, action: "proxy" },
      storage
    );

    expect(toProxy).toMatchObject({
      ok: true,
      updatedRule: { id: "route-action", action: "proxy" }
    });
    expect(storage.setCount()).toBe(2);
    expect(storage.dump().rules).toHaveLength(1);
  });

  it("validates additions against the latest stored rules immediately before one final write", async () => {
    const existing = directRule("routing-test.test", false);
    const storage = createMemoryStorage({ rules: [existing] });
    const proposed = manualRule("routing-test.test", false);
    const result = await addSyncRules([proposed], storage);

    expect(result).toMatchObject({
      ok: false,
      reason: "conflict",
      existingRule: existing,
      proposedRule: proposed
    });
    expect(storage.setCount()).toBe(0);
    expect(storage.dump().rules).toEqual([existing]);
  });

  it("canonicalizes a standard WWW rule at the shared add boundary", async () => {
    const storage = createMemoryStorage();
    const proposed = manualRule("www.example.com", false);
    const result = await addSyncRules([proposed], storage);

    expect(result).toMatchObject({
      ok: true,
      addedRules: [{ domain: "example.com", includeSubdomains: false, action: "proxy" }]
    });
    expect(storage.dump().rules).toEqual([
      expect.objectContaining({ domain: "example.com", includeSubdomains: false, action: "proxy" })
    ]);
  });

  it("does not migrate an already stored WWW rule during sanitization-only reads", async () => {
    const storage = createMemoryStorage({ rules: [manualRule("www.example.com", false)] });
    const settings = await getSyncSettings(storage);

    expect(settings.rules).toEqual([manualRule("www.example.com", false)]);
    expect(storage.setCount()).toBe(0);
  });

  it("blocks a stale edit when another rule ID now occupies the proposed target", async () => {
    const editedRule = { ...manualRule("child.example.com", false), id: "edited" };
    const latestOccupant = {
      ...directRule("routing-test.test", true),
      id: "latest-occupant",
      createdAt: "2026-07-13T10:01:00.000Z"
    };
    const storage = createMemoryStorage({ rules: [editedRule, latestOccupant] });
    const result = await updateSyncRule(
      editedRule.id,
      { domain: "routing-test.test", includeSubdomains: true, action: "proxy" },
      storage
    );

    expect(result).toMatchObject({ ok: false });

    if (result.ok) {
      throw new Error("Expected the stale rule edit to be blocked.");
    }

    expect(result.error).toContain("opposite-action Direct rule already exists");
    expect(storage.setCount()).toBe(0);
    expect(storage.dump().rules).toEqual([editedRule, latestOccupant]);
  });

  it.each(["proxy", "direct"] as const)("resolves a stored conflict by keeping %s in one write", async (action) => {
    const proxy = { ...manualRule("routing-test.test", true), id: "proxy" };
    const direct = { ...directRule("routing-test.test", true), id: "direct" };
    const storage = createMemoryStorage({ rules: [proxy, direct] });
    const result = await resolveSyncRouteTargetConflict(getRouteTargetKey(proxy), action, storage);

    expect(result).toMatchObject({
      ok: true,
      keptRule: action === "proxy" ? proxy : direct,
      removedRules: [action === "proxy" ? direct : proxy]
    });
    expect(storage.setCount()).toBe(1);
    expect(storage.dump().rules).toEqual([action === "proxy" ? proxy : direct]);
  });

  it("expands an existing rule and adds a new rule in one atomic sync write", async () => {
    const exact = {
      ...manualRule("wikipedia.org", false),
      id: "wikipedia-rule",
      source: "import" as const,
      createdAt: "2026-07-01T00:00:00.000Z"
    };
    const storage = createMemoryStorage({ rules: [exact] });

    const result = await applySyncRuleChanges(
      [
        {
          ruleId: "wikipedia-rule",
          proposed: { domain: "wikipedia.org", includeSubdomains: true, action: "proxy" }
        }
      ],
      [
        {
          ...manualRule("cdn.example.net", false),
          source: "diagnostic" as const
        }
      ],
      storage
    );

    expect(result).toMatchObject({
      ok: true,
      expandedRules: [{ id: "wikipedia-rule", includeSubdomains: true, source: "import", createdAt: "2026-07-01T00:00:00.000Z" }],
      addedRules: [{ domain: "cdn.example.net", source: "diagnostic" }]
    });
    expect(storage.setCount()).toBe(1);
    expect(storage.dump().rules).toHaveLength(2);
  });
});

describe("local storage settings", () => {
  it("stores the interface language locally and leaves sync storage untouched", async () => {
    const localStorage = createMemoryStorage();
    const syncStorage = createMemoryStorage();

    await setLocalSettings(
      {
        deviceProxy: { enabled: false, config: null },
        diagnostics: { enabled: false },
        language: "ru"
      },
      localStorage
    );

    await expect(getLocalSettings(localStorage)).resolves.toMatchObject({ language: "ru" });
    expect(localStorage.dump()).toMatchObject({ language: "ru" });
    expect(syncStorage.dump()).toEqual({});

    await updateLocalSettings({ language: "en" }, localStorage);
    await expect(getLocalSettings(localStorage)).resolves.toMatchObject({ language: "en" });
  });

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

  it("rejects a new contradictory full write instead of silently retaining both actions", async () => {
    const storage = createMemoryStorage();

    await expect(
      setSyncSettings(
        {
          rules: [manualRule("routing-test.test", true), directRule("routing-test.test", true)],
          ignoredDomains: [],
          denylist: [],
          classificationOverrides: { global: {}, site: {} }
        },
        storage
      )
    ).rejects.toThrow("Conflicting route rules must be resolved explicitly");
    expect(storage.setCount()).toBe(0);
  });
});
