import {
  buildCurrentPageResourceHostPreview,
  type CurrentPageResourceHostsResponse
} from "./currentPageResourceHosts";
import {
  isLocalizedMessage,
  localizedMessage,
  type LocalizedMessage
} from "../i18n/i18n";
import { canonicalizeHostname } from "../rules/canonicalizeHostname";
import type { RelatedDomainRecorderSummary } from "./actionRequestRecorder";
import type { DomainCandidateUserOverride } from "../domainClassification/domainClassificationTypes";
import { checkDenylistedHost } from "../rules/denylist";
import { normalizeDomain } from "../rules/normalizeDomain";

export const relatedDomainRecordingMessageType =
  "smart-proxy-route-helper:record-related-domains" as const;

export const relatedDomainRecordingMaxDurationMs = 120_000;
export const relatedDomainRecordingMaxHosts = 80;

export type RelatedDomainRecordingAction = "get-state" | "start" | "stop" | "cancel";

export type RelatedDomainRecordingRequest = {
  type: typeof relatedDomainRecordingMessageType;
  action: RelatedDomainRecordingAction;
  tabId?: number;
  url?: string;
};

export type RelatedDomainRecordingSessionMetadata = {
  tabId: number;
  currentDomain: string;
  startedAt: number;
  expiresAt: number;
  maxDurationMs: number;
  status: "recording" | "expired";
};

export type StoredRelatedDomainRecordingSessionMetadata = RelatedDomainRecordingSessionMetadata & {
  sessionNonce: string;
  mainDocumentId?: string;
};

export type RelatedDomainRecordingSessionState =
  | {
      status: "idle";
    }
  | RelatedDomainRecordingSessionMetadata;

export type RelatedDomainRecordingStatus =
  | "success"
  | "unsupported_url"
  | "active_in_other_tab"
  | "not_found"
  | "collection_unavailable"
  | "expired"
  | "error";

export type RelatedDomainRecordingResponse = {
  status: RelatedDomainRecordingStatus;
  message: LocalizedMessage;
  state: RelatedDomainRecordingSessionState;
  currentDomain?: string;
  preview?: CurrentPageResourceHostsResponse;
};

type RecordingTarget =
  | {
      ok: true;
      domain: string;
    }
  | {
      ok: false;
      response: RelatedDomainRecordingResponse;
    };

function idleState(): RelatedDomainRecordingSessionState {
  return {
    status: "idle"
  };
}

export function buildRelatedDomainRecordingResponse(
  status: RelatedDomainRecordingStatus,
  message: LocalizedMessage,
  state: RelatedDomainRecordingSessionState = idleState(),
  extra: Pick<RelatedDomainRecordingResponse, "currentDomain" | "preview"> = {}
): RelatedDomainRecordingResponse {
  return {
    status,
    message,
    state,
    ...(extra.currentDomain ? { currentDomain: extra.currentDomain } : {}),
    ...(extra.preview ? { preview: extra.preview } : {})
  };
}

function unsupportedUrlMessage(url: string): LocalizedMessage {
  try {
    const protocol = new URL(url).protocol.replace(/:$/, "");

    return protocol
      ? localizedMessage("recordingProtocolCannotUse", [`${protocol}://`])
      : localizedMessage("recordingOpenValidSite");
  } catch {
    return localizedMessage("recordingOpenValidSite");
  }
}

function denylistMessage(reason: string): LocalizedMessage {
  const messages: Record<string, LocalizedMessage> = {
    "internal-scheme": localizedMessage("recordingInternalPage"),
    localhost: localizedMessage("recordingLocalhost"),
    "loopback-ip": localizedMessage("recordingLoopback"),
    "private-ip": localizedMessage("recordingPrivate"),
    "internal-suffix": localizedMessage("recordingInternalDomain"),
    "single-label-host": localizedMessage("recordingOpenPublicDomain"),
    "invalid-host": localizedMessage("recordingOpenValidSite")
  };

  return messages[reason] ?? localizedMessage("recordingSiteCannotUse");
}

export function getRelatedDomainRecordingTarget(url: string | undefined): RecordingTarget {
  if (!url) {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse(
        "unsupported_url",
        localizedMessage("recordingOpenSupportedSite")
      )
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse(
        "unsupported_url",
        localizedMessage("recordingOpenValidSite")
      )
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse("unsupported_url", unsupportedUrlMessage(url))
    };
  }

  const normalized = canonicalizeHostname(url);

  if (!normalized.ok) {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse(
        "unsupported_url",
        localizedMessage("recordingOpenValidSite")
      )
    };
  }

  const denylist = checkDenylistedHost(normalized.domain);

  if (denylist.denied) {
    return {
      ok: false,
      response: buildRelatedDomainRecordingResponse(
        "unsupported_url",
        denylistMessage(denylist.reason),
        idleState(),
        {
          currentDomain: normalized.domain
        }
      )
    };
  }

  return {
    ok: true,
    domain: normalized.domain
  };
}

