import {
  isCurrentSiteDiagnosticRequest,
  runCurrentSiteDiagnostic,
  type CurrentSiteDiagnosticResponse
} from "../diagnostics/currentSiteDiagnostics";
import {
  collectCurrentPageResourceHostnamesFromDom,
  isCurrentPageResourceHostsRequest,
  runCurrentPageResourceHostPreview,
  type CurrentPageResourceHostsResponse
} from "../diagnostics/currentPageResourceHosts";
import {
  buildRelatedDomainRecordingPreview,
  buildRelatedDomainRecordingResponse,
  getRelatedDomainRecordingTarget,
  isRelatedDomainRecorderPageResult,
  isRelatedDomainRecordingRequest,
  isRelatedDomainRecordingSessionMetadata,
  relatedDomainRecordingMaxDurationMs,
  relatedDomainRecordingSessionState,
  runRelatedDomainRecorderInPage,
  type RelatedDomainRecorderPageResult,
  type RelatedDomainRecordingRequest,
  type RelatedDomainRecordingResponse,
  type RelatedDomainRecordingSessionMetadata
} from "../diagnostics/relatedDomainRecording";
import { domainCandidateUserOverridesFromStorage } from "../domainClassification/userClassificationOverrides";
import { createChromeProxySettingsAdapter, createProxySettingsController } from "../proxy/applyProxySettings";
import { getSyncSettings } from "../storage/syncStore";

const extensionName = "Smart Proxy Route Helper";
const proxySettingsAdapter = createChromeProxySettingsAdapter();
const proxySettingsController = createProxySettingsController({
  proxySettings: proxySettingsAdapter
});
const relatedDomainRecordingSessionStorageKey = "relatedDomainRecordingSession";

let fallbackRelatedDomainRecordingSession: RelatedDomainRecordingSessionMetadata | null = null;

type ScriptInjectionResult = {
  result?: unknown;
};

function sessionStorageArea(): chrome.storage.StorageArea | null {
  return chrome.storage.session ?? null;
}

async function readRelatedDomainRecordingSession(): Promise<RelatedDomainRecordingSessionMetadata | null> {
  const storageArea = sessionStorageArea();

  if (!storageArea) {
    return fallbackRelatedDomainRecordingSession;
  }

  const stored = await storageArea.get(relatedDomainRecordingSessionStorageKey);
  const candidate = stored[relatedDomainRecordingSessionStorageKey];

  if (!isRelatedDomainRecordingSessionMetadata(candidate)) {
    fallbackRelatedDomainRecordingSession = null;
    return null;
  }

  fallbackRelatedDomainRecordingSession = candidate;
  return candidate;
}

async function writeRelatedDomainRecordingSession(session: RelatedDomainRecordingSessionMetadata): Promise<void> {
  fallbackRelatedDomainRecordingSession = session;

  await sessionStorageArea()?.set({
    [relatedDomainRecordingSessionStorageKey]: session
  });
}

async function clearRelatedDomainRecordingSession(): Promise<void> {
  fallbackRelatedDomainRecordingSession = null;

  await sessionStorageArea()?.remove(relatedDomainRecordingSessionStorageKey);
}

function firstRecorderPageResult(results: readonly ScriptInjectionResult[]): RelatedDomainRecorderPageResult | null {
  for (const item of results) {
    if (isRelatedDomainRecorderPageResult(item.result)) {
      return item.result;
    }
  }

  return null;
}

function sameRecordedDomain(url: string | undefined, currentDomain: string): boolean {
  const target = getRelatedDomainRecordingTarget(url);

  return target.ok && target.domain === currentDomain;
}

async function executeRelatedDomainRecorder(
  tabId: number,
  action: "start" | "stop" | "cancel"
): Promise<RelatedDomainRecorderPageResult | null> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: runRelatedDomainRecorderInPage,
    args: [
      action,
      {
        maxDurationMs: relatedDomainRecordingMaxDurationMs
      }
    ]
  });

  return firstRecorderPageResult(results);
}

async function handleGetRelatedDomainRecordingState(): Promise<RelatedDomainRecordingResponse> {
  const metadata = await readRelatedDomainRecordingSession();
  const state = relatedDomainRecordingSessionState(metadata);

  if (state.status === "expired" && metadata?.status !== "expired") {
    await writeRelatedDomainRecordingSession(state);
  }

  if (state.status === "idle") {
    return buildRelatedDomainRecordingResponse("success", "No diagnostic recording is active.", state);
  }

  if (state.status === "expired") {
    return buildRelatedDomainRecordingResponse(
      "expired",
      `Diagnostic recording for ${state.currentDomain} expired. Stop and preview from that tab, or cancel it.`,
      state,
      {
        currentDomain: state.currentDomain
      }
    );
  }

  return buildRelatedDomainRecordingResponse(
    "success",
    `Diagnostic recording is active for ${state.currentDomain}. No data is saved until you add selected domains.`,
    state,
    {
      currentDomain: state.currentDomain
    }
  );
}

