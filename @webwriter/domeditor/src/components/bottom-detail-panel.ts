import {css, html, noChange, nothing, type TemplateResult} from "lit"
import {createAnchorPositioner} from "../anchor-positioning.js"
import type {DocumentRecovery} from "../document-recovery"
import type {LocalPackageWarning} from "../local-package"
import type {PackageTestResult, WebWriterPackage} from "../packages"
import {ribbonIcon} from "../ribbon-icons"
import {EditingControls} from "./editing-controls"
import {popupAnchorCSS} from "./popup-position"
import type {RibbonMenuGroup} from "./ribbon-menu"

export class BottomDetailPanel extends EditingControls {
  static properties = {
    ...EditingControls.properties,
    mode: {type: String, reflect: true},
    activeVersionId: {state: true},
    documentRecoveries: {attribute: false},
    documentRecoveryBusy: {type: Boolean, attribute: false},
    localPackagesLoading: {type: Boolean, attribute: "local-packages-loading"},
    localPackageError: {type: String, attribute: "local-package-error"},
    selectedLocalPackageName: {type: String, attribute: "selected-local-package-name"},
    localPackageWarnings: {attribute: false},
    localPackageRuntimeWarnings: {attribute: false},
    localPackageTestResults: {attribute: false},
  }

  static styles = css`
    ${EditingControls.styles}
    :host {box-sizing: border-box; display: grid; position: relative; grid-template-columns: 14rem minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 300px; min-width: 0; color: #2f3742; background: #e9e9e9; border-top: 1px solid #c8c8c8; font-family: system-ui, sans-serif}
    .version-sidebar {grid-column: 1; grid-row: 1 / -1; display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid #c8c8c8}
    .version-list {display: grid; align-content: start; gap: .35rem; margin: 0; padding: .35rem; list-style: none; min-height: 0; overflow: auto; scrollbar-width: thin}
    .version-list li {min-width: 0}
    .version-list li[data-active] .history-version-card {border-color: #8cb5e5; background: #dbe7f2}
    .version-list .history-checkpoint {grid-template-rows: auto auto; padding-right: 1.8rem}
    .history-version-card {position: relative}
    .history-change-count {position: absolute; top: .25rem; right: .35rem; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-width: 1rem; height: 1rem; padding: 0 .2rem; border-radius: 999px; color: #fff; background: #526b86; font-size: .55rem; font-weight: 700; line-height: 1}
    .panel-content.version-changes {container-type: inline-size; overflow: auto; scrollbar-width: thin}
    .version-change-list {display: grid; align-content: start; gap: .15rem; margin: 0; padding: .35rem .65rem; list-style: none}
    .history-change-card {position: relative; display: block; min-width: 0; background: transparent; border-color: transparent; border-radius: .25rem}
    .history-change-card:hover {background: #dce5ef}
    .history-change-card[data-selected] {background: transparent; border-color: #8cb5e5}
    .history-change-card .history-checkpoint {padding: .25rem 1.6rem .25rem .25rem; grid-template-columns: 1.35rem auto auto minmax(0, 1fr); grid-template-rows: auto; align-items: center; gap: .3rem .5rem}
    .history-change-card .history-checkpoint-counts {grid-column: 4; grid-row: 1; justify-self: start; align-items: center; flex-wrap: wrap; padding-top: 0}
    .history-change-card .history-checkpoint-avatar {grid-row: 1; grid-column: 1}
    .history-change-card .history-checkpoint-label, .history-change-card .history-checkpoint-meta {min-width: 0; overflow-wrap: anywhere}
    .history-change-card .history-card-restore-button {position: absolute; top: .25rem; right: .15rem; width: 1.2rem; height: 1.2rem; padding: .2rem; border: 0; background: transparent}
    .version-empty {margin: .65rem; font-size: .75rem; color: #667085}
    .recovery-version .history-checkpoint-avatar svg {width: .85rem; height: .85rem}
    .recovery-version .history-checkpoint-label {overflow: hidden; text-overflow: ellipsis}
    .recovery-version-actions {display: flex; gap: .35rem; margin: .65rem}
    .recovery-version-actions button {border-color: #b6c2ce}
    @container (width < 400px) {
      .history-change-card .history-checkpoint {grid-template-columns: 1.35rem minmax(0, 1fr); grid-template-rows: auto auto; gap: .15rem .3rem}
      .history-change-card .history-checkpoint-counts {grid-column: 2; grid-row: 3}
      .history-change-card .history-checkpoint-avatar {grid-row: 1 / 3}
      .history-change-card .history-checkpoint-label, .history-change-card .history-checkpoint-meta {grid-column: 2; white-space: normal}
    }
    .panel-content {grid-column: 2; grid-row: 2; min-width: 0; min-height: 0; overflow: hidden}
    header {grid-column: 2; grid-row: 1; min-inline-size: 0; display: flex; align-items: center; gap: .25rem; padding-block: .25rem; padding-inline: .65rem .35rem; border-bottom: 1px solid #c8c8c8}
    .panel-heading {margin-inline-end: auto; font-size: .8rem; font-weight: 600}
    header :is(.panel-heading, .history-preview-clear, .documentation-link) {min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap}
    header :is(.history-preview-clear, .documentation-link) {flex: 0 2 auto; line-height: 1rem; padding: .1875rem .3rem}
    button {font: inherit; font-size: .8rem; color: inherit; background: transparent; border: 1px solid transparent; border-radius: .25rem; padding: .3rem .6rem; cursor: pointer}
    button:hover:not(:disabled) {background: #e3e3e3}
    button:focus-visible, .documentation-link:focus-visible {outline: 2px solid #5267df; outline-offset: 1px}
    button:disabled {opacity: .5; cursor: default}
    .panel-close {display: grid; place-items: center; flex: none; box-sizing: border-box; min-inline-size: 1.5rem; min-block-size: 1.5rem; padding: 0}
    .panel-close svg {display: block; width: .9375rem; height: .9375rem}
    .documentation-link {border-radius: .25rem; color: #155e9b; font-size: .8rem; text-underline-offset: .2em}
    .documentation-link:hover {background: #e3e3e3}
    .package-sidebar {grid-column: 1; grid-row: 1 / -1; min-width: 0; min-height: 0}
    .local-packages-drawer {display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: 100%; min-height: 0; border-right: 1px solid #c8c8c8; background: #e9e9e9}
    .local-package-list {min-width: 0; min-height: 0; overflow: auto; scrollbar-width: thin; padding: .35rem}
    .local-package-list li {position: relative; min-width: 0; --package-item-background: #e9e9e9}
    .local-package-list li:has(.local-package-item[aria-pressed="true"]) {--package-item-background: #dbe7f2}
    .local-package-list li:has(.local-package-item:hover:not(:disabled)) {--package-item-background: #e3e3e3}
    .local-package-list ul {list-style: none; margin: 0; padding: 0; display: grid; gap: .15rem}
    .local-package-item {display: flex; align-items: center; gap: .25rem; width: 100%; min-height: 2.35rem; padding: .2rem .35rem .2rem 2.15rem; text-align: left; font-size: .75rem}
    .local-package-item[aria-pressed="true"] {color: #153b5c; background: #dbe7f2}
    .local-package-name, .local-package-version {min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap}
    .local-package-version {flex: none; max-width: 55%; font-size: .65rem; color: #667085}
    .local-package-source, .local-package-icon {position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #536779}
    .local-package-icon-stack {position: absolute; left: .2rem; top: 50%; transform: translateY(-50%); width: 1.45rem; height: 1.45rem}
    .local-package-icon {position: static; width: 100%; height: 100%; padding: .15rem; pointer-events: none}
    .local-package-icon > svg {color: #000}
    .local-package-source {right: -.25rem; top: -.25rem; width: 1rem; height: 1rem; border: 2px solid var(--package-item-background); border-radius: 50%; background: var(--package-item-background)}
    .local-package-source:focus-visible {outline: 2px solid #5267df; outline-offset: 1px}
    .local-package-source svg, .local-package-icon svg, .local-package-icon img {width: 100%; height: 100%; object-fit: contain}
    .package-source-popup {inset: auto; margin: 0; max-width: min(28rem, calc(100vw - 16px)); padding: .45rem .65rem; border: 1px solid #b9c2cc; border-radius: .3rem; background: #fff; color: #2f3742; box-shadow: 0 3px 10px #0002; font-size: .75rem; overflow-wrap: anywhere}
    .package-source-popup span, .package-source-popup small {display: block}
    .package-source-popup small {margin-top: .25rem; color: #667085}
    .test-content {box-sizing: border-box; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); align-content: start; gap: 1rem; height: 100%; padding: .65rem; overflow: auto; scrollbar-width: thin}
    .test-content > div {min-width: 0}
    .test-content .develop-section {min-width: 0; margin: 0}
    .package-issue {display: flex; gap: .4rem; margin-bottom: .6rem; font-size: .75rem; color: #a34521; overflow-wrap: anywhere}
    .package-issue span {white-space: pre-line}
    .package-issue svg {width: 1rem; height: 1rem; flex-shrink: 0}
    .develop-checklist {display: grid; gap: .35rem; padding: 0; margin: 0; list-style: none; font-size: .7rem}
    .develop-checklist li {display: flex; gap: .4rem; align-items: start; overflow-wrap: anywhere}
    .check-icon {display: inline-flex; width: 1rem; flex-shrink: 0; justify-content: center}
    .check-icon svg {width: 1rem; height: 1rem}
    .develop-checklist [data-status="passed"] .check-icon {color: #287344}
    .develop-checklist [data-status="failed"] {color: #a34521}
    .develop-checklist [data-status="pending"] {color: #667085}
    @media (max-width: 600px) {:host {grid-template-columns: minmax(7rem, 30%) minmax(0, 1fr)}}
  `

