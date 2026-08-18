import { describe, expect, it } from "vitest";

import {
  getLocalSettings,
  planDeviceProxyEnabledUpdate,
  setDeviceProxyEnabled,
  setLocalSettings,
  updateLocalSettings
} from "../src/storage/localStore";
import {
  addSyncRules,
  applySyncRuleChanges,
  getSyncSettings,
  resolveSyncRouteTargetConflict,
  setSyncSettings,
  updateSyncRule,
  updateSyncSettings
} from "../src/storage/syncStore";
import {
  estimateStorageItemBytes,
  isRuleChunkStorageKey,
  rulesChunkSchemaVersion,
  rulesMetaStorageKey
} from "../src/storage/ruleChunks";
import { getRouteTargetKey } from "../src/rules/routeTarget";
import type { StorageAreaAdapter } from "../src/storage/storageTypes";
import type { DomainRule } from "../src/rules/ruleTypes";

type MemoryStorageArea = StorageAreaAdapter & {
  dump(): Record<string, unknown>;
  setCount(): number;
};

type RemovableMemoryStorageArea = MemoryStorageArea & {
  setByteLimit(limit: number | null): void;
  corruptNextRuleChunkWrite(): void;
  reorderRulePropertiesOnRead(): void;
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

function totalStorageBytes(state: Record<string, unknown>): number {
  return Object.entries(state).reduce((total, [key, value]) => total + estimateStorageItemBytes(key, value), 0);
}

function createRemovableMemoryStorage(initialState: Record<string, unknown> = {}): RemovableMemoryStorageArea {
  let state = { ...initialState };
  let writes = 0;
  let byteLimit: number | null = null;
  let corruptNextRuleChunks = false;
  let reorderRuleProperties = false;

  function readValue(key: string): unknown {
    const value = state[key];

    if (!reorderRuleProperties || !isRuleChunkStorageKey(key) || !Array.isArray(value)) {
      return value;
    }

    return (value as DomainRule[]).map((rule) => ({
      action: rule.action,
      createdAt: rule.createdAt,
      domain: rule.domain,
      includeSubdomains: rule.includeSubdomains,
      mode: rule.mode,
      source: rule.source,
      ...(rule.id === undefined ? {} : { id: rule.id })
    }));
  }

  return {
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (keys === undefined || keys === null) {
        return Object.fromEntries(Object.keys(state).map((key) => [key, readValue(key)]));
      }

      if (typeof keys === "string") {
        return { [keys]: readValue(keys) };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, readValue(key)]));
      }

      return {
        ...keys,
        ...Object.fromEntries(Object.keys(keys).filter((key) => key in state).map((key) => [key, readValue(key)]))
      };
    },
    async set(items: Record<string, unknown>) {
      const nextState = {
        ...state,
        ...items
      };

      if (byteLimit !== null && totalStorageBytes(nextState) > byteLimit) {
        throw new Error("QUOTA_BYTES quota exceeded");
      }

      writes += 1;
      state = nextState;

      if (corruptNextRuleChunks) {
        const chunkKey = Object.keys(items).find(isRuleChunkStorageKey);

        if (chunkKey && Array.isArray(state[chunkKey]) && state[chunkKey].length > 0) {
          const firstRule = state[chunkKey][0] as DomainRule;
          state[chunkKey] = [{ ...firstRule, domain: "corrupted.example" }, ...state[chunkKey].slice(1)];
          corruptNextRuleChunks = false;
        }
      }
    },
    async remove(keys: string | string[]) {
      const targetKeys = typeof keys === "string" ? [keys] : keys;

      for (const key of targetKeys) {
        delete state[key];
      }
    },
    dump() {
      return { ...state };
    },
    setCount() {
      return writes;
    },
    setByteLimit(limit) {
      byteLimit = limit;
    },
    corruptNextRuleChunkWrite() {
      corruptNextRuleChunks = true;
    },
    reorderRulePropertiesOnRead() {
      reorderRuleProperties = true;
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
    await expect(getSyncSettings(storage)).resolves.toEqual(updatedSettings);
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
    expect(storage.setCount()).toBe(2);
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

  it("updates a rule through staged chunks while preserving its stable metadata", async () => {
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
    expect(storage.setCount()).toBe(2);
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
    expect(storage.setCount()).toBe(4);
    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules: [{ id: "route-action", action: "proxy" }] });
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
    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules: [
      expect.objectContaining({ domain: "example.com", includeSubdomains: false, action: "proxy" })
    ] });
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

  it.each(["proxy", "direct"] as const)("resolves a stored conflict by keeping %s through staged chunks", async (action) => {
    const proxy = { ...manualRule("routing-test.test", true), id: "proxy" };
    const direct = { ...directRule("routing-test.test", true), id: "direct" };
    const storage = createMemoryStorage({ rules: [proxy, direct] });
    const result = await resolveSyncRouteTargetConflict(getRouteTargetKey(proxy), action, storage);

    expect(result).toMatchObject({
      ok: true,
      keptRule: action === "proxy" ? proxy : direct,
      removedRules: [action === "proxy" ? direct : proxy]
    });
    expect(storage.setCount()).toBe(2);
    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules: [action === "proxy" ? proxy : direct] });
  });

  it("expands an existing rule and adds a new rule through staged chunks", async () => {
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
    expect(storage.setCount()).toBe(2);
    await expect(getSyncSettings(storage)).resolves.toHaveProperty("rules", expect.arrayContaining([
      expect.objectContaining({ domain: "wikipedia.org" }),
      expect.objectContaining({ domain: "cdn.example.net" })
    ]));
  });
});

