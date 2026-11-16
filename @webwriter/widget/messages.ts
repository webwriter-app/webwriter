// Module text: typed tables with English defaults in the code, one catalog
// per language that is loaded when a widget has that language, the widget's
// effective language, and a per-instance override.
import {widgetLanguage, type WidgetHost} from "./index.js"
import {matchLocale} from "./locale.js"

/** One message: a fixed text, or a function of its parameters that returns the text. */
export type Message = string | ((...parameters: never[]) => string)

/** A module's messages: one entry per text. The defaults are English. */
export type MessageTable<T> = {readonly [K in keyof T]: Message}

/** Translations of a table. An entry that is missing falls back to the English default. */
export type Catalog<T> = {readonly [K in keyof T]?: T[K]}

/** Catalogs of a table by locale: `{de, "pt-BR": …}`. */
export type Catalogs<T> = {readonly [locale: string]: Catalog<T>}

/** Imports one catalog file: `() => import("./messages/drag/de.js")`. The file default-exports the catalog. */
export type CatalogLoader<T> = () => Promise<{readonly default: Catalog<T>}>

/** The generated table of a module's catalog files: one loader per locale. */
export type CatalogLoaders<T> = {readonly [locale: string]: CatalogLoader<T>}

/** What `defineMessages()` takes per locale: a loader, or a catalog that is there at once. */
export type CatalogSources<T> = {readonly [locale: string]: Catalog<T> | CatalogLoader<T>}

/** A table with its catalogs, made by `defineMessages()`. */
export type MessageSource<T> = {
  readonly defaults: T
  /** The locales that have a catalog, loaded or not. */
  readonly locales: readonly string[]
  /** The catalogs that have arrived, by locale. */
  readonly catalogs: Catalogs<T>
  /**
   * Loads the catalog of one of `locales`, once for everything that uses the
   * table. Resolves to undefined for another locale. A failed load rejects
   * and is tried again by the next call.
   */
  load(locale: string): Promise<Catalog<T> | undefined>
}

/**
 * The `messages` option of a module: entries that replace the module's own in
 * every language. A function is asked on every read, so that a widget can
 * answer with its own translated strings.
 */
export type MessagesOption<T> = Catalog<T> | (() => Catalog<T>)

/** `detail` of the `localizationerror` event: the locale whose catalog could not be loaded. */
export type MessagesErrorDetail = {locale: string; error: unknown}

/** The locale of the defaults. */
export const SOURCE_LOCALE = "en"

/**
 * Declares a module's messages: the English defaults and its catalogs. A
 * module passes the generated loaders of its catalog files, so that a catalog
 * is only loaded for a widget in that language:
 *
 *     import catalogs from "./messages/drag/catalogs.js"
 *     export const dragMessages = defineMessages<DragMessages>({…}, catalogs)
 *
 * A widget that declares a table of its own can also pass catalogs directly:
 * `defineMessages({…}, {de: {…}})`.
 */
export function defineMessages<T extends MessageTable<T>>(defaults: T, catalogs: CatalogSources<T> = {}): MessageSource<T> {
  const arrived: Record<string, Catalog<T>> = {}
  const loaders = new Map<string, CatalogLoader<T>>()
  const loading = new Map<string, Promise<Catalog<T>>>()
  for(const [locale, catalog] of Object.entries(catalogs)) {
    if(typeof catalog === "function") loaders.set(locale, catalog)
    else arrived[locale] = catalog
  }
  return {
    defaults,
    locales: Object.keys(catalogs),
    catalogs: arrived,
    load(locale) {
      if(Object.hasOwn(arrived, locale)) return Promise.resolve(arrived[locale])
      const loader = loaders.get(locale)
      if(!loader) return Promise.resolve(undefined)
      let pending = loading.get(locale)
      if(!pending) {
        // A loader that throws rejects like one whose import fails.
        const imported = new Promise<Awaited<ReturnType<CatalogLoader<T>>>>(resolve => resolve(loader()))
        pending = imported.then(module => (arrived[locale] = module.default)).finally(() => loading.delete(locale))
        loading.set(locale, pending)
      }
      return pending
    },
  }
}

/**
 * The effective language of an element: that of its widget runtime, or the
 * `lang` of its nearest ancestor. Where that lookup ends at a shadow root
 * without an answer, it goes on from the root's host, so that a component
 * inside a widget and a widget inside a component have the language of what
 * is around them. An explicit `lang=""` ends the search. Empty if no language is set.
 */
export function languageOf(element: Element): string {
  for(let node: Element | null = element; node; ) {
    const runtime = (node as Partial<WidgetHost>).widgetRuntime
    const language = runtime ? runtime.lang : widgetLanguage(node as HTMLElement)
    if(language || node.closest("[lang]")) return language
    const root = node.getRootNode()
    node = root instanceof ShadowRoot ? root.host : null
  }
  return ""
}

/** The locale of a table that answers for a language tag (`matchLocale`), or `en` for the defaults. */
export function messageLocale<T>(source: MessageSource<T>, language: string): string {
  return matchLocale(language, SOURCE_LOCALE, source.locales)
}

function tableOf<T>(source: MessageSource<T>, locale: string, override?: MessagesOption<T>): T {
  return {...source.defaults, ...source.catalogs[locale], ...(typeof override === "function" ? override() : override)}
}

/**
 * The table for a language tag as it is now: the override, then the best
 * catalog if it has arrived, then the defaults. `loadMessages()` waits for the catalog.
 */
export function resolveMessages<T>(source: MessageSource<T>, language: string, override?: MessagesOption<T>): T {
  return tableOf(source, messageLocale(source, language), override)
}

