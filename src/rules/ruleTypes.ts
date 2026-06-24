export type RuleMode = "proxy";

export type RuleSource = "manual" | "diagnostic" | "import";

export type DomainRule = {
  domain: string;
  includeSubdomains: boolean;
  mode: RuleMode;
  source: RuleSource;
  createdAt: string;
};

export type DomainValidationErrorCode = "empty" | "unsupported-scheme" | "invalid-host";

export type DomainValidationError = {
  code: DomainValidationErrorCode;
  message: string;
};

export type NormalizeDomainResult =
  | {
      ok: true;
      domain: string;
    }
  | {
      ok: false;
      error: DomainValidationError;
    };
