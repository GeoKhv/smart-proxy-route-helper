import { describe, expect, it } from "vitest";

import { checkDenylistedHost, isDenylistedHost } from "../src/rules/denylist";

describe("denylist host protection", () => {
  it("denies localhost and loopback hosts", () => {
    expect(checkDenylistedHost("localhost")).toEqual({ denied: true, reason: "localhost" });
    expect(checkDenylistedHost("localhost:3000")).toEqual({ denied: true, reason: "localhost" });
    expect(checkDenylistedHost("http://localhost:3000/path")).toEqual({ denied: true, reason: "localhost" });
    expect(checkDenylistedHost("127.0.0.1")).toEqual({ denied: true, reason: "loopback-ip" });
    expect(checkDenylistedHost("127.12.0.1")).toEqual({ denied: true, reason: "loopback-ip" });
    expect(checkDenylistedHost("::1")).toEqual({ denied: true, reason: "loopback-ip" });
    expect(checkDenylistedHost("http://[::1]:3000")).toEqual({ denied: true, reason: "loopback-ip" });
  });

  it("denies private and internal-ish hosts", () => {
    for (const input of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.0.10", "100.64.0.1"]) {
      expect(checkDenylistedHost(input)).toEqual({ denied: true, reason: "private-ip" });
    }

    expect(checkDenylistedHost("printer.local")).toEqual({ denied: true, reason: "internal-suffix" });
    expect(checkDenylistedHost("router.lan")).toEqual({ denied: true, reason: "internal-suffix" });
    expect(checkDenylistedHost("intranet")).toEqual({ denied: true, reason: "single-label-host" });
  });

  it("denies Chrome and file internal URLs if encountered", () => {
    expect(checkDenylistedHost("chrome://extensions")).toEqual({ denied: true, reason: "internal-scheme" });
    expect(checkDenylistedHost("chrome-extension://abcdefghijklmnop/options.html")).toEqual({
      denied: true,
      reason: "internal-scheme"
    });
    expect(checkDenylistedHost("file:///Users/geo/example")).toEqual({ denied: true, reason: "internal-scheme" });
  });

  it("allows public Letterboxd-like domains", () => {
    expect(isDenylistedHost("letterboxd.com")).toBe(false);
    expect(isDenylistedHost("https://letterboxd.com/")).toBe(false);
    expect(isDenylistedHost("www.letterboxd.com")).toBe(false);
    expect(isDenylistedHost("www.letterboxd.com:443")).toBe(false);
    expect(isDenylistedHost("a.ltrbxd.com")).toBe(false);
    expect(isDenylistedHost("https://a.ltrbxd.com/image.jpg")).toBe(false);
  });
});
