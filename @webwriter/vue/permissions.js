import {computed, proxyRefs} from "vue"
import {PermissionsCore} from "@webwriter/widget/permissions"
import {useCore} from "./base.js"

export {can, isEditing} from "@webwriter/widget/permissions"

export function usePermissions({host, ...options} = {}) {
  const {core, snapshot} = useCore(({host, root}) => new PermissionsCore(host, {...options, root}), host)
  return proxyRefs({
    core,
    editing: computed(() => snapshot.value.editing),
    can: name => (void snapshot.value, core.can(name)),
  })
}
