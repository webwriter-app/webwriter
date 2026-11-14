import {defineCustomElement, onScopeDispose, shallowReadonly, shallowRef, useHost} from "vue"
import {withWidgetRuntime} from "@webwriter/widget"

export function createVueWidget(component, options) {
  return withWidgetRuntime(defineCustomElement(component, {...options, shadowRoot: true}))
}

export function useWidget(host = useHost()) {
  if(!host?.widgetRuntime) throw new TypeError("useWidget requires a WebWriter widget host")
  const {getSnapshot, subscribe} = host.widgetRuntime
  const snapshot = shallowRef(getSnapshot())
  onScopeDispose(subscribe(() => { snapshot.value = getSnapshot() }))
  return shallowReadonly(snapshot)
}

export * from "@webwriter/widget"
