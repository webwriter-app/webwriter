import {css, html} from "lit"
import type {SelectionPathItem} from "../editor-bridge"
import {ribbonIcon} from "../ribbon-icons"
import {AppRibbon} from "./ribbon"
import {menuGroups} from "./ribbon-menu-config"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenuGroup} from "./ribbon-menu"

export type ToolboxTool = "Edit" | "Style" | "Review" | "Develop"

const tools: readonly {label: ToolboxTool, icon: string}[] = [
  {label: "Edit", icon: "Pencil"},
  {label: "Style", icon: "Theme"},
  {label: "Review", icon: "Grammar"},
  {label: "Develop", icon: "Develop"},
]

/** Document toolbox presented beside the breadcrumb rather than as top-level
 * ribbon tabs. Its pane reuses the ribbon's established controls so
 * commands, selection preservation, and specialized editors keep one event
 * contract. */
export class DomEditorToolbox extends AppRibbon {
  static properties = {
    ...AppRibbon.properties,
    activeTool: {type: String, attribute: "active-tool", reflect: true},
    selectionPath: {attribute: false},
    documentSelected: {type: Boolean, attribute: "document-selected"},
    htmlMode: {type: Boolean, attribute: "html-mode", reflect: true},
    htmlSource: {type: String, attribute: false},
    htmlPending: {type: Boolean, attribute: "html-pending", reflect: true},
    htmlSourceError: {type: String, attribute: false},
  }

