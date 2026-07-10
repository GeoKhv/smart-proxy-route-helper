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
  isRelatedDomainMainWorldRecorderResult,
  isRelatedDomainRecorderBridgeResult,
  runRelatedDomainMainWorldRecorderInPage,
  runRelatedDomainRecorderBridgeInPage,
  type RelatedDomainMainWorldRecorderResult,
  type RelatedDomainRecorderBridgeResult,
  type RelatedDomainRecorderSummary
} from "../diagnostics/actionRequestRecorder";
import {
  buildRelatedDomainRecordingPreview,
  buildRelatedDomainRecordingResponse,
  getRelatedDomainRecordingTarget,
  isRelatedDomainRecordingRequest,
  isStoredRelatedDomainRecordingSessionMetadata,
  relatedDomainRecordingMaxDurationMs,
  relatedDomainRecordingMaxHosts,
  relatedDomainRecordingSessionState,
  sanitizeRelatedDomainRecordedHostname,
  type RelatedDomainRecordingRequest,
  type RelatedDomainRecordingResponse,
  type StoredRelatedDomainRecordingSessionMetadata
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

let fallbackRelatedDomainRecordingSession: StoredRelatedDomainRecordingSessionMetadata | null = null;

type ScriptInjectionResult = {
  documentId?: string;
  frameId?: number;
  result?: unknown;
};

function sessionStorageArea(): chrome.storage.StorageArea | null {
  return chrome.storage.session ?? null;
}

async function readRelatedDomainRecordingSession(): Promise<StoredRelatedDomainRecordingSessionMetadata | null> {
  const storageArea = sessionStorageArea();

  if (!storageArea) {
    return fallbackRelatedDomainRecordingSession;
  }

  const stored = await storageArea.get(relatedDomainRecordingSessionStorageKey);
  const candidate = stored[relatedDomainRecordingSessionStorageKey];

  if (!isStoredRelatedDomainRecordingSessionMetadata(candidate)) {
    fallbackRelatedDomainRecordingSession = null;
    return null;
  }

  fallbackRelatedDomainRecordingSession = candidate;
  return candidate;
}

async function writeRelatedDomainRecordingSession(session: StoredRelatedDomainRecordingSessionMetadata): Promise<void> {
  fallbackRelatedDomainRecordingSession = session;

  await sessionStorageArea()?.set({
    [relatedDomainRecordingSessionStorageKey]: session
  });
}

async function clearRelatedDomainRecordingSession(): Promise<void> {
  fallbackRelatedDomainRecordingSession = null;

  await sessionStorageArea()?.remove(relatedDomainRecordingSessionStorageKey);
}

function createRelatedDomainRecordingNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));

  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function recorderInjectionTarget(tabId: number): chrome.scripting.InjectionTarget {
  return {
    tabId,
    allFrames: true
  };
}

function mainFrameDocumentId(results: readonly ScriptInjectionResult[]): string | undefined {
  return results.find((result) => result.frameId === 0)?.documentId ?? results[0]?.documentId;
}

function validBridgeResults(results: readonly ScriptInjectionResult[]): RelatedDomainRecorderBridgeResult[] {
  return results.flatMap((item) =>
    isRelatedDomainRecorderBridgeResult(item.result) ? [item.result] : []
  );
}

function validMainWorldResults(results: readonly ScriptInjectionResult[]): RelatedDomainMainWorldRecorderResult[] {
  return results.flatMap((item) =>
    isRelatedDomainMainWorldRecorderResult(item.result) ? [item.result] : []
  );
}

function hasStartedRecorder(results: readonly { status: string }[]): boolean {
  return results.some((result) => result.status === "started" || result.status === "already_recording");
}

