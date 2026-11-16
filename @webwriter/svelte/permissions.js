import {onDestroy, onMount} from "svelte"
import {can, isEditing, PermissionsCore, requestPermissions} from "@webwriter/widget/permissions"
import {bindCore} from "./bind.js"

export {can, isEditing} from "@webwriter/widget/permissions"

/**
 * Permissions for the widget: `const permissions = permissionsStore($host())`.
 * Read `$permissions.can(name)` and `$permissions.editing` in the template;
 * they are answered again when the mode or a permission changes. A
 * permission's attribute is the lower-case name unless the declaration says
 * `attribute`. Declare the permissions in `static permissions` of the class.
 */
export function permissionsStore(host, options = {}) {
  return bindCore(host, options, options => new PermissionsCore(host, options), {
    view: (snapshot, core) => ({...snapshot, can: name => core.can(name)}),
    methods: ["can"],
  })
}

/**
 * Permissions for a component inside a widget's shadow tree, where
 * `isContentEditable` is false: `const permissions = widgetPermissions($host())`.
 * It answers like the Permissions of the surrounding widget and follows its
 * changes. If the widget has none, the editor's rule applies to the widget's
 * declaration and attributes.
 */
export function widgetPermissions(host) {
  const listeners = new Set()
  let source, stop
  const look = () => ({editing: source ? source.editing : isEditing(host), can: name => (source ? source.can(name) : can(host, name))})
  let value = look()
  const update = () => {
    value = look()
    for(const listener of [...listeners]) listener(value)
  }
  onMount(() => {
    source = requestPermissions(host)
    stop = source?.subscribe(update)
    update()
  })
  onDestroy(() => {
    stop?.()
    stop = source = undefined
  })
  return {
    subscribe(run) {
      run(value)
      listeners.add(run)
      return () => listeners.delete(run)
    },
  }
}
