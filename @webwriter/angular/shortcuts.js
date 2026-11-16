import {computed} from "@angular/core"
import {ShortcutsCore} from "@webwriter/widget/shortcuts"
import {injectModule, injectRendered} from "./base.js"

/**
 * Binds Shortcuts. The keys are declared on the host class's `static actions`;
 * the methods they run are the host's: define them with `injectActions()`.
 * A method that returns `false` declines the key: the next action that has it runs, then the page.
 */
export function injectShortcuts(options = {}) {
  const snapshot = injectModule(ShortcutsCore, {rendered: injectRendered(), ...options})
  const {core} = snapshot
  return {
    core,
    snapshot,
    running: computed(() => snapshot().running),
    keysOf: action => core.keysOf(action),
    labelsOf: action => (snapshot(), core.labelsOf(action)),
  }
}
