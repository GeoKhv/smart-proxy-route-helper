import { describe, expect, it } from "vitest";

import {
  applyProxySettings,
  createProxySettingsController,
  hasRelevantStorageChange,
  type ProxySettingsAdapter
} from "../src/proxy/applyProxySettings";
import type { DomainRule } from "../src/rules/ruleTypes";
import type { StorageAreaAdapter } from "../src/storage/storageTypes";

type MemoryStorageArea = StorageAreaAdapter & {
  dump(): Record<string, unknown>;
};

type ProxySettingsCall =
  | {
      type: "apply-pac";
      pacScript: string;
    }
  | {
      type: "clear";
    };

const createdAt = "2026-06-24T00:00:00.000Z";
const localProxyConfig = {
  scheme: "socks5",
  host: "127.0.0.1",
  port: 10808
} as const;
const silentLogger = {
  info() {},
  warn() {}
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
        calls.push({
          type: "clear"
        });
      }
    },
    calls
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

function manualRule(domain: string, includeSubdomains = true): DomainRule {
  return {
    domain,
    includeSubdomains,
    mode: "proxy",
    source: "manual",
    createdAt
  };
}

function runPac(pacScript: string, host: string): string {
  const evaluatePac = new Function("host", `${pacScript}\nreturn FindProxyForURL("https://" + host + "/", host);`);

  return evaluatePac(host) as string;
}

describe("applyProxySettings", () => {
  it("applies a local PAC script for valid proxy config and rules", async () => {
    const proxySettings = createProxySettingsRecorder();

    const result = await applyProxySettings({
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage({
        rules: [manualRule("Example.com", true)]
      }),
      localStorage: createMemoryStorage(enabledLocalProxyState()),
      reason: "startup"
    });

    expect(result).toMatchObject({
      ok: true,
      status: "applied-pac",
      ruleCount: 1,
      proxyString: "SOCKS5 127.0.0.1:10808; DIRECT"
    });
    expect(proxySettings.calls).toHaveLength(1);

    const call = proxySettings.calls[0];

    expect(call.type).toBe("apply-pac");

    if (call.type !== "apply-pac") {
      throw new Error("Expected PAC application call.");
    }

    expect(runPac(call.pacScript, "example.com")).toBe("SOCKS5 127.0.0.1:10808; DIRECT");
    expect(runPac(call.pacScript, "sub.example.com")).toBe("SOCKS5 127.0.0.1:10808; DIRECT");
    expect(runPac(call.pacScript, "other.test")).toBe("DIRECT");
  });

  it("clears extension proxy settings when proxy config is valid but sanitized rules are empty", async () => {
    const proxySettings = createProxySettingsRecorder();

    const result = await applyProxySettings({
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage({
        rules: []
      }),
      localStorage: createMemoryStorage(enabledLocalProxyState())
    });

    expect(result).toMatchObject({
      ok: true,
      status: "cleared",
      clearReason: "empty-proxy-rules"
    });
    expect(proxySettings.calls).toEqual([
      {
        type: "clear"
      }
    ]);
  });

  it("clears extension proxy settings when stored rules sanitize to an empty list", async () => {
    const proxySettings = createProxySettingsRecorder();

    const result = await applyProxySettings({
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage({
        rules: [
          {
            domain: "example.com",
            includeSubdomains: true,
            mode: "proxy",
            source: "manual"
          }
        ]
      }),
      localStorage: createMemoryStorage(enabledLocalProxyState())
    });

    expect(result).toMatchObject({
      ok: true,
      status: "cleared",
      clearReason: "empty-proxy-rules"
    });
    expect(proxySettings.calls).toEqual([
      {
        type: "clear"
      }
    ]);
  });

  it("clears extension proxy settings when local proxy config is missing", async () => {
    const proxySettings = createProxySettingsRecorder();

    const result = await applyProxySettings({
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage({
        rules: [manualRule("example.com")]
      }),
      localStorage: createMemoryStorage()
    });

    expect(result).toMatchObject({
      ok: true,
      status: "cleared"
    });
    expect(proxySettings.calls).toEqual([
      {
        type: "clear"
      }
    ]);
  });

  it("does not apply unsafe PAC when stored local proxy config is invalid", async () => {
    const proxySettings = createProxySettingsRecorder();

    const result = await applyProxySettings({
      proxySettings: proxySettings.adapter,
      syncStorage: createMemoryStorage({
        rules: [manualRule("example.com")]
      }),
      localStorage: createMemoryStorage({
        deviceProxy: {
          enabled: true,
          config: {
            scheme: "http",
            host: "127.0.0.1",
            port: 70000
          }
        }
      })
    });

    expect(result).toMatchObject({
      ok: true,
      status: "cleared"
    });
    expect(proxySettings.calls).toEqual([
      {
        type: "clear"
      }
    ]);
  });

  it("handles chrome proxy API errors without throwing uncaught exceptions", async () => {
    const result = await applyProxySettings({
      proxySettings: {
        async applyPacScript() {
          throw new Error("Proxy settings are controlled by another extension.");
        },
        async clearExtensionSettings() {}
      },
      syncStorage: createMemoryStorage({
        rules: [manualRule("example.com")]
      }),
      localStorage: createMemoryStorage(enabledLocalProxyState())
    });

    expect(result).toEqual({
      ok: false,
      status: "failed",
      reason: "manual",
      attemptedAction: "apply-pac",
      errorMessage: "Proxy settings are controlled by another extension."
    });
  });
});