async function handleStartRelatedDomainRecording(
  request: RelatedDomainRecordingRequest
): Promise<RelatedDomainRecordingResponse> {
  const target = getRelatedDomainRecordingTarget(request.url);

  if (!target.ok) {
    return target.response;
  }

  if (typeof request.tabId !== "number" || !Number.isInteger(request.tabId) || request.tabId < 0) {
    return buildRelatedDomainRecordingResponse(
      "error",
      "Could not identify the active tab for diagnostic recording.",
      undefined,
      {
        currentDomain: target.domain
      }
    );
  }

  const tabId = request.tabId;
  const existingState = relatedDomainRecordingSessionState(await readRelatedDomainRecordingSession());

  if (existingState.status === "recording") {
    if (existingState.tabId !== tabId) {
      return buildRelatedDomainRecordingResponse(
        "active_in_other_tab",
        `Diagnostic recording is already active for ${existingState.currentDomain} in another tab. Return to that tab to stop and preview, or cancel it.`,
        existingState,
        {
          currentDomain: existingState.currentDomain
        }
      );
    }

    return buildRelatedDomainRecordingResponse(
      "success",
      `Diagnostic recording is already active for ${existingState.currentDomain}.`,
      existingState,
      {
        currentDomain: existingState.currentDomain
      }
    );
  }

  try {
    const pageResult = await executeRelatedDomainRecorder(tabId, "start");

    if (!pageResult || (pageResult.status !== "started" && pageResult.status !== "already_recording")) {
      return buildRelatedDomainRecordingResponse(
        "collection_unavailable",
        pageResult?.message ?? "Could not start diagnostic recording on this page.",
        existingState,
        {
          currentDomain: target.domain
        }
      );
    }

    const now = Date.now();
    const session: RelatedDomainRecordingSessionMetadata = {
      tabId,
      currentDomain: target.domain,
      startedAt: now,
      expiresAt: now + relatedDomainRecordingMaxDurationMs,
      maxDurationMs: relatedDomainRecordingMaxDurationMs,
      status: "recording"
    };

    await writeRelatedDomainRecordingSession(session);

    return buildRelatedDomainRecordingResponse(
      "success",
      `Diagnostic recording started for ${target.domain}. Perform the action, then reopen the popup and choose Stop and preview. No rules will be saved automatically.`,
      session,
      {
        currentDomain: target.domain
      }
    );
  } catch (error) {
    return buildRelatedDomainRecordingResponse(
      "collection_unavailable",
      error instanceof Error ? error.message : "Could not start diagnostic recording on this page.",
      existingState,
      {
        currentDomain: target.domain
      }
    );
  }
}

async function handleStopRelatedDomainRecording(
  request: RelatedDomainRecordingRequest
): Promise<RelatedDomainRecordingResponse> {
  const metadata = await readRelatedDomainRecordingSession();
  const state = relatedDomainRecordingSessionState(metadata);

  if (state.status === "idle") {
    return buildRelatedDomainRecordingResponse("not_found", "No diagnostic recording is active.", state);
  }

  if (typeof request.tabId !== "number" || !Number.isInteger(request.tabId) || request.tabId < 0) {
    return buildRelatedDomainRecordingResponse(
      "error",
      "Could not identify the active tab for diagnostic recording.",
      state,
      {
        currentDomain: state.currentDomain
      }
    );
  }

  const tabId = request.tabId;

  if (state.tabId !== tabId) {
    return buildRelatedDomainRecordingResponse(
      "active_in_other_tab",
      `Diagnostic recording belongs to ${state.currentDomain} in another tab. Return to that tab to stop and preview, or cancel it.`,
      state,
      {
        currentDomain: state.currentDomain
      }
    );
  }

  if (!sameRecordedDomain(request.url, state.currentDomain)) {
    await clearRelatedDomainRecordingSession();

    return buildRelatedDomainRecordingResponse(
      "collection_unavailable",
      `Diagnostic recording for ${state.currentDomain} could not be previewed because the tab changed pages. Start a new recording on the loaded page.`,
      { status: "idle" },
      {
        currentDomain: state.currentDomain
      }
    );
  }

  try {
    const pageResult = await executeRelatedDomainRecorder(tabId, "stop");

    if (!pageResult || pageResult.status === "not_found") {
      await clearRelatedDomainRecordingSession();

      return buildRelatedDomainRecordingResponse(
        "not_found",
        pageResult?.message ?? "Diagnostic recording was not found. The page may have reloaded.",
        { status: "idle" },
        {
          currentDomain: state.currentDomain
        }
      );
    }

    if (pageResult.status === "error" || pageResult.status === "cancelled") {
      await clearRelatedDomainRecordingSession();

      return buildRelatedDomainRecordingResponse(
        "collection_unavailable",
        pageResult.message ?? "Could not stop diagnostic recording on this page.",
        { status: "idle" },
        {
          currentDomain: state.currentDomain
        }
      );
    }

    await clearRelatedDomainRecordingSession();

    const settings = await getSyncSettings();
    const preview = buildRelatedDomainRecordingPreview({
      currentDomain: state.currentDomain,
      recordedHosts: pageResult.hosts,
      pageLooksLikeErrorOrProtection: pageResult.pageLooksLikeErrorOrProtection,
      collectionSummary: pageResult.summary,
      userOverrides: domainCandidateUserOverridesFromStorage(settings.classificationOverrides)
    });
    const expired = pageResult.status === "expired" || state.status === "expired";

    return buildRelatedDomainRecordingResponse(
      expired ? "expired" : "success",
      expired
        ? `Diagnostic recording for ${state.currentDomain} expired. Previewing hosts captured before expiration. No rules were saved.`
        : `Diagnostic recording stopped for ${state.currentDomain}. Previewing recorded hosts. No rules were saved.`,
      { status: "idle" },
      {
        currentDomain: state.currentDomain,
        preview
      }
    );
  } catch (error) {
    return buildRelatedDomainRecordingResponse(
      "collection_unavailable",
      error instanceof Error ? error.message : "Could not stop diagnostic recording on this page.",
      state,
      {
        currentDomain: state.currentDomain
      }
    );
  }
}

