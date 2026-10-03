import {css, html} from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {EditingControls} from "./editing-controls"
import type {RibbonMenuGroup} from "./ribbon-menu"
import type {RibbonDrawer} from "./ribbon-drawer"

export type DeveloperConsoleTab = "HTML" | "Packages" | "Tests"
const tabs: DeveloperConsoleTab[] = ["Packages", "Tests", "HTML"]

/** Bottom console reusing the package editor's command and input contracts. */
export class DeveloperConsole extends EditingControls {
  static properties = {
    ...EditingControls.properties,
    tab: {type: String},
    htmlPending: {type: Boolean, attribute: "html-pending"},
    pinned: {type: Boolean},
    autoReload: {type: Boolean},
  }

  static styles = css`
    ${EditingControls.styles}
    :host {box-sizing: border-box; display: grid; position: relative; grid-template-rows: auto minmax(0, 1fr); height: 300px; min-width: 0; color: #2f3742; background: #e9e9e9; border-top: 1px solid #c8c8c8; font-family: system-ui, sans-serif}
    [role="tabpanel"] {grid-row: 2; min-height: 0; overflow: auto}
    #console-panel-HTML, #console-panel-Packages, #console-panel-Tests {overflow: hidden}
    ::slotted(.html-source-editor) {height: 100%}
    header {display: flex; flex-wrap: wrap; background: #e9e9e9; align-items: center; gap: .5rem; padding: 0; border-bottom: 1px solid #c8c8c8}
    [role="tablist"] {display: flex; gap: .25rem; padding: .25rem .65rem}
    button {font: inherit; font-size: .8rem; color: inherit; background: transparent; border: 1px solid transparent; border-radius: .25rem; padding: .3rem .6rem; cursor: pointer}
    button:hover:not(:disabled) {background: #e3e3e3}
    button:focus-visible {outline: 2px solid #5267df; outline-offset: 1px}
    button:disabled {opacity: .5; cursor: default}
    [role="tab"][aria-selected="true"] {color: #155e9b; background: #e0ebf8}
    .auto-reload {display: inline-flex; align-items: center; gap: .3rem; margin-left: auto; padding: .25rem .65rem; font-size: .75rem; white-space: nowrap}
    .console-pin {display: inline-flex; align-items: center; justify-content: center; margin-right: .4rem}
    .console-pin svg {width: 15px; height: 15px}
    .console-pin[aria-pressed="true"] {color: #153b5c; background: #dbe7f2}
    .actions {display: flex; align-items: center; gap: .25rem}
    .actions svg {width: 1rem; height: 1rem}
    .package-content {display: grid; grid-template-columns: 14rem minmax(0, 1fr); height: 100%; min-height: 0}
    .local-packages-drawer {display: grid; grid-template-rows: minmax(0, 1fr) auto auto; min-height: 0; border-right: 1px solid #c8c8c8; background: #e9e9e9}
    .local-package-list {min-height: 0; overflow: auto; scrollbar-width: thin; padding: .35rem}
    .local-package-list ul {list-style: none; margin: 0; padding: 0; display: grid; gap: .15rem}
    .local-package-item {display: flex; flex-direction: column; align-items: stretch; gap: .2rem; width: 100%; text-align: left; padding: .5rem}
    .local-package-item[aria-pressed="true"] {color: #153b5c; background: #dbe7f2}
    .local-package-name {overflow-wrap: anywhere; font-size: .75rem}
    .local-package-version {font-size: .65rem; color: #667085}
    .local-package-actions {box-sizing: border-box; padding: .35rem .65rem; border-top: 1px solid #c8c8c8}
    .local-packages-drawer > .package-status {padding: .35rem .65rem}
    ribbon-drawer[layout="metadata"] {container: package-details / inline-size; height: 100%; overflow: auto; scrollbar-width: thin}
    .develop-fields {display: grid; grid-template-columns: minmax(0, 1fr); align-items: start}
    @container package-details (min-width: 36rem) {
      .develop-fields {grid-template-columns: repeat(2, minmax(0, 1fr))}
      .develop-secondary-column {display: grid; gap: .9rem; min-width: 0}
      .develop-fields > .develop-section, .develop-secondary-column {position: sticky; top: var(--column-sticky-top, 0px)}
    }
    @container package-details (min-width: 56rem) {
      .develop-fields {grid-template-columns: repeat(3, minmax(0, 1fr))}
      .develop-secondary-column {display: contents; position: static}
      .develop-secondary-column > .develop-section {position: sticky; top: var(--column-sticky-top, 0px)}
    }
    ribbon-drawer {min-width: 0; width: 100%}
    .test-content {padding: .65rem; user-select: text; overflow: auto; scrollbar-width: thin}
    .test-content .develop-section {max-width: 50rem}
    [hidden] {display: none !important}
    @media (max-width: 600px) {.package-content {grid-template-columns: minmax(7rem, 30%) minmax(0, 1fr)}}
  `

  tab: DeveloperConsoleTab = "Packages"
  autoReload = true
  pinned = false
  htmlPending = false
  private columnObserver: ResizeObserver | undefined
  disconnectedCallback() {
    this.columnObserver?.disconnect()
    super.disconnectedCallback()
  }

