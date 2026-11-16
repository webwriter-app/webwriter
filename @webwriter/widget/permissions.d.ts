import { ModuleCore, type CoreOptions } from "./base.js";
/** Options of `PermissionsCore`. */
export type PermissionsOptions = CoreOptions & {
    /**
     * How to tell edit mode. Default: the answer of the widget around the host,
     * for a host inside a widget's shadow tree; otherwise `editable` of the
     * host's widget runtime, or its `isContentEditable`. With this option the
     * host answers alone and does not ask a widget around it.
     */
    editing?: () => boolean;
    /** The attribute of a permission, where it differs from the editor's rule (see `attributeOf()`). */
    attribute?: (name: string) => string | undefined;
};
/** The state of `PermissionsCore`. A new object whenever an answer may have changed. */
export type PermissionsSnapshot = {
    readonly editing: boolean;
    /** Names of the declared permissions the author granted. */
    readonly granted: readonly string[];
};
/** The answers of a widget's Permissions: what a `ww-permissionsrequest` provides. `PermissionsCore` is one. */
export type PermissionsSource = {
    /** True in edit mode, and in read mode when the author granted the permission. */
    can(name: string): boolean;
    /** True in edit mode. */
    readonly editing: boolean;
    /** Calls `listener` when an answer may have changed. Returns the function that unsubscribes. */
    subscribe(listener: () => void): () => void;
};
/**
 * Dispatched on an element to get the Permissions that answer for it:
 * `detail.provide(source)` is called by the element's own Permissions, or by
 * those of the widget whose shadow tree the element is in.
 */
export declare const PERMISSIONS_REQUEST = "ww-permissionsrequest";
/** The event of `PERMISSIONS_REQUEST`. */
export type PermissionsRequest = CustomEvent<{
    provide(source: PermissionsSource): void;
}>;
/**
 * The connected Permissions that answer for an element: its own, or those of
 * the widget whose shadow tree it is in. Undefined if there are none. Use
 * `subscribe()` on the result to follow changes.
 */
export declare function requestPermissions(element: Element): PermissionsSource | undefined;
/**
 * `can(name)` for a widget or for any element in its shadow tree, without
 * holding its Permissions: the answer of the widget's Permissions if it has
 * them, otherwise the same rule applied to the widget's declaration and
 * attributes. Modules use it for permissions that are named in a declaration.
 */
export declare function can(host: Element, name: string): boolean;
/** Edit mode for a widget or for any element in its shadow tree, where `isContentEditable` is false. */
export declare function isEditing(host: Element): boolean;
/**
 * The widget side of the editor's `static permissions`. `can(name)` is true in
 * edit mode, and in read mode while the permission's attribute is on the host.
 * `can("edit")` is true in edit mode only.
 *
 * Shadow elements marked `data-ww-can="name"` are hidden while the answer is
 * no; with `data-ww-can-mode="disable"` they are made inert instead.
 *
 * On a component inside a widget's shadow tree, the mode and every permission
 * the component does not declare itself are those of the widget.
 */
export declare class PermissionsCore extends ModuleCore<PermissionsSnapshot> implements PermissionsSource {
    #private;
    constructor(host: HTMLElement, options?: PermissionsOptions);
    /**
     * Declared permission names. An instance declaration replaces the static
     * one, as in the editor. `edit` is reserved and never a permission.
     */
    get names(): string[];
    /**
     * The attribute that grants a permission, by the editor's rule: `attribute`
     * of its declaration, then the attribute of the Lit property of the same
     * name, then the lowercase name. The `attribute` option comes first.
     */
    attributeOf(name: string): string;
    /** True in edit mode. */
    get editing(): boolean;
    /**
     * True in edit mode, and in read mode when the author granted the
     * permission. A name that is not declared is refused in read mode, even if
     * an attribute of that name is present.
     */
    can(name: string): boolean;
    getSnapshot(): PermissionsSnapshot;
    protected onConnect(): void;
    /** Also picks up what no attribute of the host shows, such as an editable ancestor or a new instance declaration. */
    protected onRefresh(): void;
}
