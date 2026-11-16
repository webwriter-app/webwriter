import { ModuleCore } from "./base.js";
import { matchLocale } from "./locale.js";
import { LOCALE_ALIASES, matchLocale as matchLocale2 } from "./locale.js";
const LOCALIZE_REQUEST = "ww-localizerequest";
const shared = /* @__PURE__ */ new WeakMap();
class LocalizeCore extends ModuleCore {
  #options;
  #state;
  /** The locale that was asked for last. It differs from the state while its catalog loads and after a failed load. */
  #wanted;
  #request = 0;
  #loading = Promise.resolve();
  constructor(host, options) {
    super(host);
    this.#options = options;
    this.#wanted = options.sourceLocale;
    this.#state = { locale: options.sourceLocale, templates: void 0 };
  }
  getSnapshot() {
    return this.#state;
  }
  /** The locale the widget shows now. */
  getLocale() {
    return this.#state.locale;
  }
  /**
   * Settles when the catalog that was asked for last is in, or when its load
   * failed. Already settled when nothing is loading. A widget that must not
   * paint in the source language first awaits it before its first render.
   */
  get loaded() {
    return this.#loading;
  }
  /**
   * Asks for the language of a tag. Resolves when the widget shows it, when
   * its load failed (see `localizationerror`), or when another language was
   * asked for meanwhile. Never rejects.
   */
  setLocale(tag) {
    const { sourceLocale, targetLocales, prefer } = this.#options;
    const locale = matchLocale(tag, sourceLocale, targetLocales, prefer);
    const request = ++this.#request;
    this.#wanted = locale;
    this.#loading = locale === this.#state.locale ? Promise.resolve() : this.#load(locale, request);
    return this.#loading;
  }
  onConnect() {
    this.listen(this.host, LOCALIZE_REQUEST, (event) => {
      event.stopPropagation();
      event.detail.provide(this);
    });
    const { cores } = this.#shared;
    cores.add(this);
    this.cleanup(() => cores.delete(this));
    this.listen(window, "online", () => this.#retry());
    this.#retry();
  }
  get #shared() {
    const owner = this.host.constructor;
    return shared.get(owner) ?? shared.set(owner, { catalogs: /* @__PURE__ */ new Map(), cores: /* @__PURE__ */ new Set() }).get(owner);
  }
  async #load(locale, request) {
    let templates;
    try {
      if (locale !== this.#options.sourceLocale) templates = (await this.#catalog(locale)).templates;
    } catch (error) {
      if (request !== this.#request) return;
      const detail = { locale, error };
      this.host.dispatchEvent(new CustomEvent("localizationerror", { detail, bubbles: true, composed: true }));
      return;
    }
    if (request !== this.#request) return;
    this.#state = { locale, templates };
    this.notify();
    if (this.#options.drawer) this.host.dispatchEvent(new Event("optionschange", { bubbles: true, composed: true }));
  }
  /** Asks again for a language whose catalog is still missing. */
  #retry(locale = this.#wanted) {
    if (locale === this.#wanted && locale !== this.#state.locale) void this.setLocale(locale);
  }
  #catalog(locale) {
    const { catalogs, cores } = this.#shared;
    let catalog = catalogs.get(locale);
    if (!catalog) {
      catalog = this.#options.load(locale);
      catalogs.set(locale, catalog);
      catalog.then(
        // Instances whose own load of this language failed take it over now.
        () => cores.forEach((core) => core !== this && core.#retry(locale)),
        // A failed load is tried again next time.
        () => catalogs.delete(locale)
      );
    }
    return catalog;
  }
}
export {
  LOCALE_ALIASES,
  LOCALIZE_REQUEST,
  LocalizeCore,
  matchLocale2 as matchLocale
};
