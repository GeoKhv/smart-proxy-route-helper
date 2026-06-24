import {
  isCurrentSiteDiagnosticRequest,
  runCurrentSiteDiagnostic,
  type CurrentSiteDiagnosticResponse
} from "../diagnostics/currentSiteDiagnostics";
import { createChromeProxySettingsAdapter, createProxySettingsController } from "../proxy/applyProxySettings";

const extensionName = "Smart Proxy Route Helper";
const proxySettingsAdapter = createChromeProxySettingsAdapter();
const proxySettingsController = createProxySettingsController({
  proxySettings: proxySettingsAdapter
});

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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isCurrentSiteDiagnosticRequest(message)) {
    return false;
  }

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
});

export {};
