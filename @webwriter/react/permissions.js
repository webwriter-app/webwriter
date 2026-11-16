import {useMemo, useSyncExternalStore} from "react"
import {can, isEditing, PermissionsCore, requestPermissions} from "@webwriter/widget/permissions"
import {useCore} from "./base.js"

export {can, isEditing} from "@webwriter/widget/permissions"

/**
 * React binding of Permissions: `const {can, editing} = usePermissions(host)`.
 * The component renders again when the mode or a permission changes, and `can`
 * is a new function then, so that a memoized child that receives it updates.
 * A permission's attribute is the lowercase name unless the declaration says
 * `attribute`: `static permissions = {allowSort: {attribute: "allow-sort"}}`.
 */
export function usePermissions(host, options) {
  const {core, snapshot} = useCore(host, (o) => new PermissionsCore(host, o), options)
  const can = useMemo(() => (name) => core.can(name), [core, snapshot])
  return {can, editing: core.editing}
}

/**
 * Permissions for the component of a widget that sits inside the shadow tree of
 * another widget, where `isContentEditable` is false:
 * `const {can, editing} = useWidgetPermissions(host)`. It answers like the
 * Permissions of the surrounding widget and renders the component again when
 * they change. If the widget has no Permissions, the editor's rule is applied
 * to the widget's declaration and attributes.
 */
export function useWidgetPermissions(host) {
  const store = useMemo(() => {
    let version = 0
    return {
      subscribe: (listener) => requestPermissions(host)?.subscribe(() => {
        version++
        listener()
      }) ?? (() => {}),
      snapshot: () => version,
    }
  }, [host])
  const version = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  return useMemo(() => ({
    can: (name) => {
      const source = requestPermissions(host)
      return source ? source.can(name) : can(host, name)
    },
    get editing() {
      const source = requestPermissions(host)
      return source ? source.editing : isEditing(host)
    },
  }), [host, version])
}
