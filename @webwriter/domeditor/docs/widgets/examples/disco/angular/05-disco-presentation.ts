import {withAuthoring} from "#disco-authoring"

import "@angular/compiler"
import {ChangeDetectorRef, Component, ElementRef, inject, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

@Component({
  selector: "ww-ghost-disco-view",
  standalone: true,
  template: `
    <section class="stage" data-lighting="moonlight" aria-label="Ghost Disco">
      <h2><span class="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
      <span class="ghost" part="ghost" aria-hidden="true">👻</span>
      <slot><p>Join the midnight dance party.</p></slot>
      <div class="controls" [hidden]="editing">
        <button type="button" value="float">Float</button>
        <button type="button" value="twirl">Twirl</button>
      </div>
      <p class="author-hint" [hidden]="!editing"><button type="button" data-edit-invitation>Edit invitation text</button></p>
      <p class="print-line">Circle a dance move: Float / Twirl</p>
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
    :host { container-type: inline-size; overflow-wrap: anywhere; }
    .controls { display: grid; }
    .controls[hidden] { display: none; }
    @container (min-width: 24rem) {
      .controls { display: flex; justify-content: center; }
    }
    :host { font-family: var(--ww-font-family, inherit); }
    .stage[data-lighting="moonlight"] { color: var(--ww-text-color, #172c5a); }
    .ghost { text-shadow: 0 0 .6rem var(--ww-theme-accent-1, #b4c9fb); }
    .print-line { display: none; }
    @media print {
      .stage[data-lighting] { color: #000; background: #fff; }
      .controls, .author-hint, [data-edit-invitation], output { display: none; }
      .print-line { display: block; }
    }
    .locale-label > [lang="de"], :host(:lang(de)) .locale-label > [lang="en"] { display: none; }
    :host(:lang(de)) .locale-label > [lang="de"] { display: inline; }
  `],
  encapsulation: ViewEncapsulation.ShadowDom,
})
class GhostDisco {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement
  private readonly changeDetector = inject(ChangeDetectorRef)
  private readonly observer = new MutationObserver(() => this.changeDetector.markForCheck())

  get editing(): boolean { return this.host.isContentEditable }

  ngOnInit(): void {
    this.observer.observe(this.host, {attributes: true, attributeFilter: ["contenteditable"]})
  }

  ngOnDestroy(): void { this.observer.disconnect() }
}

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

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withAuthoring(GhostDiscoElement))
