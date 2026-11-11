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
      <h2>Ghost Disco</h2>
      <span class="ghost" aria-hidden="true" [attr.data-move]="move">👻</span>
      <slot><p>Join the midnight dance party.</p></slot>
      <div class="controls" [hidden]="editing">
        <button type="button" value="float" [attr.aria-pressed]="move === 'float'" (click)="choose('float')" [disabled]="!ready">Float</button>
        <button type="button" value="twirl" [attr.aria-pressed]="move === 'twirl'" (click)="choose('twirl')" [disabled]="!ready">Twirl</button>
      </div>
      <p [hidden]="!editing">Edit the invitation, then try a dance move in Preview.</p>
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
  error = ""
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement
  private readonly changeDetector = inject(ChangeDetectorRef)
  private readonly listeners = new AbortController()
  private observer?: MutationObserver
  private currentBlock: HTMLScriptElement | null = null
  private readyBlock: HTMLScriptElement | null = null

  get editing(): boolean { return this.host.isContentEditable }
  get block(): HTMLScriptElement | null {
    return this.host.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
  }
  get ready(): boolean { return !!this.readyBlock && this.readyBlock === this.block }
  get message(): string {
    if(this.error) return this.error
    const {move} = this
    return move === "float" ? "The ghost floats!" : move === "twirl" ? "The ghost twirls!" : "Pick a dance move."
  }

  ngOnInit(): void {
    const {signal} = this.listeners
    this.host.addEventListener("datapending", this.onData, {signal})
    this.host.addEventListener("datachange", this.onData, {signal})
    this.host.addEventListener("dataerror", this.onData, {signal})
    this.observer = new MutationObserver(() => {
      this.requestCurrentBlock()
      this.changeDetector.markForCheck()
    })
    this.observer.observe(this.host, {
      attributes: true,
      attributeFilter: ["contenteditable", "slot", "src", "type"],
      childList: true,
      subtree: true,
    })
    this.requestCurrentBlock()
  }

  ngOnDestroy(): void {
    this.listeners.abort()
    this.observer?.disconnect()
  }

  private requestCurrentBlock(): void {
    const block = this.block
    if(block === this.currentBlock) return
    this.currentBlock = block
    this.readyBlock = null
    this.move = ""
    this.error = ""
    block?.dispatchEvent(new CustomEvent("datarequest", {bubbles: true, cancelable: true}))
  }

  private onData = (event: Event): void => {
    const block = this.block
    if(!block || event.target !== block) return
    this.currentBlock = block
    this.readyBlock = event.type === "datachange" ? block : null
    this.error = event.type === "dataerror"
      ? (event as CustomEvent<{message?: string}>).detail?.message || "Could not load shared dance moves."
      : ""
    this.move = ""
    if(this.readyBlock) this.readMove(block)
    this.changeDetector.markForCheck()
  }

  private readMove(block: HTMLScriptElement): void {
    try {
      const {move} = JSON.parse(block.textContent || "{}")
      this.move = move === "float" || move === "twirl" ? move : ""
    }
    catch {
      this.error = "Could not read the shared dance move."
      this.readyBlock = null
    }
  }

  choose(value: Exclude<Move, "">): void {
    const block = this.block
    if(this.editing || !block || block !== this.readyBlock) return
    try {
      const state = JSON.parse(block.textContent || "{}")
      block.textContent = JSON.stringify({...state, move: value})
      this.move = value
    }
    catch {
      this.error = "Could not save the shared dance move."
      this.readyBlock = null
    }
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

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", GhostDiscoElement)
