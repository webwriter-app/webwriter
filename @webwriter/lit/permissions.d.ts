import type { ReactiveControllerHost } from "lit";
import { PermissionsCore, type PermissionsOptions, type PermissionsSource } from "@webwriter/widget/permissions";
import { CoreController, type BindingOptions, type CoreHost } from "./base.js";
export { can, isEditing, type PermissionsSnapshot, type PermissionsSource } from "@webwriter/widget/permissions";
/**
 * Lit binding of Permissions. Call `can()` and `editing` in `render()`; the
 * host re-renders when the mode or a permission changes. A permission's
 * attribute is taken from the Lit property of the same name.
 *
 * Store it in a private field: `#permissions = new Permissions(this)`. The
 * editor reads a public member named `permissions` as the declaration.
 */
export declare class Permissions extends CoreController<PermissionsCore> {
    constructor(host: CoreHost, options?: BindingOptions<PermissionsOptions>);
    /** True in edit mode, and in read mode when the author granted the permission. */
    can(name: string): boolean;
    /** True in edit mode. */
    get editing(): boolean;
}
/** What `widgetPermissions()` returns: the answers of the surrounding widget. */
export type WidgetPermissions = Pick<PermissionsSource, "can" | "editing">;
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
export declare function widgetPermissions(host: ReactiveControllerHost & HTMLElement): WidgetPermissions;
