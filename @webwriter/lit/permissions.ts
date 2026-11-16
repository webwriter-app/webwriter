import type {ReactiveControllerHost} from "lit"
import {can, isEditing, PermissionsCore, requestPermissions, type PermissionsOptions, type PermissionsSource} from "@webwriter/widget/permissions"
import {CoreController, type BindingOptions, type CoreHost} from "./base.js"

export {can, isEditing, type PermissionsSnapshot, type PermissionsSource} from "@webwriter/widget/permissions"

/**
 * Lit binding of Permissions. Call `can()` and `editing` in `render()`; the
 * host re-renders when the mode or a permission changes. A permission's
 * attribute is taken from the Lit property of the same name.
 *
 * Store it in a private field: `#permissions = new Permissions(this)`. The
 * editor reads a public member named `permissions` as the declaration.
 */
export class Permissions extends CoreController<PermissionsCore> {
  constructor(host: CoreHost, options: BindingOptions<PermissionsOptions> = {}) {
    super(host, root => new PermissionsCore(host, {...options, root}))
  }

  /** True in edit mode, and in read mode when the author granted the permission. */
  can(name: string): boolean {
    return this.core.can(name)
  }

  /** True in edit mode. */
  get editing(): boolean {
    return this.core.editing
  }
}

/** What `widgetPermissions()` returns: the answers of the surrounding widget. */
export type WidgetPermissions = Pick<PermissionsSource, "can" | "editing">

/**
 * Permissions for a component inside a widget's shadow tree, where
 * `isContentEditable` is false: `#permissions = widgetPermissions(this)`.
 * It answers like the Permissions of the surrounding widget and re-renders
 * the component when they change. If the widget has no Permissions, the
 * editor's rule is applied to the widget's declaration and attributes.
 *
 * A component that also marks elements with `data-ww-can` in its own template
 * uses `new Permissions(this)` instead, which follows the widget in the same way.
 */
export function widgetPermissions(host: ReactiveControllerHost & HTMLElement): WidgetPermissions {
  let source: PermissionsSource | undefined
  let unsubscribe: (() => void) | undefined
  host.addController({
    hostConnected() {
      source = requestPermissions(host)
      unsubscribe = source?.subscribe(() => host.requestUpdate())
    },
    hostDisconnected() {
      unsubscribe?.()
      unsubscribe = source = undefined
    },
  })
  return {
    can: name => (source ? source.can(name) : can(host, name)),
    get editing() {
      return source ? source.editing : isEditing(host)
    },
  }
}
