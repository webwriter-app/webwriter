import {css, html, noChange, nothing, render} from "lit"
import {guard} from "lit/directives/guard.js"
import {when} from "lit/directives/when.js"
import type {QRCodeElement} from "./qr-code"
import {styleMap} from "lit/directives/style-map.js"
import {aiChatStyles} from "./ai-chat.styles"
import {sharingLinkStyles, switchInputStyles} from "./dropdown-content.styles"
import {documentDialogStyles} from "./document-dialog.styles"
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
import {type PresenceUser, type UndoState} from "../editor-bridge"
import {mediaCaptureOptions, type MediaType} from "../media"
import {fontFamilyOptions, fontSizeOptions, textColorOptions, backgroundColorOptions, primaryDrawerMarkNames} from "../marks"
import {packageKeywordPresentations} from "../package-keywords"
import type {PackageMember, WebWriterPackage} from "../packages"
import {packageAction, packageMemberAction, packageToggleAction} from "../packages"
import {safeCssColor} from "../css-color"
import {ribbonIcon} from "../ribbon-icons"
import {uiMotionDisabled} from "../utility"
import "./ai-settings"
import "./element-attribute-editor"
import "./element-style-editor"
import {emptyElementHTML, insertionMenuItems} from "./insertion-menu"
import "./package-search"
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
  fileFormatButtons,
  menuTabs,
  orderedListStyles,
  insertMathStructureButtons,
  type RibbonMenuName,
} from "./ribbon-menu-config"
import "./ribbon-tab"
import "./settings-panel"
import {type SettingsPanel, type SettingsTab} from "./settings-panel"
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
  queueState?: "queued" | "cancelled"
}

type QueuedAIPrompt = {prompt: string, chatId: string, messageId: string, attachments: AIAttachment[]}

type AIChat = {
  id: string
  title: string
  messages: AIChatMessage[]
  prompt?: string
  attachments?: AIAttachment[]
  error?: string
  dismissedReplyId?: string
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
  decision: "queued" | "review" | "accepted" | "rejected" | "undone"
  busy?: boolean
}

export type AIEditReviewAction = "preview" | "accept" | "reject" | "goto" | "undo"
export type AIEditReviewHandler = (action: AIEditReviewAction, call: AIDocumentToolCall, options?: {signal?: AbortSignal}) => Promise<unknown>


/** The editor's tabbed, responsive ribbon toolbar. */
export class AppRibbon extends EditingControls {
  static properties = {
    ...EditingControls.properties,
    expanded: {type: Boolean, reflect: true},
    heightConstrained: {state: true},
    menuOpen: {type: Boolean, reflect: true},
    documentDialog: {state: true},
    settingsTab: {state: true},
    logoUrl: {type: String, attribute: "logo-url"},
    presenceUsers: {attribute: false},
    undoState: {attribute: false},
    collaborationLink: {attribute: false},
    linkSharingEnabled: {type: Boolean},
    linkSharingBusy: {type: Boolean},
    collaborationStatus: {type: String},
    collaborationError: {type: String},
    packages: {attribute: false},
    editingSnippetId: {attribute: false},
    installedPackages: {attribute: false},
    consoleOpen: {type: Boolean, attribute: false},
    recentDocuments: {attribute: false},
    packagesLoading: {type: Boolean, attribute: "packages-loading"},
    busyPackageNames: {attribute: false},
    packageError: {type: String, attribute: "package-error"},
    packageSearchQuery: {type: String, state: true},
    breadcrumbVisible: {type: Boolean},
    packageDrawerOpen: {type: Boolean, reflect: true, attribute: "package-drawer-open"},
    packageVisibleCount: {type: Number, state: true},
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
    previewActive: {type: Boolean, attribute: "preview-active"},
    previewTransitioning: {type: Boolean, attribute: "preview-transition", reflect: true},
    liveSessionActive: {type: Boolean, attribute: "live-session-active"},
    liveSessionRole: {type: String, attribute: "live-session-role"},
    liveSessionLink: {type: String, attribute: "live-session-link"},
    liveLearners: {attribute: false},
    aiChatOpen: {type: Boolean, attribute: false},
    aiToolboxTarget: {attribute: false},
    aiChats: {attribute: false, state: true},
    activeAIChatId: {type: String, state: true},
    aiModel: {type: String, state: true},
    aiEffort: {type: String, state: true},
    aiProviders: {attribute: false, state: true},
    aiBusy: {type: Boolean, state: true},
    aiRequestChatId: {state: true},
    queuedAIPrompts: {state: true},
    aiProgress: {type: String, state: true},
    pendingAIEdit: {attribute: false, state: true},
    aiDocumentToolHandler: {attribute: false},
    aiEditReviewHandler: {attribute: false},
    backendClient: {attribute: false},
    backendState: {type: String, attribute: "backend-state"},
    cloudSessionWarning: {type: String},
  }

  static styles = css`
    ${EditingControls.styles}

    :host {
      box-sizing: border-box;
      display: block;
      position: relative;
      /* Ribbon menus and drawers must paint above the toolbox and its tabs. */
      z-index: 3;
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

    :host([expanded][drawers-collapsed]) {
      height: 90px;
      max-height: 90px;
      --ribbon-drawer-summary-direction: row;
    }

    :host(:not([expanded])) .ribbon {
      background: #f2f2f2;
    }

    .ribbon {
      box-sizing: border-box;
      container: ribbon / inline-size;
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

    .ribbon-top[data-app-menu-tab] .brand::before {
      content: "";
      position: absolute;
      inset: 1px 0 -1px;
      box-sizing: border-box;
      background: #ffffff;
      border: solid #a8a8a8;
      border-width: 1px 0 0 1px;
      border-radius: 0.45rem 0 0 0;
      pointer-events: none;
    }

    .ribbon-top[data-app-menu-tab] .brand-logo {
      position: relative;
    }

    .ribbon-top[data-app-menu-tab] ribbon-tab[label="File"]::part(button) {
      border-left-color: transparent;
      border-top-left-radius: 0;
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
      min-width: calc(100px + 1.7rem + 4.1rem);
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
      flex: 0 1 4.1rem;
      width: 4.1rem;
      min-width: 3rem;
      align-items: center;
      align-self: flex-start;
      justify-content: space-between;
      gap: .2rem;
      padding-inline: .2rem;
      height: 40px;
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

    @container ribbon (max-width: 42rem) {
      .tabs {min-width: 0}
      .tabs > ribbon-tab[label="File"] {min-width: 0; --file-label-min-width: 0px}
    }

    @container ribbon (max-width: 28rem) {
      .ai-bar-slot {flex: 0 0 24px; width: 24px; max-width: 24px}
      .ai-chat-panel:not([data-open]) {width: 24px}
      .ai-chat-panel:not([data-open]) .ai-chat-brand-button {inset: 0; width: 100%; height: 100%; padding: 3px}
      .ai-chat-panel:not([data-open]) .ai-chat-composer {display: none}
    }

    ${documentDialogStyles}
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
      flex-wrap: wrap;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .settings-dialog-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; min-width: 0; }
    .settings-tabs { display: flex; gap: .25rem; }
    .settings-dialog-nav .settings-tabs button { border-color: transparent; }
    .settings-dialog-nav .settings-tabs button[aria-selected="true"] { color: #1e4f87; background: #e8f2fd; border-color: #93b9e8; }
    @media (max-width: 42rem) {
      .settings-dialog-nav { flex-wrap: wrap; gap: .5rem; padding: .75rem; }
      .settings-dialog-heading { flex-wrap: wrap; gap: .5rem; }
      .settings-dialog-nav form { margin-left: auto; }
      .settings-dialog-main { padding: .75rem; }
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
    .settings-version-info { display: grid; justify-items: center; gap: .1rem; }
    .settings-dialog-nav .licenses-link {
      min-height: 0; padding: 0; border: 0; color: #3977c7;
      background: transparent; font-size: .6rem; line-height: 1.2; text-decoration: underline;
    }
    .settings-dialog-nav .licenses-link:hover { background: transparent; }

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

    .ribbon-top[data-app-menu-tab] ~ ribbon-menu {
      left: 0;
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
      align-items: stretch;
      height: var(--ribbon-compact-bar-height);
      margin-inline: 0.15rem;
      padding: 0;
      overflow: hidden;
      border: 1px solid #c4ccd6;
      border-radius: 0.62rem;
      color: #5e6977;
      background: transparent;
    }

    .history-controls .history-button {
      height: auto;
      border-radius: 0;
    }

    .ribbon-top-actions {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      margin-left: auto;
    }

    .file-share-action:has(.presence-user + .presence-user) { width: 2.25rem; min-width: 2.25rem; flex-basis: 2.25rem; }

    .presence-users {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      height: 1.75rem;
      margin: 0;
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
      margin-left: -0.9rem;
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
      margin-left: -0.9rem;
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
      flex: 1 1 auto;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      padding: 0 0.3rem;
      color: #7b8795;
      font-size: 0.68rem;
    }

    .reader-learners:has(.learners-summary) .learner-list {
      display: none;
    }

    .live-session-switch {
      display: flex;
      flex-direction: row;
      flex: 0 1 auto;
      min-width: 0;
      align-self: center;
      align-items: center;
      gap: 0.35rem;
      min-height: 1.55rem;
      padding: 0.25rem 0.25rem 0.25rem 0;
      border-radius: 0.3rem;
      color: var(--ribbon-control-color, #334155);
      font-size: 0.66rem;
      cursor: pointer;
    }

    .live-session-switch span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .live-session-switch:hover {
      color: var(--ribbon-control-color, #1e4f87);
    }

    .live-session-switch:has(input:focus-visible) {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    ${switchInputStyles}

    ${sharingLinkStyles}

    .reader-sharing-bar {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      min-width: 0;
      padding: 0 0.25rem 0 0;
    }

    .reader-sharing-bar .session-share {
      flex: 1 1 0;
      min-width: 0;
    }

    .reader-sharing-bar .sharing-link-input {
      text-overflow: ellipsis;
      border-color: var(--reader-link-border-color, #c8d2df);
    }

    .reader-sharing-bar .sharing-link-copy {
      background: var(--sharing-link-copy-background, var(--ribbon-area-background));
    }

    .reader-link-popup {
      display: none;
    }

    .reader-learners {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    @container reader-sharing (max-width: 20rem) {
      .reader-sharing-bar .session-share > .sharing-link-field {
        display: none;
      }

      .reader-sharing-bar .session-share {
        flex: 0 0 1.75rem;
      }

      .reader-link-popup {
        display: block;
      }
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
      flex: 1 1 0;
      align-content: start;
      /* Two complete learner rows fill the remaining drawer height. */
      grid-auto-rows: calc((100% - 0.25rem) / 2);
      grid-template-columns: repeat(auto-fill, minmax(min(9rem, 100%), 1fr));
      gap: 0.25rem;
      width: 100%;
      min-height: 0;
      overflow: auto;
      padding: 0.125rem 0.25rem;
    }

    .learner-toggle {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      height: 100%;
      padding: 0 0.4rem;
      border: 1px solid #cbd5e1;
      border-radius: 0.35rem;
      color: #334155;
      background: white;
      font: inherit;
      font-size: 0.66rem;
      cursor: pointer;
    }

    .learner-toggle .learner-avatar {
      width: 1.1rem;
      height: 1.1rem;
      flex-shrink: 0;
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

    .history-button:hover:not(:disabled) {
      color: #243447;
      background: #e8eef5;
    }

    .history-button:active:not(:disabled) {
      color: #243447;
      background: #d8e3ef;
    }

    .history-button:disabled {
      color: #a4acb6;
      cursor: default;
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

    .ribbon-content:has(> ribbon-drawer[layout="learners"]) {
      padding-inline-start: 0.35rem;
    }

    .ribbon-content > ribbon-drawer:not(:first-child) {
      --ribbon-drawer-inline-start: auto;
      --ribbon-drawer-inline-end: 0;
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

    ribbon-button.file-action {
      grid-row: 2;
      min-width: 0;
    }

`