describe("proxy settings storage change handling", () => {
  it("re-applies only for relevant sync/local changes and skips unchanged plans", async () => {
    const proxySettings = createProxySettingsRecorder();
    const syncStorage = createMemoryStorage({
      rules: [manualRule("example.com")]
    });
    const localStorage = createMemoryStorage(enabledLocalProxyState());
    const controller = createProxySettingsController({
      proxySettings: proxySettings.adapter,
      syncStorage,
      localStorage,
      logger: silentLogger
    });

    expect(hasRelevantStorageChange({ diagnostics: { oldValue: false, newValue: true } }, "local")).toBe(false);
    expect(hasRelevantStorageChange({ rules: { oldValue: [], newValue: [manualRule("example.com")] } }, "sync")).toBe(
      true
    );
    await expect(
      controller.handleStorageChange({ diagnostics: { oldValue: false, newValue: true } }, "local")
    ).resolves.toBeNull();
    expect(proxySettings.calls).toHaveLength(0);

    const firstResult = await controller.handleStorageChange(
      { rules: { oldValue: [], newValue: [manualRule("example.com")] } },
      "sync"
    );

    expect(firstResult).toMatchObject({
      ok: true,
      status: "applied-pac"
    });
    expect(proxySettings.calls).toHaveLength(1);

    const secondResult = await controller.handleStorageChange(
      { rules: { oldValue: [], newValue: [manualRule("example.com")] } },
      "sync"
    );

    expect(secondResult).toMatchObject({
      ok: true,
      status: "unchanged"
    });
    expect(proxySettings.calls).toHaveLength(1);

    const forcedResult = await controller.apply("diagnostic-restore", { force: true });

    expect(forcedResult).toMatchObject({
      ok: true,
      status: "applied-pac",
      reason: "diagnostic-restore"
    });
    expect(proxySettings.calls).toHaveLength(2);

    await localStorage.set({
      deviceProxy: {
        enabled: false,
        config: null
      }
    });

    const localResult = await controller.handleStorageChange(
      { deviceProxy: { oldValue: enabledLocalProxyState().deviceProxy, newValue: null } },
      "local"
    );

    expect(localResult).toMatchObject({
      ok: true,
      status: "cleared"
    });
    expect(proxySettings.calls).toHaveLength(3);
    expect(proxySettings.calls[2]).toEqual({
      type: "clear"
    });
  });
});
