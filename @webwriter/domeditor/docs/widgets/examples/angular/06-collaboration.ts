import "@angular/compiler"
import {ChangeDetectorRef, Component, ElementRef, inject, Input, type Injector, ViewEncapsulation} from "@angular/core"
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

interface QuizHost extends HTMLElement {
  __wwQuizReadyBlock: HTMLScriptElement | null
  __wwQuizError: string
}

@Component({
  selector: "ww-quiz-view",
  standalone: true,
  template: `
    <slot><p>Add a question.</p></slot>
    <div class="controls" [hidden]="editing">
      <button type="button" value="true" [disabled]="!ready" (click)="choose('true')">True</button>
      <button type="button" value="false" [disabled]="!ready" (click)="choose('false')">False</button>
    </div>
    <p class="author-hint" [hidden]="!editing">Edit the question and correct answer, then use Preview.</p>
    <output aria-live="polite">{{message}}</output>`,
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
    .controls[hidden], .author-hint[hidden] { display: none; }
    button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
    button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
  `],
  encapsulation: ViewEncapsulation.ShadowDom,
})
class WwQuiz {
  static options = {
    answer: {
      type: "select",
      label: {_: "Correct answer"},
      options: [
        {value: "true", label: {_: "True"}},
        {value: "false", label: {_: "False"}},
      ],
    },
  }
  static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}
  private _answer: string = "false"
  error: string = ""
  choice: string = ""

  readonly host: QuizHost = inject(ElementRef<QuizHost>).nativeElement
  private readonly changeDetector = inject(ChangeDetectorRef)
  private observer?: MutationObserver
  private lastBlock: HTMLScriptElement | null = null
  private onDataChange!: (event: Event) => void
  private onDataError!: (event: Event) => void
  private onMutations!: (records: MutationRecord[]) => void

  constructor() {
    this.onDataChange = (event: Event): void => {
      if(event.target !== this.block) return
      this.host.__wwQuizReadyBlock = event.target as HTMLScriptElement
      this.host.__wwQuizError = ""
      this.error = ""
      this.refresh()
    }
    this.onDataError = (event: Event): void => {
      const detail = (event as CustomEvent<{message?: string}>).detail
      if(event.target !== this.block) return
      this.host.__wwQuizReadyBlock = null
      this.error = detail?.message || "Could not load shared answers."
      this.host.__wwQuizError = this.error
      this.changeDetector.markForCheck()
    }
    this.onMutations = (_records: MutationRecord[]): void => {
      const current = this.block
      if(current !== this.lastBlock) {
        if(this.host.__wwQuizReadyBlock === this.lastBlock) this.host.__wwQuizReadyBlock = null
        this.lastBlock = current
      }
      this.refresh()
    }
  }

  get block(): HTMLScriptElement | null {
    return this.host.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
  }
  @Input()
  get answer(): string { return this._answer }
  set answer(value: string | null | undefined) { this._answer = value ?? "false" }
  get editing(): boolean { return this.host.isContentEditable }
  get readyBlock(): HTMLScriptElement | null { return this.host.__wwQuizReadyBlock || null }
  get ready(): boolean { return !!this.block && this.block === this.readyBlock }
  get message(): string {
    if(this.error) return this.error
    if(!this.ready) return "Loading answers…"
    return this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : ""
  }

  ngOnInit(): void {
    this.lastBlock = this.block
    this.error = this.host.__wwQuizError || ""
    this.host.addEventListener("datachange", this.onDataChange)
    this.host.addEventListener("dataerror", this.onDataError)
    this.observer = new MutationObserver(this.onMutations)
    this.observer.observe(this.host, {
      attributes: true,
      attributeFilter: ["contenteditable", "shared"],
      characterData: true,
      childList: true,
      subtree: true,
    })
    this.refresh()
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
    this.host.removeEventListener("datachange", this.onDataChange)
    this.host.removeEventListener("dataerror", this.onDataError)
  }

  refresh(): void {
    try {
      const value: unknown = JSON.parse(this.block?.textContent || "{}").choice
      this.choice = value === "true" || value === "false" ? value : ""
    }
    catch(error: unknown) {
      this.choice = ""
      if(this.ready) this.error = error instanceof Error ? error.message : String(error)
    }
    this.changeDetector.markForCheck()
  }

  choose(value: "true" | "false"): void {
    const block = this.block
    if(this.editing || !block || block !== this.readyBlock) return
    try {
      const state: Record<string, unknown> = JSON.parse(block.textContent || "{}")
      block.textContent = JSON.stringify({...state, choice: value})
      this.error = ""
      this.refresh()
    }
    catch(error: unknown) {
      this.error = error instanceof Error ? error.message : String(error)
      this.changeDetector.markForCheck()
    }
  }

  resetAnswer(): void { this.answer = "false" }
}


const app = await createApplication()
const AngularWwQuizElement = createCustomElement(WwQuiz, {injector: app.injector}) as unknown as AngularElementConstructor
class WwQuizElement extends AngularWwQuizElement {
  resetAnswer(): void { this.setAttribute("answer", "false") }
  static options = WwQuiz.options
  static actions = WwQuiz.actions
  __wwQuizReadyBlock: HTMLScriptElement | null = null
  __wwQuizError: string = ""
  connectedCallback(): void {
    const version = this.getAttribute("ng-version")
    super.connectedCallback()
    // Angular adds a runtime stamp to its host; preserve only an authored one.
    if(version === null) this.removeAttribute("ng-version")
    else this.setAttribute("ng-version", version)
  }

  constructor(...args: ConstructorParameters<typeof AngularWwQuizElement>) {
    super(...args)
    this.__wwQuizReadyBlock = null
    this.__wwQuizError = ""
    this.addEventListener("datachange", (event: Event) => {
      if(event.target !== this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')) return
      this.__wwQuizReadyBlock = event.target as HTMLScriptElement
      this.__wwQuizError = ""
    })
    this.addEventListener("dataerror", (event: Event) => {
      if(event.target !== this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')) return
      this.__wwQuizReadyBlock = null
      this.__wwQuizError = (event as CustomEvent<{message?: string}>).detail?.message || "Could not load shared answers."
    })
  }

  static get observedAttributes(): string[] {
    return [...super.observedAttributes, "shared"]
  }

  get answer(): string { return this.getAttribute("answer") ?? "false" }
  set answer(value: string | null | undefined) {
    if(value === null || value === undefined) this.removeAttribute("answer")
    else this.setAttribute("answer", String(value))
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
    if(name === "shared") {
      if(oldValue !== value) this.__wwQuizReadyBlock = null
      return
    }
    super.attributeChangedCallback(name, oldValue, value)
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuizElement)