function isSupportedAction(action: unknown): action is RelatedDomainRecordingAction {
  return action === "get-state" || action === "start" || action === "stop" || action === "cancel";
}

function isSupportedStatus(status: unknown): status is RelatedDomainRecordingStatus {
  return (
    status === "success" ||
    status === "unsupported_url" ||
    status === "active_in_other_tab" ||
    status === "not_found" ||
    status === "collection_unavailable" ||
    status === "expired" ||
    status === "error"
  );
}

export function isRelatedDomainRecordingSessionMetadata(
  input: unknown
): input is RelatedDomainRecordingSessionMetadata {
  return (
    typeof input === "object" &&
    input !== null &&
    "tabId" in input &&
    Number.isInteger(input.tabId) &&
    "currentDomain" in input &&
    typeof input.currentDomain === "string" &&
    "startedAt" in input &&
    typeof input.startedAt === "number" &&
    "expiresAt" in input &&
    typeof input.expiresAt === "number" &&
    "maxDurationMs" in input &&
    typeof input.maxDurationMs === "number" &&
    "status" in input &&
    (input.status === "recording" || input.status === "expired")
  );
}

export function isStoredRelatedDomainRecordingSessionMetadata(
  input: unknown
): input is StoredRelatedDomainRecordingSessionMetadata {
  return (
    isRelatedDomainRecordingSessionMetadata(input) &&
    "sessionNonce" in input &&
    typeof input.sessionNonce === "string" &&
    input.sessionNonce.length >= 32 &&
    input.sessionNonce.length <= 96 &&
    /^[a-f0-9-]+$/i.test(input.sessionNonce) &&
    (!("mainDocumentId" in input) || typeof input.mainDocumentId === "string")
  );
}

export function relatedDomainRecordingSessionState(
  metadata: RelatedDomainRecordingSessionMetadata | null,
  now: number = Date.now()
): RelatedDomainRecordingSessionState {
  if (!metadata) {
    return idleState();
  }

  return {
    tabId: metadata.tabId,
    currentDomain: metadata.currentDomain,
    startedAt: metadata.startedAt,
    expiresAt: metadata.expiresAt,
    maxDurationMs: metadata.maxDurationMs,
    status: metadata.status === "expired" || metadata.expiresAt <= now ? "expired" : "recording"
  };
}

export function isRelatedDomainRecordingRequest(input: unknown): input is RelatedDomainRecordingRequest {
  return (
    typeof input === "object" &&
    input !== null &&
    "type" in input &&
    input.type === relatedDomainRecordingMessageType &&
    "action" in input &&
    isSupportedAction(input.action) &&
    (!("tabId" in input) || typeof input.tabId === "number") &&
    (!("url" in input) || typeof input.url === "string")
  );
}

export function isRelatedDomainRecordingResponse(input: unknown): input is RelatedDomainRecordingResponse {
  if (typeof input !== "object" || input === null || !("state" in input)) {
    return false;
  }

  const state = input.state;

  return (
    "status" in input &&
    isSupportedStatus(input.status) &&
    "message" in input &&
    isLocalizedMessage(input.message) &&
    ((typeof state === "object" && state !== null && "status" in state && state.status === "idle") ||
      isRelatedDomainRecordingSessionMetadata(state)) &&
    (!("currentDomain" in input) || typeof input.currentDomain === "string") &&
    (!("preview" in input) || (typeof input.preview === "object" && input.preview !== null))
  );
}

export function buildRelatedDomainRecordingPreview(input: {
  currentDomain: string;
  recordedHosts: readonly string[];
  pageLooksLikeErrorOrProtection?: boolean;
  collectionSummary?: RelatedDomainRecorderSummary;
  userOverrides?: readonly DomainCandidateUserOverride[];
}): CurrentPageResourceHostsResponse {
  const preview = buildCurrentPageResourceHostPreview({
    url: `https://${input.currentDomain}/`,
    collectedHosts: input.recordedHosts,
    pageLooksLikeErrorOrProtection: input.pageLooksLikeErrorOrProtection,
    collectionSummary: input.collectionSummary,
    userOverrides: input.userOverrides
  });

  return {
    ...preview,
    captureMode: "recording"
  };
}

export function sanitizeRelatedDomainRecordedHostname(input: string): string | null {
  const trimmed = input.trim();

  if (
    trimmed !== input ||
    trimmed.length === 0 ||
    trimmed.length > 253 ||
    /[\s:/?#@\\]/.test(trimmed) ||
    !trimmed.includes(".")
  ) {
    return null;
  }

  const normalized = normalizeDomain(trimmed);

  if (!normalized.ok || checkDenylistedHost(normalized.domain).denied) {
    return null;
  }

  const canonicalInput = trimmed.toLowerCase().replace(/\.+$/, "");

  return normalized.domain === canonicalInput ? normalized.domain : null;
}
