import {tick} from "svelte"
import {resolveDeclarations} from "@webwriter/widget"
import {SettingsCore} from "@webwriter/widget/settings"
import {rootOf} from "./base.js"
import {bindCore} from "./bind.js"

export {normalizeSetting, parseSetting, serializeSetting, settingAttribute, settingDefault} from "@webwriter/widget/settings"

/**
 * Settings for a Svelte widget, added to the class in `customElement.extend`:
 *
 *     extend: Base => withSettings(withWidgetRuntime(Base), {
 *       population: {type: Number, default: 200, min: 10, max: 2000},
 *     })
 *
 * Each declared setting is one attribute of the host and one property of the
 * same name, read from and written to the attribute (a write is one undo
 * step), and an entry of the editor's `options`: the instance's `options` are
 * the class's `static options` and the generated ones. Do not declare the
 * settings as Svelte props. A component reads them with `settingsStore()`.
 *
 * A label, description or placeholder, of a setting or of one of its choices,
 * may be a function of the widget, for a text from the widget's own catalog.
 * The editor reads it again when it changes:
 *
 *     speed: {type: Number, label: widget => widget.msg("Speed")}
 *
 * The same holds for the texts of the class's `static options`, which the
 * instance's `options` answer.
 */
export function withSettings(Base, declarations = {}, options = {}) {
  class WithSettings extends Base {
    static settings = declarations

    settingsCore = new SettingsCore(this, {...options, declarations, root: () => rootOf(this), rendered: () => tick()})

    get options() {
      // The class's own options may have texts that are functions; the editor gets their answers.
      return {...resolveDeclarations(this, this.constructor.options), ...this.settingsCore.editorOptions()}
    }
  }
  for(const name of Object.keys(declarations)) {
    Object.defineProperty(WithSettings.prototype, name, {
      get() {
        return this.settingsCore.get(name)
      },
      set(value) {
        this.settingsCore.set(name, value)
      },
      configurable: true,
      enumerable: true,
    })
  }
  return WithSettings
}

/**
 * Binds the settings of the host to the component:
 * `const settings = settingsStore($host())`. `$settings.values` holds every
 * setting and `$settings.disabled` those that are turned off. A form control
 * marked `data-ww-setting="name"` is bound by the core: do not give it a
 * `value` or `checked` of your own. The store also has `set(name, value)`,
 * one undo step that stays open until the component has rendered, and
 * `labelOf(name, choice?)`.
 */
export function settingsStore(host) {
  const core = host.settingsCore
  if(!(core instanceof SettingsCore)) {
    throw new Error(`<${host.localName}>: settingsStore() needs the element class to be extended with withSettings(Base, declarations).`)
  }
  return bindCore(host, {}, () => core, {methods: ["set", "labelOf"]})
}
