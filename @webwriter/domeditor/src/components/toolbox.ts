import "./widget-grouping-dialog"
import type {WidgetGroupingDialog} from "./widget-grouping-dialog"
import type {WidgetGroupingContext} from "../widget-grouping.js"
import {css, html} from "lit"
import {emptyDocumentHeadState, type DocumentHeadState} from "../document-head"
import "./document-head-editor"
import type {SelectionPathItem} from "../editor-bridge"
import {ribbonIcon} from "../ribbon-icons"
import {EditingControls} from "./editing-controls"
import {contextDrawerPolicy} from "./ribbon-menu-config"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenuGroup} from "./ribbon-menu"
import {layoutPreviewStyles, renderTemplateCard, renderTemplatePreview, templateLabel, templateModes} from "./template-preview"
import type {DocumentLayoutMode, DocumentLayoutState} from "../document-layout"

export type ToolboxTool = "Edit" | "Style" | "Review"

const tools: readonly {label: ToolboxTool, icon: string}[] = [
  {label: "Edit", icon: "Pencil"},
  {label: "Style", icon: "Theme"},
  {label: "Review", icon: "Grammar"},
]

/** Document toolbox presented beside the breadcrumb rather than as top-level
 * ribbon tabs. Its pane reuses the ribbon's established controls so
 * commands, selection preservation, and specialized editors keep one event
 * contract. */
export class DomEditorToolbox extends EditingControls {
  private renderWidgetSharing() {
    const state = this.widgetOptions
    if(!state?.sharing) return ""
    const {sharing} = state
    const reference = {path: [...state.path], localName: state.localName, widgetId: sharing.widgetId}
    const grouping = sharing.grouping
    const summary = grouping?.method === "existing" ? "Existing grouping"
      : grouping?.method === "manual" ? `${grouping.manualGroups.length} groups · manual`
      : grouping ? `${grouping.number} ${grouping.groupBy === "groups" ? "groups" : "members per group"} · ${grouping.allocateBy === "random" ? "random" : "ordered"}` : ""
    return html`
      <section class="widget-sharing" aria-label="Sharing">
        <label class="share-toggle"><span>Share</span><input type="checkbox" role="switch"
          .checked=${sharing.mode !== "individual"}
          @change=${(event: Event) => this.dispatchEvent(new CustomEvent("widget-sharing-change", {bubbles: true, composed: true,
            detail: {...reference, enabled: (event.target as HTMLInputElement).checked}}))}></label>
        ${sharing.mode === "individual" ? "" : grouping ? html`
          <div class="grouping-card">
            <button class="grouping-summary" @click=${() => this.configureWidgetGrouping(reference, grouping)}>
              <strong>${grouping.groupingName || "Grouping"}</strong><span>${summary}</span>
            </button>
            <button class="grouping-remove" aria-label="Remove grouping" title="Remove grouping"
              @click=${() => this.dispatchEvent(new CustomEvent("widget-grouping-change", {bubbles: true, composed: true, detail: {...reference, grouping: null}}))}>${ribbonIcon("Reject")}</button>
          </div>
        ` : html`<button class="add-grouping" @click=${() => this.configureWidgetGrouping(reference, null)}>Add grouping</button>`}
        ${sharing.error ? html`<p role="alert">${sharing.error}</p>` : ""}
      </section>
    `
  }

  private async configureWidgetGrouping(reference: {path: number[], localName: string, widgetId: string}, grouping: import("../widget-grouping.js").WidgetGroupingRules | null) {
    const dialog = this.shadowRoot?.querySelector<WidgetGroupingDialog>("widget-grouping-dialog")
    if(!dialog) return
    const result = await dialog.show(grouping, () => new Promise<WidgetGroupingContext>((resolve, reject) => {
      this.dispatchEvent(new CustomEvent("widget-grouping-context", {bubbles: true, composed: true, detail: {...reference, resolve, reject}}))
    }))
    if(result !== undefined) this.dispatchEvent(new CustomEvent("widget-grouping-change", {bubbles: true, composed: true, detail: {...reference, grouping: result}}))
  }

  protected renderGraphicDrawer() {
    return super.renderGraphicDrawer(true)
  }

