import {css, html, nothing} from "lit"
import {repeat} from "lit/directives/repeat.js"
import {aiChatStyles} from "./ai-chat.styles"
import {emptyDocumentHeadState, type DocumentHeadState} from "../document-head"
import "./document-head-editor"
import type {SelectionPathItem} from "../editor-bridge"
import {emptyProofreadingState, type ProofreadingAction, type ProofreadingState} from "../editor-bridge"
import {ribbonIcon} from "../ribbon-icons"
import {EditingControls} from "./editing-controls"
import {contextDrawerPolicy} from "./ribbon-menu-config"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenuGroup} from "./ribbon-menu"
import {documentLayoutPreviewStyles, renderDocumentLayoutCard, renderDocumentLayoutPreview, documentLayoutLabel, documentLayoutModes} from "./layout-preview"
import type {DocumentLayoutMode, DocumentLayoutState} from "../document-layout"

export type ToolboxTool = "Edit" | "Style" | "AI" | "Review"

const tools: readonly {label: ToolboxTool, icon: string}[] = [
  {label: "Edit", icon: "Pencil"},
  {label: "Style", icon: "Theme"},
  {label: "AI", icon: "AI"},
  {label: "Review", icon: "Grammar"},
]

/** Document toolbox presented beside the breadcrumb rather than as top-level
 * ribbon tabs. Its pane reuses the ribbon's established controls so
 * commands, selection preservation, and specialized editors keep one event
 * contract. */
export class DomEditorToolbox extends EditingControls {
  protected usesNativePointerInteraction(event: MouseEvent) {
    return event.composedPath().some(target => target instanceof HTMLElement && target.classList.contains("ai-toolbox-content"))
  }

  protected renderGraphicDrawer() {
    return super.renderGraphicDrawer(true)
  }

  static properties = {
    ...EditingControls.properties,
    disableAI: {type: Boolean, attribute: "disable-ai", reflect: true},
    aiSidebar: {type: Boolean, attribute: "ai-sidebar", reflect: true},
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
    proofreadingState: {attribute: false},
  }

  disableAI = false
  aiSidebar = false

