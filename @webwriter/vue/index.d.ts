import type {Component, CustomElementOptions, ShallowRef, VueElement} from "vue"
import type {WidgetHost, WidgetSnapshot} from "@webwriter/widget"

export * from "@webwriter/widget"

export function createVueWidget(component: Component, options?: Omit<CustomElementOptions, "shadowRoot">): {
  new (initialProps?: Record<string, unknown>): VueElement & WidgetHost
  readonly widgetAttributes: readonly string[]
}
export function useWidget(host?: WidgetHost): Readonly<ShallowRef<WidgetSnapshot>>
