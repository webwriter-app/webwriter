import {computed, onScopeDispose, proxyRefs} from "vue"
import {LocalizeCore} from "@webwriter/widget/localize"
import {useCore} from "./base.js"

export {LOCALE_ALIASES, matchLocale} from "@webwriter/widget/localize"

/** The text of a catalog entry: a string, or the strings of a `str` or `html` template with the indices of its values. */
function text(entry, args) {
  if(typeof entry === "string") return entry
  const strings = entry?.strings
  if(!Array.isArray(strings)) return undefined
  const indices = entry.values ?? []
  return strings.reduce((out, string, i) => out + string + (i < indices.length ? String(args[indices[i]] ?? "") : ""), "")
}

export function useLocalize({host, ...options}) {
  const {core, snapshot} = useCore(({host}) => new LocalizeCore(host, options), host)
  // The widget's language is the nearest `lang`; follow it as LitElementWw does.
  const runtime = core.host.widgetRuntime
  if(runtime) {
    let language = runtime.lang
    void core.setLocale(language)
    onScopeDispose(runtime.subscribe(() => {
      if(runtime.lang === language) return
      language = runtime.lang
      void core.setLocale(language)
    }))
  }
  return proxyRefs({
    core,
    locale: computed(() => snapshot.value.locale),
    get loaded() {
      return core.loaded
    },
    setLocale: tag => core.setLocale(tag),
    msg: (source, {id = source, args = []} = {}) => text(snapshot.value.templates?.[id], args) ?? source,
  })
}
