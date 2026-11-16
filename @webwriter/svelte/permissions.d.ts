import type {Readable} from "svelte/store"
import type {PermissionsCore, PermissionsOptions, PermissionsSnapshot} from "@webwriter/widget/permissions"
import type {CoreStore} from "./base.js"

export {can, isEditing, type PermissionsOptions, type PermissionsSnapshot, type PermissionsSource} from "@webwriter/widget/permissions"

/** The value of the store: the snapshot and the answer for a name. A new object whenever an answer may have changed. */
export type PermissionsView = PermissionsSnapshot & {
  /** True in edit mode, and in read mode when the author granted the permission. */
  can(name: string): boolean
}

export type PermissionsStore = CoreStore<PermissionsCore, PermissionsView> & Pick<PermissionsCore, "can">

/** Permissions of a widget. Call it in the component's script with `$host()`. */
export function permissionsStore(host: HTMLElement, options?: PermissionsOptions): PermissionsStore

/** What `widgetPermissions()` gives: the answers of the surrounding widget. */
export type WidgetPermissions = {readonly editing: boolean; can(name: string): boolean}

/** Permissions for a component inside a widget's shadow tree. */
export function widgetPermissions(host: HTMLElement): Readable<WidgetPermissions>
