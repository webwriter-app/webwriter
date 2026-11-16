import type {JsonDataCore, JsonDataOptions, SetDataOptions} from "@webwriter/widget/data"
import type {BindingOptions} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL, type DataBlockKind, type DataErrorDetail, type SetDataOptions} from "@webwriter/widget/data"

export type UseJsonData<T extends object> = {
  readonly core: JsonDataCore<T>
  /** The current value. The same object until the value changes. */
  readonly value: T
  /** A change made with `set()` is not in the block yet. */
  readonly unsaved: boolean
  /** The block holds a snapshot that was ignored. */
  readonly invalid: boolean
  get(): T
  /** Changes some keys at once and writes the block later. */
  set(partial: Partial<T>, options?: SetDataOptions): void
  flush(): void
}

/** The data-block helper. The host needs `widgetRuntime`, which `createVueWidget()` gives it. */
export function useJsonData<T extends object>(options: BindingOptions<JsonDataOptions<T>>): UseJsonData<T>