describe("chunked Sync rule storage", () => {
  it("migrates legacy rules without changing their content or order, then removes the legacy key", async () => {
    const rules = [
      { ...manualRule("first.example"), id: "first" },
      {
        ...directRule("second.example", false),
        id: "second",
        source: "import" as const,
        createdAt: "2026-07-01T00:00:00.000Z"
      }
    ];
    const storage = createRemovableMemoryStorage({ rules });

    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules });

    const migrated = storage.dump();
    expect(migrated.rules).toBeUndefined();
    expect(migrated[rulesMetaStorageKey]).toMatchObject({
      schemaVersion: rulesChunkSchemaVersion,
      ruleCount: rules.length
    });
    expect(Object.keys(migrated).filter(isRuleChunkStorageKey)).not.toHaveLength(0);

    const writesAfterMigration = storage.setCount();
    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules });
    expect(storage.setCount()).toBe(writesAfterMigration);
  });

  it("keeps legacy rules when a migration write fails", async () => {
    const rules = [manualRule("existing.example")];
    const storage = createRemovableMemoryStorage({ rules });
    storage.setByteLimit(1);

    await expect(getSyncSettings(storage)).rejects.toMatchObject({
      code: "quota-exceeded",
      message: "Chrome Sync storage is full. Remove some synced rules or export a backup before adding more."
    });
    expect(storage.dump().rules).toEqual(rules);
    expect(storage.dump()[rulesMetaStorageKey]).toBeUndefined();
  });

  it("keeps legacy rules when staged chunks fail verification", async () => {
    const rules = [manualRule("existing.example")];
    const storage = createRemovableMemoryStorage({ rules });
    storage.corruptNextRuleChunkWrite();

    await expect(getSyncSettings(storage)).rejects.toMatchObject({
      code: "verification-failed",
      message: "Synced route rules could not be verified. Existing rules were kept unchanged."
    });
    expect(storage.dump().rules).toEqual(rules);
    expect(storage.dump()[rulesMetaStorageKey]).toBeUndefined();
  });

  it("recovers a partial chunked migration from intact legacy rules", async () => {
    const rules = [manualRule("existing.example")];
    const storage = createRemovableMemoryStorage({
      rules,
      [rulesMetaStorageKey]: {
        schemaVersion: rulesChunkSchemaVersion,
        generation: "partial-generation",
        chunkCount: 1,
        ruleCount: 1
      }
    });

    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules });
    expect(storage.dump().rules).toBeUndefined();
    expect(storage.dump()[rulesMetaStorageKey]).toMatchObject({ ruleCount: 1 });
    expect(Object.keys(storage.dump()).some((key) => key.includes("partial-generation"))).toBe(false);
  });

  it("writes additions, edits, and removals through chunks and removes stale chunks after a shrink", async () => {
    const initialRules = Array.from({ length: 180 }, (_, index) => ({
      ...manualRule(`rule-${index}.long-example-domain.test`, index % 2 === 0),
      id: `rule-${index}`
    }));
    const storage = createRemovableMemoryStorage();

    await setSyncSettings(
      {
        rules: initialRules,
        ignoredDomains: [],
        denylist: [],
        classificationOverrides: { global: {}, site: {} }
      },
      storage
    );
    const initialChunkCount = Object.keys(storage.dump()).filter(isRuleChunkStorageKey).length;
    expect(initialChunkCount).toBeGreaterThan(1);

    const added = await addSyncRules([manualRule("added.example")], storage);
    expect(added).toMatchObject({ ok: true, addedRules: [{ domain: "added.example" }] });

    const edited = await updateSyncRule(
      "rule-0",
      { domain: "edited.example", includeSubdomains: false, action: "direct" },
      storage
    );
    expect(edited).toMatchObject({ ok: true, updatedRule: { id: "rule-0", domain: "edited.example", action: "direct" } });

    if (!edited.ok) {
      throw new Error(edited.error);
    }

    const reduced = await updateSyncSettings({ rules: [edited.settings.rules[0]] }, storage);
    expect(reduced.rules).toEqual([edited.settings.rules[0]]);
    expect(Object.keys(storage.dump()).filter(isRuleChunkStorageKey)).toHaveLength(1);
    await expect(getSyncSettings(storage)).resolves.toEqual(reduced);
  });

  it("verifies Add, Update, and Delete after Chrome reorders rule object properties", async () => {
    const initialRule = { ...manualRule("initial.example"), id: "initial-rule" };
    const storage = createRemovableMemoryStorage();
    storage.reorderRulePropertiesOnRead();

    await setSyncSettings(
      {
        rules: [initialRule],
        ignoredDomains: [],
        denylist: [],
        classificationOverrides: { global: {}, site: {} }
      },
      storage
    );

    const added = await addSyncRules([manualRule("added.example")], storage);
    expect(added).toMatchObject({ ok: true, addedRules: [{ domain: "added.example" }] });

    const updated = await updateSyncRule(
      initialRule.id,
      { domain: "updated.example", includeSubdomains: false, action: "direct" },
      storage
    );
    expect(updated).toMatchObject({
      ok: true,
      updatedRule: { id: initialRule.id, domain: "updated.example", action: "direct" }
    });

    const afterDelete = await updateSyncSettings(
      (current) => ({
        rules: current.rules.filter((rule) => rule.domain !== "added.example")
      }),
      storage
    );
    expect(afterDelete.rules).toEqual([
      expect.objectContaining({ id: initialRule.id, domain: "updated.example", action: "direct" })
    ]);
    await expect(getSyncSettings(storage)).resolves.toEqual(afterDelete);
  });

  it("keeps the old active generation when a genuine staged verification mismatch occurs", async () => {
    const activeRules = [{ ...manualRule("active.example"), id: "active-rule" }];
    const storage = createRemovableMemoryStorage();

    await setSyncSettings(
      {
        rules: activeRules,
        ignoredDomains: [],
        denylist: [],
        classificationOverrides: { global: {}, site: {} }
      },
      storage
    );

    const activeMeta = storage.dump()[rulesMetaStorageKey];
    const activeChunkKeys = Object.keys(storage.dump()).filter(isRuleChunkStorageKey).sort();
    storage.corruptNextRuleChunkWrite();

    await expect(addSyncRules([manualRule("corrupted.example")], storage)).rejects.toMatchObject({
      code: "verification-failed",
      message: "Synced route rules could not be verified. Existing rules were kept unchanged."
    });

    expect(storage.dump()[rulesMetaStorageKey]).toEqual(activeMeta);
    expect(Object.keys(storage.dump()).filter(isRuleChunkStorageKey).sort()).toEqual(activeChunkKeys);
    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules: activeRules });
  });

  it("keeps batch-add, scope-upgrade, duplicate, and conflict semantics with chunked storage", async () => {
    const exactRule = { ...manualRule("scope.example", false), id: "scope-rule" };
    const storage = createRemovableMemoryStorage();

    await setSyncSettings(
      {
        rules: [exactRule],
        ignoredDomains: [],
        denylist: [],
        classificationOverrides: { global: {}, site: {} }
      },
      storage
    );
    const batch = await applySyncRuleChanges(
      [
        {
          ruleId: exactRule.id,
          proposed: { domain: "scope.example", includeSubdomains: true, action: "proxy" }
        }
      ],
      [manualRule("batch-one.example"), manualRule("batch-two.example", false)],
      storage
    );

    expect(batch).toMatchObject({
      ok: true,
      expandedRules: [{ id: "scope-rule", includeSubdomains: true }],
      addedRules: [{ domain: "batch-one.example" }, { domain: "batch-two.example" }]
    });
    const duplicate = await addSyncRules([manualRule("batch-one.example")], storage);
    expect(duplicate).toMatchObject({ ok: true, addedRules: [], duplicateRules: [{ domain: "batch-one.example" }] });
    const conflict = await addSyncRules([directRule("batch-one.example")], storage);
    expect(conflict).toMatchObject({ ok: false, reason: "conflict" });
    await expect(getSyncSettings(storage)).resolves.toMatchObject({
      rules: expect.arrayContaining([expect.objectContaining({ id: "scope-rule", includeSubdomains: true })])
    });
  });

  it("reports general Sync quota exhaustion without changing the active rules", async () => {
    const rules = Array.from({ length: 70 }, (_, index) => ({
      ...manualRule(`quota-${index}.long-example-domain.test`),
      id: `quota-${index}`
    }));
    const storage = createRemovableMemoryStorage();

    await setSyncSettings(
      {
        rules,
        ignoredDomains: [],
        denylist: [],
        classificationOverrides: { global: {}, site: {} }
      },
      storage
    );
    storage.setByteLimit(totalStorageBytes(storage.dump()) + 100);

    await expect(addSyncRules([manualRule("cannot-fit.example")], storage)).rejects.toMatchObject({
      code: "quota-exceeded",
      message: "Chrome Sync storage is full. Remove some synced rules or export a backup before adding more."
    });
    await expect(getSyncSettings(storage)).resolves.toMatchObject({ rules });
  });
});