  mode: "versions" | "checks" | null = null
  private activeVersionId: string | null = null
  localPackagesLoading = false
  localPackageError = ""
  selectedLocalPackageName = ""
  localPackageWarnings: Record<string, LocalPackageWarning[]> = {}
  localPackageRuntimeWarnings: Record<string, LocalPackageWarning[]> = {}
  localPackageTestResults: Record<string, PackageTestResult | "running"> = {}
  private anchorPositioner: ReturnType<typeof createAnchorPositioner> | null = null

  disconnectedCallback() {
    this.anchorPositioner?.destroy()
    this.anchorPositioner = null
    super.disconnectedCallback()
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if(changed.get("mode") === "checks") {
      this.renderRoot.querySelector<HTMLElement>(".package-source-popup:popover-open")?.hidePopover()
      this.anchorPositioner?.destroy()
      this.anchorPositioner = null
    }
  }

  protected get currentMenuGroups(): RibbonMenuGroup[] { return [] }

  private get selectedLocalPackage() {
    return this.localPackages.find(pkg => pkg.name === this.selectedLocalPackageName) ?? this.localPackages[0]
  }

  private get localPackageSelectionName() {
    return this.selectedLocalPackage?.name ?? ""
  }

  private selectLocalPackageByName(name: string) {
    const accepted = this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: `local-package-select:${name}`},
      bubbles: true,
      composed: true,
      cancelable: true,
    }))
    if(accepted) this.selectedLocalPackageName = name
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

  private showPackageSource(event: Event) {
    const button = event.currentTarget as HTMLElement
    const popup = button.closest("li")?.querySelector<HTMLElement>(".package-source-popup")
    if(!popup || typeof popup.showPopover !== "function") return
    popup.showPopover()
    this.anchorPositioner ??= createAnchorPositioner(this.ownerDocument)
    this.anchorPositioner.bind(popup, button,
      `${popupAnchorCSS(4)}position-area:top span-right;justify-self:end;`)
    this.anchorPositioner.refresh()
  }

  private hidePackageSource(event: Event) {
    const button = event.currentTarget as HTMLElement
    const popup = button.closest("li")?.querySelector<HTMLElement>(".package-source-popup")
    if(popup) {
      popup.hidePopover?.()
      this.anchorPositioner?.release(popup)
    }
  }

  private renderLocalPackageList() {
    const displayPackages = this.localPackages
    return html`
      <aside class="local-packages-drawer" aria-label="Local packages">
        <nav class="local-package-list" aria-label="Choose a local package">
          <ul>
            ${displayPackages.map((pkg, index) => html`<li>
              <button type="button" class="local-package-item"
                aria-pressed=${this.localPackageSelectionName === pkg.name}
                title=${`${pkg.name} ${pkg.version}`}
                @click=${() => this.selectLocalPackageByName(pkg.name)}
              ><span class="local-package-name">${pkg.name}</span> <span class="local-package-version">${pkg.version}</span></button>
              <span class="local-package-icon-stack">
                <span class="local-package-icon" aria-hidden="true">${pkg.iconUrl ? html`<img src=${pkg.iconUrl} alt="" />` : ribbonIcon("Packages")}</span>
                <span class="local-package-source" tabindex="0" role="img" aria-label=${`Folder source of ${pkg.name}`}
                  aria-describedby=${`package-source-${index}`}
                  @mouseenter=${this.showPackageSource} @mouseleave=${this.hidePackageSource}
                  @focus=${this.showPackageSource} @blur=${this.hidePackageSource}
                >${ribbonIcon("Open")}</span>
              </span>
              <aside id=${`package-source-${index}`} class="package-source-popup" role="tooltip" popover="manual">
                ${pkg.developerSource?.path || pkg.label}
              </aside>
            </li>`)}
          </ul>
          ${!displayPackages.length ? html`<span class="package-status">${this.localPackagesLoading ? "Loading packages…" : "No local packages"}</span>` : ""}
        </nav>
      </aside>
    `
  }

  private renderLocalPackageChecks(pkg: WebWriterPackage) {
    const warnings = this.localPackageWarnings[pkg.name] ?? []
    const loaded = Boolean(pkg.manifest && Object.hasOwn(this.localPackageWarnings, pkg.name))
    const runtimeChecked = Object.hasOwn(this.localPackageRuntimeWarnings, pkg.name)
    const checks: {label: string, codes: LocalPackageWarning["code"][], checked: boolean}[] = [
      {label: "Package metadata loaded", codes: [], checked: loaded},
      {label: "Widget or snippet bundle available", codes: ["missing-bundle"], checked: loaded},
      {label: "Configured exports available", codes: ["missing-export", "invalid-export"], checked: loaded},
      {label: "Editing configuration readable", codes: ["editing-config-unavailable", "invalid-editing-config"], checked: loaded},
      {label: "Editing options valid", codes: ["unknown-editing-option", "invalid-editing-option"], checked: loaded},
      {label: "Editing entries match exports", codes: ["unmatched-editing-config"], checked: loaded},
      {label: "Widget definitions valid", codes: ["invalid-widget"], checked: loaded},
      ...pkg.members.some(member => member.kind === "widget") ? [
        {label: "Widgets registered", codes: ["undefined-widget" as const], checked: runtimeChecked},
        {label: "Widget properties reflect to attributes", codes: ["unreflected-property" as const], checked: runtimeChecked},
      ] : [],
    ]
    return html`
      <section class="develop-section" aria-labelledby="develop-check-fields">
        <span id="develop-check-fields" class="develop-section-title">Checks</span>
        <ul class="develop-checklist">${checks.map(check => {
          const failures = warnings.filter(warning => check.codes.includes(warning.code))
          return failures.length ? failures.map(warning => html`<li class="develop-check" data-status="failed" data-code=${warning.code}>
            <span class="check-icon" aria-label="Failed">${ribbonIcon("Reject")}</span><span>${warning.message}</span></li>`)
            : html`<li class="develop-check" data-status=${check.checked ? "passed" : "pending"}>
              <span class="check-icon" aria-label=${check.checked ? "Passed" : "Not checked"}>${check.checked ? ribbonIcon("Accept") : "–"}</span>
              <span>${check.label}${check.checked ? "" : " (not checked)"}</span></li>`
        })}${warnings.filter(warning => !checks.some(check => check.codes.includes(warning.code))).map(warning => html`<li class="develop-check" data-status="failed" data-code=${warning.code}>
          <span class="check-icon" aria-label="Failed">${ribbonIcon("Reject")}</span><span>${warning.message}</span></li>`)}</ul>
      </section>
    `
  }

  private renderLocalPackageTests(pkg: WebWriterPackage) {
    if(!pkg.tests?.length) return nothing
    return html`
      <section class="develop-section" aria-labelledby="develop-test-fields">
        <span id="develop-test-fields" class="develop-section-title">Tests</span>
        ${pkg.tests.map(test => {
          const result = this.localPackageTestResults[`${pkg.name}/${test.name}`]
          const running = result === "running"
          const summary = !result || running ? ""
            : result.status === "timeout" ? "Timed out"
            : result.status === "error" ? result.error ?? "Failed to run"
            : `${result.tests.filter(item => item.passed).length}/${result.tests.length} passed`
          const failures = result && !running ? result.tests.filter(item => !item.passed) : []
          return html`
            <div class="develop-test" data-status=${running ? "running" : result ? result.status : "idle"}>
              <div class="develop-section-title-row">
                <span class="develop-field-label">${test.name}</span>
                <button class="develop-icon-button" type="button" ?disabled=${running}
                  aria-label=${`Run test ${test.name}`} title="Run test"
                  @click=${() => this.dispatchEvent(new CustomEvent("local-package-test-run", {detail: {name: test.name}, bubbles: true, composed: true}))}
                >${ribbonIcon(running ? "Refresh" : "Preview")}</button>
              </div>
              ${summary ? html`<span class="develop-field-help" role="status">${summary}</span>` : nothing}
              ${failures.length ? html`<ul class="develop-checks">${failures.map(item => html`<li class="develop-check">${item.path.join(" › ")}${item.timedOut ? " (timed out)" : ""}</li>`)}</ul>` : nothing}
            </div>
          `
        })}
      </section>
    `
  }

  documentRecoveries: DocumentRecovery[] = []
  documentRecoveryBusy = false

  private renderRecoveryVersion(record: DocumentRecovery, selected: boolean) {
    return html`<li class="recovery-version" ?data-active=${selected}>
      <div class="history-version-card">
        <button type="button" class="history-checkpoint" data-checkpoint-id=${record.id}
          aria-pressed=${selected} title=${record.title}>
          <span class="history-checkpoint-avatar" aria-hidden="true">${ribbonIcon("Restore")}</span>
          <span class="history-checkpoint-label">Recovery version</span>
          <span class="history-checkpoint-meta">${this.historyTimestamp(record.updatedAt)}</span>
        </button>
      </div>
    </li>`
  }

  private recoveryAction(type: string, id: string) {
    this.dispatchEvent(new CustomEvent(type, {detail: {id}, bubbles: true, composed: true}))
  }

  private renderPanelHeader(title: string, closeLabel: string, action: TemplateResult | typeof nothing) {
    return html`
      <header>
        <span class="panel-heading">${title}</span>
        ${action}
        <button class="panel-close" type="button" aria-label=${closeLabel} title=${closeLabel}
          @click=${() => this.dispatchEvent(new Event("review-panel-close", {bubbles: true, composed: true}))}>
          ${ribbonIcon("Reject")}
        </button>
      </header>
    `
  }

  private renderVersions() {
    const versions = [...this.historyState.versions].sort((a, b) => b.timestamp - a.timestamp)
    const recovery = this.documentRecoveries.find(record => record.id === this.activeVersionId)
      ?? (!versions.length ? this.documentRecoveries[0] : undefined)
    const active = versions.find(version => version.id === this.activeVersionId) ?? versions[0]
    const checkpoints = new Map(this.historyState.checkpoints.map(checkpoint => [checkpoint.id, checkpoint]))
    const changes = active ? this.historyChangeIds(active, checkpoints) : []
    return html`
      <aside class="version-sidebar" aria-label="Document versions">
        <ul class="version-list" @click=${(event: MouseEvent) => {
          const button = (event.target as Element).closest<HTMLElement>(".history-checkpoint")
          if(button) this.activeVersionId = button.dataset.checkpointId ?? null
        }}>
          ${this.documentRecoveries.map(record => this.renderRecoveryVersion(record, record === recovery))}
          ${versions.map(version => html`<li ?data-active=${!recovery && version.id === active?.id}>
            ${this.renderHistoryEntry(version, true, version.isCurrent, version.isUnsaved, !recovery && version.id === active?.id)}
          </li>`)}
        </ul>
      </aside>
      ${this.renderPanelHeader("Changes", "Close versions", this.renderHistoryPreviewClear())}
      <section class="panel-content version-changes" aria-label="Version changes">
        ${this.historyError ? html`<p class="version-empty" role="alert">${this.historyError}</p>` : nothing}
        ${this.historyLoading && !versions.length ? html`<p class="version-empty">Loading versions…</p>` : nothing}
        ${recovery ? html`
          <p class="version-empty">${recovery.title} · Checkpoint saved on this device</p>
          <div class="recovery-version-actions">
            <button type="button" ?disabled=${this.documentRecoveryBusy}
              @click=${() => this.recoveryAction("restore-recovered-document", recovery.id)}>Restore</button>
            <button type="button" ?disabled=${this.documentRecoveryBusy}
              @click=${() => this.recoveryAction("discard-recovered-document", recovery.id)}>Discard</button>
          </div>` : changes.length ? html`<ul class="version-change-list" aria-label=${`Changes in ${active.label}`}>
          ${changes.map(id => {
            const checkpoint = checkpoints.get(id)!
            return html`<li>${this.renderHistoryEntry(checkpoint, false, checkpoint.id === this.historyState.currentCheckpointId)}</li>`
          })}
        </ul>` : html`<p class="version-empty">${active ? "No changes in this version" : "No versions yet"}</p>`}
      </section>
    `
  }

  protected render() {
    if(!this.mode) return noChange
    if(this.mode === "versions") return this.renderVersions()
    const pkg = this.selectedLocalPackage
    return html`
      <div class="package-sidebar" @mousedown=${this.handleRibbonPointerDown}>${this.renderLocalPackageList()}</div>
      ${this.renderPanelHeader("Checks & Tests", "Close checks and tests", html`
        <a class="documentation-link" href="/docs/" target="_blank" rel="noopener noreferrer">Documentation ↗</a>
      `)}
      <section class="panel-content" aria-label="Checks &amp; Tests">
        <div class="test-content" @mousedown=${this.handleRibbonPointerDown}>
          <div class="tests-column">${pkg?.tests?.length ? this.renderLocalPackageTests(pkg) : html`<section class="develop-section"><span class="develop-section-title">Tests</span><span class="develop-empty">${pkg ? "No tests defined" : "Select a package to view tests"}</span></section>`}</div>
          <div class="checks-column">
            ${this.packageIssueError ? html`<div class="package-issue" role="alert">${ribbonIcon("Reject")}<span>${this.packageIssueError}</span></div>` : ""}
            ${pkg ? this.renderLocalPackageChecks(pkg) : html`<section class="develop-section"><span class="develop-section-title">Checks</span><span class="develop-empty">Select a package to view checks</span></section>`}
          </div>
        </div>
      </section>
    `
  }
}

if(!customElements.get("bottom-detail-panel")) customElements.define("bottom-detail-panel", BottomDetailPanel)

declare global {
  interface HTMLElementTagNameMap {"bottom-detail-panel": BottomDetailPanel}
}
