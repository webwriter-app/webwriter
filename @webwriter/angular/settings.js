import {computed} from "@angular/core"
import {resolveDeclarations} from "@webwriter/widget"
import {SettingsCore} from "@webwriter/widget/settings"
import {declareOnHost, injectModule, injectRendered} from "./base.js"

export {parseSetting, serializeSetting, settingAttribute, settingDefault} from "@webwriter/widget/settings"

/**
 * Binds Settings. The declarations are the host class's `static settings`, or
 * the `declarations` option. Each setting is one attribute of the host; the
 * binding also gives the host one property per setting and the editor's
 * `options`: the class's `static options` and one entry per setting.
 *
 * A label, description or placeholder may be a function of the widget, for a
 * text from the widget's own catalog; the editor reads it again when it changes.
 *
 * `value(name)` reads a setting in the template and re-renders the component
 * when it changes. Controls marked `data-ww-setting="name"` are bound by the core.
 */
export function injectSettings(options = {}) {
  const snapshot = injectModule(SettingsCore, {rendered: injectRendered(), ...options}, (core, host) => {
    const names = Object.keys(core.declarations).filter(name => !(name in host))
    core.defineProperties(host)
    const options = declareOnHost(host, "options", () => ({...resolveDeclarations(host, host.constructor.options), ...core.editorOptions()}))
    return () => {
      options()
      for(const name of names) delete host[name]
    }
  })
  const {core} = snapshot
  return {
    core,
    snapshot,
    values: computed(() => snapshot().values),
    disabled: computed(() => snapshot().disabled),
    value: name => snapshot().values[name],
    set: (name, value) => core.set(name, value),
    disabledOf: name => (snapshot(), core.disabledOf(name)),
    labelOf: (name, choice) => (snapshot(), core.labelOf(name, choice)),
  }
}