/** Loads the catalog that answers for a language tag, then resolves to the table as `resolveMessages()` gives it. */
export async function loadMessages<T>(source: MessageSource<T>, language: string, override?: MessagesOption<T>): Promise<T> {
  const locale = messageLocale(source, language)
  await source.load(locale)
  return tableOf(source, locale, override)
}

// One observer per document or shadow root, shared by everything that follows a language in it.
const observed = new WeakMap<Node, {observer: MutationObserver; listeners: Set<() => void>}>()

/** Calls `listener` when a `lang` attribute changes in a tree. Returns the function that stops it. */
function observeLanguage(root: Node, listener: () => void): () => void {
  let entry = observed.get(root)
  if(!entry) {
    const listeners = new Set<() => void>()
    const observer = new MutationObserver(() => {
      for(const each of [...listeners]) each()
    })
    observer.observe(root, {attributes: true, attributeFilter: ["lang"], subtree: true})
    observed.set(root, (entry = {observer, listeners}))
  }
  const {observer, listeners} = entry
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if(listeners.size > 0 || observed.get(root) !== entry) return
    observer.disconnect()
    observed.delete(root)
  }
}

/**
 * Calls `changed` when the effective language of an element (`languageOf`) may
 * have changed. Returns the function that stops it. A widget runtime reports
 * the language of its widget. A `lang` it does not look at can sit in any
 * shadow tree between the element and the document, and in the document if no
 * runtime watches it.
 */
export function followLanguage(element: Element, changed: () => void): () => void {
  const stops: (() => void)[] = []
  for(let node: Element | null = element; node; ) {
    const runtime = (node as Partial<WidgetHost>).widgetRuntime
    const root = node.getRootNode()
    if(runtime) stops.push(runtime.subscribe(changed))
    if(!runtime || root instanceof ShadowRoot) stops.push(observeLanguage(root, changed))
    node = root instanceof ShadowRoot ? root.host : null
  }
  return () => stops.forEach(stop => stop())
}

/**
 * The messages of one module instance, in the language of its widget:
 *
 *     #messages = new Messages(host, dragMessages, options.messages)
 *     onConnect() { this.cleanup(this.#messages.follow(() => this.refresh())) }
 *     … this.#messages.current.dropped(item, target)
 *
 * `current` always answers for the language the widget has at that moment.
 * The catalog of that language is loaded when it is first needed. Until it
 * has arrived the texts are the English defaults; a catalog that arrives
 * after the language changed again is not shown.
 */
export class Messages<T> {
  #host: Element
  #source: MessageSource<T>
  #override: MessagesOption<T> | undefined
  #matched: {language: string; locale: string} | null = null
  #cache: {locale: string; catalog: Catalog<T> | undefined; table: T} | null = null
  #followers = new Set<() => void>()
  /** The locale whose catalog was asked for last. A failed load is asked for again only when something changes. */
  #asked: string | undefined

  constructor(host: Element, source: MessageSource<T>, override?: MessagesOption<T>) {
    this.#host = host
    this.#source = source
    this.#override = override
  }

  /** The widget's effective language tag (`languageOf`). Empty if none is set. */
  get language(): string {
    return languageOf(this.#host)
  }

  /** The locale that answers: one of the table's catalogs, or `en` for the defaults. */
  get locale(): string {
    const language = this.language
    if(this.#matched?.language !== language) this.#matched = {language, locale: messageLocale(this.#source, language)}
    return this.#matched.locale
  }

  /** False while the catalog of `locale` is still on its way, or could not be loaded: the texts are English then. */
  get loaded(): boolean {
    const locale = this.locale
    return locale === SOURCE_LOCALE || Object.hasOwn(this.#source.catalogs, locale)
  }

  /**
   * The table to read texts from. The same object until the language changes
   * or its catalog arrives, unless the override is a function.
   */
  get current(): T {
    const locale = this.locale
    const catalog = this.#source.catalogs[locale]
    if(!catalog) this.#ask(locale)
    if(this.#cache?.locale === locale && this.#cache.catalog === catalog) return this.#cache.table
    const table = tableOf(this.#source, locale, this.#override)
    if(typeof this.#override !== "function") this.#cache = {locale, catalog, table}
    return table
  }

  /**
   * Calls `changed` when another catalog answers for the widget's language,
   * and when the catalog of its language arrives. A core passes
   * `() => this.refresh()`, so that names and descriptions it wrote are
   * written again. Starts loading the catalog of the current language, and
   * tries a failed load again when the browser is back online. Returns the
   * function that stops following.
   */
  follow(changed: () => void): () => void {
    const state = () => `${this.locale} ${this.loaded}`
    let seen = state()
    const check = () => {
      this.#ask(this.locale)
      const now = state()
      if(now === seen) return
      seen = now
      changed()
    }
    const unfollow = followLanguage(this.#host, check)
    const online = () => {
      this.#asked = undefined
      check()
    }
    const view = this.#host.ownerDocument.defaultView
    view?.addEventListener("online", online)
    this.#followers.add(check)
    this.#asked = undefined
    this.#ask(this.locale)
    return () => {
      this.#followers.delete(check)
      view?.removeEventListener("online", online)
      unfollow()
    }
  }

  /** Loads the catalog of a locale unless it is there, on its way, or failed and nothing changed since. */
  #ask(locale: string) {
    if(locale === this.#asked || locale === SOURCE_LOCALE || Object.hasOwn(this.#source.catalogs, locale)) return
    this.#asked = locale
    this.#source.load(locale).then(
      // Each follower compares with the language the widget has now, so a late catalog changes nothing.
      () => [...this.#followers].forEach(check => check()),
      error => {
        const detail: MessagesErrorDetail = {locale, error}
        this.#host.dispatchEvent(new CustomEvent("localizationerror", {detail, bubbles: true, composed: true}))
      },
    )
  }
}
