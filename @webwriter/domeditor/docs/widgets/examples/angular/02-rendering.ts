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
  template: `
    <p>The Moon is a star.</p>
    <div class="controls">
      <button type="button" value="true">True</button>
      <button type="button" value="false">False</button>
    </div>
    <output aria-live="polite"></output>`,
  styles: [`
    :host {
      display: block; box-sizing: border-box;
      max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
      min-inline-size: 0; margin-inline: auto; padding: 1rem;
      border: 1px solid #cbd5e1; border-radius: .5rem;
      background: white; color: #1f2937; container-type: inline-size;
      overflow-wrap: anywhere;
    }
    .controls { display: flex; flex-wrap: wrap; gap: .5rem; }
    button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
    button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
  `],
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
