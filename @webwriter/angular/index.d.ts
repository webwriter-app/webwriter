import type {ApplicationRef, Signal, Type} from "@angular/core"
import type {WidgetHost, WidgetSnapshot} from "@webwriter/widget"

export * from "@webwriter/widget"

export function injectWidgetHost(): WidgetHost
export function injectWidget(): Signal<WidgetSnapshot>
export function createAngularWidget(
  component: Type<unknown>,
  options?: {application?: ApplicationRef, styles?: string},
): Promise<{
  new (): WidgetHost
  readonly widgetAttributes: readonly string[]
}>
