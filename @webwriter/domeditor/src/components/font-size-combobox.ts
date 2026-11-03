import {css} from "lit"
import {StyleCombobox} from "./style-combobox"
import {fontSizeOptions} from "../marks"
import {connectPopup} from "./popup-position"
import {connectedComboboxStyles} from "./dropdown-content.styles"

/** Editable pixel sizes with an unfiltered list of presets. */
export class FontSizeCombobox extends StyleCombobox {
  static styles = [...StyleCombobox.styles, css`
    :host, :host([show-value]) {height: 1.75rem; --metadata-combobox-height: 1.75rem;}
    .listbox {
      grid-template-rows: minmax(0, 1fr);
      width: anchor-size(width);
      max-height: min(18rem, calc(100% - 8px), calc(100vh - 1rem));
      margin-block: -1px;
      padding: 0;
      overflow: hidden;
      position-try-order: most-height;
      border: 1px solid #a8a8a8;
      position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    }
    .option-group {min-height: 0; max-height: min(calc(18rem - 2px), calc(100vh - 1rem - 2px), 100%); overflow: auto;}
    .option {min-height: 1.75rem; padding: .35rem .1rem; font-size: .72rem;}
    .option-value {display: none;}
  `, connectedComboboxStyles]

  options = fontSizeOptions
  placeholder = "Size"
  showValue = true
  persistent = false
  private hasInput = false

  protected handleInput(event: InputEvent) {
    this.hasInput = true
    super.handleInput(event)
  }

  protected handleInputClick() {
    super.handleInputClick()
    if(!this.hasInput) this.renderRoot.querySelector<HTMLInputElement>("input")?.select()
  }

  protected displayedValue() {
    const number = Number.parseFloat(this.value)
    return Number.isFinite(number) ? String(number) : this.value
  }

  protected emit(value: string) {
    value = value.trim()
    if(value) {
      const number = value.match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:\s*[a-z%]+)?$/i)?.[1]
      if(number === undefined || !Number.isFinite(Number(number))) { this.close(true); return }
      value = `${Number(number)}px`
    }
    super.emit(value)
  }

  close(reset = true) {
    this.hasInput = false
    super.close(reset)
    this.renderRoot?.querySelector(".control")?.removeAttribute("data-connected")
  }

  protected setOpen(open: boolean) {
    if(!open) { this.close(); return Promise.resolve() }
    const wasOpen = this.open
    const update = super.setOpen(open)
    void update.then(async () => {
      if(!this.open || !this.isConnected) return
      if(!wasOpen && !this.hasInput) {
        const input = this.renderRoot.querySelector<HTMLInputElement>("input")!
        input.focus()
        input.select()
      }
      // Anchor-positioned popovers can receive their final top-layer geometry
      // after showPopover() completes. Join the border after that layout pass.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if(this.open && this.isConnected) this.connectDropdown()
    })
    return update
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if(this.open && this.renderRoot.querySelector(".listbox")?.matches(":popover-open")) this.connectDropdown()
  }

  private connectDropdown() {
    const control = this.renderRoot.querySelector<HTMLElement>(".control")
    const popup = this.renderRoot.querySelector<HTMLElement>(".listbox")
    if(this.open && control && popup) connectPopup(control, popup)
  }

  protected handleKeydown(event: KeyboardEvent) {
    if(event.isComposing) return
    super.handleKeydown(event)
    if(event.key === "ArrowDown" || event.key === "ArrowUp") void this.updateComplete.then(() => {
      this.renderRoot.querySelector("[data-active]")?.scrollIntoView?.({block: "nearest"})
    })
  }
}

if(!customElements.get("font-size-combobox")) customElements.define("font-size-combobox", FontSizeCombobox)

declare global {
  interface HTMLElementTagNameMap { "font-size-combobox": FontSizeCombobox }
}
