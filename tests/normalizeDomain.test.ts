import { describe, expect, it } from "vitest";

import { normalizeDomain } from "../src/rules/normalizeDomain";

function expectNormalized(input: string, domain: string): void {
  expect(normalizeDomain(input)).toEqual({
    ok: true,
    domain
  });
}

describe("normalizeDomain", () => {
  it("normalizes plain domains and Letterboxd-like URLs", () => {
    expectNormalized("letterboxd.com", "letterboxd.com");
    expectNormalized(" https://letterboxd.com/ ", "letterboxd.com");
    expectNormalized("http://www.Letterboxd.com/", "www.letterboxd.com");
    expectNormalized("a.ltrbxd.com", "a.ltrbxd.com");
    expectNormalized("https://a.ltrbxd.com/image.jpg", "a.ltrbxd.com");
  });

  it("removes paths, queries, hashes, ports, wildcards, and trailing dots", () => {
    expectNormalized("https://Letterboxd.com/path?view=grid#reviews", "letterboxd.com");
    expectNormalized("example.com:8080/path", "example.com");
    expectNormalized("*.Example.com.", "example.com");
    expectNormalized("https://*.Example.com:8443/path", "example.com");
  });

  it("rejects empty values", () => {
    const result = normalizeDomain("   ");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("empty");
    }
  });

  it("rejects unsupported internal and non-web schemes", () => {
    for (const input of ["chrome://extensions", "chrome-extension://abc/options.html", "file:///tmp/example", "about:blank"]) {
      const result = normalizeDomain(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("unsupported-scheme");
      }
    }
  });

  it("rejects obvious invalid host values", () => {
    for (const input of ["https://exa mple.com", "bad_host.example", "example..com", "-example.com", "example-.com"]) {
      const result = normalizeDomain(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("invalid-host");
      }
    }
  });
});
