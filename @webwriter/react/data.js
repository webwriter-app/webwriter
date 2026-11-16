import {useMemo} from "react"
import {JsonDataCore} from "@webwriter/widget/data"
import {requireRuntime, useCore} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL} from "@webwriter/widget/data"

/**
 * React binding of the data-block helper:
 * `const data = useJsonData(host, {defaults})`, then `data.value` while
 * rendering and `data.set({...})` in handlers. The component renders when the
 * value changes, from inside or outside. The block is read and written
 * through the host's `widgetRuntime`, which `createReactWidget()` gives it.
 */
export function useJsonData(host, options) {
  requireRuntime(host, "useJsonData()")
  const {core, snapshot} = useCore(host, (o) => new JsonDataCore(host, o), options)
  const methods = useMemo(() => ({
    set: (partial, setOptions) => core.set(partial, setOptions),
    flush: () => core.flush(),
  }), [core])
  return {value: snapshot.value, unsaved: snapshot.unsaved, invalid: snapshot.invalid, ...methods}
}
