import {useEffect, useMemo, useSyncExternalStore} from "react"
import {LOCALIZE_REQUEST, LocalizeCore} from "@webwriter/widget/localize"
import {useCore} from "./base.js"
import {useWidget} from "./index.js"

export {LOCALE_ALIASES, matchLocale} from "@webwriter/widget/localize"

/**
 * React binding of Localize. The widget follows the `lang` of the document
 * around it, also when it changes. `loaded` settles when the catalog that was
 * asked for last is in. The first render is in the source language.
 *
 * `msg(id, source, values)` answers from a generated catalog of
 * `@lit/localize` by its explicit id, with `source` as the fallback; a
 * message with placeholders (`str`) takes `values` in call-site order.
 */
export function useLocalize(host, options) {
  const {core, snapshot} = useCore(host, () => new LocalizeCore(host, options), options)
  const {lang} = useWidget(host)
  useEffect(() => {
    void core.setLocale(lang)
  }, [core, lang])
  return useMemo(() => ({
    locale: snapshot.locale,
    loaded: core.loaded,
    setLocale: (tag) => core.setLocale(tag),
    msg: (id, source, values = []) => format(snapshot.templates?.[id], source, values),
  }), [core, snapshot])
}

function format(found, source, values) {
  if(typeof found === "string") return found
  if(found && typeof found === "object" && "strTag" in found) {
    return found.strings.map((text, i) => text + (i < found.values.length ? String(values[found.values[i]] ?? "") : "")).join("")
  }
  return source
}

/**
 * `msg` for the component of a widget that sits inside the shadow tree of
 * another widget and does not bind Localize itself:
 * `const msg = useWidgetMsg(host)`. It answers in the language of the
 * surrounding widget and renders the component again when that language
 * changes. Outside a widget it returns the source text.
 */
export function useWidgetMsg(host) {
  const store = useMemo(() => {
    let core
    const request = () => {
      if(core) return
      host.dispatchEvent(new CustomEvent(LOCALIZE_REQUEST, {detail: {provide: (provided) => (core = provided)}, bubbles: true, composed: true}))
    }
    return {
      subscribe: (listener) => {
        request()
        return core?.subscribe(listener) ?? (() => {})
      },
      snapshot: () => {
        request()
        return core?.getSnapshot().templates
      },
    }
  }, [host])
  const templates = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  return useMemo(() => (id, source, values = []) => format(templates?.[id], source, values), [templates])
}
