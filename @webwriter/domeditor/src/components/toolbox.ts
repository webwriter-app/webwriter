import type {LiveSessionFeedback, LiveSessionLearner} from "../live-session"
import "./float-info"
import type {FloatInfo} from "./float-info"
import {css, html, nothing, type TemplateResult} from "lit"
import {guard} from "lit/directives/guard.js"
import {unsafeSVG} from "lit/directives/unsafe-svg.js"
import {repeat} from "lit/directives/repeat.js"
import {aiChatStyles} from "./ai-chat.styles"
import {proofreadingCardStyles, renderProofreadingCard} from "./proofreading-card"
import {emptyDocumentHeadState, type DocumentHeadField, type DocumentHeadState} from "../document-head"
import "./document-head-editor"
import {defaultCaptionEnumeration} from "../caption-enumeration"
import type {SelectionPathItem, SelectedElementTypeState, ElementSelectionType} from "../editor-bridge"
import {emptyProofreadingState, type ProofreadingAction, type ProofreadingState} from "../editor-bridge"
import {captionIconSource, floatNoneIconSource, ribbonIcon, ribbonOptionIcon} from "../ribbon-icons"
import {EditingControls} from "./editing-controls"
import {contextDrawerPolicy} from "./ribbon-menu-config"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenuGroup} from "./ribbon-menu"
import {documentLayoutPreviewStyles, renderDocumentLayoutCard, documentLayoutModes} from "./layout-preview"
import {choiceGroupStyles} from "./choice-group.styles"
import type {DocumentLayoutMode, DocumentLayoutState} from "../document-layout"
import {floatSideFromStyles, elementStyleCategories, listMarkerImageProperty, specializedStyleDefinitions, specializedElementStyle, type FloatSide} from "../element-styles"
import {mediaCaptureOptions, mediaSourceAttribute, mediaAttributeOptions, type MediaType, type MediaAttributeOption} from "../media"
import {MATH_NAMESPACE} from "../math"
import {canonicalMarkName} from "../marks"
import "./style-combobox"
import {defaultGraphicShapePaint, graphicShapeOptions, SVG_NAMESPACE, type GraphicShapePaint} from "../graphic"
import type {WidgetOptionState, WidgetOptionValue} from "../widget-options"

