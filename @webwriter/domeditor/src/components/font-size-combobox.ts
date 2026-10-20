import {css} from "lit"
import {StyleCombobox} from "./style-combobox"
import {fontSizeOptions} from "../marks"
import {connectPopup} from "./popup-position"
import {connectedComboboxStyles} from "./dropdown-content.styles"

/** Editable pixel sizes with an unfiltered list of presets. */
export class FontSizeCombobox extends StyleCombobox {
  static styles = [...StyleCombobox.styles, css`
    :host {height: 1.75rem; --metadata-combobox-height: 1.75rem;}
    .listbox {
      width: anchor-size(width);
      max-height: min(18rem, calc(100vh - 1rem));
      margin-block: -1px;
      padding: 0;
      overflow: hidden;
      border: 1px solid #a8a8a8;
      position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    }
    .option-group {max-height: min(calc(18rem - 2px), calc(100vh - 1rem - 2px)); overflow: auto;}
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
    this.renderRoot.querySelector(".control")?.removeAttribute("data-connected")
  }

  protected setOpen(open: boolean) {
    if(!open) { this.close(); return Promise.resolve() }
    const wasOpen = this.open
    const update = super.setOpen(open)
    void update.then(() => {
      this.connectDropdown()
      if(wasOpen || !this.open || !this.isConnected || this.hasInput) return
      const input = this.renderRoot.querySelector<HTMLInputElement>("input")!
      input.focus()
      input.select()
    })
    return update
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    this.connectDropdown()
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
