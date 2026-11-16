import {computed, DestroyRef, inject, signal} from "@angular/core"
import {can, isEditing, PermissionsCore, requestPermissions} from "@webwriter/widget/permissions"
import {injectWidgetHost} from "./index.js"
import {injectModule} from "./base.js"

export {can, isEditing} from "@webwriter/widget/permissions"

/**
 * Binds Permissions to the widget. Call `can(name)` and read `editing()` in
 * the template: they re-render the component when the mode or a permission
 * changes. The declaration is the host class's `static permissions`.
 */
export function injectPermissions(options = {}) {
  const snapshot = injectModule(PermissionsCore, options)
  const {core} = snapshot
  return {
    core,
    snapshot,
    can: name => (snapshot(), core.can(name)),
    editing: computed(() => snapshot().editing),
  }
}

/**
 * The answers of the surrounding widget, for a child component that does not
 * bind Permissions itself. If the widget has none, the editor's rule is
 * applied to the widget's declaration and attributes.
 */
export function injectWidgetPermissions() {
  const host = injectWidgetHost()
  const changes = signal(0)
  const source = requestPermissions(host)
  if(source) inject(DestroyRef).onDestroy(source.subscribe(() => changes.update(count => count + 1)))
  return {
    can: name => (changes(), source ? source.can(name) : can(host, name)),
    editing: computed(() => (changes(), source ? source.editing : isEditing(host))),
  }
}
