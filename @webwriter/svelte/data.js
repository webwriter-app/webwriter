import {JsonDataCore} from "@webwriter/widget/data"
import {bindCore} from "./bind.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL} from "@webwriter/widget/data"

/**
 * The data-block helper for the widget:
 * `const data = jsonDataStore($host(), {defaults: {order: []}})`. `$data.value`
 * is the current value, the same object until it changes, from inside or
 * outside; `$data.unsaved` and `$data.invalid` say whether a change waits to
 * be written or the block holds something the helper ignored. `data.set({order})`
 * changes keys at once and writes the block later (inside an open undo step,
 * at once); `data.get()` and `data.flush()` are those of the core.
 *
 * The block is read and written through the host's `widgetRuntime`: the class
 * needs `withWidgetRuntime(Base)`.
 */
export function jsonDataStore(host, options) {
  if(!host.widgetRuntime) {
    throw new Error(`<${host.localName}>: jsonDataStore() needs the widget runtime. Extend the element with withWidgetRuntime(Base).`)
  }
  return bindCore(host, options, options => new JsonDataCore(host, options), {methods: ["get", "set", "flush"]})
}
