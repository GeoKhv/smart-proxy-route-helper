import { getMessage } from "../i18n/i18n";

export const supportedLocalProxySchemes = ["http", "https", "socks4", "socks5"] as const;

export type LocalProxyScheme = (typeof supportedLocalProxySchemes)[number];

export type LocalProxyConfig = {
  scheme: LocalProxyScheme;
  host: string;
  port: number;
};

export type LocalProxyConfigValidationErrorCode = "invalid-scheme" | "empty-host" | "invalid-host" | "invalid-port";

export type LocalProxyConfigValidationError = {
  code: LocalProxyConfigValidationErrorCode;
  message: string;
};

export type LocalProxyConfigValidationResult =
  | {
      ok: true;
      config: LocalProxyConfig;
    }
  | {
      ok: false;
      error: LocalProxyConfigValidationError;
    };

export type PacProxyStringResult =
  | {
      ok: true;
      proxyString: string;
      config: LocalProxyConfig;
    }
  | {
      ok: false;
      error: LocalProxyConfigValidationError;
    };

const pacSchemeKeywords: Record<LocalProxyScheme, string> = {
  http: "PROXY",
  https: "HTTPS",
  socks4: "SOCKS",
  socks5: "SOCKS5"
};

function validationError(
  code: LocalProxyConfigValidationErrorCode,
  message: string
): LocalProxyConfigValidationResult {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isSupportedLocalProxyScheme(input: unknown): input is LocalProxyScheme {
  return typeof input === "string" && supportedLocalProxySchemes.includes(input as LocalProxyScheme);
}

function hasUnsafePacHostCharacter(host: string): boolean {
  return /[\s;]|[\u0000-\u001f\u007f]/.test(host);
}

export function validateLocalProxyConfig(input: unknown): LocalProxyConfigValidationResult {
  if (!isRecord(input) || !isSupportedLocalProxyScheme(input.scheme)) {
    return validationError("invalid-scheme", getMessage("validationUnsupportedProxyScheme"));
  }

  if (typeof input.host !== "string") {
    return validationError("empty-host", getMessage("validationProxyHostRequired"));
  }

  const host = input.host.trim();

  if (host.length === 0) {
    return validationError("empty-host", getMessage("validationProxyHostRequired"));
  }

  if (hasUnsafePacHostCharacter(host)) {
    return validationError("invalid-host", getMessage("validationProxyHostInvalid"));
  }

  if (typeof input.port !== "number" || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return validationError("invalid-port", getMessage("validationProxyPortInvalid"));
  }

  return {
    ok: true,
    config: {
      scheme: input.scheme,
      host,
      port: input.port
    }
  };
}

export function buildPacProxyString(input: unknown): PacProxyStringResult {
  const validation = validateLocalProxyConfig(input);

  if (!validation.ok) {
    return validation;
  }

  const { scheme, host, port } = validation.config;

  return {
    ok: true,
    proxyString: `${pacSchemeKeywords[scheme]} ${host}:${port}`,
    config: validation.config
  };
}