  expanded = true

  menuOpen = false

  private documentDialog: "settings" | null = null
  private confirmation?: {dialogId: string, resolve: (confirmed: boolean) => void}
  private settingsTab: SettingsTab = "Editor"

  logoUrl = ""

  presenceUsers: PresenceUser[] = []
  undoState: UndoState = {canUndo: false, canRedo: false}
  collaborationLink = ""
  linkSharingEnabled = false
  linkSharingBusy = false
  collaborationStatus = "disconnected"
  collaborationError = ""

  packages: WebWriterPackage[] = []
  editingSnippetId: string | null = null

  installedPackages: WebWriterPackage[] = []

  consoleOpen = false
  recentDocuments: {id: string, title: string}[] = []

  packagesLoading = false

  busyPackageNames: string[] = []

  packageError = ""


  private tableGridRows = 2

  private tableGridColumns = 2

  private sharingCopyLinkActive = false

  private sharingCopyLinkSuccess = false

  private sharingCopyLinkActiveTimer: ReturnType<typeof setTimeout> | undefined

  private sharingCopyLinkSuccessTimer: ReturnType<typeof setTimeout> | undefined

  fileName = ""

  fileDirty = false

  previewActive = false

  liveSessionActive = false

  liveSessionRole: "host" | "learner" | "" = ""

  private readerSharingCopyPending = false

  liveSessionLink = ""

  liveLearners: LiveLearnerRibbonItem[] = []


  breadcrumbVisible = true

  private packageSearchQuery = ""

  private packageDrawerOpen = false

  private packageVisibleCount = 2

  aiDocumentToolHandler: AIDocumentToolHandler | undefined

  aiEditReviewHandler: AIEditReviewHandler | undefined

  backendClient: BackendClient | null = null

  backendState: "probing" | "connected" | "unavailable" = "probing"
  cloudSessionWarning = ""

  private readonly aiProviderStore = new AIProviderStore()

  private backendConnectionSequence = 0


  aiChatOpen = false
  aiToolboxTarget: HTMLElement | null = null



  private aiChats: AIChat[] = [{id: "chat-1", title: "New chat", messages: []}]

  private activeAIChatId = "chat-1"

  private aiProviders: AIProviderConfig[] = this.aiProviderStore.providers

  private aiModel = this.aiProviderStore.activeProvider?.defaultModel ?? ""

  private aiEffort: AIEffort = "medium"


  private aiBusy = false
  private aiRequestChatId = "chat-1"
  private queuedAIPrompts: QueuedAIPrompt[] = []
  private aiProgress = "AI is working…"


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

  private heightConstrained = false
  private expandedBeforeHeightConstraint = true

  private updateHeightConstraint() {
    const constrained = window.innerHeight <= 600
    if(constrained === this.heightConstrained) return
    this.heightConstrained = constrained
    if(constrained) {
      this.expandedBeforeHeightConstraint = this.expanded
      this.expanded = false
      this.menuOpen = false
      this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer").forEach(drawer => drawer.closeDrawer())
    }
    else this.expanded = this.expandedBeforeHeightConstraint
  }

