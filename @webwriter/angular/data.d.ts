import type {Signal} from "@angular/core"
import type {JsonDataCore, JsonDataOptions, SetDataOptions} from "@webwriter/widget/data"
import type {BindingOptions, ModuleRef} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL, type DataBlockKind, type DataErrorDetail, type SetDataOptions} from "@webwriter/widget/data"

export type JsonDataBinding<T extends object> = {
  readonly core: JsonDataCore<T>
  readonly snapshot: ModuleRef<JsonDataCore<T>>
  /** The current value, a signal. The same object until the value changes. */
  readonly value: Signal<T>
  /** A change made with `set()` is not in the block yet. */
  readonly unsaved: Signal<boolean>
  /** The block holds a snapshot that was ignored. */
  readonly invalid: Signal<boolean>
  /** The current value. Reactive: it reads `value()`. */
  get(): T
  /** Changes some keys. The value changes at once; the block is written later. */
  set(partial: Partial<T>, options?: SetDataOptions): void
  /** Writes a pending change now. */
  flush(): void
}

/** Binds the data-block helper through the host's `widgetRuntime`. */
export function injectJsonData<T extends object>(options: BindingOptions<JsonDataOptions<T>>): JsonDataBinding<T>
