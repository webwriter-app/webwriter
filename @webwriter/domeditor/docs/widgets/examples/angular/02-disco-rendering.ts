import "@angular/compiler"
import {Component, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

@Component({
  selector: "ww-ghost-disco-view",
  standalone: true,
  template: `
    <section class="stage" data-lighting="moonlight" aria-label="Ghost Disco">
      <h2>Ghost Disco</h2>
      <span class="ghost" aria-hidden="true">👻</span>
      <p>Join the midnight dance party.</p>
      <div class="controls">
        <button type="button" value="float">Float</button>
        <button type="button" value="twirl">Twirl</button>
      </div>
      <output aria-live="polite">Pick a dance move.</output>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .stage {
      box-sizing: border-box;
      max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
      margin-inline: auto;
      padding: 1rem;
      border-radius: .75rem;
      background: #e5edff;
      color: #172c5a;
      text-align: center;
      overflow-wrap: anywhere;
    }
    .ghost { display: inline-block; font-size: 3rem; line-height: 1.5; }
    .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
    button {
      font: inherit;
      padding: .4rem .8rem;
      border: 1px solid currentColor;
      border-radius: 1rem;
      color: inherit;
      background: transparent;
    }
    button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    output { display: block; margin-block-start: .75rem; }
  `],
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
