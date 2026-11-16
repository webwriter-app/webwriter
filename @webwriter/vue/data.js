import {computed, proxyRefs} from "vue"
import {JsonDataCore} from "@webwriter/widget/data"
import {useCore} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL} from "@webwriter/widget/data"

export function useJsonData({host, ...options}) {
  const {core, snapshot} = useCore(({host, root}) => {
    if(!host.widgetRuntime) throw new TypeError("useJsonData needs a widget host with widgetRuntime: use createVueWidget()")
    return new JsonDataCore(host, {...options, root})
  }, host)
  return proxyRefs({
    core,
    value: computed(() => snapshot.value.value),
    unsaved: computed(() => snapshot.value.unsaved),
    invalid: computed(() => snapshot.value.invalid),
    get: () => snapshot.value.value,
    set: (partial, setOptions) => core.set(partial, setOptions),
    flush: () => core.flush(),
  })
}
