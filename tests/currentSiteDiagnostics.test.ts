import { describe, expect, it } from "vitest";

import type { ApplyProxySettingsResult, ProxySettingsAdapter } from "../src/proxy/applyProxySettings";
import {
  buildCurrentSiteDiagnosticPlan,
  runCurrentSiteDiagnostic,
  type DiagnosticFetch
} from "../src/diagnostics/currentSiteDiagnostics";
import type { DomainRule } from "../src/rules/ruleTypes";
import type { LocalSettings, StorageAreaAdapter, SyncSettings } from "../src/storage/storageTypes";

type MemoryStorageArea = StorageAreaAdapter & {
  dump(): Record<string, unknown>;
};

type ProxySettingsCall = {
  type: "apply-pac";
  pacScript: string;
};

const createdAt = "2026-06-24T00:00:00.000Z";
const localProxyConfig = {
  scheme: "socks5",
  host: "127.0.0.1",
  port: 10808
} as const;

const syncSettings: SyncSettings = {
  rules: [],
  ignoredDomains: [],
  denylist: []
};

const enabledLocalSettings: LocalSettings = {
  deviceProxy: {
    enabled: true,
    config: localProxyConfig
  },
  diagnostics: {
    enabled: false
  }
};

const missingLocalSettings: LocalSettings = {
  deviceProxy: {
    enabled: false,
    config: null
  },
  diagnostics: {
    enabled: false
  }
};

const successfulRestore: ApplyProxySettingsResult = {
  ok: true,
  status: "applied-pac",
  reason: "diagnostic-restore",
  signature: "pac:permanent",
  ruleCount: 1,
  proxyString: "SOCKS5 127.0.0.1:10808"
};

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
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

function enabledLocalProxyState(): Record<string, unknown> {
  return {
    deviceProxy: {
      enabled: true,
      config: localProxyConfig
    }
  };
}

function createProxySettingsRecorder(): {
  adapter: ProxySettingsAdapter;
  calls: ProxySettingsCall[];
} {
  const calls: ProxySettingsCall[] = [];

  return {
    adapter: {
      async applyPacScript(pacScript) {
        calls.push({
          type: "apply-pac",
          pacScript
        });
      },
      async clearExtensionSettings() {
        throw new Error("Diagnostics should not clear proxy settings directly.");
      }
    },
    calls
  };
}

function runPac(pacScript: string, host: string): string {
  const evaluatePac = new Function("host", `${pacScript}\nreturn FindProxyForURL("https://" + host + "/", host);`);

  return evaluatePac(host) as string;
}

describe("current-site diagnostic planning", () => {
  it("maps missing local proxy config without creating a probe plan", () => {
    const plan = buildCurrentSiteDiagnosticPlan({
      url: "https://example.com/path",
      syncSettings,
      localSettings: missingLocalSettings,
      createdAt
    });

    expect(plan).toEqual({
      ok: false,
      response: {
        status: "missing_proxy_config",
        message: "Configure local proxy in Options first.",
        domain: "example.com"
      }
    });
  });

  it("rejects unsupported, private, and synced-denylisted current domains", () => {
    expect(
      buildCurrentSiteDiagnosticPlan({
        url: "chrome://extensions",
        syncSettings,
        localSettings: enabledLocalSettings
      })
    ).toMatchObject({
      ok: false,
      response: {
        status: "unsupported_url"
      }
    });

    expect(
      buildCurrentSiteDiagnosticPlan({
        url: "http://192.168.1.1/",
        syncSettings,
        localSettings: enabledLocalSettings
      })
    ).toMatchObject({
      ok: false,
      response: {
        status: "unsupported_url",
        domain: "192.168.1.1"
      }
    });

    expect(
      buildCurrentSiteDiagnosticPlan({
        url: "https://sub.blocked.example/",
        syncSettings: {
          ...syncSettings,
          denylist: ["blocked.example"]
        },
        localSettings: enabledLocalSettings
      })
    ).toEqual({
      ok: false,
      response: {
        status: "unsupported_url",
        message: "sub.blocked.example is blocked by the synced denylist. Open Options to review stored lists.",
        domain: "sub.blocked.example"
      }
    });
  });

  it("includes a temporary diagnostic probe rule without dropping permanent rules", () => {
    const plan = buildCurrentSiteDiagnosticPlan({
      url: "https://example.com/path",
      syncSettings: {
        ...syncSettings,
        rules: [manualRule("permanent.example")]
      },
      localSettings: enabledLocalSettings,
      createdAt
    });

    expect(plan.ok).toBe(true);

    if (!plan.ok) {
      throw new Error(plan.response.message);
    }

    expect(plan.probeRules).toEqual([
      manualRule("permanent.example"),
      {
        domain: "example.com",
        includeSubdomains: true,
        mode: "proxy",
        source: "diagnostic",
        createdAt
      }
    ]);
    expect(runPac(plan.pacScript, "example.com")).toBe("SOCKS5 127.0.0.1:10808");
    expect(runPac(plan.pacScript, "permanent.example")).toBe("SOCKS5 127.0.0.1:10808");
    expect(runPac(plan.pacScript, "other.example")).toBe("DIRECT");
  });

  it("uses an existing synced rule instead of adding a duplicate temporary probe rule", () => {
    const plan = buildCurrentSiteDiagnosticPlan({
      url: "https://www.example.com/path",
      syncSettings: {
        ...syncSettings,
        rules: [manualRule("example.com", true)]
      },
      localSettings: enabledLocalSettings,
      createdAt
    });

    expect(plan.ok).toBe(true);

    if (!plan.ok) {
      throw new Error(plan.response.message);
    }

    expect(plan.probeRules).toEqual([manualRule("example.com", true)]);
    expect(runPac(plan.pacScript, "www.example.com")).toBe("SOCKS5 127.0.0.1:10808");
    expect(runPac(plan.pacScript, "other.test")).toBe("DIRECT");
  });
});

