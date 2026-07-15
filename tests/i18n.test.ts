import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import englishMessages from "../_locales/en/messages.json";
import russianMessages from "../_locales/ru/messages.json";
import {
  getMessage,
  selectPluralForm,
  setI18nAdapterForTests,
  type I18nAdapter
} from "../src/i18n/i18n";
import {
  relatedDomainAddActionLabel,
  relatedDomainBatchAddActionLabel
} from "../src/popup/popup";

type LocaleMessage = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
};

type LocaleCatalog = Record<string, LocaleMessage>;

function catalogAdapter(catalog: LocaleCatalog, language: string): I18nAdapter {
  return {
    getUILanguage: () => language,
    getMessage(key, substitutions) {
      const entry = catalog[key];

      if (!entry) {
        return "";
      }

      const values = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
      const escapedDollar = "\u0000i18n-dollar\u0000";
      let message = entry.message.replaceAll("$$", escapedDollar);

      for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
        const index = Number(placeholder.content.slice(1)) - 1;
        message = message.replaceAll(`$${name.toUpperCase()}$`, () => values[index] ?? "");
      }

      return message.replaceAll(escapedDollar, "$");
    }
  };
}

afterEach(() => {
  setI18nAdapterForTests(null);
  vi.restoreAllMocks();
});

describe("Chrome i18n infrastructure", () => {
  it("keeps valid English and Russian catalogs with synchronized key sets", async () => {
    const englishRaw = await readFile(resolve(__dirname, "../_locales/en/messages.json"), "utf8");
    const russianRaw = await readFile(resolve(__dirname, "../_locales/ru/messages.json"), "utf8");
    const english = JSON.parse(englishRaw) as LocaleCatalog;
    const russian = JSON.parse(russianRaw) as LocaleCatalog;

    expect(Object.keys(english).sort()).toEqual(Object.keys(russian).sort());
    expect(english).toHaveProperty("extensionName");
    expect(english).toHaveProperty("popupRelatedAddExact");
    expect(english).toHaveProperty("popupRelatedBatchAddFew");
    expect(english).toHaveProperty("optionsProxyHostLabel");
    expect(english).toHaveProperty("validationInvalidHostname");
  });

  it("uses valid named placeholders with examples in both catalogs", () => {
    for (const catalog of [englishMessages, russianMessages] as LocaleCatalog[]) {
      for (const [messageKey, entry] of Object.entries(catalog)) {
        const declaredTokens = new Set(
          Object.keys(entry.placeholders ?? {}).map((name) => `$${name.toUpperCase()}$`)
        );
        const usedTokens = new Set(entry.message.match(/\$[A-Z][A-Z0-9_]*\$/g) ?? []);

        expect(declaredTokens, messageKey).toEqual(usedTokens);

        if (declaredTokens.size > 0) {
          expect(entry.description, messageKey).toBeTruthy();
        }

        for (const placeholder of Object.values(entry.placeholders ?? {})) {
          expect(placeholder.content, messageKey).toMatch(/^\$[1-9]$/);
          expect(placeholder.example, messageKey).toBeTruthy();
        }
      }
    }
  });

  it("falls back to English without chrome.i18n and exposes missing keys during development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getMessage("popupRelatedAddExact", ["status.openai.com"])).toBe("Add status.openai.com");
    expect(getMessage("popupRelatedAddExact", ["literal-$&-$$-value.example"])).toBe(
      "Add literal-$&-$$-value.example"
    );
    expect(getMessage("notARealMessageKey")).toBe("[missing:notARealMessageKey]");
    expect(warn).toHaveBeenCalledWith("[i18n] Unknown message key: notARealMessageKey");
  });

  it("uses English fallback when an injected locale is missing one key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setI18nAdapterForTests({ getMessage: () => "", getUILanguage: () => "zz" });

    expect(getMessage("commonAdded")).toBe("Added");
    expect(warn).toHaveBeenCalledWith("[i18n] Missing locale message: commonAdded");
  });
});

describe("localized related-domain UI strings", () => {
  it("formats English exact, parent, batch, navigation, state, and aria strings", () => {
    expect(relatedDomainAddActionLabel({ domain: "status.openai.com", includeSubdomains: false })).toBe(
      "Add status.openai.com"
    );
    expect(relatedDomainAddActionLabel({ domain: "wikipedia.org", includeSubdomains: true })).toBe(
      "Add wikipedia.org and subdomains"
    );
    expect(relatedDomainBatchAddActionLabel(1)).toBe("Add 1 selected domain");
    expect(relatedDomainBatchAddActionLabel(2)).toBe("Add 2 selected domains");
    expect(getMessage("popupRelatedMoreActions")).toBe("More actions");
    expect(getMessage("popupRelatedBack")).toBe("Back to site status");
    expect(getMessage("commonAdded")).toBe("Added");
    expect(getMessage("popupRelatedAddedAria", ["status.openai.com"])).toBe(
      "status.openai.com was added as a proxy route"
    );
  });

  it("formats Russian exact, parent, navigation, state, aria, and all required count forms", () => {
    setI18nAdapterForTests(catalogAdapter(russianMessages as LocaleCatalog, "ru"));

    expect(relatedDomainAddActionLabel({ domain: "status.openai.com", includeSubdomains: false })).toBe(
      "Добавить status.openai.com"
    );
    expect(relatedDomainAddActionLabel({ domain: "wikipedia.org", includeSubdomains: true })).toBe(
      "Добавить wikipedia.org и поддомены"
    );
    expect(getMessage("popupRelatedMoreActions")).toBe("Другие действия");
    expect(getMessage("popupRelatedBack")).toBe("Вернуться к статусу сайта");
    expect(getMessage("commonAdded")).toBe("Добавлено");
    expect(getMessage("popupRelatedAddedAria", ["status.openai.com"])).toContain("status.openai.com");

    expect(
      [1, 2, 5, 11, 21, 22, 25, 111, 112].map((count) => relatedDomainBatchAddActionLabel(count))
    ).toEqual([
      "Добавить 1 выбранный домен",
      "Добавить 2 выбранных домена",
      "Добавить 5 выбранных доменов",
      "Добавить 11 выбранных доменов",
      "Добавить 21 выбранный домен",
      "Добавить 22 выбранных домена",
      "Добавить 25 выбранных доменов",
      "Добавить 111 выбранных доменов",
      "Добавить 112 выбранных доменов"
    ]);
  });

  it("selects predictable English and Russian plural forms", () => {
    expect([1, 2].map((count) => selectPluralForm(count, "en-US"))).toEqual(["one", "other"]);
    expect([1, 2, 5, 11, 21, 22, 25, 111, 112].map((count) => selectPluralForm(count, "ru-RU"))).toEqual([
      "one",
      "few",
      "many",
      "many",
      "one",
      "few",
      "many",
      "many",
      "many"
    ]);
  });

  it("localizes validation, conflict, and backup messages with intact hostnames", () => {
    setI18nAdapterForTests(catalogAdapter(russianMessages as LocaleCatalog, "ru"));

    expect(getMessage("validationProtocolCannotRoute", ["chrome://"])).toContain("chrome://");
    expect(getMessage("ruleActionExistsForDomainScope", ["Прокси", "status.openai.com"])).toContain(
      "status.openai.com"
    );
    expect(getMessage("backupRuleConflictExisting", ["Прокси", "Напрямую", "wikipedia.org", ""])).toContain(
      "wikipedia.org"
    );
  });
});
