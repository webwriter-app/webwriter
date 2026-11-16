import {afterNextRender, computed, DestroyRef, ElementRef, inject, Injector, signal} from "@angular/core"
import {LOCALIZE_REQUEST, LocalizeCore} from "@webwriter/widget/localize"
import {injectModule} from "./base.js"
import {injectWidgetHost} from "./index.js"

export {LOCALE_ALIASES, matchLocale} from "@webwriter/widget/localize"

/** The text of a catalog entry: a string, or the `@lit/localize` form of a template, or the fallback. */
function format(entry, fallback, values) {
  if(typeof entry === "string") return entry
  if(entry && typeof entry === "object" && entry.strTag && Array.isArray(entry.strings)) {
    return entry.strings.reduce((text, part, index) => text + part + (index < entry.strings.length - 1 ? values[entry.values?.[index] ?? index] ?? "" : ""), "")
  }
  return fallback
}

/**
 * Binds Localization. The core follows the widget's language: `setLocale()`
 * is called with the runtime's language on connect and whenever it changes.
 *
 * `msg(id, fallback)` looks up a message of the loaded catalog by its id, and
 * gives the fallback (the source text) for the source locale or a missing id.
 * A catalog entry is a string, or the `@lit/localize` form of a template with
 * expressions, whose `values` are then the arguments after the fallback.
 * `msg` re-renders the component when the language changes.
 */
export function injectLocalize(options) {
  const snapshot = injectModule(LocalizeCore, options)
  const {core} = snapshot
  const {widgetRuntime} = injectWidgetHost()
  let lang
  const follow = () => {
    const next = widgetRuntime.getSnapshot().lang
    if(next === lang) return
    lang = next
    void core.setLocale(next)
  }
  follow()
  inject(DestroyRef).onDestroy(widgetRuntime.subscribe(follow))
  return {
    core,
    snapshot,
    locale: computed(() => snapshot().locale),
    setLocale: tag => core.setLocale(tag),
    getLocale: () => core.getLocale(),
    get loaded() {
      return core.loaded
    },
    msg: (id, fallback, ...values) => format(snapshot().templates?.[id], fallback, values),
  }
}

/**
 * `msg` for a child component inside a widget's shadow tree, which does not bind
 * Localization itself: `msg = injectWidgetMsg()`. It answers in the language of the surrounding widget
 * and re-renders the component when that language changes. Outside a widget it returns the fallback.
 */
export function injectWidgetMsg() {
  const element = inject(ElementRef).nativeElement
  const changes = signal(0)
  let core, unsubscribe
  const request = () => {
    if(core) return
    element.dispatchEvent(new CustomEvent(LOCALIZE_REQUEST, {detail: {provide: provided => (core = provided)}, bubbles: true, composed: true}))
    unsubscribe = core?.subscribe(() => changes.update(count => count + 1))
  }
  request()
  // The element may not be in the page yet while the component is made.
  if(!core) afterNextRender(() => { request(); if(core) changes.update(count => count + 1) }, {injector: inject(Injector)})
  inject(DestroyRef).onDestroy(() => {
    unsubscribe?.()
    unsubscribe = core = undefined
  })
  return (id, fallback, ...values) => (changes(), format(core?.getSnapshot().templates?.[id], fallback, values))
}
