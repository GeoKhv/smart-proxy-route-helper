const statusElement = document.querySelector<HTMLElement>("#options-status");

if (statusElement) {
  statusElement.textContent =
    "Placeholder options page only. Storage, PAC generation, and diagnostics are not implemented yet.";
}

export {};
