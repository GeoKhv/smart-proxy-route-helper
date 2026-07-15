import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildRelatedDomainRecordingPreview,
  getRelatedDomainRecordingTarget,
  relatedDomainRecordingSessionState,
  sanitizeRelatedDomainRecordedHostname
} from "../src/diagnostics/relatedDomainRecording";

describe("related-domain diagnostic recording target", () => {
  it("accepts public http and https pages and rejects unsupported targets", () => {
    expect(getRelatedDomainRecordingTarget("https://ChatGPT.com/c/123")).toEqual({
      ok: true,
      domain: "chatgpt.com"
    });
    expect(getRelatedDomainRecordingTarget("https://www.wikipedia.org/wiki/Main_Page")).toEqual({
      ok: true,
      domain: "wikipedia.org"
    });
    expect(getRelatedDomainRecordingTarget("chrome://extensions")).toMatchObject({
      ok: false,
      response: {
        status: "unsupported_url"
      }
    });
    expect(getRelatedDomainRecordingTarget("http://localhost:3000")).toMatchObject({
      ok: false,
      response: {
        status: "unsupported_url",
        currentDomain: "localhost"
      }
    });
  });

  it("maps stored metadata to public state without exposing the session nonce", () => {
    const metadata = {
      tabId: 7,
      currentDomain: "chatgpt.com",
      startedAt: 1_000,
      expiresAt: 3_000,
      maxDurationMs: 2_000,
      status: "recording" as const,
      sessionNonce: "a".repeat(48),
      mainDocumentId: "document-1"
    };

    expect(relatedDomainRecordingSessionState(null, 2_000)).toEqual({ status: "idle" });
    expect(relatedDomainRecordingSessionState(metadata, 2_000)).toEqual({
      tabId: 7,
      currentDomain: "chatgpt.com",
      startedAt: 1_000,
      expiresAt: 3_000,
      maxDurationMs: 2_000,
      status: "recording"
    });
    expect(JSON.stringify(relatedDomainRecordingSessionState(metadata, 2_000))).not.toContain("sessionNonce");
    expect(relatedDomainRecordingSessionState(metadata, 3_000)).toMatchObject({ status: "expired" });
  });

  it("accepts hostnames only and rejects raw or signed URLs at the extension boundary", () => {
    expect(sanitizeRelatedDomainRecordedHostname("SDMNTPRITALYNORTH.oaiusercontent.com.")).toBe(
      "sdmntpritalynorth.oaiusercontent.com"
    );
    expect(
      sanitizeRelatedDomainRecordedHostname(
        "https://sdmntpritalynorth.oaiusercontent.com/files/upload?sig=secret&se=tomorrow"
      )
    ).toBeNull();
    expect(sanitizeRelatedDomainRecordedHostname("sdmntpritalynorth.oaiusercontent.com/path")).toBeNull();
    expect(sanitizeRelatedDomainRecordedHostname("localhost")).toBeNull();
  });
});

describe("related-domain recording preview", () => {
  it("plans one generated oaiusercontent hostname as a generic registrable-domain route", () => {
    const preview = buildRelatedDomainRecordingPreview({
      currentDomain: "chatgpt.com",
      recordedHosts: ["sdmntpritalynorth.oaiusercontent.com"]
    });

    expect(preview.status).toBe("success");
    expect(preview.captureMode).toBe("recording");
    expect(preview.candidates?.strongCandidates).toEqual([
      expect.objectContaining({
        domain: "oaiusercontent.com",
        suggestedRuleDomain: "oaiusercontent.com",
        suggestedIncludeSubdomains: true,
        sourceHosts: ["sdmntpritalynorth.oaiusercontent.com"]
      })
    ]);
    expect(JSON.stringify(preview)).not.toMatch(/sig=|se=|\/files\/|\?/);
  });

  it("broadens generated hosts generically but keeps shared infrastructure exact", () => {
    const preview = buildRelatedDomainRecordingPreview({
      currentDomain: "example.com",
      recordedHosts: ["abcdefghijklmnop.unknown-assets.net", "abcdefghijklmnop.cloudfront.net"]
    });

    expect(preview.candidates?.mediumCandidates).toEqual([
      expect.objectContaining({
        domain: "unknown-assets.net",
        routeTargetReason: "generated-subdomain",
        suggestedIncludeSubdomains: true
      })
    ]);
    expect(preview.candidates?.ignoredCandidates).toEqual([
      expect.objectContaining({
        domain: "abcdefghijklmnop.cloudfront.net",
        routeTargetReason: "unsafe-shared-infrastructure",
        suggestedIncludeSubdomains: false
      })
    ]);
  });

  it("does not include storage writes or rule creation helpers in the recording module", async () => {
    const source = await readFile(resolve(__dirname, "../src/diagnostics/relatedDomainRecording.ts"), "utf8");

    expect(source).not.toContain("chrome.storage");
    expect(source).not.toContain("chrome.proxy");
    expect(source).not.toContain("updateSyncSettings");
    expect(source).not.toContain("addCurrentSiteRule");
  });
});
