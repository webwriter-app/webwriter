import {onDestroy} from "svelte"
import {widgetLanguage} from "@webwriter/widget"
import {LocalizeCore} from "@webwriter/widget/localize"
import {bindCore} from "./bind.js"

export {LOCALE_ALIASES, matchLocale} from "@webwriter/widget/localize"
export {widgetLanguage} from "@webwriter/widget"

/**
 * Localization for the widget:
 * `const l10n = localizeStore($host(), {sourceLocale, targetLocales, load: locale => import(`./generated/${locale}.js`)})`.
 * `$l10n.locale` is the language the widget shows and `$l10n.templates` the
 * catalog of it, undefined for the source language. The core is told the
 * language of the widget (`host.widgetRuntime.lang`) now and whenever it
 * changes, and loads the catalog; the first render is in the source language.
 * The store also has `getLocale`, `setLocale` and `loaded`.
 */
export function localizeStore(host, options) {
  const store = bindCore(host, options, () => new LocalizeCore(host, options), {})
  const {core} = store
  const runtime = host.widgetRuntime
  const language = () => (runtime ? runtime.lang : widgetLanguage(host))
  let current
  const follow = () => {
    const lang = language()
    if(lang === current) return
    current = lang
    void core.setLocale(lang)
  }
  follow()
  const stop = runtime?.subscribe(follow)
  onDestroy(() => stop?.())
  store.getLocale = () => core.getLocale()
  store.setLocale = tag => core.setLocale(tag)
  Object.defineProperty(store, "loaded", {get: () => core.loaded})
  return store
}
