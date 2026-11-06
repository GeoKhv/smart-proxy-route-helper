import { afterEach, describe, expect, it, vi } from "vitest";
import { probeCurrentOriginInTab } from "../src/diagnostics/currentSiteProbe";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("bounded origin-only route probe", () => {
  it("requests only the current origin root without cookies, cache or redirect following", async () => {
    vi.stubGlobal("location", { origin: "https://example.com" });
    const fetcher = vi.fn(async () => ({})); vi.stubGlobal("fetch", fetcher);
    await expect(probeCurrentOriginInTab("https://example.com", 6500)).resolves.toBe("reachable");
    expect(fetcher).toHaveBeenCalledWith("https://example.com/", expect.objectContaining({ cache: "no-store", credentials: "omit", mode: "no-cors", redirect: "manual", signal: expect.any(AbortSignal) }));
  });
  it("does not fetch a different origin and invalidates results after navigation", async () => {
    const page = { origin: "https://example.com" }; vi.stubGlobal("location", page);
    const fetcher = vi.fn(async () => { page.origin = "https://other.example"; }); vi.stubGlobal("fetch", fetcher);
    await expect(probeCurrentOriginInTab("https://other.example", 6500)).resolves.toBe("navigated"); expect(fetcher).not.toHaveBeenCalled();
    await expect(probeCurrentOriginInTab("https://example.com", 6500)).resolves.toBe("navigated");
  });
  it("aborts a hanging request without attributing the timeout to TLS", async () => {
    vi.useFakeTimers(); vi.stubGlobal("location", { origin: "https://example.com" });
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))));
    const pending = probeCurrentOriginInTab("https://example.com", 50);
    await vi.advanceTimersByTimeAsync(60); await expect(pending).resolves.toBe("timeout");
  });
});
