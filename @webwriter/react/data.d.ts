import type {WidgetHost} from "@webwriter/widget"
import type {JsonDataOptions, SetDataOptions} from "@webwriter/widget/data"
import type {BindingOptions} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL, type DataBlockKind, type DataErrorDetail, type SetDataOptions} from "@webwriter/widget/data"

/**
 * React binding of the data-block helper. The host needs the widget runtime,
 * which `createReactWidget()` gives it. The component renders when the value
 * changes, from inside or outside.
 */
export function useJsonData<T extends object>(host: WidgetHost, options: BindingOptions<JsonDataOptions<T>>): {
  /** The current value. The same object until the value changes. */
  readonly value: T
  /** A change made with `set()` is not in the block yet. */
  readonly unsaved: boolean
  /** The block holds a snapshot that was ignored. */
  readonly invalid: boolean
  /** Changes some keys. The value changes at once; the block is written later. */
  set(partial: Partial<T>, options?: SetDataOptions): void
  /** Writes a pending change now. */
  flush(): void
}
