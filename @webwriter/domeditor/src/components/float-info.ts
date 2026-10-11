import {LitElement, css, html} from "lit"
import {fixedPopupPosition} from "./popup-position"

/** Shared responsive-float explanation, rendered only in editor UI. */
export class FloatInfo extends LitElement {
  static properties = {badge: {type: Boolean}, open: {state: true}, placement: {reflect: true}, side: {}}
  static styles = css`
    :host {display: inline-flex; align-items: center; font: 600 10px/1 system-ui;}
    .info {display: grid; place-items: center; width: 12px; height: 12px; border-radius: 50%; background: #0ea5e9; color: white; cursor: help;}
    .popup {position: fixed; inset: auto; margin: 0; z-index: 10000; max-width: min(120px, calc(100vw - 32px)); padding: 9px 12px;
      border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #334155; box-shadow: 0 3px 12px #0003; font: 12px/1.4 system-ui; overflow: visible;}
    .popup::before {content: ""; position: absolute; top: -5px; left: var(--arrow-left, 12px); width: 8px; height: 8px; rotate: 45deg; background: white; border-left: 1px solid #cbd5e1; border-top: 1px solid #cbd5e1;}
    .popup.above::before {top: auto; bottom: -5px; rotate: 225deg;}
    :host([placement="right"]) .popup {box-sizing: border-box; width: max-content; max-width: calc(100vw - 16px);}
    .popup.right-side::before, .popup.left-side::before {top: var(--arrow-top, 50%); bottom: auto; left: -5px; rotate: -45deg;}
    .popup.left-side::before {left: auto; right: -5px; rotate: 135deg;}
    [hidden] {display: none;}
  `
  badge = true
  open = false
  placement = "below"
  side: "left" | "right" = "left"
  private timer: ReturnType<typeof setTimeout> | null = null
  private pinned = false
  private dismiss = () => this.hide()

  private async show() {
    this.open = true
    await this.updateComplete
    if(!this.open || !this.isConnected) return
    const popup = this.renderRoot.querySelector<HTMLElement>(".popup")!
    popup.showPopover?.()
    const trigger = (this.badge ? this : this.parentElement ?? this).getBoundingClientRect()
    const rect = popup.getBoundingClientRect()
    const rightSide = this.placement === "right" && trigger.right + 8 + rect.width <= window.innerWidth - 8
    const leftSide = this.placement === "right" && !rightSide && trigger.left - 8 - rect.width >= 8
    const position = rightSide || leftSide
      ? {left: rightSide ? trigger.right + 8 : trigger.left - rect.width - 8,
          top: Math.max(8, Math.min(window.innerHeight - rect.height - 8, trigger.top + (trigger.height - rect.height) / 2))}
      : fixedPopupPosition(trigger, rect, {width: window.innerWidth, height: window.innerHeight}, 8, 8)
    popup.style.left = `${position.left}px`
    popup.style.top = `${position.top}px`
    popup.style.setProperty("--arrow-left", `${Math.max(8, Math.min(rect.width - 16, trigger.left + trigger.width / 2 - position.left))}px`)
    popup.style.setProperty("--arrow-top", `${Math.max(8, Math.min(rect.height - 12, trigger.top + trigger.height / 2 - position.top - 4))}px`)
    popup.classList.toggle("right-side", rightSide)
    popup.classList.toggle("left-side", leftSide)
    popup.classList.toggle("above", !rightSide && !leftSide && position.top < trigger.top)
  }

  showBriefly() {
    this.hide()
    this.pinned = true
    void this.show()
    this.timer = setTimeout(() => this.hide(), 5000)
    for(const type of ["pointerdown", "click", "keydown", "input", "focusin", "wheel"]) document.addEventListener(type, this.dismiss, true)
    window.addEventListener("blur", this.dismiss)
    window.addEventListener("resize", this.dismiss)
  }

  hide() {
    if(this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.pinned = false
    this.renderRoot.querySelector<HTMLElement>(".popup")?.hidePopover?.()
    this.open = false
    for(const type of ["pointerdown", "click", "keydown", "input", "focusin", "wheel"]) document.removeEventListener(type, this.dismiss, true)
    window.removeEventListener("blur", this.dismiss)
    window.removeEventListener("resize", this.dismiss)
  }

  disconnectedCallback() {
    this.hide()
    super.disconnectedCallback()
  }

  render() {
    return html`<span class="info" ?hidden=${!this.badge} tabindex="0" aria-label="Float placement information" aria-describedby="float-explanation"
      @mouseenter=${() => this.show()} @mouseleave=${() => {if(!this.pinned) this.hide()}}
      @focus=${() => this.show()} @blur=${() => {if(!this.pinned) this.hide()}}>i</span>
      <span id="float-explanation" class="popup" role="tooltip" popover="manual" ?hidden=${!this.open}>Element will be placed ${this.side} on wider screens.</span>`
  }
}
if(!customElements.get("float-info")) customElements.define("float-info", FloatInfo)
