export type RuleMode = "proxy";

export type RuleAction = "proxy" | "direct";

export type RuleSource = "manual" | "diagnostic" | "import";

export const DEFAULT_NEW_RULE_SCOPE = "include-subdomains" as const;

export const DEFAULT_NEW_RULE_INCLUDE_SUBDOMAINS = DEFAULT_NEW_RULE_SCOPE === "include-subdomains";

export type DomainRule = {
  id?: string;
  domain: string;
  includeSubdomains: boolean;
  action: RuleAction;
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
