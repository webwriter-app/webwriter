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
      z-index: 2;
      align-items: flex-end;
      height: 30px;
      padding: 0 0.3rem;
      border: 0;
      border-bottom-width: var(--toolbox-tabs-border-bottom-width, 0.5px);
      border-bottom-style: solid;
      border-bottom-color: #a8a8a8;
      background: #ededed;
    }

    :host([breadcrumb-expanded]) .toolbox-tabs {
      border-bottom-width: 0;
    }

    :host([active-tool]) .toolbox-tabs {
      padding-right: 4px;
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

    .toolbox-tab[data-contextual]:not([data-active]),
    .toolbox-tab[data-contextual]:not([data-active]) .toolbox-tab-button {
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
    .toolbox-tab[data-contextual] .toolbox-tab-label {
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
      width: 200px;
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

  private get editTypeLabel() {
    if(this.sectionSelected) return "Section"
    if(this.graphic?.active) return "Graphic"
    if(this.table?.active) return "Table"
    if(this.form) return this.form.type === "input" ? "Input" : this.form.type === "textarea" ? "Text area" : "Form"
    if(this.selectionPath.at(-1)?.icon === "Packages") return "Widget"
    return null
  }

  protected get currentMenuGroups(): RibbonMenuGroup[] {
    if(this.activeTool === "Style") return menuGroups.Style
    if(this.activeTool === "Review") {
      return menuGroups.Edit.filter(group => group.label === "Comments" || group.label === "Review")
    }
    if(this.activeTool === "Develop") return menuGroups.Develop
    if(this.activeTool === "Edit") {
      const groups = menuGroups.Edit.filter(group => ![
        "Marks", "Section", "Comments", "Review", "View",
      ].includes(group.label))
      return this.sectionSelected
        ? menuGroups.Edit.filter(group => group.label === "Section")
        : this.graphic?.active
        ? groups.filter(group => group.label === "Graphic")
        : this.form
          ? groups.filter(group => group.label === "Form")
        : groups
    }
    return []
  }

  selectTool(tool: ToolboxTool | null) {
    const nextTool = tool
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
                  ?disabled=${!active}
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
            ${this.activeTool ? this.renderDrawers() : ""}
          </div>
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
