import "@angular/compiler"
import {ChangeDetectorRef, Component, ElementRef, inject, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

@Component({
  selector: "ww-ghost-disco-view",
  standalone: true,
  template: `
    <div class="stage">
      <slot><p>Join the midnight dance party.</p></slot>
      <span class="ghost" aria-hidden="true">👻</span>
      <div class="controls" [hidden]="editing">
        <button type="button" value="float">Float</button>
        <button type="button" value="twirl">Twirl</button>
      </div>
      <p class="author-hint" [hidden]="!editing">Edit the invitation in the document.</p>
      <output aria-live="polite">Pick a dance move.</output>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .stage { padding: 1rem; border: 1px solid #90a6cd; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
    .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; }
    .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
    .controls[hidden] { display: none; }
    button { font: inherit; padding: .375rem .75rem; }
    output { display: block; margin-block-start: .75rem; }

    :host { container-type: inline-size; }
    .controls { display: grid; }
    .controls[hidden] { display: none; }
    @container (min-width: 24rem) {
      .controls { display: flex; justify-content: center; }
    }
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

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", GhostDiscoElement)