  static styles = css`
    ${AppRibbon.styles}

    :host {
      box-sizing: border-box;
      display: block;
      position: relative;
      z-index: 2;
      align-self: stretch;
      width: 122px;
      min-width: 0;
      margin-left: -122px;
      height: 100%;
      max-height: none;
      overflow: visible;
      color: #2f3742;
      background: transparent;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: width 180ms ease, margin-left 180ms ease;
    }

    :host([active-tool]) {
      width: 200px;
      margin-left: 0;
    }

    :host([html-mode]) {
      width: 400px;
    }

    :host([hidden]) {
      display: none;
    }

    .toolbox {
      display: contents;
    }

    .toolbox-tabs {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      z-index: 2;
      align-items: flex-end;
      justify-content: flex-end;
      height: 30px;
      padding: 0 4px;
      border: 0;
      border-bottom-width: var(--toolbox-tabs-border-bottom-width, 0.5px);
      border-bottom-style: solid;
      border-bottom-color: #a8a8a8;
      background: #ededed;
    }

    :host([breadcrumb-expanded]) .toolbox-tabs {
      border-bottom-width: 0;
    }

    .toolbox-tab {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      width: 28px;
      height: 28px;
      border-radius: 0.2rem;
      overflow: hidden;
      transition: width 180ms ease, background-color 120ms ease;
    }

    .toolbox-tab[data-active] {
      width: 112px;
      height: 30px;
      margin-bottom: -1px;
      border: 1px solid #a8a8a8;
      border-bottom-color: #f2f2f2;
      border-radius: 0.2rem 0.2rem 0 0;
      background: #f2f2f2;
    }

    .toolbox-tab-button,
    .toolbox-tab-close {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      height: 28px;
      margin: 0;
      border: 0;
      border-radius: 0.2rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .toolbox-tab-button {
      width: 28px;
      min-width: 28px;
      padding: 0.35rem;
      overflow: hidden;
      transition: width 180ms ease;
    }

    .toolbox-tab[data-active] .toolbox-tab-button {
      justify-content: flex-start;
      width: calc(100% - 24px);
    }

    .toolbox-tab[data-available],
    .toolbox-tab[data-available] .toolbox-tab-button {
      width: 88px;
    }

    .toolbox-tab-close {
      width: 0;
      padding: 0;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
      transition: width 180ms ease, padding 180ms ease, opacity 90ms ease;
    }

    .toolbox-tab[data-active] .toolbox-tab-close {
      width: 24px;
      padding: 0.3rem;
      opacity: 1;
      pointer-events: auto;
      transition-delay: 0ms, 0ms, 90ms;
    }

    .toolbox-tab-button:hover,
    .toolbox-tab-close:hover {
      color: #243447;
      background: #dbe7f2;
    }

    .toolbox-tab-button[aria-selected="true"] {
      color: #243447;
    }

    .toolbox-tab-button:focus-visible,
    .toolbox-tab-close:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .toolbox-tab-icon {
      display: block;
      flex: 0 0 17px;
      width: 17px;
      height: 17px;
    }

    .toolbox-tab-label {
      display: block;
      max-width: 0;
      margin-left: 0;
      opacity: 0;
      overflow: hidden;
      font-size: 0.72rem;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
      transform: translateX(-0.2rem);
      transition: max-width 180ms ease, margin-left 180ms ease, opacity 90ms ease, transform 180ms ease;
    }

    .toolbox-tab[data-active] .toolbox-tab-label,
    .toolbox-tab[data-available] .toolbox-tab-label {
      max-width: 4.5rem;
      margin-left: 0.3rem;
      opacity: 1;
      transform: translateX(0);
      transition-delay: 0ms, 0ms, 90ms, 0ms;
    }

    .toolbox-tab-label[data-contextual] {
      color: #3977c7;
    }

    .toolbox-tab[data-contextual]:not([data-active]) .toolbox-tab-button {
      color: #3977c7;
    }

    .toolbox-tab-icon svg,
    .toolbox-tab-close svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .toolbox-pane {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      position: absolute;
      top: 30px;
      right: 0;
      bottom: 0;
      width: 100%;
      min-height: 0;
      border-left: 1px solid #a8a8a8;
      background: #f2f2f2;
      box-shadow: -0.25rem 0 0.75rem rgb(0 0 0 / 8%);
      overflow: hidden;
    }

    .toolbox-pane[hidden] {
      display: none;
    }

    .toolbox-pane-content {
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      padding: 0;
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-width: thin;
    }

    .toolbox-pane-content > ribbon-drawer {
      flex: 0 0 auto;
      width: 100%;
      min-width: 0;
    }

    .toolbox-pane-content > ribbon-drawer[layout="element-style"] {
      flex-basis: auto;
    }

    .html-source-editor {
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      padding: 0.65rem;
    }

    .html-source-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 0 0 0.45rem;
      color: #52606d;
      font-size: 0.72rem;
      font-weight: 600;
    }

    .html-source-status {
      color: #0f766e;
      font-weight: 500;
    }

    .html-source-input {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 100%;
      min-height: 8rem;
      padding: 0.65rem;
      border: 1px solid #c7ccd1;
      border-radius: 0.35rem;
      outline: none;
      color: #1f2937;
      background: #fafafa;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
      resize: none;
      tab-size: 2;
    }

    .html-source-input:focus {
      border-color: #6388ad;
      box-shadow: 0 0 0 2px rgb(57 119 199 / 14%);
    }

    .html-source-error {
      margin: 0.45rem 0 0;
      color: #b42318;
      font-size: 0.7rem;
    }

    .edit-mode-footer {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 0.35rem;
      min-height: 38px;
      padding: 0.35rem 0.45rem;
      border-top: 1px solid #c8c8c8;
      background: #e9e9e9;
    }

    .html-mode-toggle,
    .html-source-action {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      min-height: 28px;
      margin: 0;
      padding: 0.3rem 0.5rem;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      color: #46576a;
      background: transparent;
      font: 600 0.72rem/1 system-ui, sans-serif;
      cursor: pointer;
    }

    .html-mode-toggle[aria-pressed="true"] {
      border-color: #8ba5be;
      color: #153b5c;
      background: #dbe7f2;
    }

    .html-mode-toggle:hover:not(:disabled),
    .html-source-action:hover:not(:disabled) {
      background: #dbe7f2;
    }

    .html-mode-toggle:focus-visible,
    .html-source-action:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .html-mode-toggle:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .toolbox-tab-button:disabled,
    .toolbox-tab-close:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .html-mode-toggle svg,
    .html-source-action svg {
      display: block;
      width: 15px;
      height: 15px;
    }

    .html-source-actions {
      display: flex;
      gap: 0.2rem;
      margin-left: auto;
    }

    .html-source-action.apply {
      color: white;
      background: #0f766e;
    }

    .html-source-action.apply:hover:not(:disabled) {
      background: #115e59;
    }

    @supports (grid-template-rows: subgrid) {
      :host {
        display: grid;
        grid-template-rows: subgrid;
      }

      .toolbox-pane {
        position: relative;
        top: auto;
        right: auto;
        bottom: auto;
        grid-row: 2;
        height: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        transition-duration: 0s;
      }

      .toolbox-tab,
      .toolbox-tab-button,
      .toolbox-tab-close,
      .toolbox-tab-label {
        transition-duration: 0s;
      }
    }
  `

  activeTool: ToolboxTool | null = null
  selectionPath: SelectionPathItem[] = []
  documentSelected = false
  htmlMode = false
  htmlSource = ""
  htmlPending = false
  htmlSourceError = ""

  protected get elementStyleEditorOrientation(): "vertical" {
    return "vertical"
  }

