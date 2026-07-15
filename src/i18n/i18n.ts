import englishMessages from "../../_locales/en/messages.json";

type LocaleMessageEntry = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
};

export type MessageKey = keyof typeof englishMessages;
export type MessageSubstitution = string | number;

export type I18nAdapter = {
  getMessage(key: string, substitutions?: string | string[]): string;
  getUILanguage?(): string;
};

let testAdapter: I18nAdapter | null = null;

function chromeI18nAdapter(): I18nAdapter | null {
  const i18n = globalThis.chrome?.i18n;

  if (!i18n?.getMessage) {
    return null;
  }

  return {
    getMessage: (key, substitutions) => i18n.getMessage(key, substitutions),
    getUILanguage: () => i18n.getUILanguage()
  };
}

function adapter(): I18nAdapter | null {
  return testAdapter ?? chromeI18nAdapter();
}

function normalizedSubstitutions(
  substitutions: readonly MessageSubstitution[]
): string | string[] | undefined {
  const values = substitutions.map(String);

  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 ? values[0] : values;
}

function formatFallback(entry: LocaleMessageEntry, substitutions: readonly MessageSubstitution[]): string {
  const escapedDollar = "\u0000i18n-dollar\u0000";
  let result = entry.message.replaceAll("$$", escapedDollar);

  for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
    const match = /^\$(\d+)$/.exec(placeholder.content);
    const replacement = match ? String(substitutions[Number(match[1]) - 1] ?? "") : placeholder.content;
    result = result.replaceAll(`$${name.toUpperCase()}$`, () => replacement);
  }

  return result.replaceAll(escapedDollar, "$");
}

export function getMessage(key: MessageKey | string, substitutions: readonly MessageSubstitution[] = []): string {
  const currentAdapter = adapter();
  const translated = currentAdapter?.getMessage(key, normalizedSubstitutions(substitutions));

  if (translated) {
    return translated;
  }

  const fallback = (englishMessages as Record<string, LocaleMessageEntry>)[key];

  if (currentAdapter) {
    console.warn(`[i18n] Missing locale message: ${key}`);
  }

  if (fallback) {
    return formatFallback(fallback, substitutions);
  }

  console.warn(`[i18n] Unknown message key: ${key}`);
  return `[missing:${key}]`;
}

export function getUiLocale(): string {
  return adapter()?.getUILanguage?.() || "en";
}

export type PluralForm = "one" | "few" | "many" | "other";

export function selectPluralForm(count: number, locale: string = getUiLocale()): PluralForm {
  if (!locale.toLowerCase().startsWith("ru")) {
    return count === 1 ? "one" : "other";
  }

  const absoluteCount = Math.abs(Math.trunc(count));
  const modulo10 = absoluteCount % 10;
  const modulo100 = absoluteCount % 100;

  if (modulo10 === 1 && modulo100 !== 11) {
    return "one";
  }

  if (modulo10 >= 2 && modulo10 <= 4 && (modulo100 < 12 || modulo100 > 14)) {
    return "few";
  }

  return "many";
}

function localizeElement(element: HTMLElement): void {
  const textKey = element.dataset.i18n;
  const placeholderKey = element.dataset.i18nPlaceholder;
  const titleKey = element.dataset.i18nTitle;
  const ariaLabelKey = element.dataset.i18nAriaLabel;
  const ariaDescriptionKey = element.dataset.i18nAriaDescription;

  if (textKey) {
    element.textContent = getMessage(textKey);
  }

  if (placeholderKey && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    element.placeholder = getMessage(placeholderKey);
  }

  if (titleKey) {
    element.title = getMessage(titleKey);
  }

  if (ariaLabelKey) {
    element.setAttribute("aria-label", getMessage(ariaLabelKey));
  }

  if (ariaDescriptionKey) {
    element.setAttribute("aria-description", getMessage(ariaDescriptionKey));
  }
}

export function localizeDocument(root: ParentNode = document): void {
  const selector = [
    "[data-i18n]",
    "[data-i18n-placeholder]",
    "[data-i18n-title]",
    "[data-i18n-aria-label]",
    "[data-i18n-aria-description]"
  ].join(",");

  if (root instanceof HTMLElement && root.matches(selector)) {
    localizeElement(root);
  }

  root.querySelectorAll<HTMLElement>(selector).forEach(localizeElement);

  if (root instanceof Document) {
    root.documentElement.lang = getUiLocale();
  }
}

export function setI18nAdapterForTests(nextAdapter: I18nAdapter | null): void {
  testAdapter = nextAdapter;
}
