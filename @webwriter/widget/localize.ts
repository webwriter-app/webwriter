import {ModuleCore} from "./base.js"
import {matchLocale, type LocalePreferences} from "./locale.js"

export {LOCALE_ALIASES, matchLocale, type LocalePreferences} from "./locale.js"

/** A generated catalog module of `@lit/localize`: message id → translated template. */
export type Catalog = {templates: Record<string, unknown>}

/** Options of `LocalizeCore`. */
export type LocalizeOptions = {
  sourceLocale: string
  targetLocales: readonly string[]
  /** Imports the catalog of a target locale, for example `(locale) => import(`./generated/${locale}.js`)`. */
  load: (locale: string) => Promise<Catalog>
  /** The widget's own choices among its locales, tried before the likely script and region: `{pt: "pt-PT"}`. */
  prefer?: LocalePreferences
  /**
   * Send `optionschange` after a language change, so that the editor reads the
   * widget's declarations again. Needed only when drawer labels are computed
   * with `msg`. Labels written as localized text maps are resolved by the editor.
   */
  drawer?: boolean
}

/** The state of `LocalizeCore`. */
export type LocalizeSnapshot = {
  /** One of the configured locales. */
  readonly locale: string
  /** The catalog of `locale`. Undefined for the source locale. */
  readonly templates: Catalog["templates"] | undefined
}

/** `detail` of the `localizationerror` event: the locale whose catalog could not be loaded. */
export type LocalizeErrorDetail = {locale: string; error: unknown}

/** Dispatched by a component inside a widget to get the widget's localizer. `detail.provide(core)` answers. */
export const LOCALIZE_REQUEST = "ww-localizerequest"
/** The event of `LOCALIZE_REQUEST`. */
export type LocalizeRequest = CustomEvent<{provide(core: LocalizeCore): void}>

// Catalogs are shared by the instances of a widget class, so a language is loaded once.
type Shared = {catalogs: Map<string, Promise<Catalog>>; cores: Set<LocalizeCore>}
const shared = new WeakMap<object, Shared>()

/**
 * The language of one widget instance: the matched locale and its catalog.
 *
 * - `setLocale(tag)` accepts any language tag. Until the catalog is in, the
 *   widget keeps the language it had; the first paint is in the source language.
 * - A catalog is loaded once per widget class. One that arrives after another
 *   language was asked for is dropped.
 * - A failed load is reported with a `localizationerror` event on the host
 *   (`detail: {locale, error}`) and is not cached. It is tried again with the
 *   next `setLocale()`, when the browser comes back online, and the widget
 *   takes the catalog over as soon as another instance of its class loaded it.
 * - With `drawer`, a change is followed by an `optionschange` event.
 */
export class LocalizeCore extends ModuleCore<LocalizeSnapshot> {
  #options: LocalizeOptions
  #state: LocalizeSnapshot
  /** The locale that was asked for last. It differs from the state while its catalog loads and after a failed load. */
  #wanted: string
  #request = 0
  #loading: Promise<void> = Promise.resolve()

  constructor(host: HTMLElement, options: LocalizeOptions) {
    super(host)
    this.#options = options
    this.#wanted = options.sourceLocale
    this.#state = {locale: options.sourceLocale, templates: undefined}
  }

  getSnapshot(): LocalizeSnapshot {
    return this.#state
  }

  /** The locale the widget shows now. */
  getLocale(): string {
    return this.#state.locale
  }

  /**
   * Settles when the catalog that was asked for last is in, or when its load
   * failed. Already settled when nothing is loading. A widget that must not
   * paint in the source language first awaits it before its first render.
   */
  get loaded(): Promise<void> {
    return this.#loading
  }

  /**
   * Asks for the language of a tag. Resolves when the widget shows it, when
   * its load failed (see `localizationerror`), or when another language was
   * asked for meanwhile. Never rejects.
   */
  setLocale(tag: string): Promise<void> {
    const {sourceLocale, targetLocales, prefer} = this.#options
    const locale = matchLocale(tag, sourceLocale, targetLocales, prefer)
    const request = ++this.#request
    this.#wanted = locale
    // Asking for the language that is shown also drops a slower load that is still on its way.
    this.#loading = locale === this.#state.locale ? Promise.resolve() : this.#load(locale, request)
    return this.#loading
  }

  protected onConnect() {
    // Components in the widget's shadow tree ask for the widget's language with this event.
    this.listen<LocalizeRequest>(this.host, LOCALIZE_REQUEST, event => {
      event.stopPropagation()
      event.detail.provide(this)
    })
    const {cores} = this.#shared
    cores.add(this)
    this.cleanup(() => cores.delete(this))
    this.listen(window, "online", () => this.#retry())
    this.#retry()
  }

  get #shared(): Shared {
    const owner = this.host.constructor
    return shared.get(owner) ?? shared.set(owner, {catalogs: new Map(), cores: new Set()}).get(owner)!
  }

  async #load(locale: string, request: number): Promise<void> {
    let templates: Catalog["templates"] | undefined
    try {
      if(locale !== this.#options.sourceLocale) templates = (await this.#catalog(locale)).templates
    } catch(error) {
      if(request !== this.#request) return
      const detail: LocalizeErrorDetail = {locale, error}
      this.host.dispatchEvent(new CustomEvent("localizationerror", {detail, bubbles: true, composed: true}))
      return
    }
    if(request !== this.#request) return
    this.#state = {locale, templates}
    this.notify()
    if(this.#options.drawer) this.host.dispatchEvent(new Event("optionschange", {bubbles: true, composed: true}))
  }

  /** Asks again for a language whose catalog is still missing. */
  #retry(locale = this.#wanted) {
    if(locale === this.#wanted && locale !== this.#state.locale) void this.setLocale(locale)
  }

  #catalog(locale: string): Promise<Catalog> {
    const {catalogs, cores} = this.#shared
    let catalog = catalogs.get(locale)
    if(!catalog) {
      catalog = this.#options.load(locale)
      catalogs.set(locale, catalog)
      catalog.then(
        // Instances whose own load of this language failed take it over now.
        () => cores.forEach(core => core !== this && core.#retry(locale)),
        // A failed load is tried again next time.
        () => catalogs.delete(locale),
      )
    }
    return catalog
  }
}