describe("current-site diagnostic runner", () => {
  it("returns reachable, applies a probe PAC, restores permanent routing, and leaves sync rules unchanged", async () => {
    const proxySettings = createProxySettingsRecorder();
    const syncStorage = createMemoryStorage({
      rules: [manualRule("permanent.example")]
    });
    const restoreCalls: string[] = [];

    const result = await runCurrentSiteDiagnostic("https://example.com/page?private=1", {
      proxySettings: proxySettings.adapter,
      syncStorage,
      localStorage: createMemoryStorage(enabledLocalProxyState()),
      createdAt,
      fetcher: async (input) => {
        expect(input).toBe("https://example.com/");
        return {};
      },
      restoreProxySettings: async () => {
        restoreCalls.push("restore");
        return successfulRestore;
      }
    });

    expect(result).toEqual({
      status: "proxy_reachable",
      message: "This site appears reachable through your local proxy.",
      domain: "example.com"
    });
    expect(proxySettings.calls).toHaveLength(1);
    expect(runPac(proxySettings.calls[0].pacScript, "example.com")).toBe("SOCKS5 127.0.0.1:10808");
    expect(restoreCalls).toEqual(["restore"]);
    expect(syncStorage.dump()).toEqual({
      rules: [manualRule("permanent.example")]
    });
  });

  it("reports unreachable for an existing synced rule when the local proxy path fails", async () => {
    const proxySettings = createProxySettingsRecorder();
    const syncStorage = createMemoryStorage({
      rules: [manualRule("2ip.ru", true)]
    });
    const restoreCalls: string[] = [];

    const result = await runCurrentSiteDiagnostic("https://2ip.ru/", {
      proxySettings: proxySettings.adapter,
      syncStorage,
      localStorage: createMemoryStorage(enabledLocalProxyState()),
      createdAt,
      fetcher: async () => {
        throw new Error("proxy connection refused");
      },
      restoreProxySettings: async () => {
        restoreCalls.push("restore");
        return successfulRestore;
      }
    });

    expect(result).toEqual({
      status: "proxy_unreachable",
      message: "This site did not appear reachable through your local proxy.",
      domain: "2ip.ru"
    });
    expect(proxySettings.calls).toHaveLength(1);
    expect(runPac(proxySettings.calls[0].pacScript, "2ip.ru")).toBe("SOCKS5 127.0.0.1:10808");
    expect(runPac(proxySettings.calls[0].pacScript, "other.test")).toBe("DIRECT");
    expect(restoreCalls).toEqual(["restore"]);
    expect(syncStorage.dump()).toEqual({
      rules: [manualRule("2ip.ru", true)]
    });
  });

  it("restores permanent routing after a failed probe fetch", async () => {
    const proxySettings = createProxySettingsRecorder();
    const restoreCalls: string[] = [];

    const result = await runCurrentSiteDiagnostic("https://example.com/", {
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage(),
      localStorage: createMemoryStorage(enabledLocalProxyState()),
      createdAt,
      fetcher: async () => {
        throw new Error("network failed");
      },
      restoreProxySettings: async () => {
        restoreCalls.push("restore");
        return successfulRestore;
      }
    });

    expect(result).toEqual({
      status: "proxy_unreachable",
      message: "This site did not appear reachable through your local proxy.",
      domain: "example.com"
    });
    expect(proxySettings.calls).toHaveLength(1);
    expect(restoreCalls).toEqual(["restore"]);
  });

  it("does not apply or restore proxy settings when local proxy config is missing", async () => {
    const proxySettings = createProxySettingsRecorder();

    const result = await runCurrentSiteDiagnostic("https://example.com/", {
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage(),
      localStorage: createMemoryStorage(),
      restoreProxySettings: async () => {
        throw new Error("restore should not run");
      }
    });

    expect(result).toEqual({
      status: "missing_proxy_config",
      message: "Configure local proxy in Options first.",
      domain: "example.com"
    });
    expect(proxySettings.calls).toEqual([]);
  });

  it("maps probe timeout to unreachable and still restores routing", async () => {
    const proxySettings = createProxySettingsRecorder();
    const restoreCalls: string[] = [];
    const timedOutFetch: DiagnosticFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });

    const result = await runCurrentSiteDiagnostic("https://example.com/", {
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage(),
      localStorage: createMemoryStorage(enabledLocalProxyState()),
      timeoutMs: 1,
      fetcher: timedOutFetch,
      restoreProxySettings: async () => {
        restoreCalls.push("restore");
        return successfulRestore;
      }
    });

    expect(result).toMatchObject({
      status: "proxy_unreachable",
      domain: "example.com"
    });
    expect(proxySettings.calls).toHaveLength(1);
    expect(restoreCalls).toEqual(["restore"]);
  });
});
