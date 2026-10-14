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

@Component({
  selector: "ww-quiz-view",
  standalone: true,
  template: `
    <slot><p>Add a question.</p></slot>
    <div class="controls" [hidden]="editing">
      <button type="button" value="true" (click)="choose('true')">True</button>
      <button type="button" value="false" (click)="choose('false')">False</button>
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
  @Input() answer: string = "false"
  choice: string = ""

  readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement
  private readonly changeDetector = inject(ChangeDetectorRef)
  private observer?: MutationObserver
  private readonly onHostMutation: () => void

  constructor() {
    this.onHostMutation = (): void => this.changeDetector.markForCheck()
  }

  ngOnInit(): void {
    this.observer = new MutationObserver(this.onHostMutation)
    this.observer.observe(this.host, {attributes: true, attributeFilter: ["contenteditable"]})
  }

  ngOnDestroy(): void { this.observer?.disconnect() }

  get editing(): boolean { return this.host.isContentEditable }
  get message(): string {
    return this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : ""
  }

  choose(value: "true" | "false"): void {
    if(this.editing) return
    this.choice = value
  }
}


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
