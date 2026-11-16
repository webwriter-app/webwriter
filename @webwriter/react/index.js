import {createElement, useSyncExternalStore} from "react"
import {createRoot} from "react-dom/client"
import {hasComputedDeclarations, resolveDeclarations, withWidgetRuntime} from "@webwriter/widget"
import {formCallbacks} from "./form.js"

/** Marks the accessors that answer a static declaration with function texts, so that `useHostMembers()` may replace one with a merged answer. */
const declaredAccessor = Symbol.for("@webwriter/react:declared")

export function useWidget(host) {
  const {subscribe, getSnapshot} = host.widgetRuntime
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Return a custom-element class whose shadow UI is rendered by React. */
export function createReactWidget(Component, shadowOptions) {
  return class ReactWidget extends withWidgetRuntime(HTMLElement) {
    #root

    constructor() {
      super()
      this.attachShadow({...shadowOptions, mode: "open"})
      // The editor reads plain maps. A static declaration with a text that is a function is therefore
      // answered on the instance, with the functions asked. A member the class defines itself is left alone,
      // and a later write replaces the accessor, so that an instance field works under both field semantics.
      const declared = this.constructor
      for(const kind of ["options", "actions", "permissions", "optionGroups"]) {
        if(kind in this || !hasComputedDeclarations(declared[kind])) continue
        const get = () => resolveDeclarations(this, declared[kind])
        get[declaredAccessor] = true
        Object.defineProperty(this, kind, {
          configurable: true,
          get,
          set: value => Object.defineProperty(this, kind, {value, writable: true, configurable: true, enumerable: true}),
        })
      }
    }

    connectedCallback() {
      super.connectedCallback()
      if(this.#root) return
      this.#root = createRoot(this.shadowRoot)
      this.#root.render(createElement(Component, {host: this}))
    }

    // The platform looks these up on the class. They do nothing unless a mounted `useExercise()` registered itself.
    formResetCallback() {
      formCallbacks.get(this)?.reset()
    }

    formDisabledCallback(disabled) {
      formCallbacks.get(this)?.disabled(disabled)
    }

    formStateRestoreCallback(state, mode) {
      formCallbacks.get(this)?.restore(state, mode)
    }

    disconnectedCallback() {
      super.disconnectedCallback()
      // A synchronous DOM move keeps its React tree and transient UI state.
      queueMicrotask(() => {
        if(this.isConnected) return
        this.#root?.unmount()
        this.#root = undefined
      })
    }
  }
}

export * from "@webwriter/widget"