  static properties = {
    ...EditingControls.properties,
    showStyleToolbox: {type: Boolean, attribute: "show-style-toolbox", reflect: true},
    activeTool: {type: String, attribute: "active-tool", reflect: true},
    selectionPath: {attribute: false},
    documentSelected: {type: Boolean, attribute: "document-selected"},
    documentHead: {attribute: false},
    documentHeadAttributeEditorId: {state: true},
    consoleOpen: {type: Boolean, attribute: "console-open", reflect: true},
    htmlPending: {type: Boolean, attribute: "html-pending", reflect: true},
    documentLayout: {attribute: false},
    documentLayoutError: {attribute: false},
  }

  static styles = css`
    ${EditingControls.styles}

  .developer-console-controls {display: flex; align-items: center; gap: 0; background: #e9e9e9}
  .developer-console-controls button {box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 32px; padding: .3rem .5rem; border: 0; border-radius: 0; background: transparent; color: #46576a; font: 600 .72rem/1 system-ui, sans-serif; cursor: pointer}
  .developer-console-controls button[aria-pressed="true"] {color: #153b5c; background: #e9e9e9}
  .developer-console-controls button:hover:not(:disabled) {color: #153b5c; background: #e9e9e9}
  .developer-console-controls button:focus-visible {outline: 2px solid #3977c7; outline-offset: -2px}
  .developer-console-controls button:disabled {opacity: .6; cursor: default}
  .developer-console-controls svg {display: block; width: 15px; height: 15px}


    .widget-sharing {padding: .75rem; display: grid; gap: .5rem; border-bottom: 1px solid var(--sl-color-neutral-200, #ddd)}
    .share-toggle {display: flex; justify-content: space-between; align-items: center; font-size: .875rem}
    .share-toggle input {appearance: none; position: relative; width: 2rem; height: 1.125rem; margin: 0; background: var(--sl-color-neutral-300, #ccc); border: 1px solid transparent; border-radius: 1rem; cursor: pointer}
    .share-toggle input::before {content: ""; position: absolute; width: .875rem; height: .875rem; left: .0625rem; top: .0625rem; border-radius: 50%; background: white; transition: transform .12s}
    .share-toggle input:checked {background: var(--sl-color-primary-600, #5267df)}
    .share-toggle input:checked::before {transform: translateX(.875rem)}
    .share-toggle input:focus-visible {outline: 2px solid var(--sl-color-primary-600, #5267df); outline-offset: 2px}
    @media (prefers-reduced-motion: reduce) {.share-toggle input::before {transition: none}}
    .grouping-card {position: relative; border: 1px solid var(--sl-color-neutral-200, #ddd); border-radius: .4rem; overflow: hidden}
    .grouping-summary {display: grid; gap: .25rem; padding: .65rem 2rem .65rem .65rem; width: 100%; text-align: left; background: transparent; border: 0; cursor: pointer; color: inherit}
    .grouping-summary span {font-size: .75rem; color: var(--sl-color-neutral-600, #666)}
    .grouping-remove {position: absolute; top: .2rem; right: .2rem; padding: .2rem; border: 0; background: transparent; cursor: pointer; color: inherit}
    .grouping-remove svg {width: 1rem; height: 1rem}
    .add-grouping {padding: .5rem; background: transparent; color: inherit; border: 1px solid var(--sl-color-neutral-300, #ccc); border-radius: .4rem; cursor: pointer}

    .history-timeline {
      flex-direction: column;
      height: auto;
      overflow: visible;
    }

    .history-version-card {
      flex: 0 0 auto;
      min-height: 8rem;
    }

    :host {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 30px minmax(0, 1fr);
      position: relative;
      z-index: 2;
      align-self: stretch;
      width: 94px;
      min-width: 0;
      height: 100%;
      max-height: none;
      overflow: visible;
      color: #2f3742;
      background: transparent;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: var(--ww-ui-transition, width 180ms ease);
    }

    :host(:not([show-style-toolbox])) {
      width: 66px;
    }

    :host([active-tool]) {
      width: 216px;
    }

    :host([hidden]) {
      display: none;
    }

    .toolbox {
      display: contents;
    }

    .toolbox-tabs-area {
      grid-row: 1 / -1;
      min-height: 30px;
      background: #ededed;
      box-shadow: inset 0 -0.5px #a8a8a8;
    }

    :host([active-tool]) .toolbox-tabs-area {
      grid-row: 1;
    }

    .toolbox-tabs {
      box-sizing: border-box;
      display: flex;
      position: relative;
      grid-row: 1;
      z-index: 2;
      align-items: flex-end;
      justify-content: flex-end;
      height: 30px;
      padding: 0 4px;
      border: 0;
      border-bottom-width: 0.5px;
      border-bottom-style: solid;
      border-bottom-color: var(--toolbox-tabs-border-color, #a8a8a8);
      background: #ededed;
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
      transition: var(--ww-ui-transition, width 180ms ease, background-color 120ms ease);
    }

    .toolbox-tab[data-active] {
      flex-grow: 1;
      width: 128px;
      height: 30px;
      margin-bottom: -1px;
      border: 1px solid #a8a8a8;
      border-bottom-color: #f2f2f2;
      border-radius: 0.2rem 0.2rem 0 0;
      background: #f2f2f2;
    }

    :host([active-tool]) .toolbox-tabs {
      padding-left: 0;
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
      transition: var(--ww-ui-transition, width 180ms ease);
    }

    .toolbox-tab[data-active] .toolbox-tab-button {
      justify-content: flex-start;
      width: calc(100% - 24px);
    }

    .toolbox-tab[data-available],
    .toolbox-tab[data-available] .toolbox-tab-button {
      width: 100px;
    }

    .toolbox-tab-close {
      width: 0;
      padding: 0;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
      transition: var(--ww-ui-transition, width 180ms ease, padding 180ms ease, opacity 90ms ease);
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
      transition: var(--ww-ui-transition, max-width 180ms ease, margin-left 180ms ease, opacity 90ms ease, transform 180ms ease);
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
      color: var(--sl-color-primary-500, #0ea5e9);
    }

    .toolbox-tab[data-contextual] .toolbox-tab-button {
      color: var(--sl-color-primary-500, #0ea5e9);
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
      position: relative;
      grid-row: 2;
      width: 100%;
      height: 100%;
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

    .toolbox-pane-content > .local-packages-drawer {
      position: sticky;
      top: 0;
      z-index: 3;
      background: #f2f2f2;
      box-shadow: 0 0.2rem 0.45rem rgb(31 41 55 / 8%);
    }

    .toolbox-pane-content > ribbon-drawer[layout="element-style"]:focus-within,
    .toolbox-pane-content > ribbon-drawer:has(element-style-editor[popup-open]) {
      z-index: 4;
    }

    .style-reset {
      display: inline-flex; align-items: center; gap: 0.2rem; padding: 0.2rem;
      border: 0; border-radius: 3px; color: #526b86; background: transparent;
      font: inherit; font-size: 0.65rem; cursor: pointer;
    }
    .style-reset svg { width: 0.85rem; height: 0.85rem; }
    .style-reset:hover:not(:disabled) { background: #e8eef5; }
    .style-reset:focus-visible { outline: 2px solid #b9d7f5; }
    .style-reset:disabled { opacity: 0.4; cursor: default; }

    .toolbox-pane-content > ribbon-drawer[layout="element-style"] {
      flex-basis: auto;
    }

    .document-layout-controls {
      grid-column: 1 / -1;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.45rem;
      padding: 0.65rem;
      color: #52606d;
      font-size: 0.75rem;
    }

    ${layoutPreviewStyles}

    .document-layout-zoom { margin: 0; }
    .template-picker { position: relative; }
    .template-picker summary { position: relative; list-style: none; }
    .template-picker summary::-webkit-details-marker { display: none; }
    .template-picker summary::after {
      content: "⌄";
      position: absolute;
      right: 0.5rem;
      bottom: 0.3rem;
      font-size: 1rem;
    }
    .template-picker[open] summary::after { content: "⌃"; }
    .document-layout-choices {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
      margin-top: 0.35rem;
      padding: 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      background: #f8fafc;
    }

    .document-layout-error {
      margin: 0;
      color: #b42318;
      font-size: 0.7rem;
    }

    .edit-mode-footer {
      flex: 0 0 auto;
      border-top: 1px solid #c8c8c8;
      background: #e9e9e9;
    }
    .edit-mode-footer .developer-console-controls {justify-content: space-between}
    :host([console-open]) .toolbox-pane {clip-path: inset(0 0 0 -1rem)}
    :host([console-open][active-tool])::after {
      content: "";
      position: absolute;
      bottom: -1px;
      left: 1px;
      right: 0;
      height: 1px;
      background: #e9e9e9;
      pointer-events: none;
    }

    .toolbox-tab-button:disabled,
    .toolbox-tab-close:disabled {
      opacity: 0.45;
      cursor: default;
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

  showStyleToolbox = false
  activeTool: ToolboxTool | null = null
  selectionPath: SelectionPathItem[] = []
  documentSelected = false
  documentHead: DocumentHeadState = emptyDocumentHeadState()
  private documentHeadAttributeEditorId = ""
  consoleOpen = false
  htmlPending = false
  documentLayout: DocumentLayoutState = {mode: "document", canConvert: true, zoom: 100}
  documentLayoutError = ""

  protected get elementStyleEditorOrientation(): "vertical" {
    return "vertical"
  }

  private get editTypeLabel() {
    if(this.math?.active) return "Formula"
    if(this.documentSelected) return "Document"
    if(this.layout && (!this.layout.item || !this.media && !this.dialog && !this.table?.active && !this.graphic?.active && this.elementAttributes?.localName !== "details")) return this.layout.kind === "grid" ? "Grid layout" : this.layout.kind === "columns" ? "Layout" : "Flex layout"
    if(this.sectionSelected) return "Section"
    if(this.headingGroup) return "Heading group"
    if(this.listType === "ol") return "List"
    if(this.graphic?.active) return "Graphic"
    if(this.table?.active) return "Table"
    if(this.media) return this.media.type === "picture" || this.media.type === "img"
      ? "Image"
      : this.media.type === "audio"
        ? "Audio"
        : this.media.type === "video"
          ? "Video"
          : "Website"
    if(this.dialog) return "Dialog"
    if(this.figure) return "Figure"
    if(this.selectionPath.at(-1)?.icon === "Packages") return "Widget"
    if(this.paragraphSelected) return null
    if(this.elementAttributes) return this.elementAttributes.name
    return null
  }

  protected get currentMenuGroups(): RibbonMenuGroup[] {
    return contextDrawerPolicy({
      menu: "Edit",
      surface: "toolbox",
      activeTool: this.activeTool ?? undefined,
      documentSelected: this.documentSelected,
      sectionSelected: this.sectionSelected,
      layout: this.layout?.kind,
      layoutItem: this.layout?.item,
      math: this.math?.active,
      headingGroup: Boolean(this.headingGroup),
      orderedList: this.listType === "ol",
      media: Boolean(this.media),
      dialog: Boolean(this.dialog),
      table: Boolean(this.table?.active),
      graphic: Boolean(this.graphic?.active),
      disclosure: this.elementAttributes?.localName === "details",
      figure: Boolean(this.figure),
      widget: Boolean(this.widgetOptions),
      attributes: Boolean(this.elementAttributes),
    })
  }

  private get resettableStyles() {
    const documentTarget = this.documentSelected || this.elementStyle.target?.documentRoot || this.elementStyle.target?.localName === "body"
    const properties = documentTarget ? ["background-color"] : [
      "background-color", "color", "border-width", "border-style", "border-color", "padding",
      "width", "height", "margin", "border-radius", "rotate", "scale", "box-shadow", "filter",
    ]
    // Resolve authored shorthands and side declarations through CSSOM, so
    // resetting the drawer leaves unrelated styles such as typography intact.
    const style = this.ownerDocument.createElement("div").style
    for(const [name, declaration] of Object.entries(this.elementStyle.inline)) {
      style.setProperty(name, declaration.value, declaration.priority)
    }
    const hasValue = (name: string) => {
      if(style.getPropertyValue(name)) return true
      if(name === "margin" || name === "padding") return ["top", "right", "bottom", "left"]
        .some(side => style.getPropertyValue(`${name}-${side}`))
      if(["border-width", "border-style", "border-color"].includes(name)) return ["top", "right", "bottom", "left"]
        .some(side => style.getPropertyValue(`border-${side}-${name.slice("border-".length)}`))
      return name === "border-radius" && ["top-left", "top-right", "bottom-left", "bottom-right"]
        .some(corner => style.getPropertyValue(`border-${corner}-radius`))
    }
    return Object.fromEntries(properties.filter(hasValue).map(name => [name, null]))
  }

  private advancedOpen = new Map<string, boolean>()

  // Toolbox panes are persistent controls, not transient ribbon popups.
  dismissDrawers() {}

  private rememberAdvancedState = (event: CustomEvent<{open: boolean}>) => {
    const drawer = event.composedPath()[0] as RibbonDrawer
    this.advancedOpen.set(`${drawer.layout}:${drawer.label}`, event.detail.open)
  }

  private renderUniversalStyleDrawer() {
    const documentTarget = this.documentSelected || this.elementStyle.target?.documentRoot || this.elementStyle.target?.localName === "body"
    const advancedProperties = documentTarget ? ["background-color"] : ["background-color", "color", "border-width", "padding", "width", "height", "margin", "border-radius", "rotate", "scale", "box-shadow", "filter"]
    const setProperties = this.resettableStyles
    const advancedCount = advancedProperties.filter(name => name === "border-width"
      ? ["border-width", "border-style", "border-color"].some(property => Object.hasOwn(setProperties, property))
      : Object.hasOwn(setProperties, name)).length
    return html`
      <ribbon-drawer label="Style" icon="Theme" layout="element-style" show-pane-icon expandable .advancedCount=${advancedCount}
        >
        <button type="button" class="style-reset" slot="heading-action" title="Reset styles" aria-label="Reset styles"
          ?disabled=${!Object.keys(this.resettableStyles).length}
          @click=${() => {
            const styles = this.resettableStyles
            if(Object.keys(styles).length) this.dispatchEvent(new CustomEvent("element-style-change", {
              detail: {styles}, bubbles: true, composed: true,
            }))
          }}>${ribbonIcon("Restore")}Reset</button>
        <element-style-editor mode="compact" orientation="vertical" show-presets .propertyNames=${[]} .state=${this.elementStyle}></element-style-editor>
        <element-style-editor slot="more" mode="compact" orientation="vertical"
          .propertyNames=${advancedProperties} .state=${this.elementStyle}></element-style-editor>
      </ribbon-drawer>
    `
  }

  protected renderDrawers() {
    if(this.activeTool === "Edit" && !this.elementAttributes
      && this.currentMenuGroups.length === 1 && this.currentMenuGroups[0].label === "Attributes") {
      return [html`
        <ribbon-drawer label="Attributes" icon="Develop" layout="attributes">
          <element-attribute-editor disabled></element-attribute-editor>
        </ribbon-drawer>
      `]
    }
    const drawers = super.renderDrawers()
    if(this.activeTool === "Edit" && this.documentSelected) {
      drawers.push(html`
        <ribbon-drawer label="Templates" icon="Layout" layout="document-layout">
          <div class="document-layout-controls">
            <details class="template-picker" @keydown=${(event: KeyboardEvent) => {
              if(event.key !== "Escape") return
              const picker = event.currentTarget as HTMLDetailsElement
              picker.open = false
              picker.querySelector("summary")?.focus()
            }}>
              <summary class="layout-preset" aria-label=${`Current template: ${templateLabel(this.documentLayout.mode)}. Choose template`}>
                ${renderTemplatePreview(this.documentLayout.mode)}
              </summary>
              <div class="document-layout-choices" role="group" aria-label="Templates">
                ${templateModes.filter(mode => mode !== this.documentLayout.mode).map(mode => renderTemplateCard(
                  mode, this.documentLayout, this.historyState.preview !== null || this.htmlPending,
                  selected => this.selectDocumentTemplate(selected),
                ))}
              </div>
            </details>
            <p class="document-layout-zoom">Zoom: <strong>${this.documentLayout.zoom}%</strong></p>
            ${this.documentLayoutError ? html`<p class="document-layout-error" role="alert">${this.documentLayoutError}</p>` : ""}
          </div>
        </ribbon-drawer>
      `)
      drawers.push(html`
        <ribbon-drawer label="Metadata" icon="Properties" layout="document-head"
          @document-head-element-options-request=${(event: CustomEvent<{id: string}>) => {
            this.documentHeadAttributeEditorId = event.detail.id
          }}
        >
          <document-head-editor
            mode="common"
            expanded
            .state=${this.documentHead}
            .attributeEditorId=${this.documentHeadAttributeEditorId}
          ></document-head-editor>
          <document-head-editor
            mode="advanced"
            .state=${this.documentHead}
            .attributeEditorId=${this.documentHeadAttributeEditorId}
          ></document-head-editor>
        </ribbon-drawer>
      `)
    }
    return drawers
  }

  private selectDocumentTemplate(mode: DocumentLayoutMode) {
    const picker = this.renderRoot.querySelector<HTMLDetailsElement>(".template-picker")
    if(picker) {
      picker.open = false
      picker.querySelector("summary")?.focus()
    }
    this.dispatchEvent(new CustomEvent("document-layout-change", {detail: {mode}, bubbles: true, composed: true}))
  }

  selectTool(tool: ToolboxTool | null) {
    if(tool === "Style" && !this.showStyleToolbox) return
    const nextTool = tool
    if(this.htmlPending && nextTool !== "Edit") return
    if(this.activeTool === nextTool) return
    if(nextTool === null) this.advancedOpen.clear()
    const previousMenu = this.activeMenu
    this.activeTool = nextTool
    if(nextTool) {
      this.activeMenu = nextTool === "Review" ? "Edit" : nextTool
      if(nextTool !== "Style" || previousMenu === nextTool) {
        this.dispatchEvent(new Event("element-style-state-request", {bubbles: true, composed: true}))
      }
    }
    this.dispatchEvent(new CustomEvent<{tool: ToolboxTool | null}>("toolbox-change", {
      detail: {tool: nextTool},
      bubbles: true,
      composed: true,
    }))
  }

  private renderEditModeFooter() {
    return html`<footer class="edit-mode-footer">
      <div class="developer-console-controls" role="group" aria-label="Developer console controls">
        <button class="developer-console-toggle" type="button" aria-label="Developer console" title="Developer console"
          aria-pressed=${this.consoleOpen} ?disabled=${this.htmlPending}
          @click=${() => this.dispatchEvent(new CustomEvent("developer-console-change", {detail: {enabled: !this.consoleOpen}, bubbles: true, composed: true}))}
        >${ribbonIcon("Develop")}<span>Developer console</span></button>
        ${this.consoleOpen ? html`<button class="console-close" type="button" aria-label="Close developer console" title="Close developer console"
          ?disabled=${this.htmlPending}
          @click=${() => this.dispatchEvent(new CustomEvent("developer-console-change", {detail: {enabled: false}, bubbles: true, composed: true}))}
        >${ribbonIcon("Reject")}</button>` : ""}
      </div>
    </footer>`
  }

  protected willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed)
    if(changed.has("activeTool") && this.activeTool === null) this.advancedOpen.clear()
    if(!this.showStyleToolbox && this.activeTool === "Style") {
      this.selectTool(null)
      this.activeMenu = "Edit"
    }
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if(this.activeTool !== "Edit" || !this.documentSelected) {
      this.documentHeadAttributeEditorId = ""
    }
    if(changed.has("activeTool")) {
      if(this.activeTool === "Review") {
        this.dispatchEvent(new Event("history-state-request", {bubbles: true, composed: true}))
      }
      else if(changed.get("activeTool") === "Review") {
        this.dispatchEvent(new Event("history-preview-clear", {bubbles: true, composed: true}))
      }
    }
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer").forEach(drawer => {
      drawer.collapsed = false
      drawer.pane = true
      void drawer.updateComplete.then(() => {
        if(!drawer.isConnected || !this.activeTool) return
        if(drawer.expandable && this.advancedOpen.get(`${drawer.layout}:${drawer.label}`)) drawer.openDrawer()
        else drawer.closeDrawer()
      })
      drawer.inert = this.historyState.preview !== null && drawer.layout !== "history-versions"
    })
  }

  render() {
    return html`
      <div
        class="toolbox"
        @ribbon-drawer-toggle=${this.rememberAdvancedState}
        @pointerdown=${this.handleRibbonPointerDown}
        @mousedown=${this.handleRibbonPointerDown}
        @focusin=${this.handleRibbonInputFocusIn}
        @focusout=${this.handleRibbonInputFocusOut}
        @change=${this.handleRibbonInputChange}
        @keydown=${this.handleRibbonInputKeydown}
      >
        <div class="toolbox-tabs-area">
          <div class="toolbox-tabs" role="tablist" aria-label="Toolbox">
            ${tools.filter(tool => tool.label !== "Style" || this.showStyleToolbox).map(tool => {
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
        </div>
        <widget-grouping-dialog></widget-grouping-dialog>
        <aside
          id="toolbox-pane"
          class="toolbox-pane"
          role="tabpanel"
          aria-labelledby=${this.activeTool ? `toolbox-tab-${this.activeTool.toLowerCase()}` : ""}
          aria-label=${this.activeTool ? `${this.activeTool} tools` : "Toolbox"}
          ?hidden=${this.activeTool === null}
        >
          <div class="toolbox-pane-content" ?inert=${this.htmlPending || this.historyState.preview !== null && this.activeTool !== "Review"}>
            ${this.activeTool === "Edit" ? this.renderUniversalStyleDrawer() : ""}
            ${this.activeTool === "Edit" ? this.renderWidgetSharing() : ""}
            ${this.activeTool ? this.renderDrawers() : ""}
          </div>
          ${(this.activeTool === "Edit" || this.consoleOpen) ? this.renderEditModeFooter() : ""}
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
