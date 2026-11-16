import {useLayoutEffect, useMemo} from "react"
import {resolveDeclarations} from "@webwriter/widget"
import {SettingsCore} from "@webwriter/widget/settings"
import {useCore, useHostMembers} from "./base.js"

export {formatDuration, parseDuration} from "@webwriter/widget/settings"

/**
 * React binding of Settings. `declarations` default to the class's
 * `static settings`; declare them once, outside the component. Each setting is
 * one attribute of the host: `values` has the current ones (typed by the
 * declarations), `set(name, value)` writes one as one undo step, and a control
 * marked `data-ww-setting="name"` in the JSX is bound by the module. Leave
 * such a control uncontrolled: no `value`, no `checked`.
 *
 * A label, description or placeholder may be a function of the widget, for a
 * text from the widget's own catalog: `label: widget => widget.msg("Speed")`.
 * The editor reads it again when it changes.
 *
 * While the component is mounted the host has the editor's `options` (the
 * class's `static options`, with function texts answered, and one per setting)
 * and a property per setting.
 */
export function useSettings(host, declarations, options) {
  const {core, snapshot} = useCore(
    host,
    (o, rendered) => new SettingsCore(host, {rendered, ...(declarations ? {declarations} : {}), ...o}),
    options,
  )
  useHostMembers(host, {options: () => ({...resolveDeclarations(host, host.constructor.options), ...core.editorOptions()})})
  useLayoutEffect(() => {
    core.defineProperties(host)
    const names = Object.keys(core.declarations)
    return () => {
      for(const name of names) delete host[name]
    }
  }, [host, core])
  return useMemo(() => ({
    values: snapshot.values,
    disabled: snapshot.disabled,
    get: (name) => core.get(name),
    set: (name, value) => core.set(name, value),
    labelOf: (name, choice) => core.labelOf(name, choice),
    disabledOf: (name) => core.disabledOf(name),
  }), [core, snapshot])
}
