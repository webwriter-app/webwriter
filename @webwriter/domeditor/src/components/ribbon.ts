import {layoutPreviewStyles} from "./template-preview"
import {css, html, nothing, render} from "lit"
import {aiChatStyles} from "./ai-chat.styles"
import {version} from "../../package.json"
import {
  requestsReadOnlyAI,
  completeAIConversation,
  type AIAttachment,
  type AIConversationMessage,
  type AIDocumentToolCall,
  type AIDocumentToolHandler,
  type AIEffort,
} from "../ai-client"
import {AIProviderStore, type AIProviderConfig} from "../ai-provider"
import {isAIReadTool} from "../ai-tools"
import {persistAppSettings, type AppSettings} from "../app-settings"
import type {BackendClient} from "../backend-client"
import {type PresenceUser} from "../editor-bridge"
import {mediaCaptureOptions, type MediaType} from "../media"
import {fontFamilyOptions, fontSizeOptions, textColorOptions, backgroundColorOptions, primaryDrawerMarkNames} from "../marks"
import {layoutPresets} from "../layouts"
import {packageKeywordPresentations} from "../package-keywords"
import type {WebWriterPackage} from "../packages"
import {packageAction, packageMemberAction, packageToggleAction} from "../packages"
import {ribbonIcon} from "../ribbon-icons"
import {uiMotionDisabled} from "../utility"
import "./ai-settings"
import type {AISettingsDialog} from "./ai-settings"
import "./element-attribute-editor"
import "./element-style-editor"
import {insertionMenuItems} from "./insertion-menu"
import "./package-search"
import type {QRCodeElement} from "./qr-code"
import "./ribbon-button"
import {type RibbonButton, type RibbonButtonDetails} from "./ribbon-button"
import "./ribbon-combobox"
import "./ribbon-drawer"
import {RibbonDrawer} from "./ribbon-drawer"
import "./ribbon-menu"
import {type RibbonMenu, type RibbonMenuButton, type RibbonMenuGroup} from "./ribbon-menu"
import {
  aiEfforts,
  contextDrawerPolicy,
  listInsertionOptions,
  menuGroups,
  menuTabs,
  orderedListStyles,
  placeholderSharingLink,
  storageLocations,
  type RibbonMenuName,
  type StorageLocation,
} from "./ribbon-menu-config"
import "./ribbon-tab"
import "./settings-panel"
import {type SettingsPanel} from "./settings-panel"
import {EditingControls} from "./editing-controls"

export type LiveLearnerRibbonItem = {
  id: string
  name: string
  initials: string
  color: string
  connected: boolean
  enabled: boolean
}

type AIChatMessage = {
  id: string
  role: "user" | "assistant" | "event"
  content: string
  attachments?: AIAttachment[]
  edit?: AIEditProtocol
}

type AIChat = {
  id: string
  title: string
  messages: AIChatMessage[]
}

type AIPromptSubmitDetail = {
  prompt: string
  chatId: string
  providerId: string
  model: string
  effort: AIEffort
  attachments: {name: string, mimeType: string, size: number}[]
}

type PendingAIEdit = {
  call: AIDocumentToolCall
  chatId: string
  summary: string
  previewing: boolean
  deciding: boolean
  queuedDecision?: "accept" | "reject"
  resolve: (value: unknown) => void
}

type AIEditProtocol = {
  call: AIDocumentToolCall
  editId: string
  summary: string
  decision: "accepted" | "rejected" | "undone"
  busy?: boolean
}

export type AIEditReviewAction = "preview" | "accept" | "reject" | "goto" | "undo"
export type AIEditReviewHandler = (action: AIEditReviewAction, call: AIDocumentToolCall, options?: {signal?: AbortSignal}) => Promise<unknown>


/** The editor's tabbed, responsive ribbon toolbar. */
export class AppRibbon extends EditingControls {
  static properties = {
    ...EditingControls.properties,
    expanded: {type: Boolean, reflect: true},
    menuOpen: {type: Boolean, reflect: true},
    documentDialog: {state: true},
    logoUrl: {type: String, attribute: "logo-url"},
    presenceUsers: {attribute: false},
    packages: {attribute: false},
    installedPackages: {attribute: false},
    consoleOpen: {type: Boolean, attribute: false},
    packagesLoading: {type: Boolean, attribute: "packages-loading"},
    busyPackageNames: {attribute: false},
    packageError: {type: String, attribute: "package-error"},
    packageSearchQuery: {type: String, state: true},
    breadcrumbVisible: {type: Boolean},
    packageDrawerOpen: {type: Boolean, reflect: true, attribute: "package-drawer-open"},
    packageVisibleCount: {type: Number, state: true},
    layoutInsertionError: {type: String, attribute: "layout-insertion-error"},
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
    previewActive: {type: Boolean, attribute: "preview-active"},
    previewTransitioning: {type: Boolean, attribute: "preview-transition", reflect: true},
    liveSessionActive: {type: Boolean, attribute: "live-session-active"},
    liveSessionRole: {type: String, attribute: "live-session-role"},
    liveSessionLink: {type: String, attribute: "live-session-link"},
    liveLearners: {attribute: false},
    storageLocation: {type: String, state: true},
    aiPrompt: {type: String, state: true},
    aiChatOpen: {type: Boolean, attribute: false},
    aiToolboxTarget: {attribute: false},
    aiChats: {attribute: false, state: true},
    activeAIChatId: {type: String, state: true},
    aiModel: {type: String, state: true},
    aiEffort: {type: String, state: true},
    aiProviders: {attribute: false, state: true},
    aiAttachments: {attribute: false, state: true},
    aiBusy: {type: Boolean, state: true},
    aiProgress: {type: String, state: true},
    aiError: {type: String, state: true},
    pendingAIEdit: {attribute: false, state: true},
    aiDocumentToolHandler: {attribute: false},
    aiEditReviewHandler: {attribute: false},
    backendClient: {attribute: false},
    backendState: {type: String, attribute: "backend-state"},
  }

  static styles = css`
    ${EditingControls.styles}

    :host {
      box-sizing: border-box;
      display: block;
      position: relative;
      z-index: 1;
      width: 100%;
      height: 140px;
      max-height: 140px;
      overflow: visible;
      color: #2f3742;
      background: #ffffff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-user-select: none;
      user-select: none;
      transition: none;
    }

    :host([transitions-ready]) {
      transition: var(--ww-ui-transition,
        height 180ms ease,
        max-height 180ms ease);
    }

    :host([preview-transition]) {
      overflow: hidden;
    }

    :host(:not([expanded])) {
      height: 120px;
      max-height: 40px;
    }

    :host([package-drawer-open]) {
      z-index: 3;
    }

    :host(:not([expanded])) .ribbon {
      background: #f2f2f2;
    }

    .ribbon {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      position: relative;
      height: 100%;
      border-bottom: 0.5px solid #d8dee6;
      background: #ffffff;
      --ribbon-area-background: #f2f2f2;
      --ribbon-area-border: #d8dee6;
      --ribbon-compact-bar-height: 24px;
      transition: var(--ww-ui-transition, background-color 180ms ease);
    }

    .ribbon.preview {
      --ribbon-control-color: #000;
      --ribbon-qr-filter: brightness(0);
    }

    .ribbon-top {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 40px;
      position: relative;
      align-items: center;
      height: 40px;
      min-height: 40px;
      padding: 0;
      gap: 0;
      z-index: 1;
    }

    :host([menuopen]) .ribbon-top {
      /* Let the active tab cover the menu's top border at their shared edge. */
      z-index: 5;
    }

    .brand {
      box-sizing: border-box;
      display: flex;
      flex: 0 100 50px;
      position: relative;
      width: 50px;
      align-items: center;
      justify-content: flex-start;
      min-width: 37px;
      height: 40px;
      padding: 0 0 0 13px;
      border: 0;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }

    .brand:hover:not(:disabled) .brand-logo {
      opacity: 0.8;
    }

    .brand:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .brand:disabled {
      cursor: default;
      opacity: 0.55;
    }

    .brand-logo {
      display: block;
      width: auto;
      height: 1.5rem;
    }

    .login-button {
      display: none;
      flex: 0 0 auto;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      height: 1.65rem;
      margin: 0 0.35rem;
      padding: 0 0.55rem;
      border: 1px solid #c8d2df;
      border-radius: 999px;
      color: #526b86;
      background: #ffffff;
      font: inherit;
      font-size: 0.66rem;
      white-space: nowrap;
      cursor: pointer;
    }

    .login-button::before {
      content: "";
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: #94a3b8;
    }

    .login-button[data-state="connected"] {
      color: #166534;
      border-color: #bbf7d0;
      background: #f0fdf4;
    }

    .login-button[data-state="connected"]::before {
      background: #22c55e;
    }

    .login-button[data-state="probing"]::before {
      background: #eab308;
    }

    .ribbon-navigation {
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      align-items: flex-start;
      min-width: 0;
      height: 40px;
    }

    .tabs {
      display: flex;
      flex: 0 1 auto;
      align-items: flex-start;
      align-self: flex-start;
      height: 41px;
      /* Prefer a 100px filename and roomy actions, leaving room for the AI bar. */
      min-width: calc(100px + 1.7rem + 3rem);
      /* Extend the file tab toward the brand without moving its filename. */
      margin-left: -0.5rem;
      overflow: clip;
      --ribbon-active-tab-background: #f2f2f2;
      --ribbon-active-tab-border: #d8dee6;
    }

    :host(:not([expanded])) .tabs {
      --ribbon-active-tab-background: #ffffff;
      --ribbon-active-tab-border: #a8a8a8;
    }

    .tabs > ribbon-tab[active] {
      anchor-name: --active-ribbon-tab;
    }

    .tabs > ribbon-tab[label="File"] {
      /* Reserve filename text space in addition to its menu chevron. */
      min-width: calc(100px + 1.7rem);
    }

    .file-quick-actions {
      box-sizing: border-box;
      display: flex;
      flex: 0 1 4rem;
      width: 4rem;
      min-width: 3rem;
      align-items: center;
      align-self: flex-start;
      justify-content: space-between;
      height: 40px;
    }

    .file-quick-actions::before,
    .file-quick-actions::after {
      content: "";
      flex: 0 100 0.2rem;
    }

    ribbon-button.file-quick-action {
      flex: 0 1 1.75rem;
      min-width: 1.5rem;
      width: 1.75rem;
    }

    .ai-bar-slot {
      box-sizing: border-box;
      /* Let the AI bar absorb almost all top-row compression before the tabs. */
      flex: 1 100 600px;
      width: auto;
      max-width: 600px;
      min-width: 24px;
      height: 40px;
      min-height: 40px;
      margin: 0 0.35rem 0 auto;
      anchor-name: --ai-bar-slot;
    }

    ${aiChatStyles}

    .document-dialog {
      box-sizing: border-box;
      width: min(42rem, calc(100vw - 2rem));
      max-height: calc(100dvh - 2rem);
      padding: 1.25rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.75rem;
      color: #202833;
      background: white;
      box-shadow: 0 1.25rem 3rem rgb(15 23 42 / 28%);
    }

    .document-dialog::backdrop { background: rgb(15 23 42 / 45%); }
    .document-dialog header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .document-dialog h2 { margin: 0; font-size: 1rem; }
    .document-dialog header button {
      padding: 0.35rem 0.65rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.35rem;
      color: inherit;
      background: #fff;
      font: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }
    .document-dialog header button:hover { background: #eef4fb; }
    #settings-dialog {
      height: min(45rem, calc(100dvh - 2rem));
      padding: 0;
      overflow: hidden;
    }

    #settings-dialog[open] {
      display: flex;
      flex-direction: column;
    }

    .settings-dialog-nav {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .settings-dialog-nav form {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }

    .settings-version {
      color: #687383;
      font-size: 0.75rem;
      white-space: nowrap;
    }

    .settings-dialog-nav button {
      min-height: 2rem;
      padding: 0.35rem 0.65rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.35rem;
      color: inherit;
      background: transparent;
      font: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .settings-dialog-nav button:hover { background: #eef4fb; }
    .settings-dialog-nav button:focus-visible { outline: 2px solid #3977c7; outline-offset: 1px; }

    .settings-dialog-nav .settings-close-button {
      display: grid;
      place-items: center;
      width: 2rem;
      padding: 0;
      border: 0;
    }

    .settings-close-button svg { width: 1.1rem; height: 1.1rem; }

    .settings-dialog-main {
      flex: 1 1 auto;
      min-height: 0;
      padding: 1.25rem;
      overflow-y: auto;
      scrollbar-color: #b8c1cc transparent;
      scrollbar-width: thin;
    }

    ribbon-menu {
      top: 39px;
      left: 0;
    }

    @supports (top: anchor(bottom)) {
      ribbon-menu {
        position-anchor: --active-ribbon-tab;
        top: calc(anchor(bottom) - 1px);
        left: anchor(left);
        width: max(200px, anchor-size(width));
      }
    }

    .history-button {
      display: grid;
      flex: 0 0 2rem;
      place-items: center;
      width: 2rem;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 0.35rem;
      color: #5e6977;
      background: transparent;
      cursor: pointer;
    }

    .history-controls {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      height: var(--ribbon-compact-bar-height);
      margin-inline: 0.15rem;
      padding: 0 0.1rem;
      border: 1px solid #c4ccd6;
      border-radius: 0.62rem;
      color: #5e6977;
      background: transparent;
    }

    .history-controls .history-button {
      height: 1.35rem;
      border-radius: 0.45rem;
    }

    .ribbon-top-actions {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      margin-left: auto;
    }

    .presence-users {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      height: 40px;
      margin: 0 0.35rem 0 0.5rem;
    }

    .presence-user,
    .presence-more {
      box-sizing: border-box;
      display: grid;
      flex: 0 0 1.5rem;
      place-items: center;
      width: 1.5rem;
      height: 1.5rem;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 1px 3px rgb(0 0 0 / 25%);
    }

    .presence-user {
      margin-left: -0.45rem;
      color: #ffffff;
      background: var(--presence-color);
      font-size: 0.55rem;
      font-weight: 700;
      line-height: 1;
      text-align: center;
      text-transform: uppercase;
    }

    .presence-user:first-child {
      margin-left: 0;
    }

    .presence-more {
      margin-left: -0.45rem;
      flex-basis: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      color: #5e6977;
      background: #e8eef5;
      font-size: 0.45rem;
      font-weight: 700;
      line-height: 1;
    }

    .presence-more-content {
      display: flex;
      align-items: center;
      gap: 0.02rem;
    }

    .presence-more-icon,
    .presence-more-icon svg {
      display: block;
      width: 0.45rem;
      height: 0.45rem;
    }

    .preview-button {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      min-width: 2.5rem;
      height: 40px;
      margin-left: 10px;
      padding: 0 0.5rem;
      border: 1px solid transparent;
      border-radius: 0.35rem;
      color: #5e6977;
      background: transparent;
      cursor: pointer;
    }

    .preview-button[active] {
      position: relative;
      border-color: #d8dee6;
      border-bottom-color: transparent;
      border-radius: 0.35rem 0.35rem 0 0;
      color: var(--ribbon-control-color, #1e4f87);
      background: var(--ribbon-area-background);
      box-shadow: none;
    }

    .preview-button[active]::after {
      box-sizing: border-box;
      position: absolute;
      right: -1px;
      bottom: -2px;
      left: -1px;
      height: 2px;
      border-inline: 1px solid var(--ribbon-area-border);
      background: var(--ribbon-area-background);
      content: "";
    }

    .preview-button:hover {
      color: var(--ribbon-control-color, #243447);
      background: #e8eef5;
    }

    .preview-button[active]:hover {
      background: var(--ribbon-area-background);
    }

    .preview-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .learners-summary {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      padding: 0 0.3rem;
      color: var(--ribbon-control-color, #526b86);
      font-size: 0.68rem;
    }

    .live-session-switch {
      display: flex;
      flex-direction: column;
      align-self: center;
      align-items: center;
      gap: 0.35rem;
      min-height: 1.55rem;
      padding: 0.25rem;
      border-radius: 0.3rem;
      color: var(--ribbon-control-color, #334155);
      font-size: 0.66rem;
      cursor: pointer;
    }

    .live-session-switch:hover {
      color: var(--ribbon-control-color, #1e4f87);
    }

    .live-session-switch:focus-within {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .live-session-switch input {
      appearance: none;
      position: relative;
      margin: 0;
      width: 1.9rem;
      height: 1.05rem;
      border: 1px solid #9aa9b8;
      border-radius: 999px;
      background: #d8dee6;
      cursor: pointer;
    }

    .live-session-switch input::after {
      position: absolute;
      top: 0.12rem;
      left: 0.12rem;
      width: 0.69rem;
      height: 0.69rem;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
      content: "";
      transition: var(--ww-ui-transition, transform 120ms ease);
    }

    .live-session-switch input:checked {
      border-color: #3977c7;
      background: #3977c7;
    }

    .live-session-switch input:checked::after {
      transform: translateX(0.83rem);
    }

    .learners-summary-avatars {
      display: flex;
      min-width: 1.5rem;
    }

    .learner-avatar {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 1.35rem;
      height: 1.35rem;
      margin-inline-start: -0.35rem;
      border: 2px solid #f2f2f2;
      border-radius: 50%;
      color: white;
      background: var(--learner-color);
      font-size: 0.48rem;
      font-weight: 700;
    }

    .learner-avatar:first-child {
      margin-inline-start: 0;
    }

    .learner-list {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
      gap: 0.25rem;
      width: 100%;
      max-height: 100%;
      overflow: auto;
      padding: 0.25rem;
    }

    .learner-toggle {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      height: 1.8rem;
      padding: 0 0.4rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.35rem;
      color: #334155;
      background: white;
      font: inherit;
      font-size: 0.66rem;
      cursor: pointer;
    }

    .learner-toggle[aria-pressed="false"] {
      color: #7b8795;
      background: #eef1f4;
      opacity: 0.72;
    }

    .learner-toggle:hover {
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .learner-toggle:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .learner-toggle-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .learner-connection {
      flex: 0 0 0.42rem;
      width: 0.42rem;
      height: 0.42rem;
      margin-inline-start: auto;
      border-radius: 50%;
      background: #94a3b8;
    }

    .learner-connection[data-connected] {
      background: #22c55e;
    }

    .history-button:hover {
      color: #243447;
      background: #e8eef5;
    }

    .history-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .history-icon {
      display: block;
      width: 1rem;
      height: 1rem;
    }

    .history-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .preview-icon {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 1.2rem;
      height: 1.2rem;
      padding: 0.1rem;
      border: 1.5px solid currentColor;
      border-radius: 50%;
    }

    .preview-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ribbon-content {
      display: flex;
      flex: 1 1 auto;
      flex-wrap: nowrap;
      align-items: stretch;
      justify-content: flex-start;
      gap: 0;
      min-height: 0;
      overflow-x: clip;
      overflow-y: visible;
      padding: 0.25rem 0.5rem 0.2rem;
      border-top: 1px solid var(--ribbon-area-border);
      background: var(--ribbon-area-background);
    }

    .ribbon-content[hidden] {
      display: none;
    }

    .ribbon-content > ribbon-drawer:not(:first-child) {
      --ribbon-drawer-inline-start: auto;
      --ribbon-drawer-inline-end: 0;
    }

    .layout-gallery {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
      gap: 0.45rem;
      width: 100%;
      min-width: 0;
      padding: 0.35rem 0.1rem 0.45rem;
    }

    ${layoutPreviewStyles}

    .layout-insertion-error {
      grid-column: 1 / -1;
      padding: 0.3rem 0.45rem;
      border: 1px solid #e8b4b4;
      border-radius: 0.25rem;
      color: #8f2020;
      background: #fff5f5;
      font-size: 0.64rem;
      line-height: 0.85rem;
    }

    .custom-layout {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-top: 1px solid #d8dee6;
      padding-top: 0.5rem;
    }

    .file-name-row {
      box-sizing: border-box;
      display: flex;
      grid-column: 1 / -1;
      grid-row: 1;
      align-items: center;
      min-width: 0;
      padding: 0.1rem 0.25rem;
    }

    .file-name-field {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: 0;
      min-width: 0;
      max-width: 100%;
    }

    .file-name {
      box-sizing: border-box;
      flex: 1 1 auto;
      field-sizing: content;
      width: auto;
      min-width: 0;
      max-width: 12.75rem;
      height: 1.55rem;
      padding: 0 0.4rem;
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.7rem;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-name:hover {
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .file-name:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .storage-location {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 0.15rem;
      margin-left: auto;
      min-width: 0;
      color: #526b86;
    }

    .storage-location-icon {
      display: block;
      flex: 0 0 0.9rem;
      width: 0.9rem;
      height: 0.9rem;
    }

    .storage-location-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .storage-location-select {
      box-sizing: border-box;
      field-sizing: content;
      min-width: 0;
      max-width: 9rem;
      height: 1.55rem;
      padding: 0 0.2rem;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.7rem;
      cursor: pointer;
    }

    .storage-location-select:hover {
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .storage-location-select:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    ribbon-button.file-action {
      grid-row: 2;
      min-width: 0;
    }

`

