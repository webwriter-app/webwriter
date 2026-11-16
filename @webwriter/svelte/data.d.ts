import type {JsonDataCore, JsonDataOptions} from "@webwriter/widget/data"
import type {CoreStore} from "./base.js"

export {DATA_URL_LIMIT, fromDataURL, toDataURL, type DataBlockKind, type DataErrorDetail, type JsonDataOptions, type JsonDataSnapshot, type SetDataOptions} from "@webwriter/widget/data"

/** The state is `{value, unsaved, invalid}`. */
export type JsonDataStore<T extends object> = CoreStore<JsonDataCore<T>> & Pick<JsonDataCore<T>, "get" | "set" | "flush">

/** The host needs a `widgetRuntime`: `withWidgetRuntime(Base)`. */
export function jsonDataStore<T extends object>(host: HTMLElement, options: JsonDataOptions<T>): JsonDataStore<T>