export type ToolboxTool = "Edit" | "Style" | "AI" | "Review" | "Feedback"

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
  protected get commentReviewMode() { return this.activeTool === "Review" }

  protected usesNativePointerInteraction(event: MouseEvent) {
    return event.composedPath().some(target => target instanceof HTMLElement && (target.classList.contains("ai-toolbox-content") || target.classList.contains("feedback-content")))
  }

  protected renderGraphicDrawer() {
    return super.renderGraphicDrawer(true)
  }

  protected renderTableStructureControls() {
    return super.renderTableStructureControls(false, true)
  }

  static properties = {
    ...EditingControls.properties,
    shapePaint: {attribute: false},
    preview: {type: Boolean, reflect: true},
    feedbackActive: {type: Boolean},
    feedbackRole: {type: String},
    feedbackParticipants: {attribute: false},
    feedbackMessages: {attribute: false},
    feedbackDraft: {state: true},
    feedbackParticipant: {state: true},
    feedbackError: {state: true},
    disableAI: {type: Boolean, attribute: "disable-ai", reflect: true},
    aiSidebar: {type: Boolean, attribute: "ai-sidebar", reflect: true},
    showStyleToolbox: {type: Boolean, attribute: "show-style-toolbox", reflect: true},
    activeTool: {type: String, attribute: "active-tool", reflect: true},
    collapsed: {type: Boolean, reflect: true},
    selectionPath: {attribute: false},
    documentSelected: {type: Boolean, attribute: "document-selected"},
    elementSelected: {type: Boolean, attribute: false},
    documentHead: {attribute: false},
    documentHeadAttributeEditorId: {state: true},
    consoleOpen: {type: Boolean, attribute: "console-open", reflect: true},
    versionsOpen: {type: Boolean, attribute: "versions-open", reflect: true},
    htmlPending: {type: Boolean, attribute: "html-pending", reflect: true},
    documentLayout: {attribute: false},
    documentLayoutError: {attribute: false},
    proofreadingState: {attribute: false},
  }

  shapePaint: Required<GraphicShapePaint> = {...defaultGraphicShapePaint}
  private shapeFillColor = "#ffffff"
  private selectedShapeFillColor = "#ffffff"

  preview = false
  feedbackActive = false
  feedbackRole: "host" | "learner" | "" = ""
  feedbackParticipants: Pick<LiveSessionLearner, "id" | "name" | "connected">[] = []
  feedbackMessages: LiveSessionFeedback[] = []
  private feedbackDraft = ""
  private feedbackParticipant = ""
  private feedbackError = ""
  private normalTool: ToolboxTool | null = null

  disableAI = false
  aiSidebar = false

  static styles = css`
    ${aiChatStyles}
    ${proofreadingCardStyles}
    ${EditingControls.styles}
    .media-source {display: grid; grid-template-columns: minmax(0, 1fr); gap: .3rem; width: 100%; min-width: 0; margin-bottom: .4rem; font: .68rem/1.2 system-ui, sans-serif;}
    .specialized-options > .media-source {margin-bottom: 0;}
    ribbon-drawer:is([data-specialized="picture"], [data-specialized="img"]) > element-attribute-editor {margin-top: .4rem;}
    .media-source .media-source-buttons {border-radius: 4px 4px 0 0; background: transparent;}
    .media-source-field {display: flex; align-items: center; box-sizing: border-box; width: 100%; min-width: 0; height: 1.7rem; border: 1px solid #c5ccd5; border-top: 0; border-radius: 0 0 4px 4px; background: transparent;}
    .media-source-controls {min-width: 0; border-radius: 4px;}
    .media-source-controls:focus-within {outline: 2px solid #b9d7f5; outline-offset: 0;}
    .media-source .media-source-field input {box-sizing: border-box; flex: 1; width: 0; min-width: 0; height: 100%; border: 0; border-radius: 0; padding: .3rem .4rem; background: transparent; color: inherit; font: inherit; outline: none; box-shadow: none;}
    .media-source-field > svg {width: 1rem; height: 1rem; flex: none; margin-left: .35rem;}
    .media-source-field button {display: flex; align-items: center; justify-content: center; flex: none; width: 1.4rem; height: 100%; padding: 0; border: 0; border-radius: 0 0 4px 0; background: transparent; color: inherit; font: inherit; cursor: pointer;}
    .media-source-field button:hover {background: #edf3f9;}
    .media-source-field button:focus-visible {outline: 2px solid #b9d7f5; outline-offset: -2px;}
    .media-source-label {position: relative; display: flex; align-items: center; gap: .3rem;}
    .large-source-warning { display: inline-flex; align-items: center; justify-content: center; width: 1rem; height: 1rem; border: 0; border-radius: 50%; padding: 0; background: #f5c84c; color: #493900; font: 700 .7rem/1 system-ui, sans-serif; cursor: help;}
    .large-source-warning:focus-visible {outline: 2px solid #3977c7; outline-offset: 2px;}
    .large-source-warning-bubble {position: absolute; z-index: 10; left: 0; right: 0; bottom: calc(100% + .45rem); display: none; padding: .45rem .6rem; border: 1px solid #d6b44a; border-radius: .35rem; background: #fff3bf; color: #493900; box-shadow: 0 3px 10px #0002; font: .72rem/1.35 system-ui, sans-serif; text-align: left;}
    .large-source-warning-bubble::after {position: absolute; top: 100%; left: 2.7rem; width: .5rem; height: .5rem; border-right: 1px solid #d6b44a; border-bottom: 1px solid #d6b44a; background: #fff3bf; content: ""; transform: translateY(-50%) rotate(45deg);}
    .large-source-warning:hover .large-source-warning-bubble, .large-source-warning:focus .large-source-warning-bubble, .large-source-warning:focus-visible .large-source-warning-bubble {display: block;}
    .video-playback-warning {box-sizing: border-box; width: 100%; margin: .35rem 0; padding: .4rem .5rem; border: 1px solid #d6b44a; border-radius: .3rem; background: #fff3bf; color: #493900; font: .72rem/1.35 system-ui, sans-serif; overflow-wrap: anywhere;}



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
    .float-placement-label > .field-label {justify-content: flex-start}
    .float-placement-label .field-label .field-clear {margin-left: 0; min-height: 0}
    .caption-label-row {display: flex; align-items: center; justify-content: space-between; gap: .35rem; margin-top: .4rem}
    .caption-top {display: inline-flex; align-items: center; gap: .2rem; font: inherit; color: inherit; white-space: nowrap}
    .caption-top input {width: .7rem; height: .7rem; margin: 0}
    .attribution-field {display: grid; grid-template-columns: 4.4rem minmax(0, 1fr); gap: .35rem; align-items: center; margin-top: .4rem}
    .attribution-field > button {min-width: 0; min-height: 1.7rem; background: #f7f7f7; border-color: #c5ccd5; font: .68rem/1.2 system-ui, sans-serif}
    .float-button-group {display: flex; width: 100%; gap: 0}
    .float-button-group button {position: relative; display: grid; place-items: center; flex: 1 1 0; min-width: 0; padding: .35rem; border-width: var(--editor-control-border-width, .5px); border-radius: 0}
    .float-button-group float-info {position: absolute; top: -3px; right: -2px; z-index: 2}
    .float-button-group .float-move {flex: 0 0 auto; padding: .35rem .2rem}
    .float-button-group .float-move:disabled {opacity: .4; cursor: default}
    .float-button-group button + button {margin-left: -.5px}
    .float-button-group button:first-child {border-radius: .2rem 0 0 .2rem}
    .float-button-group button:last-child {border-radius: 0 .2rem .2rem 0}
    .float-button-group button[aria-pressed="true"], .float-button-group button:focus-visible {position: relative; z-index: 1}
    .float-button-group svg {display: block; width: 1.25rem; height: 1.25rem}
    .float-button-group .float-move svg {width: .875rem; height: .875rem}
    .float-button-group[aria-label="Placement"] button {min-height: 1.55rem; padding: .15rem .2rem}
    .float-button-group[aria-label="Placement"] .float-move {padding-inline: .1rem}
    .caption-button-group {display: grid; grid-template-columns: 1.6rem repeat(3, minmax(0, 1fr))}
    .caption-button-group button {min-height: 1.55rem; padding: .1rem .25rem; margin: 0; border-radius: 0}
    .caption-button-group button + button {margin-left: -.5px}
    .caption-button-group .caption-none {padding: .15rem .1rem; border-radius: .2rem 0 0 .2rem}


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

    :host([preview]:not([active-tool])) {
      width: 108px;
    }

    .feedback-content {display: flex; flex-direction: column; gap: .65rem; padding: .65rem; font-size: .72rem}
    .feedback-content p {margin: 0; color: #7b8795; line-height: 1.4}
    .feedback-content form, .feedback-content label {display: grid; gap: .35rem}
    .feedback-content form {gap: .65rem}
    .feedback-content select, .feedback-content textarea, .feedback-content button {box-sizing: border-box; width: 100%; min-width: 0; padding: .35rem; border: 1px solid #c8d2df; border-radius: .25rem; color: inherit; background: transparent; font: inherit}
    .feedback-content textarea {min-height: 6rem; resize: vertical}
    .feedback-content button {cursor: pointer}
    .feedback-content button:disabled {opacity: .5; cursor: default}
    .feedback-content :focus-visible {outline: 2px solid #3977c7; outline-offset: 1px}
    .feedback-messages {display: grid; gap: .5rem; margin: 0; padding: 0; list-style: none}
    .feedback-messages li {display: grid; gap: .25rem; padding: .5rem; border: 1px solid #c8d2df; border-radius: .25rem; overflow-wrap: anywhere}
    .feedback-messages p {white-space: pre-wrap; color: inherit}
    .feedback-messages time {font-size: .62rem; color: #7b8795}

    :host([active-tool]) {
      width: 216px;
    }

    :host([ai-sidebar]) {grid-template-rows: 30px minmax(0, 1fr)}
    :host([ai-sidebar]:not([collapsed])) .toolbox-tab:not([data-active]) {display: none}
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
    .ai-toolbox-content .ai-chat-panel[data-open] form.ai-chat-composer[data-review] {height: auto; padding: .5rem;}
    .ai-toolbox-content .ai-toolbox-review {justify-content: center; margin: 0;}
    .ai-toolbox-content .ai-chat-panel[data-open] .ai-composer-surface {
      border: 0; border-radius: 0;
    }
    .ai-toolbox-content .ai-chat-panel[data-open] .ai-composer-surface:focus-within {
      box-shadow: inset 0 0 0 1px #3977c7;
    }
    .ai-toolbox-content[hidden] {display: none}
    :host([active-tool="AI"]) .toolbox-pane-content {overflow: hidden}

    @media (max-height: 600px) {
      .ai-tab-label-prefix {display: none}
      :host([active-tool="AI"]:not([collapsed])) .toolbox-tab:not([data-active]) {display: none}
      :host([active-tool="AI"]) .toolbox-pane,
      :host([active-tool="AI"]) .toolbox-pane-content,
      :host([active-tool="AI"]) .ai-toolbox-content,
      :host([active-tool="AI"]) .ai-chat-panel[data-open] {overflow: visible}
      :host([active-tool="AI"]) .ai-chat-header {position: absolute; z-index: 3; top: -30px; left: auto; right: 28px; height: 30px; gap: .15rem; padding: 0; border: 0; background: transparent}
      :host([active-tool="AI"]) .ai-chat-header-button {width: 24px; height: 24px}
      :host([active-tool="AI"]) .ai-chat-switcher {flex: 0 0 24px; width: 24px; height: 24px; padding: 0; color: transparent; background-position: center; background-size: .9rem; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3 2.5h10v8H7l-4 3v-11Z' stroke='%23526b86' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E")}
      :host([active-tool="AI"]) .ai-chat-switcher option {color: #2f3742}
      :host([active-tool="AI"]) .ai-chat-panel[data-open] .ai-chat-composer {height: 5.5rem}
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

    .toolbox-tab[data-active]:has([data-tool="Review"]) {
      margin-right: 4px;
    }

    .toolbox-tab[data-comments] .toolbox-tab-icon,
    .toolbox-tab[data-comments] .toolbox-tab-label {color: #9a6700;}
    .toolbox-tab-comment-count {position: absolute; top: -.3rem; right: -.38rem; z-index: 1; min-width: .8rem; height: .8rem; padding: 0 .12rem; border: 1px solid #fff; border-radius: 999px; color: #fff; background: #b7791f; font: 700 .48rem/ .75rem system-ui, sans-serif; text-align: center;}
    .toolbox-tab-accessibility-badge {position: absolute; top: -4px; right: -5px; z-index: 2; display: grid; place-items: center; box-sizing: border-box; min-width: 16px; height: 16px; padding: 0 3px; border: 1px solid #fff; border-radius: 999px; color: #fff; background: #087f5b; font: 700 10px/1 system-ui, sans-serif;}

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
    .toolbox-tab[data-hover-kind="accessibility"] .toolbox-tab-icon {color: #087f5b}

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
    .toolbox-tab[data-accessibility] .toolbox-tab-comment-count {top: auto; right: -5px; bottom: -4px;}
    .toolbox-tab[data-accessibility] .proofreading-error-badge {right: auto; left: -5px;}
    .toolbox-tab[data-comments]:not([data-accessibility]) .proofreading-error-badge {right: auto; left: -5px;}

    .proofreading-section {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      align-content: start;
      gap: .55rem;
      padding: .75rem;
      color: #2f3742;
      border-bottom: 1px solid #d8dee6;
    }
    .proofreading-section h2 {flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin: 0; font-size: .72rem; font-weight: 650; color: #465465; min-height: 2.15rem}
    .proofreading-heading {display: inline-flex; align-items: center; gap: .35rem;}
    .proofreading-heading-icon {display: block; flex: 0 0 1rem; width: 1rem; height: 1rem; color: var(--ribbon-control-color, #526b86);}
    .proofreading-heading-icon svg {display: block; width: 100%; height: 100%;}
    .proofreading-content {display: grid; align-content: start; flex: 1 1 auto; min-height: 0; gap: .55rem; overflow-x: hidden; overflow-y: auto; scrollbar-width: thin;}
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

    :host([active-tool="Review"]) .toolbox-pane-content {overflow: hidden;}
    .review-section {box-sizing: border-box; display: flex; flex-direction: column; flex: 1 1 50%; max-height: max-content; min-height: 0; min-width: 0; overflow: hidden;}
    .review-comments {border-bottom: 1px solid #d8dee6; --ribbon-drawer-pane-border-bottom: 0;}

    :host([active-tool="Edit"]) .toolbox-pane-content {
      padding: 0 8px;
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
    .specialized-widget-primary .widget-options {min-width: 0;}
    .specialized-options .develop-field, .specialized-widget-primary .develop-field {display: grid; grid-template-columns: 4.4rem minmax(0, 1fr); gap: .35rem; align-items: center;}
    .specialized-widget-primary input:not([type="checkbox"], [type="radio"]), .specialized-widget-primary select {height: 1.7rem; border: 1px solid #c5ccd5; border-radius: 4px; background: transparent; font: inherit;}
    .specialized-widget-primary .widget-option-group .develop-field,
    .specialized-widget-primary .develop-field:has(> .widget-option-tree) {
      display: flex; flex-direction: column; align-items: stretch;
    }
    .specialized-widget-primary .develop-field.widget-option-checkbox,
    .specialized-options .develop-field.widget-option-checkbox {
      display: flex; flex-direction: row; align-items: center;
    }
    .specialized-widget-primary input[type="checkbox"]:not(.editor-switch), .specialized-widget-primary input[type="radio"] {
      width: 0.9rem; height: 0.9rem; flex: 0 0 auto; margin: 0;
    }
    .specialized-choice-group {min-height: 1.7rem;}
    .specialized-choice-group button {min-height: 1.6rem; padding: .15rem .2rem; font: .6rem system-ui, sans-serif;}
    .specialized-choice-group button {display: flex; align-items: center; justify-content: center; gap: .2rem;}
    .specialized-choice-group svg {width: 1rem; height: 1rem; display: block;}
    .media-toolbox-controls .media-attribute style-combobox {width: 100%;}
    .specialized-options {display: flex; flex-direction: column; gap: .4rem; min-width: 0;}
    .document-primary, .document-options {grid-column: 1 / -1; width: 100%;}
    .field-label {display: flex; align-items: center; justify-content: space-between; gap: .15rem; min-width: 0;}
    .field-label .field-clear {flex: 0 0 .9rem; width: .9rem; height: .9rem; margin-left: auto; padding: 0; border: 0; background: transparent; color: #666; font: inherit; cursor: pointer;}
    .field-clear:focus-visible {outline: 2px solid #b9d7f5;}
    .specialized-commands {display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; font: .68rem/1.2 system-ui, sans-serif;}
    .specialized-commands .mark-attribute, .specialized-commands .table-caption-toggle {width: 100%;}
    .table-structure-controls {display: grid; grid-column: 1 / -1; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(3, 2.8rem); gap: .15rem; margin-bottom: .4rem;}
    .table-structure-controls > ribbon-button {min-width: 0;}
    .table-structure-controls > [action="table-column-left"] {grid-area: 1 / 1;}
    .table-structure-controls > [action="table-row-above"] {grid-area: 1 / 2;}
    .table-structure-controls > [action="table-column-right"] {grid-area: 1 / 3;}
    .table-structure-controls > [action="table-split-cells"] {grid-area: 2 / 1;}
    .table-structure-controls > [action="table-row-below"] {grid-area: 2 / 2;}
    .table-structure-controls > [action="table-split"] {grid-area: 2 / 3;}
    .table-structure-controls > [action="table-merge-cells"] {grid-area: 3 / 1;}
    .table-structure-controls > [action="table-header"] {grid-area: 3 / 2;}
    .table-structure-controls > [action="table-footer"] {grid-area: 3 / 3;}
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
    ${choiceGroupStyles}

    .media-source-buttons button {background: transparent;}

    .document-layout-choices {display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .35rem;}
    .document-layout-choices .layout-preset {position: relative; aspect-ratio: 2 / 1; min-height: 0; padding: 0; gap: 0; overflow: hidden;}
    .document-layout-choices .document-layout-preview {position: absolute; inset: 0; width: 100%; height: 100%; min-height: 0; border: 0; border-radius: inherit;}
    .document-layout-choices .layout-preset-name {position: absolute; z-index: 1; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: calc(100% - .5rem); box-sizing: border-box; padding: .2rem .35rem; border-radius: .25rem; background: rgb(255 255 255 / 85%); text-align: center;}
    .document-layout-choices [aria-pressed="true"] .layout-preset-name {background: rgb(226 237 248 / 95%); color: #375d84;}

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
    :host(:is([console-open], [versions-open])) .toolbox-pane {clip-path: inset(0 0 0 -1rem)}
    :host([active-tool]:is([console-open], [versions-open]))::after {
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

    :host([collapsed]) {grid-template-rows: 30px}
    :host([collapsed]) .toolbox-tabs-area {grid-row: 1}
    :host([collapsed]) .toolbox-tabs {padding-left: 4px}
    :host([collapsed])::after {display: none}


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
  // Keep the current tool's state while a bottom panel occupies its space.
  collapsed = false
  selectionPath: SelectionPathItem[] = []
  documentSelected = false
  elementSelected = false
  documentHead: DocumentHeadState = emptyDocumentHeadState()
  private documentHeadAttributeEditorId = ""
  consoleOpen = false
  versionsOpen = false
  htmlPending = false
  documentLayout: DocumentLayoutState = {mode: "document", canConvert: true, zoom: 100}
  documentLayoutError = ""
  proofreadingState: ProofreadingState = emptyProofreadingState()
  private revealedHoveredIssueId: string | null = null

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
    const checkingEnabled = state.enabled
    return html`<section class="proofreading-section" aria-labelledby="proofreading-title">
      <h2 id="proofreading-title"><span class="proofreading-heading"><span class="proofreading-heading-icon" aria-hidden="true">${ribbonIcon("Spelling")}</span>Issues</span>
        ${checkingEnabled && !state.error && (!state.ready || state.loading) ? html`<span class="proofreading-spinner" role="status" aria-label="Loading issue checker"></span>` : ""}
        ${checkingEnabled && state.checking && state.ready && !state.loading && !state.error ? html`<span class="proofreading-spinner" role="status" aria-label="Checking for issues"></span>` : ""}
        <button class="proofreading-check" type="button" title="Check for issues" aria-label="Check for issues"
          ?disabled=${!state.allowed || editingLocked || state.loading || state.checking}
          @click=${() => this.dispatchProofreadingAction({type: "checkProofreading"})}>${ribbonIcon("Refresh")}</button>
        <label class="proofreading-toggle"><input type="checkbox" .checked=${state.documentEnabled}
          aria-label="Check for issues automatically" title="Check for issues automatically"
          ?disabled=${!state.allowed || editingLocked}
          @change=${(event: Event) => this.dispatchProofreadingAction({type: "setDocumentProofreadingEnabled", enabled: (event.currentTarget as HTMLInputElement).checked})}></label>
      </h2>

      <div class="proofreading-content">
        ${!state.allowed ? html`<p class="proofreading-status">Issue checking is disabled in Settings.</p>` : ""}
        ${state.allowed && !state.documentEnabled ? html`<p class="proofreading-status">Automatic checking is disabled for this document.</p>` : ""}
        ${checkingEnabled && state.error ? html`<div class="proofreading-error" role="alert">
          <span>Could not load the issue checker.</span>
          <button class="proofreading-retry" type="button" ?disabled=${editingLocked}
            @click=${() => this.dispatchProofreadingAction({type: "retryProofreading"})}>Retry</button>
        </div>` : ""}
        ${checkingEnabled && state.ready && !state.error && !state.checking && state.issues.length === 0 ? html`<p class="proofreading-status">No issues found.</p>` : ""}
        <div class="proofreading-issues">
          ${checkingEnabled ? repeat(state.issues, issue => issue.id, issue => renderProofreadingCard(issue,
            action => this.dispatchProofreadingAction(action), {disabled: cardsLocked, hovered: issue.id === hoveredIssue?.id})) : nothing}
        </div>
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
    if(this.elementSelected) return this.elementAttributes?.name
      ?? this.selectionPath.at(-1)?.name ?? this.selectedElementTypes.at(-1)?.element.name ?? "Selection"
    if(this.paragraphSelected) return null
    if(this.elementAttributes && this.isElementDrawerVisible(this.elementAttributes.localName, this.elementAttributes.namespaceURI)) return this.elementAttributes.name
    return null
  }

  protected get currentMenuGroups(): RibbonMenuGroup[] {
    if(this.activeTool === "AI" || this.activeTool === "Feedback") return []
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
      "width", "height", "margin", "border-radius", "opacity", "box-shadow", "filter",
      ...Object.keys(this.elementStyle.inline).filter(name => /^(margin|padding)-(top|right|bottom|left|block(?:-start|-end)?|inline(?:-start|-end)?)$/.test(name)
        || /^border-(top|right|bottom|left|block|inline|start|end)(-|$)/.test(name)),
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
    const advancedProperties = documentTarget ? ["background-color"] : ["background-color", "color", "border-width", "border-radius", "padding", "width", "height", "margin", "opacity", "box-shadow", "filter"]
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
          .selectionKey=${JSON.stringify([this.elementAttributes?.path, this.elementStyle.target])}
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
      <div class="specialized-choice-group" ?data-default=${!Object.hasOwn(this.media?.attributes ?? {}, option.name)} style=${`--choice-columns: ${columns}`} role="group" aria-labelledby=${`media-label-${option.name}`}>
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

  protected renderWidgetOptionLabel(option: WidgetOptionState, dispatch: (name: string, value: WidgetOptionValue) => void, fieldScope: string) {
    return html`<span class="develop-field-label">${this.renderFieldLabel(option.label,
      option.value !== null && option.value !== "" && (!Array.isArray(option.value) || option.value.length > 0),
      () => { if(!option.disabled && !option.readOnly) dispatch(option.name, null) }, `widget-${fieldScope}${option.name}`,
      Boolean(option.disabled || option.readOnly))}</span>`
  }

  protected renderWidgetOptionField(option: WidgetOptionState, dispatch = this.dispatchWidgetOption.bind(this), fieldScope = "") {
    if(option.control || option.unit || option.hidden || option.disabled || option.readOnly) {
      return super.renderWidgetOptionField(option, dispatch, fieldScope)
    }
    if(option.type !== "select" || option.multiple || !option.choices?.length
      || option.choices.length > 8 || option.choices.some(choice => choice.label.length > 14)) {
      return super.renderWidgetOptionField(option, dispatch, fieldScope)
    }
    const fieldLabel = this.renderFieldLabel(option.label,
      option.value !== null && option.value !== "", () => dispatch(option.name, null), `widget-label-${fieldScope}${option.name}`)
    const columns = Math.min(4, Math.ceil(option.choices.length / (option.choices.length > 4 ? 2 : 1)))
    return html`<div class="develop-field" title=${option.description ?? ""}>
      ${fieldLabel}
      <div class="specialized-choice-group" ?data-default=${option.value === null} style=${`--choice-columns: ${columns}`} role="group" aria-labelledby=${`widget-label-${fieldScope}${option.name}`}>
        ${option.choices.map((choice, index) => html`<button type="button"
          ?data-top-right=${index === columns - 1} ?data-bottom-left=${index === Math.floor((option.choices!.length - 1) / columns) * columns}
          title=${choice.description ?? choice.label} aria-label=${choice.label}
          aria-pressed=${option.value === choice.value}
          @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
          @click=${() => dispatch(option.name, choice.value)}><span aria-hidden="true">${ribbonOptionIcon(option.name, choice.value)}</span>${choice.label}</button>`)}
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

  private renderSpecializedDrawer(group?: SelectedElementTypeState, listGroups?: SelectedElementTypeState[]) {
    const attributes = group?.element ?? this.elementAttributes
    let style = this.elementStyle
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
      if(listGroups && listGroups.length > 1) {
        event.stopPropagation()
        listGroups.forEach(list => this.dispatchEvent(new CustomEvent(event.type, {
          detail: {...event.detail, selectionType: {localName: list.element.localName, namespaceURI: list.element.namespaceURI}},
          bubbles: true, composed: true,
        })))
        return
      }
      if(selectionType) event.detail.selectionType = selectionType
    }
    const dispatchOption = (name: string, value: WidgetOptionValue) => {
      this.dispatchEvent(new CustomEvent("widget-option-change", {
        detail: {name, value, ...(selectionType ? {selectionType} : {})}, bubbles: true, composed: true,
      }))
    }
    const localName = group?.element.localName ?? widgetOptions?.localName ?? (this.graphic?.active ? "svg" : this.math?.active ? "math" : this.table?.active ? (style.target?.localName ?? "table")
      : this.media?.type ?? attributes?.localName ?? style.target?.localName)
    if(this.media && (!group || singleTarget) && ["picture", "img", "video"].includes(localName ?? "")) {
      const probe = document.createElement("span")
      probe.style.cssText = this.media.attributes.style ?? ""
      const inline = {...style.inline}
      delete inline["object-view-box"]
      const value = probe.style.getPropertyValue("object-view-box")
      if(value) inline["object-view-box"] = {value, priority: probe.style.getPropertyPriority("object-view-box") === "important" ? "important" : ""}
      style = {...style, inline, computed: {...style.computed, "object-view-box": "none"}}
    }
    if(!localName || localName === "body" || style.target?.documentRoot) return nothing
    const namespaceURI = attributes?.namespaceURI ?? style.target?.namespaceURI
    if(!this.isElementDrawerVisible(localName, namespaceURI)) return nothing
    const heading = namespaceURI === "http://www.w3.org/1999/xhtml" && /^h[1-6]$/.test(localName)
    const list = namespaceURI === "http://www.w3.org/1999/xhtml" && (localName === "ul" || localName === "ol")
    const listScopes = listGroups?.map(list => ({localName: list.element.localName, namespaceURI: list.element.namespaceURI}))
      ?? [selectionType ?? {localName, namespaceURI}]
    const profile = specializedElementStyle(localName)
    const widget = Boolean(widgetOptions || localName.includes("-"))
    if(!profile && !widget && !group) return nothing
    const mediaStyles = this.media && ["picture", "img", "video"].includes(localName)
      ? ["object-view-box", "object-fit", "object-position"] : []
    const primary = (profile?.primary ?? []).filter(name => !mediaStyles.includes(name))
    const advanced = this.media && ["picture", "img"].includes(this.media.type) ? [] : profile?.advanced ?? []
    const definitions = [...specializedStyleDefinitions, ...elementStyleCategories.flatMap(category => [...category.basic, ...category.advanced])]
    const properties = [...new Set([...primary, ...advanced, ...mediaStyles, ...(list ? [listMarkerImageProperty] : [])])]
    const resetStyles = Object.fromEntries(properties.filter(name => Object.hasOwn(style.inline, name)).map(name => [name, null]))
    const groupedWidgetOptions = Boolean(widgetOptions?.groups?.length || [...widgetOptions?.options ?? [], ...widgetOptions?.actions ?? []].some(item => item.group))
    const configuredWidgetOptions = widgetOptions?.options.filter(option => !option.hidden && !option.disabled && !option.readOnly).filter(option => group ? group.configuredWidgetOptions.includes(option.name) : option.value !== null && option.value !== "") ?? []
    const count = [...advanced, ...mediaStyles].filter(name => Object.hasOwn(style.inline, name)).length
      + Object.keys(group ? {} : this.media?.attributes ?? {}).filter(name => name !== "style").length
      + (groupedWidgetOptions ? 0 : widgetOptions?.options.slice(3).filter(option => option.value !== null && option.value !== "").length ?? 0)
    const label = heading ? "Heading" : list ? "List" : group ? attributes!.name : widget ? "Widget" : this.graphic?.active ? "Graphic" : this.math?.active ? "Formula" : this.table?.active && ["table", "td", "th"].includes(localName) ? (localName === "table" ? "Table" : "Table cell")
      : this.media ? this.mediaLabel(this.media.type) : attributes?.name ?? localName
    const tableGroup = this.selectedElementTypes.find(item => item.element.localName === "table")
      ?? this.selectedElementTypes.find(item => ["td", "th"].includes(item.element.localName))
    const tableControls = Boolean(this.table?.active && (group ? group === tableGroup : ["table", "td", "th"].includes(localName)))
    const commands = tableControls || groupedWidgetOptions ? nothing : group && widgetOptions ? this.renderWidgetOptionsControls(widgetOptions.options.slice(3), dispatchOption, widgetOptions, selectionType)
      : !group || singleTarget ? this.renderSpecializedCommands(group ? dispatchOption : undefined)
      : widgetOptions && widgetOptions.options.length > 3 ? html`${widgetOptions.options.slice(3).map(option => this.renderWidgetOptionField(option, dispatchOption))}` : nothing
    const hasOptions = advanced.length > 0 || mediaStyles.length > 0 || commands !== nothing
    return html`<ribbon-drawer label=${label} icon=${heading ? "Heading" : list ? "List" : attributes?.icon ?? label} .iconUrl=${heading || list ? "" : attributes?.iconUrl ?? ""} layout="element-style"
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
      ${tableControls ? html`<div class="table-structure-controls" role="group" aria-label="Table structure">${this.renderTableStructureControls()}</div>` : nothing}
      ${heading ? html`<div class="specialized-widget-primary heading-level"><div class="develop-field">
        <span class="field-label" id=${`heading-level-${localName}`}>Level</span>
        <div class="specialized-choice-group" style="--choice-columns: 3" role="group" aria-labelledby=${`heading-level-${localName}`}>
          ${[1, 2, 3, 4, 5, 6].map(level => html`<button type="button"
            ?data-top-right=${level === 3} ?data-bottom-left=${level === 4}
            aria-label=${`Heading ${level}`} title=${`Heading ${level}`} aria-pressed=${localName === `h${level}`}
            @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
            @click=${() => this.dispatchEvent(new CustomEvent("heading-level-change", {
              detail: {level: `h${level}`, selectionType: selectionType ?? {localName, namespaceURI}},
              bubbles: true, composed: true,
            }))}><span aria-hidden="true">${ribbonIcon(`Heading ${level}`)}</span></button>`)}
        </div>
      </div></div>` : nothing}
      ${list ? html`<div class="specialized-widget-primary list-type"><div class="develop-field">
        <span class="field-label" id=${`list-type-${localName}`}>Type</span>
        <div class="specialized-choice-group" style="--choice-columns: 2" role="group" aria-labelledby=${`list-type-${localName}`}>
          ${(["ul", "ol"] as const).map(type => html`<button type="button"
            ?data-top-right=${type === "ol"} ?data-bottom-left=${type === "ul"}
            aria-label=${type === "ul" ? "List" : "Enumeration"} title=${type === "ul" ? "List" : "Enumeration"}
            aria-pressed=${listScopes.every(scope => scope.localName === type)}
            @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
            @click=${() => this.dispatchEvent(new CustomEvent("list-type-change", {
              detail: {listType: type, selectionTypes: listScopes}, bubbles: true, composed: true,
            }))}><span aria-hidden="true">${ribbonIcon(type === "ul" ? "List" : "Enumeration")}</span></button>`)}
        </div>
      </div></div>` : nothing}
      ${this.media && (!group || singleTarget) ? html`
        ${this.renderMediaSource()}
        ${this.media.type === "video" && this.media.videoPlaybackWarning ? html`<div class="video-playback-warning" role="status">${this.media.videoPlaybackWarning === "unsupported"
          ? "This browser cannot play this video. Its format or codec may be unsupported. Try a WebM or MP4 version."
          : "No video track can be played; only audio may be available. The video codec may be unsupported. Try a WebM or MP4 version."}</div>` : nothing}
        <div class="media-toolbox-controls">
          ${mediaAttributeOptions[this.media.type].filter(option => ["alt", "aria-label"].includes(option.name))
            .map(option => this.renderMediaAttribute(this.media!.type, option))}
        </div>
        <div class="media-toolbox-controls media-primary-options">
          ${mediaAttributeOptions[this.media.type].filter(option => ["autoplay", "loop", "muted", "allowfullscreen"].includes(option.name))
            .map(option => this.renderMediaAttribute(this.media!.type, option))}
        </div>` : nothing}
      ${widgetOptions ? html`<div class="specialized-widget-primary">${groupedWidgetOptions
        ? this.renderWidgetOptionsControls(widgetOptions.options, dispatchOption, widgetOptions, selectionType)
        : html`<div class="widget-options">${widgetOptions.options.slice(0, 3).map(option => this.renderWidgetOptionField(option, dispatchOption, group ? `${widgetOptions.path.join("-")}-` : ""))}</div>`}</div>` : nothing}
      <element-style-editor mode="compact" .definitions=${definitions} .propertyNames=${primary}
        .selectionKey=${JSON.stringify(group ? (listGroups ?? [group]).map(item => [item.element.namespaceURI, item.element.localName, item.element.path, item.count])
          : [[namespaceURI, localName, attributes?.path, 1]])}
        .state=${list ? {...style, target: {...style.target, localName, namespaceURI}} : style}></element-style-editor>
      ${attributes ? html`<element-attribute-editor expanded .mediaOwned=${(!group || singleTarget) && Boolean(this.media)} .state=${attributes}></element-attribute-editor>` : nothing}
      ${hasOptions ? html`<div slot="more" class="specialized-options">
        ${advanced.length ? html`<element-style-editor mode="compact" .definitions=${definitions} .propertyNames=${advanced} .state=${style}></element-style-editor>` : nothing}
        ${commands}
        ${mediaStyles.length ? html`<element-style-editor mode="compact" .definitions=${definitions} .propertyNames=${mediaStyles} .state=${style}></element-style-editor>` : nothing}
        ${this.media?.type === "video" && (!group || singleTarget) ? this.renderMediaSource(true) : nothing}
      </div>` : nothing}
    </ribbon-drawer>`
  }

  private renderMediaSource(cover = false) {
    const media = this.media!
    const type = media.type
    const attribute = cover ? "poster" : mediaSourceAttribute(type)
    const source = cover ? media.attributes.poster || "" : media.attributes[attribute] || media.sources?.find(row => row.attributes.src)?.attributes.src || media.attributes.srcset || media.attributes.srcdoc || ""
    const current = (cover ? media.cover?.label : media.sourceLabel) ?? (source.startsWith("data:") || source.startsWith("blob:") ? `${cover ? "Image" : this.mediaLabel(type)} file` : media.attributes.srcdoc ? "HTML document" : source)
    const sourceKind = cover ? media.cover?.kind : media.sourceKind
    const inputType = cover ? "picture" : type
    const label = cover ? "Cover image" : "Source"
    const id = cover ? "media-cover-url" : "media-source-url"
    const sourceIcon = sourceKind === "capture" ? "Capture screen" : sourceKind === "recording" ? "Record"
      : sourceKind === "file" || source.startsWith("data:") || source.startsWith("blob:") ? "Select file" : "Link"
    const action = (label: string) => this.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label}, bubbles: true, composed: true,
    }))
    return html`<div class="media-source" data-cover=${cover}>
      <div class="media-source-label"><label for=${id}>${label}</label>
        ${!cover && media.sourceSize !== undefined && media.sourceSize > 50 * 1024 * 1024 ? html`<button type="button" class="large-source-warning" aria-label="Large source file warning" aria-describedby="large-source-warning-message">!
          <span id="large-source-warning-message" class="large-source-warning-bubble" role="tooltip">Large source files can lead to performance issues for readers</span>
        </button>` : nothing}
      </div>
      <div class="media-source-controls">
        <div class="specialized-choice-group media-source-buttons" style=${`--choice-columns: ${1 + mediaCaptureOptions(inputType).length}`} role="group" aria-label=${`${label} input`}>
          <button type="button" aria-label="Select file" title="Open file" @click=${() => action(cover ? "selected-media-cover-file" : "selected-media-file")}>
            <span class="icon">${ribbonIcon("Select file")}</span><span class="label">File</span>
          </button>
          ${mediaCaptureOptions(inputType).map(option => html`<button type="button" aria-label=${option.label} title=${option.label}
            @click=${() => action(`${cover ? "selected-media-cover-capture" : "selected-media-capture"}:${option.mode}`)}>
            <span class="icon">${ribbonIcon(option.label)}</span><span class="label">${option.label === "Record" ? "Record" : "Capture"}</span>
          </button>`)}
        </div>
        <div class="media-source-field"
          @dragover=${(event: DragEvent) => {
            const data = event.dataTransfer
            if(!data || !data.types.includes("Files") && !Array.from(data.items).some(item => item.kind === "file")) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = "copy"
          }}
          @drop=${(event: DragEvent) => {
            const file = event.dataTransfer?.files[0]
            if(!file) return
            event.preventDefault()
            event.stopPropagation()
            this.dispatchEvent(new CustomEvent("media-file-drop", {
              detail: {type, file, attribute: cover ? "poster" : undefined}, bubbles: true, composed: true,
            }))
          }}>
          ${source ? ribbonIcon(sourceIcon) : nothing}
          <input id=${id} type=${sourceKind || source.startsWith("data:") || source.startsWith("blob:") || media.attributes.srcdoc ? "text" : "url"}
            inputmode="url" spellcheck="false" autocapitalize="off" data-ribbon-input-persistent aria-label=${`${this.mediaLabel(type)}: ${label}`}
            placeholder="https://…" .value=${current} title=${current}
            @input=${this.clearMediaSourceError}
            @change=${(event: Event) => {
              if((event.currentTarget as HTMLInputElement).value !== current) this.dispatchMediaAttribute(type, {name: attribute, label}, event)
            }}>
          ${source ? html`<button type="button" aria-label=${cover ? "Remove cover image" : "Remove source"} title=${cover ? "Remove cover image" : "Remove source"} @click=${() => cover
            ? this.dispatchEvent(new CustomEvent("media-attribute-change", {detail: {type, attribute: "poster", value: null}, bubbles: true, composed: true}))
            : action("remove-media-source")}>×</button>` : nothing}
        </div>
      </div>
    </div>`
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
    if(this.table?.active) return nothing
    if(this.media) {
      return html`<div class="specialized-commands media-toolbox-controls">
        ${this.renderTimedMediaResources()}
        ${this.renderImageMapControls()}
      </div>`
    }
    if(this.listType === "ol") return this.renderListControls()
    if(this.sectionSelected && this.sectionType !== "figure") return html`<div class="specialized-commands">${this.renderSectionControls()}</div>`
    return nothing
  }

  private setShapePaint(name: keyof GraphicShapePaint, value: string) {
    if(!this.graphic?.active || this.graphic.mode && this.graphic.mode !== "select") return
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
    if(!this.graphic?.active || this.graphic.mode && this.graphic.mode !== "select") return nothing
    const count = this.graphic.selectionCount ?? (this.graphic.shape ? 1 : 0)
    const selected = count > 0
    const fillUnavailable = selected && (this.graphic.shape === "freehand" || ["polyline", "bezier"].includes(this.graphic.shape ?? "") && this.graphic.parameters?.closed !== "true")
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
        ${fillUnavailable ? nothing : html`
        <div class="shape-fill-field"><span>Fill</span><span class="shape-color-control" role="group" aria-label="Fill color">
          <input type="color" aria-label="Shape key fill color" data-ribbon-input-persistent
            .value=${/^#[0-9a-f]{6}$/i.test(fillColor) ? fillColor : "#ffffff"} ?disabled=${disabled}
            @input=${(event: Event) => this.setShapePaint("fill", (event.target as HTMLInputElement).value)}>
          <button type="button" aria-label="No fill" title="No fill" aria-pressed=${String(paint.fill === "none")} ?disabled=${disabled}
            @pointerdown=${(event: PointerEvent) => event.preventDefault()}
            @click=${() => this.setShapePaint("fill", paint.fill === "none" ? fillColor : "none")}>∅</button>
        </span></div>
        `}
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

  private renderDocumentDrawer() {
    const fields = ["title", "author", "license", "language", "description", "keywords"] as const satisfies readonly DocumentHeadField[]
    const configured = fields.filter(field => this.documentHead[field])
    const captions = this.documentHead.captionEnumeration
    const hasCaptions = Boolean(captions && (captions.figure.enabled || captions.table.enabled))
    const resettableLayout = this.documentLayout.mode !== "document" && this.documentLayout.canConvert
    const advancedCount = ["description", "keywords"].filter(field => this.documentHead[field as "description" | "keywords"]).length
      + this.documentHead.elements.filter(element => !["title", "author", "license", "description", "keywords", "generator", "theme", "caption-enumeration"].includes(element.preset ?? "")).length
      + Number(hasCaptions)
    return html`<ribbon-drawer label="Document" icon="Document" layout="element-style" show-pane-icon expandable
      data-specialized="document" .advancedCount=${advancedCount}
      @document-head-element-options-request=${(event: CustomEvent<{id: string}>) => {
        this.documentHeadAttributeEditorId = event.detail.id
        const drawer = event.currentTarget as RibbonDrawer
        if(event.detail.id) drawer.openDrawer()
      }}>
      <button type="button" class="style-reset document-reset" slot="heading-action" title="Reset document options" aria-label="Reset document options"
        ?disabled=${!configured.length && !hasCaptions && !resettableLayout}
        @click=${() => {
          configured.forEach(field => this.dispatchEvent(new CustomEvent("document-head-action", {
            detail: {type: "setDocumentHeadField", field, value: ""}, bubbles: true, composed: true,
          })))
          if(hasCaptions) {
            const value = defaultCaptionEnumeration()
            value.figure.enabled = value.table.enabled = false
            this.dispatchEvent(new CustomEvent("document-head-action", {
              detail: {type: "setCaptionEnumeration", value}, bubbles: true, composed: true,
            }))
          }
          if(resettableLayout) this.selectDocumentLayout("document")
        }}>${ribbonIcon("Restore")}Reset</button>
      <div class="specialized-options document-primary">
      <document-head-editor mode="common" expanded compact .state=${this.documentHead}
        .attributeEditorId=${this.documentHeadAttributeEditorId}></document-head-editor>
          <div class="document-layout-controls">
            <div class="document-layout-choices" role="group" aria-label="Layouts">
              ${documentLayoutModes.map(mode => renderDocumentLayoutCard(
                mode, this.documentLayout, this.historyState.preview !== null || this.htmlPending,
                selected => this.selectDocumentLayout(selected),
              ))}
            </div>
            ${this.documentLayoutError ? html`<p class="document-layout-error" role="alert">${this.documentLayoutError}</p>` : nothing}
          </div>
      </div>
      <div slot="more" class="specialized-options document-options">
        <document-head-editor mode="advanced" compact .state=${this.documentHead}
          .attributeEditorId=${this.documentHeadAttributeEditorId}></document-head-editor>
      </div>
    </ribbon-drawer>`
  }

  protected renderDrawers(): TemplateResult<1>[] {
    if(this.activeTool === "Edit" && this.documentSelected) return [this.renderDocumentDrawer()]
    if(this.activeTool === "Edit" && this.selectedElementTypes.length) {
      const lists = this.selectedElementTypes.filter(group => group.element.namespaceURI === "http://www.w3.org/1999/xhtml"
        && (group.element.localName === "ul" || group.element.localName === "ol"))
      return this.selectedElementTypes.map(group => {
        if(!lists.includes(group)) return this.renderSpecializedDrawer(group)
        if(group !== lists[0]) return nothing
        const attributes = Object.fromEntries(Object.entries(group.element.attributes)
          .filter(([name, value]) => lists.every(list => list.element.attributes[name] === value)))
        return this.renderSpecializedDrawer({...group,
          count: lists.reduce((count, list) => count + list.count, 0),
          element: {...group.element, attributes},
          styleProperties: [...new Set(lists.flatMap(list => list.styleProperties))],
        }, lists)
      })
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
    return drawers
  }

  private renderElementLayoutControls() {
    const target = this.elementStyle.target
    if(this.activeTool !== "Edit" || this.documentSelected) return nothing
    if(target?.documentRoot || target?.localName === "body") return this.selectedElementTypes.length
      ? html`<div class="layout-action-controls float-action-controls">${this.renderAttributionField()}</div>` : nothing
    if(["td", "th"].includes(target?.localName ?? "")) return nothing
    const float = target?.float ?? floatSideFromStyles(this.elementStyle.computed.float || "none", {
      getPropertyValue: name => this.elementStyle.inline[name]?.value ?? "",
    })
    const captionPosition = this.captionPosition ?? (this.table?.hasCaption ? "above" : this.figure?.hasCaption ? "below" : "none")
    const captionPlacement = captionPosition === "above" ? "above" : "below"
    const alignment = target?.alignment ?? "center"
    const placements: {side: FloatSide, alignment?: "left" | "center" | "right", label: string}[] = [
      {side: "far-left", label: "Float left"},
      ...(["left", "center", "right"] as const).map(alignment => ({side: "none" as const, alignment, label: `No float, align ${alignment}`})),
      {side: "far-right", label: "Float right"},
    ]
    return html`
        <div class="layout-action-controls float-action-controls">
          ${this.documentLayout.mode === "document" ? html`
          <span class="float-placement-label">Placement</span>
          <div class="float-button-group" role="group" aria-label="Placement">
            <button type="button" class="float-move" aria-label="Move down" title="Move down"
              ?disabled=${!target?.canMoveDown || this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "moveFloat", direction: "down"}, bubbles: true, composed: true}))}>${ribbonIcon("ArrowDown")}</button>
            ${placements.map(placement => html`<button type="button"
              aria-label=${placement.label} aria-pressed=${float === placement.side && (!placement.alignment || alignment === placement.alignment)}
              title=${placement.label}
              ?disabled=${this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${(event: Event) => {
                this.dispatchEvent(new CustomEvent("layout-action", {
                  detail: {type: "setFloat", side: placement.side, ...(placement.alignment ? {alignment: placement.alignment} : {})}, bubbles: true, composed: true,
                }))
                const info = (event.currentTarget as HTMLElement).querySelector<FloatInfo>("float-info")
                info?.showBriefly()
              }}>${placement.alignment ? unsafeSVG(floatNoneIconSource(placement.alignment)) : ribbonIcon(placement.side === "far-left" ? "Float left" : "Float right")}
                ${(placement.side === "far-left" && this.elementStyle.context.floatLeftForcedRight)
                  || (placement.side === "far-right" && this.elementStyle.context.floatRightInFlow)
                  ? html`<float-info .side=${placement.side === "far-right" ? "right" : "left"} .badge=${float === placement.side}></float-info>` : nothing}
              </button>`)}
            <button type="button" class="float-move" aria-label="Move up" title="Move up"
              ?disabled=${!target?.canMoveUp || this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {detail: {type: "moveFloat", direction: "up"}, bubbles: true, composed: true}))}>${ribbonIcon("ArrowUp")}</button>
          </div>
          ` : nothing}
          ${["canvas", "slides"].includes(this.documentLayout.mode) ? html`
          <span class="float-placement-label">Placement</span>
          <div class="float-button-group" role="group" aria-label="Placement">
            ${([
              {direction: "front", label: "Move to front", icon: "Bring to front", enabled: target?.placement?.canMoveUp},
              {direction: "up", label: "Move up", icon: "Bring forward", enabled: target?.placement?.canMoveUp},
              {direction: "down", label: "Move down", icon: "Send backward", enabled: target?.placement?.canMoveDown},
              {direction: "back", label: "Move to back", icon: "Send to back", enabled: target?.placement?.canMoveDown},
            ] as const).map(({direction, label, icon, enabled}) => html`<button type="button" aria-label=${label} title=${label}
              ?disabled=${!enabled || this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {
                detail: {type: "movePlacement", direction}, bubbles: true, composed: true,
              }))}>${ribbonIcon(icon)}</button>`)}
          </div>
          ` : nothing}
          <span class="float-placement-label caption-label-row">${this.renderFieldLabel("Caption", captionPosition !== "none",
            () => this.dispatchEvent(new CustomEvent("layout-action", {
              detail: {type: "setCaption", position: "none"}, bubbles: true, composed: true,
            })), undefined, this.historyState.preview !== null || this.htmlPending)}
            <label class="caption-top"><input type="checkbox" .checked=${captionPosition === "above"}
              ?disabled=${captionPosition === "none" || this.historyState.preview !== null || this.htmlPending}
              @change=${(event: Event) => this.dispatchEvent(new CustomEvent("layout-action", {
                detail: {type: "setCaption", position: (event.currentTarget as HTMLInputElement).checked ? "above" : "below"}, bubbles: true, composed: true,
              }))}>Top</label>
          </span>
          <div class="float-button-group caption-button-group" role="group" aria-label="Caption">
            <button type="button" class="caption-none" aria-label="No caption" title="No caption" aria-pressed=${captionPosition === "none"}
              ?disabled=${this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {
                detail: {type: "setCaption", position: "none"}, bubbles: true, composed: true,
              }))}>${this.captionIcon("none")}</button>
            ${(["left", "center", "right"] as const).map(alignment => html`<button type="button"
              class=${`caption-${captionPlacement}-${alignment}`}
              aria-label=${`Caption ${captionPlacement}, align ${alignment}`} title=${`Caption ${captionPlacement}, align ${alignment}`}
              aria-pressed=${captionPosition !== "none" && (this.captionAlignment ?? "left") === alignment}
              ?disabled=${this.historyState.preview !== null || this.htmlPending}
              @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
              @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {
                detail: {type: "setCaption", position: captionPlacement, alignment}, bubbles: true, composed: true,
              }))}>${this.captionIcon(captionPlacement, alignment)}</button>`)}
          </div>
          ${this.renderAttributionField()}
          ${this.layoutError ? html`<p class="document-layout-error" role="alert">${this.layoutError}</p>` : ""}
        </div>
    `
  }

  private renderAttributionField() {
    return html`<div class="attribution-field">
      <span id="attribution-label" class="float-placement-label">Attribution</span>
      <button type="button" aria-label="Edit attribution" aria-describedby="attribution-label" aria-haspopup="dialog"
        ?disabled=${this.historyState.preview !== null || this.htmlPending}
        @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
        @click=${() => this.dispatchEvent(new CustomEvent("layout-action", {
          detail: {type: "openAttribution"}, bubbles: true, composed: true,
        }))}>Edit…</button>
    </div>`
  }

  private captionIcon(position: "none" | "above" | "below", alignment: "left" | "center" | "right" = "left") {
    return unsafeSVG(captionIconSource(position, alignment))
  }

  private selectDocumentLayout(mode: DocumentLayoutMode) {
    this.dispatchEvent(new CustomEvent("document-layout-change", {detail: {mode}, bubbles: true, composed: true}))
  }

  selectTool(tool: ToolboxTool | null, expand = false) {
    if(tool && (this.preview ? tool !== "Feedback" : tool === "Feedback")) return
    if(tool === "AI" && this.disableAI) return
    if(tool === "Style" && !this.showStyleToolbox) return
    const nextTool = tool
    if(this.htmlPending && nextTool !== "Edit") return
    if(this.activeTool === nextTool && !(expand && this.collapsed)) return
    if(nextTool === null) this.advancedOpen.clear()
    const previousMenu = this.activeMenu
    this.activeTool = nextTool
    if(nextTool) {
      this.activeMenu = nextTool === "Review" || nextTool === "AI" || nextTool === "Feedback" ? "Edit" : nextTool
      if(nextTool !== "Feedback" && nextTool !== "AI" && (nextTool !== "Style" || previousMenu === nextTool)) {
        this.dispatchEvent(new Event("element-style-state-request", {bubbles: true, composed: true}))
      }
    }
    this.dispatchEvent(new CustomEvent<{tool: ToolboxTool | null}>("toolbox-change", {
      detail: {tool: nextTool},
      bubbles: true,
      composed: true,
    }))
  }

  private renderVersionsFooter() {
    return html`<footer class="edit-mode-footer">
      <div class="developer-console-controls" role="group" aria-label="Versions controls">
        <button type="button" class="versions-console-toggle" aria-label="Versions" title="Versions"
          aria-pressed=${this.versionsOpen} ?disabled=${this.htmlPending}
          @click=${() => this.dispatchEvent(new CustomEvent("versions-console-change", {
            detail: {enabled: !this.versionsOpen}, bubbles: true, composed: true,
          }))}>${ribbonIcon("History")}<span>Versions</span></button>
        ${this.versionsOpen ? html`<button type="button" aria-label="Close versions" title="Close versions"
          ?disabled=${this.htmlPending} @click=${() => this.dispatchEvent(new CustomEvent("versions-console-change", {
            detail: {enabled: false}, bubbles: true, composed: true,
          }))}>${ribbonIcon("Reject")}</button>` : nothing}
      </div>
      ${this.consoleOpen ? this.renderDeveloperConsoleControls() : nothing}
    </footer>`
  }

  private renderEditModeFooter() {
    return html`<footer class="edit-mode-footer">
      ${this.renderDeveloperConsoleControls()}
    </footer>`
  }

  private renderDeveloperConsoleControls() {
    return html`<div class="developer-console-controls" role="group" aria-label="Developer console controls">
        <button class="developer-console-toggle" type="button" aria-label="Developer console" title="Developer console"
          aria-pressed=${this.consoleOpen} ?disabled=${this.htmlPending}
          @click=${() => this.dispatchEvent(new CustomEvent("developer-console-change", {detail: {enabled: !this.consoleOpen}, bubbles: true, composed: true}))}
        >${ribbonIcon("Develop")}<span>Developer console</span></button>
        ${this.consoleOpen ? html`<button class="console-close" type="button" aria-label="Close developer console" title="Close developer console"
          ?disabled=${this.htmlPending}
          @click=${() => this.dispatchEvent(new CustomEvent("developer-console-change", {detail: {enabled: false}, bubbles: true, composed: true}))}
        >${ribbonIcon("Reject")}</button>` : ""}
      </div>
    `
  }

  protected willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed)
    if(changed.has("preview")) {
      if(this.preview) {
        this.normalTool = this.activeTool === "Feedback" ? null : this.activeTool
        this.selectTool(null)
      }
      else if(changed.get("preview") === true) this.selectTool(this.normalTool)
    }
    if(changed.has("feedbackActive") && !this.feedbackActive) {
      this.feedbackDraft = ""
      this.feedbackParticipant = ""
      this.feedbackError = ""
    }
    if(this.disableAI && this.activeTool === "AI") this.selectTool(null)
    if(changed.has("activeTool") && this.activeTool === null) this.advancedOpen.clear()
    if(!this.showStyleToolbox && this.activeTool === "Style") {
      this.selectTool(null)
      this.activeMenu = "Edit"
    }
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if(this.activeTool !== "Review") {
      this.revealedHoveredIssueId = null
    }
    else if(changed.has("activeTool") || changed.has("proofreadingState")) {
      const issueId = this.proofreadingState.hoveredIssueId
      if(!issueId) this.revealedHoveredIssueId = null
      if(issueId && issueId !== this.revealedHoveredIssueId) {
        const scrollArea = this.renderRoot.querySelector<HTMLElement>(".proofreading-content")
        const issueIndex = this.proofreadingState.issues.findIndex(issue => issue.id === issueId)
        const card = issueIndex < 0 ? null : scrollArea?.querySelectorAll<HTMLElement>(".proofreading-card")[issueIndex] ?? null
        if(scrollArea && card) {
          const areaBounds = scrollArea.getBoundingClientRect()
          const cardBounds = card.getBoundingClientRect()
          if(cardBounds.top < areaBounds.top) scrollArea.scrollTop += cardBounds.top - areaBounds.top
          else if(cardBounds.bottom > areaBounds.bottom) scrollArea.scrollTop += cardBounds.bottom - areaBounds.bottom
          this.revealedHoveredIssueId = issueId
        }
      }
    }
    if(this.activeTool !== "Edit" || !this.documentSelected) {
      this.documentHeadAttributeEditorId = ""
    }
    if(changed.has("activeTool")) {
      if(changed.get("activeTool") === "Review" && this.activeTool !== "Review") {
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

  private renderFeedback() {
    const connected = this.feedbackParticipants.filter(participant => participant.connected)
    const canSend = this.feedbackActive && this.feedbackRole === "host"
      && connected.some(participant => participant.id === this.feedbackParticipant) && Boolean(this.feedbackDraft.trim())
    return html`<section class="feedback-content" aria-label="Session feedback">
      ${this.feedbackRole === "learner" ? nothing : html`
        ${!this.feedbackActive ? html`<p>Start sharing to give feedback to participants.</p>` : !connected.length ? html`<p>Waiting for participants</p>` : nothing}
        <form @submit=${(event: SubmitEvent) => {
          event.preventDefault()
          if(!canSend) return
          const accepted = this.dispatchEvent(new CustomEvent("live-feedback-send", {
            detail: {participant: this.feedbackParticipant, text: this.feedbackDraft.trim()},
            bubbles: true, composed: true, cancelable: true,
          }))
          if(accepted) { this.feedbackDraft = ""; this.feedbackError = "" }
          else this.feedbackError = "Could not send feedback. Check that the participant is connected."
        }}>
          <label>Participant<select aria-label="Feedback participant" .value=${this.feedbackParticipant}
            ?disabled=${!this.feedbackActive || !connected.length}
            @change=${(event: Event) => { this.feedbackParticipant = (event.currentTarget as HTMLSelectElement).value; this.feedbackError = "" }}>
            <option value="">Select participant</option>
            ${this.feedbackParticipants.map(participant => html`<option value=${participant.id} ?disabled=${!participant.connected}>${participant.name}</option>`)}
          </select></label>
          <label>Feedback<textarea aria-label="Feedback message" maxlength="4000" .value=${this.feedbackDraft}
            ?disabled=${!this.feedbackActive || !connected.length}
            @input=${(event: Event) => { this.feedbackDraft = (event.currentTarget as HTMLTextAreaElement).value }}></textarea></label>
          <button type="submit" ?disabled=${!canSend}>Send feedback</button>
        </form>
        ${this.feedbackError ? html`<p role="alert">${this.feedbackError}</p>` : nothing}
      `}
      <ul class="feedback-messages" aria-label=${this.feedbackRole === "learner" ? "Received feedback" : "Sent feedback"} aria-live="polite">
        ${this.feedbackMessages.map(message => html`<li>
          ${this.feedbackRole === "host" ? html`<strong>${this.feedbackParticipants.find(participant => participant.id === message.participant)?.name ?? "Participant"}</strong>` : nothing}
          <p>${message.text}</p>
          <time datetime=${new Date(message.time).toISOString()}>${new Date(message.time).toLocaleTimeString()}</time>
        </li>`)}
      </ul>
      ${this.feedbackRole === "learner" && !this.feedbackMessages.length ? html`<p>No feedback yet</p>` : nothing}
    </section>`
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
            ${(this.preview ? [{label: "Feedback" as const, icon: "Comments"}] : tools).filter(tool => (tool.label !== "Style" || this.showStyleToolbox) && (tool.label !== "AI" || !this.disableAI)).map(tool => {
              const active = !this.collapsed && this.activeTool === tool.label
              const tabId = `toolbox-tab-${tool.label.toLowerCase()}`
              const contextualLabel = tool.label === "Edit" ? this.editTypeLabel : null
              const toolLabel = tool.label === "AI" ? "Ask AI" : tool.label
              const label = contextualLabel ?? toolLabel
              const commentCount = tool.label === "Review" ? this.commentState.count : 0
              const accessibilityCount = tool.label === "Review" && this.proofreadingState.enabled
                ? this.proofreadingState.issues.filter(issue => issue.kind === "accessibility").length : 0
              const reviewDescription = tool.label === "Review"
                ? [accessibilityCount > 0 ? `${accessibilityCount} accessibility ${accessibilityCount === 1 ? "issue" : "issues"}` : "", commentCount > 0 ? `${commentCount} comments` : "", this.proofreadingState.error ? "Issue checker unavailable" : ""].filter(Boolean).join(". ")
                : ""
              return html`
                <div
                  class="toolbox-tab"
                  ?data-comments=${commentCount > 0 && tool.label === "Review"}
                  ?data-accessibility=${accessibilityCount > 0}
                  ?data-active=${active}
                  ?data-contextual=${contextualLabel !== null}
                  ?data-available=${(contextualLabel !== null || tool.label === "Feedback") && (this.activeTool === null || this.collapsed)}
                  data-hover-kind=${tool.label === "Review" && this.activeTool !== "Review" ? this.proofreadingState.issues.find(issue => issue.id === this.proofreadingState.hoveredIssueId)?.kind ?? nothing : nothing}
                >
                  <button
                    id=${tabId}
                    class="toolbox-tab-button"
                    data-tool=${tool.label}
                    type="button"
                    role="tab"
                    aria-label=${tool.label === "Review" && this.proofreadingState.error
                      ? "Review. Issue checker unavailable"
                      : contextualLabel ? `Edit ${contextualLabel}` : toolLabel}
                    title=${tool.label === "Review" && this.proofreadingState.error
                      ? "Issue checker unavailable"
                      : contextualLabel ? `Edit ${contextualLabel}` : toolLabel}
                    aria-description=${reviewDescription || nothing}
                    aria-controls="toolbox-pane"
                    aria-selected=${active}
                    ?disabled=${this.htmlPending && tool.label !== "Edit"}
                    @click=${() => this.selectTool(tool.label, true)}
                  >
                    <span class="toolbox-tab-icon" aria-hidden="true">
                      ${ribbonIcon(tool.icon)}
                      ${accessibilityCount > 0 ? html`<span class="toolbox-tab-accessibility-badge" aria-hidden="true">${accessibilityCount}</span>` : ""}
                      ${tool.label === "Review" && commentCount > 0 ? html`<sup class="toolbox-tab-comment-count">${commentCount}</sup>` : ""}
                      ${tool.label === "Review" && this.proofreadingState.error ? html`<span class="proofreading-error-badge">!</span>` : ""}
                    </span>
                    <span
                      class="toolbox-tab-label"
                      ?data-contextual=${contextualLabel !== null}
                      aria-hidden=${!active}
                    >${tool.label === "AI" ? html`<span class="ai-tab-label-prefix">Ask </span>AI` : label}</span>
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
          ?hidden=${this.activeTool === null || this.collapsed}
        >
          <div class="toolbox-pane-content" ?inert=${this.htmlPending || this.historyState.preview !== null && this.activeTool !== "Review"}>
            ${this.activeTool === "Feedback" ? this.renderFeedback() : ""}
            ${this.activeTool === "Review" ? html`
              <div class="review-section review-comments">${this.renderCommentDrawer()}</div>
              <div class="review-section review-issues">${guard(
                [this.proofreadingState, this.htmlPending, this.historyState.preview],
                () => this.renderProofreadingSection(),
              )}</div>
            ` : ""}
            ${this.activeTool === "Edit" ? this.renderUniversalStyleDrawer() : ""}
            ${this.activeTool === "Edit" && !this.documentSelected ? this.renderWidgetSharing() : ""}
            ${this.activeTool && this.activeTool !== "AI" && this.activeTool !== "Review" ? this.renderDrawers() : ""}
            ${this.activeTool === "Edit" && !this.documentSelected ? this.renderShapeDrawer() : ""}
            <div class="ai-toolbox-content" ?hidden=${this.activeTool !== "AI"}></div>
          </div>
          ${this.activeTool === "Review" ? this.renderVersionsFooter()
            : (this.activeTool === "Edit" || this.consoleOpen && this.activeTool !== "Feedback") ? this.renderEditModeFooter() : ""}
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