  private get editTypeLabel() {
    if(this.documentSelected) return "Document"
    if(this.sectionSelected) return "Section"
    if(this.graphic?.active) return "Graphic"
    if(this.table?.active) return "Table"
    if(this.media) return this.media.type === "picture" || this.media.type === "img"
      ? "Image"
      : this.media.type === "audio"
        ? "Audio"
        : this.media.type === "video"
          ? "Video"
          : "Website"
    if(this.dialog && !this.form) return "Dialog"
    if(this.form) return this.form.type === "input" ? "Input" : this.form.type === "textarea" ? "Text area" : "Form"
    if(this.selectionPath.at(-1)?.icon === "Packages") return "Widget"
    if(this.elementAttributes) return this.elementAttributes.name
    return null
  }

  protected get currentMenuGroups(): RibbonMenuGroup[] {
    if(this.activeTool === "Style") return menuGroups.Style
    if(this.activeTool === "Review") {
      return menuGroups.Edit.filter(group => group.label === "Comments" || group.label === "Review")
    }
    if(this.activeTool === "Develop") return menuGroups.Develop
    if(this.activeTool === "Edit") {
      if(this.documentSelected) return menuGroups.Edit.filter(group => group.label === "Document"
        || Boolean(this.elementAttributes) && group.label === "Attributes")
      const groups = menuGroups.Edit.filter(group => ![
        "Marks", "Document", "Section", "Comments", "Review", "View",
      ].includes(group.label))
      return this.sectionSelected
        ? menuGroups.Edit.filter(group => group.label === "Section"
          || Boolean(this.elementAttributes) && group.label === "Attributes")
        : this.graphic?.active
        ? groups.filter(group => group.label === "Graphic" || Boolean(this.elementAttributes) && group.label === "Attributes")
        : this.table?.active
          ? groups.filter(group => group.label === "Layout" || Boolean(this.elementAttributes) && group.label === "Attributes")
        : this.media
          ? groups.filter(group => group.label === "Media" || Boolean(this.elementAttributes) && group.label === "Attributes")
        : this.dialog
          ? groups.filter(group => group.label === "Dialog"
            || Boolean(this.form) && group.label === "Form"
            || Boolean(this.elementAttributes) && group.label === "Attributes")
        : this.form
          ? groups.filter(group => group.label === "Form" || Boolean(this.elementAttributes) && group.label === "Attributes")
        : this.elementAttributes
          ? groups.filter(group => group.label === "Attributes")
          : groups
    }
    return []
  }

  selectTool(tool: ToolboxTool | null) {
    const nextTool = tool
    if(this.htmlPending && nextTool !== "Edit") return
    if(this.activeTool === nextTool) return
    const previousMenu = this.activeMenu
    this.dismissDrawers()
    this.activeTool = nextTool
    if(nextTool) {
      this.activeMenu = nextTool === "Review" ? "Edit" : nextTool
      if(previousMenu === nextTool && nextTool === "Style") {
        this.dispatchEvent(new Event("element-style-state-request", {bubbles: true, composed: true}))
      }
      if(previousMenu === nextTool && nextTool === "Develop") {
        this.dispatchEvent(new Event("local-package-request", {bubbles: true, composed: true}))
      }
    }
    this.dispatchEvent(new CustomEvent<{tool: ToolboxTool | null}>("toolbox-change", {
      detail: {tool: nextTool},
      bubbles: true,
      composed: true,
    }))
  }

  private toggleHTMLMode() {
    if(this.htmlPending) return
    this.dispatchEvent(new CustomEvent<{enabled: boolean}>("html-mode-change", {
      detail: {enabled: !this.htmlMode},
      bubbles: true,
      composed: true,
    }))
  }

  private changeHTMLSource(event: Event) {
    const value = (event.currentTarget as HTMLTextAreaElement).value
    this.dispatchEvent(new CustomEvent<{value: string}>("html-source-change", {
      detail: {value},
      bubbles: true,
      composed: true,
    }))
  }

  private renderHTMLSourceEditor() {
    return html`
      <section class="html-source-editor" aria-label="Selected HTML source">
        <div class="html-source-heading">
          <span>Selected HTML</span>
          ${this.htmlPending ? html`<span class="html-source-status">Pending change</span>` : ""}
        </div>
        <textarea
          class="html-source-input"
          aria-label="Selected HTML"
          .value=${this.htmlSource}
          spellcheck="false"
          @input=${this.changeHTMLSource}
        ></textarea>
        ${this.htmlSourceError ? html`<p class="html-source-error" role="alert">${this.htmlSourceError}</p>` : ""}
      </section>
    `
  }