  protected get currentMenuGroups(): RibbonMenuGroup[] { return [] }

  private selectTab(tab: DeveloperConsoleTab) {
    if(this.htmlPending || tab === this.tab) return
    const accepted = this.dispatchEvent(new CustomEvent("developer-console-tab-change", {
      detail: {tab}, bubbles: true, composed: true, cancelable: true,
    }))
    if(accepted) this.tab = tab
  }

  private handleTabKeydown(event: KeyboardEvent) {
    const index = tabs.indexOf(this.tab)
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1
    if(next < 0 || this.htmlPending) return
    event.preventDefault()
    this.selectTab(tabs[next])
    if(this.tab === tabs[next]) this.renderRoot.querySelector<HTMLButtonElement>(`#console-tab-${tabs[next]}`)?.focus()
  }

  private observePackageColumns() {
    this.columnObserver?.disconnect()
    const drawer = this.renderRoot.querySelector<HTMLElement>('ribbon-drawer[layout="metadata"]')
    if(!drawer) return
    const columns = Array.from(drawer.querySelectorAll<HTMLElement>(".develop-section, .develop-secondary-column"))
    const update = () => {
      // Tall columns scroll until their bottom fits; shorter columns stay visible.
      for(const column of columns) {
        column.style.setProperty("--column-sticky-top", `${Math.min(0, drawer.clientHeight - column.offsetHeight - 8)}px`)
      }
    }
    // Capture the current package's elements after each render.
    this.columnObserver = new ResizeObserver(update)
    this.columnObserver.observe(drawer)
    columns.forEach(column => this.columnObserver!.observe(column))
    update()
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    this.observePackageColumns()
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer").forEach(drawer => {
      drawer.collapsed = false
      drawer.pane = true
    })
  }

  protected render() {
    const pkg = this.selectedLocalPackage
    return html`
      <header>
        ${this.htmlPending ? html`<div class="actions">
            <button class="html-source-action discard" @click=${() => this.dispatchEvent(new Event("html-source-discard", {bubbles: true, composed: true}))}>Discard</button>
            <button class="html-source-action apply" @click=${() => this.dispatchEvent(new Event("html-source-apply", {bubbles: true, composed: true}))}>Apply</button>
        </div>` : ""}
        <div role="tablist" aria-label="Developer console" @keydown=${this.handleTabKeydown}>
          ${tabs.map(tab => html`<button type="button" role="tab" id=${`console-tab-${tab}`}
            aria-controls=${`console-panel-${tab}`} aria-selected=${this.tab === tab}
            tabindex=${this.tab === tab ? 0 : -1} ?disabled=${this.htmlPending && this.tab !== tab}
            @click=${() => this.selectTab(tab)}>${tab}</button>`)}
        </div>
        <label class="auto-reload">
          <input type="checkbox" .checked=${this.autoReload}
            @change=${(event: Event) => this.dispatchEvent(new CustomEvent("developer-console-auto-reload-change", {detail: {enabled: (event.currentTarget as HTMLInputElement).checked}, bubbles: true, composed: true}))}
          />Auto-reload
        </label>
        <button class="console-pin" type="button" aria-label=${this.pinned ? "Unpin developer console" : "Pin developer console"}
          title=${this.pinned ? "Unpin developer console" : "Pin developer console"} aria-pressed=${this.pinned}
          @click=${() => this.dispatchEvent(new CustomEvent("developer-console-pin-change", {detail: {pinned: !this.pinned}, bubbles: true, composed: true}))}
        >${ribbonIcon("Pin")}</button>
      </header>
      <div role="tabpanel" id="console-panel-HTML" aria-labelledby="console-tab-HTML" ?hidden=${this.tab !== "HTML"}><slot></slot></div>
      <div role="tabpanel" id="console-panel-Packages" aria-labelledby="console-tab-Packages" ?hidden=${this.tab !== "Packages"}>
        ${this.tab === "Packages" ? html`<div class="package-content" @mousedown=${this.handleRibbonPointerDown}
          @focusin=${this.handleRibbonInputFocusIn} @focusout=${this.handleRibbonInputFocusOut}>${this.renderDevelopDrawer()}${this.renderMetadataDrawer()}</div>` : ""}
      </div>
      <div role="tabpanel" id="console-panel-Tests" aria-labelledby="console-tab-Tests" ?hidden=${this.tab !== "Tests"}>
        ${this.tab === "Tests" ? html`<div class="package-content" @mousedown=${this.handleRibbonPointerDown}
          @focusin=${this.handleRibbonInputFocusIn} @focusout=${this.handleRibbonInputFocusOut}>
          ${this.renderDevelopDrawer()}
          <div class="test-content">${pkg ? html`${this.renderLocalPackageChecks(pkg)}${this.renderLocalPackageTests(pkg)}
            ${!pkg.tests?.length ? html`<span class="develop-empty">No tests defined</span>` : ""}`
            : html`<span class="develop-empty">Select a package to view checks and tests</span>`}</div>
        </div>` : ""}
      </div>
    `
  }
}

if(!customElements.get("developer-console")) customElements.define("developer-console", DeveloperConsole)

declare global {
  interface HTMLElementTagNameMap {"developer-console": DeveloperConsole}
}
