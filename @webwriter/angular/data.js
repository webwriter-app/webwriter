import {computed} from "@angular/core"
import {JsonDataCore} from "@webwriter/widget/data"
import {injectModule} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL} from "@webwriter/widget/data"

/**
 * Binds the data-block helper. `value()` is the current value, a signal that
 * changes when the value does, from inside or outside. The block is read and
 * written through the host's `widgetRuntime`.
 */
export function injectJsonData(options) {
  const snapshot = injectModule(JsonDataCore, options)
  const {core} = snapshot
  return {
    core,
    snapshot,
    value: computed(() => snapshot().value),
    unsaved: computed(() => snapshot().unsaved),
    invalid: computed(() => snapshot().invalid),
    get: () => snapshot().value,
    set: (partial, setOptions) => core.set(partial, setOptions),
    flush: () => core.flush(),
  }
}
