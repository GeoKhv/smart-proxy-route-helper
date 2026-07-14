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
    action: "proxy",
    mode: "proxy",
    source: "manual",
    createdAt: "2026-06-24T00:00:00.000Z"
  };
}

function directRule(domain: string, includeSubdomains: boolean, createdAt = "2026-06-24T00:00:01.000Z"): DomainRule {
  return {
    ...manualRule(domain, includeSubdomains),
    action: "direct",
    createdAt
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
  it("builds strict PAC proxy strings for all supported schemes", () => {
    expect(buildPacProxyString({ scheme: "socks5", host: "127.0.0.1", port: 10808 })).toMatchObject({
      ok: true,
      proxyString: "SOCKS5 127.0.0.1:10808"
    });
    expect(buildPacProxyString({ scheme: "http", host: "127.0.0.1", port: 8080 })).toMatchObject({
      ok: true,
      proxyString: "PROXY 127.0.0.1:8080"
    });
    expect(buildPacProxyString({ scheme: "https", host: "127.0.0.1", port: 8443 })).toMatchObject({
      ok: true,
      proxyString: "HTTPS 127.0.0.1:8443"
    });
    expect(buildPacProxyString({ scheme: "socks4", host: "127.0.0.1", port: 1080 })).toMatchObject({
      ok: true,
      proxyString: "SOCKS 127.0.0.1:1080"
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
    expect(result.proxyString).toBe("SOCKS5 127.0.0.1:10808");
    expect(result.proxyString).not.toContain("DIRECT");
    expect(result.rules).toEqual([
      {
        domain: "example.com",
        includeSubdomains: true,
        action: "proxy",
        createdAt: "2026-06-24T00:00:00.000Z"
      }
    ]);
    expect(result.pacScript).not.toContain('bad"; return');
  });

  it("routes exact domain matches to the proxy", () => {
    const pacScript = buildTestPac([manualRule("example.com", false)]);

    expect(runPac(pacScript, "example.com")).toBe("SOCKS5 127.0.0.1:10808");
    expect(runPac(pacScript, "Example.com.")).toBe("SOCKS5 127.0.0.1:10808");
  });

  it("routes subdomain matches only when includeSubdomains is true", () => {
    const withSubdomains = buildTestPac([manualRule("example.com", true)]);
    const exactOnly = buildTestPac([manualRule("example.com", false)]);

    expect(runPac(withSubdomains, "a.example.com")).toBe("SOCKS5 127.0.0.1:10808");
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

  it("returns DIRECT for direct rule matches", () => {
    const pacScript = buildTestPac([manualRule("linkedin.com", true), directRule("www.linkedin.com", false)]);

    expect(runPac(pacScript, "www.linkedin.com")).toBe("DIRECT");
    expect(runPac(pacScript, "linkedin.com")).toBe("SOCKS5 127.0.0.1:10808");
  });

  it("uses the most specific parent includeSubdomains rule", () => {
    const pacScript = buildTestPac([manualRule("linkedin.com", true), directRule("media.linkedin.com", true)]);

    expect(runPac(pacScript, "asset.media.linkedin.com")).toBe("DIRECT");
    expect(runPac(pacScript, "www.linkedin.com")).toBe("SOCKS5 127.0.0.1:10808");
  });

  it("keeps a child Proxy exception under a parent Direct rule", () => {
    const childProxy = {
      ...manualRule("media.linkedin.com", true),
      createdAt: "2026-06-24T00:00:02.000Z"
    };
    const pacScript = buildTestPac([directRule("linkedin.com", true), childProxy]);

    expect(runPac(pacScript, "asset.media.linkedin.com")).toBe("SOCKS5 127.0.0.1:10808");
    expect(runPac(pacScript, "www.linkedin.com")).toBe("DIRECT");
  });

  it("uses the same newest-then-later temporary winner as the popup for legacy conflicts", () => {
    const proxy = {
      ...manualRule("routing-test.test", true),
      createdAt: "2026-07-13T10:00:00.000Z"
    };
    const direct = directRule("routing-test.test", true, "2026-07-13T10:01:00.000Z");
    const pacScript = buildTestPac([proxy, direct]);

    expect(runPac(pacScript, "child.routing-test.test")).toBe("DIRECT");
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
