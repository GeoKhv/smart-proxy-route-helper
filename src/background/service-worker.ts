import { createProxySettingsController } from "../proxy/applyProxySettings";

const extensionName = "Smart Proxy Route Helper";
const proxySettingsController = createProxySettingsController();

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

export {};