  private readonly handleWindowResize = () => {
    this.updateHeightConstraint()
    this.scheduleResponsiveLayout()
  }

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
      if(client && client.session.capabilities.includes("providers")) await this.aiProviderStore.connectBackend(client)
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
    if(this.renderRoot.querySelector(".document-dialog[open]")) return
    if(this.aiChatOpen) {
      event.stopImmediatePropagation()
      this.closeAIChat(true)
      return
    }
    if(this.renderRoot.querySelector(".ai-bar-reply")) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.dismissAIBarReply()
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
    this.updateHeightConstraint()
  }

  disconnectedCallback() {
    this.finishConfirmation(this.confirmation?.dialogId, false)
    this.readerSharingCopyPending = false
    if(this.aiToolboxTarget) render(nothing, this.aiToolboxTarget)
    this.aiProviderStore.removeEventListener("change", this.handleAIProviderChange)
    void this.cancelAIWork()
    if(this.previewTransitionTimer !== undefined) clearTimeout(this.previewTransitionTimer)
    this.previewTransitionTimer = undefined
    if(this.sharingCopyLinkActiveTimer !== undefined) clearTimeout(this.sharingCopyLinkActiveTimer)
    if(this.sharingCopyLinkSuccessTimer !== undefined) clearTimeout(this.sharingCopyLinkSuccessTimer)
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
    if(!content || content.hidden || !drawers.length) {
      this.removeAttribute("drawers-collapsed")
      return
    }

    const contentStyle = getComputedStyle(content)
    const inlinePadding =
      (Number.parseFloat(contentStyle.paddingLeft) || 0) +
      (Number.parseFloat(contentStyle.paddingRight) || 0)
    const availableWidth = content.clientWidth - inlinePadding
    if(availableWidth <= 0) return

    // Reader controls fill the remaining ribbon width and adapt inside the
    // drawer instead of being exchanged for a collapsed summary.
    if(this.previewActive && this.liveSessionRole !== "learner") {
      this.removeAttribute("drawers-collapsed")
      drawers.forEach(drawer => {
        drawer.compact = false
        drawer.collapsed = false
      })
      return
    }

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
    this.toggleAttribute("drawers-collapsed", layouts.every(layout => layout === "collapsed"))
  }

  private updatePackageCapacity() {
    const drawer = this.renderRoot.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')
    if(!drawer) return
    // Search occupies one cell of the same three-row grid at every width.
    const visibleCount = drawer.packageColumnCount * 3 - 1
    if(this.packageVisibleCount !== visibleCount) this.packageVisibleCount = visibleCount
  }

  private toggleExpanded() {
    if(this.heightConstrained) {
      this.toggleFileMenu()
      return
    }
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

  get aiWorkActive() {
    return this.aiBusy || this.queuedAIPrompts.length > 0
  }

  private get activeAIChat() {
    return this.aiChats.find(chat => chat.id === this.activeAIChatId)
  }

  private updateAIChat(chatId: string, changes: Partial<AIChat>) {
    this.aiChats = this.aiChats.map(chat => chat.id === chatId ? {...chat, ...changes} : chat)
  }

  private get aiPrompt() { return this.activeAIChat?.prompt ?? "" }
  private set aiPrompt(prompt: string) { this.updateAIChat(this.activeAIChatId, {prompt}) }
  private get aiAttachments() { return this.activeAIChat?.attachments ?? [] }
  private set aiAttachments(attachments: AIAttachment[]) { this.updateAIChat(this.activeAIChatId, {attachments}) }
  private get aiError() { return this.activeAIChat?.error ?? "" }
  private set aiError(error: string) { this.updateAIChat(this.activeAIChatId, {error}) }
  private get dismissedAIBarReplyId() { return this.activeAIChat?.dismissedReplyId ?? "" }
  private set dismissedAIBarReplyId(dismissedReplyId: string) {
    if(dismissedReplyId !== this.dismissedAIBarReplyId) this.updateAIChat(this.activeAIChatId, {dismissedReplyId})
  }

  private get latestAIBarReply() {
    const message = this.activeAIChat?.messages.at(-1)
    return message?.role === "assistant" ? message : undefined
  }

  private dismissAIBarReply() {
    this.dismissedAIBarReplyId = this.latestAIBarReply?.id ?? ""
    this.aiError = ""
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
    queueState?: AIChatMessage["queueState"],
  ) {
    const message: AIChatMessage = {
      id: `message-${++this.aiMessageSequence}`,
      role,
      content,
      ...(attachments.length ? {attachments: attachments.map(attachment => ({...attachment}))} : {}),
      ...(queueState ? {queueState} : {}),
    }
    this.aiChats = this.aiChats.map(chat => chat.id === chatId ? {
      ...chat,
      title: chat.messages.length === 0 && role === "user" ? this.promptTitle(content) : chat.title,
      messages: this.insertAIMessage(chat.messages, message),
    } : chat)
    void this.updateComplete.then(() => {
      this.scrollAIChatToEnd()
    })
    return message.id
  }

  private insertAIMessage(messages: AIChatMessage[], message: AIChatMessage) {
    const index = messages.findIndex(current => current.queueState === "queued")
    return index < 0 || message.queueState ? [...messages, message]
      : [...messages.slice(0, index), message, ...messages.slice(index)]
  }

  private clearQueuedAIPrompts(chatId?: string) {
    const ids = new Set(this.queuedAIPrompts.filter(prompt => !chatId || prompt.chatId === chatId).map(prompt => prompt.messageId))
    this.queuedAIPrompts = this.queuedAIPrompts.filter(prompt => !ids.has(prompt.messageId))
    this.aiChats = this.aiChats.map(chat => ({...chat, messages: chat.messages.map(message => ids.has(message.id)
      ? {...message, queueState: "cancelled" as const} : message)}))
  }

  private runNextQueuedAIPrompt() {
    if(this.aiBusy || this.pendingAIEdit || this.settings.disableAI || !this.isConnected) return
    const next = this.queuedAIPrompts[0]
    if(!next) return
    void this.runAIPrompt(next.prompt, next)
  }

  private scrollAIChatToEnd() {
    const messages = (this.aiToolboxTarget ?? this.renderRoot).querySelector<HTMLElement>(".ai-chat-messages")
    if(messages) messages.scrollTop = messages.scrollHeight
  }

  private appendAIEditProtocol(pending: PendingAIEdit, decision: AIEditProtocol["decision"]) {
    const content = decision === "queued" ? `Queued: ${pending.summary}`
      : decision === "review" ? `Review document change: ${pending.summary}`
      : decision === "accepted"
      ? `Accepted: ${pending.summary}`
      : decision === "rejected"
        ? `Rejected: ${pending.summary}`
        : `Undone: ${pending.summary}`
    const existing = this.aiChats.find(chat => chat.id === pending.chatId)?.messages.find(message => message.edit?.editId === pending.call.id)
    const message: AIChatMessage = {
      id: existing?.id ?? `message-${++this.aiMessageSequence}`,
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
      ? {...chat, messages: existing ? chat.messages.map(current => current.id === existing.id ? message : current) : this.insertAIMessage(chat.messages, message)}
      : chat)
    void this.updateComplete.then(() => this.scrollAIChatToEnd())
  }

  private removePendingAIEditMessage(callId: string, chatId: string) {
    this.aiChats = this.aiChats.map(chat => chat.id === chatId ? {...chat, messages: chat.messages.filter(message =>
      message.edit?.editId !== callId || !["queued", "review"].includes(message.edit.decision))} : chat)
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
    const prompt = this.aiPrompt.trim() || (this.aiAttachments.length ? "Please review the attached file(s)." : "")
    if(!prompt) return
    if(this.aiBusy || this.pendingAIEdit) {
      const attachments = this.aiAttachments.map(attachment => ({...attachment}))
      const chatId = this.activeAIChatId
      const messageId = this.appendAIMessage("user", prompt, chatId, attachments, "queued")
      this.queuedAIPrompts = [...this.queuedAIPrompts, {prompt, attachments, chatId, messageId}]
      this.aiPrompt = ""
      this.aiAttachments = []
      return
    }
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
      this.renderRoot.querySelector<HTMLButtonElement>(".ai-chat-brand-button")?.focus()
    })
  }

  private startNewAIChat = () => {
    const activeChat = this.activeAIChat
    if(activeChat?.title === "New chat" && activeChat.messages.length === 0 && !this.aiPrompt && !this.aiAttachments.length && !this.aiError) return
    const id = `chat-${++this.aiChatSequence}`
    this.aiChats = [{id, title: "New chat", messages: []}, ...this.aiChats]
    this.activeAIChatId = id
    void this.updateComplete.then(() => {
      (this.aiToolboxTarget ?? this.renderRoot).querySelector<HTMLTextAreaElement>(".ai-prompt-input")?.focus()
    })
  }

  private switchAIChat(event: Event) {
    const id = (event.currentTarget as HTMLSelectElement).value
    if(!this.aiChats.some(chat => chat.id === id)) return
    this.activeAIChatId = id
  }

  private updateAIModelAndEffort(event: Event) {
    try {
      const [providerId, model, effort] = JSON.parse((event.currentTarget as HTMLSelectElement).value) as unknown[]
      if(typeof providerId !== "string" || typeof model !== "string"
        || !this.aiProviders.some(provider => provider.id === providerId && provider.models.includes(model))
        || !aiEfforts.some(option => option.value === effort)) return
      void this.aiProviderStore.activate(providerId).catch(error => {
        this.aiError = error instanceof Error ? error.message : String(error)
      })
      this.aiModel = model
      this.aiEffort = effort as AIEffort
      this.aiError = ""
    }
    catch {
      // Ignore a stale option from a provider that was edited concurrently.
    }
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
    this.settingsTab = "Cloud"
    void this.showRibbonDialog("settings")
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
    const chatId = this.activeAIChatId
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
      const chat = this.aiChats.find(chat => chat.id === chatId)
      if(chat) this.updateAIChat(chatId, {attachments: [...(chat.attachments ?? []), ...attachments]})
      if(this.activeAIChatId === chatId) this.aiChatOpen = true
    }
    catch(error) {
      this.updateAIChat(chatId, {error: error instanceof Error ? error.message : String(error)})
    }
  }

  private removeAIAttachment(attachmentId: string) {
    this.aiAttachments = this.aiAttachments.filter(attachment => attachment.id !== attachmentId)
  }

  private conversationFor(chatId: string): AIConversationMessage[] {
    const chat = this.aiChats.find(candidate => candidate.id === chatId)
    return chat?.messages
      .filter(message => !message.queueState)
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
      this.appendAIEditProtocol(this.pendingAIEdit, "queued")
      const cancel = () => {
        if(this.pendingAIEdit?.call.id === call.id) {
          this.pendingAIEdit = null
          this.removePendingAIEditMessage(call.id, chatId)
        }
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
            this.appendAIEditProtocol(this.pendingAIEdit, "review")
            resolve({status: "queued", proposalId: call.id, summary})
            if(queuedDecision) queueMicrotask(() => this.reviewPendingAIEdit(queuedDecision, call.id))
          }
          else void this.aiEditReviewHandler?.("reject", call).catch(() => {})
        },
      ).catch(error => {
          if(this.pendingAIEdit?.call.id === call.id) {
            this.pendingAIEdit = null
            this.removePendingAIEditMessage(call.id, chatId)
          }
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
    this.updateAIChat(pending.chatId, {error: ""})
    try {
      const result = this.aiEditReviewHandler
        ? await this.aiEditReviewHandler("accept", pending.call)
        : {status: "unavailable", message: "The document editor is not connected"}
      if((result as {status?: string})?.status !== "applied") throw new Error("The document change could not be accepted")
      this.appendAIEditProtocol(pending, "accepted")
      if(this.pendingAIEdit?.call.id === pending.call.id) this.pendingAIEdit = null
      this.runNextQueuedAIPrompt()
    }
    catch(error) {
      this.updateAIChat(pending.chatId, {error: error instanceof Error ? error.message : String(error)})
      if(this.pendingAIEdit?.call.id === pending.call.id) this.pendingAIEdit = {...pending, deciding: false}
    }
  }

  private rejectAIEdit = async () => {
    const pending = this.pendingAIEdit
    if(!pending || pending.previewing || pending.deciding) return
    this.pendingAIEdit = {...pending, deciding: true}
    this.updateAIChat(pending.chatId, {error: ""})
    try {
      const result = await this.aiEditReviewHandler?.("reject", pending.call)
      if((result as {status?: string})?.status !== "rejected") throw new Error("The document change could not be rejected")
      this.appendAIEditProtocol(pending, "rejected")
      this.pendingAIEdit = null
      this.runNextQueuedAIPrompt()
    }
    catch(error) {
      this.updateAIChat(pending.chatId, {error: error instanceof Error ? error.message : String(error)})
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
    const chatId = this.aiChats.find(chat => chat.messages.some(message => message.id === messageId))?.id
    if(!chatId) return
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
      this.updateAIChat(chatId, {error: error instanceof Error ? error.message : String(error)})
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
    if(!this.aiBusy || this.aiRequestChatId !== this.activeAIChatId) return
    this.clearQueuedAIPrompts(this.activeAIChatId)
    this.aiAbortController?.abort()
  }

  /** Called before an iframe is replaced, and when the ribbon is destroyed. */
  async cancelAIWork() {
    this.clearQueuedAIPrompts()
    this.aiAbortController?.abort()
    this.aiAbortController = null
    this.aiBusy = false
    const pending = this.pendingAIEdit
    this.pendingAIEdit = null
    this.pendingAIQueue = null
    pending?.resolve({status: "error", message: "The document change was cancelled"})
    if(pending) this.removePendingAIEditMessage(pending.call.id, pending.chatId)
    if(pending && !pending.previewing) {
      await this.aiEditReviewHandler?.("reject", pending.call).catch(() => {})
    }
  }

  private async runAIPrompt(prompt: string, queued?: QueuedAIPrompt) {
    if(this.settings.disableAI) return
    if(this.pendingAIEdit) {
      this.aiError = "Accept or reject the pending document change before continuing the chat."
      return
    }
    const chatId = queued?.chatId ?? this.activeAIChatId
    const provider = this.activeAIProvider
    if(!provider) {
      if(queued) this.clearQueuedAIPrompts()
      this.updateAIChat(chatId, {error: "Set up an AI provider before sending a message."})
      this.aiChatOpen = true
      this.showAISettings()
      return
    }
    if(!this.aiModel) {
      if(queued) this.clearQueuedAIPrompts()
      this.updateAIChat(chatId, {error: "Add or load a model for this provider."})
      this.aiChatOpen = true
      this.showAISettings()
      return
    }
    const apiKey = this.aiProviderStore.keyFor(provider)
    if(provider.managed !== "backend" && provider.auth !== "none" && !apiKey) {
      if(queued) this.clearQueuedAIPrompts()
      this.updateAIChat(chatId, {error: this.aiProviderStore.credentialStatus(provider) === "locked"
        ? "Unlock this provider's encrypted API key in AI settings."
        : "Enter an API key for this provider in AI settings."})
      this.aiChatOpen = true
      this.showAISettings()
      return
    }

    const attachments = queued?.attachments ?? this.aiAttachments.map(attachment => ({...attachment}))
    if(queued) {
      this.queuedAIPrompts = this.queuedAIPrompts.slice(1)
      this.aiChats = this.aiChats.map(chat => chat.id === chatId ? {...chat, messages: chat.messages.map(message =>
        message.id === queued.messageId ? {...message, queueState: undefined} : message)} : chat)
    }
    else this.appendAIMessage("user", prompt, chatId, attachments)
    this.dispatchAIPrompt(prompt, provider, attachments, chatId)
    if(!queued) {
      this.updateAIChat(chatId, {prompt: "", attachments: []})
    }
    this.updateAIChat(chatId, {error: ""})
    this.aiRequestChatId = chatId
    this.aiBusy = true
    this.aiProgress = "Reading editor capabilities…"
    const controller = new AbortController()
    this.aiAbortController = controller
    let queuedChange = false
    try {
      const response = await completeAIConversation({
        provider,
        apiKey,
        model: this.aiModel,
        effort: this.aiEffort,
        messages: this.conversationFor(chatId),
        readOnly: requestsReadOnlyAI(prompt),
        toolHandler: async (call, options) => {
          const result = await this.handleAIDocumentTool(call, chatId, options?.signal)
          if((result as {status?: string})?.status === "queued") queuedChange = true
          return result
        },
        onProgress: message => {
          if(this.aiAbortController === controller) this.aiProgress = message
        },
        signal: controller.signal,
      })
      if(this.aiAbortController === controller && !queuedChange) this.appendAIResponse(response, chatId)
    }
    catch(error) {
      if(this.aiAbortController !== controller) return
      this.updateAIChat(chatId, {error: error instanceof DOMException && error.name === "AbortError"
        ? "Request stopped."
        : error instanceof Error ? error.message : String(error)})
    }
    finally {
      if(this.aiAbortController === controller) {
        this.aiAbortController = null
        this.aiBusy = false
        this.runNextQueuedAIPrompt()
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
    if(label === "File") this.toggleFileMenu()
  }

  private toggleFileMenu() {
    if(this.liveSessionActive) {
      this.dismissCollapsedMenu()
      this.dispatchEvent(new CustomEvent("ribbon-preview-exit", {detail: {openFileMenu: true}, bubbles: true, composed: true}))
      return
    }
    this.closeAIChat()
    const open = !this.menuOpen
    this.dismissCollapsedMenu()
    this.menuOpen = open
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
    if(this.heightConstrained) this.expanded = false
  }

  protected updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if(this.readerSharingCopyPending && this.liveSessionActive && this.liveSessionLink) {
      this.readerSharingCopyPending = false
      void this.copyReaderSharing(this.liveSessionLink)
    }
    const previousTarget = changed.get("aiToolboxTarget") as HTMLElement | null | undefined
    if(previousTarget && previousTarget !== this.aiToolboxTarget) render(nothing, previousTarget)
    if(this.aiToolboxTarget) render(guard(this.aiChatRenderDependencies, () => when(
      !this.settings.disableAI, () => this.renderAIChat(true),
    )), this.aiToolboxTarget, {host: this})
    if((changed.has("aiChatOpen") || changed.has("aiChats") || changed.has("activeAIChatId")) && this.aiChatOpen) this.dismissedAIBarReplyId = this.latestAIBarReply?.id ?? ""
    const reply = this.renderRoot.querySelector<HTMLElement>(".ai-bar-reply")
    if(reply && typeof reply.showPopover === "function") {
      try { if(!reply.matches(":popover-open")) reply.showPopover() }
      catch { /* The reply remains available in browsers without popovers. */ }
    }
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
    if(changed.has("menuOpen") && this.menuOpen) this.dispatchEvent(new Event("recent-documents-refresh", {bubbles: true, composed: true}))
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

  private get userSnippets() {
    return this.settings.userSnippets
  }

  private isConsoleSelectedPackage(pkg: WebWriterPackage) {
    return this.consoleOpen && this.localPackageSelectionName === pkg.name
  }

  private get packageManagementMode() {
    return Boolean(this.packageSearchQuery.trim()) || this.packageDrawerOpen
  }

  private readonly packageDetailsCache = new WeakMap<WebWriterPackage, {key: string, details: RibbonButtonDetails}>()
  private readonly emptyPackageSubmenu: RibbonButton["submenu"] = []

  private packageDetails(pkg: WebWriterPackage): RibbonButtonDetails {
    const locale = navigator.language || "en"
    // Compare values rather than array identities: local package editing can
    // change metadata in place, and changing UI language must update labels.
    const key = JSON.stringify([locale, pkg.label, pkg.name, pkg.version, pkg.description, pkg.authors, pkg.keywords])
    const cached = this.packageDetailsCache.get(pkg)
    if(cached?.key === key) return cached.details
    const details = {
      heading: pkg.label,
      subheading: `${pkg.name}@${pkg.version}`,
      description: pkg.description,
      authors: pkg.authors,
      keywords: packageKeywordPresentations(pkg.keywords, locale).slice(0, 8),
    }
    this.packageDetailsCache.set(pkg, {key, details})
    return details
  }

  private packageDragHTML(pkg: WebWriterPackage, member: PackageMember | undefined) {
    return this.installedPackages.some(candidate => candidate.name === pkg.name)
      && member?.kind === "widget" && member.tagName ? emptyElementHTML(member.tagName) : undefined
  }

  private renderPackageButton(pkg: WebWriterPackage, slot = "") {
    const members = pkg.members.filter(member => member.insertable)
    const installed = this.installedPackages.some(candidate => candidate.name === pkg.name)
    const management = this.packageManagementMode
    const busy = this.busyPackageNames.includes(pkg.name)
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
        .dragHTML=${this.packageDragHTML(pkg, members[0])}
        .submenu=${management || !installed || busy ? this.emptyPackageSubmenu : members.slice(1).map(member => ({
          label: member.label,
          action: packageMemberAction(member),
          dragHTML: this.packageDragHTML(pkg, member),
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
        .loading=${busy}
        ?disabled=${!busy && !management && !members.length}
        ?keep-drawer-open=${management || !installed || busy}
      ></ribbon-button>
    `
  }

  private handlePackageSearch = (event: Event) => {
    this.packageSearchQuery = (event as CustomEvent<{query?: string}>).detail?.query ?? ""
  }

  private handleRibbonIconHover = (event: CustomEvent<{hovered: boolean}>) => {
    this.dispatchEvent(new CustomEvent<{hovered: boolean}>("snippet-hover-change", {
      detail: event.detail,
      bubbles: true,
      composed: true,
    }))
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
    const visibleCount = Math.max(0, this.packageVisibleCount - 1)
    const visiblePackages = displayPackages.slice(0, visibleCount)
    const overflowPackages = displayPackages.slice(visibleCount)
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
        ${this.renderUserSnippetButton()}
        ${visiblePackages.map(pkg => this.renderPackageButton(pkg))}
        ${overflowPackages.map(pkg => this.renderPackageButton(pkg, "more"))}
        ${!this.packagesLoading && !displayPackages.length ? html`<span class="package-status">No packages</span>` : ""}
      </ribbon-drawer>
    `
  }

  private get userSnippetButtons(): RibbonMenuButton[] {
    return [{label: "Add snippet", action: "pin-snippet", icon: "Plus"}, ...this.userSnippets.map(snippet => ({
      label: snippet.label,
      action: `user-snippet:${snippet.id}`,
      dragHTML: snippet.html,
      icon: "FileHorizontal",
      removeAction: `remove-user-snippet:${snippet.id}`,
      editingLabel: snippet.id === this.editingSnippetId,
    }))]
  }

  private get userSnippetGroups(): RibbonMenuGroup[] {
    return [{label: "Snippets", buttons: this.userSnippetButtons}, ...(!this.userSnippets.length ? [{
      label: "Empty snippets",
      content: html`<div class="snippet-empty-hint">Select something and click to store it here as a snippet to use later</div>`,
      buttons: [],
    }] : [])]
  }

  private renderUserSnippetButton() {
    return html`
      <ribbon-button
        variant="package"
        label="Snippets"
        icon="FileHorizontal"
        icon-action="pin-snippet"
        icon-action-label="Add snippet"
        hover-icon="Plus"
        dropdown-on-click
        dropdown-compact
        keep-drawer-open
        .submenu=${this.userSnippetButtons}
        .submenuGroups=${this.userSnippetGroups}
      ></ribbon-button>
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
      groupedButton("Text", "Text", ["Paragraph", "Heading", "List"]),
      {
        ...groupedButton("Media", "Image", ["Image", "Audio", "Video", "Graphic", "Website"]),
        submenu: ["Image", "Audio", "Video", "Graphic", "Website"].map(label => {
          const button = buttonByLabel(label)
          const type = insertionMenuItems.find(candidate => candidate.name === label)?.tag
          return type === "picture" || type === "audio" || type === "video"
            ? {...(typeof button === "string" ? {label: button} : button), submenu: sourceButtons(type)}
            : button
        }),
      },
      buttonByLabel("Table"),
      buttonByLabel("Details"),
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
    return html`
      <ribbon-drawer
        label=${drawer.label}
        icon="Paragraph"
        layout="elements"
      >
        ${drawer.buttons.map(button => renderButton(button))}
        ${compactButtons.map(button => renderButton(button, "compact"))}
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

  private fileButtonsForStorage(buttons: RibbonMenuButton[]) {
    return buttons.map(button => this.settings.activeCloudServiceId && typeof button !== "string" && ["Save", "Save as"].includes(button.label)
      ? {...button, submenu: []} : button)
  }

  private renderFileDrawer(drawer: RibbonMenuGroup) {
    const activeService = this.settings.cloudServices.find(service => service.id === this.settings.activeCloudServiceId)
    const selectedStorageLocation = {icon: activeService ? "Cloud" : "Local",
      label: activeService?.type === "edumix" ? "edumix.eu" : activeService?.url ?? "Local"}
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
          <span class="storage-location">
            <span class="storage-location-icon" aria-hidden="true">${ribbonIcon(selectedStorageLocation.icon)}</span>
            <span>${selectedStorageLocation.label}</span>
          </span>
        </div>
        ${this.fileButtonsForStorage(drawer.buttons).map(button => {
          const item = typeof button === "string" ? {label: button} : button
          return html`
            <ribbon-button
              class="file-action"
              label=${item.label}
              .action=${item.action ?? item.label}
              .submenu=${item.label === "Open" ? this.recentDocumentButtons : item.submenu ?? []}
              shortcut=${this.commandShortcut(item.action ?? item.label)}
            ></ribbon-button>
          `
        })}
      </ribbon-drawer>
    `
  }

  private get recentDocumentButtons(): RibbonMenuButton[] {
    return this.recentDocuments.length ? this.recentDocuments.slice(0, 10).map(document => ({
      label: document.title, action: `recent-document:${encodeURIComponent(document.id)}`, icon: "Document",
    })) : [{label: "No recently opened documents", disabled: true}]
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
      const dialog = this.renderRoot.querySelector<HTMLDialogElement>(`#${name}-dialog`)
      if(dialog && !dialog.open) dialog.showModal()
    }
  }

  async confirmLinkSharing(): Promise<boolean> {
    return this.confirmWithDialog("link-sharing-dialog")
  }

  async confirmLiveSessionStop(): Promise<boolean> {
    return this.confirmWithDialog("live-session-stop-dialog")
  }

  private async confirmWithDialog(dialogId: string): Promise<boolean> {
    if(!this.isConnected || this.confirmation) return false
    let settle!: (confirmed: boolean) => void
    const result = new Promise<boolean>(resolve => { settle = resolve })
    this.confirmation = {dialogId, resolve: settle}
    this.dismissMenus()
    this.closeAIChat()
    await this.updateComplete
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>(`#${dialogId}`)
    if(!this.isConnected || !dialog) this.finishConfirmation(dialogId, false)
    else if(this.confirmation?.dialogId === dialogId && !dialog.open) dialog.showModal()
    return result
  }

  private finishConfirmation(dialogId: string | undefined, confirmed: boolean) {
    if(!dialogId || this.confirmation?.dialogId !== dialogId) return
    const resolve = this.confirmation.resolve
    this.confirmation = undefined
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>(`#${dialogId}`)
    if(dialog?.open) dialog.close()
    resolve(confirmed)
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
      `, buttons: primaryDrawerMarkNames.map(mark)},
      {label: "More marks", buttons: [{label: "Link", action: "mark:a", icon: "MarkLink", disabled: !this.canMark || this.math?.active, submenuGroups: [{label: "Link", content: this.renderSpanDropdown(this.spanSelectedMarks()), buttons: []}]}]},
    ]
    const insert = [...menuGroups.Start.find(group => group.label === "Elements")!.buttons, {label: "Formula", icon: "Formula", submenu: insertMathStructureButtons}].map((button): RibbonMenuButton => {
      const item = typeof button === "string" ? {label: button} : button
      if(item.label === "Table") return {...item, submenuGroups: [{label: "Table size", content: this.renderTableSizePicker(), buttons: []}]}
      const type = insertionMenuItems.find(candidate => candidate.name === item.label)?.tag
      if(type === "picture" || type === "audio" || type === "video") return {...item, submenu: [
        {label: "Select file", action: `media-file:${type}`, icon: "Select file"},
        ...mediaCaptureOptions(type).map(option => ({label: option.label, action: `media-capture:${option.mode}`, icon: option.label})),
      ]}
      return item
    })
    const packages: RibbonMenuButton[] = [{
      label: "Snippets",
      menuOnly: true,
      iconAction: "pin-snippet",
      iconActionLabel: "Add snippet",
      icon: "FileHorizontal",
      hoverIcon: "Plus",
      submenu: this.userSnippetButtons,
      submenuGroups: this.userSnippetGroups,
    }]
    packages.push(...this.filteredPackages.map((pkg): RibbonMenuButton => {
      const installed = this.installedPackages.some(candidate => candidate.name === pkg.name)
      return {
        label: pkg.label, italic: this.isDeveloperPackage(pkg), selected: this.isConsoleSelectedPackage(pkg), icon: "Packages", iconUrl: pkg.iconUrl,
        action: packageAction(pkg),
        dragHTML: this.packageDragHTML(pkg, pkg.members.find(member => member.insertable)),
        removeAction: installed ? packageToggleAction(pkg) : undefined,
        submenu: !installed || this.busyPackageNames.includes(pkg.name) ? [] : pkg.members.filter(member => member.insertable).slice(1).map(member => ({
          label: member.label, action: packageMemberAction(member), dragHTML: this.packageDragHTML(pkg, member), icon: "Packages", iconUrl: pkg.iconUrl,
        })),
      }
    }))
    return [{label: "Editing", buttons: [
      {label: "Format", icon: "MarkBold", menuOnly: true, submenuGroups: format},
      {label: "Insert", icon: "Paragraph", menuOnly: true, submenu: insert},
      {label: "Packages", icon: "Packages", menuOnly: true, submenuGroups: [{label: "Packages", buttons: packages,
        content: !this.packagesLoading && !this.filteredPackages.length ? html`<span>No packages</span>` : undefined}],
        submenuHeader: html`<package-search .query=${this.packageSearchQuery} .loading=${this.packagesLoading}
          .error=${this.packageError} @package-search-change=${this.handlePackageSearch}></package-search>`},
    ]}]
  }

  private handleFileMenuAction = (event: CustomEvent<{label: string, keepDrawerOpen?: boolean}>) => {
    if(this.liveSessionActive) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if(event.detail.label !== "pin-snippet" && !event.detail.keepDrawerOpen) this.menuOpen = false
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
    if(event.detail.label === "about-webwriter") {
      event.stopPropagation()
      window.open(new URL(import.meta.env.BASE_URL, location.href).href, "_blank", "noopener,noreferrer")
    }
  }

  private handleSettingsTabKeydown = (event: KeyboardEvent) => {
    const tabs = ["Editor", "Cloud", "Commands"] as const
    const index = tabs.indexOf(this.settingsTab)
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1
    if(next < 0) return
    event.preventDefault()
    this.settingsTab = tabs[next]
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(`#settings-tab-${this.settingsTab.toLowerCase()}`)?.focus())
  }

  private renderDocumentDialogs() {
    return html`
      <dialog id="link-sharing-dialog" class="document-dialog confirmation-dialog" aria-labelledby="link-sharing-dialog-title" aria-describedby="link-sharing-dialog-description"
        @cancel=${(event: Event) => { event.preventDefault(); this.finishConfirmation("link-sharing-dialog", false) }}
        @close=${(event: Event) => { if(!(event.currentTarget as HTMLDialogElement).open) this.finishConfirmation("link-sharing-dialog", false) }}>
        <header><h2 id="link-sharing-dialog-title">Enable link sharing?</h2>
          <button class="dialog-close" type="button" aria-label="Close link sharing confirmation" @click=${() => this.finishConfirmation("link-sharing-dialog", false)}>${ribbonIcon("Reject")}</button>
        </header>
        <p id="link-sharing-dialog-description">Link sharing requires a document saved on the server. Move this document to the server and enable sharing?</p>
        <footer>
          <button type="button" autofocus @click=${() => this.finishConfirmation("link-sharing-dialog", false)}>Cancel</button>
          <button class="primary" type="button" @click=${() => this.finishConfirmation("link-sharing-dialog", true)}>Move and enable sharing</button>
        </footer>
      </dialog>
      <dialog id="live-session-stop-dialog" class="document-dialog confirmation-dialog" aria-labelledby="live-session-stop-dialog-title" aria-describedby="live-session-stop-dialog-description"
        @cancel=${(event: Event) => { event.preventDefault(); this.finishConfirmation("live-session-stop-dialog", false) }}
        @close=${(event: Event) => { if(!(event.currentTarget as HTMLDialogElement).open) this.finishConfirmation("live-session-stop-dialog", false) }}>
        <header><h2 id="live-session-stop-dialog-title">Stop live session?</h2>
          <button class="dialog-close" type="button" aria-label="Close live session confirmation" @click=${() => this.finishConfirmation("live-session-stop-dialog", false)}>${ribbonIcon("Reject")}</button>
        </header>
        <p id="live-session-stop-dialog-description">Stopping the live session disconnects all learners and ends the session.</p>
        <footer>
          <button type="button" autofocus @click=${() => this.finishConfirmation("live-session-stop-dialog", false)}>Cancel</button>
          <button class="primary" type="button" @click=${() => this.finishConfirmation("live-session-stop-dialog", true)}>Stop session</button>
        </footer>
      </dialog>
      <dialog id="settings-dialog" class="document-dialog" aria-labelledby="settings-dialog-title"
        @cancel=${(event: Event) => { event.preventDefault(); (event.currentTarget as HTMLDialogElement).close() }}
        @close=${() => { this.documentDialog = null }}>
        ${this.documentDialog === "settings" ? html`
        <nav class="settings-dialog-nav" aria-label="Settings">
          <div class="settings-dialog-heading">
            <h2 id="settings-dialog-title">Settings</h2>
            <div class="settings-tabs" role="tablist" aria-label="Settings categories">
              ${(["Editor", "Cloud", "Commands"] as const).map(tab => html`<button type="button" role="tab"
                id=${`settings-tab-${tab.toLowerCase()}`} aria-selected=${this.settingsTab === tab}
                aria-controls="settings-content" tabindex=${this.settingsTab === tab ? "0" : "-1"}
                @click=${() => { this.settingsTab = tab }} @keydown=${this.handleSettingsTabKeydown}>${tab}</button>`)}
            </div>
          </div>
          <form method="dialog">
            <div class="settings-version-info">
              <span class="settings-version">WebWriter ${version}</span>
              <button class="licenses-link" type="button" aria-haspopup="dialog"
                @click=${() => this.renderRoot.querySelector<SettingsPanel>("settings-panel")?.showLicenses()}>View licenses</button>
            </div>
            <button
              class="reset-settings-button"
              type="button"
              @click=${() => this.renderRoot.querySelector<SettingsPanel>("settings-panel")?.resetSettings()}
            >Reset</button>
            <button class="settings-close-button" aria-label="Close settings" title="Close settings">
              ${ribbonIcon("Reject")}
            </button>
          </form>
        </nav>
        <main id="settings-content" class="settings-dialog-main">
          <settings-panel
            .settings=${this.settings}
            .tab=${this.settingsTab}
            @settings-change=${this.handleSettingsChange}
          ><ai-settings-dialog slot="ai" embedded .store=${this.aiProviderStore} .open=${this.settingsTab === "Cloud"}></ai-settings-dialog></settings-panel>
        </main>
        ` : ""}
      </dialog>
    `
  }

  private renderSharingDropdown(link: string, sessionShare = false) {
    return html`
      <div class="sharing-dropdown" role="group" aria-label="Collaboration">
        ${sessionShare ? nothing : html`
          <button class="sharing-toggle" type="button" role="switch" aria-label="Invite to edit or review"
              aria-checked=${this.linkSharingEnabled} ?disabled=${this.linkSharingBusy}
              @click=${() => this.dispatchEvent(new CustomEvent("link-sharing-change", {
                detail: {enabled: !this.linkSharingEnabled}, bubbles: true, composed: true,
              }))}>
            <span class="sharing-invite-icon" aria-hidden="true">${ribbonIcon("UserEdit")}</span>
            <strong>Invite to edit or review</strong>
            <span class="sharing-switch" aria-hidden="true" ?data-checked=${this.linkSharingEnabled}></span>
          </button>`}
        ${link && (sessionShare || this.linkSharingEnabled) ? html`<label class="sharing-link-field">
          <span class="sharing-link-label">Editing link</span>
          <span class="sharing-link-input-row">
            <input class="sharing-link-input" aria-label="Sharing link" readonly .value=${link}
              @click=${(event: Event) => (event.currentTarget as HTMLInputElement).select()} />
            <button class="sharing-link-copy" type="button" aria-label="Copy link"
              title=${this.sharingCopyLinkSuccess ? "Copied link" : "Copy link"}
              @click=${() => void this.copySharingLinkAndShowFeedback(link)}>${ribbonIcon("Copy")}</button>
          </span>
        </label>` : nothing}
        ${this.collaborationError ? html`<p role="alert">${this.collaborationError}</p>` : nothing}
        ${this.collaborationStatus === "disconnected" ? nothing : html`<p class="collaboration-status" role="status">${this.collaborationStatus === "connected" ? "Connected" : "Connecting…"}</p>`}
        <ul class="collaboration-authors" aria-label="Connected authors">
          ${this.presenceUsers.map(user => html`<li>
            <span class="presence-user" style=${styleMap({"--presence-color": safeCssColor(user.color)})}>${user.initials}</span>
            <span><strong>${user.name}</strong>${user.connectionStatus === "disconnected" ? nothing : html`<span class="author-status">Connected</span>`}
              <span class="author-change">${user.lastChange ? `Last change: ${new Date(user.lastChange).toLocaleString()}` : "No changes yet"}</span></span>
          </li>`)}
        </ul>
        ${!this.presenceUsers.length ? html`<p class="collaboration-empty">No other authors connected</p>` : nothing}
        ${sessionShare ? nothing : html`
          <p class="sharing-reader-hint">
            <button class="sharing-preview-button" type="button" aria-label="Share with readers: open preview" title="Open preview"
              ?disabled=${Boolean(this.pendingAIEdit) || this.historyState.preview !== null}
              @click=${() => {
                this.renderRoot.querySelector<RibbonButton>(".file-share-action")?.closeSubmenu()
                if(!this.previewActive) this.handleTopButtonClick("Preview")
              }}><span>Share with readers</span><span class="sharing-preview-icon" aria-hidden="true">${ribbonIcon("Preview")}</span></button>
          </p>`}
      </div>
    `
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

  private renderReaderLinkField(link: string, slot = "") {
    return html`<label class="sharing-link-field" slot=${slot}>
      <span class="sharing-link-input-row">
        <input class="sharing-link-input" aria-label="Reader sharing link" readonly .value=${link}
          ?disabled=${!link}
          placeholder="Sharing link"
          @click=${(event: Event) => (event.currentTarget as HTMLInputElement).select()} />
        <button class=${`sharing-link-copy${this.sharingCopyLinkSuccess ? " is-success" : ""}`}
          type="button" aria-label="Copy reader link" ?disabled=${!link}
          title=${this.sharingCopyLinkSuccess ? "Copied link" : "Copy link"}
          @click=${() => void this.copyReaderSharing(link)}>${ribbonIcon("Copy")}</button>
      </span>
    </label>`
  }

  private async readerSharingClipboardData(link: string) {
    const button = this.renderRoot.querySelector<RibbonButton>(".session-share")
    if(!button) throw new Error("Sharing controls unavailable")
    const blob = await this.sharingQRCodeBlob()
    if(!blob || !this.isConnected || !this.liveSessionActive || this.liveSessionLink !== link) throw new Error("Sharing link changed")
    const imageURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    const content = document.createElement("div")
    const anchor = document.createElement("a")
    anchor.href = link
    anchor.textContent = link
    const image = document.createElement("img")
    image.src = imageURL
    image.alt = "QR code"
    content.append(anchor, document.createElement("br"), image)
    return {
      "text/html": new Blob([content.innerHTML], {type: "text/html"}),
      "image/png": blob,
      "text/plain": new Blob([link], {type: "text/plain"}),
    }
  }

  private async copyReaderSharing(link: string) {
    const button = this.renderRoot.querySelector<RibbonButton>(".session-share")
    try {
      if(!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Clipboard unavailable")
      }
      const data = this.readerSharingClipboardData(link)
      // Start the clipboard write during the click; promised formats preserve
      // browser user activation while the QR image is generated.
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": data.then(value => value["text/html"]),
        "image/png": data.then(value => value["image/png"]),
        "text/plain": data.then(value => value["text/plain"]),
      })])
      if(button?.isConnected) button.showNotification("Link and QR code copied!", 2800)
    }
    catch {
      if(button?.isConnected) button.showNotification("Could not copy link and QR code", 2800)
    }
  }

  private async sharingQRCodeBlob() {
    const button = this.renderRoot.querySelector<RibbonButton>(".session-share")
    await button?.updateComplete
    const qrCode = button?.shadowRoot?.querySelector<QRCodeElement>("webwriter-qr-code")
    if(!qrCode) return null
    await qrCode.updateComplete
    return qrCode.toBlob()
  }

  private async copySharingQRCode() {
    const button = this.renderRoot.querySelector<RibbonButton>(".session-share")
    try {
      const blob = await this.sharingQRCodeBlob()
      if(!blob || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Clipboard unavailable")
      await navigator.clipboard.write([new ClipboardItem({[blob.type || "image/png"]: blob})])
      button?.showNotification("Copied QR code")
    }
    catch {
      button?.showNotification("Could not copy QR code")
    }
  }

  private async downloadSharingQRCode() {
    const button = this.renderRoot.querySelector<RibbonButton>(".session-share")
    try {
      const blob = await this.sharingQRCodeBlob()
      if(!blob) throw new Error("QR export unavailable")
      const url = URL.createObjectURL(blob)
      try {
        const link = document.createElement("a")
        link.href = url
        link.download = "webwriter-qr-code.png"
        link.click()
      }
      finally { URL.revokeObjectURL(url) }
    }
    catch {
      button?.showNotification("Could not download QR code")
    }
  }

  private renderSharingButton() {
    const link = this.liveSessionActive ? this.liveSessionLink : ""
    return html`
      <ribbon-button class="session-share" label="QR" action="QR" icon="QR" compact icon-only variant="reader-sharing"
        dropdown-on-click
        .dropdown=${html`<div class="sharing-dropdown" role="group" aria-label="Share">
          <div class="sharing-qr-group" role="group" aria-label="QR code">
            <webwriter-qr-code class="sharing-qr-code" .value=${link} .size=${224}></webwriter-qr-code>
            <div class="sharing-dropdown-actions">
              <button class="sharing-dropdown-action" type="button" @click=${() => void this.downloadSharingQRCode()}>
                ${ribbonIcon("FileDownload")}<span>Download QR code</span>
              </button>
              <button class="sharing-dropdown-action" type="button" @click=${() => void this.copySharingQRCode()}>
                ${ribbonIcon("Copy")}<span>Copy QR code</span>
              </button>
            </div>
          </div>
        </div>`}
        keep-drawer-open dropdown-no-scroll ?disabled=${!link}
      >${this.renderReaderLinkField(link, "trailing")}</ribbon-button>
    `
  }

  private handleLiveSessionToggle = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    const enabled = input.checked
    this.readerSharingCopyPending = enabled
    input.checked = this.liveSessionActive
    this.dispatchEvent(new CustomEvent<{enabled: boolean}>("live-session-toggle", {
      detail: {enabled},
      bubbles: true,
      composed: true,
    }))
  }

  private renderLearnersDrawer() {
    return html`
      <ribbon-drawer label="Learners" icon="Plus" layout="learners">
        <div class="reader-sharing-bar" role="group" aria-label="Reader sharing">
          <label class="live-session-switch">
            <input type="checkbox" role="switch" aria-label="Share"
              .checked=${this.liveSessionActive} @change=${this.handleLiveSessionToggle} />
            <span>Share</span>
          </label>
          ${this.renderSharingButton()}
          <ribbon-button class="reader-link-popup" label="Reader sharing link" icon="Link" compact
            dropdown-on-click .dropdown=${html`<div class="sharing-dropdown">${this.renderReaderLinkField(this.liveSessionLink)}</div>`}
            keep-drawer-open dropdown-no-scroll ?disabled=${!this.liveSessionActive || !this.liveSessionLink}></ribbon-button>
        </div>
        <div class="reader-learners">
          ${this.liveSessionActive && !this.liveLearners.length ? html`
            <div class="learners-summary" role="status">Waiting for participants</div>
          ` : nothing}
          <div class="learner-list" role="group" aria-label="Session learners">
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
                <span class="learner-avatar" style=${styleMap({"--learner-color": safeCssColor(learner.color)})} aria-hidden="true">${learner.initials}</span>
                <span class="learner-toggle-name">${learner.name}</span>
                <span class="learner-connection" ?data-connected=${learner.connected} aria-hidden="true"></span>
              </button>
            `)}
          </div>
        </div>
      </ribbon-drawer>
    `
  }

  protected renderDrawers() {
    if(this.previewActive && this.liveSessionRole !== "learner") {
      return [this.renderLearnersDrawer(), html`
        <ribbon-drawer label="Sharing" icon="Share" layout="sharing-preview">
          <ribbon-button class="sharing-action" label="Download" action="Download"
            .submenu=${fileFormatButtons("download")}></ribbon-button>
          <ribbon-button class="sharing-action" label="Print" action="Print"></ribbon-button>
        </ribbon-drawer>
      `]
    }
    return super.renderDrawers()
  }

  protected renderDrawer(drawer: RibbonMenuGroup) {
    if(drawer.label === "File") return this.renderFileDrawer(drawer)
    if(drawer.label === "Packages") return this.renderPackageDrawer()
    if(drawer.label === "Elements") return this.renderInsertionDrawer(drawer)
    return super.renderDrawer(drawer)
  }

  protected usesNativePointerInteraction(event: MouseEvent) {
    const aiAction = event.composedPath().find(target => target instanceof HTMLElement && (
      target.matches(
        ".ai-prompt-submit, .ai-chat-brand-button, " +
        ".ai-chat-header-button, .ai-chat-send, .ai-composer-attachment, " +
        ".ai-attachment-remove, .ai-edit-action, .ai-bar-reply-close",
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
        dragHTML: this.packageDragHTML(pkg, pkg.members.find(member => member.insertable)),
        submenu: members.slice(1).map(member => ({label: member.label, action: packageMemberAction(member), dragHTML: this.packageDragHTML(pkg, member)})),
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
    const visibleUsers = this.presenceUsers.slice(0, 2)
    return html`
      <div
        slot="icon"
        class="presence-users"
        role="group"
        aria-label="Active collaborators"
        data-user-count=${this.presenceUsers.length}
      >
        ${visibleUsers.map(user => html`
          <span
            class="presence-user"
            style=${styleMap({"--presence-color": safeCssColor(user.color)})}
            title=${user.name}
            aria-label=${user.name}
          >${user.initials}</span>
        `)}
      </div>
    `
  }

  private renderPendingAIEditActions(compact = false) {
    const pending = this.pendingAIEdit
    if(!pending) return nothing
    const buttons = [
      {label: "Accept", icon: "Accept", kind: "approve", click: this.approveAIEdit},
      {label: "Go to", icon: "Goto", kind: "goto", click: this.gotoPendingAIEdit},
      {label: "Reject", icon: "Reject", kind: "reject", click: this.rejectAIEdit},
    ]
    return html`<div class=${compact ? "ai-prompt-review-actions" : "ai-edit-actions ai-toolbox-review"} aria-label="Review pending AI change">
      ${buttons.map(button => html`<button type="button" class=${compact ? "ai-prompt-review-action" : "ai-edit-action"}
        data-kind=${button.kind} aria-label=${`${button.label} AI change`} title=${button.label}
        ?disabled=${pending.previewing || pending.deciding} @click=${button.click}>
        ${ribbonIcon(button.icon)}${compact ? nothing : html`<span>${button.kind === "approve" && pending.deciding ? "Saving…" : button.label}</span>`}
      </button>`)}
    </div>`
  }

  private get aiChatRenderDependencies() {
    return [this.settings.disableAI, this.previewActive, this.historyState.preview,
      this.aiChats, this.activeAIChatId, this.aiChatOpen, this.aiBusy, this.aiRequestChatId,
      this.aiProviders, this.activeAIProvider, this.aiModel, this.aiEffort, this.aiProgress, this.pendingAIEdit]
  }

  private renderAIChat(expanded: boolean) {
    const requestBusy = this.aiBusy && this.aiRequestChatId === this.activeAIChatId
    const pending = this.pendingAIEdit?.chatId === this.activeAIChatId ? this.pendingAIEdit : null
    const waiting = this.aiBusy || Boolean(this.pendingAIEdit)
    const hasDraft = Boolean(this.aiPrompt.trim() || this.aiAttachments.length)
    const stopButton = requestBusy && !hasDraft
    const barThinking = !expanded && !this.aiChatOpen && requestBusy && !pending && !hasDraft
    const activeProvider = this.activeAIProvider
    const selectedModelValue = activeProvider && this.aiModel
      ? JSON.stringify([activeProvider.id, this.aiModel, this.aiEffort])
      : ""
    const selectedModelLabel = this.aiModel
      ? `${this.aiModel} · ${aiEfforts.find(option => option.value === this.aiEffort)?.label ?? this.aiEffort}`
      : "Set up AI…"
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
          <header class="ai-chat-header" ?hidden=${!expanded} ?inert=${!expanded}>
            <select
              class="ai-chat-switcher"
              aria-label="Current AI chat"
              title=${this.activeAIChat?.title ?? "Current AI chat"}
              data-ribbon-input-persistent
              .value=${this.activeAIChatId}
              @change=${this.switchAIChat}
            >${this.aiChats.map(chat => html`
              <option value=${chat.id}>${chat.title}</option>
            `)}</select>
            <button
              class="ai-chat-header-button"
              type="button"
              aria-label="New chat"
              title="New chat"
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
              ?disabled=${Boolean(pending)}
              @click=${this.showAISettings}
            ><span class="ai-chat-settings-icon" aria-hidden="true">${ribbonIcon("AISettings")}</span></button>
          </header>
          ${when(expanded, () => html`<div
            class="ai-chat-messages"
            ?hidden=${!expanded}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            ?inert=${!expanded}
          >
            ${this.activeAIChat?.messages.length ? this.activeAIChat.messages.map(message => html`
              <article class="ai-chat-message" data-role=${message.role} data-edit-phase=${message.edit?.decision ?? nothing}>
                <span class="ai-chat-message-role">${message.role === "user" ? message.queueState === "queued" ? "You · Queued" : message.queueState === "cancelled" ? "You · Cancelled" : "You" : message.role === "assistant" ? "AI" : "Document change"}</span>
                <div class="ai-chat-message-content">${message.content}</div>
                ${message.attachments?.length ? html`
                  <div class="ai-message-attachments" aria-label="Attachments">
                    ${message.attachments.map(attachment => html`
                      <span class="ai-message-attachment" title=${attachment.name}>${attachment.name}</span>
                    `)}
                  </div>
                ` : ""}
                ${message.edit?.decision === "accepted" ? html`
                  <div class="ai-edit-actions" aria-label="Document change actions">
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
                  </div>
                ` : ""}
              </article>
            `) : html`<div class="ai-chat-empty">${this.aiProviders.length
              ? "Start a conversation with your AI model."
              : "Open AI settings to connect a provider."}</div>`}
            ${requestBusy && !pending ? html`<div class="ai-chat-working" role="status"><span title=${this.aiProgress}>Thinking...</span></div>` : ""}
            ${this.aiError ? html`<div class="ai-chat-error" role="alert">${this.aiError}</div>` : ""}
          </div>
          `)}
          <form
            class="ai-chat-composer"
            ?data-review=${Boolean(pending) && expanded}
            @submit=${this.submitAIPrompt}
          >
            ${pending && expanded ? this.renderPendingAIEditActions() : html`
            <div
              class="ai-composer-surface"
              ?data-thinking=${barThinking}
              ?data-has-attachments=${this.aiAttachments.length > 0}
              ?data-review-pending=${Boolean(pending) && !expanded}
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
                placeholder=${pending ? "Accept or reject the document change…" : expanded ? "Message AI…" : "Ask AI…"}
                .rows=${expanded ? 3 : 1}
                autocomplete="off"
                data-ribbon-input-persistent
                .value=${this.aiPrompt}
                ?disabled=${Boolean(pending)}
                title=${barThinking ? this.aiProgress : ""}
                @input=${this.updateAIPrompt}
                @keydown=${this.handleAIChatPromptKeydown}
              ></textarea>
              ${barThinking ? html`<span class="ai-bar-status" role="status" title=${this.aiProgress}>Thinking...</span>` : nothing}
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
                  ?disabled=${Boolean(pending)}
                  @click=${this.chooseAIAttachments}
                ><span class="ai-composer-attachment-icon" aria-hidden="true">${ribbonIcon("Attachment")}</span></button>
                <div class="ai-composer-selects">
                  <div
                    class="ai-composer-model-control"
                    ?data-disabled=${this.aiBusy || modelCount === 0}
                  >
                    <select
                      class="ai-composer-select"
                      aria-label="AI model and effort"
                      title=${selectedModelLabel}
                      data-ribbon-input-persistent
                      .value=${selectedModelValue}
                      ?disabled=${this.aiBusy || modelCount === 0}
                      @change=${this.updateAIModelAndEffort}
                    >
                      ${modelCount === 0 ? html`<option value="">Set up AI…</option>` : ""}
                      ${this.aiProviders.flatMap(provider => provider.models.map(model => html`
                        <optgroup label=${`${model} (${provider.name})`}>
                          ${aiEfforts.map(effort => html`
                            <option value=${JSON.stringify([provider.id, model, effort.value])}
                              ?selected=${activeProvider?.id === provider.id && this.aiModel === model && this.aiEffort === effort.value}
                            >${model} · ${effort.label}</option>
                          `)}
                        </optgroup>
                      `))}
                    </select>
                    <span class="ai-composer-model-label" aria-hidden="true">${selectedModelLabel}</span>
                  </div>
                </div>
              </div>
              ${pending && !expanded ? this.renderPendingAIEditActions(true) : html`
                <button
                  class="ai-prompt-submit ai-chat-send"
                  type="button"
                  aria-label=${stopButton ? "Stop AI request" : waiting ? "Queue chat message" : expanded ? "Send chat message" : "Enter AI prompt"}
                  title=${stopButton ? "Stop" : waiting ? "Queue" : expanded ? "Send" : "Enter"}
                  ?data-busy=${stopButton}
                  ?disabled=${Boolean(pending) || !stopButton && !hasDraft}
                  @click=${(event: MouseEvent) => stopButton
                    ? this.stopAIRequest()
                    : (event.currentTarget as HTMLButtonElement).form?.requestSubmit()}
                >${stopButton ? html`<span class="ai-stop-icon" aria-hidden="true"></span>` : ribbonIcon("AIPromptSubmit")}</button>
              `}
            </div>
            `}
          </form>
        </section>
        ${!expanded && !this.aiChatOpen && !this.previewActive && !requestBusy && !pending
          && (this.aiError || this.latestAIBarReply && this.latestAIBarReply.id !== this.dismissedAIBarReplyId)
          ? html`<aside class="ai-bar-reply" popover="manual" role=${this.aiError ? "alert" : "status"} aria-label=${this.aiError ? "AI error" : "AI reply"}>
            <button type="button" class="ai-bar-reply-close" aria-label="Dismiss AI reply" title="Dismiss" @click=${this.dismissAIBarReply}>×</button>
            <div class="ai-bar-reply-content">${this.aiError || this.latestAIBarReply?.content}</div>
          </aside>` : nothing}
    `
  }

  private fileMenuGroups(): RibbonMenuGroup[] {
    const configuredFileMenu = menuGroups.File.find(group => group.label === "File")!
    const fileMenu = {...configuredFileMenu, buttons: [...this.fileButtonsForStorage(configuredFileMenu.buttons.filter(button => (typeof button === "string" ? button : button.label) !== "Print")),
      ...(this.settings.activeCloudServiceId ? [{label: "Upload", icon: "Upload"}, {label: "Download", icon: "Download", submenu: fileFormatButtons("download")}] : []), "Print"]}
    return [
      {...fileMenu, buttons: fileMenu.buttons.map(button =>
        (typeof button === "string" ? button : button.label) === "Open"
          ? {...(typeof button === "string" ? {label: button} : button), submenu: this.recentDocumentButtons} : button)},
      ...(!this.expanded && !this.previewActive ? this.collapsedEditingMenuGroups() : []),
      {label: "Settings", buttons: [
        ...(!this.previewActive || this.settings.pinDeveloperConsole ? [{label: "Developer console", icon: "Develop", action: "show-developer-console"}] : []),
        {label: "Settings", warning: this.cloudSessionWarning},
      ]},
      {label: "About", buttons: [{label: "About WebWriter...", icon: "About", action: "about-webwriter"}]},
    ]
  }

  render() {
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
        @ribbon-icon-hover=${this.handleRibbonIconHover}
        @ribbon-drawer-state-change=${this.handleRibbonDrawerState}
      >
        <div class="ribbon-top" ?data-app-menu-tab=${this.heightConstrained && this.menuOpen}>
          <button
            class="brand"
            type="button"
            aria-controls=${this.heightConstrained ? "ribbon-file-menu" : "ribbon-content"}
            aria-expanded=${this.heightConstrained ? this.menuOpen : this.expanded}
            aria-haspopup=${this.heightConstrained ? "menu" : nothing}
            ?disabled=${!this.previewActive && (this.previewTransitioning || aiReviewPending)}
            aria-label=${this.heightConstrained ? this.menuOpen ? "Close File menu" : "Open File menu" : this.previewActive ? "Return to editing" : this.expanded ? "Collapse ribbon" : "Expand ribbon"}
            title=${this.heightConstrained ? this.menuOpen ? "Close File menu" : "Open File menu" : this.previewActive ? "Return to editing" : this.expanded ? "Collapse ribbon" : "Expand ribbon"}
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
                  .warning=${tab === "File" ? this.cloudSessionWarning : ""}
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
                      label="Collaboration"
                      icon="UserShare"
                      action="Collaboration"
                      compact
                      dropdown-on-click
                      lazy-dropdown
                      dropdown-no-scroll
                      ?custom-icon=${this.presenceUsers.length > 0}
                      ?disabled=${this.previewActive || historyPreviewPending}
                      .dropdown=${this.renderSharingDropdown(this.collaborationLink)}
                      @ribbon-dropdown-open=${() => {
                        this.menuOpen = false
                        this.dispatchEvent(new CustomEvent("collaboration-menu-open", {bubbles: true, composed: true}))
                      }}
                    >${this.renderPresence()}</ribbon-button>
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
              ? this.backendClient?.session.kind === "webwriter-dev-server" ? "Open local development server" : "Cloud service settings"
            : this.backendState === "probing" ? "Connecting to cloud service" : "Open settings to sign in"}
            ?disabled=${this.backendState === "probing"}
            @click=${() => this.backendClient?.session.kind === "webwriter-dev-server"
              ? this.dispatchEvent(new Event("backend-admin-request", {bubbles: true, composed: true}))
              : void this.showRibbonDialog("settings")}
          >${this.backendState === "connected" ? this.backendClient?.session.kind === "webwriter-dev-server" ? "Local dev" : "Cloud"
            : this.backendState === "probing" ? "Connecting…" : "Sign in"}</button>

          <div class="ribbon-top-actions">
            ${this.previewActive ? "" : html`
              <div class="history-controls" role="group" aria-label="Undo and redo">
                <button
                  class="history-button"
                  type="button"
                  aria-label="Undo"
                  title="Undo"
                  ?disabled=${!this.undoState.canUndo || aiReviewPending || historyPreviewPending}
                  @click=${() => this.handleTopButtonClick("Undo")}
                >
                  <span class="history-icon" aria-hidden="true">${ribbonIcon("Undo")}</span>
                </button>
                <button
                  class="history-button"
                  type="button"
                  aria-label="Redo"
                  title="Redo"
                  ?disabled=${!this.undoState.canRedo || aiReviewPending || historyPreviewPending}
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
        ${guard(this.aiChatRenderDependencies, () => when(!this.settings.disableAI, () => this.renderAIChat(false)))}
        ${this.renderDocumentDialogs()}
        <ribbon-menu
          id="ribbon-file-menu"
          .groups=${this.liveSessionActive ? [] : when(this.menuOpen, () => this.fileMenuGroups(), () => noChange)}
          @ribbon-button-click=${this.handleFileMenuAction}
          @keydown=${(event: KeyboardEvent) => {
            if(event.key !== "Escape") return
            event.stopPropagation()
            this.dismissCollapsedMenu()
            this.renderRoot.querySelector('ribbon-tab[label="File"]')?.shadowRoot?.querySelector<HTMLButtonElement>("button")?.focus()
          }}
          ?hidden=${!this.menuOpen || this.liveSessionActive}
          ?inert=${aiReviewPending || historyPreviewPending || this.liveSessionActive}
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