async function handleCancelRelatedDomainRecording(
  request: RelatedDomainRecordingRequest
): Promise<RelatedDomainRecordingResponse> {
  const metadata = await readRelatedDomainRecordingSession();
  const state = relatedDomainRecordingSessionState(metadata);

  if (state.status === "idle") {
    return buildRelatedDomainRecordingResponse("success", "No diagnostic recording is active.", state);
  }

  if (Number.isInteger(request.tabId) && request.tabId === state.tabId) {
    try {
      await executeRelatedDomainRecorder(request.tabId, "cancel");
    } catch {
      // Metadata cleanup is still safe if the page was reloaded or inaccessible.
    }
  }

  await clearRelatedDomainRecordingSession();

  return buildRelatedDomainRecordingResponse(
    "success",
    `Diagnostic recording for ${state.currentDomain} was cancelled. No candidates were returned and no rules were saved.`,
    { status: "idle" },
    {
      currentDomain: state.currentDomain
    }
  );
}

async function handleRelatedDomainRecordingMessage(
  request: RelatedDomainRecordingRequest
): Promise<RelatedDomainRecordingResponse> {
  if (request.action === "get-state") {
    return handleGetRelatedDomainRecordingState();
  }

  if (request.action === "start") {
    return handleStartRelatedDomainRecording(request);
  }

  if (request.action === "stop") {
    return handleStopRelatedDomainRecording(request);
  }

  return handleCancelRelatedDomainRecording(request);
}

chrome.runtime.onInstalled.addListener(() => {
  console.info(`${extensionName} service worker installed.`);
});

void proxySettingsController.apply("startup");

chrome.storage.onChanged.addListener((changes, areaName) => {
  void proxySettingsController.handleStorageChange(changes, areaName).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected storage change handling failure.";

    console.warn(`${extensionName} could not handle storage changes: ${message}`);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void readRelatedDomainRecordingSession()
    .then((session) => {
      if (session?.tabId === tabId) {
        return clearRelatedDomainRecordingSession();
      }

      return undefined;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected recording cleanup failure.";

      console.warn(`${extensionName} could not clean up diagnostic recording state: ${message}`);
    });
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isCurrentSiteDiagnosticRequest(message)) {
    void runCurrentSiteDiagnostic(message.url, {
      proxySettings: proxySettingsAdapter,
      restoreProxySettings: () => proxySettingsController.apply("diagnostic-restore", { force: true })
    })
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const response: CurrentSiteDiagnosticResponse = {
          status: "error",
          message: error instanceof Error ? error.message : "Could not complete the proxy check."
        };

        sendResponse(response);
      });

    return true;
  }

  if (isCurrentPageResourceHostsRequest(message)) {
    void getSyncSettings()
      .then((settings) =>
        runCurrentPageResourceHostPreview(message, {
          executeScript: (tabId) =>
            chrome.scripting.executeScript({
              target: { tabId },
              func: collectCurrentPageResourceHostnamesFromDom
            }),
          userOverrides: domainCandidateUserOverridesFromStorage(settings.classificationOverrides)
        })
      )
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const response: CurrentPageResourceHostsResponse = {
          status: "error",
          message: error instanceof Error ? error.message : "Could not preview related domains."
        };

        sendResponse(response);
      });

    return true;
  }

  if (isRelatedDomainRecordingRequest(message)) {
    void handleRelatedDomainRecordingMessage(message)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const response: RelatedDomainRecordingResponse = {
          status: "error",
          message: error instanceof Error ? error.message : "Could not handle diagnostic recording.",
          state: { status: "idle" }
        };

        sendResponse(response);
      });

    return true;
  }

  return false;
});

export {};
