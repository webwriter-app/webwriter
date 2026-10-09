import {css, html, svg, nothing, type TemplateResult} from "lit"
import {repeat} from "lit/directives/repeat.js"
import {aiChatStyles} from "./ai-chat.styles"
import {proofreadingCardStyles, renderProofreadingCard} from "./proofreading-card"
import {emptyDocumentHeadState, type DocumentHeadState} from "../document-head"
import "./document-head-editor"
import type {SelectionPathItem, SelectedElementTypeState, ElementSelectionType} from "../editor-bridge"
import {emptyProofreadingState, type ProofreadingAction, type ProofreadingState} from "../editor-bridge"
import {ribbonIcon, ribbonOptionIcon} from "../ribbon-icons"
import {EditingControls} from "./editing-controls"
import {contextDrawerPolicy} from "./ribbon-menu-config"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenuGroup} from "./ribbon-menu"
import {documentLayoutPreviewStyles, renderDocumentLayoutCard, renderDocumentLayoutPreview, documentLayoutLabel, documentLayoutModes} from "./layout-preview"
import type {DocumentLayoutMode, DocumentLayoutState} from "../document-layout"
import {floatSideFromStyles, elementStyleCategories, specializedStyleDefinitions, specializedElementStyle, type FloatSide} from "../element-styles"
import {mediaAttributeOptions, isMediaType, type MediaType, type MediaAttributeOption} from "../media"
import {MATH_NAMESPACE} from "../math"
import {canonicalMarkName} from "../marks"
import "./style-combobox"
import {defaultGraphicShapePaint, graphicShapeOptions, SVG_NAMESPACE, type GraphicShapePaint} from "../graphic"
import type {WidgetOptionState, WidgetOptionValue} from "../widget-options"

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

  protected renderTableStructureControls() {
    return super.renderTableStructureControls(false)
  }

  static properties = {
    ...EditingControls.properties,
    shapePaint: {attribute: false},
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
    narrowLayoutPreview: {type: Boolean, attribute: false},
    proofreadingState: {attribute: false},
    disableSpellChecking: {type: Boolean},
  }

  shapePaint: Required<GraphicShapePaint> = {...defaultGraphicShapePaint}
  private shapeFillColor = "#ffffff"
  private selectedShapeFillColor = "#ffffff"

  disableAI = false
  aiSidebar = false
  narrowLayoutPreview = false

  static styles = css`
    ${aiChatStyles}
    ${proofreadingCardStyles}
    ${EditingControls.styles}

  .developer-console-controls {display: flex; align-items: center; gap: 0; background: #e9e9e9}
  .developer-console-controls button {box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 32px; padding: .3rem .5rem; border: 0; border-radius: 0; background: transparent; color: #46576a; font: 600 .72rem/1 system-ui, sans-serif; cursor: pointer}
  .developer-console-controls button[aria-pressed="true"] {color: #153b5c; background: #e9e9e9}
  .developer-console-controls button:hover:not(:disabled) {color: #153b5c; background: #e9e9e9}
  .developer-console-controls button:focus-visible {outline: 2px solid #3977c7; outline-offset: -2px}
  .developer-console-controls button:disabled {opacity: .6; cursor: default}
  .developer-console-controls svg {display: block; width: 15px; height: 15px}


    .shape-paint-controls { grid-column: 1 / -1; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr); gap: .35rem; color: #2f3742; font: .68rem/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .shape-paint-controls label, .shape-fill-field { display: grid; grid-template-columns: 4.4rem minmax(0, 1fr); align-items: center; gap: .35rem; min-width: 0; }
    .shape-paint-controls style-combobox { width: 100%; min-width: 0; }
    .shape-color-control { display: flex; box-sizing: border-box; height: 1.7rem; border: var(--editor-control-border-width, .5px) solid #c5ccd5; border-radius: 4px; background: transparent; }
    .shape-color-control:focus-within { box-shadow: 0 0 0 2px #b9d7f5; }
    .shape-color-control input { flex: 1; box-sizing: border-box; width: 0; min-width: 0; height: 100%; padding: 3px; border: 0; border-radius: 4px; background: transparent; outline: none; }
    .shape-color-control input::-webkit-color-swatch-wrapper { padding: 0; }
    .shape-color-control input::-webkit-color-swatch { border: 0; }
    .shape-color-control button { padding: 0 .4rem; border: 0; border-left: var(--editor-control-border-width, .5px) solid #c5ccd5; border-radius: 0 4px 4px 0; background: transparent; color: inherit; cursor: pointer; }
    .shape-color-control button[aria-pressed="true"] { background: #e2edf8; color: #375d84; }
    .shape-color-control button:hover:not(:disabled) { background: #edf3f9; }
    .shape-color-control:has(input:disabled) { opacity: .55; }

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

    .layout-action-controls {grid-column: 1 / -1; display: grid; gap: .45rem; padding: .4rem .5rem; font: 12px/1.35 system-ui, sans-serif}
    .layout-action-controls button {min-height: 1.8rem; padding: .25rem .45rem; border: 1px solid #a8a8a8; border-radius: .2rem; background: #f7f7f7; color: #2f3742; font: inherit; cursor: pointer}
    .layout-action-controls button:hover:not(:disabled) {background: #e9eef5}
    .layout-action-controls button[aria-pressed="true"] {background: #e2edf8; border-color: #c5ccd5; color: #375d84}
    .layout-action-controls button:focus-visible {outline: 2px solid #3977c7; outline-offset: 1px}
    .layout-action-row {display: flex; flex-wrap: wrap; gap: .25rem}
    .float-action-controls {padding: .4rem 0; gap: .125rem}
    .float-placement-label {font-size: .65rem; color: var(--sl-color-neutral-600, #666)}
    .float-button-group {display: flex; width: 100%; gap: 0}
    .float-button-group button {display: grid; place-items: center; flex: 1 1 0; min-width: 0; padding: .35rem; border-width: var(--editor-control-border-width, .5px); border-radius: 0}
    .float-button-group .float-move {flex: 0 0 auto; padding: .35rem .2rem}
    .float-button-group button + button {margin-left: -.5px}
    .float-button-group button:first-child {border-radius: .2rem 0 0 .2rem}
    .float-button-group button:last-child {border-radius: 0 .2rem .2rem 0}
    .float-button-group button[aria-pressed="true"], .float-button-group button:focus-visible {position: relative; z-index: 1}
    .float-button-group svg {display: block; width: 1.25rem; height: 1.25rem}
    .float-button-group .float-move svg {width: .875rem; height: .875rem}
    .caption-button-group {display: grid; grid-template-columns: 1.6rem repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, auto)}
    .caption-button-group button {min-height: 1.55rem; padding: .1rem .25rem; margin: 0; border-radius: 0}
    .caption-button-group button + button {margin-left: -.5px}
    .caption-button-group .caption-none {grid-row: 1 / 3; padding: .15rem .1rem; border-radius: .2rem 0 0 .2rem}
    .caption-button-group button.caption-above-right {border-radius: 0 .2rem 0 0}
    .caption-button-group button.caption-below-right {border-radius: 0 0 .2rem 0}
    .caption-button-group [class^="caption-below"] {margin-top: -.5px}


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
    .toolbox-tab[data-hover-kind="style"] .toolbox-tab-icon {color: #7b3fbb}

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
    .proofreading-check {display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; margin-left: auto; padding: .25rem; border: 0; border-radius: .25rem; color: inherit; background: transparent; cursor: pointer}
    .proofreading-check svg {display: block; width: 1rem; height: 1rem}
    .proofreading-check:hover:not(:disabled) {background: #e7eef5}
    .proofreading-check:focus-visible {outline: 2px solid #3977c7; outline-offset: 1px}
    .proofreading-check:disabled {opacity: .45; cursor: default}
    .proofreading-status {margin: 0; color: #64748b; font-size: .75rem}
    .proofreading-toggle {display: flex; align-items: center; gap: .4rem; font-size: .75rem; color: #475569}
    .proofreading-toggle input {margin: 0; accent-color: #1769aa}
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
      padding-right: 2px;
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

    .specialized-widget-primary {font: .68rem/1.2 system-ui, sans-serif;}
    .specialized-options .develop-field, .specialized-widget-primary .develop-field {display: grid; grid-template-columns: 4.4rem minmax(0, 1fr); gap: .35rem; align-items: center;}
    .specialized-widget-primary input, .specialized-widget-primary select {height: 1.7rem; border: 1px solid #c5ccd5; border-radius: 4px; background: transparent; font: inherit;}
    .specialized-choice-group {display: grid; grid-template-columns: repeat(var(--choice-columns), minmax(0, 1fr)); gap: 0; padding: 0 .5px .5px 0; background: transparent; min-width: 0; min-height: 1.7rem; border: 0; border-radius: 0; overflow: visible;}
    .specialized-choice-group button {box-sizing: border-box; margin: 0 -.5px -.5px 0; min-height: 1.6rem; min-width: 0; padding: .15rem .2rem; border: var(--editor-control-border-width, .5px) solid #c5ccd5; background: #f2f2f2; color: inherit; font: .6rem system-ui, sans-serif; cursor: pointer;}
    .specialized-choice-group button:first-child {border-top-left-radius: 4px;}
    .specialized-choice-group button:last-child {border-bottom-right-radius: 4px;}
    .specialized-choice-group button[data-top-right] {border-top-right-radius: 4px;}
    .specialized-choice-group button[data-bottom-left] {border-bottom-left-radius: 4px;}
    .specialized-choice-group button[aria-pressed="true"] {background: #e2edf8; color: #375d84;}
    .specialized-choice-group button {display: flex; align-items: center; justify-content: center; gap: .2rem;}
    .specialized-choice-group svg {width: 1rem; height: 1rem; display: block;}
    .specialized-choice-group button:hover {background: #edf3f9;}
    .specialized-choice-group button:focus-visible {outline: 2px solid #8eb6df; outline-offset: -2px;}
    .media-toolbox-controls .media-attribute style-combobox {width: 100%;}
    .specialized-options {display: flex; flex-direction: column; gap: .4rem; min-width: 0;}
    .field-label {display: flex; align-items: center; justify-content: space-between; gap: .15rem; min-width: 0;}
    .field-label .field-clear {flex: 0 0 .9rem; width: .9rem; height: .9rem; margin-left: auto; padding: 0; border: 0; background: transparent; color: #666; font: inherit; cursor: pointer;}
    .field-clear:focus-visible {outline: 2px solid #b9d7f5;}
    .specialized-commands {display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; font: .68rem/1.2 system-ui, sans-serif;}
    .specialized-commands .mark-attribute, .specialized-commands .table-caption-toggle {width: 100%;}
    .specialized-options input, .specialized-options select {min-width: 0; border: 1px solid #c5ccd5; border-radius: 4px; background: #fff; font: inherit;}

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
  disableSpellChecking = false

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
    const checkingEnabled = state.enabled && !this.disableSpellChecking
    return html`<section class="proofreading-section" aria-labelledby="proofreading-title">
      <h2 id="proofreading-title">Issues
        ${checkingEnabled && !state.error && (!state.ready || state.loading) ? html`<span class="proofreading-spinner" role="status" aria-label="Loading spelling, grammar and style"></span>` : ""}
        ${checkingEnabled && state.checking && state.ready && !state.loading && !state.error ? html`<span class="proofreading-spinner" role="status" aria-label="Checking spelling, grammar and style"></span>` : ""}
        <button class="proofreading-check" type="button" title="Check for issues" aria-label="Check for issues"
          ?disabled=${editingLocked || this.disableSpellChecking || state.loading || state.checking}
          @click=${() => this.dispatchProofreadingAction({type: "checkProofreading"})}>${ribbonIcon("Refresh")}</button>
      </h2>
      <label class="proofreading-toggle"><input type="checkbox" .checked=${state.documentEnabled}
        ?disabled=${editingLocked || this.disableSpellChecking}
        @change=${(event: Event) => this.dispatchProofreadingAction({type: "setDocumentProofreadingEnabled", enabled: (event.currentTarget as HTMLInputElement).checked})}>
        Check for issues automatically</label>
      ${this.disableSpellChecking ? html`<p class="proofreading-status">Spell checking is disabled for all documents. Enable it in Settings.</p>`
        : !state.documentEnabled ? html`<p class="proofreading-status">Automatic checking is disabled for this document.</p>` : ""}
      ${checkingEnabled && state.error ? html`<div class="proofreading-error" role="alert">
        <span>Could not load proofreading.</span>
        <button class="proofreading-retry" type="button" ?disabled=${editingLocked}
          @click=${() => this.dispatchProofreadingAction({type: "retryProofreading"})}>Retry</button>
      </div>` : ""}
      ${checkingEnabled && state.ready && !state.error && !state.checking && state.issues.length === 0 ? html`<p class="proofreading-status">No spelling, grammar or style issues found.</p>` : ""}
      <div class="proofreading-issues">
        ${checkingEnabled ? repeat(state.issues, issue => issue.id, issue => renderProofreadingCard(issue,
          action => this.dispatchProofreadingAction(action), {disabled: cardsLocked, hovered: issue.id === hoveredIssue?.id})) : nothing}
      </div>
    </section>`
  }

  protected get elementStyleEditorOrientation(): "vertical" {
    return "vertical"
  }

  private get editTypeLabel() {
    const visibleElements = this.selectedElementTypes.filter(group => this.isElementDrawerVisible(group.element.localName, group.element.namespaceURI))
    if(visibleElements.length > 1 || visibleElements.some(group => group.count > 1)) return "Selection"
    if(this.documentSelected) return "Document"
    if(this.sectionSelected && this.sectionType !== "figure") return "Section"
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
    if(this.selectionPath.at(-1)?.icon === "Packages") return "Widget"
    if(this.paragraphSelected) return null
    if(this.elementAttributes && this.isElementDrawerVisible(this.elementAttributes.localName, this.elementAttributes.namespaceURI)) return this.elementAttributes.name
    return null
  }

  protected get currentMenuGroups(): RibbonMenuGroup[] {
    if(this.activeTool === "AI") return []
    return contextDrawerPolicy({
      menu: "Edit",
      surface: "toolbox",
      activeTool: this.activeTool ?? undefined,
      documentSelected: this.documentSelected,
      sectionSelected: this.sectionSelected && this.sectionType !== "figure",
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
      figure: false,
      widget: Boolean(this.widgetOptions),
      attributes: Boolean(this.elementAttributes && this.elementAttributes.localName !== "figure"),
    })
  }

  private get resettableStyles() {
    const documentTarget = this.documentSelected || this.elementStyle.target?.documentRoot || this.elementStyle.target?.localName === "body"
    const properties = documentTarget ? ["background-color"] : [
      "background-color", "color", "border-width", "border-style", "border-color", "padding",
      "width", "height", "margin", "border-radius", "rotate", "scale", "opacity", "box-shadow", "filter",
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
    const disabled = !this.elementStyle.target
    const documentTarget = this.documentSelected || this.elementStyle.target?.documentRoot || this.elementStyle.target?.localName === "body"
    const advancedProperties = documentTarget ? ["background-color"] : ["background-color", "color", "border-width", "padding", "width", "height", "margin", "border-radius", "rotate", "scale", "opacity", "box-shadow", "filter"]
    const setProperties = this.resettableStyles
    const advancedCount = advancedProperties.filter(name => name === "border-width"
      ? ["border-width", "border-style", "border-color"].some(property => Object.hasOwn(setProperties, property))
      : Object.hasOwn(setProperties, name)).length
    return html`
      <ribbon-drawer label="Style" icon="Theme" layout="element-style" show-pane-icon expandable .advancedCount=${advancedCount}
        ?inert=${disabled} aria-disabled=${disabled ? "true" : "false"}
        style=${disabled ? "opacity: 0.5" : ""}>
        <button type="button" class="style-reset" slot="heading-action" title="Reset styles" aria-label="Reset styles"
          ?disabled=${disabled || !Object.keys(this.resettableStyles).length}
          @click=${() => {
            const styles = this.resettableStyles
            if(Object.keys(styles).length) this.dispatchEvent(new CustomEvent("element-style-change", {
              detail: {styles}, bubbles: true, composed: true,
            }))
          }}>${ribbonIcon("Restore")}Reset</button>
        <element-style-editor mode="compact" orientation="vertical" show-presets .propertyNames=${[]} .state=${this.elementStyle}></element-style-editor>
        ${this.renderElementLayoutControls()}
        <element-style-editor slot="more" mode="compact" orientation="vertical"
          .propertyNames=${advancedProperties} .state=${this.elementStyle}></element-style-editor>
      </ribbon-drawer>
    `
  }

  private renderFieldLabel(label: string, hasValue: boolean, clear: () => void, id?: string, disabled = false) {
    return html`<span class="field-label"><span id=${id ?? nothing}>${label}</span>
      <button type="button" class="field-clear" style=${hasValue ? "" : "visibility: hidden"} title=${`Clear ${label}`} aria-label=${`Clear ${label}`}
        ?disabled=${disabled} @click=${clear}>×</button>
    </span>`
  }

  protected get useStyleCombobox() { return true }

  protected renderMediaResourceAttribute(resource: import("../media").TimedMediaResourceType,
    row: import("../media").TimedMediaResourceState, option: MediaAttributeOption) {
    if(option.kind !== "select") return super.renderMediaResourceAttribute(resource, row, option)
    const value = row.attributes[option.name] ?? option.options?.[0]?.value ?? ""
    const options = option.options ?? []
    return html`<div class="media-attribute">${this.renderFieldLabel(option.label, Object.hasOwn(row.attributes, option.name),
      () => this.dispatchMediaResourceAction({action: "set-attribute", resource, index: row.index, expected: row.attributes,
        attribute: option.name, value: null}))}
      <style-combobox .label=${`${resource === "source" ? "Source" : "Track"}: ${option.label}`} .value=${value} .editable=${false}
        .options=${[...(!options.some(item => item.value === value) ? [{value, label: value}] : []), ...options]}
        @combobox-change=${(event: CustomEvent<{value: string}>) => this.dispatchMediaResourceAction({
          action: "set-attribute", resource, index: row.index, expected: row.attributes,
          attribute: option.name, value: event.detail.value || null,
        })}></style-combobox>
    </div>`
  }

  protected renderListNumberInput(name: "start" | "value", value: string, placeholder: string) {
    return html`<style-combobox .showValue=${true} .label=${name === "start" ? "Start at" : "Item number"}
      .value=${value} .placeholder=${placeholder}
      .options=${[{label: "First", value: "1"}, {label: "Second", value: "2"}, {label: "Third", value: "3"}]}
      @combobox-change=${(event: CustomEvent<{value: string}>) => {
        const value = event.detail.value.trim()
        if(!value || Number.isInteger(Number(value))) this.dispatchListAttribute(name, value || null)
      }}></style-combobox>`
  }

  protected renderMediaAttribute(type: MediaType, option: MediaAttributeOption) {
    if(option.kind !== "select") return super.renderMediaAttribute(type, option)
    const fieldLabel = this.renderFieldLabel(option.label, Object.hasOwn(this.media?.attributes ?? {}, option.name),
      () => this.dispatchEvent(new CustomEvent("media-attribute-change", {
        detail: {type, attribute: option.name, value: null}, bubbles: true, composed: true,
      })), `media-label-${option.name}`, !this.mediaSelectionMatches(type))
    if(!option.options?.length || option.options.length > 8 || option.options.some(item => item.label.length > 14)) {
      const active = this.mediaSelectionMatches(type)
      const value = active ? this.media?.attributes[option.name] ?? "" : ""
      const options = option.options ?? []
      return html`<div class="media-attribute">${fieldLabel}
        <style-combobox .label=${`${this.mediaLabel(type)}: ${option.label}`} .editable=${false}
          .value=${value} .disabled=${!active}
          .options=${[...(value && !options.some(item => item.value === value) ? [{value, label: value}] : []), ...options]}
          @combobox-change=${(event: CustomEvent<{value: string}>) => this.dispatchEvent(new CustomEvent("media-attribute-change", {
            detail: {type, attribute: option.name, value: event.detail.value || null}, bubbles: true, composed: true,
          }))}></style-combobox>
      </div>`
    }
    const active = this.mediaSelectionMatches(type)
    const value = active ? this.media?.attributes[option.name] ?? "" : ""
    const columns = Math.min(4, Math.ceil(option.options.length / (option.options.length > 4 ? 2 : 1)))
    return html`<div class="media-attribute">
      ${fieldLabel}
      <div class="specialized-choice-group" style=${`--choice-columns: ${columns}`} role="group" aria-labelledby=${`media-label-${option.name}`}>
        ${option.options.map((item, index) => html`<button type="button"
          ?data-top-right=${index === columns - 1} ?data-bottom-left=${index === Math.floor((option.options!.length - 1) / columns) * columns}
          aria-pressed=${value === item.value} title=${item.label} aria-label=${item.label} ?disabled=${!active}
          @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
          @click=${() => this.dispatchEvent(new CustomEvent("media-attribute-change", {
            detail: {type, attribute: option.name, value: item.value || null}, bubbles: true, composed: true,
          }))}><span aria-hidden="true">${ribbonOptionIcon(option.name, item.value)}</span></button>`)}
      </div>
    </div>`
  }

  protected renderWidgetOptionField(option: WidgetOptionState, dispatch = this.dispatchWidgetOption.bind(this), fieldScope = "") {
    const fieldLabel = this.renderFieldLabel(option.label,
      option.value !== null && option.value !== "" && (!Array.isArray(option.value) || option.value.length > 0),
      () => dispatch(option.name, null), `widget-label-${fieldScope}${option.name}`)
    if(option.type === "number") {
      const candidates = [option.min ?? 0, option.min === undefined ? 1 : option.min + (option.step ?? 1),
        option.max ?? (option.min ?? 0) + 10 * (option.step ?? 1)]
      const presets = [...new Set(candidates)].filter(value => (option.min === undefined || value >= option.min)
        && (option.max === undefined || value <= option.max))
      return html`<div class="develop-field">${fieldLabel}
        <style-combobox .showValue=${true} .label=${option.label} .value=${option.value === null ? "" : String(option.value)}
          placeholder=${option.placeholder ?? "Default"} .options=${presets.map((value, index) => ({value: String(value), label: ["Low", "Medium", "High"][index]}))}
          @combobox-change=${(event: CustomEvent<{value: string}>) => {
            const value = event.detail.value.trim()
            const number = Number(value)
            if(!value || Number.isFinite(number) && (option.min === undefined || number >= option.min)
              && (option.max === undefined || number <= option.max)) dispatch(option.name, value ? number : null)
            else {
              const combo = event.currentTarget as import("./style-combobox").StyleCombobox
              combo.value = option.value === null ? "" : String(option.value)
              combo.close(true)
            }
          }}></style-combobox>
      </div>`
    }
    if(option.type !== "select") return super.renderWidgetOptionField(option, dispatch, fieldScope)
    if(option.multiple || !option.choices?.length || option.choices.length > 8 || option.choices.some(choice => choice.label.length > 14)) {
      const value = option.value === null ? "" : String(option.value)
      const choices = option.choices ?? []
      return html`<div class="develop-field">${fieldLabel}
        <style-combobox .label=${option.label} .editable=${false} .multiple=${Boolean(option.multiple)}
          .values=${Array.isArray(option.value) ? option.value.map(String) : []} .value=${value}
          .options=${[...(!option.multiple ? [{value: "", label: "Default"}] : []),
            ...(!option.multiple && value && !choices.some(choice => choice.value === value) ? [{value, label: value}] : []), ...choices]}
          @combobox-change=${(event: CustomEvent<{value: string, values?: string[]}>) => dispatch(option.name, option.multiple ? event.detail.values ?? [] : event.detail.value || null)}
        ></style-combobox>
      </div>`
    }
    const columns = Math.min(4, Math.ceil(option.choices.length / (option.choices.length > 4 ? 2 : 1)))
    return html`<div class="develop-field" title=${option.description ?? ""}>
      ${fieldLabel}
      <div class="specialized-choice-group" style=${`--choice-columns: ${columns}`} role="group" aria-labelledby=${`widget-label-${fieldScope}${option.name}`}>
        ${option.choices.map((choice, index) => html`<button type="button"
          ?data-top-right=${index === columns - 1} ?data-bottom-left=${index === Math.floor((option.choices!.length - 1) / columns) * columns}
          title=${choice.description ?? choice.label} aria-label=${choice.label}
          aria-pressed=${option.value === choice.value}
          @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
          @click=${() => dispatch(option.name, option.value === choice.value ? null : choice.value)}><span aria-hidden="true">${ribbonOptionIcon(option.name, choice.value)}</span>${choice.label}</button>`)}
      </div>
    </div>`
  }

  private isElementDrawerVisible(localName: string, namespaceURI: string | null | undefined) {
    return !(namespaceURI === "http://www.w3.org/1999/xhtml"
      && (canonicalMarkName(localName) !== null
        || ["li", "dt", "dd", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "summary", "figure", "figcaption"].includes(localName))
      || namespaceURI === MATH_NAMESPACE && localName !== "math"
      || namespaceURI === SVG_NAMESPACE && localName !== "svg")
  }

  protected renderElementAttributesDrawer() {
    if(this.elementAttributes && !this.isElementDrawerVisible(this.elementAttributes.localName, this.elementAttributes.namespaceURI)) return nothing
    return super.renderElementAttributesDrawer()
  }

  private renderSpecializedDrawer(group?: SelectedElementTypeState) {
    const attributes = group?.element ?? this.elementAttributes
    const style = this.elementStyle
    const widgetOptions = group ? group.widget : this.widgetOptions
    const singleTarget = Boolean(group?.count === 1 && this.elementAttributes && attributes
      && (attributes.localName === this.elementAttributes.localName && attributes.namespaceURI === this.elementAttributes.namespaceURI
        && JSON.stringify(attributes.path) === JSON.stringify(this.elementAttributes.path)
        || this.elementAttributes.localName === "figure" && attributes.localName === this.media?.type
          && attributes.path?.length === (this.elementAttributes.path?.length ?? 0) + 1
          && JSON.stringify(attributes.path.slice(0, -1)) === JSON.stringify(this.elementAttributes.path)))
    const selectionType: ElementSelectionType | undefined = group ? {
      localName: group.element.localName, namespaceURI: group.element.namespaceURI,
      ...(group.count === 1 && group.element.localName.includes("-") ? (group.element.attributes.id
        ? {id: group.element.attributes.id} : group.element.path ? {path: group.element.path} : {}) : {}),
    } : undefined
    const scopeChange = (event: CustomEvent) => {
      if(selectionType) event.detail.selectionType = selectionType
    }
    const dispatchOption = (name: string, value: WidgetOptionValue) => {
      this.dispatchEvent(new CustomEvent("widget-option-change", {
        detail: {name, value, ...(selectionType ? {selectionType} : {})}, bubbles: true, composed: true,
      }))
    }
    const localName = group?.element.localName ?? widgetOptions?.localName ?? (this.graphic?.active ? "svg" : this.math?.active ? "math" : this.table?.active ? (style.target?.localName ?? "table")
      : this.media?.type ?? attributes?.localName ?? style.target?.localName)
    if(!localName || localName === "body" || style.target?.documentRoot) return nothing
    const namespaceURI = attributes?.namespaceURI ?? style.target?.namespaceURI
    if(!this.isElementDrawerVisible(localName, namespaceURI)) return nothing
    const profile = specializedElementStyle(localName)
    const widget = Boolean(widgetOptions || localName.includes("-"))
    if(!profile && !widget && !group) return nothing
    const primary = profile?.primary ?? []
    const advanced = profile?.advanced ?? []
    const definitions = [...specializedStyleDefinitions, ...elementStyleCategories.flatMap(category => [...category.basic, ...category.advanced])]
    const properties = [...new Set([...primary, ...advanced])]
    const resetStyles = Object.fromEntries(properties.filter(name => Object.hasOwn(style.inline, name)).map(name => [name, null]))
    const configuredWidgetOptions = widgetOptions?.options.filter(option => group ? group.configuredWidgetOptions.includes(option.name) : option.value !== null && option.value !== "") ?? []
    const count = advanced.filter(name => Object.hasOwn(style.inline, name)).length
      + Object.keys(group ? {} : this.media?.attributes ?? {}).filter(name => name !== "style").length
      + (widgetOptions?.options.slice(3).filter(option => option.value !== null && option.value !== "").length ?? 0)
    const label = group ? attributes!.name : widget ? "Widget" : this.graphic?.active ? "Graphic" : this.math?.active ? "Formula" : this.table?.active && ["table", "td", "th"].includes(localName) ? (localName === "table" ? "Table" : "Table cell")
      : this.media ? this.mediaLabel(this.media.type) : attributes?.name ?? localName
    const commands = group && widgetOptions ? this.renderWidgetOptionsControls(widgetOptions.options.slice(3), dispatchOption, widgetOptions, selectionType)
      : !group || singleTarget ? this.renderSpecializedCommands(group ? dispatchOption : undefined)
      : widgetOptions && widgetOptions.options.length > 3 ? html`${widgetOptions.options.slice(3).map(option => this.renderWidgetOptionField(option, dispatchOption))}` : nothing
    const hasOptions = advanced.length > 0 || commands !== nothing
    return html`<ribbon-drawer label=${label} icon=${attributes?.icon ?? label} .iconUrl=${attributes?.iconUrl ?? ""} layout="element-style"
      .elementCount=${group?.count ?? 1} show-pane-icon ?expandable=${hasOptions} .advancedCount=${count} data-specialized=${localName}
      @element-style-change=${scopeChange} @element-attribute-change=${scopeChange}>
      <button type="button" class="style-reset" slot="heading-action" title="Reset element styles" aria-label="Reset element styles"
        ?disabled=${!Object.keys(resetStyles).length && !configuredWidgetOptions.length}
        @click=${(event: Event) => {
          if(Object.keys(resetStyles).length) event.currentTarget!.dispatchEvent(new CustomEvent("element-style-change", {
            detail: {styles: resetStyles}, bubbles: true, composed: true,
          }))
          configuredWidgetOptions.forEach(option => dispatchOption(option.name, null))
        }}>${ribbonIcon("Restore")}Reset</button>
      ${widgetOptions ? html`<div class="widget-options specialized-widget-primary">${widgetOptions.options.slice(0, 3).map(option => this.renderWidgetOptionField(option, dispatchOption, group ? `${widgetOptions.path.join("-")}-` : ""))}</div>` : nothing}
      <element-style-editor mode="compact" .definitions=${definitions} .propertyNames=${primary} .state=${style}></element-style-editor>
      ${attributes ? html`<element-attribute-editor expanded .mediaOwned=${(!group || singleTarget) && Boolean(this.media)} .state=${attributes}></element-attribute-editor>` : nothing}
      ${hasOptions ? html`<div slot="more" class="specialized-options">
        ${advanced.length ? html`<element-style-editor mode="compact" .definitions=${definitions} .propertyNames=${advanced} .state=${style}></element-style-editor>` : nothing}
        ${commands}
      </div>` : nothing}
    </ribbon-drawer>`
  }

  private renderSpecializedCommands(dispatchOption?: (name: string, value: WidgetOptionValue) => void) {
    if(this.widgetOptions) return this.renderWidgetOptionsControls(this.widgetOptions.options.slice(3), dispatchOption)
    if(this.graphic?.active) {
      const captured = Boolean(this.graphic.capture)
      const count = this.graphic.selectionCount ?? (this.graphic.shape ? 1 : 0)
      return html`<div class="specialized-commands">
        <ribbon-button label="Import graphic" action="import-graphic" icon="Upload"></ribbon-button>
        <ribbon-button label="Save graphic" action="save-graphic" icon="Download"></ribbon-button>
        ${this.graphic.shape === "connector" ? this.renderGraphicConnectorControls(!captured) : nothing}
        <ribbon-button label="Shapes" action="show-shape-keyboard" icon="Graphic" ?disabled=${!captured}></ribbon-button>
        ${this.renderGraphicArrangeControls(count, count > 0, captured)}
        ${["grid", "snap", "guides"].map(option => html`<ribbon-button label=${option[0].toUpperCase() + option.slice(1)}
          action=${`toggle-graphic-option:${option}`} toggle .active=${this.graphic?.options?.[option as "grid" | "snap" | "guides"] ?? true}
          ?disabled=${!captured}></ribbon-button>`)}
        <ribbon-button label="Zoom" icon="Zoom" .dropdown=${this.renderGraphicViewportDropdown()} ?disabled=${!captured}></ribbon-button>
        <ribbon-button label="Fit" action="navigate-graphic:fit-content" icon="Fullscreen" ?disabled=${!captured}></ribbon-button>
      </div>`
    }
    if(this.table?.active) return html`<div class="specialized-commands">${this.renderTableStructureControls()}</div>`
    if(this.media) {
      const type = this.media.type
      return html`<div class="specialized-commands media-toolbox-controls">
        ${isMediaType(type) ? mediaAttributeOptions[type].filter(option => !["width", "height"].includes(option.name))
          .map(option => this.renderMediaAttribute(type, option)) : nothing}
        ${this.renderTimedMediaResources()}
        ${this.renderImageMapControls()}
      </div>`
    }
    if(this.listType === "ol") return this.renderListControls()
    if(this.sectionSelected && this.sectionType !== "figure") return html`<div class="specialized-commands">${this.renderSectionControls()}</div>`
    return nothing
  }

  private setShapePaint(name: keyof GraphicShapePaint, value: string) {
    if(!this.graphic?.active) return
    const count = this.graphic.selectionCount ?? (this.graphic.shape ? 1 : 0)
    if(count > 0) {
      if(name === "fill") {
        const fill = this.graphic.parameters?.fill
        if(value !== "none") this.selectedShapeFillColor = value
        else if(fill && fill !== "none") this.selectedShapeFillColor = fill
      }
      this.dispatchGraphicParameterValue(name, value)
      return
    }
    if(!this.graphic.capture) return
    if(name === "fill" && value !== "none") this.shapeFillColor = value
    this.shapePaint = {...this.shapePaint, [name]: value}
    this.dispatchEvent(new CustomEvent("shape-paint-change", {
      detail: {paint: {...this.shapePaint}}, bubbles: true, composed: true,
    }))
  }

  private renderShapeDrawer() {
    if(!this.graphic?.active) return nothing
    const count = this.graphic.selectionCount ?? (this.graphic.shape ? 1 : 0)
    const selected = count > 0
    const disabled = !selected && !this.graphic.capture
    const option = selected && this.graphic.shape ? graphicShapeOptions.find(option => option.type === this.graphic!.shape) : undefined
    const shapeName = this.graphic.shape
      ? this.graphic.shape[0].toUpperCase() + this.graphic.shape.slice(1).replaceAll("-", " ") : "Shape"
    const label = !selected ? "Preset" : count > 1 ? "Shapes" : option?.label ?? shapeName
    const paint = selected ? {
      fill: this.graphic.parameters?.fill ?? defaultGraphicShapePaint.fill,
      stroke: this.graphic.parameters?.stroke ?? defaultGraphicShapePaint.stroke,
      "stroke-width": this.graphic.parameters?.["stroke-width"] ?? defaultGraphicShapePaint["stroke-width"],
      opacity: this.graphic.parameters?.opacity ?? defaultGraphicShapePaint.opacity,
    } : this.shapePaint
    const fillColor = paint.fill === "none" ? (selected ? this.selectedShapeFillColor : this.shapeFillColor) : paint.fill
    return html`<ribbon-drawer label=${label} icon=${option?.icon ?? "Graphic"} icon-path=${option?.path ?? nothing}
      layout="shape-paint" show-pane-icon .elementCount=${count > 1 ? count : 1}>
      <div class="shape-paint-controls" role="group" aria-label=${selected ? "Selected shape style" : "New shape style"}>
        <div class="shape-fill-field"><span>Fill</span><span class="shape-color-control" role="group" aria-label="Fill color">
          <input type="color" aria-label="Shape key fill color" data-ribbon-input-persistent
            .value=${/^#[0-9a-f]{6}$/i.test(fillColor) ? fillColor : "#ffffff"} ?disabled=${disabled}
            @input=${(event: Event) => this.setShapePaint("fill", (event.target as HTMLInputElement).value)}>
          <button type="button" aria-label="No fill" title="No fill" aria-pressed=${String(paint.fill === "none")} ?disabled=${disabled}
            @pointerdown=${(event: PointerEvent) => event.preventDefault()}
            @click=${() => this.setShapePaint("fill", paint.fill === "none" ? fillColor : "none")}>∅</button>
        </span></div>
        <label><span>Stroke</span><span class="shape-color-control"><input type="color" aria-label="Shape key stroke color" data-ribbon-input-persistent
          .value=${/^#[0-9a-f]{6}$/i.test(paint.stroke) ? paint.stroke : "#334155"} ?disabled=${disabled}
          @input=${(event: Event) => this.setShapePaint("stroke", (event.target as HTMLInputElement).value)}></span></label>
        <label><span>Width</span>${this.renderOptionSelect("Shape key stroke width", paint["stroke-width"],
          [...new Set(["0", "1", "2", "4", "6", "8", "12", paint["stroke-width"]])].map(width => ({value: width, label: width === "0" ? "None" : width})),
          disabled, value => this.setShapePaint("stroke-width", value))}</label>
        <label><span>Opacity</span>${this.renderOptionSelect("Shape key opacity", paint.opacity,
          [...new Set(["1", "0.75", "0.5", "0.25", paint.opacity])].map(opacity => ({value: opacity, label: `${Number(opacity) * 100}%`})),
          disabled, value => this.setShapePaint("opacity", value))}</label>
      </div>
    </ribbon-drawer>`
  }

  protected renderDrawers(): TemplateResult<1>[] {
    if(this.activeTool === "Edit" && this.selectedElementTypes.length) {
      return this.selectedElementTypes.map(group => this.renderSpecializedDrawer(group))
        .filter((drawer): drawer is TemplateResult<1> => drawer !== nothing)
    }
    if(this.activeTool === "Edit" && !this.elementAttributes && !this.math?.active
      && this.currentMenuGroups.length === 1 && this.currentMenuGroups[0].label === "Attributes") {
      const drawers = [html`
        <ribbon-drawer label="Attributes" icon="Develop" layout="attributes">
          <element-attribute-editor disabled></element-attribute-editor>
        </ribbon-drawer>
      `]
      return drawers
    }
    const specialized = this.activeTool === "Edit" && !this.documentSelected ? this.renderSpecializedDrawer() : nothing
    const drawers: TemplateResult<1>[] = specialized !== nothing
      ? [specialized]
      : super.renderDrawers().filter((drawer): drawer is TemplateResult<1> => drawer !== nothing)
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
            <button type="button" class="layout-preview-toggle" title="Narrow preview (360 px)"
              aria-label="Narrow preview (360 px)" aria-pressed=${this.narrowLayoutPreview}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("document-width-preview-change", {
                detail: {narrow: !this.narrowLayoutPreview}, bubbles: true, composed: true,
              }))}>Narrow preview</button>
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

  private renderElementLayoutControls() {
    const target = this.elementStyle.target
    if(this.activeTool !== "Edit"
      || this.documentSelected || target?.documentRoot || target?.localName === "body") return nothing
    const float = target?.float ?? floatSideFromStyles(this.elementStyle.computed.float || "none", {
      getPropertyValue: name => this.elementStyle.inline[name]?.value ?? "",
    })
    const captionPosition = this.captionPosition ?? (this.table?.hasCaption ? "above" : this.figure?.hasCaption ? "below" : "none")
    return html`
        <div class="layout-action-controls float-action-controls">
          ${this.documentLayout.mode === "document" ? html`
          <span class="float-placement-label">Placement</span>
          <div class="float-button-group" role="group" aria-label="Placement">
            <button type="button" class="float-move" aria-label="Move down" title="Move down"
              ?disabled=${float === "none" || this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "moveFloat", direction: "down"}, bubbles: true, composed: true}))}>${ribbonIcon("ArrowDown")}</button>
            ${(["far-left", "none", "far-right"] as const satisfies readonly FloatSide[]).map(side => html`<button type="button"
              aria-label=${side === "none" ? "Clear float" : `Float ${side === "far-left" ? "left" : "right"}`} aria-pressed=${float === side}
              title=${side === "none" ? "Clear float" : `Float ${side === "far-left" ? "left" : "right"}`}
              ?disabled=${this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {
                detail: {type: "setFloat", side}, bubbles: true, composed: true,
              }))}>${ribbonIcon(side === "none" ? "Float none" : side === "far-left" ? "Float left" : "Float right")}</button>`)}
            <button type="button" class="float-move" aria-label="Move up" title="Move up"
              ?disabled=${float === "none" || this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "moveFloat", direction: "up"}, bubbles: true, composed: true}))}>${ribbonIcon("ArrowUp")}</button>
          </div>
          ` : nothing}
          <span class="float-placement-label">Caption</span>
          <div class="float-button-group caption-button-group" role="group" aria-label="Caption">
            <button type="button" class="caption-none" aria-label="No caption" title="No caption" aria-pressed=${captionPosition === "none"}
              ?disabled=${this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {
                detail: {type: "setCaption", position: "none"}, bubbles: true, composed: true,
              }))}>${this.captionIcon("none")}</button>
            ${(["above", "below"] as const).map(position => (["left", "center", "right"] as const).map(alignment => html`<button type="button"
              class=${`caption-${position}-${alignment}`}
              aria-label=${`Caption ${position}, align ${alignment}`} title=${`Caption ${position}, align ${alignment}`}
              aria-pressed=${captionPosition === position && (this.captionAlignment ?? "left") === alignment}
              ?disabled=${this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {
                detail: {type: "setCaption", position, alignment}, bubbles: true, composed: true,
              }))}>${this.captionIcon(position, alignment)}</button>`))}
          </div>
          ${this.layoutError ? html`<p class="document-layout-error" role="alert">${this.layoutError}</p>` : ""}
        </div>
    `
  }

  private captionIcon(position: "none" | "above" | "below", alignment: "left" | "center" | "right" = "left") {
    const x = alignment === "left" ? 6 : alignment === "center" ? 9 : 12
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1"></rect>
      ${position === "none" ? nothing : svg`<line x1=${x} x2=${x + 6} y1=${position === "above" ? 3 : 21} y2=${position === "above" ? 3 : 21}></line>`}
    </svg>`
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
      drawer.inert = drawer.getAttribute("aria-disabled") === "true"
        || this.historyState.preview !== null && drawer.layout !== "history-versions"
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
            ${this.activeTool === "Edit" ? this.renderShapeDrawer() : ""}
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
