import { describe, expect, it } from "vitest";

import { canonicalizeHostname } from "../src/rules/canonicalizeHostname";

function expectCanonical(input: string, domain: string): void {
  expect(canonicalizeHostname(input)).toEqual({
    ok: true,
    domain
  });
}

describe("canonicalizeHostname", () => {
  it.each([
    ["www.example.com", "example.com"],
    ["WWW.Example.COM", "example.com"],
    ["www.example.co.uk", "example.co.uk"],
    ["https://WWW.Example.COM./path", "example.com"]
  ])("canonicalizes a standard registrable-domain WWW hostname: %s", (input, expected) => {
    expectCanonical(input, expected);
  });

  it.each([
    "www2.example.com",
    "www1.example.com",
    "api.example.com",
    "www.status.example.com",
    "api.www.example.com"
  ])("does not strip non-standard or nested WWW labels: %s", (input) => {
    expectCanonical(input, input);
  });

  it("preserves current validation results for internal, private, and invalid inputs", () => {
    expectCanonical("localhost", "localhost");
    expectCanonical("192.168.1.1", "192.168.1.1");
    expect(canonicalizeHostname("not a host")).toMatchObject({
      ok: false,
      error: { code: "invalid-host" }
    });
  });
});
