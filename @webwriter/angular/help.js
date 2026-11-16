import {computed} from "@angular/core"
import {HelpCore} from "@webwriter/widget/help"
import {injectModule} from "./base.js"

/** Binds Help. Write `data-ww-help="text"` on the controls and `data-ww-help-toggle` on the button. */
export function injectHelp(options = {}) {
  const snapshot = injectModule(HelpCore, options)
  const {core} = snapshot
  return {
    core,
    snapshot,
    open: computed(() => snapshot().open),
    form: computed(() => snapshot().form),
    toggle: force => core.toggle(force),
    close: () => core.close(),
  }
}
