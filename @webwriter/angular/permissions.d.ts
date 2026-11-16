import type {Signal} from "@angular/core"
import type {PermissionsCore, PermissionsOptions, PermissionsSnapshot, PermissionsSource} from "@webwriter/widget/permissions"
import type {BindingOptions, ModuleRef} from "./base.js"

export {can, isEditing, type PermissionsSnapshot, type PermissionsSource} from "@webwriter/widget/permissions"

export type PermissionsBinding = {
  readonly core: PermissionsCore
  readonly snapshot: ModuleRef<PermissionsCore>
  /** True in edit mode, and in read mode when the author granted the permission. Reactive: read it in the template. */
  can(name: string): boolean
  /** True in edit mode. */
  readonly editing: Signal<boolean>
}

/** Binds Permissions to the widget of the component. The declaration is the host class's `static permissions`. */
export function injectPermissions(options?: BindingOptions<PermissionsOptions>): PermissionsBinding

/** The answers of the surrounding widget, for a child component. */
export function injectWidgetPermissions(): Pick<PermissionsBinding, "can" | "editing">