describe("local storage settings", () => {
  it("pauses proxy routing by changing only enabled and preserving the existing config", async () => {
    const config = {
      scheme: "socks5" as const,
      host: "127.0.0.1",
      port: 10808
    };
    const storage = createMemoryStorage({
      deviceProxy: { enabled: true, config },
      diagnostics: { enabled: true },
      language: "ru"
    });

    await expect(setDeviceProxyEnabled(false, storage)).resolves.toMatchObject({
      ok: true,
      previous: { enabled: true, config },
      deviceProxy: { enabled: false, config }
    });
    expect(storage.dump()).toEqual({
      deviceProxy: { enabled: false, config },
      diagnostics: { enabled: true },
      language: "ru"
    });
  });

  it("resumes proxy routing by changing only enabled and preserving the existing config", async () => {
    const config = {
      scheme: "http" as const,
      host: "127.0.0.1",
      port: 8080
    };
    const storage = createMemoryStorage({
      deviceProxy: { enabled: false, config },
      diagnostics: { enabled: false }
    });

    await expect(setDeviceProxyEnabled(true, storage)).resolves.toMatchObject({
      ok: true,
      previous: { enabled: false, config },
      deviceProxy: { enabled: true, config }
    });
    expect(storage.dump()).toEqual({
      deviceProxy: { enabled: true, config },
      diagnostics: { enabled: false }
    });
  });

  it("rejects resume without a saved local proxy config and performs no write", async () => {
    const storage = createMemoryStorage({
      deviceProxy: { enabled: false, config: null },
      diagnostics: { enabled: false }
    });

    await expect(setDeviceProxyEnabled(true, storage)).resolves.toEqual({
      ok: false,
      reason: "invalid-config",
      deviceProxy: { enabled: false, config: null }
    });
    expect(storage.setCount()).toBe(0);
  });

  it("rejects resume for an invalid fixture config", () => {
    expect(
      planDeviceProxyEnabledUpdate(
        {
          enabled: false,
          config: {
            scheme: "http",
            host: "127.0.0.1",
            port: 70000
          }
        },
        true
      )
    ).toMatchObject({
      ok: false,
      reason: "invalid-config"
    });
  });

  it("propagates a local storage mutation failure without changing the stored state", async () => {
    const config = {
      scheme: "socks5" as const,
      host: "127.0.0.1",
      port: 10808
    };
    const memory = createMemoryStorage({
      deviceProxy: { enabled: true, config },
      diagnostics: { enabled: false }
    });
    const failingStorage: StorageAreaAdapter = {
      get: memory.get,
      async set() {
        throw new Error("Local storage write failed.");
      }
    };

    await expect(setDeviceProxyEnabled(false, failingStorage)).rejects.toThrow("Local storage write failed.");
    expect(memory.dump()).toMatchObject({
      deviceProxy: { enabled: true, config }
    });
  });

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

    await expect(getSyncSettings(storage)).resolves.toEqual({
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
