// Web Locks are shared by extension pages and its service worker. The fallback
// serializes adapters in tests / environments without navigator.locks.
const tails = new Map<string, Promise<unknown>>();
export async function withSettingsLock<T>(area: "sync" | "local", operation: () => Promise<T>): Promise<T> {
  const name = `smart-proxy-settings-${area}`;
  if (globalThis.navigator?.locks) return navigator.locks.request(name, operation);
  const request = (tails.get(name) ?? Promise.resolve()).then(operation);
  tails.set(name, request.catch(() => undefined));
  return request;
}
