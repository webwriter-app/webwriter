import {LitElement, css, html, nothing} from "lit"
import type {ElementStyleState} from "../editor-bridge"
import {documentThemeProperties, documentThemeStorageKey, loadDocumentThemes} from "../document-theme-options"
import {createAnchorPositioner} from "../anchor-positioning.js"
import {connectPopup, popupAnchorCSS} from "./popup-position"
import {connectedComboboxStyles} from "./dropdown-content.styles"
import {ribbonIcon} from "../ribbon-icons"
import {defaultThemeAccents, safeCssColor, themeAccentProperties} from "../css-color"

/** Browser-local document theme presets, accessible from the Style options row. */
export class DocumentThemePresets extends LitElement {
  static properties = {state: {attribute: false}, selectOnly: {type: Boolean, attribute: "select-only", reflect: true}, disabled: {type: Boolean}, open: {type: Boolean, reflect: true}, saving: {state: true}, error: {state: true}}
  static styles = css`
    :host { display: inline-flex; color: #526b86; font: .68rem/1.2 system-ui, sans-serif; }
    .icon { display: grid; place-items: center; box-sizing: border-box; width: 1.35rem; height: 1.35rem; padding: .15rem; border: 0; border-radius: .2rem; background: transparent; color: inherit; cursor: pointer; }
    .icon:hover, .icon[aria-expanded="true"] { background: #dce7f2; }
    .icon:focus-visible { outline: 2px solid #3977c7; }
    .icon svg { width: 1.15rem; height: 1.15rem; }
    :host([select-only]) .trigger { display: inline-flex; align-items: center; gap: .3rem; width: auto; min-width: 5.8rem; padding: .15rem .35rem; border: 1px solid #c5ccd5; border-radius: 4px; background: transparent; }
    :host([select-only]) .trigger:hover:not(:disabled) { background: #e8eef5; }
    :host([select-only]) .trigger[aria-expanded="true"] { background: #fff; }
    :host([select-only]) .trigger:active:not(:disabled) { background: #dce7f2; }
    :host([select-only]) .trigger:disabled { opacity: .5; cursor: default; }
    .chevron { flex: none; align-self: center; width: .3rem; height: .3rem; margin: -.15rem 0 0 auto; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(45deg); }
    .trigger[aria-expanded="true"] .chevron { margin-top: .15rem; transform: rotate(225deg); }
    .popup { position: fixed; inset: auto; box-sizing: border-box; width: 13rem; max-width: calc(100vw - 1rem); max-height: min(20rem, calc(100dvh - 1rem)); overflow: auto; padding: .45rem; margin: 0; border: 1px solid #c5ccd5; border-radius: 4px; background: white; color: #2f3742; box-shadow: 0 3px 8px #0002; font: inherit; }
    .heading { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .2rem; }
    .popup h3 { margin: 0; font: 600 .7rem/1.3 system-ui, sans-serif; }
    .heading .icon svg { width: 1rem; height: 1rem; }
    .theme { display: flex; align-items: center; gap: .2rem; }
    .theme button { border: 0; border-radius: 3px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    .theme button:hover { background: #e8eef5; }
    .theme .apply { flex: 1; min-width: 0; padding: .4rem; text-align: left; overflow-wrap: anywhere; }
    .theme-preview { display: flex; align-items: stretch; gap: .3rem; margin-top: .3rem; height: 1rem; }
    .theme-ribbon { display: flex; flex: 1; min-width: 0; overflow: hidden; border-radius: 2px; }
    .theme-ribbon span { flex: 1; min-width: 0; }
    .theme-text { display: grid; place-items: center; min-width: 1.7rem; padding: 0 .15rem; border: 1px solid #c5ccd5; border-radius: 2px; font-weight: 700; }
    .theme .delete { width: 1.7rem; height: 1.7rem; }
    .empty, .error { margin: .4rem 0; }
    .empty { color: #7a8795; }
    .customize { display: block; width: 100%; margin-top: .3rem; padding: .5rem .4rem .2rem; border: 0; border-top: 1px solid #d8dee6; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .customize:hover { background: #e8eef5; }
    .error { color: #b42318; }
    form { display: grid; gap: .4rem; margin: .3rem 0 .5rem; }
    input, .save { box-sizing: border-box; min-width: 0; min-height: 1.7rem; padding: .25rem .4rem; border: 1px solid #c5ccd5; border-radius: 4px; color: inherit; font: inherit; }
    .save { justify-self: end; background: #f7f7f7; cursor: pointer; }
    ${connectedComboboxStyles}
    :host([select-only]) { --connected-popup-border-color: #c5ccd5; }
    :host([select-only][open]) .trigger[data-connected] { border: 1px solid #c5ccd5; border-bottom-color: #fff; border-radius: 4px 4px 0 0; }
    :host([select-only][open]) .trigger[data-connected="above"] { border-top-color: #fff; border-bottom-color: #c5ccd5; border-radius: 0 0 4px 4px; }
  `
  state!: ElementStyleState
  selectOnly = false
  disabled = false
  private open = false
  private saving = false
  private error = ""
  private anchorPositioner = createAnchorPositioner(document)
  private popupObserver: ResizeObserver | null = null
  private refresh = () => this.requestUpdate()
  private reconnect = () => {
    const trigger = this.renderRoot.querySelector<HTMLElement>(".trigger")
    const popup = this.renderRoot.querySelector<HTMLElement>(".popup")
    if(this.selectOnly && this.open && trigger && popup) connectPopup(trigger, popup, "4px")
  }
  private dismiss = (event: PointerEvent) => { if(this.open && !event.composedPath().includes(this)) this.close() }
  private keydown = (event: KeyboardEvent) => {
    if(event.key !== "Escape" || !this.open) return
    event.preventDefault()
    if(this.saving) {
      this.saving = false
      this.error = ""
      void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(".heading .icon")?.focus())
      return
    }
    this.close()
    this.renderRoot.querySelector<HTMLButtonElement>(".trigger")?.focus()
  }
  connectedCallback() {
    super.connectedCallback()
    this.ownerDocument.addEventListener("pointerdown", this.dismiss, true)
    this.ownerDocument.addEventListener("keydown", this.keydown)
    this.ownerDocument.defaultView?.addEventListener("storage", this.refresh)
    this.ownerDocument.defaultView?.addEventListener("resize", this.reconnect)
  }
  disconnectedCallback() {
    this.close()
    this.anchorPositioner.destroy()
    this.ownerDocument.removeEventListener("pointerdown", this.dismiss, true)
    this.ownerDocument.removeEventListener("keydown", this.keydown)
    this.ownerDocument.defaultView?.removeEventListener("storage", this.refresh)
    this.ownerDocument.defaultView?.removeEventListener("resize", this.reconnect)
    super.disconnectedCallback()
  }
  private close() {
    this.popupObserver?.disconnect()
    this.popupObserver = null
    const popup = this.renderRoot?.querySelector<HTMLElement>(".popup")
    if(popup) { popup.hidePopover?.(); this.anchorPositioner.release(popup) }
    this.renderRoot?.querySelector<HTMLElement>(".trigger")?.removeAttribute("data-connected")
    this.open = false
    this.saving = false
    this.error = ""
  }
  private async toggle() {
    if(this.disabled) return
    if(this.open) { this.close(); return }
    this.open = true
    await this.updateComplete
    if(!this.open || !this.isConnected) return
    const popup = this.renderRoot.querySelector<HTMLElement>(".popup")!
    const trigger = this.renderRoot.querySelector<HTMLElement>(".trigger")!
    popup.showPopover?.()
    this.anchorPositioner.bind(popup, trigger, popupAnchorCSS(this.selectOnly ? -1 : 4))
    this.anchorPositioner.refresh()
    if(this.selectOnly) {
      this.reconnect()
      const Observer = this.ownerDocument.defaultView?.ResizeObserver
      if(Observer) {
        this.popupObserver = new Observer(this.reconnect)
        this.popupObserver.observe(trigger)
        this.popupObserver.observe(popup)
      }
    }
  }
  private async beginSave() {
    this.saving = true
    this.error = ""
    await this.updateComplete
    this.renderRoot.querySelector<HTMLInputElement>("#theme-name")?.focus()
  }
  private write(themes: ReturnType<typeof loadDocumentThemes>) {
    try { localStorage.setItem(documentThemeStorageKey, JSON.stringify(themes)); this.error = ""; this.requestUpdate(); return true }
    catch { this.error = "Could not save themes in browser storage."; return false }
  }
  private save(event: Event) {
    event.preventDefault()
    const name = this.renderRoot.querySelector<HTMLInputElement>("#theme-name")!.value.trim()
    if(!name) { this.error = "Enter a theme name."; return }
    const styles = Object.fromEntries(documentThemeProperties.flatMap(property => {
      const declaration = this.state.inline[property]
      return declaration ? [[property, declaration]] : []
    }))
    if(this.write([...loadDocumentThemes().filter(theme => theme.name !== name), {name, styles}])) {
      this.saving = false
      void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(".heading .icon")?.focus())
    }
  }
  render() {
    const themes = loadDocumentThemes()
    return html`<button type="button" class=${this.selectOnly ? "icon trigger control" : "icon trigger"} aria-label="Choose theme" title="Choose theme" aria-haspopup="dialog" ?disabled=${this.disabled} aria-expanded=${String(this.open)} @click=${this.toggle}>${ribbonIcon("Brush")}${this.selectOnly ? html`<span>Theme</span><span class="chevron" aria-hidden="true"></span>` : nothing}</button>
    ${this.open ? html`<div class=${this.selectOnly ? "popup listbox" : "popup"} popover="manual" role="dialog" aria-label="Saved themes">
      ${this.selectOnly ? nothing : html`<div class="heading"><h3>Saved themes</h3><button type="button" class="icon" aria-label="Save theme" title="Save theme" @click=${this.beginSave}>${ribbonIcon("Save")}</button></div>`}
      ${this.saving ? html`<form @submit=${this.save}>
          <input id="theme-name" aria-label="Theme name" placeholder="Theme name" autocomplete="off">
          <button type="submit" class="save">Save</button>
        </form>` : nothing}
        ${themes.length ? themes.map(theme => html`<div class="theme">
          <button type="button" class="apply" @click=${() => {
            this.dispatchEvent(new CustomEvent(this.selectOnly ? "document-theme-apply" : "element-style-change", {detail: {styles: Object.fromEntries(documentThemeProperties.map(property => [property, theme.styles[property] ?? null]))}, bubbles: true, composed: true}))
            this.close()
          }}><span>${theme.name}</span><span class="theme-preview" aria-hidden="true"><span class="theme-ribbon">${themeAccentProperties.map((name, index) => html`<span style=${`background:${safeCssColor(theme.styles[name]?.value, defaultThemeAccents[index])}`}></span>`)}</span><span class="theme-text" style=${`color:${safeCssColor(theme.styles["--ww-text-color"]?.value, "#2f3742")};background:${safeCssColor(theme.styles["background-color"]?.value, "#ffffff")}`}>Aa</span></span></button>
          <button type="button" class="delete" aria-label=${`Delete ${theme.name}`} title=${`Delete ${theme.name}`} @click=${() => this.write(themes.filter(item => item.name !== theme.name))}>×</button>
        </div>`) : html`<p class="empty">No saved themes</p>`}
      ${this.selectOnly ? html`<button type="button" class="customize" @click=${() => {
        this.close()
        this.dispatchEvent(new CustomEvent("document-theme-customize", {bubbles: true, composed: true}))
      }}>Make your own theme</button>` : nothing}
      ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
    </div>` : nothing}`
  }
}
if(!customElements.get("document-theme-presets")) customElements.define("document-theme-presets", DocumentThemePresets)
