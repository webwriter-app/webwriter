import {withAuthoring} from "#disco-authoring"

import "@angular/compiler"
import {ChangeDetectorRef, Component, ElementRef, inject, Input, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

type Move = "" | "float" | "twirl"
type Lighting = "moonlight" | "neon"

@Component({
  selector: "ww-ghost-disco-view",
  standalone: true,
  template: `
    <section class="stage" [attr.data-lighting]="lighting" aria-label="Ghost Disco">
      <h2><span class="locale-label" part="title"><span lang="en">Dance party</span><span lang="de">Tanzparty</span></span></h2>
      <span class="ghost" part="ghost" aria-hidden="true" [attr.data-move]="move">👻</span>
      <slot><p>Join the midnight dance party.</p></slot>
      <div class="controls" [hidden]="editing">
        <button type="button" value="float" [attr.aria-pressed]="move === 'float'" (click)="choose('float')">Float</button>
        <button type="button" value="twirl" [attr.aria-pressed]="move === 'twirl'" (click)="choose('twirl')">Twirl</button>
      </div>
      <p [hidden]="!editing"><button type="button" data-edit-invitation>Edit invitation text</button></p>
      <p class="print-line">Circle a dance move: Float / Twirl</p>
      <output aria-live="polite">{{message}}</output>
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
    .stage[data-lighting="neon"] { background: #321952; color: #fcf1ff; }
    .ghost { display: inline-block; font-size: 3rem; line-height: 1.5; }
    .ghost[data-move="float"] { transform: translateY(-.25em); }
    .ghost[data-move="twirl"] { transform: rotate(-25deg) scale(1.1); }
    .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
    .controls[hidden] { display: none; }
    button {
      font: inherit;
      padding: .4rem .8rem;
      border: 1px solid currentColor;
      border-radius: 1rem;
      color: inherit;
      background: transparent;
    }
    button[aria-pressed="true"] { font-weight: bold; }
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
  @Input()
  set lighting(value: string | null | undefined) {
    this.lightingValue = value === "neon" ? "neon" : "moonlight"
  }
  get lighting(): Lighting { return this.lightingValue }

  private lightingValue: Lighting = "moonlight"
  move: Move = ""
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement
  private readonly changeDetector = inject(ChangeDetectorRef)
  private observer?: MutationObserver

  get editing(): boolean { return this.host.isContentEditable }
  get message(): string {
    const {move} = this
    return move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
  }

  ngOnInit(): void {
    this.observer = new MutationObserver(() => this.changeDetector.markForCheck())
    this.observer.observe(this.host, {attributes: true, attributeFilter: ["contenteditable"]})
  }

  ngOnDestroy(): void { this.observer?.disconnect() }

  choose(value: Exclude<Move, "">): void {
    if(!this.editing) this.move = value
  }
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

  get lighting(): Lighting { return this.getAttribute("lighting") === "neon" ? "neon" : "moonlight" }
  set lighting(value: string | null | undefined) {
    if(value == null) this.removeAttribute("lighting")
    else this.setAttribute("lighting", value === "neon" ? "neon" : "moonlight")
  }

  static options = {
    lighting: {
      type: "select",
      label: {_: "Lighting"},
      group: "disco",
      options: [
        {value: "moonlight", label: {_: "Moonlight"}},
        {value: "neon", label: {_: "Neon"}},
      ],
    },
  }
  static actions = {resetLighting: {group: "disco", label: {_: "Reset lighting"}}}

  resetLighting(): void { this.lighting = "moonlight" }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", withAuthoring(GhostDiscoElement))
