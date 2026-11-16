import {useCallback} from "react"
import {HelpCore} from "@webwriter/widget/help"
import {useCore} from "./base.js"

/**
 * React binding of Help. Write `data-ww-help="text"` on the controls and
 * `data-ww-help-toggle=""` on the button. The overlay is built by the module
 * from the rendered template after every commit.
 */
export function useHelp(host, options) {
  const {core, snapshot} = useCore(host, (o) => new HelpCore(host, o), options)
  const toggle = useCallback((force) => core.toggle(force), [core])
  const close = useCallback(() => core.close(), [core])
  return {open: snapshot.open, form: snapshot.form, toggle, close}
}
