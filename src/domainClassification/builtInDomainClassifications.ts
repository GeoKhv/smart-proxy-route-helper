import type { DomainCandidateClassificationResult } from "./domainClassificationTypes";

function siteRelated(
  siteDomain: string,
  domain: string,
  reason: string
): DomainCandidateClassificationResult {
  return {
    domain,
    classification: "related",
    category: "site-assets",
    scope: "site",
    siteDomain,
    confidence: "high",
    reason,
    source: "built-in"
  };
}

function globalIgnored(
  domain: string,
  category: DomainCandidateClassificationResult["category"],
  reason: string
): DomainCandidateClassificationResult {
  return {
    domain,
    classification: "ignored",
    category,
    scope: "global",
    confidence: "high",
    reason,
    source: "built-in"
  };
}

export const builtInDomainClassifications: readonly DomainCandidateClassificationResult[] = [
  siteRelated("chatgpt.com", "oaiusercontent.com", "ChatGPT uses oaiusercontent.com for generated and file-related resources."),
  siteRelated("chatgpt.com", "oaistatic.com", "ChatGPT uses oaistatic.com for related static resources."),
  siteRelated("openai.com", "oaiusercontent.com", "OpenAI pages may use oaiusercontent.com for related generated or file resources."),
  siteRelated("openai.com", "oaistatic.com", "OpenAI pages may use oaistatic.com for related static resources."),
  siteRelated("linkedin.com", "licdn.com", "LinkedIn serves media, static, and DMS resources from licdn.com."),
  siteRelated("letterboxd.com", "ltrbxd.com", "Letterboxd serves related media and static assets from ltrbxd.com."),
  siteRelated("ltrbxd.com", "letterboxd.com", "Letterboxd and ltrbxd.com are treated as a known related pair."),

  globalIgnored("demdex.net", "adtech", "High-confidence tracking and adtech host."),
  globalIgnored("doubleclick.net", "adtech", "High-confidence advertising host."),
  globalIgnored("facebook.net", "adtech", "Common third-party tracking or advertising support host."),
  globalIgnored("stickyadstv.com", "adtech", "High-confidence advertising technology host."),
  globalIgnored("3lift.com", "adtech", "High-confidence advertising technology host."),
  globalIgnored("33across.com", "adtech", "High-confidence advertising technology host."),
  globalIgnored("teads.tv", "adtech", "High-confidence advertising technology host."),
  globalIgnored("rubiconproject.com", "adtech", "High-confidence advertising exchange host."),

  globalIgnored("google-analytics.com", "analytics", "High-confidence analytics host."),
  globalIgnored("googletagmanager.com", "analytics", "High-confidence tag-management and analytics host."),
  globalIgnored("hotjar.com", "analytics", "High-confidence analytics and session measurement host."),
  globalIgnored("sentry.io", "analytics", "Common telemetry and error-reporting host."),

  globalIgnored("local.adguard.org", "local-helper", "Local helper host used by ad-blocking software."),
  globalIgnored("w3.org", "schema-helper", "Schema, namespace, or SVG helper host, including www.w3.org."),

  globalIgnored("akamaihd.net", "system-helper", "Large shared infrastructure host that is too broad to save from preview."),
  globalIgnored("appspot.com", "system-helper", "Shared application-hosting infrastructure that is too broad to save from preview."),
  globalIgnored("auth0.com", "system-helper", "Shared identity infrastructure that is too broad to save from preview."),
  globalIgnored("cloudfront.net", "system-helper", "Large shared infrastructure host that is too broad to save from preview."),
  globalIgnored("github.io", "system-helper", "Shared pages-hosting infrastructure that is too broad to save from preview."),
  globalIgnored("googleapis.com", "system-helper", "Large shared infrastructure host that is too broad to save from preview."),
  globalIgnored("googleusercontent.com", "system-helper", "Shared Google-hosted content infrastructure that is too broad to save from preview."),
  globalIgnored("gstatic.com", "system-helper", "Large shared infrastructure host that is too broad to save from preview."),
  globalIgnored("netlify.app", "system-helper", "Shared application-hosting infrastructure that is too broad to save from preview."),
  globalIgnored("pages.dev", "system-helper", "Shared pages-hosting infrastructure that is too broad to save from preview."),
  globalIgnored("vercel.app", "system-helper", "Shared application-hosting infrastructure that is too broad to save from preview.")
];
