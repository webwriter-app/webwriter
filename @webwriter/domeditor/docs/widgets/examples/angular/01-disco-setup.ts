import "@angular/compiler"
import {Component, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

@Component({
  selector: "ww-ghost-disco-view",
  standalone: true,
  template: "<p>Ghost Disco widget</p>",
  encapsulation: ViewEncapsulation.ShadowDom,
})
class GhostDisco {}

const app = await createApplication()
const AngularGhostDiscoElement = createCustomElement(GhostDisco, {injector: app.injector}) as unknown as {
  new(): HTMLElement & {connectedCallback(): void}
}
class GhostDiscoElement extends AngularGhostDiscoElement {
  connectedCallback(): void {
    const version = this.getAttribute("ng-version")
    super.connectedCallback()
    // Keep Angular's runtime stamp out of the authored document.
    if(version === null) this.removeAttribute("ng-version")
    else this.setAttribute("ng-version", version)
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", GhostDiscoElement)
