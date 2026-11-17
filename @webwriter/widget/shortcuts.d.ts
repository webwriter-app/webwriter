import { ModuleCore, type CoreOptions } from "./base.js";
import { type MessagesOption } from "./messages.js";
import { type ShortcutsMessages } from "./messages/shortcuts/index.js";
import type { ActionDeclaration } from "./options.js";
export { shortcutsMessages, type ShortcutsMessages } from "./messages/shortcuts/index.js";
/**
 * The fields of an entry in `static actions` that this module reads:
 * `shortcut` and `can`, which it adds to the editor's action declaration, and
 * the fields of that declaration that decide whether a key may run the action.
 */
export type ShortcutAction = Readonly<Pick<ActionDeclaration, "disabled" | "hidden" | "confirm" | "input">> & {
    /**
     * A key such as `"Delete"`, `"Space"` or `"Mod+D"`, or a list. `Mod` is ⌘ on Apple devices and Ctrl elsewhere.
     * A key that also works while the reader types in a text field is written `{key: "Mod+Enter", inText: true}`.
     */
    readonly shortcut?: ShortcutKey | readonly ShortcutKey[];
    /** The permission that allows the key for a reader. `"edit"` keeps it to authors. */
    readonly can?: string;
};
/**
 * One key of an action: the key, or an object that opts the key in to run from text entry.
 * Without `inText` a key typed in a field, a text role or an editable region is the field's.
 */
export type ShortcutKey = string | {
    readonly key: string;
    readonly inText?: boolean;
};
/** Options of `ShortcutsCore`. */
export type ShortcutsOptions = CoreOptions & {
    /** Resolves when the widget has rendered a change. Lit: `() => host.updateComplete`. Keeps the undo step open until then. */
    rendered?: () => Promise<unknown>;
    /** Whether `Mod` means ⌘ and keys are shown with Apple's symbols. Default: detected from the platform. */
    apple?: boolean;
    /** Other names for the keys that `labelsOf()` shows. */
    messages?: MessagesOption<ShortcutsMessages>;
};
/** The state of `ShortcutsCore`. */
export type ShortcutsSnapshot = {
    /** Actions started by a key whose promise has not settled yet. */
    readonly running: readonly string[];
};
/** True on macOS, iOS and iPadOS, where `Mod` is ⌘. */
export declare function isApple(): boolean;
/**
 * Whether a keydown is the declared combination. Modifiers must match exactly,
 * and letters ignore case. The character of the key decides
 * (`KeyboardEvent.key`). A shortcut on a letter or a digit also matches the
 * key at its position on a Latin keyboard (`KeyboardEvent.code`) in two
 * cases: the key produces a letter of another script, or the combination has
 * Alt and the key produces no Latin letter or digit, as on a Mac.
 */
export declare function matchesShortcut(shortcut: string, event: KeyboardEvent, apple?: boolean): boolean;
/** Whether a shortcut is one the editor keeps: undo, redo or save, under Ctrl and under ⌘. */
export declare function isReservedShortcut(shortcut: string): boolean;
/** How `formatShortcut()` shows a shortcut. */
export type ShortcutFormat = {
    /** Apple's symbols (`⇧⌘D`) instead of names joined with a plus (`Ctrl+Shift+D`). Default: detected from the platform. */
    apple?: boolean;
    /** The names of the keys. Default: English. */
    names?: ShortcutsMessages;
};
/**
 * A shortcut as a person reads it on this platform: `"Mod+Shift+D"` is `⇧⌘D`
 * on Apple devices and `Ctrl+Shift+D` elsewhere. Arrows are shown as arrows.
 */
export declare function formatShortcut(shortcut: string, format?: ShortcutFormat): string;
/** A shortcut in the form of `aria-keyshortcuts`: `"Mod+D"` is `Meta+D` on Apple devices and `Control+D` elsewhere. */
export declare function ariaShortcut(shortcut: string, apple?: boolean): string;
/**
 * Keys for the entries of `static actions` that have a `shortcut`. A key runs
 * the method of the same name on the host, as the editor's drawer does, as one
 * undo step. It is handled only when the keydown comes from inside the widget,
 * or from anywhere while the widget is fullscreen.
 *
 * A method that returns `false` declines the key: it had nothing to do, such
 * as Escape with nothing to cancel. The key then goes to the next action that
 * declares it, and to the page if none takes it. Any other result, also a
 * promise, takes the key.
 *
 * In the shadow template, `data-ww-shortcut="action"` on a button gives it the
 * `aria-keyshortcuts` of that action. `data-ww-shortcuts="off"` on an element
 * leaves every key inside it alone, for an editor with its own keymap, and
 * `data-ww-shortcuts="on"` on a component with a closed shadow root says that
 * it holds no text entry, so that the keys work while the focus is in it.
 *
 * In development the module warns once if keys are declared and nothing in
 * the widget can take the focus. It looks after the first render that has
 * put something other than styles into the shadow root, never before: a
 * widget that renders its focusable stage later is not reported until it has
 * rendered once. A widget that never calls `refresh()` is checked a frame
 * after it connected.
 */
export declare class ShortcutsCore extends ModuleCore<ShortcutsSnapshot> {
    #private;
    constructor(host: HTMLElement, options?: ShortcutsOptions);
    /** The declared actions. An instance declaration replaces the static one, as in the editor. */
    get actions(): Record<string, ShortcutAction>;
    /**
     * The keys that run an action, as declared. Empty for an action that
     * cannot run from a key: one that is disabled, asks for confirmation or
     * takes a file. Keys the editor reserves are left out.
     */
    keysOf(action: string): string[];
    /** The keys of an action as a person reads them on this platform and in the widget's language, for a tooltip or a menu. */
    labelsOf(action: string): string[];
    /** The keys of an action as the value of `aria-keyshortcuts`. Empty if it has none. */
    ariaKeysOf(action: string): string;
    getSnapshot(): ShortcutsSnapshot;
    protected onConnect(): void;
    protected onRefresh(): void;
}
