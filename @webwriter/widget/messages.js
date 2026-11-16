import { widgetLanguage } from "./index.js";
import { matchLocale } from "./locale.js";
const SOURCE_LOCALE = "en";
function defineMessages(defaults, catalogs = {}) {
  const arrived = {};
  const loaders = /* @__PURE__ */ new Map();
  const loading = /* @__PURE__ */ new Map();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (typeof catalog === "function") loaders.set(locale, catalog);
    else arrived[locale] = catalog;
  }
  return {
    defaults,
    locales: Object.keys(catalogs),
    catalogs: arrived,
    load(locale) {
      if (Object.hasOwn(arrived, locale)) return Promise.resolve(arrived[locale]);
      const loader = loaders.get(locale);
      if (!loader) return Promise.resolve(void 0);
      let pending = loading.get(locale);
      if (!pending) {
        const imported = new Promise((resolve) => resolve(loader()));
        pending = imported.then((module) => arrived[locale] = module.default).finally(() => loading.delete(locale));
        loading.set(locale, pending);
      }
      return pending;
    }
  };
}
function languageOf(element) {
  for (let node = element; node; ) {
    const runtime = node.widgetRuntime;
    const language = runtime ? runtime.lang : widgetLanguage(node);
    if (language || node.closest("[lang]")) return language;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return "";
}
function messageLocale(source, language) {
  return matchLocale(language, SOURCE_LOCALE, source.locales);
}
function tableOf(source, locale, override) {
  return { ...source.defaults, ...source.catalogs[locale], ...typeof override === "function" ? override() : override };
}
function resolveMessages(source, language, override) {
  return tableOf(source, messageLocale(source, language), override);
}
async function loadMessages(source, language, override) {
  const locale = messageLocale(source, language);
  await source.load(locale);
  return tableOf(source, locale, override);
}
const observed = /* @__PURE__ */ new WeakMap();
function observeLanguage(root, listener) {
  let entry = observed.get(root);
  if (!entry) {
    const listeners2 = /* @__PURE__ */ new Set();
    const observer2 = new MutationObserver(() => {
      for (const each of [...listeners2]) each();
    });
    observer2.observe(root, { attributes: true, attributeFilter: ["lang"], subtree: true });
    observed.set(root, entry = { observer: observer2, listeners: listeners2 });
  }
  const { observer, listeners } = entry;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || observed.get(root) !== entry) return;
    observer.disconnect();
    observed.delete(root);
  };
}
function followLanguage(element, changed) {
  const stops = [];
  for (let node = element; node; ) {
    const runtime = node.widgetRuntime;
    const root = node.getRootNode();
    if (runtime) stops.push(runtime.subscribe(changed));
    if (!runtime || root instanceof ShadowRoot) stops.push(observeLanguage(root, changed));
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return () => stops.forEach((stop) => stop());
}
class Messages {
  #host;
  #source;
  #override;
  #matched = null;
  #cache = null;
  #followers = /* @__PURE__ */ new Set();
  /** The locale whose catalog was asked for last. A failed load is asked for again only when something changes. */
  #asked;
  constructor(host, source, override) {
    this.#host = host;
    this.#source = source;
    this.#override = override;
  }
  /** The widget's effective language tag (`languageOf`). Empty if none is set. */
  get language() {
    return languageOf(this.#host);
  }
  /** The locale that answers: one of the table's catalogs, or `en` for the defaults. */
  get locale() {
    const language = this.language;
    if (this.#matched?.language !== language) this.#matched = { language, locale: messageLocale(this.#source, language) };
    return this.#matched.locale;
  }
  /** False while the catalog of `locale` is still on its way, or could not be loaded: the texts are English then. */
  get loaded() {
    const locale = this.locale;
    return locale === SOURCE_LOCALE || Object.hasOwn(this.#source.catalogs, locale);
  }
  /**
   * The table to read texts from. The same object until the language changes
   * or its catalog arrives, unless the override is a function.
   */
  get current() {
    const locale = this.locale;
    const catalog = this.#source.catalogs[locale];
    if (!catalog) this.#ask(locale);
    if (this.#cache?.locale === locale && this.#cache.catalog === catalog) return this.#cache.table;
    const table = tableOf(this.#source, locale, this.#override);
    if (typeof this.#override !== "function") this.#cache = { locale, catalog, table };
    return table;
  }
  /**
   * Calls `changed` when another catalog answers for the widget's language,
   * and when the catalog of its language arrives. A core passes
   * `() => this.refresh()`, so that names and descriptions it wrote are
   * written again. Starts loading the catalog of the current language, and
   * tries a failed load again when the browser is back online. Returns the
   * function that stops following.
   */
  follow(changed) {
    const state = () => `${this.locale} ${this.loaded}`;
    let seen = state();
    const check = () => {
      this.#ask(this.locale);
      const now = state();
      if (now === seen) return;
      seen = now;
      changed();
    };
    const unfollow = followLanguage(this.#host, check);
    const online = () => {
      this.#asked = void 0;
      check();
    };
    const view = this.#host.ownerDocument.defaultView;
    view?.addEventListener("online", online);
    this.#followers.add(check);
    this.#asked = void 0;
    this.#ask(this.locale);
    return () => {
      this.#followers.delete(check);
      view?.removeEventListener("online", online);
      unfollow();
    };
  }
  /** Loads the catalog of a locale unless it is there, on its way, or failed and nothing changed since. */
  #ask(locale) {
    if (locale === this.#asked || locale === SOURCE_LOCALE || Object.hasOwn(this.#source.catalogs, locale)) return;
    this.#asked = locale;
    this.#source.load(locale).then(
      // Each follower compares with the language the widget has now, so a late catalog changes nothing.
      () => [...this.#followers].forEach((check) => check()),
      (error) => {
        const detail = { locale, error };
        this.#host.dispatchEvent(new CustomEvent("localizationerror", { detail, bubbles: true, composed: true }));
      }
    );
  }
}
export {
  Messages,
  SOURCE_LOCALE,
  defineMessages,
  followLanguage,
  languageOf,
  loadMessages,
  messageLocale,
  resolveMessages
};
