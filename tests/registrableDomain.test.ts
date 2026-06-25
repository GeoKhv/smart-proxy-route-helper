import { describe, expect, it } from "vitest";

import {
  canBroadenToRegistrableDomain,
  getDomainParts,
  getRegistrableDomain,
  isKnownPublicOrPrivateSuffixBoundary,
  isSharedInfrastructureRegistrableDomain
} from "../src/domainClassification/registrableDomain";

describe("registrable-domain parsing", () => {
  it("returns public-suffix-aware registrable domains for normal hosts", () => {
    expect(getRegistrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
    expect(getRegistrableDomain("https://www.example.com/path")).toBe("example.com");
    expect(getRegistrableDomain("media.licdn.com")).toBe("licdn.com");
  });

  it("keeps private-suffix tenants from broadening to shared hosting roots", () => {
    const cases = [
      ["myproject.github.io", "myproject.github.io", "github.io"],
      ["app.appspot.com", "app.appspot.com", "appspot.com"],
      ["project.pages.dev", "project.pages.dev", "pages.dev"],
      ["site.vercel.app", "site.vercel.app", "vercel.app"],
      ["site.netlify.app", "site.netlify.app", "netlify.app"],
      ["random.cloudfront.net", "random.cloudfront.net", "cloudfront.net"]
    ] as const;

    for (const [hostname, safeTenantDomain, unsafeSharedDomain] of cases) {
      expect(getRegistrableDomain(hostname)).toBe(safeTenantDomain);
      expect(isKnownPublicOrPrivateSuffixBoundary(hostname)).toBe(true);
      expect(canBroadenToRegistrableDomain(hostname, { targetDomain: unsafeSharedDomain })).toBe(false);
    }
  });

  it("allows generated oaiusercontent hosts only through an explicit related-domain context", () => {
    expect(getRegistrableDomain("sdmntpritalynorth.oaiusercontent.com")).toBe("oaiusercontent.com");
    expect(getDomainParts("sdmntpritalynorth.oaiusercontent.com")).toMatchObject({
      hostname: "sdmntpritalynorth.oaiusercontent.com",
      registrableDomain: "oaiusercontent.com",
      privateRegistrableDomain: null,
      privatePublicSuffix: "sdmntpritalynorth.oaiusercontent.com",
      isPrivateSuffixBoundary: true
    });
    expect(
      canBroadenToRegistrableDomain("sdmntpritalynorth.oaiusercontent.com", {
        targetDomain: "oaiusercontent.com"
      })
    ).toBe(false);
    expect(
      canBroadenToRegistrableDomain("sdmntpritalynorth.oaiusercontent.com", {
        targetDomain: "oaiusercontent.com",
        explicitRelatedBaseDomain: "oaiusercontent.com"
      })
    ).toBe(true);
  });

  it("blocks automatic broadening to known shared infrastructure bases", () => {
    expect(isSharedInfrastructureRegistrableDomain("cloudfront.net")).toBe(true);
    expect(isSharedInfrastructureRegistrableDomain("github.io")).toBe(true);
    expect(isSharedInfrastructureRegistrableDomain("appspot.com")).toBe(true);
    expect(isSharedInfrastructureRegistrableDomain("googleusercontent.com")).toBe(true);
    expect(isSharedInfrastructureRegistrableDomain("auth0.com")).toBe(true);
    expect(isSharedInfrastructureRegistrableDomain("pages.dev")).toBe(true);
    expect(isSharedInfrastructureRegistrableDomain("vercel.app")).toBe(true);
    expect(isSharedInfrastructureRegistrableDomain("netlify.app")).toBe(true);
  });
});
