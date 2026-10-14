import "@angular/compiler"
import {Component, type Injector, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

type AngularElementBase = HTMLElement & {
  connectedCallback(): void
  disconnectedCallback(): void
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null, namespace?: string): void
}
type AngularElementConstructor = {
  new(injector?: Injector): AngularElementBase
  readonly observedAttributes: string[]
}

@Component({
  selector: "ww-hello-view",
  standalone: true,
  template: "<p>Hello, <slot>world</slot>!</p>",
  styles: [":host { display: block; }"],
  encapsulation: ViewEncapsulation.ShadowDom,
})
class WwHello {}


const app = await createApplication()
const AngularWwHelloElement = createCustomElement(WwHello, {injector: app.injector}) as unknown as AngularElementConstructor
class WwHelloElement extends AngularWwHelloElement {
  connectedCallback(): void {
    const version = this.getAttribute("ng-version")
    super.connectedCallback()
    // Angular adds a runtime stamp to its host; preserve only an authored one.
    if(version === null) this.removeAttribute("ng-version")
    else this.setAttribute("ng-version", version)
  }
}
if(!customElements.get("ww-hello")) customElements.define("ww-hello", WwHelloElement)