  private renderEditModeFooter() {
    return html`
      <footer class="edit-mode-footer">
        <button
          class="html-mode-toggle"
          type="button"
          aria-label=${this.htmlMode ? "Show visual editing tools" : "Edit selection as HTML"}
          title=${this.htmlMode ? "Visual editing" : "Edit HTML"}
          aria-pressed=${this.htmlMode}
          ?disabled=${this.htmlPending}
          @click=${this.toggleHTMLMode}
        >${ribbonIcon("Code")}<span>HTML</span></button>
        ${this.htmlMode && this.htmlPending ? html`
          <div class="html-source-actions">
            <button
              class="html-source-action discard"
              type="button"
              @click=${() => this.dispatchEvent(new CustomEvent("html-source-discard", {bubbles: true, composed: true}))}
            >${ribbonIcon("Reject")}<span>Discard</span></button>
            <button
              class="html-source-action apply"
              type="button"
              @click=${() => this.dispatchEvent(new CustomEvent("html-source-apply", {bubbles: true, composed: true}))}
            >${ribbonIcon("Accept")}<span>Apply</span></button>
          </div>
        ` : ""}
      </footer>
    `
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer").forEach(drawer => {
      drawer.collapsed = false
      drawer.pane = true
    })
  }

  render() {
    return html`
      <div
        class="toolbox"
        @pointerdown=${this.handleRibbonPointerDown}
        @mousedown=${this.handleRibbonPointerDown}
        @focusin=${this.handleRibbonInputFocusIn}
        @focusout=${this.handleRibbonInputFocusOut}
        @change=${this.handleRibbonInputChange}
        @keydown=${this.handleRibbonInputKeydown}
      >
        <div class="toolbox-tabs" role="tablist" aria-label="Toolbox">
          ${tools.map(tool => {
            const active = this.activeTool === tool.label
            const tabId = `toolbox-tab-${tool.label.toLowerCase()}`
            const contextualLabel = tool.label === "Edit" ? this.editTypeLabel : null
            const label = contextualLabel ?? tool.label
            return html`
              <div
                class="toolbox-tab"
                ?data-active=${active}
                ?data-contextual=${contextualLabel !== null}
                ?data-available=${contextualLabel !== null && this.activeTool === null}
              >
                <button
                  id=${tabId}
                  class="toolbox-tab-button"
                  data-tool=${tool.label}
                  type="button"
                  role="tab"
                  aria-label=${contextualLabel ? `Edit ${contextualLabel}` : tool.label}
                  title=${contextualLabel ? `Edit ${contextualLabel}` : tool.label}
                  aria-controls="toolbox-pane"
                  aria-selected=${active}
                  ?disabled=${this.htmlPending && tool.label !== "Edit"}
                  @click=${() => this.selectTool(tool.label)}
                >
                  <span class="toolbox-tab-icon" aria-hidden="true">${ribbonIcon(tool.icon)}</span>
                  <span
                    class="toolbox-tab-label"
                    ?data-contextual=${contextualLabel !== null}
                    aria-hidden=${!active}
                  >${label}</span>
                </button>
                <button
                  class="toolbox-tab-close"
                  type="button"
                  aria-label=${`Close ${tool.label}`}
                  title="Close"
                  aria-hidden=${!active}
                  tabindex=${active ? 0 : -1}
                  ?disabled=${!active || this.htmlPending}
                  @click=${() => this.selectTool(null)}
                >${ribbonIcon("Reject")}</button>
              </div>
            `
          })}
        </div>
        <aside
          id="toolbox-pane"
          class="toolbox-pane"
          role="tabpanel"
          aria-labelledby=${this.activeTool ? `toolbox-tab-${this.activeTool.toLowerCase()}` : ""}
          aria-label=${this.activeTool ? `${this.activeTool} tools` : "Toolbox"}
          ?hidden=${this.activeTool === null}
        >
          <div class="toolbox-pane-content">
            ${this.activeTool === "Edit" && this.htmlMode
              ? this.renderHTMLSourceEditor()
              : this.activeTool ? this.renderDrawers() : ""}
          </div>
          ${this.activeTool === "Edit" ? this.renderEditModeFooter() : ""}
        </aside>
      </div>
    `
  }
}

if(!customElements.get("dom-editor-toolbox")) {
  customElements.define("dom-editor-toolbox", DomEditorToolbox)
}

declare global {
  interface HTMLElementTagNameMap {
    "dom-editor-toolbox": DomEditorToolbox
  }
}
