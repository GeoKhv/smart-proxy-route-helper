// Serialized by chrome.scripting; keep self-contained. It reads no DOM/page
// content and issues only a credentials-free request to the current origin.
export async function probeCurrentOriginInTab(origin: string, timeoutMs: number): Promise<"reachable" | "timeout" | "network" | "navigated"> {
  if (location.origin !== origin) return "navigated";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${origin}/`, { cache: "no-store", credentials: "omit", mode: "no-cors", redirect: "manual", signal: controller.signal });
    return location.origin === origin ? "reachable" : "navigated";
  } catch {
    return controller.signal.aborted ? "timeout" : "network";
  } finally {
    clearTimeout(timer);
  }
}