  expanded = true

  menuOpen = false

  private documentDialog: "settings" | null = null

  logoUrl = ""

  presenceUsers: PresenceUser[] = []

  packages: WebWriterPackage[] = []

  installedPackages: WebWriterPackage[] = []

  consoleOpen = false

  packagesLoading = false

  busyPackageNames: string[] = []

  packageError = ""

  layoutInsertionError = ""

  private tableGridRows = 2

  private tableGridColumns = 2

  private sharingQRCodeImageDataURL = ""

  private sharingQRCodeImageLink = ""

  private sharingQRCodeImageLoading = false

  private sharingQRCodeImageRetryScheduled = false

  private sharingCopyLinkActive = false

  private sharingCopyLinkSuccess = false

  private sharingCopyQRActive = false

  private sharingCopyQRSuccess = false

  private sharingDownloadQRActive = false

  private sharingCopyLinkActiveTimer: ReturnType<typeof setTimeout> | undefined

  private sharingCopyQRActiveTimer: ReturnType<typeof setTimeout> | undefined

  private sharingCopyQRSuccessTimer: ReturnType<typeof setTimeout> | undefined

  private sharingDownloadQRActiveTimer: ReturnType<typeof setTimeout> | undefined

  private sharingCopyLinkSuccessTimer: ReturnType<typeof setTimeout> | undefined

  fileName = ""

  fileDirty = false

  previewActive = false

  liveSessionActive = false

  liveSessionRole: "host" | "learner" | "" = ""

  liveSessionLink = ""

  liveLearners: LiveLearnerRibbonItem[] = []

  storageLocation: StorageLocation = "local"

  breadcrumbVisible = true

  private packageSearchQuery = ""

  private packageDrawerOpen = false

  private packageVisibleCount = 2

  aiDocumentToolHandler: AIDocumentToolHandler | undefined

  aiEditReviewHandler: AIEditReviewHandler | undefined

  backendClient: BackendClient | null = null

  backendState: "probing" | "connected" | "unavailable" = "probing"

  private readonly aiProviderStore = new AIProviderStore()

  private backendConnectionSequence = 0

  private aiPrompt = ""

  aiChatOpen = false
  aiToolboxTarget: HTMLElement | null = null



  private aiChats: AIChat[] = [{id: "chat-1", title: "New chat", messages: []}]

  private activeAIChatId = "chat-1"

  private aiProviders: AIProviderConfig[] = this.aiProviderStore.providers

  private aiModel = this.aiProviderStore.activeProvider?.defaultModel ?? ""

  private aiEffort: AIEffort = "medium"

  private aiAttachments: AIAttachment[] = []

  private aiBusy = false
  private aiProgress = "AI is working…"

  private aiError = ""

  private pendingAIEdit: PendingAIEdit | null = null
  private pendingAIQueue: Promise<unknown> | null = null

  private aiAbortController: AbortController | null = null

  private aiChatSequence = 1

  private aiMessageSequence = 0

  private aiAttachmentSequence = 0

  private ribbonContentObserver: ResizeObserver | undefined

  private responsiveLayoutQueued = false

  private previewTransitioning = false

  private previewExpandedBefore = true

  private previewMenuBefore: RibbonMenuName = "Start"

  private previewTransitionTimer: ReturnType<typeof setTimeout> | undefined

  private readonly handleWindowResize = () => this.scheduleResponsiveLayout()

  private readonly handleAIProviderChange = () => {
    this.aiProviders = this.aiProviderStore.providers
    const provider = this.aiProviderStore.activeProvider
    if(!provider) {
      this.aiModel = ""
      return
    }
    if(!provider.models.includes(this.aiModel)) {
      this.aiModel = provider.defaultModel || provider.models[0] || ""
    }
    this.aiError = ""
  }

  private connectAIBackend = async (client: BackendClient | null) => {
    const sequence = ++this.backendConnectionSequence
    try {
      if(client) await this.aiProviderStore.connectBackend(client)
      else this.aiProviderStore.disconnectBackend()
    }
    catch(error) {
      if(sequence !== this.backendConnectionSequence) return
      this.aiError = error instanceof Error ? error.message : String(error)
    }
  }

  private schedulePreviewTransitionEnd() {
    if(this.previewTransitionTimer !== undefined) clearTimeout(this.previewTransitionTimer)
    this.previewTransitionTimer = setTimeout(() => {
      this.previewTransitionTimer = undefined
      this.previewTransitioning = false
    }, uiMotionDisabled(this) ? 0 : 180)
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(event.key !== "Escape") return
    const settings = this.renderRoot.querySelector<AISettingsDialog>("ai-settings-dialog")
    if(settings?.open) {
      event.stopImmediatePropagation()
      settings.close()
      return
    }
    if(this.aiChatOpen) {
      event.stopImmediatePropagation()
      this.closeAIChat(true)
      return
    }
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(!this.menuOpen) return

    const menu = this.renderRoot.querySelector("ribbon-menu")
    if(menu && event.composedPath().includes(menu)) return

    this.menuOpen = false
  }