function mergeRecorderResults(
  bridgeResults: readonly RelatedDomainRecorderBridgeResult[],
  mainResults: readonly RelatedDomainMainWorldRecorderResult[]
): RelatedDomainRecorderBridgeResult | null {
  const stoppedBridgeResults = bridgeResults.filter(
    (result) => result.status === "stopped" || result.status === "expired"
  );

  if (stoppedBridgeResults.length === 0) {
    return null;
  }

  const hosts = new Set<string>();
  let extensionRejectedHosts = 0;

  for (const result of stoppedBridgeResults) {
    for (const input of result.hosts) {
      const hostname = sanitizeRelatedDomainRecordedHostname(input);

      if (!hostname || (hosts.size >= relatedDomainRecordingMaxHosts && !hosts.has(hostname))) {
        extensionRejectedHosts += 1;
        continue;
      }

      hosts.add(hostname);
    }
  }

  const summary: RelatedDomainRecorderSummary = {
    rawEntriesInspected: 0,
    requestInitiationsInspected: 0,
    performanceEntriesInspected: 0,
    domAttributesInspected: 0,
    urlLikeValuesFound: 0,
    hostsExtracted: hosts.size,
    hostsRejected: extensionRejectedHosts,
    bridgeEventsRejected: 0,
    droppedPerformanceEntries: 0
  };

  for (const result of mainResults) {
    summary.rawEntriesInspected += result.summary.rawEntriesInspected;
    summary.requestInitiationsInspected += result.summary.requestInitiationsInspected;
    summary.performanceEntriesInspected += result.summary.performanceEntriesInspected;
    summary.domAttributesInspected += result.summary.domAttributesInspected;
    summary.urlLikeValuesFound += result.summary.urlLikeValuesFound;
    summary.hostsRejected += result.summary.hostsRejected;
    summary.droppedPerformanceEntries += result.summary.droppedPerformanceEntries;
  }

  for (const result of stoppedBridgeResults) {
    summary.hostsRejected += result.summary.hostsRejected;
    summary.bridgeEventsRejected += result.summary.bridgeEventsRejected;
  }

  return {
    status:
      stoppedBridgeResults.some((result) => result.status === "expired") ||
      mainResults.some((result) => result.status === "expired")
        ? "expired"
        : "stopped",
    hosts: [...hosts].sort((left, right) => left.localeCompare(right)),
    pageLooksLikeErrorOrProtection: false,
    summary
  };
}

function sameRecordedDomain(url: string | undefined, currentDomain: string): boolean {
  const target = getRelatedDomainRecordingTarget(url);

  return target.ok && target.domain === currentDomain;
}

async function executeRelatedDomainRecorderBridge(
  tabId: number,
  action: "start" | "stop" | "cancel",
  sessionNonce: string
): Promise<ScriptInjectionResult[]> {
  return chrome.scripting.executeScript({
    target: recorderInjectionTarget(tabId),
    func: runRelatedDomainRecorderBridgeInPage,
    args: [
      action,
      {
        sessionNonce,
        maxDurationMs: relatedDomainRecordingMaxDurationMs
      }
    ]
  });
}

async function executeRelatedDomainMainWorldRecorder(
  tabId: number,
  action: "start" | "stop" | "cancel",
  sessionNonce: string
): Promise<ScriptInjectionResult[]> {
  return chrome.scripting.executeScript({
    target: recorderInjectionTarget(tabId),
    world: "MAIN",
    func: runRelatedDomainMainWorldRecorderInPage,
    args: [
      action,
      {
        sessionNonce,
        maxDurationMs: relatedDomainRecordingMaxDurationMs
      }
    ]
  });
}

