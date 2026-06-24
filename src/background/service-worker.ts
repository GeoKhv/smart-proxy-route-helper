const extensionName = "Smart Proxy Route Helper";

chrome.runtime.onInstalled.addListener(() => {
  console.info(`${extensionName} placeholder service worker installed.`);
});

export {};