  static styles = css`
    ${aiChatStyles}
    ${EditingControls.styles}

  .developer-console-controls {display: flex; align-items: center; gap: 0; background: #e9e9e9}
  .developer-console-controls button {box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 32px; padding: .3rem .5rem; border: 0; border-radius: 0; background: transparent; color: #46576a; font: 600 .72rem/1 system-ui, sans-serif; cursor: pointer}
  .developer-console-controls button[aria-pressed="true"] {color: #153b5c; background: #e9e9e9}
  .developer-console-controls button:hover:not(:disabled) {color: #153b5c; background: #e9e9e9}
  .developer-console-controls button:focus-visible {outline: 2px solid #3977c7; outline-offset: -2px}
  .developer-console-controls button:disabled {opacity: .6; cursor: default}
  .developer-console-controls svg {display: block; width: 15px; height: 15px}


    .widget-sharing {padding: .75rem 0; display: grid; gap: .5rem; border-bottom: 1px solid var(--sl-color-neutral-200, #ddd)}
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
    }

    :host {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 30px minmax(0, 1fr);
      position: relative;
      z-index: 2;
      align-self: stretch;
      width: 122px;
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
      width: 94px;
    }

    :host([disable-ai]:not([active-tool])) {width: 94px}
    :host([disable-ai]:not([show-style-toolbox]):not([active-tool])) {width: 66px}

    :host([active-tool]) {
      width: 216px;
    }

    :host([ai-sidebar]) {grid-template-rows: 30px minmax(0, 1fr)}
    :host([ai-sidebar]) .toolbox-tab:not([data-active]) {display: none}
    .ai-toolbox-content {flex: 1; min-height: 0; height: 100%; overflow: hidden}
    .ai-toolbox-content .ai-chat-panel[data-open] {
      display: flex; flex-direction: column; position: relative; inset: auto;
      width: 100%; min-width: 0; max-width: none; height: 100%; max-height: none;
      border: 0; border-radius: 0; box-shadow: none; background: #f2f2f2;
      position-anchor: auto;
    }
    .ai-toolbox-content .ai-chat-brand-button {display: none}
    .ai-toolbox-content .ai-chat-header {
      position: static; flex: 0 0 auto; height: auto; padding: .5rem;
      background: #f2f2f2;
    }
    .ai-toolbox-content .ai-chat-header-button-label {display: none}
    .ai-toolbox-content .ai-chat-header-button {width: 2rem; padding: 0}
    .ai-toolbox-content .ai-chat-switcher {padding-right: 1.75rem; background-position: right .5rem center}
    .ai-toolbox-content .ai-chat-messages {
      position: static; flex: 1 1 0; min-height: 0; padding: .65rem; background: #f2f2f2;
    }
    .ai-toolbox-content .ai-chat-message {max-width: 100%; overflow-wrap: anywhere}
    .ai-toolbox-content .ai-chat-panel[data-open] .ai-chat-composer {
      position: static; flex: 0 0 auto; height: 7rem; padding: 0;
    }
    .ai-toolbox-content .ai-chat-panel[data-open] .ai-composer-surface {
      border: 0; border-radius: 0;
    }
    .ai-toolbox-content .ai-chat-panel[data-open] .ai-composer-surface:focus-within {
      box-shadow: inset 0 0 0 1px #3977c7;
    }
    .ai-toolbox-content[hidden] {display: none}
    :host([active-tool="AI"]) .toolbox-pane-content {overflow: hidden}

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

    .toolbox-tab[data-active]:has([data-tool="Review"]) {
      margin-right: 4px;
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

    .toolbox-tab[data-available] .toolbox-tab-button {
      justify-content: flex-end;
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

    .toolbox-tab[data-hover-kind="spelling"] .toolbox-tab-icon {color: #c62828}
    .toolbox-tab[data-hover-kind="grammar"] .toolbox-tab-icon {color: #1769aa}

    .toolbox-tab-button:focus-visible,
    .toolbox-tab-close:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .toolbox-tab-icon {
      position: relative;
      display: block;
      flex: 0 0 17px;
      width: 17px;
      height: 17px;
    }

    .proofreading-error-badge {
      position: absolute;
      top: -4px;
      right: -5px;
      display: grid;
      place-items: center;
      width: 12px;
      height: 12px;
      border: 1px solid #fff;
      border-radius: 50%;
      color: #fff;
      background: #b42318;
      font: 700 9px/1 system-ui, sans-serif;
    }

    .proofreading-section {
      display: grid;
      align-content: start;
      gap: .55rem;
      padding: .75rem;
      color: #2f3742;
    }
    .proofreading-section h2 {display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin: 0; font-size: .95rem; font-weight: 650}
    .proofreading-status {margin: 0; color: #64748b; font-size: .75rem}
    .proofreading-spinner {
      box-sizing: border-box;
      flex: 0 0 auto;
      width: .9rem;
      height: .9rem;
      border: 2px solid #cbd5e1;
      border-top-color: #3977c7;
      border-radius: 50%;
      animation: proofreading-spin .75s linear infinite;
    }
    @keyframes proofreading-spin {to {transform: rotate(360deg)}}
    @media (prefers-reduced-motion: reduce) {.proofreading-spinner {animation-duration: 2s}}
    .proofreading-error {
      display: grid;
      gap: .5rem;
      margin: .5rem;
      padding: .6rem;
      border: 1px solid #f1b4ae;
      border-radius: .35rem;
      color: #6d1a14;
      background: #fff5f4;
      font-size: .75rem;
    }

    .proofreading-error button,
    .proofreading-retry {
      justify-self: start;
      padding: .3rem .55rem;
      border: 1px solid #b42318;
      border-radius: .25rem;
      color: #6d1a14;
      background: #fff;
      font: inherit;
      cursor: pointer;
    }

    .proofreading-error button:focus-visible,
    .proofreading-retry:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 2px;
    }

    .proofreading-issues {display: grid; gap: .5rem}
    .proofreading-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: .35rem;
      padding: .55rem;
      border: 1px solid #d5dce5;
      border-radius: .4rem;
      background: #fff;
      box-shadow: 0 1px 2px rgb(31 41 55 / 5%);
    }
    .proofreading-card[data-hover-kind="spelling"] {border-color: #c62828; background: #fff6f6}
    .proofreading-card[data-hover-kind="grammar"] {border-color: #1769aa; background: #f3f8fd}
    .proofreading-issue {
      grid-column: 1 / -1;
      display: grid;
      gap: .22rem;
      width: 100%;
      min-width: 0;
      padding: 0;
      border: 0;
      text-align: left;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .proofreading-issue:hover:not(:disabled) .proofreading-text {color: #175a9e}
    .proofreading-kind {color: #64748b; font-size: .62rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase}
    .proofreading-message, .proofreading-text {min-width: 0; overflow-wrap: anywhere}
    .proofreading-message {font-size: .72rem; line-height: 1.35}
    .proofreading-text {font-size: .78rem; font-weight: 650}
    .proofreading-suggestion {
      justify-self: start;
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
      padding: .3rem .5rem;
      border: 1px solid #b8d6f5;
      border-radius: .3rem;
      color: #154d80;
      background: #eff7ff;
      font: 600 .72rem/1.2 system-ui, sans-serif;
      cursor: pointer;
    }
    .proofreading-ignore {
      justify-self: end;
      padding: .25rem .35rem;
      border: 0;
      color: #64748b;
      background: transparent;
      font: .68rem/1.2 system-ui, sans-serif;
      cursor: pointer;
    }
    .proofreading-card button:disabled {opacity: .5; cursor: default}
    .proofreading-card button:focus-visible {outline: 2px solid #3977c7; outline-offset: 2px}

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

    :host([active-tool="Edit"]) .toolbox-pane-content {
      scrollbar-gutter: stable both-edges;
      --ribbon-drawer-pane-padding-inline: 0;
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
      padding: 0.65rem 0;
      color: #52606d;
      font-size: 0.75rem;
    }

    ${documentLayoutPreviewStyles}

    .document-layout-zoom { margin: 0; }
    .document-layout-picker { position: relative; }
    .document-layout-picker summary { position: relative; list-style: none; }
    .document-layout-picker summary::-webkit-details-marker { display: none; }
    .document-layout-picker summary::after {
      content: "⌄";
      position: absolute;
      right: 0.5rem;
      bottom: 0.3rem;
      font-size: 1rem;
    }
    .document-layout-picker[open] summary::after { content: "⌃"; }
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
  proofreadingState: ProofreadingState = emptyProofreadingState()

  private dispatchProofreadingAction(action: ProofreadingAction) {
    this.dispatchEvent(new CustomEvent<ProofreadingAction>("proofreading-action", {
      detail: action, bubbles: true, composed: true,
    }))
  }

  private renderProofreadingSection() {
    const state = this.proofreadingState
    const hoveredIssue = state.issues.find(issue => issue.id === state.hoveredIssueId)
    const editingLocked = this.htmlPending || this.historyState.preview !== null
    const cardsLocked = editingLocked || !state.ready || state.loading
    return html`<section class="proofreading-section" aria-labelledby="proofreading-title">
      <h2 id="proofreading-title">Spelling &amp; Grammar
        ${!state.error && (!state.ready || state.loading) ? html`<span class="proofreading-spinner" role="status" aria-label="Loading spelling and grammar"></span>` : ""}
        ${state.checking && state.ready && !state.loading && !state.error ? html`<span class="proofreading-spinner" role="status" aria-label="Checking spelling and grammar"></span>` : ""}
      </h2>
      ${state.error ? html`<div class="proofreading-error" role="alert">
        <span>Could not load spelling &amp; grammar checking.</span>
        <button class="proofreading-retry" type="button" ?disabled=${editingLocked}
          @click=${() => this.dispatchProofreadingAction({type: "retryProofreading"})}>Retry</button>
      </div>` : ""}
      ${state.ready && !state.error && !state.checking && state.issues.length === 0 ? html`<p class="proofreading-status">No spelling or grammar issues found.</p>` : ""}
      <div class="proofreading-issues">
        ${repeat(state.issues, issue => issue.id, issue => html`<article class="proofreading-card" data-hover-kind=${issue.id === hoveredIssue?.id ? issue.kind : nothing}>
          <button class="proofreading-issue" type="button" ?disabled=${cardsLocked}
            aria-label=${`Go to ${issue.kind} issue: ${issue.text}`}
            @click=${() => this.dispatchProofreadingAction({type: "selectProofreadingIssue", id: issue.id})}>
            <span class="proofreading-kind">${issue.kind === "spelling" ? "Spelling" : "Grammar"}</span>
            <span class="proofreading-message">${issue.message}</span>
            <span class="proofreading-text">${issue.text}</span>
          </button>
          ${issue.suggestions.map((suggestion, index) => html`<button class="proofreading-suggestion" type="button"
            ?disabled=${cardsLocked} aria-label=${`Apply suggestion: ${suggestion.kind === "remove" ? "Remove" : suggestion.kind === "insertAfter" ? `Add ${suggestion.text}` : suggestion.text}`}
            @click=${() => this.dispatchProofreadingAction({type: "applyProofreadingSuggestion", id: issue.id, index})}>
            ${suggestion.kind === "remove" ? "Remove" : suggestion.kind === "insertAfter" ? `Add ${suggestion.text}` : suggestion.text}
          </button>`)}
          ${issue.kind === "spelling" ? html`<button class="proofreading-ignore proofreading-add-word" type="button" ?disabled=${cardsLocked}
            aria-label=${`Add ${issue.text} to local dictionary`}
            @click=${() => this.dispatchProofreadingAction({type: "addProofreadingWord", id: issue.id})}>Add to dictionary</button>` : ""}
          <button class="proofreading-ignore" type="button" ?disabled=${cardsLocked}
            @click=${() => this.dispatchProofreadingAction({type: "ignoreProofreadingIssue", id: issue.id})}>Ignore</button>
        </article>`)}
      </div>
    </section>`
  }

  protected get elementStyleEditorOrientation(): "vertical" {
    return "vertical"
  }

  private get editTypeLabel() {
    if(this.documentSelected) return "Document"
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
    if(this.activeTool === "AI") return []
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
        <ribbon-drawer label="Layouts" icon="Layout" layout="document-layout">
          <div class="document-layout-controls">
            <details class="document-layout-picker" @keydown=${(event: KeyboardEvent) => {
              if(event.key !== "Escape") return
              const picker = event.currentTarget as HTMLDetailsElement
              picker.open = false
              picker.querySelector("summary")?.focus()
            }}>
              <summary class="layout-preset" aria-label=${`Current layout: ${documentLayoutLabel(this.documentLayout.mode)}. Choose layout`}>
                ${renderDocumentLayoutPreview(this.documentLayout.mode)}
              </summary>
              <div class="document-layout-choices" role="group" aria-label="Layouts">
                ${documentLayoutModes.filter(mode => mode !== this.documentLayout.mode).map(mode => renderDocumentLayoutCard(
                  mode, this.documentLayout, this.historyState.preview !== null || this.htmlPending,
                  selected => this.selectDocumentLayout(selected),
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

  private selectDocumentLayout(mode: DocumentLayoutMode) {
    const picker = this.renderRoot.querySelector<HTMLDetailsElement>(".document-layout-picker")
    if(picker) {
      picker.open = false
      picker.querySelector("summary")?.focus()
    }
    this.dispatchEvent(new CustomEvent("document-layout-change", {detail: {mode}, bubbles: true, composed: true}))
  }

  selectTool(tool: ToolboxTool | null) {
    if(tool === "AI" && this.disableAI) return
    if(tool === "Style" && !this.showStyleToolbox) return
    const nextTool = tool
    if(this.htmlPending && nextTool !== "Edit") return
    if(this.activeTool === nextTool) return
    if(nextTool === null) this.advancedOpen.clear()
    const previousMenu = this.activeMenu
    this.activeTool = nextTool
    if(nextTool) {
      this.activeMenu = nextTool === "Review" || nextTool === "AI" ? "Edit" : nextTool
      if(nextTool !== "AI" && (nextTool !== "Style" || previousMenu === nextTool)) {
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
    if(this.disableAI && this.activeTool === "AI") this.selectTool(null)
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
            ${tools.filter(tool => (tool.label !== "Style" || this.showStyleToolbox) && (tool.label !== "AI" || !this.disableAI)).map(tool => {
              const active = this.activeTool === tool.label
              const tabId = `toolbox-tab-${tool.label.toLowerCase()}`
              const contextualLabel = tool.label === "Edit" ? this.editTypeLabel : null
              const toolLabel = tool.label === "AI" ? "Ask AI" : tool.label
              const label = contextualLabel ?? toolLabel
              return html`
                <div
                  class="toolbox-tab"
                  ?data-active=${active}
                  ?data-contextual=${contextualLabel !== null}
                  ?data-available=${contextualLabel !== null && this.activeTool === null}
                  data-hover-kind=${tool.label === "Review" && this.activeTool !== "Review" ? this.proofreadingState.issues.find(issue => issue.id === this.proofreadingState.hoveredIssueId)?.kind ?? nothing : nothing}
                >
                  <button
                    id=${tabId}
                    class="toolbox-tab-button"
                    data-tool=${tool.label}
                    type="button"
                    role="tab"
                    aria-label=${tool.label === "Review" && this.proofreadingState.error
                      ? "Review. Spell and grammar checking unavailable"
                      : contextualLabel ? `Edit ${contextualLabel}` : toolLabel}
                    title=${tool.label === "Review" && this.proofreadingState.error
                      ? "Spell and grammar checking unavailable"
                      : contextualLabel ? `Edit ${contextualLabel}` : toolLabel}
                    aria-controls="toolbox-pane"
                    aria-selected=${active}
                    ?disabled=${this.htmlPending && tool.label !== "Edit"}
                    @click=${() => this.selectTool(tool.label)}
                  >
                    <span class="toolbox-tab-icon" aria-hidden="true">
                      ${ribbonIcon(tool.icon)}
                      ${tool.label === "Review" && this.proofreadingState.error ? html`<span class="proofreading-error-badge">!</span>` : ""}
                    </span>
                    <span
                      class="toolbox-tab-label"
                      ?data-contextual=${contextualLabel !== null}
                      aria-hidden=${!active}
                    >${label}</span>
                  </button>
                  <button
                    class="toolbox-tab-close"
                    type="button"
                    aria-label=${`Close ${toolLabel}`}
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
            ${this.activeTool === "Review" ? this.renderProofreadingSection() : ""}
            ${this.activeTool === "Edit" ? this.renderUniversalStyleDrawer() : ""}
            ${this.activeTool === "Edit" ? this.renderWidgetSharing() : ""}
            ${this.activeTool && this.activeTool !== "AI" ? this.renderDrawers() : ""}
            <div class="ai-toolbox-content" ?hidden=${this.activeTool !== "AI"}></div>
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
