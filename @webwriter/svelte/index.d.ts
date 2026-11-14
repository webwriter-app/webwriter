import type {Readable} from "svelte/store"
import type {WidgetHost, WidgetSnapshot} from "@webwriter/widget"

export * from "@webwriter/widget"

export function widgetStore(host: WidgetHost): Readable<WidgetSnapshot>
