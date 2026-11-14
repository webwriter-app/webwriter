import {createElement, useSyncExternalStore} from "react"
import {createRoot} from "react-dom/client"
import {withWidgetRuntime} from "@webwriter/widget"

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
    }

    connectedCallback() {
      super.connectedCallback()
      if(this.#root) return
      this.#root = createRoot(this.shadowRoot)
      this.#root.render(createElement(Component, {host: this}))
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
