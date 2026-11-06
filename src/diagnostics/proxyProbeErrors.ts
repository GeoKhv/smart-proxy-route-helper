// Only a bounded allowlist of Chrome error codes leaves this module. Never keep
// proxy error details (which can include private addresses or URLs).
export type ProxyProbeError = { kind: "certificate" | "tls"; code: string };
export function classifyProxyProbeError(input: unknown): ProxyProbeError | null {
  if (!input || typeof input !== "object") return null;
  const error = "error" in input ? input.error : undefined;
  if (typeof error !== "string") return null;
  const code = error.match(/\bERR_(?:PROXY_CERTIFICATE_INVALID|CERT_[A-Z_]+|SSL_[A-Z_]+|TLS_[A-Z_]+)\b/)?.[0];
  if (!code) return null;
  return { kind: code.startsWith("ERR_CERT_") || code === "ERR_PROXY_CERTIFICATE_INVALID" ? "certificate" : "tls", code };
}
