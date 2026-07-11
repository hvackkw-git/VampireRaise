import en from "./en.js";
import ko from "./ko.js";

const STORAGE_KEY = "vampire_shrimp_frenzy_locale";
const DICTS = { en, ko };

let locale = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "ko" || saved === "en" ? saved : "en";
  } catch {
    return "en";
  }
})();

export function getLocale() {
  return locale;
}

export function setLocale(next) {
  locale = next === "ko" ? "ko" : "en";
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* storage is optional */ }
  globalThis.window?.dispatchEvent?.(new CustomEvent("localechange", { detail: { locale } }));
}

export function t(key, vars = {}) {
  const read = (dict) => key.split(".").reduce((value, part) => value?.[part], dict);
  let value = read(DICTS[locale]) ?? read(en) ?? key;
  if (typeof value === "string") {
    value = value.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
  }
  return value;
}

export function applyDocumentTranslations(root = document) {
  root.documentElement?.setAttribute("lang", locale);
  root.querySelectorAll?.("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll?.("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll?.("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
  root.querySelectorAll?.("[data-i18n-content]").forEach((el) => {
    el.setAttribute("content", t(el.dataset.i18nContent));
  });
}

export function blockName(type) {
  const translated = t(`blocks.${type}`);
  if (translated !== `blocks.${type}`) return translated;
  return String(type).replace(/_block$/, "").replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
