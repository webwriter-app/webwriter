import {computed, proxyRefs} from "vue"
import {HelpCore} from "@webwriter/widget/help"
import {useCore} from "./base.js"

export function useHelp({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root}) => new HelpCore(host, {...options, root}), host)
  return proxyRefs({
    core,
    open: computed(() => snapshot.value.open),
    form: computed(() => snapshot.value.form),
    toggle: force => core.toggle(force),
    close: () => core.close(),
  })
}
