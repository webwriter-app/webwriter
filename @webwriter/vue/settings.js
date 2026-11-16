import {computed, onBeforeUnmount, proxyRefs} from "vue"
import {resolveDeclarations} from "@webwriter/widget"
import {SettingsCore} from "@webwriter/widget/settings"
import {useCore} from "./base.js"

export {formatDuration, parseDuration} from "@webwriter/widget/settings"

export function useSettings({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root, rendered}) => new SettingsCore(host, {rendered, ...options, root}), host)
  const element = core.host
  // One accessor per setting, backed by the attribute, and the options the drawer reads.
  // The class's own options may have texts that are functions; the editor gets their answers.
  core.defineProperties(element)
  const previous = Object.getOwnPropertyDescriptor(element, "options")
  const generated = {get: () => ({...resolveDeclarations(element, element.constructor.options), ...core.editorOptions()}), configurable: true}
  Object.defineProperty(element, "options", generated)
  onBeforeUnmount(() => {
    if(Object.getOwnPropertyDescriptor(element, "options")?.get === generated.get) {
      if(previous) Object.defineProperty(element, "options", previous)
      else delete element.options
    }
  })
  return proxyRefs({
    core,
    values: computed(() => snapshot.value.values),
    disabled: computed(() => snapshot.value.disabled),
    get: name => (void snapshot.value, core.get(name)),
    set: (name, value) => core.set(name, value),
    labelOf: (name, choice) => (void snapshot.value, core.labelOf(name, choice)),
  })
}
