import type {PermissionsOptions, PermissionsSource} from "@webwriter/widget/permissions"
import type {BindingOptions} from "./base.js"

export {can, isEditing, type PermissionsSnapshot, type PermissionsSource} from "@webwriter/widget/permissions"

/**
 * React binding of Permissions. The component renders again when the mode or a
 * permission changes, and `can` is a new function then.
 */
export function usePermissions(host: HTMLElement, options?: BindingOptions<PermissionsOptions>): {
  /** True in edit mode, and in read mode when the author granted the permission. */
  can(name: string): boolean
  /** True in edit mode. */
  readonly editing: boolean
}

/** What `useWidgetPermissions()` returns: the answers of the surrounding widget. */
export type WidgetPermissions = Pick<PermissionsSource, "can" | "editing">

/**
 * Permissions for the component of a widget that sits inside the shadow tree of
 * another widget, where `isContentEditable` is false:
 * `const {can, editing} = useWidgetPermissions(host)`. It answers like the
 * Permissions of the surrounding widget and renders the component again when
 * they change. If the widget has no Permissions, the editor's rule is applied
 * to the widget's declaration and attributes.
 */
export function useWidgetPermissions(host: HTMLElement): WidgetPermissions
