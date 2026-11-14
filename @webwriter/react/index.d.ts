import type {ComponentType} from "react"
import type {WidgetHost, WidgetSnapshot} from "@webwriter/widget"

export * from "@webwriter/widget"

export function useWidget(host: WidgetHost): WidgetSnapshot
export function createReactWidget<Host extends WidgetHost = WidgetHost>(
  component: ComponentType<{host: Host}>,
  shadowOptions?: Omit<ShadowRootInit, "mode">,
): CustomElementConstructor & {new (): WidgetHost, readonly widgetAttributes: readonly string[]}
