import {computed, proxyRefs} from "vue"
import {PrintNoteCore} from "@webwriter/widget/print"
import {useCore} from "./base.js"

export {documentAddress} from "@webwriter/widget/print"

export function usePrintNote({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root}) => new PrintNoteCore(host, {...options, root}), host)
  return proxyRefs({
    core,
    text: computed(() => snapshot.value.text),
    address: computed(() => snapshot.value.address),
  })
}
