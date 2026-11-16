import type {Readable} from "svelte/store"
import type {WidgetHost, WidgetSnapshot} from "@webwriter/widget"

export * from "@webwriter/widget"

type Constructor<T = object> = new (...args: any[]) => T

/** Lets the static `options`, `actions`, `permissions` and `optionGroups` have texts that are functions of the widget. For `customElement.extend`. */
export function withDeclarations<Base extends Constructor<HTMLElement>>(Base: Base): Base

export function widgetStore(host: WidgetHost): Readable<WidgetSnapshot>
