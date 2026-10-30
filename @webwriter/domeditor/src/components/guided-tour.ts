import {LitElement, css, html} from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {editorInteractionStyles} from "./editing-controls.styles"
import {popupAnchorCSS} from "./popup-position"
import {createAnchorPositioner} from "../anchor-positioning.js"

const steps = [
  {title: "Make it yours", text: "Click the page to write. Editing closes this tour."},
  {title: "Add something", text: "Use Elements for text, media, and more."},
  {title: "Try it out", text: "Preview shows what readers see."},
  {title: "Keep your work", text: "Use File to save or download. Replay this tour in Settings."},
]

/** Host UI only: the tour never touches the authored document or selection. */
export class GuidedTour extends LitElement {
  static properties = {
    anchor: {attribute: false},
    step: {state: true},
  }

  static styles = css`
    ${editorInteractionStyles}
    :host {
      position: fixed;
      z-index: 8;
      display: block;
      box-sizing: border-box;
      width: min(17rem, calc(100vw - 1rem));
      max-height: calc(100dvh - 1rem);
      overflow: auto;
      padding: .75rem;
      border: 1px solid #b9c5d2;
      border-radius: .45rem;
      background: #fff;
      box-shadow: 0 3px 14px rgb(32 42 54 / 12%);
      color: #2f3742;
      font: .75rem/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header, footer { display: flex; align-items: center; gap: .4rem; }
    header { justify-content: space-between; }
    h2 { margin: 0; font-size: .8rem; font-weight: 650; }
    p { margin: .4rem 0 .75rem; color: #687383; }
    .progress { margin-right: auto; color: #687383; font-size: .65rem; }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 1.8rem;
      padding: .25rem .55rem;
      border: 1px solid #c4ccd6;
      border-radius: .3rem;
      color: inherit;
      background: #f7f8fa;
      font: inherit;
      font-size: .7rem;
      cursor: pointer;
    }
    button:hover { background: #eef4fb; border-color: #93b9e8; }
    button:focus-visible { outline: 2px solid #3977c7; outline-offset: 2px; }
    button:disabled { opacity: .45; cursor: default; }
    .next { border-color: #3977c7; color: #fff; background: #3977c7; }
    .next:hover { background: #2e65ad; }
    .close { min-width: 1.8rem; padding: .25rem; border: 0; background: transparent; color: #687383; }
    .close svg { width: 1rem; height: 1rem; }
    .target { position: fixed; inset: auto; pointer-events: none; box-sizing: border-box; border: 1px solid #3977c7; border-radius: .3rem; }
    .target[hidden] { display: none; }
  `

  anchor: (step: number) => HTMLElement | null = () => null
  private step = 0
  private resizeObserver: ResizeObserver | null = null
  private anchorPositioner = createAnchorPositioner(document)
  private positionedAnchor: HTMLElement | null = null
  private positionedStep = -1

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener("resize", this.position)
    window.addEventListener("scroll", this.position, true)
    this.resizeObserver = new ResizeObserver(this.position)
    this.resizeObserver.observe(this)
  }

  disconnectedCallback() {
    this.anchorPositioner.destroy()
    this.positionedAnchor = null
    this.positionedStep = -1
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    window.removeEventListener("resize", this.position)
    window.removeEventListener("scroll", this.position, true)
    super.disconnectedCallback()
  }

  protected updated() {
    this.resizeObserver?.disconnect()
    this.resizeObserver?.observe(this)
    const anchor = this.anchor(this.step)
    if(anchor) this.resizeObserver?.observe(anchor)
    this.position()
  }

  private position = () => {
    const anchor = this.anchor(this.step)
    if(!anchor?.isConnected) {
      const target = this.renderRoot.querySelector<HTMLElement>(".target")
      if(target) target.hidden = true
      this.anchorPositioner.release(this)
      if(target) this.anchorPositioner.release(target)
      this.positionedAnchor = null
      this.positionedStep = -1
      this.anchorPositioner.refresh()
      return
    }
    if(this.positionedAnchor !== anchor || this.positionedStep !== this.step) {
      const target = this.renderRoot.querySelector<HTMLElement>(".target")
      this.anchorPositioner.release(this)
      if(target) this.anchorPositioner.release(target)
      if(target && this.step !== 0) {
        this.anchorPositioner.bind(target, anchor,
          "left:calc(anchor(left) - 3px);top:calc(anchor(top) - 3px);width:calc(anchor-size(width) + 6px);height:calc(anchor-size(height) + 6px);")
      }
      this.anchorPositioner.bind(this, anchor, this.step === 0
        ? "left:anchor(left);top:calc(anchor(top) + 10px);width:min(17rem,calc(100vw - 1rem));max-height:calc(100dvh - 1rem);"
        : popupAnchorCSS(10))
      this.positionedAnchor = anchor
      this.positionedStep = this.step
      this.anchorPositioner.refresh()
    }
    const rect = anchor.getBoundingClientRect()
    const target = this.renderRoot.querySelector<HTMLElement>(".target")
    if(target) {
      target.hidden = this.step === 0 || !rect.width || !rect.height
    }
  }

  private dismiss() {
    this.dispatchEvent(new CustomEvent("tour-dismiss", {bubbles: true, composed: true}))
  }

  render() {
    const step = steps[this.step]
    return html`
      <section aria-label="Guided tour" @keydown=${(event: KeyboardEvent) => {
        if(event.key === "Escape") { event.stopPropagation(); this.dismiss() }
      }}>
        <div class="target" hidden aria-hidden="true"></div>
        <div aria-live="polite" aria-atomic="true">
          <header>
            <h2>${step.title}</h2>
            <button class="close" type="button" aria-label="Dismiss tour" title="Dismiss tour"
              @click=${this.dismiss}>${ribbonIcon("Reject")}</button>
          </header>
          <p>${step.text}</p>
        </div>
        <footer>
          <span class="progress" aria-label=${`Step ${this.step + 1} of ${steps.length}`}>${this.step + 1} / ${steps.length}</span>
          <button type="button" ?disabled=${this.step === 0} @click=${() => this.step--}>Back</button>
          <button class="next" type="button" @click=${() => this.step === steps.length - 1 ? this.dismiss() : this.step++}>
            ${this.step === steps.length - 1 ? "Done" : "Next"}
          </button>
        </footer>
      </section>`
  }
}

if(!customElements.get("guided-tour")) customElements.define("guided-tour", GuidedTour)

declare global {
  interface HTMLElementTagNameMap {
    "guided-tour": GuidedTour
  }
}
