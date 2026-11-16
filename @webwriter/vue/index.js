import {defineCustomElement, onScopeDispose, shallowReadonly, shallowRef, useHost} from "vue"
import {hasComputedDeclarations, resolveDeclarations, withWidgetRuntime} from "@webwriter/widget"

/**
 * Creates the custom element class of a widget from a Vue component, with the widget runtime.
 *
 * The editor reads the static `options`, `actions`, `permissions` and `optionGroups` of the class as plain maps.
 * A text of such a declaration may be a function of the widget, for a text from the widget's own catalog:
 * the instance then answers the declaration with the functions asked, as `LitElementWw` does.
 */
export function createVueWidget(component, options) {
  const Base = withWidgetRuntime(defineCustomElement(component, {...options, shadowRoot: true}))
  return class extends Base {
    constructor(...parameters) {
      super(...parameters)
      // A member the component or a subclass defines itself is left alone, and a later write replaces the accessor.
      for(const kind of ["options", "actions", "permissions", "optionGroups"]) {
        const declared = this.constructor[kind]
        if(kind in this || !hasComputedDeclarations(declared)) continue
        Object.defineProperty(this, kind, {
          configurable: true,
          get: () => resolveDeclarations(this, declared),
          set: value => Object.defineProperty(this, kind, {value, writable: true, configurable: true, enumerable: true}),
        })
      }
    }
  }
}

export function useWidget(host = useHost()) {
  if(!host?.widgetRuntime) throw new TypeError("useWidget requires a WebWriter widget host")
  const {getSnapshot, subscribe} = host.widgetRuntime
  const snapshot = shallowRef(getSnapshot())
  onScopeDispose(subscribe(() => { snapshot.value = getSnapshot() }))
  return shallowReadonly(snapshot)
}

export * from "@webwriter/widget"
