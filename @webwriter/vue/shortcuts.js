import {computed, nextTick, onMounted, proxyRefs} from "vue"
import {warnOnce} from "@webwriter/widget/base"
import {ShortcutsCore} from "@webwriter/widget/shortcuts"
import {useCore} from "./base.js"

export function useShortcuts({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root, rendered}) => new ShortcutsCore(host, {rendered, ...options, root}), host)
  // A component's methods reach the host through defineExpose(), which Vue applies after the first mount.
  onMounted(() => nextTick(() => {
    const element = core.host
    for(const name of Object.keys(core.actions)) {
      if(core.keysOf(name).length && typeof element[name] !== "function") {
        warnOnce(element.constructor, `shortcut-method:${name}`, `<${element.localName}>: the action "${name}" has a shortcut, but the host has no method of that name. Add it to defineExpose({${name}}).`)
      }
    }
  }))
  return proxyRefs({
    core,
    running: computed(() => snapshot.value.running),
    keysOf: action => core.keysOf(action),
    // Reads the snapshot: the key names change with the widget's language.
    labelsOf: action => (void snapshot.value, core.labelsOf(action)),
  })
}
