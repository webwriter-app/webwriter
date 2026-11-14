import {createComponent, DestroyRef, inject, InjectionToken, Injector, signal} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {withWidgetRuntime} from "@webwriter/widget"

const widgetHost = new InjectionToken("WebWriter widget host")
let defaultApplication

export function injectWidgetHost() {
  return inject(widgetHost)
}

export function injectWidget() {
  const {getSnapshot, subscribe} = injectWidgetHost().widgetRuntime
  const state = signal(getSnapshot())
  inject(DestroyRef).onDestroy(subscribe(() => state.set(getSnapshot())))
  return state.asReadonly()
}

/** Create a widget class that mounts an Angular component in its shadow root. */
export async function createAngularWidget(Component, {application, styles} = {}) {
  if(!application) {
    defaultApplication ??= createApplication().catch(error => {
      defaultApplication = undefined
      throw error
    })
    application = await defaultApplication
  }

  return class AngularWidget extends withWidgetRuntime(HTMLElement) {
    #view
    #mount

    constructor() {
      super()
      const shadow = this.attachShadow({mode: "open"})
      if(styles) {
        const style = this.ownerDocument.createElement("style")
        style.textContent = styles
        shadow.append(style)
      }
    }

    connectedCallback() {
      super.connectedCallback()
      if(!this.isConnected || this.#view) return
      const mount = this.ownerDocument.createElement("div")
      const injector = Injector.create({
        parent: application.injector,
        providers: [{provide: widgetHost, useValue: this}],
      })
      try {
        // Angular can stamp its host and render freely inside this element.
        this.shadowRoot.append(mount)
        this.#mount = mount
        const view = this.#view = createComponent(Component, {
          hostElement: mount,
          environmentInjector: application.injector,
          elementInjector: injector,
        })
        view.onDestroy(() => injector.destroy())
        application.attachView(view.hostView)
        view.changeDetectorRef.detectChanges()
      }
      catch(error) {
        if(this.#view) this.#destroyView()
        else {
          injector.destroy()
          mount.remove()
          this.#mount = undefined
        }
        throw error
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback()
      queueMicrotask(() => {
        if(!this.isConnected) this.#destroyView()
      })
    }

    #destroyView() {
      const view = this.#view, mount = this.#mount
      this.#view = this.#mount = undefined
      try { view?.destroy() }
      finally { mount?.remove() }
    }
  }
}

export * from "@webwriter/widget"
