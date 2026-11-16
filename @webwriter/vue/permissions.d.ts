import type {PermissionsCore, PermissionsOptions} from "@webwriter/widget/permissions"
import type {BindingOptions} from "./base.js"

export {can, isEditing, type PermissionsSnapshot, type PermissionsSource} from "@webwriter/widget/permissions"

export type UsePermissions = {
  readonly core: PermissionsCore
  /** True in edit mode. */
  readonly editing: boolean
  /** True in edit mode, and in read mode when the author granted the permission. Call it in the render function. */
  can(name: string): boolean
}

/** Permissions: `can()` and `editing` in the render function; the component renders again when they change. */
export function usePermissions(options?: BindingOptions<PermissionsOptions>): UsePermissions
