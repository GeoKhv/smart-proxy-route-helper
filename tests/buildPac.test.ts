import { describe, expect, it } from "vitest";

import { buildPacScript } from "../src/proxy/buildPac";
import { buildPacProxyString, validateLocalProxyConfig } from "../src/proxy/proxyConfig";
import type { DomainRule } from "../src/rules/ruleTypes";

const localProxyConfig = {
  scheme: "socks5",
  host: "127.0.0.1",
  port: 10808
} as const;

function manualRule(domain: string, includeSubdomains: boolean): DomainRule {
  return {
    domain,
    includeSubdomains,
    mode: "proxy",
    source: "manual",
    createdAt: "2026-06-24T00:00:00.000Z"
  };
}

function buildTestPac(rules: readonly DomainRule[], proxyConfig: unknown = localProxyConfig): string {
  const result = buildPacScript({
    rules,
    localProxyConfig: proxyConfig
  });

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.pacScript;
}

function runPac(pacScript: string, host: string): string {
  const evaluatePac = new Function("host", `${pacScript}\nreturn FindProxyForURL("https://" + host + "/", host);`);

  return evaluatePac(host) as string;
}

describe("validateLocalProxyConfig", () => {
  it("accepts supported local proxy configs", () => {
    expect(validateLocalProxyConfig({ scheme: "http", host: " 127.0.0.1 ", port: 8080 })).toEqual({
      ok: true,
      config: {
        scheme: "http",
        host: "127.0.0.1",
        port: 8080
      }
    });
  });

  it("rejects unsupported schemes, empty hosts, unsafe hosts, and invalid ports", () => {
    expect(validateLocalProxyConfig({ scheme: "ftp", host: "127.0.0.1", port: 8080 })).toMatchObject({
      ok: false,
      error: { code: "invalid-scheme" }
    });
    expect(validateLocalProxyConfig({ scheme: "http", host: " ", port: 8080 })).toMatchObject({
      ok: false,
      error: { code: "empty-host" }
    });
    expect(validateLocalProxyConfig({ scheme: "http", host: "127.0.0.1; DIRECT", port: 8080 })).toMatchObject({
      ok: false,
      error: { code: "invalid-host" }
    });
    expect(validateLocalProxyConfig({ scheme: "http", host: "127.0.0.1", port: 0 })).toMatchObject({
      ok: false,
      error: { code: "invalid-port" }
    });
    expect(validateLocalProxyConfig({ scheme: "http", host: "127.0.0.1", port: 65536 })).toMatchObject({
      ok: false,
      error: { code: "invalid-port" }
    });
  });
});

describe("buildPacProxyString", () => {
  it("builds PAC proxy strings for all supported schemes", () => {
    expect(buildPacProxyString({ scheme: "socks5", host: "127.0.0.1", port: 10808 })).toMatchObject({
      ok: true,
      proxyString: "SOCKS5 127.0.0.1:10808; DIRECT"
    });
    expect(buildPacProxyString({ scheme: "http", host: "127.0.0.1", port: 8080 })).toMatchObject({
      ok: true,
      proxyString: "PROXY 127.0.0.1:8080; DIRECT"
    });
    expect(buildPacProxyString({ scheme: "https", host: "127.0.0.1", port: 8443 })).toMatchObject({
      ok: true,
      proxyString: "HTTPS 127.0.0.1:8443; DIRECT"
    });
    expect(buildPacProxyString({ scheme: "socks4", host: "127.0.0.1", port: 1080 })).toMatchObject({
      ok: true,
      proxyString: "SOCKS 127.0.0.1:1080; DIRECT"
    });
  });
});

describe("buildPacScript", () => {
  it("generates a PAC script with FindProxyForURL and serialized validated rules", () => {
    const result = buildPacScript({
      rules: [manualRule("Example.com", true), manualRule('bad"; return "PROXY bad:1";', true)],
      localProxyConfig
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.pacScript).toContain("function FindProxyForURL(url, host)");
    expect(result.proxyString).toBe("SOCKS5 127.0.0.1:10808; DIRECT");
    expect(result.rules).toEqual([{ domain: "example.com", includeSubdomains: true }]);
    expect(result.pacScript).not.toContain('bad"; return');
  });

  it("routes exact domain matches to the proxy", () => {
    const pacScript = buildTestPac([manualRule("example.com", false)]);

    expect(runPac(pacScript, "example.com")).toBe("SOCKS5 127.0.0.1:10808; DIRECT");
    expect(runPac(pacScript, "Example.com.")).toBe("SOCKS5 127.0.0.1:10808; DIRECT");
  });

  it("routes subdomain matches only when includeSubdomains is true", () => {
    const withSubdomains = buildTestPac([manualRule("example.com", true)]);
    const exactOnly = buildTestPac([manualRule("example.com", false)]);

    expect(runPac(withSubdomains, "a.example.com")).toBe("SOCKS5 127.0.0.1:10808; DIRECT");
    expect(runPac(exactOnly, "a.example.com")).toBe("DIRECT");
  });

  it("does not route unsafe substring false positives", () => {
    const pacScript = buildTestPac([manualRule("example.com", true)]);

    expect(runPac(pacScript, "badexample.com")).toBe("DIRECT");
    expect(runPac(pacScript, "example.com.evil.test")).toBe("DIRECT");
  });

  it("returns DIRECT when no rules match or the rule list is empty", () => {
    expect(runPac(buildTestPac([manualRule("example.com", true)]), "other.test")).toBe("DIRECT");
    expect(runPac(buildTestPac([]), "example.com")).toBe("DIRECT");
  });

  it("rejects invalid local proxy configs instead of generating partial PAC", () => {
    const result = buildPacScript({
      rules: [manualRule("example.com", true)],
      localProxyConfig: { scheme: "socks5", host: "127.0.0.1", port: 70000 }
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid-port" }
    });
  });
});
