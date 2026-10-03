import {css, html} from "lit"
import {keyed} from "lit/directives/keyed.js"
import {ribbonIcon} from "../ribbon-icons"
import {DocumentHeadCombobox} from "./document-head-editor"
import {EditingControls} from "./editing-controls"
import type {WebWriterPackage} from "../packages"
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
    packageDraft: {attribute: false},
    packageSaving: {type: Boolean, attribute: false},
    packageDraftRevision: {type: Number, attribute: false},
  }

  static styles = css`
    ${EditingControls.styles}
    :host {box-sizing: border-box; display: grid; position: relative; grid-template-columns: 14rem minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 300px; min-width: 0; color: #2f3742; background: #e9e9e9; border-top: 1px solid #c8c8c8; font-family: system-ui, sans-serif}
    [role="tabpanel"] {grid-column: 2; grid-row: 2; min-width: 0; min-height: 0; overflow: auto}
    #console-panel-HTML, #console-panel-Packages, #console-panel-Tests {overflow: hidden}
    ::slotted(.html-source-editor) {height: 100%}
    header {grid-column: 2; grid-row: 1; min-width: 0; display: flex; flex-wrap: wrap; background: #e9e9e9; align-items: center; gap: .5rem; padding: 0; border-bottom: 1px solid #c8c8c8}
    [role="tablist"] {display: flex; gap: .25rem; padding: .25rem .65rem}
    button {font: inherit; font-size: .8rem; color: inherit; background: transparent; border: 1px solid transparent; border-radius: .25rem; padding: .3rem .6rem; cursor: pointer}
    button:hover:not(:disabled) {background: #e3e3e3}
    button:focus-visible {outline: 2px solid #5267df; outline-offset: 1px}
    button:disabled {opacity: .5; cursor: default}
    [role="tab"][aria-selected="true"] {color: #155e9b; background: #e0ebf8}
    [role="tab"] {position: relative}
    .issue-count {position: absolute; top: -.2rem; right: -.25rem; min-width: .85rem; padding: .05rem .2rem; border-radius: 1rem; color: white; background: #a34521; font-size: .6rem; line-height: .85rem; text-align: center}
    .auto-reload {display: inline-flex; align-items: center; justify-content: center; margin-left: auto; margin-right: .4rem}
    .auto-reload > svg {width: 18px; height: 18px}
    .console-pin {display: inline-flex; align-items: center; justify-content: center; margin-right: .4rem}
    .console-pin > svg {width: 15px; height: 15px}
    .console-pin[aria-pressed="true"] {color: #153b5c; background: #dbe7f2}
    .actions {display: flex; align-items: center; gap: .25rem}
    .actions svg {width: 1rem; height: 1rem}
    .package-sidebar {grid-column: 1; grid-row: 1 / -1; min-width: 0; min-height: 0}
    .package-sidebar[inert] {filter: grayscale(1); opacity: .5}
    .package-content {height: 100%; min-height: 0}
    #console-panel-Packages {position: relative}
    .package-content:has(+ .package-pending-bar) .develop-fields {padding-bottom: calc(.35rem + var(--package-pending-height, 3rem))}
    .package-pending-bar {position: absolute; z-index: 2; bottom: 0; left: 0; right: 0; display: flex; align-items: center; gap: .5rem; padding: .45rem .65rem; border-top: 1px solid #9bbbd6; background: rgb(219 231 242 / 85%); backdrop-filter: blur(4px); font-size: .75rem}
    .package-pending-bar span {margin-right: auto}
    .package-pending-bar button {border-color: #9bbbd6; background: rgb(255 255 255 / 55%)}
    .package-changes-dialog {padding: 1rem; border: 1px solid #bac5d3; border-radius: .4rem; color: inherit; background: #e9e9e9; max-width: min(28rem, calc(100vw - 3rem))}
    .package-changes-dialog::backdrop {background: #0004}
    .package-changes-dialog p {font-size: .85rem}
    .package-changes-dialog .actions {justify-content: flex-end}
    .local-packages-drawer {display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; height: 100%; min-height: 0; border-right: 1px solid #c8c8c8; background: #e9e9e9}
    .local-package-list {min-width: 0; min-height: 0; overflow: auto; scrollbar-width: thin; padding: .35rem}
    .local-package-list li {position: relative; min-width: 0; --package-item-background: #e9e9e9}
    .local-package-list li:has(.local-package-item[aria-pressed="true"]) {--package-item-background: #dbe7f2}
    .local-package-list li:has(.local-package-item:hover:not(:disabled)) {--package-item-background: #e3e3e3}
    .local-package-list ul {list-style: none; margin: 0; padding: 0; display: grid; gap: .15rem}
    .local-package-item {display: flex; flex-direction: column; align-items: stretch; gap: .2rem; width: 100%; text-align: left; padding: .5rem 1.9rem .5rem 2.5rem; min-height: 3.3rem}
    .local-package-item[aria-pressed="true"] {color: #153b5c; background: #dbe7f2}
    .local-package-name {overflow-wrap: anywhere; font-size: .75rem}
    .local-package-version {font-size: .65rem; color: #667085}
    .local-package-refresh, .local-package-source, .local-package-remove, .local-package-icon {position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 1.35rem; height: 1.35rem; padding: .15rem; color: #536779}
    .local-package-refresh {right: .2rem; bottom: .15rem}
    .package-refresh-spinner {box-sizing: border-box; width: .85rem; height: .85rem; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: var(--ww-ui-animation, package-refresh-spin .8s linear infinite)}
    @keyframes package-refresh-spin {to {transform: rotate(360deg)}}
    @media (prefers-reduced-motion: reduce) {.package-refresh-spinner {animation: none}}
    .local-package-remove {right: .2rem; top: .15rem}
    .local-package-icon-stack {position: absolute; left: .2rem; top: 50%; transform: translateY(-50%); width: 1.65rem; height: 1.65rem}
    .local-package-icon {position: static; width: 100%; height: 100%; pointer-events: none}
    .local-package-icon > svg {color: #000}
    .local-package-source {right: -.25rem; top: -.25rem; width: 1.1rem; height: 1.1rem; border: 2px solid var(--package-item-background); border-radius: 50%; padding: 0; background: var(--package-item-background)}
    .local-package-source:focus-visible {outline: 2px solid #5267df; outline-offset: 1px}
    .local-package-refresh svg, .local-package-source svg, .local-package-remove svg, .local-package-icon svg, .local-package-icon img {width: 100%; height: 100%; object-fit: contain}
    .package-source-popup {inset: auto; margin: 0; max-width: min(28rem, calc(100vw - 16px)); padding: .45rem .65rem; border: 1px solid #b9c2cc; border-radius: .3rem; background: #fff; color: #2f3742; box-shadow: 0 3px 10px #0002; font-size: .75rem; overflow-wrap: anywhere}
    .package-source-popup span, .package-source-popup small {display: block}
    .package-source-popup small {margin-top: .25rem; color: #667085}
    .git-package-dialog {border: 1px solid #b9c2cc; border-radius: .4rem; padding: 1rem; width: min(28rem, calc(100vw - 3rem)); color: inherit; background: #e9e9e9}
    .git-package-dialog::backdrop {background: #0004}
    .git-package-dialog form, .git-package-dialog label {display: grid; gap: .35rem}
    .git-package-dialog form {gap: .8rem; font-size: .8rem}
    .git-package-dialog input {box-sizing: border-box; width: 100%; padding: .4rem; border: 1px solid #bac5d3; border-radius: .25rem; font: inherit}
    .git-package-dialog form > div {display: flex; gap: .4rem; justify-content: flex-end}
    .git-package-dialog button {border-color: #bac5d3; background: #f2f5f9}
    .develop-fields:disabled input, .develop-fields:disabled textarea, .develop-fields:disabled select {color: #667085; cursor: default}
    .local-package-actions {box-sizing: border-box; height: 2.25rem; padding: 0; border-top: 1px solid #c8c8c8}
    ribbon-drawer[layout="metadata"] {container: package-details / inline-size; height: 100%; overflow: auto; scrollbar-width: thin}
    .develop-fields {display: grid; grid-template-columns: minmax(0, 1fr); align-items: start}
    @container package-details (min-width: 36rem) {
      .develop-fields {grid-template-columns: repeat(2, minmax(0, 1fr))}
      .develop-section[aria-labelledby="develop-export-fields"] > .develop-section-title-row {transform: translateY(calc((.68rem - 1.55rem) / 2))}
      .develop-fields > .develop-section {position: sticky; top: var(--column-sticky-top, 0px)}
    }
    ribbon-drawer {min-width: 0; width: 100%}
    .test-content {box-sizing: border-box; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); align-content: start; gap: 1rem; height: 100%; padding: .65rem; user-select: text; overflow: auto; scrollbar-width: thin}
    .test-content > div {min-width: 0}
    .test-content .develop-section {min-width: 0; margin: 0}
    .package-issue {display: flex; gap: .4rem; margin-bottom: .6rem; font-size: .75rem; color: #a34521; overflow-wrap: anywhere}
    .package-issue svg {width: 1rem; height: 1rem; flex-shrink: 0}
    .develop-checklist {display: grid; gap: .35rem; padding: 0; margin: 0; list-style: none; font-size: .7rem}
    .develop-checklist li {display: flex; gap: .4rem; align-items: start; overflow-wrap: anywhere}
    .check-icon {display: inline-flex; width: 1rem; flex-shrink: 0; justify-content: center}
    .check-icon svg {width: 1rem; height: 1rem}
    .develop-checklist [data-status="passed"] .check-icon {color: #287344}
    .develop-checklist [data-status="failed"] {color: #a34521}
    .develop-checklist [data-status="pending"] {color: #667085}
    [hidden] {display: none !important}
    @media (max-width: 600px) {:host {grid-template-columns: minmax(7rem, 30%) minmax(0, 1fr)}}
  `

  tab: DeveloperConsoleTab = "Packages"
  autoReload = true
  pinned = false
  htmlPending = false
  packageDraft: Record<string, unknown> | null = null
  packageSaving = false
  packageDraftRevision = 0
  private dirtyPackageInputs = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>()
  private pendingChangesResolve?: (choice: "keep" | "discard" | "cancel") => void
  protected get selectedLocalPackage() {
    const pkg = super.selectedLocalPackage
    return pkg && this.packageDraft ? {...pkg, manifest: this.packageDraft as WebWriterPackage["manifest"]} : pkg
  }

  private get packageIssueError() {
    const pkg = this.selectedLocalPackage
    const warnings = pkg ? (this.localPackageWarnings[pkg.name] ?? []).filter(warning => warning.code !== "undefined-widget" && warning.code !== "unreflected-property") : []
    if(pkg && warnings.length) {
      const summary = warnings.some(warning => warning.code === "missing-bundle")
        ? `${pkg.label} has no bundle yet. Build the package to make its exports available.`
        : `${pkg.label}: ${warnings.map(warning => warning.message).join(" ")}`
      if(this.localPackageError === summary) return ""
    }
    return this.localPackageError
  }

  private get packageIssueCount() {
    const pkg = this.selectedLocalPackage
    let count = this.packageIssueError ? 1 : 0
    if(!pkg) return count
    count += (this.localPackageWarnings[pkg.name] ?? []).length
    for(const test of pkg.tests ?? []) {
      const result = this.localPackageTestResults[`${pkg.name}/${test.name}`]
      if(!result || result === "running") continue
      const failures = result.tests.filter(item => !item.passed).length
      count += failures || (result.status === "passed" ? 0 : 1)
    }
    return count
  }

  private handlePackageInput(event: Event) {
    const target = event.composedPath()[0]
    const input = target instanceof DocumentHeadCombobox ? target.shadowRoot?.querySelector("input") : target
    if(!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return
    if(input instanceof HTMLInputElement && input.name === "newKeyword") return
    this.dirtyPackageInputs.add(input)
    this.dispatchEvent(new Event("local-package-pending-input", {bubbles: true, composed: true}))
  }

  protected override prepareLocalPackageStructureChange(event: Event) {
    return this.flushPackageInputs(event.currentTarget as HTMLInputElement | HTMLSelectElement)
  }

  flushPackageInputs(exclude?: HTMLInputElement | HTMLSelectElement) {
    if(exclude) this.dirtyPackageInputs.delete(exclude)
    const inputs = [...this.dirtyPackageInputs].filter(input => input.isConnected)
      .sort((a, b) => Number(a.name === "exportName" || a.name === "exportType") - Number(b.name === "exportName" || b.name === "exportType"))
    for(const input of inputs) {
      if(!input.checkValidity()) {input.reportValidity(); return false}
    }
    // Stage ordinary fields before an export rename can replace their cards.
    // Clear first so the structural-change hook cannot recursively flush them.
    this.dirtyPackageInputs.clear()
    for(const input of inputs) input.dispatchEvent(new Event("change", {bubbles: true}))
    return true
  }

  async askPendingPackageChanges(): Promise<"keep" | "discard" | "cancel"> {
    await this.updateComplete
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>(".package-changes-dialog")!
    return new Promise(resolve => {
      this.pendingChangesResolve = resolve
      dialog.showModal()
    })
  }

  private finishPendingPackageChanges(choice: "keep" | "discard" | "cancel") {
    const resolve = this.pendingChangesResolve
    this.pendingChangesResolve = undefined
    this.renderRoot.querySelector<HTMLDialogElement>(".package-changes-dialog")?.close()
    resolve?.(choice)
  }
  private columnObserver: ResizeObserver | undefined
  disconnectedCallback() {
    this.pendingChangesResolve?.("cancel")
    this.pendingChangesResolve = undefined
    this.dirtyPackageInputs.clear()
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
    const columns = Array.from(drawer.querySelectorAll<HTMLElement>(".develop-section"))
    const pendingBar = this.renderRoot.querySelector<HTMLElement>(".package-pending-bar")
    const update = () => {
      const clearance = pendingBar?.offsetHeight ?? 0
      drawer.style.setProperty("--package-pending-height", `${clearance}px`)
      // Tall columns scroll until their bottom fits; shorter columns stay visible.
      for(const column of columns) {
        column.style.setProperty("--column-sticky-top", `${Math.min(0, drawer.clientHeight - clearance - column.offsetHeight - 8)}px`)
      }
    }
    // Capture the current package's elements after each render.
    this.columnObserver = new ResizeObserver(update)
    this.columnObserver.observe(drawer)
    if(pendingBar) this.columnObserver.observe(pendingBar)
    columns.forEach(column => this.columnObserver!.observe(column))
    update()
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if(changed.has("packageDraftRevision")) this.dirtyPackageInputs.clear()
    this.observePackageColumns()
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer").forEach(drawer => {
      drawer.collapsed = false
      drawer.pane = true
    })
  }

  protected render() {
    const pkg = this.selectedLocalPackage
    return html`
      <div class="package-sidebar" ?inert=${this.tab === "HTML" || this.packageSaving} aria-disabled=${this.tab === "HTML" || this.packageSaving}
        @mousedown=${this.handleRibbonPointerDown} @focusin=${this.handleRibbonInputFocusIn} @focusout=${this.handleRibbonInputFocusOut}>
        ${this.renderDevelopDrawer()}
      </div>
      <header>
        ${this.htmlPending ? html`<div class="actions">
            <button class="html-source-action discard" @click=${() => this.dispatchEvent(new Event("html-source-discard", {bubbles: true, composed: true}))}>Discard</button>
            <button class="html-source-action apply" @click=${() => this.dispatchEvent(new Event("html-source-apply", {bubbles: true, composed: true}))}>Apply</button>
        </div>` : ""}
        <div role="tablist" aria-label="Developer console" @keydown=${this.handleTabKeydown}>
          ${tabs.map(tab => html`<button type="button" role="tab" id=${`console-tab-${tab}`}
            aria-controls=${`console-panel-${tab}`} aria-selected=${this.tab === tab}
            tabindex=${this.tab === tab ? 0 : -1} ?disabled=${this.htmlPending && this.tab !== tab}
            @click=${() => this.selectTab(tab)}>${tab === "Packages" ? "Metadata" : tab === "Tests" ? "Tests & Checks" : tab}${tab === "Tests" && this.packageIssueCount ? html`<span class="issue-count" aria-label=${`${this.packageIssueCount} issues`}>${this.packageIssueCount}</span>` : ""}</button>`)}
        </div>
        <button class="auto-reload" type="button" aria-label="Auto-reload" aria-pressed=${this.autoReload}
          title=${this.autoReload ? "Disable auto-reload" : "Enable auto-reload"}
          @click=${() => this.dispatchEvent(new CustomEvent("developer-console-auto-reload-change", {detail: {enabled: !this.autoReload}, bubbles: true, composed: true}))}
        >${ribbonIcon(this.autoReload ? "AutoReload" : "AutoReloadOff")}</button>
        <button class="console-pin" type="button" aria-label=${this.pinned ? "Unpin developer console" : "Pin developer console"}
          title=${this.pinned ? "Unpin developer console" : "Pin developer console"} aria-pressed=${this.pinned}
          @click=${() => this.dispatchEvent(new CustomEvent("developer-console-pin-change", {detail: {pinned: !this.pinned}, bubbles: true, composed: true}))}
        >${ribbonIcon("Pin")}</button>
      </header>
      <div role="tabpanel" id="console-panel-HTML" aria-labelledby="console-tab-HTML" ?hidden=${this.tab !== "HTML"}><slot></slot></div>
      <div role="tabpanel" id="console-panel-Packages" aria-labelledby="console-tab-Packages" ?hidden=${this.tab !== "Packages"}>
        ${this.tab === "Packages" ? html`<div class="package-content" @mousedown=${this.handleRibbonPointerDown}
          ?inert=${this.packageSaving} @input=${this.handlePackageInput} @combobox-input=${this.handlePackageInput}
          @change=${(event: Event) => {const input = event.composedPath()[0] as HTMLInputElement; if(input.checkValidity?.()) this.dirtyPackageInputs.delete(input)}}
          @focusin=${this.handleRibbonInputFocusIn} @focusout=${this.handleRibbonInputFocusOut}>${keyed(this.packageDraftRevision, this.renderMetadataDrawer())}</div>` : ""}
        ${this.packageDraft ? html`<div class="package-pending-bar" role="group" aria-label="Pending package changes">
          <span>${this.packageSaving ? "Saving changes…" : "Pending changes"}</span>
          <button type="button" ?disabled=${this.packageSaving} @click=${() => this.dispatchEvent(new Event("local-package-changes-discard", {bubbles: true, composed: true}))}>Discard</button>
          <button type="button" ?disabled=${this.packageSaving} @click=${() => this.dispatchEvent(new Event("local-package-changes-confirm", {bubbles: true, composed: true}))}>Confirm</button>
        </div>` : ""}
      </div>
      <dialog class="package-changes-dialog" aria-labelledby="package-changes-title"
        @cancel=${(event: Event) => {event.preventDefault(); this.finishPendingPackageChanges("cancel")}}
        @close=${() => {if(this.pendingChangesResolve) this.finishPendingPackageChanges("cancel")}}>
        <strong id="package-changes-title">Pending package changes</strong>
        <p>Keep or discard your changes before continuing?</p>
        <div class="actions">
          <button type="button" @click=${() => this.finishPendingPackageChanges("cancel")}>Cancel</button>
          <button type="button" @click=${() => this.finishPendingPackageChanges("discard")}>Discard changes</button>
          <button type="button" @click=${() => this.finishPendingPackageChanges("keep")}>Keep changes</button>
        </div>
      </dialog>
      <div role="tabpanel" id="console-panel-Tests" aria-labelledby="console-tab-Tests" ?hidden=${this.tab !== "Tests"}>
        ${this.tab === "Tests" ? html`<div class="package-content" @mousedown=${this.handleRibbonPointerDown}
          @focusin=${this.handleRibbonInputFocusIn} @focusout=${this.handleRibbonInputFocusOut}>
          <div class="test-content">
            <div class="tests-column">${pkg?.tests?.length ? this.renderLocalPackageTests(pkg) : html`<section class="develop-section"><span class="develop-section-title">Tests</span><span class="develop-empty">${pkg ? "No tests defined" : "Select a package to view tests"}</span></section>`}</div>
            <div class="checks-column">
              ${this.packageIssueError ? html`<div class="package-issue" role="alert">${ribbonIcon("Reject")}<span>${this.packageIssueError}</span></div>` : ""}
              ${pkg ? this.renderLocalPackageChecks(pkg) : html`<section class="develop-section"><span class="develop-section-title">Checks</span><span class="develop-empty">Select a package to view checks</span></section>`}
            </div>
          </div>
        </div>` : ""}
      </div>
    `
  }
}

if(!customElements.get("developer-console")) customElements.define("developer-console", DeveloperConsole)

declare global {
  interface HTMLElementTagNameMap {"developer-console": DeveloperConsole}
}