  connectedCallback() {
    super.connectedCallback()
    this.aiProviderStore.addEventListener("change", this.handleAIProviderChange)
    this.handleAIProviderChange()
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown, true)
    window.addEventListener("resize", this.handleWindowResize)
  }

  disconnectedCallback() {
    if(this.aiToolboxTarget) render(nothing, this.aiToolboxTarget)
    this.aiProviderStore.removeEventListener("change", this.handleAIProviderChange)
    void this.cancelAIWork()
    if(this.previewTransitionTimer !== undefined) clearTimeout(this.previewTransitionTimer)
    this.previewTransitionTimer = undefined
    if(this.sharingCopyLinkActiveTimer !== undefined) clearTimeout(this.sharingCopyLinkActiveTimer)
    if(this.sharingCopyLinkSuccessTimer !== undefined) clearTimeout(this.sharingCopyLinkSuccessTimer)
    if(this.sharingCopyQRActiveTimer !== undefined) clearTimeout(this.sharingCopyQRActiveTimer)
    if(this.sharingCopyQRSuccessTimer !== undefined) clearTimeout(this.sharingCopyQRSuccessTimer)
    if(this.sharingDownloadQRActiveTimer !== undefined) clearTimeout(this.sharingDownloadQRActiveTimer)
    this.ribbonContentObserver?.disconnect()
    this.ribbonContentObserver = undefined
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown, true)
    window.removeEventListener("resize", this.handleWindowResize)
    super.disconnectedCallback()
  }

  protected firstUpdated() {
    // Commit the initial expanded layout before enabling height transitions.
    void this.offsetHeight
    this.setAttribute("transitions-ready", "")
    const content = this.renderRoot.querySelector<HTMLElement>(".ribbon-content")
    if(content && typeof ResizeObserver !== "undefined") {
      this.ribbonContentObserver = new ResizeObserver(() => this.scheduleResponsiveLayout())
      this.ribbonContentObserver.observe(content)
    }
    this.scheduleResponsiveLayout()
  }

  private scheduleResponsiveLayout() {
    if(this.responsiveLayoutQueued) return
    this.responsiveLayoutQueued = true
    queueMicrotask(async () => {
      this.responsiveLayoutQueued = false
      const drawers = Array.from(
        this.renderRoot.querySelectorAll<RibbonDrawer>(
          ".ribbon-content > ribbon-drawer",
        ),
      )
      await Promise.all(drawers.map(drawer => drawer.updateComplete))
      this.updateResponsiveLayout(drawers)
      await Promise.all(drawers.map(drawer => drawer.updateComplete))
      this.updatePackageCapacity()
    })
  }

  private updateResponsiveLayout(drawers: RibbonDrawer[]) {
    const content = this.renderRoot.querySelector<HTMLElement>(".ribbon-content")
    if(!content || content.hidden || !drawers.length) return

    const contentStyle = getComputedStyle(content)
    const inlinePadding =
      (Number.parseFloat(contentStyle.paddingLeft) || 0) +
      (Number.parseFloat(contentStyle.paddingRight) || 0)
    const availableWidth = content.clientWidth - inlinePadding
    if(availableWidth <= 0) return

    const widths = drawers.map(drawer => drawer.layoutWidths)
    const layouts: Array<"collapsed" | "compact" | "expanded"> = drawers
      .map(drawer => drawer.layout === "settings" ? "collapsed" : "expanded")
    const effectiveWidths = widths.map((width, index) => (
      layouts[index] === "collapsed" ? width.collapsed : width.expanded
    ))
    let requiredWidth = effectiveWidths.reduce((total, width) => total + width, 0)

    // Prefer each drawer's purpose-built compact layout before squeezing
    // flexible drawers or replacing any drawer with its pullout summary.
    for(let index = drawers.length - 1; index >= 0 && requiredWidth > availableWidth + 0.5; index--) {
      const compactWidth = widths[index].compact
      if(layouts[index] !== "expanded" || compactWidth === undefined || compactWidth >= effectiveWidths[index]) continue
      layouts[index] = "compact"
      requiredWidth -= effectiveWidths[index] - compactWidth
      effectiveWidths[index] = compactWidth
    }

    // Flexible drawers, currently Packages, may then give up width gradually
    // down to the minimum that still supports their authored compact layout.
    for(let index = drawers.length - 1; index >= 0 && requiredWidth > availableWidth + 0.5; index--) {
      const minimumWidth = widths[index].minimum
      if(layouts[index] === "collapsed" || minimumWidth === undefined || minimumWidth >= effectiveWidths[index]) continue
      requiredWidth -= effectiveWidths[index] - minimumWidth
      effectiveWidths[index] = minimumWidth
    }

    for(let index = drawers.length - 1; index >= 0 && requiredWidth > availableWidth + 0.5; index--) {
      if(layouts[index] === "collapsed") continue
      layouts[index] = "collapsed"
      requiredWidth -= effectiveWidths[index] - widths[index].collapsed
      effectiveWidths[index] = widths[index].collapsed
    }

    drawers.forEach((drawer, index) => {
      drawer.compact = layouts[index] === "compact"
      drawer.collapsed = layouts[index] === "collapsed"
    })
  }

  private updatePackageCapacity() {
    const drawer = this.renderRoot.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')
    if(!drawer) return
    // Search occupies one cell of the same three-row grid at every width.
    const visibleCount = drawer.packageColumnCount * 3 - 1
    if(this.packageVisibleCount !== visibleCount) this.packageVisibleCount = visibleCount
  }

  private toggleExpanded() {
    if(this.previewActive) {
      this.selectStart()
      return
    }
    this.expanded = !this.expanded
    this.menuOpen = false
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer")
      .forEach(drawer => drawer.closeDrawer())
    if(!this.expanded) this.selectStart()
  }

  private handleTopButtonClick(action: "Preview" | "Undo" | "Redo") {
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: action},
      bubbles: true,
      composed: true,
    }))
  }

  private selectStart() {
    if(this.previewActive) {
      this.dispatchEvent(new Event("ribbon-preview-exit", {bubbles: true, composed: true}))
      return
    }
    this.activeMenu = "Start"
    this.menuOpen = false
  }

  private updateAIPrompt(event: Event) {
    this.aiPrompt = (event.currentTarget as HTMLTextAreaElement).value
  }

  private get activeAIChat() {
    return this.aiChats.find(chat => chat.id === this.activeAIChatId) ?? this.aiChats[0]
  }

  private get activeAIProvider() {
    return this.aiProviderStore.activeProvider
  }

  private promptTitle(prompt: string) {
    return prompt.length > 36 ? `${prompt.slice(0, 35).trimEnd()}…` : prompt
  }

  private appendAIMessage(
    role: AIChatMessage["role"],
    content: string,
    chatId = this.activeAIChatId,
    attachments: AIAttachment[] = [],
  ) {
    const message: AIChatMessage = {
      id: `message-${++this.aiMessageSequence}`,
      role,
      content,
      ...(attachments.length ? {attachments: attachments.map(attachment => ({...attachment}))} : {}),
    }
    this.aiChats = this.aiChats.map(chat => chat.id === chatId ? {
      ...chat,
      title: chat.messages.length === 0 && role === "user" ? this.promptTitle(content) : chat.title,
      messages: [...chat.messages, message],
    } : chat)
    void this.updateComplete.then(() => {
      this.scrollAIChatToEnd()
    })
  }

  private scrollAIChatToEnd() {
    const messages = (this.aiToolboxTarget ?? this.renderRoot).querySelector<HTMLElement>(".ai-chat-messages")
    if(messages) messages.scrollTop = messages.scrollHeight
  }

  private appendAIEditProtocol(pending: PendingAIEdit, decision: AIEditProtocol["decision"]) {
    const content = decision === "accepted"
      ? `Accepted: ${pending.summary}`
      : decision === "rejected"
        ? `Rejected: ${pending.summary}`
        : `Undone: ${pending.summary}`
    const message: AIChatMessage = {
      id: `message-${++this.aiMessageSequence}`,
      role: "event",
      content,
      edit: {
        call: pending.call,
        editId: pending.call.id,
        summary: pending.summary,
        decision,
      },
    }
    this.aiChats = this.aiChats.map(chat => chat.id === pending.chatId
      ? {...chat, messages: [...chat.messages, message]}
      : chat)
    void this.updateComplete.then(() => this.scrollAIChatToEnd())
  }

  appendAIResponse(content: string, chatId = this.activeAIChatId) {
    const response = content.trim()
    if(response && this.aiChats.some(chat => chat.id === chatId)) {
      this.appendAIMessage("assistant", response, chatId)
    }
  }

  private dispatchAIPrompt(
    prompt: string,
    provider: AIProviderConfig,
    attachments: AIAttachment[],
    chatId: string,
  ) {
    this.dispatchEvent(new CustomEvent<AIPromptSubmitDetail>("ai-prompt-submit", {
      detail: {
        prompt,
        chatId,
        providerId: provider.id,
        model: this.aiModel,
        effort: this.aiEffort,
        attachments: attachments.map(({name, mimeType, size}) => ({name, mimeType, size})),
      },
      bubbles: true,
      composed: true,
    }))
  }

  private submitAIPrompt(event: SubmitEvent) {
    event.preventDefault()
    if(this.aiBusy) return
    const prompt = this.aiPrompt.trim() || (this.aiAttachments.length ? "Please review the attached file(s)." : "")
    if(!prompt) return
    void this.runAIPrompt(prompt)
  }

  private toggleAIChat = () => {
    if(this.settings.disableAI) return
    if(this.aiChatOpen) {
      this.closeAIChat(true)
      return
    }
    this.aiChatOpen = true
    void this.updateComplete.then(() => {
      (this.aiToolboxTarget ?? this.renderRoot).querySelector<HTMLTextAreaElement>(".ai-prompt-input")?.focus()
    })
  }

  private closeAIChat(restoreFocus = false) {
    if(!this.aiChatOpen) return
    this.aiChatOpen = false
    if(restoreFocus) void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLButtonElement>(".ai-prompt-expand")?.focus()
    })
  }

  private startNewAIChat = () => {
    const activeChat = this.activeAIChat
    if(activeChat?.title === "New chat" && activeChat.messages.length === 0) return
    const id = `chat-${++this.aiChatSequence}`
    this.aiChats = [{id, title: "New chat", messages: []}, ...this.aiChats]
    this.activeAIChatId = id
    this.aiPrompt = ""
    void this.updateComplete.then(() => {
      (this.aiToolboxTarget ?? this.renderRoot).querySelector<HTMLTextAreaElement>(".ai-prompt-input")?.focus()
    })
  }

  private switchAIChat(event: Event) {
    this.activeAIChatId = (event.currentTarget as HTMLSelectElement).value
    this.aiPrompt = ""
    this.aiError = ""
  }

  private updateAIModel(event: Event) {
    try {
      const [providerId, model] = JSON.parse((event.currentTarget as HTMLSelectElement).value) as unknown[]
      if(typeof providerId !== "string" || typeof model !== "string") return
      void this.aiProviderStore.activate(providerId).catch(error => {
        this.aiError = error instanceof Error ? error.message : String(error)
      })
      this.aiModel = model
      this.aiError = ""
    }
    catch {
      // Ignore a stale option from a provider that was edited concurrently.
    }
  }

  private updateAIEffort(event: Event) {
    this.aiEffort = (event.currentTarget as HTMLSelectElement).value as AIEffort
  }

  private dispatchAIBarAction(action: "attachments" | "settings") {
    this.dispatchEvent(new CustomEvent<{action: string}>("ai-bar-action", {
      detail: {action},
      bubbles: true,
      composed: true,
    }))
  }

  private showAISettings = () => {
    this.dispatchAIBarAction("settings")
    this.renderRoot.querySelector<AISettingsDialog>("ai-settings-dialog")?.show()
  }

  private chooseAIAttachments = () => {
    this.dispatchAIBarAction("attachments")
    const root = this.aiToolboxTarget ?? this.renderRoot
    root.querySelector<HTMLInputElement>(".ai-attachment-input")?.click()
  }

  private attachmentDataURL(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener("load", () => typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error(`Could not read ${file.name}`)))
      reader.addEventListener("error", () => reject(reader.error ?? new Error(`Could not read ${file.name}`)))
      reader.readAsDataURL(file)
    })
  }

  private async attachmentFromFile(file: File): Promise<AIAttachment> {
    const mimeType = file.type || "application/octet-stream"
    const textType = mimeType.startsWith("text/")
      || /\.(?:csv|css|html?|js|json|jsx|md|mjs|ts|tsx|xml|ya?ml)$/i.test(file.name)
    return {
      id: `attachment-${++this.aiAttachmentSequence}`,
      name: file.name,
      mimeType,
      size: file.size,
      kind: mimeType.startsWith("image/") ? "image" : textType ? "text" : "file",
      data: textType ? await file.text() : await this.attachmentDataURL(file),
    }
  }

  private addAIAttachments = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ""
    if(!files.length) return
    this.aiError = ""
    const maximumFileSize = 10 * 1024 * 1024
    const maximumTotalSize = 20 * 1024 * 1024
    const accepted: File[] = []
    let total = this.aiAttachments.reduce((sum, attachment) => sum + attachment.size, 0)
    for(const file of files) {
      if(this.aiAttachments.length + accepted.length >= 8) {
        this.aiError = "You can attach up to 8 files to one message."
        break
      }
      if(file.size > maximumFileSize) {
        this.aiError = `${file.name} is larger than the 10 MB attachment limit.`
        continue
      }
      if(total + file.size > maximumTotalSize) {
        this.aiError = "Attachments for one message cannot exceed 20 MB."
        break
      }
      accepted.push(file)
      total += file.size
    }
    try {
      const attachments = await Promise.all(accepted.map(file => this.attachmentFromFile(file)))
      this.aiAttachments = [...this.aiAttachments, ...attachments]
      this.aiChatOpen = true
    }
    catch(error) {
      this.aiError = error instanceof Error ? error.message : String(error)
    }
  }

  private removeAIAttachment(attachmentId: string) {
    this.aiAttachments = this.aiAttachments.filter(attachment => attachment.id !== attachmentId)
  }

  private conversationFor(chatId: string): AIConversationMessage[] {
    const chat = this.aiChats.find(candidate => candidate.id === chatId)
    return chat?.messages
      .map(message => ({
      role: message.role === "event" ? "assistant" as const : message.role,
      content: message.edit ? `Document change ${message.edit.editId}: ${message.edit.decision}. ${message.edit.summary}` : message.content,
      ...(message.attachments?.length
        ? {attachments: message.attachments.map(attachment => ({...attachment}))}
        : {}),
      })) ?? []
  }

  private handleAIDocumentTool(call: AIDocumentToolCall, chatId: string, signal = this.aiAbortController?.signal): Promise<unknown> {
    signal?.throwIfAborted()
    if(isAIReadTool(call.name)) {
      return this.aiDocumentToolHandler
        ? this.aiDocumentToolHandler(call, {signal})
        : Promise.resolve({status: "unavailable", message: "The document editor is not connected"})
    }
    const html = call.arguments.html
    const summary = call.arguments.summary
    if((call.name !== "queue_document_change" && typeof html !== "string") || typeof summary !== "string") {
      return Promise.resolve({status: "error", message: "The proposed edit is missing its HTML or summary"})
    }
    if(this.pendingAIEdit) {
      return this.pendingAIEdit.call.id === call.id && JSON.stringify(this.pendingAIEdit.call) === JSON.stringify(call)
        ? this.pendingAIQueue!
        : Promise.resolve({status: "error", message: "Another document change is awaiting review"})
    }
    this.pendingAIQueue = new Promise(resolve => {
      this.pendingAIEdit = {call, chatId, summary, previewing: true, deciding: false, resolve}
      this.activeAIChatId = chatId
      const cancel = () => {
        if(this.pendingAIEdit?.call.id === call.id) this.pendingAIEdit = null
        resolve({status: "error", message: "The document preview was cancelled"})
      }
      signal?.addEventListener("abort", cancel, {once: true})
      const preview = this.aiEditReviewHandler
        ? this.aiEditReviewHandler("preview", call, {signal})
        : Promise.reject(new Error("The document editor cannot preview AI changes"))
      void preview.then(
        result => {
          const status = (result as {status?: string})?.status
          if(status !== "previewing") throw new Error("The editor did not create a document preview")
          if(this.pendingAIEdit?.call.id === call.id) {
            const queuedDecision = this.pendingAIEdit.queuedDecision
            this.pendingAIEdit = {...this.pendingAIEdit, previewing: false, queuedDecision: undefined}
            resolve({status: "queued", proposalId: call.id, summary})
            if(queuedDecision) queueMicrotask(() => this.reviewPendingAIEdit(queuedDecision, call.id))
          }
          else void this.aiEditReviewHandler?.("reject", call).catch(() => {})
        },
      ).catch(error => {
          if(this.pendingAIEdit?.call.id === call.id) this.pendingAIEdit = null
          resolve({status: "error", message: error instanceof Error ? error.message : String(error)})
      }).finally(() => signal?.removeEventListener("abort", cancel))
      void this.updateComplete.then(() => this.scrollAIChatToEnd())
    })
    return this.pendingAIQueue
  }

  private approveAIEdit = async () => {
    const pending = this.pendingAIEdit
    if(!pending || pending.previewing || pending.deciding) return
    this.pendingAIEdit = {...pending, deciding: true}
    this.aiError = ""
    try {
      const result = this.aiEditReviewHandler
        ? await this.aiEditReviewHandler("accept", pending.call)
        : {status: "unavailable", message: "The document editor is not connected"}
      if((result as {status?: string})?.status !== "applied") throw new Error("The document change could not be accepted")
      this.appendAIEditProtocol(pending, "accepted")
      if(this.pendingAIEdit?.call.id === pending.call.id) this.pendingAIEdit = null
    }
    catch(error) {
      this.aiError = error instanceof Error ? error.message : String(error)
      if(this.pendingAIEdit?.call.id === pending.call.id) this.pendingAIEdit = {...pending, deciding: false}
    }
  }

  private rejectAIEdit = async () => {
    const pending = this.pendingAIEdit
    if(!pending || pending.previewing || pending.deciding) return
    this.pendingAIEdit = {...pending, deciding: true}
    this.aiError = ""
    try {
      const result = await this.aiEditReviewHandler?.("reject", pending.call)
      if((result as {status?: string})?.status !== "rejected") throw new Error("The document change could not be rejected")
      this.appendAIEditProtocol(pending, "rejected")
      this.pendingAIEdit = null
    }
    catch(error) {
      this.aiError = error instanceof Error ? error.message : String(error)
      if(this.pendingAIEdit?.call.id === pending.call.id) this.pendingAIEdit = {...pending, deciding: false}
    }
  }

  private gotoPendingAIEdit = () => {
    const pending = this.pendingAIEdit
    if(pending && !pending.previewing) void this.aiEditReviewHandler?.("goto", pending.call)
  }

  private gotoProtocolAIEdit = (edit: AIEditProtocol) => {
    void this.aiEditReviewHandler?.("goto", edit.call)
  }

  private undoProtocolAIEdit = async (messageId: string, edit: AIEditProtocol) => {
    if(edit.decision !== "accepted" || edit.busy || this.pendingAIEdit) return
    this.aiChats = this.aiChats.map(chat => ({
      ...chat,
      messages: chat.messages.map(message => message.id === messageId && message.edit
        ? {...message, edit: {...message.edit, busy: true}}
        : message),
    }))
    try {
      const result = await this.aiEditReviewHandler?.("undo", edit.call) as {status?: unknown} | undefined
      if(result?.status !== "undone") throw new Error("This AI change can no longer be undone")
      this.aiChats = this.aiChats.map(chat => ({
        ...chat,
        messages: chat.messages.map(message => message.id === messageId && message.edit
          ? {
              ...message,
              content: `Undone: ${message.edit.summary}`,
              edit: {...message.edit, decision: "undone", busy: false},
            }
          : message),
      }))
    }
    catch(error) {
      this.aiError = error instanceof Error ? error.message : String(error)
      this.aiChats = this.aiChats.map(chat => ({
        ...chat,
        messages: chat.messages.map(message => message.id === messageId && message.edit
          ? {...message, edit: {...message.edit, busy: false}}
          : message),
      }))
    }
  }

  reviewPendingAIEdit(action: "accept" | "reject", editId: string) {
    if(this.pendingAIEdit?.call.id !== editId) return
    if(this.pendingAIEdit.previewing) {
      this.pendingAIEdit = {...this.pendingAIEdit, queuedDecision: action}
      return
    }
    if(action === "accept") void this.approveAIEdit()
    else void this.rejectAIEdit()
  }

  private stopAIRequest = () => {
    if(this.pendingAIEdit) {
      this.aiError = "Accept or reject the pending document change before stopping the request."
      return
    }
    this.aiAbortController?.abort()
  }

  /** Called before an iframe is replaced, and when the ribbon is destroyed. */
  async cancelAIWork() {
    this.aiAbortController?.abort()
    this.aiAbortController = null
    this.aiBusy = false
    const pending = this.pendingAIEdit
    this.pendingAIEdit = null
    this.pendingAIQueue = null
    pending?.resolve({status: "error", message: "The document change was cancelled"})
    if(pending && !pending.previewing) {
      await this.aiEditReviewHandler?.("reject", pending.call).catch(() => {})
    }
  }

  private async runAIPrompt(prompt: string) {
    if(this.settings.disableAI) return
    if(this.pendingAIEdit) {
      this.aiError = "Accept or reject the pending document change before continuing the chat."
      return
    }
    const provider = this.activeAIProvider
    if(!provider) {
      this.aiError = "Set up an AI provider before sending a message."
      this.aiChatOpen = true
      this.showAISettings()
      return
    }
    if(!this.aiModel) {
      this.aiError = "Add or load a model for this provider."
      this.aiChatOpen = true
      this.showAISettings()
      return
    }
    const apiKey = this.aiProviderStore.keyFor(provider)
    if(provider.managed !== "backend" && provider.auth !== "none" && !apiKey) {
      this.aiError = this.aiProviderStore.credentialStatus(provider) === "locked"
        ? "Unlock this provider's encrypted API key in AI settings."
        : "Enter an API key for this provider in AI settings."
      this.aiChatOpen = true
      this.showAISettings()
      return
    }

    const chatId = this.activeAIChatId
    const attachments = this.aiAttachments.map(attachment => ({...attachment}))
    this.appendAIMessage("user", prompt, chatId, attachments)
    this.dispatchAIPrompt(prompt, provider, attachments, chatId)
    this.aiPrompt = ""
    this.aiAttachments = []
    this.aiError = ""
    this.aiBusy = true
    this.aiProgress = "Reading editor capabilities…"
    const controller = new AbortController()
    this.aiAbortController = controller
    try {
      const response = await completeAIConversation({
        provider,
        apiKey,
        model: this.aiModel,
        effort: this.aiEffort,
        messages: this.conversationFor(chatId),
        readOnly: requestsReadOnlyAI(prompt),
        toolHandler: (call, options) => this.handleAIDocumentTool(call, chatId, options?.signal),
        onProgress: message => {
          if(this.aiAbortController === controller) this.aiProgress = message
        },
        signal: controller.signal,
      })
      if(this.aiAbortController === controller) this.appendAIResponse(response, chatId)
    }
    catch(error) {
      if(this.aiAbortController !== controller) return
      this.aiError = error instanceof DOMException && error.name === "AbortError"
        ? "Request stopped."
        : error instanceof Error ? error.message : String(error)
    }
    finally {
      if(this.aiAbortController === controller) {
        this.aiAbortController = null
        this.aiBusy = false
      }
    }
  }

  private handleAIChatPromptKeydown(event: KeyboardEvent) {
    if(event.key !== "Enter" || event.shiftKey || event.isComposing) return
    event.preventDefault()
    const form = (event.currentTarget as HTMLTextAreaElement).form
    form?.requestSubmit()
  }

  dismissCollapsedMenu() {
    this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")?.closeSubmenus()
    this.renderRoot.querySelectorAll<RibbonButton>("ribbon-button").forEach(button => button.closeSubmenu())
    this.menuOpen = false
  }

  private selectMenu(event: Event) {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label === "File") {
      this.closeAIChat()
      const open = !this.menuOpen
      this.dismissCollapsedMenu()
      this.menuOpen = open
    }
  }

  protected willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed)
    if(changed.has("settings") && this.settings.disableAI) {
      this.closeAIChat()
      void this.cancelAIWork()
    }
    const previewActiveChanged = changed.has("previewActive") && changed.get("previewActive") !== undefined
    if(previewActiveChanged) {
      this.previewTransitioning = true
      if(this.previewActive) {
        this.closeAIChat()
        this.previewExpandedBefore = this.expanded
        this.previewMenuBefore = this.activeMenu
        this.expanded = this.liveSessionRole !== "learner"
        this.menuOpen = false
        this.activeMenu = "File"
        this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer")
          .forEach(drawer => drawer.closeDrawer())
      }
      else if(changed.get("previewActive") === true) {
        this.expanded = this.previewExpandedBefore
        this.activeMenu = this.previewMenuBefore
        this.menuOpen = false
      }
    }
    if(this.previewActive && (changed.has("liveSessionActive") || changed.has("liveSessionRole"))) {
      this.expanded = this.liveSessionRole !== "learner"
      this.menuOpen = false
    }
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    const previousTarget = changed.get("aiToolboxTarget") as HTMLElement | null | undefined
    if(previousTarget && previousTarget !== this.aiToolboxTarget) render(nothing, previousTarget)
    if(this.aiToolboxTarget) render(this.settings.disableAI ? nothing : this.renderAIChat(true), this.aiToolboxTarget, {host: this})
    if(changed.has("aiChatOpen")) this.dispatchEvent(new CustomEvent("ai-toolbox-change", {detail: {open: this.aiChatOpen}, bubbles: true, composed: true}))
    if(changed.has("backendClient")) void this.connectAIBackend(this.backendClient)
    if(changed.has("previewActive") && changed.get("previewActive") !== undefined) {
      this.schedulePreviewTransitionEnd()
    }
    if(changed.has("expanded") && this.expanded) {
      this.dispatchEvent(new Event("ribbon-expand", {bubbles: true, composed: true}))
    }
    if(changed.has("expanded") && !this.expanded) {
      this.dispatchEvent(new Event("ribbon-collapse", {bubbles: true, composed: true}))
    }
    if((changed.has("menuOpen") && !this.menuOpen) || changed.has("activeMenu")) {
      this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")?.closeSubmenus()
    }
    if(changed.has("activeMenu") && this.activeMenu === "Start") {
      this.dispatchEvent(new Event("package-catalog-request", {bubbles: true, composed: true}))
    }
    if(
      changed.has("activeMenu") || changed.has("expanded") || changed.has("packages") ||
      changed.has("installedPackages") || changed.has("packageSearchQuery") ||
      changed.has("localPackages") || changed.has("historyState")
    ) this.scheduleResponsiveLayout()
  }

  private isDeveloperPackage(pkg: WebWriterPackage) {
    return Boolean(pkg.developerSource) || this.localPackages.some(candidate => candidate.name === pkg.name)
  }

  private get availablePackages() {
    const packages = new Map<string, WebWriterPackage>()
    const installedNames = new Set(this.installedPackages.map(pkg => pkg.name))
    for(const pkg of [...this.localPackages, ...this.installedPackages, ...this.packages]) {
      if(this.isDeveloperPackage(pkg) && !installedNames.has(pkg.name)) continue
      if(!packages.has(pkg.name)) packages.set(pkg.name, pkg)
    }
    return [...packages.values()].sort((a, b) => Number(this.isDeveloperPackage(b)) - Number(this.isDeveloperPackage(a)))
  }

  private get filteredPackages() {
    const words = this.packageSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return this.availablePackages.filter(pkg => {
      const haystack = [pkg.name, pkg.label, pkg.description, ...pkg.keywords].filter(Boolean).join(" ").toLowerCase()
      return words.every(word => haystack.includes(word))
    })
  }

  private isConsoleSelectedPackage(pkg: WebWriterPackage) {
    return this.consoleOpen && this.localPackageSelectionName === pkg.name
  }

  private get packageManagementMode() {
    return Boolean(this.packageSearchQuery.trim()) || this.packageDrawerOpen
  }

  private packageDetails(pkg: WebWriterPackage): RibbonButtonDetails {
    return {
      heading: pkg.label,
      subheading: `${pkg.name}@${pkg.version}`,
      description: pkg.description,
      authors: pkg.authors,
      keywords: packageKeywordPresentations(pkg.keywords).slice(0, 8),
    }
  }

  private renderPackageButton(pkg: WebWriterPackage, slot = "") {
    const members = pkg.members.filter(member => member.insertable)
    const installed = this.installedPackages.some(candidate => candidate.name === pkg.name)
    const management = this.packageManagementMode
    return html`
      <ribbon-button
        slot=${slot}
        variant="package"
        ?developer-package=${this.isDeveloperPackage(pkg)}
        ?console-selected=${this.isConsoleSelectedPackage(pkg)}
        label=${pkg.label}
        icon="Packages"
        icon-url=${pkg.iconUrl ?? ""}
        .action=${packageAction(pkg)}
        .submenu=${management || !installed ? [] : members.slice(1).map(member => ({
          label: member.label,
          action: packageMemberAction(member),
          icon: "Packages",
          iconUrl: pkg.iconUrl,
        }))}
        .corner=${management && installed ? "close" : ""}
        .cornerLabel=${installed ? `Remove ${pkg.label}` : `Add ${pkg.label}`}
        .cornerAction=${management && installed ? packageToggleAction(pkg) : ""}
        .details=${this.packageDetails(pkg)}
        ?active=${installed}
        ?management=${management}
        ?muted=${!installed}
        .loading=${this.busyPackageNames.includes(pkg.name)}
        ?disabled=${this.busyPackageNames.includes(pkg.name) || !management && !members.length}
        ?keep-drawer-open=${management}
      ></ribbon-button>
    `
  }

  private handlePackageSearch = (event: Event) => {
    this.packageSearchQuery = (event as CustomEvent<{query?: string}>).detail?.query ?? ""
  }

  private handlePackageDrawerState = (event: Event) => {
    const detail = (event as CustomEvent<{label?: string, open?: boolean}>).detail
    if(detail?.label !== "Packages" || !detail.open) return
    this.packageDrawerOpen = true
    const drawer = event.currentTarget as RibbonDrawer
    void drawer.updateComplete.then(() => {
      if(drawer.isConnected && drawer.hasAttribute("drawer-open")) {
        drawer.querySelector("package-search")?.focus({preventScroll: true})
      }
    })
  }

  private handlePackageDrawerClose = (event: Event) => {
    const detail = (event as CustomEvent<{label?: string}>).detail
    if(detail?.label === "Packages") this.packageDrawerOpen = false
  }

  private handleRibbonDrawerState = (event: Event) => {
    const detail = (event as CustomEvent<{open?: boolean}>).detail
    if(!detail?.open) return
    const source = event.composedPath().find(target => target instanceof RibbonDrawer)
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer").forEach(drawer => {
      if(drawer !== source) drawer.closeDrawer()
    })
  }

  private handlePackageSearchFocus = () => {
    this.renderRoot.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')?.openDrawer(true)
  }

  private selectLocalPackage = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(!label?.startsWith("local-package-select:")) return
    this.selectedLocalPackageName = label.slice("local-package-select:".length)
  }

  private renderPackageDrawer() {
    const displayPackages = this.filteredPackages
    const visiblePackages = displayPackages.slice(0, this.packageVisibleCount)
    const overflowPackages = displayPackages.slice(this.packageVisibleCount)
    return html`
      <ribbon-drawer
        label="Packages"
        icon="Packages"
        layout="packages"
        ?expandable=${overflowPackages.length > 0}
        @ribbon-drawer-state-change=${this.handlePackageDrawerState}
        @ribbon-drawer-close-complete=${this.handlePackageDrawerClose}
      >
        <package-search
          .query=${this.packageSearchQuery}
          .loading=${this.packagesLoading}
          .error=${this.packageError}
          @package-search-change=${this.handlePackageSearch}
          @package-search-focus=${this.handlePackageSearchFocus}
        ></package-search>
        ${visiblePackages.map(pkg => this.renderPackageButton(pkg))}
        ${overflowPackages.map(pkg => this.renderPackageButton(pkg, "more"))}
        ${!this.packagesLoading && !displayPackages.length ? html`<span class="package-status">No packages</span>` : ""}
      </ribbon-drawer>
    `
  }

  private setTableGridSize(rows: number, columns: number) {
    this.tableGridRows = rows
    this.tableGridColumns = columns
    this.requestUpdate()
  }

  private insertTableSize(rows: number, columns: number) {
    this.dismissCollapsedMenu()
    this.dispatchEvent(new CustomEvent("table-insert", {
      detail: {rows, columns},
      bubbles: true,
      composed: true,
    }))
  }

  private renderTableSizePicker() {
    const size = 10
    return html`
      <div
        class="table-size-picker"
        role="group"
        aria-label="Table size"
        @pointerleave=${() => this.setTableGridSize(2, 2)}
      >
        <span class="table-size-label">${this.tableGridColumns} × ${this.tableGridRows} table</span>
        <div class="table-size-grid">
          ${Array.from({length: size * size}, (_, index) => {
            const row = Math.floor(index / size) + 1
            const column = index % size + 1
            return html`
              <button
                class="table-size-cell"
                type="button"
                aria-label=${`Insert ${column} by ${row} table`}
                title=${`${column} × ${row}`}
                ?data-selected=${row <= this.tableGridRows && column <= this.tableGridColumns}
                @pointerenter=${() => this.setTableGridSize(row, column)}
                @focus=${() => this.setTableGridSize(row, column)}
                @click=${() => this.insertTableSize(row, column)}
              ></button>
            `
          })}
        </div>
      </div>
    `
  }

  private renderInsertionDrawer(drawer: RibbonMenuGroup) {
    const buttonLabel = (button: RibbonMenuButton) => typeof button === "string" ? button : button.label
    const buttonByLabel = (label: string) => {
      const button = drawer.buttons.find(candidate => buttonLabel(candidate) === label)
      if(!button) throw new TypeError(`Missing insertion button ${label}`)
      return button
    }
    const groupedButton = (label: string, icon: string, labels: string[]) => {
      const submenu = labels.map(buttonByLabel)
      const representative = submenu[0]
      return {
        label,
        icon,
        action: typeof representative === "string" ? representative : representative.action ?? representative.label,
        submenu,
      }
    }
    const sourceButtons = (type: MediaType) => [
      {label: "Select file", action: `media-file:${type}`, icon: "Select file"},
      ...mediaCaptureOptions(type).map(option => ({
        label: option.label,
        action: `media-capture:${option.mode}`,
        icon: option.label,
      })),
    ]
    const compactButtons: RibbonMenuButton[] = [
      groupedButton("Text", "Text", ["Paragraph", "Heading", "List", "Details"]),
      {
        ...groupedButton("Media", "Image", ["Image", "Audio", "Video", "Graphic", "Formula", "Website"]),
        submenu: ["Image", "Audio", "Video", "Graphic", "Formula", "Website"].map(label => {
          const button = buttonByLabel(label)
          const type = insertionMenuItems.find(candidate => candidate.name === label)?.tag
          return type === "picture" || type === "audio" || type === "video"
            ? {...(typeof button === "string" ? {label: button} : button), submenu: sourceButtons(type)}
            : button
        }),
      },
      buttonByLabel("Table"),
    ]
    const renderButton = (button: RibbonMenuButton, slot = "") => {
      const item = typeof button === "string" ? {label: button} : button
      const insertion = insertionMenuItems.find(candidate => candidate.name === item.label)
      const type = insertion?.tag === "picture" || insertion?.tag === "audio" || insertion?.tag === "video" || insertion?.tag === "iframe"
        ? insertion.tag as MediaType
        : null
      const submenu = item.label === "List"
        ? listInsertionOptions
        : item.label === "Enumeration"
          ? orderedListStyles
          : item.submenu ?? []
      const sourceSubmenu = type === "picture" || type === "audio" || type === "video"
        ? sourceButtons(type)
        : []
      const active = type
        ? this.mediaSelectionMatches(type)
        : item.label === "List" && this.listType !== null
      const tableDropdown = item.label === "Table" ? this.renderTableSizePicker() : null
      if(item.label === "Section") return renderLayoutOpener(slot)
      return html`
        <ribbon-button
          slot=${slot}
          variant="insertion"
          label=${item.label}
          .action=${item.action ?? item.label}
          shortcut=${this.commandShortcut(item.action ?? item.label)}
          .icon=${item.icon ?? item.label}
          .submenu=${type ? sourceSubmenu : tableDropdown ? [] : submenu}
          .dropdown=${tableDropdown}
          ?toggle=${item.label === "List"}
          ?active=${active}
        ></ribbon-button>
      `
    }
    const renderLayoutOpener = (slot = "") => html`
      <ribbon-button
        slot=${slot}
        class="layout-opener"
        ?active=${Boolean(this.layout)}
        variant="insertion"
        label="Layouts"
        icon="Layout"
        action="Layouts"
        open-drawer
        keep-drawer-open
      ></ribbon-button>
    `
    const layoutStyle = (styles: Record<string, string>) => Object.entries(styles)
      .map(([property, value]) => `${property}:${value}`)
      .join(";")
    const renderLayoutPreset = (preset: typeof layoutPresets[number]) => {
      const previewStyles = {
        ...preset.styles,
        ...(preset.kind === "columns" ? {display: "grid", "grid-template-columns": `repeat(${preset.items}, 1fr)`} : {}),
        gap: "0.4rem",
        padding: "0.3rem",
        "box-sizing": "border-box",
      }
      const previewItemStyles = preset.id === "wrapping-cards"
        ? {...preset.itemStyles, flex: "1 1 3rem"}
        : preset.itemStyles
      return html`
        <button
          class="layout-preset"
          type="button"
          data-layout-id=${preset.id}
          ?disabled=${Boolean(this.layout)}
          aria-label=${`Insert ${preset.name} layout`}
          @click=${(event: Event) => (event.currentTarget as HTMLElement).dispatchEvent(
            new CustomEvent<{label: string, keepDrawerOpen: boolean}>("ribbon-button-click", {
              detail: {label: `layout-insert:${preset.id}`, keepDrawerOpen: true},
              bubbles: true,
              composed: true,
            }),
          )}
        >
          <span
            class="layout-preset-preview"
            style=${layoutStyle(previewStyles)}
            aria-hidden="true"
          >
            ${Array.from({length: preset.items}, (_, index) => html`
              <span class="layout-preset-item" style=${layoutStyle(previewItemStyles)}>
                <span class="layout-preset-line"></span>
                ${index % 2 === 0 ? html`<span class="layout-preset-line short"></span>` : ""}
              </span>
            `)}
          </span>
          <span class="layout-preset-name">${preset.name}</span>
        </button>
      `
    }
    return html`
      <ribbon-drawer
        label=${drawer.label}
        icon="Paragraph"
        layout="elements"
        expandable
      >
        ${drawer.buttons.map(button => renderButton(button))}
        ${compactButtons.map(button => renderButton(button, "compact"))}
        ${renderLayoutOpener("compact")}
        <div class="layout-gallery" slot="more" aria-label="Layout presets">
          ${this.layoutInsertionError ? html`
            <div class="layout-insertion-error" role="alert">${this.layoutInsertionError}</div>
          ` : ""}
          ${layoutPresets.map(renderLayoutPreset)}
          <div class="custom-layout" role="group" aria-label="Custom layout">
            <ribbon-button label="Custom layout" icon="Section" action="toggle-section"
              ?disabled=${!this.canSection} ?active=${this.sectionActive} toggle></ribbon-button>
            ${this.renderSectionTypeSelect("Section type")}
          </div>
        </div>
      </ribbon-drawer>
    `
  }

  private handleFileNameInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    this.dispatchEvent(new CustomEvent<{value: string}>("file-name-change", {
      detail: {value: input.value},
      bubbles: true,
      composed: true,
    }))
  }

  private handleStorageLocationChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value
    if(storageLocations.some(location => location.value === value)) {
      this.storageLocation = value as StorageLocation
      this.dispatchEvent(new CustomEvent<{value: StorageLocation}>("storage-location-change", {
        detail: {value: this.storageLocation},
        bubbles: true,
        composed: true,
      }))
    }
  }

  private renderFileDrawer(drawer: RibbonMenuGroup) {
    const availableStorageLocations = this.backendState === "connected" ? storageLocations : storageLocations.slice(0, 1)
    const selectedStorageLocation = availableStorageLocations.find(location => location.value === this.storageLocation) ?? availableStorageLocations[0]
    return html`
      <ribbon-drawer label="File" icon="Save" layout="file">
        <div class="file-name-row">
          <span class="file-name-field">
            <input
              class="file-name"
              aria-label="File name"
              placeholder="Unnamed File"
              .value=${this.fileName}
              @input=${this.handleFileNameInput}
            />
          </span>
          <label class="storage-location">
            <span class="storage-location-icon" aria-hidden="true">${ribbonIcon(selectedStorageLocation.icon)}</span>
            <select
              class="storage-location-select"
              aria-label="Storage location"
              data-ribbon-input-persistent
              .value=${this.storageLocation}
              @change=${this.handleStorageLocationChange}
            >
              ${availableStorageLocations.map(location => html`
                <option value=${location.value}>${location.label}</option>
              `)}
            </select>
          </label>
        </div>
        ${drawer.buttons.map(button => {
          const item = typeof button === "string" ? {label: button} : button
          return html`
            <ribbon-button
              class="file-action"
              label=${item.label}
              .action=${item.action ?? item.label}
              .submenu=${item.submenu ?? []}
              shortcut=${this.commandShortcut(item.action ?? item.label)}
            ></ribbon-button>
          `
        })}
      </ribbon-drawer>
    `
  }

  private handleSettingsChange(event: CustomEvent<AppSettings>) {
    event.stopPropagation()
    this.settings = {
      ...event.detail,
      shortcuts: {...event.detail.shortcuts},
    }
    persistAppSettings(this.settings)
    this.dispatchEvent(new CustomEvent<AppSettings>("app-settings-change", {
      detail: this.settings,
      bubbles: true,
      composed: true,
    }))
  }

  private async showRibbonDialog(name: "settings") {
    this.dismissCollapsedMenu()
    this.closeAIChat()
    this.documentDialog = name
    await this.updateComplete
    if(this.isConnected && this.documentDialog === name) {
      this.renderRoot.querySelector<HTMLDialogElement>(`#${name}-dialog`)?.showModal()
    }
  }

  private collapsedEditingMenuGroups(): RibbonMenuGroup[] {
    const mark = (name: Parameters<typeof this.markOption>[0]): RibbonMenuButton => {
      const option = this.markOption(name)
      return {label: option.label, icon: option.icon, action: `mark:${name}`, disabled: !this.canMark}
    }
    const picker = (name: string, label: string, options: typeof fontFamilyOptions) => html`
      <ribbon-combobox name=${name} label=${label} default-value-label=${label}
        variant=${name.includes("color") ? "color" : ""}
        .options=${options} .value=${this.markStyles[name as keyof typeof this.markStyles] ?? ""}
        ?disabled=${!this.canMark}></ribbon-combobox>
    `
    const format: RibbonMenuGroup[] = [
      {label: "Font", content: html`
        ${picker("font-family", "Font", fontFamilyOptions)}
        ${picker("font-size", "Size", fontSizeOptions)}
      `, buttons: [
        {label: "Increase font size", action: "increaseFontSize", icon: "IncreaseFontSize", disabled: !this.canMark},
        {label: "Decrease font size", action: "decreaseFontSize", icon: "DecreaseFontSize", disabled: !this.canMark},
        {label: "Remove formatting", action: "removeMarks", icon: "RemoveMarks", disabled: !this.canMark},
      ]},
      {label: "Standard marks", content: html`
        ${picker("color", "Text color", textColorOptions)}
        ${picker("background-color", "Text background color", backgroundColorOptions)}
      `, buttons: [...primaryDrawerMarkNames.map(mark), {label: "Link", action: "mark:a", icon: "MarkLink", disabled: !this.canMark || this.math?.active, submenuGroups: [{label: "Link", content: this.renderLinkDropdown(), buttons: []}]}]},
      {label: "More marks", buttons: this.spanGroupMembers().map(mark)},
    ]
    const insert = menuGroups.Start.find(group => group.label === "Elements")!.buttons.map((button): RibbonMenuButton => {
      const item = typeof button === "string" ? {label: button} : button
      if(item.label === "Section") return {
        label: "Layouts", icon: "Layout", menuOnly: true,
        submenu: [...layoutPresets.map(preset => ({label: preset.name, action: `layout-insert:${preset.id}`, disabled: Boolean(this.layout)})),
          {label: "Custom layout", action: "toggle-section", disabled: !this.canSection}],
      }
      if(item.label === "Table") return {...item, submenuGroups: [{label: "Table size", content: this.renderTableSizePicker(), buttons: []}]}
      const type = insertionMenuItems.find(candidate => candidate.name === item.label)?.tag
      if(type === "picture" || type === "audio" || type === "video") return {...item, submenu: [
        {label: "Select file", action: `media-file:${type}`, icon: "Select file"},
        ...mediaCaptureOptions(type).map(option => ({label: option.label, action: `media-capture:${option.mode}`, icon: option.label})),
      ]}
      return item
    })
    const packages = this.filteredPackages.map((pkg): RibbonMenuButton => {
      const installed = this.installedPackages.some(candidate => candidate.name === pkg.name)
      return {
        label: pkg.label, italic: this.isDeveloperPackage(pkg), selected: this.isConsoleSelectedPackage(pkg), icon: "Packages", iconUrl: pkg.iconUrl,
        action: packageAction(pkg),
        disabled: this.busyPackageNames.includes(pkg.name),
        removeAction: installed ? packageToggleAction(pkg) : undefined,
        submenu: pkg.members.filter(member => member.insertable).slice(1).map(member => ({
          label: member.label, action: packageMemberAction(member), icon: "Packages", iconUrl: pkg.iconUrl,
        })),
      }
    })
    return [{label: "Editing", buttons: [
      {label: "Format", icon: "MarkBold", menuOnly: true, submenuGroups: format},
      {label: "Insert", icon: "Paragraph", menuOnly: true, submenu: insert},
      {label: "Packages", icon: "Packages", menuOnly: true, submenuGroups: [{label: "Packages", buttons: packages,
        content: !this.packagesLoading && !packages.length ? html`<span>No packages</span>` : undefined}],
        submenuHeader: html`<package-search .query=${this.packageSearchQuery} .loading=${this.packagesLoading}
          .error=${this.packageError} @package-search-change=${this.handlePackageSearch}></package-search>`},
    ]}]
  }

  private handleFileMenuAction = (event: CustomEvent<{label: string}>) => {
    this.menuOpen = false
    if(event.detail.label === "toggle-breadcrumb") {
      event.stopPropagation()
      this.breadcrumbVisible = !this.breadcrumbVisible
      this.dispatchEvent(new CustomEvent("breadcrumb-visibility-change", {
        detail: {visible: this.breadcrumbVisible}, bubbles: true, composed: true,
      }))
    }
    if(event.detail.label === "Settings") {
      event.stopPropagation()
      void this.showRibbonDialog("settings")
    }
  }

  private renderDocumentDialogs() {
    return html`
      <dialog id="settings-dialog" class="document-dialog" aria-labelledby="settings-dialog-title"
        @close=${() => { this.documentDialog = null }}>
        ${this.documentDialog === "settings" ? html`
        <nav class="settings-dialog-nav" aria-label="Settings">
          <h2 id="settings-dialog-title">Settings</h2>
          <form method="dialog">
            <span class="settings-version">WebWriter ${version}</span>
            <button
              class="reset-settings-button"
              type="button"
              @click=${() => this.renderRoot.querySelector<SettingsPanel>("settings-panel")?.resetSettings()}
            >Reset settings</button>
            <button class="settings-close-button" aria-label="Close settings" title="Close settings">
              ${ribbonIcon("Reject")}
            </button>
          </form>
        </nav>
        <main class="settings-dialog-main">
          <settings-panel
            .settings=${this.settings}
            @settings-change=${this.handleSettingsChange}
          ></settings-panel>
        </main>
        ` : ""}
      </dialog>
    `
  }

  private sharingButton() {
    return this.renderRoot.querySelector<RibbonButton>(
      'ribbon-button.sharing-qr',
    ) ?? this.renderRoot.querySelector<RibbonButton>("ribbon-button.file-share-action")
  }

  private sharingQRCodeElement() {
    return this.sharingButton()?.shadowRoot?.querySelector<QRCodeElement>("webwriter-qr-code")
  }

  private async sharingQRCodeBlob() {
    const qrCode = this.sharingQRCodeElement()
    if(!qrCode) return null
    await qrCode.updateComplete
    return qrCode.toBlob()
  }

  private async ensureSharingQRCodeImage(link: string) {
    if(this.sharingQRCodeImageLoading) return
    if(this.sharingQRCodeImageLink === link && this.sharingQRCodeImageDataURL) return
    if(this.sharingQRCodeImageLink !== link) {
      this.sharingQRCodeImageDataURL = ""
      this.sharingQRCodeImageLink = ""
    }
    this.sharingQRCodeImageLoading = true
    try {
      const qrCode = this.sharingQRCodeElement()
      if(!qrCode) {
        this.scheduleSharingQRCodeImageRetry(link)
        return
      }
      await qrCode.updateComplete
      const dataURL = qrCode.toDataURL()
      if(dataURL && dataURL.startsWith("data:image/png")) {
        this.sharingQRCodeImageDataURL = dataURL
        this.sharingQRCodeImageLink = link
        this.requestUpdate()
        return
      }

      const blob = await qrCode.toBlob()
      if(!blob) {
        this.scheduleSharingQRCodeImageRetry(link)
        return
      }

      const fallbackDataURL = await new Promise<string | null>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
      if(!fallbackDataURL?.startsWith("data:image/png")) {
        this.scheduleSharingQRCodeImageRetry(link)
        return
      }

      this.sharingQRCodeImageDataURL = fallbackDataURL
      this.sharingQRCodeImageLink = link
      this.requestUpdate()
    }
    finally {
      this.sharingQRCodeImageLoading = false
    }
  }

  private scheduleSharingQRCodeImageRetry(link: string) {
    if(this.sharingQRCodeImageRetryScheduled || !this.renderRoot.isConnected) return
    this.sharingQRCodeImageRetryScheduled = true
    requestAnimationFrame(() => {
      this.sharingQRCodeImageRetryScheduled = false
      void this.ensureSharingQRCodeImage(link)
    })
  }

  private async handleSharingQRCodeImageError() {
    if(!this.sharingQRCodeImageLink || !this.renderRoot.isConnected) return
    this.sharingQRCodeImageDataURL = ""
    this.scheduleSharingQRCodeImageRetry(this.sharingQRCodeImageLink)
    this.requestUpdate()
  }

  private renderSharingDropdown(link: string) {
    return html`
      <div class="sharing-dropdown" role="group" aria-label="Sharing options">
        <div class="sharing-document-actions" role="group" aria-label="Document actions">
          <ribbon-button label="Print" action="Print" variant="toolbar"></ribbon-button>
          <ribbon-button label="Download" action="Download" variant="toolbar"></ribbon-button>
        </div>
        <webwriter-qr-code hidden .value=${link} .size=${56}></webwriter-qr-code>
        <label class="sharing-link-field">
          <span class="sharing-link-label">Link</span>
          <span class="sharing-link-input-row">
            <input
              class="sharing-link-input"
              aria-label="Sharing link"
              readonly
              .value=${link}
              @click=${(event: Event) => (event.currentTarget as HTMLInputElement).select()}
            />
            <button
              class=${`sharing-link-copy${this.sharingCopyLinkActive ? " is-active" : ""}${this.sharingCopyLinkSuccess ? " is-success" : ""}`}
              type="button"
              aria-label="Copy link"
              aria-pressed=${this.sharingCopyLinkActive}
              title=${this.sharingCopyLinkSuccess ? "Copied link" : "Copy link"}
              @click=${() => void this.copySharingLinkAndShowFeedback(link)}
            >${ribbonIcon("Copy")}</button>
          </span>
        </label>
        <div class="sharing-qr-group" role="group" aria-label="QR code">
          <div class="sharing-dropdown-qr" aria-label="Sharing QR code" role="img">
            <img
              class="sharing-dropdown-qr-code"
              alt="Sharing QR code"
              draggable="true"
              src=${this.sharingQRCodeImageDataURL || undefined}
              @error=${() => void this.handleSharingQRCodeImageError()}
            />
          </div>
          <div class="sharing-dropdown-actions">
            <button
              class=${`button-dropdown-more sharing-dropdown-action${this.sharingCopyQRActive ? " is-active" : ""}${this.sharingCopyQRSuccess ? " is-success" : ""}`}
              type="button"
              aria-pressed=${this.sharingCopyQRActive}
              @click=${() => void this.copySharingQRCodeAndShowFeedback()}
              aria-label="Copy QR code"
              title=${this.sharingCopyQRSuccess ? "Copied QR code" : "Copy QR code"}
            >${ribbonIcon("Copy")}<span>Copy QR code</span></button>
            <button
              class=${`button-dropdown-more sharing-dropdown-action${this.sharingDownloadQRActive ? " is-active" : ""}`}
              type="button"
              aria-pressed=${this.sharingDownloadQRActive}
              @click=${() => void this.downloadSharingQRCodeAndShowFeedback()}
              aria-label="Download QR code"
              title="Download QR code"
            >${ribbonIcon("FileDownload")}<span>Download QR code</span></button>
          </div>
        </div>
      </div>
    `
  }

  private async copySharingContent(link: string): Promise<boolean> {
    try {
      if(!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        return await this.copySharingLink(link)
      }

      const qrCode = this.sharingQRCodeElement()
      if(!qrCode) {
        return await this.copySharingLink(link)
      }
      await qrCode.updateComplete
      const qrDataURL = qrCode.toDataURL()
      if(!qrDataURL) {
        return await this.copySharingLink(link)
      }

      const content = document.createElement("div")
      const linkElement = document.createElement("a")
      linkElement.href = link
      linkElement.textContent = link
      const qrImage = document.createElement("img")
      qrImage.src = qrDataURL
      qrImage.alt = `QR code for ${link}`
      content.append(linkElement, document.createElement("br"), qrImage)

      await navigator.clipboard.write([new ClipboardItem({
        "text/html": content.innerHTML,
        "text/plain": link,
      })])
      return true
    }
    catch {
      // Clipboard access can be denied by the browser or document context.
      return false
    }
  }

  private async copySharingLink(link: string): Promise<boolean> {
    try {
      if(navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
        return true
      }

      const input = document.createElement("textarea")
      input.value = link
      input.setAttribute("readonly", "")
      input.style.position = "fixed"
      input.style.opacity = "0"
      document.body.append(input)
      input.select()
      document.execCommand("copy")
      input.remove()
      return true
    }
    catch {
      // Clipboard access can be denied by the browser or document context.
      return false
    }
  }

  private async copySharingLinkAndShowFeedback(link: string) {
    this.sharingCopyLinkActive = true
    this.sharingCopyLinkSuccess = false
    if(this.sharingCopyLinkActiveTimer !== undefined) clearTimeout(this.sharingCopyLinkActiveTimer)
    if(this.sharingCopyLinkSuccessTimer !== undefined) clearTimeout(this.sharingCopyLinkSuccessTimer)
    this.requestUpdate()
    const copied = await this.copySharingLink(link)
    this.sharingCopyLinkActive = false
    this.sharingCopyLinkSuccess = copied
    this.requestUpdate()
    this.sharingCopyLinkActiveTimer = setTimeout(() => {
      this.sharingCopyLinkActive = false
      this.requestUpdate()
    }, 140)
    if(copied) {
      this.sharingCopyLinkSuccessTimer = setTimeout(() => {
        this.sharingCopyLinkSuccess = false
        this.requestUpdate()
      }, 900)
    }
  }

  private async copySharingQRCode(): Promise<boolean> {
    try {
      const blob = await this.sharingQRCodeBlob()
      if(!blob || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false
      await navigator.clipboard.write([new ClipboardItem({[blob.type || "image/png"]: blob})])
      return true
    }
    catch {
      // Clipboard access can be denied by the browser or document context.
      return false
    }
  }

  private async copySharingQRCodeAndShowFeedback() {
    this.sharingCopyQRActive = true
    this.sharingCopyQRSuccess = false
    if(this.sharingCopyQRActiveTimer !== undefined) clearTimeout(this.sharingCopyQRActiveTimer)
    if(this.sharingCopyQRSuccessTimer !== undefined) clearTimeout(this.sharingCopyQRSuccessTimer)
    this.requestUpdate()
    const copied = await this.copySharingQRCode()
    this.sharingCopyQRActive = false
    this.sharingCopyQRSuccess = copied
    this.requestUpdate()
    this.sharingCopyQRActiveTimer = setTimeout(() => {
      this.sharingCopyQRActive = false
      this.requestUpdate()
    }, 140)
    if(copied) {
      this.sharingCopyQRSuccessTimer = setTimeout(() => {
        this.sharingCopyQRSuccess = false
        this.requestUpdate()
      }, 900)
    }
  }

  private async downloadSharingQRCode(): Promise<boolean> {
    try {
      const blob = await this.sharingQRCodeBlob()
      if(!blob) return false
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `webwriter-qr-code.${blob.type === "image/svg+xml" ? "svg" : "png"}`
      link.click()
      URL.revokeObjectURL(url)
      return true
    }
    catch {
      // QR export can fail when the browser cannot rasterize the QR code.
      return false
    }
  }

  private async downloadSharingQRCodeAndShowFeedback() {
    this.sharingDownloadQRActive = true
    if(this.sharingDownloadQRActiveTimer !== undefined) clearTimeout(this.sharingDownloadQRActiveTimer)
    this.requestUpdate()
    await this.downloadSharingQRCode()
    this.sharingDownloadQRActive = false
    this.requestUpdate()
    this.sharingDownloadQRActiveTimer = setTimeout(() => {
      this.sharingDownloadQRActive = false
      this.requestUpdate()
    }, 140)
  }

  private get sharingLink() {
    return this.liveSessionActive && this.liveSessionLink
      ? this.liveSessionLink
      : placeholderSharingLink
  }

  private handleSharingButtonClick = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label !== "Share") return
    event.stopPropagation()
    void this.copySharingContent(this.sharingLink).then(copied => {
      if(copied) this.sharingButton()?.showNotification("Copied QR code and link")
    })
  }

  private renderSharingDrawer(drawer: RibbonMenuGroup, excludeShare = false) {
    return html`
      <ribbon-drawer label="Sharing" icon="Share" layout=${excludeShare ? "sharing-preview" : "sharing"}>
        ${drawer.buttons.map(button => {
          const item = typeof button === "string" ? {label: button} : button
          if(excludeShare && item.label === "Share") return ""
          if(item.label === "Share") return this.renderSharingButton()
          return html`
            <ribbon-button
              class="sharing-action"
              label=${item.label}
              .action=${item.action ?? item.label}
              .icon=${item.icon ?? item.label}
              .submenu=${item.submenu ?? []}
            ></ribbon-button>
          `
        })}
      </ribbon-drawer>
    `
  }

  private renderSharingButton(previewOnly = false) {
    const link = this.sharingLink
    const enabled = !previewOnly || Boolean(this.liveSessionActive && this.liveSessionLink)
    return html`
      <ribbon-button
        class="sharing-qr"
        label="Share"
        action="Share"
        variant="qr"
        .qrValue=${link}
        .dropdown=${this.renderSharingDropdown(link)}
        keep-drawer-open
        dropdown-no-scroll
        ?disabled=${!enabled}
        @ribbon-button-click=${this.handleSharingButtonClick}
        @ribbon-dropdown-open=${() => void this.ensureSharingQRCodeImage(link)}
      ></ribbon-button>
    `
  }

  private handleLiveSessionToggle = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    this.dispatchEvent(new CustomEvent<{enabled: boolean}>("live-session-toggle", {
      detail: {enabled: input.checked},
      bubbles: true,
      composed: true,
    }))
  }

  private renderLearnersDrawer() {
    const enabledCount = this.liveLearners.filter(learner => learner.enabled).length
    const visibleAvatars = this.liveLearners.filter(learner => learner.enabled).slice(0, 4)
    return html`
      <ribbon-drawer label="Learners" icon="Plus" layout="learners" expandable>
        ${this.liveSessionActive ? html`
          <div class="learners-summary" aria-label=${`${enabledCount} of ${this.liveLearners.length} learners visualized`}>
            <span class="learners-summary-avatars" aria-hidden="true">
              ${visibleAvatars.map(learner => html`
                <span class="learner-avatar" style=${`--learner-color:${learner.color}`}>${learner.initials}</span>
              `)}
            </span>
            <span>${this.liveLearners.length
              ? `${enabledCount}/${this.liveLearners.length} shown`
              : "Waiting for learners"}</span>
          </div>
        ` : ""}
        <label class="live-session-switch">
          <input
            type="checkbox"
            role="switch"
            aria-label="LIVE"
            .checked=${this.liveSessionActive}
            @change=${this.handleLiveSessionToggle}
          />
          <span>LIVE</span>
        </label>
        ${this.renderSharingButton(true)}
        <div slot="more" class="learner-list" role="group" aria-label="Session learners">
          ${this.liveLearners.map(learner => html`
            <button
              class="learner-toggle"
              type="button"
              data-learner-id=${learner.id}
              aria-pressed=${learner.enabled}
              aria-label=${`${learner.name}, ${learner.connected ? "connected" : "disconnected"}`}
              title=${learner.connected ? `${learner.name} is connected` : `${learner.name} was connected`}
              @click=${() => this.dispatchEvent(new CustomEvent("live-learner-toggle", {
                detail: {id: learner.id, enabled: !learner.enabled},
                bubbles: true,
                composed: true,
              }))}
            >
              <span class="learner-avatar" style=${`--learner-color:${learner.color}`} aria-hidden="true">${learner.initials}</span>
              <span class="learner-toggle-name">${learner.name}</span>
              <span class="learner-connection" ?data-connected=${learner.connected} aria-hidden="true"></span>
            </button>
          `)}
        </div>
      </ribbon-drawer>
    `
  }

  protected renderDrawers() {
    if(this.previewActive && this.liveSessionRole !== "learner") {
      const sharing = menuGroups.File.find(group => group.label === "Sharing")!
      return [this.renderSharingDrawer(sharing, true), this.renderLearnersDrawer()]
    }
    return super.renderDrawers()
  }

  protected renderDrawer(drawer: RibbonMenuGroup) {
    if(drawer.label === "File") return this.renderFileDrawer(drawer)
    if(drawer.label === "Sharing") return this.renderSharingDrawer(drawer)
    if(drawer.label === "Packages") return this.renderPackageDrawer()
    if(drawer.label === "Elements") return this.renderInsertionDrawer(drawer)
    return super.renderDrawer(drawer)
  }

  protected usesNativePointerInteraction(event: MouseEvent) {
    const aiAction = event.composedPath().find(target => target instanceof HTMLElement && (
      target.matches(
        ".ai-prompt-submit, .ai-prompt-expand, .ai-chat-brand-button, " +
        ".ai-chat-header-button, .ai-chat-send, .ai-composer-attachment, " +
        ".ai-attachment-remove, .ai-edit-action",
      )
    ))
    if(aiAction) return true

    // Native dragging needs the initiating pointer and mouse events.
    if(event.composedPath().some(target => target instanceof HTMLElement
      && target.matches('[draggable="true"]'))) return true

    return false
  }

  protected get currentMenuGroups() {
    if(this.activeMenu !== "Start") {
      return contextDrawerPolicy({
        menu: this.activeMenu,
        surface: "ribbon",
        paragraphSelected: this.paragraphSelected,
        sectionSelected: this.sectionSelected,
        layout: this.layout?.kind,
        layoutItem: this.layout?.item,
        headingGroup: Boolean(this.headingGroup),
        orderedList: this.listType === "ol",
        media: Boolean(this.media),
        dialog: Boolean(this.dialog),
        graphic: Boolean(this.graphic?.active),
        disclosure: this.elementAttributes?.localName === "details",
        figure: Boolean(this.figure),
        widget: Boolean(this.widgetOptions),
        attributes: Boolean(this.elementAttributes),
      })
    }
    const packageButtons: RibbonMenuButton[] = this.availablePackages.map(pkg => {
      const members = pkg.members.filter(member => member.insertable)
      return {
        label: pkg.label,
        italic: this.isDeveloperPackage(pkg),
        selected: this.isConsoleSelectedPackage(pkg),
        action: packageAction(pkg),
        submenu: members.slice(1).map(member => ({label: member.label, action: packageMemberAction(member)})),
      }
    })
    return contextDrawerPolicy({
      menu: this.activeMenu,
      surface: "ribbon",
      attributes: Boolean(this.elementAttributes),
      startPackages: {label: "Packages", buttons: packageButtons},
    })
  }

  private renderPresence() {
    if(!this.presenceUsers.length) return ""
    const visibleUsers = this.presenceUsers.slice(0, 3)
    return html`
      <div
        class="presence-users"
        role="group"
        aria-label="Active collaborators"
        data-user-count=${this.presenceUsers.length}
      >
        ${visibleUsers.map(user => html`
          <span
            class="presence-user"
            style=${`--presence-color: ${user.color}`}
            title=${user.name}
            aria-label=${user.name}
          >${user.initials}</span>
        `)}
        ${this.presenceUsers.length >= 4 ? html`
          <span
            class="presence-more"
            title=${`+ ${this.presenceUsers.length} peers connected`}
            aria-label=${`+ ${this.presenceUsers.length} peers connected`}
          >
            <span class="presence-more-content">
              <span class="presence-more-icon" aria-hidden="true">${ribbonIcon("Plus")}</span>
              <span class="presence-more-count">${this.presenceUsers.length}</span>
            </span>
          </span>
        ` : ""}
      </div>
    `
  }

  private renderAIChat(expanded: boolean) {
    const activeProvider = this.activeAIProvider
    const selectedModelValue = activeProvider && this.aiModel
      ? JSON.stringify([activeProvider.id, this.aiModel])
      : ""
    const modelCount = this.aiProviders.reduce((count, provider) => count + provider.models.length, 0)
    const historyPreviewPending = this.historyState.preview !== null
    return html`
        <section
          id=${expanded ? "ai-toolbox-chat" : "ai-chat-panel"}
          class="ai-chat-panel"
          role=${expanded ? "region" : "presentation"}
          aria-label="AI chat"
          ?data-open=${expanded}
          ?hidden=${this.previewActive}
          ?inert=${historyPreviewPending}
        >
          <button
            class="ai-chat-brand-button"
            type="button"
            aria-label=${this.aiChatOpen ? "Collapse AI chat" : "Expand AI chat"}
            title=${this.aiChatOpen ? "Collapse chat" : "Expand chat"}
            aria-expanded=${this.aiChatOpen}
            aria-controls="ai-toolbox-chat"
            @click=${this.toggleAIChat}
          ><span class="ai-chat-brand-icon" aria-hidden="true">${ribbonIcon("AI")}</span></button>
          <header class="ai-chat-header" ?hidden=${!expanded} ?inert=${!expanded || Boolean(this.pendingAIEdit)}>
            <select
              class="ai-chat-switcher"
              aria-label="Current AI chat"
              data-ribbon-input-persistent
              .value=${this.activeAIChatId}
              ?disabled=${this.aiBusy}
              @change=${this.switchAIChat}
            >${this.aiChats.map(chat => html`
              <option value=${chat.id}>${chat.title}</option>
            `)}</select>
            <button
              class="ai-chat-header-button"
              type="button"
              aria-label="New chat"
              title="New chat"
              ?disabled=${this.aiBusy}
              @click=${this.startNewAIChat}
            >
              <span class="ai-chat-new-icon" aria-hidden="true">${ribbonIcon("Plus")}</span>
              <span class="ai-chat-header-button-label">New chat</span>
            </button>
            <button
              class="ai-chat-header-button ai-chat-settings-button"
              type="button"
              aria-label="AI settings"
              title="AI settings"
              ?disabled=${Boolean(this.pendingAIEdit)}
              @click=${this.showAISettings}
            ><span class="ai-chat-settings-icon" aria-hidden="true">${ribbonIcon("AISettings")}</span></button>
          </header>
          <div
            class="ai-chat-messages"
            ?hidden=${!expanded}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            ?inert=${!expanded}
          >
            ${this.activeAIChat?.messages.length ? this.activeAIChat.messages.map(message => html`
              <article class="ai-chat-message" data-role=${message.role}>
                <span class="ai-chat-message-role">${message.role === "user" ? "You" : message.role === "assistant" ? "AI" : "Document change"}</span>
                ${message.content}
                ${message.attachments?.length ? html`
                  <div class="ai-message-attachments" aria-label="Attachments">
                    ${message.attachments.map(attachment => html`
                      <span class="ai-message-attachment" title=${attachment.name}>${attachment.name}</span>
                    `)}
                  </div>
                ` : ""}
                ${message.edit ? html`
                  <div class="ai-edit-actions" aria-label="Document change actions">
                    ${message.edit.decision === "accepted" ? html`
                      <button
                        class="ai-edit-action"
                        type="button"
                        ?disabled=${message.edit.busy || Boolean(this.pendingAIEdit)}
                        @click=${() => this.gotoProtocolAIEdit(message.edit!)}
                      >${ribbonIcon("Goto")}<span>Go to</span></button>
                      <button
                        class="ai-edit-action"
                        data-kind="undo"
                        type="button"
                        ?disabled=${message.edit.busy || Boolean(this.pendingAIEdit)}
                        @click=${() => this.undoProtocolAIEdit(message.id, message.edit!)}
                      >${ribbonIcon("Undo")}<span>${message.edit.busy ? "Undoing…" : "Undo change"}</span></button>
                    ` : ""}
                  </div>
                ` : ""}
              </article>
            `) : html`<div class="ai-chat-empty">${this.aiProviders.length
              ? "Start a conversation with your AI model."
              : "Open AI settings to connect a provider."}</div>`}
            ${this.pendingAIEdit?.chatId === this.activeAIChatId ? html`
              <section class="ai-edit-approval" aria-label="Proposed document edit">
                <strong>${this.pendingAIEdit.previewing ? "Preparing document preview…" : "Review document change"}</strong>
                <span>${this.pendingAIEdit.summary}</span>
                <div class="ai-edit-actions">
                  <button class="ai-edit-action" type="button" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.rejectAIEdit}>${ribbonIcon("Reject")}<span>Reject</span></button>
                  <button class="ai-edit-action" type="button" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.gotoPendingAIEdit}>${ribbonIcon("Goto")}<span>Go to</span></button>
                  <button class="ai-edit-action" data-kind="approve" type="button" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.approveAIEdit}>
                    ${ribbonIcon("Accept")}<span>${this.pendingAIEdit.deciding ? "Saving…" : "Accept"}</span>
                  </button>
                </div>
              </section>
            ` : ""}
            ${this.aiBusy && !this.pendingAIEdit ? html`<div class="ai-chat-working" role="status">${this.aiProgress}</div>` : ""}
            ${this.aiError ? html`<div class="ai-chat-error" role="alert">${this.aiError}</div>` : ""}
          </div>
          <form
            class="ai-chat-composer"
            ?inert=${Boolean(this.pendingAIEdit) && expanded}
            @submit=${this.submitAIPrompt}
          >
            <div
              class="ai-composer-surface"
              ?data-has-attachments=${this.aiAttachments.length > 0}
              ?data-review-pending=${Boolean(this.pendingAIEdit) && !expanded}
            >
              ${this.aiAttachments.length ? html`
                <div class="ai-pending-attachments" aria-label="Pending attachments">
                  ${this.aiAttachments.map(attachment => html`
                    <span class="ai-pending-attachment" title=${attachment.name}>
                      <span class="ai-pending-attachment-name">${attachment.name}</span>
                      <button
                        class="ai-attachment-remove"
                        type="button"
                        aria-label=${`Remove ${attachment.name}`}
                        @click=${() => this.removeAIAttachment(attachment.id)}
                      >×</button>
                    </span>
                  `)}
                </div>
              ` : ""}
              <textarea
                class="ai-prompt-input ai-chat-input"
                aria-label=${expanded ? "Chat message" : "AI prompt"}
                placeholder=${this.pendingAIEdit ? "Accept or reject the document change…" : expanded ? "Message AI…" : "Ask AI…"}
                .rows=${expanded ? 3 : 1}
                autocomplete="off"
                data-ribbon-input-persistent
                .value=${this.aiPrompt}
                ?disabled=${Boolean(this.pendingAIEdit)}
                @input=${this.updateAIPrompt}
                @keydown=${this.handleAIChatPromptKeydown}
              ></textarea>
              <input
                class="ai-attachment-input"
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.csv,.json,.html,.css,.js,.mjs,.ts,.xml,.yaml,.yml"
                @change=${this.addAIAttachments}
              >
              <div class="ai-composer-toolbar" ?hidden=${!expanded} ?inert=${!expanded}>
                <button
                  class="ai-composer-attachment"
                  type="button"
                  aria-label="Add attachments"
                  title="Attachments"
                  ?disabled=${this.aiBusy}
                  @click=${this.chooseAIAttachments}
                ><span class="ai-composer-attachment-icon" aria-hidden="true">${ribbonIcon("Attachment")}</span></button>
                <div class="ai-composer-selects">
                  <div
                    class="ai-composer-model-control"
                    ?data-disabled=${this.aiBusy || modelCount === 0}
                  >
                    <select
                      class="ai-composer-select"
                      aria-label="AI model"
                      data-kind="model"
                      data-ribbon-input-persistent
                      .value=${selectedModelValue}
                      ?disabled=${this.aiBusy || modelCount === 0}
                      @change=${this.updateAIModel}
                    >
                      ${modelCount === 0 ? html`<option value="">Set up AI…</option>` : ""}
                      ${this.aiProviders.flatMap(provider => provider.models.map(model => html`
                        <option value=${JSON.stringify([provider.id, model])}>${model} (${provider.name})</option>
                      `))}
                    </select>
                    <span class="ai-composer-model-label" aria-hidden="true">${this.aiModel || "Set up AI…"}</span>
                  </div>
                  <select
                    class="ai-composer-select"
                    aria-label="AI effort"
                    data-kind="effort"
                    data-ribbon-input-persistent
                    .value=${this.aiEffort}
                    ?disabled=${this.aiBusy}
                    @change=${this.updateAIEffort}
                  >${aiEfforts.map(effort => html`
                    <option value=${effort.value} ?selected=${this.aiEffort === effort.value}>${effort.label}</option>
                  `)}</select>
                </div>
              </div>
              ${this.pendingAIEdit && !expanded ? html`
                <div class="ai-prompt-review-actions" aria-label="Review pending AI change">
                  <button class="ai-prompt-review-action" type="button" aria-label="Reject AI change" title="Reject" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.rejectAIEdit}>${ribbonIcon("Reject")}</button>
                  <button class="ai-prompt-review-action" type="button" aria-label="Go to AI change" title="Go to change" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.gotoPendingAIEdit}>${ribbonIcon("Goto")}</button>
                  <button class="ai-prompt-review-action" data-kind="approve" type="button" aria-label="Accept AI change" title="Accept" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.approveAIEdit}>${ribbonIcon("Accept")}</button>
                </div>
              ` : html`
                <button
                  class="ai-prompt-submit ai-chat-send"
                  type="button"
                  aria-label=${this.aiBusy ? "Stop AI request" : expanded ? "Send chat message" : "Enter AI prompt"}
                  title=${this.aiBusy ? "Stop" : expanded ? "Send" : "Enter"}
                  ?data-busy=${this.aiBusy}
                  ?disabled=${Boolean(this.pendingAIEdit) || !this.aiBusy && !this.aiPrompt.trim() && this.aiAttachments.length === 0}
                  @click=${(event: MouseEvent) => this.aiBusy
                    ? this.stopAIRequest()
                    : (event.currentTarget as HTMLButtonElement).form?.requestSubmit()}
                >${this.aiBusy ? html`<span class="ai-stop-icon" aria-hidden="true"></span>` : ribbonIcon("AIPromptSubmit")}</button>
              `}
            </div>
            <button
              class="ai-prompt-expand"
              type="button"
              aria-label=${this.aiChatOpen ? "Collapse AI chat" : "Expand AI chat"}
              title=${this.aiChatOpen ? "Collapse chat" : "Expand chat"}
              aria-expanded=${this.aiChatOpen}
              aria-controls="ai-toolbox-chat"
              @click=${this.toggleAIChat}
            ><span class="ai-prompt-expand-chevron" aria-hidden="true"></span></button>
          </form>
        </section>
    `
  }

  render() {
    const fileMenu = menuGroups.File.find(group => group.label === "File")!
    const visibleTabs = this.previewActive ? ["File"] : menuTabs
    const aiReviewPending = Boolean(this.pendingAIEdit)
    const historyPreviewPending = this.historyState.preview !== null
    return html`
      <div
        class=${this.previewActive ? "ribbon preview" : "ribbon"}
        @pointerdown=${this.handleRibbonPointerDown}
        @mousedown=${this.handleRibbonPointerDown}
        @focusin=${this.handleRibbonInputFocusIn}
        @focusout=${this.handleRibbonInputFocusOut}
        @change=${this.handleRibbonInputChange}
        @keydown=${this.handleRibbonInputKeydown}
        @ribbon-tab-select=${this.selectMenu}
        @ribbon-button-click=${this.selectLocalPackage}
        @ribbon-drawer-state-change=${this.handleRibbonDrawerState}
      >
        <div class="ribbon-top">
          <button
            class="brand"
            type="button"
            aria-controls="ribbon-content"
            aria-expanded=${this.expanded}
            ?disabled=${!this.previewActive && (this.previewTransitioning || aiReviewPending)}
            aria-label=${this.previewActive ? "Return to editing" : this.expanded ? "Collapse ribbon" : "Expand ribbon"}
            title=${this.previewActive ? "Return to editing" : this.expanded ? "Collapse ribbon" : "Expand ribbon"}
            @click=${this.toggleExpanded}
          >
            ${this.logoUrl ? html`<img class="brand-logo" src=${this.logoUrl} alt="WebWriter" />` : ""}
          </button>
          <nav class="ribbon-navigation" aria-label="Editor navigation">
            <div class="tabs" role="group" aria-label="File controls" ?inert=${aiReviewPending}>
              ${visibleTabs.map(tab => html`
                <ribbon-tab
                  label=${tab}
                  .active=${tab === "File" ? this.menuOpen : this.activeMenu === tab && !this.previewActive}
                  .fileName=${tab === "File" ? this.fileName : ""}
                  .fileDirty=${tab === "File" && this.fileDirty}
                  .ribbonCollapsed=${true}
                ></ribbon-tab>
                ${tab === "File" ? html`
                  <div class="file-quick-actions" role="group" aria-label="File actions" ?inert=${aiReviewPending}>
                    <ribbon-button
                      class="file-quick-action file-save-action"
                      label="Save"
                      action="Save"
                      compact
                      ?disabled=${this.previewActive || historyPreviewPending}
                    ></ribbon-button>
                    <ribbon-button
                      class="file-quick-action file-share-action"
                      variant="tab"
                      label="Share"
                      action="Share"
                      compact
                      dropdown-on-click
                      lazy-dropdown
                      dropdown-no-scroll
                      ?disabled=${this.previewActive && !(this.liveSessionActive && this.liveSessionLink)}
                      .qrValue=${this.sharingLink}
                      .dropdown=${this.renderSharingDropdown(this.sharingLink)}
                      @ribbon-dropdown-open=${() => {
                        this.menuOpen = false
                        void this.ensureSharingQRCodeImage(this.sharingLink)
                      }}
                    ></ribbon-button>
                  </div>
                ` : ""}
              `)}
            </div>
            ${this.previewActive || this.settings.disableAI ? "" : html`<div class="ai-bar-slot" aria-hidden="true"></div>`}
          </nav>
          <button
            class="login-button"
            data-state=${this.backendState}
            type="button"
            title=${this.backendState === "connected"
              ? "Automatically logged in to the localhost development server"
            : this.backendState === "probing" ? "Looking for a local backend" : "Retry local backend login"}
            ?disabled=${this.backendState === "probing"}
            @click=${() => this.dispatchEvent(new Event(
              this.backendState === "connected" ? "backend-admin-request" : "backend-login-request",
              {bubbles: true, composed: true},
            ))}
          >${this.backendState === "connected" ? "Local dev" : this.backendState === "probing" ? "Connecting…" : "Log in"}</button>
          ${this.renderPresence()}
          <div class="ribbon-top-actions">
            ${this.previewActive ? "" : html`
              <div class="history-controls" role="group" aria-label="Undo and redo">
                <button
                  class="history-button"
                  type="button"
                  aria-label="Undo"
                  title="Undo"
                  ?disabled=${aiReviewPending || historyPreviewPending}
                  @click=${() => this.handleTopButtonClick("Undo")}
                >
                  <span class="history-icon" aria-hidden="true">${ribbonIcon("Undo")}</span>
                </button>
                <button
                  class="history-button"
                  type="button"
                  aria-label="Redo"
                  title="Redo"
                  ?disabled=${aiReviewPending || historyPreviewPending}
                  @click=${() => this.handleTopButtonClick("Redo")}
                >
                  <span class="history-icon" aria-hidden="true">${ribbonIcon("Redo")}</span>
                </button>
              </div>
            `}
            <button
              class="preview-button"
              type="button"
              ?active=${this.previewActive}
              aria-label=${this.previewActive ? "Exit preview" : "Preview"}
              title=${this.previewActive ? "Exit preview" : "Preview"}
              aria-pressed=${this.previewActive}
              ?disabled=${aiReviewPending || historyPreviewPending}
              @click=${() => this.handleTopButtonClick("Preview")}
            >
              <span class="preview-icon" aria-hidden="true">${ribbonIcon("Preview")}</span>
            </button>
          </div>
        </div>
        ${this.settings.disableAI ? nothing : this.renderAIChat(false)}
        <ai-settings-dialog .store=${this.aiProviderStore}></ai-settings-dialog>
        ${this.renderDocumentDialogs()}
        <ribbon-menu
          .groups=${[
            menuGroups.File.find(group => group.label === "File")!,
            ...(!this.expanded && !this.previewActive ? this.collapsedEditingMenuGroups() : []),
            {label: "Settings", buttons: [
              ...(!this.previewActive ? [{label: this.breadcrumbVisible ? "Hide breadcrumb" : "Show breadcrumb", action: "toggle-breadcrumb"}] : []),
              {label: "Settings"},
            ]},
          ]}
          @ribbon-button-click=${this.handleFileMenuAction}
          @keydown=${(event: KeyboardEvent) => {
            if(event.key !== "Escape") return
            event.stopPropagation()
            this.dismissCollapsedMenu()
            this.renderRoot.querySelector('ribbon-tab[label="File"]')?.shadowRoot?.querySelector<HTMLButtonElement>("button")?.focus()
          }}
          ?hidden=${!this.menuOpen}
          ?inert=${aiReviewPending || historyPreviewPending}
        ></ribbon-menu>
        <div
          id="ribbon-content"
          class="ribbon-content"
          role="tabpanel"
          aria-label=${this.previewActive && this.liveSessionActive ? "Live session" : this.activeMenu}
          ?hidden=${!this.expanded}
          ?inert=${aiReviewPending || historyPreviewPending && this.activeMenu !== "History"}
        >
          ${this.renderDrawers()}
        </div>
      </div>
    `
  }
}

if(!customElements.get("app-ribbon")) {
  customElements.define("app-ribbon", AppRibbon)
}

declare global {
  interface HTMLElementTagNameMap {
    "app-ribbon": AppRibbon
  }
}
