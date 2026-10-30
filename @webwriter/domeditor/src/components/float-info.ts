import {LitElement, css, html} from "lit"
import {createAnchorPositioner} from "../anchor-positioning.js"
import {popupAnchorCSS} from "./popup-position"

/** Shared responsive-float explanation, rendered only in editor UI. */
export class FloatInfo extends LitElement {
  static properties = {badge: {type: Boolean}, open: {state: true}, placement: {reflect: true}, side: {}}
  static styles = css`
    :host {display: inline-flex; align-items: center; font: 600 10px/1 system-ui;}
    .info {display: grid; place-items: center; width: 12px; height: 12px; border-radius: 50%; background: #0ea5e9; color: white; cursor: help;}
    .popup {position: fixed; inset: auto; margin: 0; z-index: 10000; max-width: min(120px, calc(100vw - 32px)); padding: 9px 12px;
      border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #334155; box-shadow: 0 3px 12px #0003; font: 12px/1.4 system-ui; overflow: visible;}
    .popup::before {content: ""; position: absolute; top: -5px; left: 50%; translate: -50% 0; width: 8px; height: 8px; rotate: 45deg; background: white; border-left: 1px solid #cbd5e1; border-top: 1px solid #cbd5e1;}
    :host([placement="right"]) .popup {box-sizing: border-box; width: max-content; max-width: calc(100vw - 16px);}
    :host([placement="right"]) .popup::before {top: 50%; left: -5px; translate: 0 -50%; rotate: -45deg;}
    [hidden] {display: none;}
  `
  badge = true
  open = false
  placement = "below"
  side: "left" | "right" = "left"
  private timer: ReturnType<typeof setTimeout> | null = null
  private pinned = false
  private anchorPositioner = createAnchorPositioner(document)
  private dismiss = () => this.hide()

  private async show() {
    this.open = true
    await this.updateComplete
    if(!this.open || !this.isConnected) return
    const popup = this.renderRoot.querySelector<HTMLElement>(".popup")!
    popup.showPopover?.()
    const trigger = this.badge ? this.renderRoot.querySelector<HTMLElement>(".info")! : this.parentElement ?? this
    this.anchorPositioner.bind(popup, this.badge ? this : this.parentElement ?? this,
      this.placement === "right"
        ? `${popupAnchorCSS(8)}position-area:right span-all;justify-self:start;align-self:center;margin:0 8px;`
        : popupAnchorCSS(8))
    this.anchorPositioner.refresh()
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
    const popup = this.renderRoot.querySelector<HTMLElement>(".popup")
    if(popup) this.anchorPositioner.release(popup)
    this.open = false
    for(const type of ["pointerdown", "click", "keydown", "input", "focusin", "wheel"]) document.removeEventListener(type, this.dismiss, true)
    window.removeEventListener("blur", this.dismiss)
    window.removeEventListener("resize", this.dismiss)
  }

  disconnectedCallback() {
    this.hide()
    this.anchorPositioner.destroy()
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