async function handleGetRelatedDomainRecordingState(): Promise<RelatedDomainRecordingResponse> {
  const metadata = await readRelatedDomainRecordingSession();
  const state = relatedDomainRecordingSessionState(metadata);

  if (metadata && state.status === "expired" && metadata.status !== "expired") {
    await writeRelatedDomainRecordingSession({
      ...metadata,
      status: "expired"
    });
  }

  if (!metadata || state.status === "idle") {
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
    const sessionNonce = createRelatedDomainRecordingNonce();
    const bridgeInjectionResults = await executeRelatedDomainRecorderBridge(tabId, "start", sessionNonce);
    const bridgeResults = validBridgeResults(bridgeInjectionResults);

    if (!hasStartedRecorder(bridgeResults)) {
      return buildRelatedDomainRecordingResponse(
        "collection_unavailable",
        bridgeResults[0]?.message ?? "Could not start the diagnostic recording bridge on this page.",
        existingState,
        {
          currentDomain: target.domain
        }
      );
    }

    let mainWorldInjectionResults: ScriptInjectionResult[];

    try {
      mainWorldInjectionResults = await executeRelatedDomainMainWorldRecorder(tabId, "start", sessionNonce);
    } catch (error) {
      await executeRelatedDomainRecorderBridge(tabId, "cancel", sessionNonce).catch(() => undefined);
      throw error;
    }

    const mainWorldResults = validMainWorldResults(mainWorldInjectionResults);

    if (!hasStartedRecorder(mainWorldResults)) {
      await Promise.allSettled([
        executeRelatedDomainMainWorldRecorder(tabId, "cancel", sessionNonce),
        executeRelatedDomainRecorderBridge(tabId, "cancel", sessionNonce)
      ]);

      return buildRelatedDomainRecordingResponse(
        "collection_unavailable",
        mainWorldResults[0]?.message ?? "Could not start MAIN-world request capture on this page.",
        existingState,
        {
          currentDomain: target.domain
        }
      );
    }

    const now = Date.now();
    const recordingDocumentId =
      mainFrameDocumentId(mainWorldInjectionResults) ?? mainFrameDocumentId(bridgeInjectionResults);
    const session: StoredRelatedDomainRecordingSessionMetadata = {
      tabId,
      currentDomain: target.domain,
      startedAt: now,
      expiresAt: now + relatedDomainRecordingMaxDurationMs,
      maxDurationMs: relatedDomainRecordingMaxDurationMs,
      status: "recording",
      sessionNonce,
      ...(recordingDocumentId ? { mainDocumentId: recordingDocumentId } : {})
    };

    await writeRelatedDomainRecordingSession(session);

    return buildRelatedDomainRecordingResponse(
      "success",
      `Diagnostic recording started for ${target.domain}. Perform the action, then reopen the popup and choose Stop and preview. No rules will be saved automatically.`,
      relatedDomainRecordingSessionState(session),
      {
        currentDomain: target.domain
      }
    );
  } catch {
    return buildRelatedDomainRecordingResponse(
      "collection_unavailable",
      "Could not start automatic request recording on this page. Chrome may not allow temporary script access here.",
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

  if (!metadata || state.status === "idle") {
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
    await Promise.allSettled([
      executeRelatedDomainMainWorldRecorder(state.tabId, "cancel", metadata.sessionNonce),
      executeRelatedDomainRecorderBridge(state.tabId, "cancel", metadata.sessionNonce)
    ]);
    await clearRelatedDomainRecordingSession();

    return buildRelatedDomainRecordingResponse(
      "expired",
      `Diagnostic recording for ${state.currentDomain} expired because the tab navigated or reloaded. Start a new recording on the loaded page.`,
      { status: "idle" },
      {
        currentDomain: state.currentDomain
      }
    );
  }

  try {
    const mainWorldInjectionResults = await executeRelatedDomainMainWorldRecorder(
      tabId,
      "stop",
      metadata.sessionNonce
    );
    const bridgeInjectionResults = await executeRelatedDomainRecorderBridge(
      tabId,
      "stop",
      metadata.sessionNonce
    );
    const currentDocumentId =
      mainFrameDocumentId(mainWorldInjectionResults) ?? mainFrameDocumentId(bridgeInjectionResults);
    const documentChanged =
      Boolean(metadata.mainDocumentId) &&
      Boolean(currentDocumentId) &&
      metadata.mainDocumentId !== currentDocumentId;
    const mainWorldResults = validMainWorldResults(mainWorldInjectionResults);
    const bridgeResults = validBridgeResults(bridgeInjectionResults);
    const pageResult = mergeRecorderResults(bridgeResults, mainWorldResults);

    if (documentChanged || !pageResult) {
      await clearRelatedDomainRecordingSession();

      return buildRelatedDomainRecordingResponse(
        "expired",
        `Diagnostic recording for ${state.currentDomain} expired because the page reloaded, navigated, or replaced the recorded document. Start a new recording on the loaded page.`,
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
  } catch {
    await Promise.allSettled([
      executeRelatedDomainMainWorldRecorder(state.tabId, "cancel", metadata.sessionNonce),
      executeRelatedDomainRecorderBridge(state.tabId, "cancel", metadata.sessionNonce)
    ]);
    await clearRelatedDomainRecordingSession();

    return buildRelatedDomainRecordingResponse(
      "collection_unavailable",
      "Could not stop and preview this recording. Temporary hooks were cancelled where the page remained accessible.",
      { status: "idle" },
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

  if (!metadata || state.status === "idle") {
    return buildRelatedDomainRecordingResponse("success", "No diagnostic recording is active.", state);
  }

  await Promise.allSettled([
    executeRelatedDomainMainWorldRecorder(state.tabId, "cancel", metadata.sessionNonce),
    executeRelatedDomainRecorderBridge(state.tabId, "cancel", metadata.sessionNonce)
  ]);

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") {
    return;
  }

  void readRelatedDomainRecordingSession()
    .then((session) => {
      if (session?.tabId !== tabId || session.status !== "recording") {
        return undefined;
      }

      return writeRelatedDomainRecordingSession({
        ...session,
        status: "expired"
      });
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unexpected recording navigation cleanup failure.";

      console.warn(`${extensionName} could not expire diagnostic recording state after navigation: ${message}`);
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
