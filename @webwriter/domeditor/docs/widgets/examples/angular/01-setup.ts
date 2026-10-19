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
  selector: "ww-quiz-view",
  standalone: true,
  template: "<p>Quiz widget</p>",
  encapsulation: ViewEncapsulation.ShadowDom,
})
class WwQuiz {}


const app = await createApplication()
const AngularWwQuizElement = createCustomElement(WwQuiz, {injector: app.injector}) as unknown as AngularElementConstructor
class WwQuizElement extends AngularWwQuizElement {
  connectedCallback(): void {
    const version = this.getAttribute("ng-version")
    super.connectedCallback()
    // Angular adds a runtime stamp to its host; preserve only an authored one.
    if(version === null) this.removeAttribute("ng-version")
    else this.setAttribute("ng-version", version)
  }
}
if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuizElement)
