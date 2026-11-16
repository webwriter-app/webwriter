import { ModuleCore, type CoreOptions } from "./base.js";
import type { WidgetRuntime, WidgetSnapshot } from "./index.js";
/**
 * The part of `WidgetRuntime` the helper works on. `host.widgetRuntime` is
 * passed as it is; another source of the block gives these three members.
 */
export type DataRuntime = Pick<WidgetRuntime, "subscribe" | "setData"> & {
    /** `data` is the text of the block, `dataReady` is false while a managed scope loads, `dataSlot` is the block's `slot`. */
    getSnapshot(): Pick<WidgetSnapshot, "data" | "dataReady"> & Partial<Pick<WidgetSnapshot, "dataSlot">>;
};
/**
 * What a block holds, which decides how the helper creates it:
 * - `"participant"`: the data of a reader or a session. The block gets
 *   `slot="data"`, so the host keeps it per participant (or per group, or for
 *   everyone, with `shared`).
 * - `"document"`: content of the document that every reader sees, saved with
 *   the document.
 *
 * A block that is already there is used as it is; its kind is never changed.
 */
export type DataBlockKind = "participant" | "document";
/** Options of `JsonDataCore`. */
export type JsonDataOptions<T extends object> = CoreOptions & {
    /** Used for keys the block does not have. Never written to the block. */
    defaults: T;
    /** Checks a snapshot from the block, merged over the defaults, before any of it is used. */
    validate?: (value: T) => boolean;
    /** With `debounce` (ms) a burst of `set()` calls becomes one write. */
    save?: {
        debounce?: number;
    };
    /** A snapshot from outside (load, remote change, undo, redo) changed the value. */
    changed?: (value: T) => void;
    /** The kind of block the first write creates. Default: `"participant"`. */
    block?: DataBlockKind;
    /** Default: `host.widgetRuntime`. */
    runtime?: DataRuntime;
    /** How to tell edit mode. Default: `isEditing(host)`. */
    editing?: () => boolean;
};
/** Options of `set()`. */
export type SetDataOptions = {
    /**
     * Write although the block holds a snapshot the helper ignored, replacing
     * it with the last valid value plus the changes. Writes at once.
     */
    force?: boolean;
};
/** The state of `JsonDataCore`. */
export type JsonDataSnapshot<T> = {
    readonly value: T;
    /** A change made with `set()` is not in the block yet. */
    readonly unsaved: boolean;
    /** The block holds a snapshot that was ignored. Writes are held back until a valid one arrives or `set()` is forced. */
    readonly invalid: boolean;
};
/** `detail` of the `ww-dataerror` event. */
export type DataErrorDetail = {
    error: Error;
    text: string | null;
};
/**
 * Whether two JSON values are equal, whatever the order of their keys. A key
 * with the value `undefined` counts as absent, as it is in JSON text. Stops at
 * the first difference and builds nothing.
 */
export declare function sameJson(a: unknown, b: unknown): boolean;
/**
 * Typed access to the widget's JSON data block.
 *
 * - `get()` returns the defaults, overlaid with the last valid snapshot of the
 *   block, overlaid with changes that are not written yet. Keys the widget does
 *   not know are kept and written back. Values are JSON values.
 * - `set(partial)` changes the value at once and writes later: once per task,
 *   or after `save.debounce` ms. Inside an open undo transaction of the host it
 *   writes immediately, so that the write belongs to that undo step. A key set
 *   to `undefined` is removed from the block. Only the keys passed are compared
 *   with the current value, so the cost does not grow with the rest of the value.
 * - Invalid snapshots have one rule. A snapshot that is not a JSON object or
 *   fails `validate` is ignored as a whole and reported with a `ww-dataerror`
 *   event (`detail: {error, text}`). The value stays what it was, or the
 *   defaults if there was none. While the block holds such a snapshot, writes
 *   are held back, so that the widget does not replace data it did not
 *   understand: `set()` still changes the value, and it is written once a valid
 *   snapshot arrives or when `set(partial, {force: true})` replaces the block.
 * - A snapshot that arrives while a change waits to be written (during a
 *   debounce or a pending scope) replaces what the helper knows of the block.
 *   Top-level keys the widget changed since keep the widget's value and are
 *   written when the wait ends; every other key takes the snapshot's value.
 *   The wait is not restarted.
 * - `changed` runs only when a snapshot from outside really changes the value,
 *   so the echo of the helper's own write is not reported.
 * - Without a block the defaults apply and the first write creates one, of the
 *   kind named by `block`. A participant block the helper created is only
 *   settled by the host: the change stays unsaved until the scope is ready and
 *   is written again if the delivered snapshot lacks it.
 */
export declare class JsonDataCore<T extends object> extends ModuleCore<JsonDataSnapshot<T>> {
    #private;
    constructor(host: HTMLElement, options: JsonDataOptions<T>);
    getSnapshot(): JsonDataSnapshot<T>;
    /** The current value. The same object until the value changes. */
    get(): T;
    /** Changes some keys. The value changes at once; the block is written later. */
    set(partial: Partial<T>, options?: SetDataOptions): void;
    /** Write a pending change now. */
    flush(): void;
    protected onConnect(): void;
    /** Also picks up what the runtime did not announce, such as a change of mode through an ancestor. */
    protected onRefresh(): void;
}
/**
 * Size guidance for a file kept in the JSON, in bytes of the file. A data URL
 * is a third larger than the file, the whole block is written again with every
 * save, and with shared data every write goes to every participant. Keep a
 * file below this, and keep larger files outside the block, for example as an
 * attachment of the document that the block refers to by URL.
 */
export declare const DATA_URL_LIMIT: number;
/**
 * A small file as text for the JSON, for example `{image: await toDataURL(file)}`.
 * Warns in development for a file above `DATA_URL_LIMIT`.
 */
export declare function toDataURL(blob: Blob): Promise<string>;
/** The file of a data URL made with `toDataURL()`. Decoded here, so no `fetch()` and no CSP rule is needed. */
export declare function fromDataURL(text: string): Blob;
