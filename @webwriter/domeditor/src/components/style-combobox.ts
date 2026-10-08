import {css, html, nothing} from "lit"
import {EditorCombobox, type ComboboxOption} from "./editor-combobox"
import {ribbonIcon} from "../ribbon-icons"

/** Shared Style drawer field for editable presets and fixed option lists. */
export class StyleCombobox extends EditorCombobox {
  static properties = {
    ...EditorCombobox.properties,
    unit: {type: String, reflect: true},
    joined: {type: Boolean, reflect: true},
    persistent: {type: Boolean},
  }

  static styles = [EditorCombobox.styles, css`
    :host {height: 1.7rem; --metadata-combobox-height: 1.7rem; --metadata-combobox-font-size: .68rem;}
    .control {border: var(--editor-control-border-width, .5px) solid #c5ccd5; border-radius: 4px;}
    :host([open]) .control {border-radius: 4px 4px 0 0;}
    :host([joined]) .control {border-top-left-radius: 0; border-bottom-left-radius: 0;}
    .control:focus-within {border-color: #c5ccd5; outline: 2px solid #b9d7f5; outline-offset: 0;}
    input {padding: .2rem .35rem;}
    input::placeholder {font-size: .5rem;}
    input[readonly] {cursor: pointer;}
    .toggle {flex: 0 0 1.7rem; width: 1.7rem; justify-content: end; padding: 0 .2rem;}
    .toggle svg {display: block; width: 14px; height: 14px; transform: rotate(90deg);}
    :host([open]) .toggle svg {transform: rotate(270deg);}
    .unit {display: flex; flex: 0 0 1.1rem; align-items: center; justify-content: center; box-sizing: border-box; border-left: var(--editor-control-border-width, .5px) solid #c5ccd5; font-size: .55rem;}
    :host([unit="deg"]) .unit {font-size: .85rem;}
    .listbox {margin: 0; padding: 0; border: var(--editor-control-border-width, .5px) solid #c5ccd5; border-top: 0; border-radius: 0 0 4px 4px; background: #fff; box-shadow: 0 3px 6px #0002;}
    .option {display: flex; justify-content: space-between; align-items: center; gap: .75rem; padding: .35rem; border-radius: 0;}
    .option-code {font: inherit; font-size: .68rem; font-weight: normal;}
    .option-name {color: #6b7787; font-variant-numeric: tabular-nums;}
    .option:hover, .option[data-active], .option[aria-selected="true"] {color: inherit; background: #e8eef5;}
  `]

  unit = ""
  joined = false
  persistent = true
  private inputFocused = false

  protected renderToggleIcon() { return ribbonIcon("ChevronRight") }

  protected renderSuffix() {
    return this.unit ? html`<span class="unit" aria-hidden="true">${this.unit === "deg" ? "°" : this.unit}</span>` : nothing
  }

  protected filteredOptions() {
    return this.showValue ? this.options : super.filteredOptions()
  }

  protected select(option: ComboboxOption, event?: Event) {
    if(this.multiple) return super.select(option, event)
    const keyboardFocus = event?.currentTarget instanceof HTMLElement && event.currentTarget.matches(":focus")
    this.emit(option.value)
    if(keyboardFocus) this.renderRoot.querySelector<HTMLInputElement>("input")?.focus()
  }

  protected blurInput(event: FocusEvent) {
    this.inputFocused = false
    if(event.relatedTarget instanceof Node && this.renderRoot.contains(event.relatedTarget)) return
    this.close()
  }

  protected handleFocus() {
    this.inputFocused = true
    super.handleFocus()
  }

  protected outsidePointerDown(event: PointerEvent) {
    const input = this.renderRoot.querySelector<HTMLInputElement>("input")
    if(!this.persistent && this.inputFocused && !event.composedPath().some(target =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      || target instanceof HTMLElement && target.isContentEditable)) input?.blur()
    super.outsidePointerDown(event)
  }

  protected handleKeydown(event: KeyboardEvent) {
    if(event.key === "Enter" && !event.isComposing && !this.persistent && this.activeIndex < 0
      && event.currentTarget instanceof HTMLInputElement) {
      event.preventDefault()
      this.commitDraft()
      event.currentTarget.blur()
      this.close()
      return
    }
    super.handleKeydown(event)
  }

  protected updated(changed: Map<string, unknown>) {
    this.toggleAttribute("popup-open", this.open)
    this.toggleAttribute("open", this.open)
    super.updated(changed)
  }

  protected emit(value: string) {
    if(this.disabled) return
    super.emit(value)
    if(!this.persistent) this.dispatchEvent(new CustomEvent("ribbon-input-commit", {
      detail: {input: this.renderRoot.querySelector("input")}, bubbles: true, composed: true,
    }))
  }

  protected cancelInput() {
    super.cancelInput()
    this.dispatchEvent(new CustomEvent("ribbon-input-cancel", {
      detail: {input: this.renderRoot.querySelector("input")}, bubbles: true, composed: true,
    }))
  }
}

if(!customElements.get("style-combobox")) customElements.define("style-combobox", StyleCombobox)

declare global {
  interface HTMLElementTagNameMap { "style-combobox": StyleCombobox }
}
