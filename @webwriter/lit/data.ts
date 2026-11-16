import type {WidgetHost} from "@webwriter/widget"
import {JsonDataCore, type JsonDataOptions, type SetDataOptions} from "@webwriter/widget/data"
import {CoreController, type BindingOptions, type CoreHost} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL, type DataBlockKind, type DataErrorDetail, type SetDataOptions} from "@webwriter/widget/data"

/** A Lit widget with the widget runtime, which `LitElementWw` has as `widgetRuntime`. */
type DataHost = CoreHost & WidgetHost

/**
 * Lit binding of the data-block helper: `#data = jsonData(this, {defaults})`,
 * then `this.#data.get()` in `render()` and `this.#data.set({…})` in handlers.
 * The host re-renders when the value changes, from inside or outside. The
 * block is read and written through the host's `widgetRuntime`.
 */
export class JsonData<T extends object> extends CoreController<JsonDataCore<T>> {
  constructor(host: DataHost, options: BindingOptions<JsonDataOptions<T>>) {
    super(host, root => new JsonDataCore<T>(host, {...options, root}))
  }

  /** The current value. The same object until the value changes. */
  get(): T {
    return this.core.get()
  }

  /** Changes some keys. The value changes at once; the block is written later. */
  set(partial: Partial<T>, options?: SetDataOptions): void {
    this.core.set(partial, options)
  }

  /** Write a pending change now. */
  flush(): void {
    this.core.flush()
  }

  /** A change made with `set()` is not in the block yet. */
  get unsaved(): boolean {
    return this.snapshot.unsaved
  }

  /** The block holds a snapshot that was ignored. Writes are held back until `set()` is forced or a valid one arrives. */
  get invalid(): boolean {
    return this.snapshot.invalid
  }
}

/** `new JsonData(host, options)`, for a class field: `#data = jsonData(this, {defaults})`. */
export function jsonData<T extends object>(host: DataHost, options: BindingOptions<JsonDataOptions<T>>): JsonData<T> {
  return new JsonData(host, options)
}
