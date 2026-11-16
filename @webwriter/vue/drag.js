import {computed, proxyRefs} from "vue"
import {DragCore} from "@webwriter/widget/drag"
import {useCore} from "./base.js"

export function useDrag({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root, rendered}) => new DragCore(host, {rendered, ...options, root}), host)
  return proxyRefs({
    core,
    item: computed(() => snapshot.value.item),
    via: computed(() => snapshot.value.via),
  })
}
