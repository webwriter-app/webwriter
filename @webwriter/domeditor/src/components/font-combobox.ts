import {css, html} from "lit"
import {StyleCombobox} from "./style-combobox"
import type {ComboboxOption} from "./editor-combobox"
import {fontFamilyOptions} from "../marks"
import {bunnyFonts, bunnyFontStylesheet, bunnyFontValue, fontFamilies, type BunnyFont} from "../fonts"
import {connectPopup} from "./popup-position"
import {connectedComboboxStyles} from "./dropdown-content.styles"

const standardFontOptions: readonly ComboboxOption[] = fontFamilyOptions.map(option => ({...option, group: "Standard fonts"}))

/** The font picker shares selection, keyboard navigation and popup behavior. */
export class FontCombobox extends StyleCombobox {
  static properties = {...StyleCombobox.properties, loading: {state: true}, failed: {state: true}}
  static styles = [...StyleCombobox.styles, css`
    .listbox {grid-template-columns: max-content minmax(0, 1fr); width: min(18rem, calc(100vw - 1rem)); overflow: hidden; margin-block: -1px; border: 1px solid #a8a8a8; position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;}
    .option-group {display: flex; flex-direction: column; overflow: auto; max-height: min(22rem, calc(100dvh - 4rem));}
    .option-group + .option-group {contain: size; border-left: 1px solid #d8dee6;}
    .group-label {position: sticky; top: 0; flex: none; margin: 0; padding: .5rem .4rem; background: #fff;}
    .option {flex: none; width: 100%; min-height: 1.75rem;}
    .option-name {padding: .35rem; font-size: .68rem; white-space: normal;}
  `, connectedComboboxStyles]

  options = standardFontOptions
  placeholder = "Default font"
  persistent = false
  private fonts: BunnyFont[] = []
  private query = ""
  private hasInput = false
  private loaded = false
  private loading = false
  private failed = false

  protected displayedValue() {
    return this.value ? super.displayedValue() : ""
  }

  protected selectedOption() {
    const family = fontFamilies(this.value)[0]
    const option = this.options.find(option => fontFamilies(option.value)[0] === family)
    if(option) return option
    const font = this.fonts.find(font => font.familyName.toLocaleLowerCase("en") === family)
    return font ? {label: font.familyName, value: bunnyFontValue(font)} : undefined
  }

  protected filteredOptions() {
    if(!this.query) return this.options
    const rank = (option: ComboboxOption) => {
      const label = option.label.toLocaleLowerCase("en")
      return label === this.query ? 0 : label.startsWith(this.query) ? 1 : 2
    }
    const matches = this.options.filter(option => option.label.toLocaleLowerCase("en").includes(this.query))
    return ["Standard fonts", "Custom fonts"].flatMap(group => matches.filter(option => option.group === group)
      .sort((a, b) => rank(a) - rank(b)))
  }

  private highlightBestMatch() {
    const options = this.filteredOptions()
    const customIndex = options.findIndex(option => option.group === "Custom fonts")
    this.activeIndex = this.query && options.length ? Math.max(0, customIndex) : -1
    if(this.activeIndex >= 0) this.revealActiveOption()
  }

  private revealActiveOption() {
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector("[data-active]")?.scrollIntoView?.({block: "nearest"})
    })
  }

  protected optionGroups(options: readonly ComboboxOption[]) {
    const groups = super.optionGroups(options)
    return new Map(["Standard fonts", "Custom fonts"].map(group => [group, groups.get(group) ?? []]))
  }

  protected renderEmptyOptions(group: string) {
    const message = group === "Custom fonts" && this.loading ? "Loading fonts…"
      : group === "Custom fonts" && this.failed ? "Could not load fonts. Reopen to retry." : "No matching fonts"
    return html`<span class="option-name" role="status">${message}</span>`
  }

  protected handleInput(event: InputEvent) {
    this.hasInput = true
    this.query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase("en")
    super.handleInput(event)
    this.highlightBestMatch()
  }

  protected handleInputClick() {
    super.handleInputClick()
    if(!this.hasInput) this.renderRoot.querySelector<HTMLInputElement>("input")?.select()
  }

  protected commitDraft() {
    const draft = this.renderRoot.querySelector<HTMLInputElement>("input")?.value.trim().toLocaleLowerCase("en") ?? ""
    if(!draft) { this.close(true); return }
    const option = this.options.find(option => option.label.toLocaleLowerCase("en") === draft || option.value.toLocaleLowerCase("en") === draft)
    if(option) this.select(option)
    else this.close(true)
  }

  protected emit(value: string) {
    if(this.disabled) return
    const font = this.fonts.find(font => bunnyFontValue(font) === value)
    // Ribbon listeners consume the stylesheet together with the authored stack.
    this.dispatchEvent(new CustomEvent("font-change", {
      detail: {value, ...(font ? {fontStylesheet: bunnyFontStylesheet(font)} : {})}, bubbles: true, composed: true,
    }))
    super.emit(value)
  }

  close(reset = true) {
    this.query = ""
    this.hasInput = false
    super.close(reset)
    this.options = standardFontOptions
    this.renderRoot.querySelector(".control")?.removeAttribute("data-connected")
  }

  protected handleKeydown(event: KeyboardEvent) {
    if(this.disabled || event.isComposing) return
    const input = this.renderRoot.querySelector<HTMLInputElement>("input")!
    if(event.key === "Enter" && !input.value.trim()) {
      event.preventDefault()
      this.commitDraft()
      input.blur()
      return
    }
    if(event.key === "Tab" && !event.shiftKey && this.open && this.query) {
      const best = this.filteredOptions().find(option => option.group === "Custom fonts")
      if(best && input.value !== best.label) {
        event.preventDefault()
        input.value = best.label
        input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true, inputType: "insertReplacementText"}))
        input.setSelectionRange(best.label.length, best.label.length)
        return
      }
    }
    super.handleKeydown(event)
    if(event.key === "ArrowDown" || event.key === "ArrowUp") this.revealActiveOption()
  }

  protected setOpen(open: boolean) {
    if(!open) { this.close(); return Promise.resolve() }
    const wasOpen = this.open
    const update = super.setOpen(open)
    void update.then(() => this.connectDropdown())
    if(this.open && !wasOpen) {
      const selectInput = !this.hasInput
      if(selectInput) { this.query = ""; this.activeIndex = -1 }
      void this.loadFonts()
      void update.then(() => {
        if(!this.open || !this.isConnected || !selectInput || this.hasInput) return
        const input = this.renderRoot.querySelector<HTMLInputElement>("input")!
        input.focus()
        input.select()
      })
    }
    else if(!this.open) this.options = standardFontOptions
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

  private populateOptions() {
    if(!this.open || !this.isConnected) return
    this.options = [...standardFontOptions,
      ...this.fonts.map(font => ({label: font.familyName, value: bunnyFontValue(font), group: "Custom fonts"}))]
    this.highlightBestMatch()
  }

  private async loadFonts() {
    if(this.loaded) { this.populateOptions(); return }
    if(this.loading) return
    this.loading = true
    this.failed = false
    try {
      this.fonts = await bunnyFonts()
      this.loaded = true
      this.populateOptions()
    }
    catch { this.failed = true }
    finally { this.loading = false }
  }
}

if(!customElements.get("font-combobox")) customElements.define("font-combobox", FontCombobox)

declare global {
  interface HTMLElementTagNameMap { "font-combobox": FontCombobox }
}
