import { LitElement, css, html, nothing } from "lit"
import {ref} from "lit/directives/ref.js"
import {emptyVersionHistoryState, type CommentState, type ElementStyleState, type FigureSelectionState, type HeadingGroupSelectionState, type ListSelectionState, type ListType, type PresenceUser, type VersionHistoryState} from "../editor-bridge"
import {
  completeAIConversation,
  type AIAttachment,
  type AIConversationMessage,
  type AIDocumentToolCall,
  type AIDocumentToolHandler,
  type AIEffort,
} from "../ai-client"
import {AIProviderStore, type AIProviderConfig} from "../ai-provider"
import type {BackendClient} from "../backend-client"
import {
  backgroundColorOptions,
  fontFamilyOptions,
  fontSizeOptions,
  markAttributeOptionsFor,
  markShortcutLabel,
  mergedMarkGroupFor,
  primaryDrawerMarkNames,
  primaryMarkOptions,
  secondaryMarkOptions,
  textColorOptions,
  type MarkAttributeOption,
  type MarkAttributeValues,
  type MarkName,
  type MarkOption,
  type StyleMarkValues,
} from "../marks"
import { ribbonIcon } from "../ribbon-icons"
import {isOnApple} from "../utility"
import {
  appCommands,
  defaultAppSettings,
  formatShortcut,
  persistAppSettings,
  type AppSettings,
} from "../app-settings"
import {
  insertionMenuItems,
} from "./insertion-menu"
import type {WebWriterPackage} from "../packages"
import {packageAction, packageMemberAction, packageToggleAction} from "../packages"
import {packageKeywordPresentations} from "../package-keywords"
import { type RibbonButton, type RibbonButtonDetails } from "./ribbon-button"
import "./ribbon-button"
import type {QRCodeElement} from "./qr-code"
import "./ribbon-combobox"
import {type RibbonDrawer} from "./ribbon-drawer"
import "./ribbon-drawer"
import { type RibbonMenu, type RibbonMenuButton, type RibbonMenuGroup } from "./ribbon-menu"
import "./ribbon-menu"
import "./ribbon-tab"
import "./package-search"
import type {AISettingsDialog} from "./ai-settings"
import "./ai-settings"
import {
  mediaAttributeOptions,
  isWebsiteType,
  timedMediaResourceAttributeOptions,
  websiteTypes,
  type MediaAttributeOption,
  type MediaSelectionState,
  type MediaType,
  type TimedMediaResourceState,
  type TimedMediaResourceType,
} from "../media"
import type {TableSelectionState} from "../table"
import {
  formAttributeOptions,
  type FormAttributeOption,
  type FormElementType,
  type FormSelectionState,
} from "../form"
import {dialogClosedByValues, type DialogSelectionState} from "../dialog"
import {
  graphicShapeOptions,
  type GraphicLayerOperation,
  type GraphicSelectionState,
  type GraphicViewportOperation,
} from "../graphic"
import {emptyDocumentHeadState, type DocumentHeadState} from "../document-head"
import {elementStyleCategories, type ElementStyleCategory} from "../element-styles"
import {
  aiEfforts,
  dropdownMenus,
  graphicAlignButtons,
  graphicDistributeButtons,
  graphicOrderButtons,
  listInsertionOptions,
  menuGroups,
  menuTabs,
  orderedListStyles,
  placeholderSharingLink,
  storageLocations,
  type RibbonMenuName,
  type StorageLocation,
} from "./ribbon-menu-config"
import "./document-head-editor"
import "./element-style-editor"
import "./settings-panel"
import {sectionOptions, type SectionName} from "../sections"
import type {ElementAttributeState} from "../element-attributes"
import "./element-attribute-editor"

export type LiveLearnerRibbonItem = {
  id: string
  name: string
  initials: string
  color: string
  connected: boolean
  enabled: boolean
}

type RibbonInputEventDetail = {
  input: HTMLElement
  relatedTarget?: EventTarget | null
  relatedTargetIsInput?: boolean
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
  html: string
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
export type AIEditReviewHandler = (action: AIEditReviewAction, call: AIDocumentToolCall) => Promise<unknown>

const isRibbonInput = (target: EventTarget | null): target is HTMLElement => {
  if(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true
  }
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.getAttribute("contenteditable") !== null && target.getAttribute("contenteditable") !== "false" ||
    target.getAttribute("role") === "textbox"
  )
}

const ribbonInputFromEvent = (event: Event) => event.composedPath().find(isRibbonInput)

/** The editor's tabbed, responsive ribbon toolbar. */
export class AppRibbon extends LitElement {
  static properties = {
    activeMenu: {type: String, attribute: "active-menu"},
    expanded: {type: Boolean, reflect: true},
    menuOpen: {type: Boolean, reflect: true},
    logoUrl: {type: String, attribute: "logo-url"},
    canMark: {type: Boolean, attribute: "can-mark"},
    canSection: {type: Boolean, attribute: "can-section"},
    sectionType: {type: String, attribute: "section-type"},
    sectionActive: {type: Boolean, attribute: "section-active"},
    sectionSelected: {type: Boolean, attribute: "section-selected"},
    marks: {attribute: false},
    markStyles: {attribute: false},
    markAttributes: {attribute: false},
    commentState: {attribute: false},
    commentDraft: {type: String, state: true},
    presenceUsers: {attribute: false},
    packages: {attribute: false},
    installedPackages: {attribute: false},
    packagesLoading: {type: Boolean, attribute: "packages-loading"},
    busyPackageNames: {attribute: false},
    packageError: {type: String, attribute: "package-error"},
    localPackages: {attribute: false},
    localPackagesLoading: {type: Boolean, attribute: "local-packages-loading"},
    localPackageError: {type: String, attribute: "local-package-error"},
    selectedLocalPackageName: {type: String, attribute: "selected-local-package-name"},
    selectedLocalPackageAutoReload: {type: Boolean, attribute: "selected-local-package-auto-reload"},
    packageSearchQuery: {type: String, state: true},
    packageDrawerOpen: {type: Boolean, reflect: true, attribute: "package-drawer-open"},
    packageVisibleCount: {type: Number, state: true},
    listType: {type: String, attribute: "list-type"},
    listStyle: {type: String, attribute: "list-style"},
    orderedList: {attribute: false},
    headingGroup: {attribute: false},
    figure: {attribute: false},
    media: {attribute: false},
    form: {attribute: false},
    dialog: {attribute: false},
    table: {attribute: false},
    graphic: {attribute: false},
    elementStyle: {attribute: false},
    elementAttributes: {attribute: false},
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
    documentHead: {attribute: false},
    documentHeadDrawerOpen: {type: Boolean, state: true},
    documentHeadAttributeEditorId: {type: String, state: true},
    previewActive: {type: Boolean, attribute: "preview-active"},
    previewTransitioning: {type: Boolean, attribute: "preview-transition", reflect: true},
    liveSessionActive: {type: Boolean, attribute: "live-session-active"},
    liveSessionRole: {type: String, attribute: "live-session-role"},
    liveSessionLink: {type: String, attribute: "live-session-link"},
    liveLearners: {attribute: false},
    storageLocation: {type: String, state: true},
    linkAttributeMenuOpen: {type: Boolean, state: true},
    aiPrompt: {type: String, state: true},
    aiChatOpen: {type: Boolean, state: true},
    aiChatTransitioning: {type: Boolean, state: true},
    aiChats: {attribute: false, state: true},
    activeAIChatId: {type: String, state: true},
    aiModel: {type: String, state: true},
    aiEffort: {type: String, state: true},
    aiProviders: {attribute: false, state: true},
    aiAttachments: {attribute: false, state: true},
    aiBusy: {type: Boolean, state: true},
    aiError: {type: String, state: true},
    pendingAIEdit: {attribute: false, state: true},
    aiDocumentToolHandler: {attribute: false},
    aiEditReviewHandler: {attribute: false},
    backendClient: {attribute: false},
    backendState: {type: String, attribute: "backend-state"},
    historyState: {attribute: false},
    historyLoading: {type: Boolean, attribute: "history-loading"},
    historyError: {type: String, attribute: "history-error"},
    settings: {attribute: false},
  }

  static styles = css`
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
      transition:
        height 180ms ease,
        max-height 180ms ease;
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
      transition: background-color 180ms ease;
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

    .brand[active]::before,
    .brand[active]::after,
    .brand:hover::before,
    .brand:hover::after {
      content: "";
      position: absolute;
      left: 25px;
      width: 0;
      height: 0;
      pointer-events: none;
      transform: translateX(-50%);
    }

    .brand[active]::before {
      bottom: -1px;
      border-right: 8px solid transparent;
      border-bottom: 8px solid var(--ribbon-area-border);
      border-left: 8px solid transparent;
    }

    .brand[active]::after {
      bottom: -1px;
      border-right: 7px solid transparent;
      border-bottom: 7px solid var(--ribbon-area-background);
      border-left: 7px solid transparent;
    }

    .brand:hover {
      background: transparent;
    }

    .brand:hover::before {
      bottom: -1px;
      border-right: 8px solid transparent;
      border-bottom: 8px solid #e8eef5;
      border-left: 8px solid transparent;
    }

    .brand:hover::after {
      bottom: -1px;
      border-right: 7px solid transparent;
      border-bottom: 7px solid var(--ribbon-area-background);
      border-left: 7px solid transparent;
    }

    .brand:hover .brand-logo {
      opacity: 0.8;
    }

    :host(:not([expanded])) .brand::before,
    :host(:not([expanded])) .brand::after,
    :host([preview-transition]) .brand::before,
    :host([preview-transition]) .brand::after {
      display: none;
    }

    .brand:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
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
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      --ribbon-active-tab-background: #f2f2f2;
      --ribbon-active-tab-border: #d8dee6;
    }

    :host(:not([expanded])) .tabs {
      --ribbon-active-tab-background: #ffffff;
      --ribbon-active-tab-border: #a8a8a8;
    }

    .tabs::-webkit-scrollbar {
      height: 0.2rem;
    }

    .tabs::-webkit-scrollbar-thumb {
      background: #c4ccd6;
      border-radius: 1rem;
    }

    .tabs > ribbon-tab[active] {
      anchor-name: --active-ribbon-tab;
    }

    .file-quick-actions {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      align-self: flex-start;
      gap: 0.1rem;
      height: 40px;
      padding: 0 0.2rem;
    }

    ribbon-button.file-quick-action {
      flex: 0 0 1.75rem;
      min-width: 1.75rem;
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

    .ai-prompt-input {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      height: 100%;
      min-height: 0;
      padding: 2px 43px 2px 1.7rem;
      border: 0;
      outline: 0;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.75rem;
      line-height: 16px;
      overflow: hidden;
      resize: none;
      transition:
        min-height 220ms ease,
        padding 220ms ease,
        border-color 220ms ease,
        border-radius 220ms ease;
    }

    .ai-prompt-input::placeholder {
      color: #7d8998;
    }

    .ai-prompt-submit,
    .ai-prompt-expand {
      box-sizing: border-box;
      display: grid;
      position: absolute;
      z-index: 2;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 3px;
      border: 0;
      border-radius: 50%;
      color: #ffffff;
      background: #3977c7;
      cursor: pointer;
      transition: background-color 120ms ease, color 120ms ease;
    }

    .ai-prompt-submit {
      right: 22px;
      bottom: 1px;
    }

    .ai-prompt-expand {
      right: 2px;
      bottom: 1px;
      padding: 0;
      color: #526b86;
      background: transparent;
    }

    .ai-prompt-submit:hover {
      background: #1e4f87;
    }

    .ai-prompt-expand:hover {
      color: #1e4f87;
      background: #e8eef5;
    }

    .ai-prompt-submit:focus-visible,
    .ai-prompt-expand:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 2px;
    }

    .ai-prompt-submit:disabled {
      color: #7d8998;
      background: #e0e5eb;
      cursor: default;
    }

    .ai-prompt-submit svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ai-prompt-expand-chevron {
      display: block;
      width: 0.32rem;
      height: 0.32rem;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: translateY(-1px) rotate(45deg);
      transition: transform 120ms ease;
    }

    .ai-prompt-expand[aria-expanded="true"] .ai-prompt-expand-chevron {
      transform: translateY(1px) rotate(225deg);
    }

    .ai-chat-panel {
      box-sizing: border-box;
      display: block;
      position: absolute;
      z-index: 10;
      top: 8px;
      right: 7rem;
      width: min(600px, calc(100vw - 1rem));
      min-width: 24px;
      max-width: 600px;
      height: min(32rem, calc(100vh - 1rem));
      max-height: var(--ribbon-compact-bar-height);
      overflow: hidden;
      border: 1px solid #c8d2df;
      border-radius: 1rem;
      color: #2f3742;
      background: #ffffff;
      box-shadow: 0 0 0 rgb(0 0 0 / 0%);
      container-type: inline-size;
      transition: border-color 120ms ease;
    }

    .ai-chat-panel[data-transitioning] {
      transition:
        width 220ms ease,
        min-width 220ms ease,
        right 220ms ease,
        max-height 220ms ease,
        border-color 120ms ease,
        border-radius 220ms ease,
        box-shadow 220ms ease;
    }

    .ai-chat-panel:hover,
    .ai-chat-panel:focus-within {
      border-color: #3977c7;
    }

    .ai-chat-panel:focus-within {
      box-shadow: 0 0 0 1px #3977c7;
    }

    .ai-chat-panel[data-open] {
      min-width: 400px;
      max-height: min(32rem, calc(100vh - 1rem));
      border-color: #a8b4c2;
      border-radius: 0.65rem;
      box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 20%);
    }

    .ai-chat-panel[hidden] {
      display: none;
    }

    @container (max-width: 124px) {
      .ai-chat-panel:not([data-open]) .ai-chat-composer {
        visibility: hidden;
        opacity: 0;
        pointer-events: none;
      }
    }

    @supports (top: anchor(top)) {
      .ai-chat-panel {
        position-anchor: --ai-bar-slot;
        top: calc(anchor(top) + 8px);
        right: anchor(right);
        left: auto;
        width: anchor-size(width);
      }

      .ai-chat-panel[data-open] {
        width: clamp(400px, anchor-size(width), 600px);
      }
    }

    @media (max-width: 34rem) {
      .ai-chat-panel[data-open] {
        right: 0.5rem;
      }
    }

    @media (max-width: 26rem) {
      .ai-chat-panel[data-open] {
        width: calc(100vw - 1rem);
        min-width: calc(100vw - 1rem);
      }
    }

    .ai-chat-brand-button {
      box-sizing: border-box;
      display: grid;
      position: absolute;
      z-index: 3;
      top: 1px;
      left: 2px;
      place-items: center;
      width: 20px;
      height: 20px;
      padding: 2px;
      border: 0;
      border-radius: 50%;
      color: #3977c7;
      background: transparent;
      cursor: pointer;
      transition:
        top 220ms ease,
        left 220ms ease,
        width 220ms ease,
        height 220ms ease,
        background-color 120ms ease;
    }

    .ai-chat-brand-button:hover {
      color: #1e4f87;
      background: #e8eef5;
    }

    .ai-chat-brand-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .ai-chat-brand-icon,
    .ai-chat-brand-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ai-chat-panel[data-open] .ai-chat-brand-button {
      top: 0.55rem;
      left: 0.55rem;
      width: 2rem;
      height: 2rem;
      padding: 0.4rem;
      border: 0;
      border-radius: 50%;
      background: transparent;
    }

    .ai-chat-header {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      top: 0;
      right: 0;
      left: 0;
      align-items: center;
      gap: 0.4rem;
      height: 3.25rem;
      min-width: 0;
      padding: 0.55rem 0.55rem 0.55rem 3rem;
      border-bottom: 1px solid #d8dee6;
      background: #f7f9fb;
      opacity: 0;
      pointer-events: none;
      transform: translateY(-0.5rem);
      transition: opacity 150ms ease, transform 220ms ease;
    }

    .ai-chat-panel[data-open] .ai-chat-header {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .ai-chat-switcher {
      box-sizing: border-box;
      flex: 1 1 auto;
      min-width: 0;
      height: 2rem;
      appearance: none;
      padding: 0 2.35rem 0 0.55rem;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      color: #2f3742;
      background: #ffffff;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='m4 6 4 4 4-4' stroke='%23526b86' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-position: right 0.75rem center;
      background-repeat: no-repeat;
      background-size: 1rem;
      font: inherit;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ai-chat-switcher:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .ai-chat-header-button {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      height: 2rem;
      padding: 0 0.55rem;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      color: #526b86;
      background: #ffffff;
      font: inherit;
      font-size: 0.68rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ai-chat-header-button:hover {
      color: #1e4f87;
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .ai-chat-header-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .ai-chat-header-button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ai-chat-new-icon,
    .ai-chat-new-icon svg,
    .ai-chat-settings-icon,
    .ai-chat-settings-icon svg {
      display: block;
      width: 0.9rem;
      height: 0.9rem;
    }

    .ai-chat-messages {
      display: flex;
      flex-direction: column;
      position: absolute;
      top: 3.25rem;
      right: 0;
      bottom: 7rem;
      left: 0;
      gap: 0.75rem;
      min-height: 0;
      overflow: auto;
      padding: 1rem;
      scrollbar-width: thin;
      background: #ffffff;
      opacity: 0;
      pointer-events: none;
      transition: opacity 140ms ease 40ms;
    }

    .ai-chat-panel[data-open] .ai-chat-messages {
      opacity: 1;
      pointer-events: auto;
    }

    .ai-chat-empty {
      display: grid;
      flex: 1 1 auto;
      place-items: center;
      min-height: 8rem;
      color: #7d8998;
      font-size: 0.75rem;
      text-align: center;
    }

    .ai-chat-message {
      box-sizing: border-box;
      max-width: 85%;
      padding: 0.55rem 0.7rem;
      border: 1px solid #d8dee6;
      border-radius: 0.65rem;
      color: #2f3742;
      background: #f5f7fa;
      font-size: 0.76rem;
      line-height: 1.35;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .ai-chat-message[data-role="user"] {
      align-self: flex-end;
      color: #163f70;
      border-color: #bdd5ef;
      background: #eaf3fd;
      border-bottom-right-radius: 0.2rem;
    }

    .ai-chat-message[data-role="assistant"] {
      align-self: flex-start;
      border-bottom-left-radius: 0.2rem;
    }

    .ai-chat-message[data-role="event"] {
      align-self: stretch;
      max-width: none;
      color: #4c1d95;
      border-color: #c4b5fd;
      background: #faf5ff;
    }

    .ai-chat-message-role {
      display: block;
      margin-bottom: 0.25rem;
      color: #667085;
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .ai-message-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.45rem;
    }

    .ai-message-attachment {
      max-width: 12rem;
      overflow: hidden;
      padding: 0.15rem 0.35rem;
      border-radius: 999px;
      color: #526b86;
      background: rgb(255 255 255 / 68%);
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ai-chat-error,
    .ai-edit-approval {
      align-self: stretch;
      padding: 0.65rem 0.75rem;
      border: 1px solid #fecaca;
      border-radius: 0.55rem;
      color: #991b1b;
      background: #fef2f2;
      font-size: 0.72rem;
      line-height: 1.4;
    }

    .ai-edit-approval {
      border-color: #facc15;
      color: #713f12;
      background: #fefce8;
    }

    .ai-edit-approval strong,
    .ai-edit-approval span {
      display: block;
    }

    .ai-edit-preview {
      margin: 0.5rem 0;
    }

    .ai-edit-preview summary {
      cursor: pointer;
      font-weight: 600;
    }

    .ai-edit-preview pre {
      max-height: 10rem;
      overflow: auto;
      margin: 0.4rem 0 0;
      padding: 0.5rem;
      border-radius: 0.35rem;
      color: #334155;
      background: #ffffff;
      font: 0.65rem/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
      white-space: pre-wrap;
    }

    .ai-edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.4rem;
      margin-top: 0.55rem;
    }

    .ai-edit-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      min-height: 1.8rem;
      padding: 0.25rem 0.55rem;
      border: 1px solid #d6a80d;
      border-radius: 0.35rem;
      color: #713f12;
      background: #ffffff;
      font: inherit;
      font-size: 0.68rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ai-edit-action[data-kind="approve"] {
      border-color: #2563eb;
      color: #ffffff;
      background: #2563eb;
    }

    .ai-edit-action[data-kind="undo"] {
      border-color: #7c3aed;
      color: #ffffff;
      background: #7c3aed;
    }

    .ai-edit-action svg {
      width: 0.85rem;
      height: 0.85rem;
    }

    .ai-edit-action:disabled {
      opacity: 0.55;
      cursor: default;
    }

    .ai-chat-working {
      align-self: flex-start;
      color: #64748b;
      font-size: 0.68rem;
    }

    .ai-prompt-review-actions {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      z-index: 2;
      right: 22px;
      bottom: 1px;
      gap: 2px;
      height: 18px;
    }

    .ai-prompt-review-action {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 2px;
      border: 0;
      border-radius: 50%;
      color: #6b21a8;
      background: transparent;
      cursor: pointer;
    }

    .ai-prompt-review-action[data-kind="approve"] {
      color: #ffffff;
      background: #7c3aed;
    }

    .ai-prompt-review-action:hover,
    .ai-prompt-review-action:focus-visible {
      background: #ede9fe;
      outline: none;
    }

    .ai-prompt-review-action[data-kind="approve"]:hover,
    .ai-prompt-review-action[data-kind="approve"]:focus-visible {
      background: #6d28d9;
    }

    .ai-prompt-review-action:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ai-prompt-review-action svg {
      width: 100%;
      height: 100%;
    }

    .ai-composer-surface[data-review-pending] .ai-prompt-input {
      padding-right: 82px;
      color: #6b21a8;
      background: #faf5ff;
    }

    .ai-chat-composer {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      align-items: center;
      height: 22px;
      padding: 0;
      border-top: 0 solid transparent;
      background: #ffffff;
      visibility: visible;
      opacity: 1;
      transition:
        height 220ms ease,
        padding 220ms ease,
        border-color 220ms ease,
        background-color 220ms ease,
        visibility 120ms ease,
        opacity 120ms ease;
    }

    .ai-chat-panel[data-open] .ai-chat-composer {
      align-items: stretch;
      height: 7rem;
      padding: 0.65rem 2.35rem 0.65rem 0.65rem;
      border-top-width: 1px;
      border-top-color: #d8dee6;
      background: #f7f9fb;
    }

    .ai-composer-surface {
      box-sizing: border-box;
      display: flex;
      flex: 1 1 auto;
      position: relative;
      min-width: 0;
      height: 100%;
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: 0.5rem;
      background: transparent;
      transition: border-color 220ms ease, background-color 220ms ease;
    }

    .ai-chat-panel[data-open] .ai-composer-surface {
      border: 1px solid #c8d2df;
      background: #ffffff;
    }

    .ai-chat-panel[data-open] .ai-composer-surface:focus-within {
      border-color: #3977c7;
      box-shadow: 0 0 0 1px #3977c7;
    }

    .ai-chat-panel[data-open] .ai-prompt-input {
      padding: 0.55rem 0.65rem 2.2rem;
      line-height: 1.35;
      overflow: auto;
    }

    .ai-chat-panel[data-open] .ai-composer-surface[data-has-attachments] .ai-prompt-input {
      padding-top: 2.15rem;
    }

    .ai-chat-panel[data-open] .ai-prompt-submit {
      right: 0.35rem;
      bottom: 0.35rem;
      width: 18px;
      height: 18px;
      padding: 3px;
    }

    .ai-chat-panel[data-open] .ai-prompt-expand {
      right: 0.35rem;
      bottom: 0.75rem;
    }

    .ai-composer-toolbar {
      box-sizing: border-box;
      display: flex;
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      align-items: center;
      gap: 0.2rem;
      height: 1.9rem;
      min-width: 0;
      padding: 0.2rem 1.9rem 0.25rem 0.35rem;
      opacity: 0;
      pointer-events: none;
      transform: translateY(0.25rem);
      transition: opacity 140ms ease 40ms, transform 220ms ease;
    }

    .ai-pending-attachments {
      display: flex;
      position: absolute;
      top: 0.25rem;
      right: 0.3rem;
      left: 0.3rem;
      gap: 0.25rem;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: thin;
      z-index: 1;
    }

    .ai-pending-attachment {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      max-width: 11rem;
      height: 1.45rem;
      padding: 0 0.15rem 0 0.4rem;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      color: #475569;
      background: #f8fafc;
      font-size: 0.62rem;
    }

    .ai-pending-attachment-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ai-attachment-remove {
      display: grid;
      flex: 0 0 1.1rem;
      place-items: center;
      width: 1.1rem;
      height: 1.1rem;
      margin-left: 0.15rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: #64748b;
      background: transparent;
      font: inherit;
      cursor: pointer;
    }

    .ai-attachment-remove:hover,
    .ai-attachment-remove:focus-visible {
      color: #0f172a;
      background: #e2e8f0;
      outline: none;
    }

    .ai-attachment-input {
      display: none;
    }

    .ai-chat-panel[data-open] .ai-composer-toolbar {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }

    .ai-composer-attachment {
      box-sizing: border-box;
      display: grid;
      flex: 0 0 1.45rem;
      place-items: center;
      width: 1.45rem;
      height: 1.45rem;
      padding: 0.25rem;
      border: 0;
      border-radius: 0.3rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
    }

    .ai-composer-attachment:hover {
      color: #1e4f87;
      background: #e8eef5;
    }

    .ai-composer-attachment:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 0;
    }

    .ai-composer-attachment:disabled,
    .ai-composer-select:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ai-composer-attachment-icon,
    .ai-composer-attachment-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .ai-composer-select {
      box-sizing: border-box;
      flex: 0 1 auto;
      min-width: 0;
      max-width: 8rem;
      height: 1.45rem;
      padding: 0 1.15rem 0 0.3rem;
      border: 0;
      border-radius: 0.3rem;
      color: #526b86;
      background: transparent;
      font: inherit;
      font-size: 0.62rem;
      cursor: pointer;
    }

    .ai-composer-model-control {
      display: flex;
      position: relative;
      flex: 0 1 auto;
      min-width: 0;
      max-width: 8rem;
    }

    .ai-composer-selects {
      display: flex;
      flex: 0 1 auto;
      align-items: center;
      gap: 0.2rem;
      min-width: 0;
      margin-left: auto;
    }

    .ai-composer-model-control .ai-composer-select {
      width: 100%;
      max-width: none;
      appearance: none;
      color: transparent;
    }

    .ai-composer-model-control::after {
      box-sizing: border-box;
      display: block;
      position: absolute;
      top: 50%;
      right: 0.35rem;
      width: 0.32rem;
      height: 0.32rem;
      border-right: 1.5px solid #526b86;
      border-bottom: 1.5px solid #526b86;
      content: "";
      pointer-events: none;
      transform: translateY(-65%) rotate(45deg);
    }

    .ai-composer-model-control .ai-composer-select option {
      color: #526b86;
    }

    .ai-composer-model-label {
      display: flex;
      position: absolute;
      inset: 0 1.15rem 0 0.3rem;
      align-items: center;
      overflow: hidden;
      color: #526b86;
      font: inherit;
      font-size: 0.62rem;
      pointer-events: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ai-composer-model-control[data-disabled] .ai-composer-model-label {
      opacity: 0.5;
    }

    .ai-composer-model-control[data-disabled]::after {
      opacity: 0.5;
    }

    .ai-composer-select[data-kind="effort"] {
      max-width: 7rem;
    }

    .ai-composer-select:focus {
      outline: 1px solid #3977c7;
    }

    .ai-stop-icon {
      display: block;
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 0.08rem;
      background: currentColor;
    }

    @media (max-width: 42rem) {
      .ai-chat-header-button-label {
        display: none;
      }

      .ai-chat-header-button {
        width: 2rem;
        padding: 0;
      }
    }

    @media (max-width: 28rem) {
      .ribbon-top {
        gap: 0;
      }

      .ai-chat-header {
        gap: 0.25rem;
      }

      .ai-chat-header-button,
      .ai-chat-panel[data-open] .ai-chat-brand-button {
        width: 1.75rem;
        height: 1.75rem;
      }

      .ai-chat-switcher {
        height: 1.75rem;
      }

      .ai-composer-toolbar {
        gap: 0.1rem;
      }
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
      }
    }

    .ribbon-toggle {
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

    .history-controls .history-tab-button {
      position: relative;
      flex-basis: 1.2rem;
      width: 1.2rem;
      height: 1.2rem;
      margin: 0 0.1rem;
      border-radius: 50%;
      color: #5e6977;
      background: transparent;
    }

    .history-tab-button[active] {
      color: #3977c7;
      background: transparent;
      box-shadow: none;
    }

    .history-tab-button[active]::before,
    .history-tab-button[active]::after {
      position: absolute;
      left: 50%;
      bottom: -0.65rem;
      width: 0;
      height: 0;
      border-right: 0.45rem solid transparent;
      border-bottom: 0.45rem solid var(--ribbon-area-border);
      border-left: 0.45rem solid transparent;
      content: "";
      pointer-events: none;
      transform: translateX(-50%);
    }

    .history-tab-button[active]::after {
      bottom: -0.67rem;
      z-index: 1;
      border-right-width: 0.4rem;
      border-bottom: 0.4rem solid var(--ribbon-area-background);
      border-left-width: 0.4rem;
    }

    .ribbon-top-actions {
      display: flex;
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
      flex: 0 0 2rem;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      width: 2rem;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 0.35rem;
      color: #5e6977;
      background: transparent;
      cursor: pointer;
    }

    .preview-button[active] {
      flex-basis: auto;
      position: relative;
      width: auto;
      padding-inline: 0.35rem;
      color: #1e4f87;
      background: #dcecff;
      box-shadow: inset 0 0 0 1px rgb(57 119 199 / 12%);
    }

    .preview-button[active]::before,
    .preview-button[active]::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -1px;
      width: 0;
      height: 0;
      pointer-events: none;
      transform: translateX(-50%);
    }

    .preview-button[active]::before {
      border-right: 8px solid transparent;
      border-bottom: 8px solid var(--ribbon-area-border);
      border-left: 8px solid transparent;
    }

    .preview-button[active]::after {
      z-index: 1;
      border-right: 7px solid transparent;
      border-bottom: 7px solid var(--ribbon-area-background);
      border-left: 7px solid transparent;
    }

    :host(:not([expanded])) .preview-button[active]::before,
    :host(:not([expanded])) .preview-button[active]::after,
    :host([preview-transition]) .preview-button[active]::before,
    :host([preview-transition]) .preview-button[active]::after {
      display: none;
    }

    .preview-button:hover {
      color: #243447;
      background: #e8eef5;
    }

    .preview-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .preview-label {
      display: block;
      flex: 0 0 auto;
      margin: 0;
      color: #1e4f87;
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1;
    }

    .learners-summary {
      display: flex;
      grid-row: 1 / -1;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      padding: 0 0.3rem;
      color: #526b86;
      font-size: 0.68rem;
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

    .history-controls .history-tab-button:hover {
      color: #243447;
      background: transparent;
    }

    .history-controls .history-tab-button[active]:hover {
      color: #1e4f87;
      background: transparent;
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

    .history-tab-button .history-icon {
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

    .ribbon-toggle:hover {
      color: #243447;
      background: #e8eef5;
    }

    .ribbon-toggle:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .ribbon-toggle:disabled {
      color: #9aa4b1;
      background: transparent;
      cursor: default;
      opacity: 0.55;
    }

    .chevron {
      display: block;
      width: 0.45rem;
      height: 0.45rem;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      transform: rotate(225deg);
      transition: transform 120ms ease;
    }

    :host(:not([expanded])) .chevron {
      transform: rotate(45deg);
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

    .history-timeline {
      box-sizing: border-box;
      display: flex;
      grid-row: 1 / 3;
      grid-column: 1 / -1;
      align-self: stretch;
      align-items: stretch;
      gap: 0.35rem;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.35rem 0;
      scrollbar-color: #aab6c5 transparent;
      scrollbar-width: thin;
    }

    .history-version-card {
      box-sizing: border-box;
      display: grid;
      flex: 0 0 9rem;
      grid-template-rows: minmax(0, 1fr) 1.35rem;
      height: 100%;
      min-width: 0;
      overflow: hidden;
      border: 1px solid #c8d2df;
      border-radius: 0.45rem;
      color: #2f3742;
      background: #ffffff;
    }

    .history-version-card:hover {
      border-color: #8eb6df;
      background: #eef4fb;
    }

    .history-version-card[data-selected] {
      border-color: #3977c7;
      background: #dcecff;
      box-shadow: inset 0 0 0 1px rgb(57 119 199 / 12%);
    }

    .history-version-card[data-after-current] {
      border-color: #d3d8df;
      color: #7a818b;
      background: #eef0f2;
      filter: grayscale(0.8);
      opacity: 0.55;
    }

    .history-version-card[data-after-current]:hover,
    .history-version-card[data-after-current][data-selected] {
      border-color: #aeb6c1;
      background: #e5e8ec;
      opacity: 0.72;
    }

    .history-checkpoint {
      box-sizing: border-box;
      display: grid;
      grid-template-columns: 1.35rem minmax(0, 1fr);
      grid-template-rows: auto auto 1fr;
      column-gap: 0.35rem;
      align-content: center;
      width: 100%;
      min-width: 0;
      min-height: 0;
      padding: 0.3rem 0.45rem 0.2rem;
      overflow: hidden;
      border: 0;
      color: #2f3742;
      background: transparent;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .history-checkpoint:focus-visible,
    .history-card-restore-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
    }

    .history-checkpoint-avatar {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      border: 2px solid #ffffff;
      border-radius: 50%;
      color: #ffffff;
      background: var(--history-user-color, #64748b);
      box-shadow: 0 1px 3px rgb(0 0 0 / 18%);
      font-weight: 750;
      line-height: 1;
      grid-row: 1 / 3;
      width: 1.35rem;
      height: 1.35rem;
      font-size: 0.46rem;
    }

    .history-checkpoint-label {
      overflow: hidden;
      font-size: 0.64rem;
      font-weight: 700;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-checkpoint-meta {
      overflow: hidden;
      color: #667085;
      font-size: 0.56rem;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-checkpoint-counts {
      display: flex;
      grid-column: 1 / 3;
      align-items: end;
      gap: 0.25rem;
      min-width: 0;
      padding-top: 0.2rem;
      color: #667085;
      font-size: 0.54rem;
      font-weight: 700;
      line-height: 1;
    }

    .history-count[data-kind="added"] { color: #157347; }
    .history-count[data-kind="removed"] { color: #b42336; }
    .history-count[data-kind="modified"] { color: #9a6700; }
    .history-count[data-kind="comments"] { margin-left: auto; color: #526b86; }

    .history-empty,
    .history-loading,
    .history-error {
      display: grid;
      flex: 1 0 100%;
      place-items: center;
      min-width: 12rem;
      padding: 0.5rem;
      color: #667085;
      font-size: 0.68rem;
      text-align: center;
    }

    .history-error {
      color: #b42336;
    }

    .history-card-restore-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      width: 100%;
      min-height: 0;
      padding: 0.15rem 0.35rem;
      border: 0;
      border-top: 1px solid #d8dee6;
      color: #526b86;
      background: rgb(255 255 255 / 55%);
      font: inherit;
      font-size: 0.56rem;
      font-weight: 700;
      cursor: pointer;
    }

    .history-card-restore-button:hover:not(:disabled) {
      color: #1e4f87;
      background: #ffffff;
    }

    .history-card-restore-button:disabled {
      color: #9aa4b1;
      cursor: default;
      opacity: 0.65;
    }

    .history-card-restore-icon,
    .history-card-restore-icon svg {
      display: block;
      flex: 0 0 0.7rem;
      width: 0.7rem;
      height: 0.7rem;
    }

    .local-packages-drawer {
      --ribbon-drawer-expanded-width: 12rem;
      flex-grow: 0;
    }

    .exports-drawer {
      --ribbon-drawer-expanded-width: 14rem;
      flex-grow: 0;
    }

    .package-status {
      align-self: center;
      padding: 0.25rem;
      color: #667085;
      font-size: 0.66rem;
      white-space: nowrap;
    }

    .local-package-select {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
      height: 1.55rem;
      padding: 0 0.25rem;
      border: 1px solid transparent;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.7rem;
      cursor: pointer;
    }

    .local-package-select:hover {
      border-color: #8eb6df;
      background: transparent;
    }

    .local-package-select:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .local-package-select:disabled {
      color: #667085;
      background: transparent;
      cursor: default;
    }

    .local-package-selection {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      width: 100%;
      min-width: 0;
    }

    .local-package-selection-icon {
      display: block;
      flex: 0 0 1rem;
      width: 1rem;
      height: 1rem;
      color: #526b86;
    }

    .local-package-selection-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .local-package-actions {
      display: flex;
      align-items: stretch;
      gap: 0.15rem;
      min-width: 0;
    }

    .local-package-actions > ribbon-button {
      flex: 1 1 0;
      min-width: 0;
    }

    .develop-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 0.15rem 0.35rem;
      min-width: 0;
      height: 100%;
      padding: 0.1rem 0.25rem;
    }

    .develop-field {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #526b86;
      font-size: 0.65rem;
      white-space: nowrap;
    }

    .develop-field span { flex: 0 0 3.6rem; }
    .develop-fields .develop-field {
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      min-width: 0;
    }

    .develop-fields .develop-field span {
      flex: 0 0 auto;
      line-height: 0.75rem;
    }

    .develop-field input[type="text"] {
      box-sizing: border-box;
      width: 8rem;
      min-width: 0;
      height: 1.45rem;
      padding: 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.25rem;
      color: #2f3742;
      background: transparent;
      font: inherit;
      font-size: 0.65rem;
    }

    .develop-fields .develop-field input[type="text"] {
      width: 100%;
      height: 1.2rem;
    }

    .develop-field input[type="text"]:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .develop-empty {
      align-self: center;
      padding: 0.25rem;
      color: #667085;
      font-size: 0.66rem;
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

    .comment-editor {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding: 0.15rem 0.2rem 0.1rem 0;
      gap: 0.15rem;
      color: #536171;
      font-size: 0.65rem;
    }

    .comment-editor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .comment-highlight-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      white-space: nowrap;
    }

    .comment-highlight-toggle input {
      margin: 0;
    }

    .comment-editor textarea {
      box-sizing: border-box;
      flex: 1 1 auto;
      width: 100%;
      min-height: 0;
      resize: none;
      padding: 0.25rem 0.35rem;
      border: 1px solid #b9c3cf;
      border-radius: 0.25rem;
      color: #26313d;
      background: #ffffff;
      font: inherit;
      font-size: 0.7rem;
      line-height: 1.25;
    }

    .comment-editor textarea:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .table-caption-toggle {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.2rem;
      min-width: 0;
      min-height: 1.75rem;
      padding: 0.05rem 0.25rem;
      border: 1px solid transparent;
      border-radius: 0.35rem;
      color: #2f3742;
      font-size: 0.6rem;
      cursor: pointer;
    }

    .table-caption-toggle:hover {
      border-color: #c8d2df;
      background: #eef4fb;
    }

    .table-caption-toggle:has(input:checked) {
      border-color: #8eb6df;
      color: #1e4f87;
      background: #dcecff;
    }

    .table-caption-toggle:has(input:disabled) {
      border-color: transparent;
      color: #9aa4b1;
      background: transparent;
      cursor: default;
      opacity: 0.55;
    }

    .table-caption-toggle > span:last-child {
      display: flex;
      align-items: center;
      gap: 0.15rem;
      white-space: nowrap;
    }

    .table-caption-toggle input {
      width: 0.75rem;
      height: 0.75rem;
      margin: 0;
      accent-color: #3977c7;
    }

    .table-caption-icon {
      display: block;
      width: 1.1rem;
      height: 1.1rem;
    }

    .table-caption-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .table-inline-controls {
      box-sizing: border-box;
      display: grid;
      grid-column: 1 / -1;
      grid-row: 1 / -1;
      align-items: end;
      gap: 0.25rem;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 100%;
      color: #2f3742;
      font-size: 0.62rem;
    }

    .table-border-controls {
      grid-template-columns: minmax(4.5rem, 1.4fr) minmax(3.25rem, 0.8fr) 2.5rem minmax(4.75rem, 1fr);
    }

    .table-background-controls {
      grid-template-columns: 2.5rem minmax(5.5rem, 1fr);
    }

    .table-parameter {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.08rem;
      min-width: 0;
    }

    .table-parameter > span {
      overflow: hidden;
      color: #526b86;
      font-size: 0.56rem;
      line-height: 0.7rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .table-parameter input,
    .table-parameter select,
    .table-clear-button {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.45rem;
      padding: 0 0.25rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.62rem;
    }

    .table-parameter input[type="color"] {
      padding: 0.1rem;
    }

    .table-clear-button {
      color: #526b86;
      cursor: pointer;
    }

    .table-parameter input:focus,
    .table-parameter select:focus,
    .table-clear-button:focus-visible {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .table-clear-button:hover {
      border-color: #8eb6df;
      color: #1e5d9d;
      background: #eef4fb;
    }

    .table-parameter input:disabled,
    .table-parameter select:disabled,
    .table-clear-button:disabled {
      color: #9aa4b1;
      background: #edf0f3;
      cursor: default;
    }

    ribbon-drawer[pane] .table-inline-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      height: auto;
    }

    .graphic-inline-controls {
      box-sizing: border-box;
      grid-column: 1 / -1;
      grid-row: 1 / -1;
      width: 100%;
      min-width: 0;
      min-height: 0;
      height: 100%;
      color: #2f3742;
      font-size: 0.66rem;
    }

    .graphic-inline-controls .graphic-parameter {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      gap: 0.08rem;
      min-width: 0;
      min-height: 0;
    }

    .graphic-inline-controls .graphic-parameter > span {
      overflow: hidden;
      color: #526b86;
      font-size: 0.56rem;
      line-height: 0.7rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .graphic-inline-controls .graphic-parameter input,
    .graphic-inline-controls .graphic-parameter select,
    .graphic-inline-controls .graphic-parameter textarea {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.35rem;
      padding: 0 0.22rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.62rem;
    }

    .graphic-inline-controls .graphic-parameter input:focus,
    .graphic-inline-controls .graphic-parameter select:focus,
    .graphic-inline-controls .graphic-parameter textarea:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .graphic-inline-controls .graphic-parameter input:disabled,
    .graphic-inline-controls .graphic-parameter select:disabled,
    .graphic-inline-controls .graphic-parameter textarea:disabled {
      color: #8b96a4;
      background: #edf0f3;
    }

    .graphic-inline-controls .graphic-parameter input[type="color"] {
      padding: 0.1rem;
    }

    .graphic-inline-controls .graphic-parameter input[type="checkbox"] {
      align-self: center;
      width: 1rem;
      height: 1rem;
      margin: 0.15rem 0 0;
      padding: 0;
      accent-color: #3977c7;
    }

    .media-toolbox-controls {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      width: 100%;
      min-width: 0;
    }

    .media-toolbox-controls .media-attribute {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.08rem;
      min-width: 0;
      color: #526b86;
      font-size: 0.56rem;
      line-height: 0.7rem;
    }

    .media-toolbox-controls .media-attribute input,
    .media-toolbox-controls .media-attribute select {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 1.55rem;
      padding: 0 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: inherit;
      font-size: 0.66rem;
    }

    .media-toolbox-controls .media-attribute input:focus,
    .media-toolbox-controls .media-attribute select:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .media-toolbox-controls .media-attribute-boolean {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      min-height: 1.55rem;
    }

    .media-toolbox-controls .media-attribute-boolean input {
      width: auto;
      height: auto;
      margin: 0;
      accent-color: #3977c7;
    }

    .media-type-switch {
      box-sizing: border-box;
      width: 100%;
      min-height: 1.55rem;
      padding: 0.25rem 0.4rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.64rem;
      cursor: pointer;
    }

    .media-type-switch:hover {
      color: #243447;
      background: #e8eef5;
    }

    .media-type-switch:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .media-resource-editor {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      padding-top: 0.35rem;
      border-top: 1px solid #d8e0e9;
    }

    .media-resource-heading,
    .media-resource-card-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem;
      color: #526b86;
      font-size: 0.64rem;
      font-weight: 600;
    }

    .media-resource-add,
    .media-resource-action {
      box-sizing: border-box;
      min-height: 1.35rem;
      padding: 0.15rem 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #526b86;
      background: #fff;
      font: inherit;
      font-size: 0.6rem;
      cursor: pointer;
    }

    .media-resource-action {
      min-width: 1.35rem;
      padding: 0.1rem 0.2rem;
    }

    .media-resource-add:hover,
    .media-resource-action:hover:not(:disabled) {
      color: #243447;
      background: #e8eef5;
    }

    .media-resource-add:focus-visible,
    .media-resource-action:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .media-resource-action:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .media-resource-card {
      display: flex;
      flex-direction: column;
      gap: 0.28rem;
      padding: 0.35rem;
      border: 1px solid #d8e0e9;
      border-radius: 0.25rem;
      background: #f7f9fb;
    }

    .media-resource-card-actions {
      display: flex;
      gap: 0.15rem;
    }

    .media-fallback-help {
      margin: -0.15rem 0 0;
      color: #6d7d8f;
      font-size: 0.56rem;
      line-height: 0.72rem;
    }

    .media-toolbox-controls .media-fallback-input {
      box-sizing: border-box;
      width: 100%;
      min-height: 3.5rem;
      resize: vertical;
      padding: 0.3rem;
      border: 1px solid #c8d2df;
      border-radius: 0.2rem;
      color: #2f3742;
      background: #fff;
      font: 0.62rem/0.8rem ui-monospace, SFMono-Regular, Consolas, monospace;
    }

    .media-toolbox-controls .media-fallback-input:focus {
      border-color: #3977c7;
      outline: 1px solid #3977c7;
    }

    .graphic-geometry-controls {
      display: grid;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-flow: column;
      grid-auto-columns: minmax(3.25rem, 1fr);
      gap: 0.12rem 0.28rem;
      align-items: stretch;
      padding: 0.08rem 0;
    }

    .graphic-text-controls {
      display: grid;
      grid-template-columns: minmax(6.5rem, 1fr) 4rem;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      gap: 0.12rem 0.35rem;
      padding: 0.08rem 0;
    }

    .graphic-text-controls .graphic-label-parameter {
      grid-row: 1 / 3;
    }

    .graphic-text-controls .graphic-label-parameter textarea {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
      padding-block: 0.18rem;
      resize: none;
    }

    .graphic-connector-controls {
      display: grid;
      grid-template-columns: minmax(5rem, 1fr) 3rem 3rem;
      gap: 0.3rem;
      align-items: center;
      padding: 0.08rem 0;
    }

    .graphic-connector-controls .graphic-boolean-parameter > span {
      text-align: center;
    }

    .graphic-arrange-controls {
      display: grid;
      grid-template-columns: auto minmax(10rem, 1fr);
      gap: 0.45rem;
      align-items: stretch;
      padding: 0.08rem 0;
    }

    .graphic-arrange-actions {
      display: grid;
      grid-template-columns: repeat(3, auto);
      gap: 0.3rem;
      align-items: center;
      min-width: 0;
    }

    .graphic-arrange-action-group {
      display: grid;
      gap: 0.08rem;
      align-content: center;
    }

    .graphic-align-actions {
      grid-template-columns: repeat(3, 1.75rem);
    }

    .graphic-distribute-actions {
      grid-template-columns: 1.75rem;
    }

    .graphic-order-actions {
      grid-template-columns: repeat(2, 1.75rem);
    }

    .graphic-layers-inline {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 0.15rem;
      min-width: 0;
      min-height: 0;
      padding-inline-start: 0.4rem;
      border-inline-start: 1px solid #d8dee6;
    }

    .graphic-layer-list {
      display: flex;
      flex-direction: column;
      gap: 0.08rem;
      min-height: 0;
      overflow: auto;
    }

    .graphic-layer-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 1.35rem 1.35rem;
      gap: 0.08rem;
      align-items: center;
      min-height: 1.4rem;
      padding: 0.03rem;
      border: 1px solid transparent;
      border-radius: 0.2rem;
    }

    .graphic-layer-row[data-selected="true"] {
      border-color: #93b8df;
      background: #eef5fc;
    }

    .graphic-layer-select,
    .graphic-layer-action,
    .graphic-layer-order {
      box-sizing: border-box;
      border: 0;
      border-radius: 0.2rem;
      color: #334155;
      background: transparent;
      font: inherit;
      cursor: pointer;
    }

    .graphic-layer-select {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      min-width: 0;
      height: 1.25rem;
      padding: 0 0.2rem;
      font-size: 0.58rem;
      text-align: left;
    }

    .graphic-layer-select span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .graphic-layer-icon,
    .graphic-layer-action {
      display: grid;
      place-items: center;
    }

    .graphic-layer-icon {
      flex: 0 0 auto;
      width: 0.75rem;
      height: 0.75rem;
    }

    .graphic-layer-icon svg,
    .graphic-layer-action svg {
      display: block;
      width: 0.75rem;
      height: 0.75rem;
    }

    .graphic-layer-action {
      width: 1.25rem;
      height: 1.25rem;
    }

    .graphic-layer-select:hover,
    .graphic-layer-action:hover,
    .graphic-layer-order:hover {
      color: #1e5d9d;
      background: #dfeefc;
    }

    .graphic-layer-select:focus-visible,
    .graphic-layer-action:focus-visible,
    .graphic-layer-order:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .graphic-layer-select:disabled,
    .graphic-layer-action:disabled,
    .graphic-layer-order:disabled {
      color: #9aa4b1;
      cursor: default;
    }

    .graphic-layer-toolbar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.12rem;
    }

    .graphic-layer-order {
      min-height: 1.25rem;
      padding: 0.05rem 0.15rem;
      border: 1px solid #c8d2df;
      background: #fff;
      font-size: 0.54rem;
    }

    .button-dropdown-empty {
      align-self: center;
      color: #64748b;
      font-size: 0.58rem;
    }

    ribbon-drawer[pane] .graphic-inline-controls {
      grid-row: auto;
      height: auto;
    }

    ribbon-drawer[pane] .graphic-geometry-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      grid-auto-flow: row;
      grid-auto-columns: auto;
      grid-auto-rows: minmax(2.25rem, auto);
      gap: 0.2rem 0.35rem;
    }

    ribbon-drawer[pane] .graphic-text-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: none;
      grid-auto-rows: minmax(2.25rem, auto);
      gap: 0.2rem 0.35rem;
    }

    ribbon-drawer[pane] .graphic-text-controls .graphic-label-parameter {
      grid-column: 1 / -1;
      grid-row: auto;
      min-height: 4rem;
    }

    ribbon-drawer[pane] .graphic-connector-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.25rem 0.35rem;
    }

    ribbon-drawer[pane] .graphic-connector-controls .graphic-parameter:first-child {
      grid-column: 1 / -1;
    }

    ribbon-drawer[pane] .graphic-arrange-controls {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.4rem;
    }

    ribbon-drawer[pane] .graphic-arrange-actions {
      justify-content: space-between;
      gap: 0.2rem;
    }

    ribbon-drawer[pane] .graphic-layers-inline {
      min-height: 4.25rem;
      padding-block-start: 0.4rem;
      padding-inline-start: 0;
      border-block-start: 1px solid #d8dee6;
      border-inline-start: 0;
    }

    @media (max-width: 36rem) {
      .ribbon-top {
        gap: 0.35rem;
      }
    }
  `

  activeMenu: RibbonMenuName = "Start"
  expanded = true
  menuOpen = false
  logoUrl = ""
  canMark = false
  canSection = false
  sectionType: SectionName = "section"
  sectionActive = false
  sectionSelected = false
  marks: MarkName[] = []
  markStyles: StyleMarkValues = {}
  markAttributes: MarkAttributeValues = {}
  commentState: CommentState = {
    canComment: false,
    active: false,
    text: "",
    activeCount: 0,
    count: 0,
    highlighting: true,
  }
  private commentDraft = ""
  presenceUsers: PresenceUser[] = []
  packages: WebWriterPackage[] = []
  installedPackages: WebWriterPackage[] = []
  packagesLoading = false
  busyPackageNames: string[] = []
  packageError = ""
  localPackages: WebWriterPackage[] = []
  localPackagesLoading = false
  localPackageError = ""
  selectedLocalPackageName = ""
  selectedLocalPackageAutoReload = false
  listType: ListType | null = null
  listStyle = ""
  orderedList: ListSelectionState["ordered"] = undefined
  headingGroup: HeadingGroupSelectionState | null = null
  figure: FigureSelectionState | null = null
  media: MediaSelectionState | null = null
  form: FormSelectionState | null = null
  dialog: DialogSelectionState | null = null
  table: TableSelectionState | null = null
  graphic: GraphicSelectionState | null = null
  elementAttributes: ElementAttributeState | null = null
  elementStyle: ElementStyleState = {
    target: null,
    inline: {},
    computed: {},
    context: {display: "", parentDisplay: ""},
  }
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
  documentHead: DocumentHeadState = emptyDocumentHeadState()
  private documentHeadDrawerOpen = false
  private documentHeadAttributeEditorId = ""
  previewActive = false
  liveSessionActive = false
  liveSessionRole: "host" | "learner" | "" = ""
  liveSessionLink = ""
  liveLearners: LiveLearnerRibbonItem[] = []
  storageLocation: StorageLocation = "local"
  private packageSearchQuery = ""
  private packageDrawerOpen = false
  private packageVisibleCount = 2
  private linkAttributeMenuOpen = false
  aiDocumentToolHandler: AIDocumentToolHandler | undefined
  aiEditReviewHandler: AIEditReviewHandler | undefined
  backendClient: BackendClient | null = null
  backendState: "probing" | "connected" | "unavailable" = "probing"
  historyState = emptyVersionHistoryState()
  historyLoading = false
  historyError = ""
  private readonly aiProviderStore = new AIProviderStore()
  private backendConnectionSequence = 0
  private aiPrompt = ""
  private aiChatOpen = false
  private aiChatTransitioning = false
  private aiChatTransitionTimer: ReturnType<typeof setTimeout> | undefined
  private aiChats: AIChat[] = [{id: "chat-1", title: "New chat", messages: []}]
  private activeAIChatId = "chat-1"
  private aiProviders: AIProviderConfig[] = this.aiProviderStore.providers
  private aiModel = this.aiProviderStore.activeProvider?.defaultModel ?? ""
  private aiEffort: AIEffort = "medium"
  private aiAttachments: AIAttachment[] = []
  private aiBusy = false
  private aiError = ""
  private pendingAIEdit: PendingAIEdit | null = null
  private aiAbortController: AbortController | null = null
  private aiChatSequence = 1
  private aiMessageSequence = 0
  private aiAttachmentSequence = 0
  private spanMarkSelection: MarkName[] = []
  private spanMarkSelectionSynced = false
  private ribbonContentObserver: ResizeObserver | undefined
  private responsiveLayoutQueued = false
  private previewTransitioning = false
  private previewExpandedBefore = true
  private previewMenuBefore: RibbonMenuName = "Start"
  private previewTransitionTimer: ReturnType<typeof setTimeout> | undefined
  settings: AppSettings = defaultAppSettings()

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
    }, 180)
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
    if(this.linkAttributeMenuOpen) {
      event.stopImmediatePropagation()
      this.closeLinkAttributeMenu()
      this.renderRoot.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')
        ?.shadowRoot?.querySelector<HTMLButtonElement>(".button-dropdown-more")?.focus()
    }
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(this.aiChatOpen) {
      const path = event.composedPath()
      const panel = this.renderRoot.querySelector(".ai-chat-panel")
      if(!path.includes(panel as EventTarget)) {
        this.closeAIChat()
      }
    }
    if(this.linkAttributeMenuOpen) {
      const path = event.composedPath()
      if(!path.includes(this)) this.closeLinkAttributeMenu()
    }
    if(!this.menuOpen || this.expanded) return

    const menu = this.renderRoot.querySelector("ribbon-menu")
    if(menu && event.composedPath().includes(menu)) return

    this.selectStart()
  }

  protected readonly handleRibbonPointerDown = (event: MouseEvent) => {
    if(event.button !== 0) return

    const input = ribbonInputFromEvent(event)
    if(input) {
      this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-pointerdown", {
        detail: {input},
        bubbles: true,
        composed: true,
      }))
      return
    }

    const aiAction = event.composedPath().find(target => target instanceof HTMLElement && (
      target.matches(
        ".ai-prompt-submit, .ai-prompt-expand, .ai-chat-brand-button, " +
        ".ai-chat-header-button, .ai-chat-send, .ai-composer-attachment, " +
        ".ai-attachment-remove, .ai-edit-action",
      )
    ))
    if(aiAction) return

    // Keep the editor iframe as the active element while the ribbon is used
    // with a pointer. The click event still performs the ribbon action.
    event.preventDefault()
  }

  protected readonly handleRibbonInputFocusIn = (event: FocusEvent) => {
    const input = ribbonInputFromEvent(event)
    if(!input) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-focus", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
  }

  protected readonly handleRibbonInputFocusOut = (event: FocusEvent) => {
    const input = ribbonInputFromEvent(event)
    if(!input) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-blur", {
      detail: {
        input,
        relatedTarget: event.relatedTarget,
        relatedTargetIsInput: isRibbonInput(event.relatedTarget),
      },
      bubbles: true,
      composed: true,
    }))
  }

  protected readonly handleRibbonInputChange = (event: Event) => {
    const input = ribbonInputFromEvent(event)
    if(!input || input.hasAttribute("data-ribbon-input-persistent")) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-commit", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
  }

  protected readonly handleRibbonInputKeydown = (event: KeyboardEvent) => {
    if(event.key !== "Escape") return
    const input = ribbonInputFromEvent(event)
    if(!input) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-cancel", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
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
    this.aiProviderStore.removeEventListener("change", this.handleAIProviderChange)
    this.stopAIRequest()
    if(this.previewTransitionTimer !== undefined) clearTimeout(this.previewTransitionTimer)
    this.previewTransitionTimer = undefined
    if(this.aiChatTransitionTimer !== undefined) clearTimeout(this.aiChatTransitionTimer)
    this.aiChatTransitionTimer = undefined
    this.aiChatTransitioning = false
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
    const controls = drawer?.shadowRoot?.querySelector<HTMLElement>(".controls")
    if(!drawer || !controls) return
    const style = getComputedStyle(controls)
    const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
    const measuredWidth = controls.getBoundingClientRect().width || drawer.getBoundingClientRect().width || drawer.layoutWidths.expanded
    const usableWidth = Math.max(0, measuredWidth - padding)
    const buttonWidth = 64
    const gap = Number.parseFloat(style.columnGap) || 0
    const columns = Math.max(1, Math.floor((usableWidth + gap) / (buttonWidth + gap)))
    // A package button normally spans two grid tracks. Fewer than four tracks
    // therefore means that only one package-button column fits.
    drawer.singleColumn = columns < 4
    // In the single-column layout, search uses the first of three rows and
    // packages occupy the remaining two. Wider grids use two rows total and
    // reserve two tracks in the first row for search.
    const visibleCount = drawer.singleColumn
      ? 2
      : Math.max(
        0,
        Math.floor((columns - 2) / 2) + Math.floor(columns / 2),
      )
    if(this.packageVisibleCount !== visibleCount) this.packageVisibleCount = visibleCount
  }

  private toggleExpanded() {
    if(this.previewActive) return
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

  private selectHistory = () => {
    if(this.previewActive) return
    this.closeAIChat()
    this.activeMenu = "History"
    this.expanded = true
    this.menuOpen = false
  }

  private selectStart() {
    if(this.previewActive) {
      this.dispatchEvent(new Event("ribbon-preview-exit", {bubbles: true, composed: true}))
      return
    }
    this.activeMenu = "Start"
    this.menuOpen = false
    this.closeAIChat()
  }

  private handleBrandClick = () => this.selectStart()

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
    const messages = this.renderRoot.querySelector<HTMLElement>(".ai-chat-messages")
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

  /** Adds a model response to the selected chat. */
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
    if(this.aiChatOpen) {
      this.closeAIChat(true)
      return
    }
    this.startAIChatTransition()
    this.aiChatOpen = true
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLTextAreaElement>(".ai-prompt-input")?.focus()
    })
  }

  private closeAIChat(restoreFocus = false) {
    if(!this.aiChatOpen) return
    this.startAIChatTransition()
    this.aiChatOpen = false
    if(restoreFocus) void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLButtonElement>(".ai-prompt-expand")?.focus()
    })
  }

  dismissAIChat() {
    this.closeAIChat()
  }

  private startAIChatTransition() {
    if(this.aiChatTransitionTimer !== undefined) clearTimeout(this.aiChatTransitionTimer)
    this.aiChatTransitioning = true
    this.aiChatTransitionTimer = setTimeout(() => {
      this.aiChatTransitionTimer = undefined
      this.aiChatTransitioning = false
    }, 220)
  }

  private startNewAIChat = () => {
    const activeChat = this.activeAIChat
    if(activeChat?.title === "New chat" && activeChat.messages.length === 0) return
    const id = `chat-${++this.aiChatSequence}`
    this.aiChats = [{id, title: "New chat", messages: []}, ...this.aiChats]
    this.activeAIChatId = id
    this.aiPrompt = ""
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLTextAreaElement>(".ai-prompt-input")?.focus()
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
    this.renderRoot.querySelector<HTMLInputElement>(".ai-attachment-input")?.click()
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
      .filter((message): message is AIChatMessage & {role: "user" | "assistant"} => message.role !== "event")
      .map(message => ({
      role: message.role,
      content: message.content,
      ...(message.attachments?.length
        ? {attachments: message.attachments.map(attachment => ({...attachment}))}
        : {}),
      })) ?? []
  }

  private handleAIDocumentTool(call: AIDocumentToolCall, chatId: string): Promise<unknown> {
    if(call.name === "read_current_document" || call.name === "read_current_selection") {
      return this.aiDocumentToolHandler
        ? this.aiDocumentToolHandler(call)
        : Promise.resolve({status: "unavailable", message: "The document editor is not connected"})
    }
    const html = call.arguments.html
    const summary = call.arguments.summary
    if(typeof html !== "string" || typeof summary !== "string") {
      return Promise.resolve({status: "error", message: "The proposed edit is missing its HTML or summary"})
    }
    return new Promise(resolve => {
      this.pendingAIEdit?.resolve({status: "denied", message: "A newer edit replaced this proposal"})
      this.pendingAIEdit = {call, chatId, summary, html, previewing: true, deciding: false, resolve}
      this.activeAIChatId = chatId
      const preview = this.aiEditReviewHandler
        ? this.aiEditReviewHandler("preview", call)
        : Promise.reject(new Error("The document editor cannot preview AI changes"))
      void preview.then(
        () => {
          if(this.pendingAIEdit?.call.id === call.id) {
            const queuedDecision = this.pendingAIEdit.queuedDecision
            this.pendingAIEdit = {...this.pendingAIEdit, previewing: false, queuedDecision: undefined}
            if(queuedDecision) queueMicrotask(() => this.reviewPendingAIEdit(queuedDecision, call.id))
          }
        },
        error => {
          if(this.pendingAIEdit?.call.id === call.id) this.pendingAIEdit = null
          resolve({status: "error", message: error instanceof Error ? error.message : String(error)})
        },
      )
      void this.updateComplete.then(() => this.scrollAIChatToEnd())
    })
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
      this.appendAIEditProtocol(pending, "accepted")
      if(this.pendingAIEdit?.call.id === pending.call.id) this.pendingAIEdit = null
      pending.resolve(result)
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
      if(this.aiEditReviewHandler) await this.aiEditReviewHandler("reject", pending.call)
      this.appendAIEditProtocol(pending, "rejected")
      this.pendingAIEdit = null
      pending.resolve({status: "denied", message: "The user rejected the proposed edit"})
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

  /** Receives an Accept/Reject choice made inside the document preview. */
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
    this.aiAbortController = null
  }

  private async runAIPrompt(prompt: string) {
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
    const controller = new AbortController()
    this.aiAbortController = controller
    try {
      const response = await completeAIConversation({
        provider,
        apiKey,
        model: this.aiModel,
        effort: this.aiEffort,
        messages: this.conversationFor(chatId),
        toolHandler: call => this.handleAIDocumentTool(call, chatId),
        signal: controller.signal,
      })
      this.appendAIResponse(response, chatId)
    }
    catch(error) {
      this.aiError = error instanceof DOMException && error.name === "AbortError"
        ? "Request stopped."
        : error instanceof Error ? error.message : String(error)
    }
    finally {
      if(this.aiAbortController === controller) this.aiAbortController = null
      this.aiBusy = false
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
    if(!this.expanded && this.menuOpen) this.selectStart()
  }

  dismissDrawers() {
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer")
      .forEach(drawer => drawer.closeDrawer())
  }

  private selectMenu(event: Event) {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label && menuTabs.includes(label as RibbonMenuName)) {
      const nextMenu = label as RibbonMenuName
      this.closeAIChat()
      if(this.previewActive) {
        if(nextMenu === "File") {
          this.dispatchEvent(new Event("ribbon-preview-exit", {bubbles: true, composed: true}))
        }
        return
      }
      if(this.expanded) {
        this.activeMenu = nextMenu
        this.menuOpen = false
        this.closeAIChat()
        return
      }

      const isSameMenu = this.activeMenu === nextMenu
      this.activeMenu = nextMenu
      this.menuOpen = dropdownMenus.includes(nextMenu) && (!isSameMenu || !this.menuOpen)
    }
  }

  protected willUpdate(changed: Map<string, unknown>) {
    const previewActiveChanged = changed.has("previewActive") && changed.get("previewActive") !== undefined
    if(previewActiveChanged) {
      this.previewTransitioning = true
      if(this.previewActive) {
        this.closeAIChat()
        this.previewExpandedBefore = this.expanded
        this.previewMenuBefore = this.activeMenu
        this.expanded = this.liveSessionActive && this.liveSessionRole === "host"
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
      this.expanded = this.liveSessionActive && this.liveSessionRole === "host"
      this.menuOpen = false
    }
    if(changed.has("marks")) this.syncSpanMarkSelection()
    if(changed.has("commentState")) this.commentDraft = this.commentState.text
  }

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("backendClient")) void this.connectAIBackend(this.backendClient)
    if(changed.has("previewActive") && changed.get("previewActive") !== undefined) {
      this.schedulePreviewTransitionEnd()
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
    if(changed.has("activeMenu") && this.activeMenu === "Develop") {
      this.dispatchEvent(new Event("local-package-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && this.activeMenu === "Style") {
      this.dispatchEvent(new Event("element-style-state-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && this.activeMenu === "History") {
      this.dispatchEvent(new Event("history-state-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && changed.get("activeMenu") === "History" && this.activeMenu !== "History") {
      this.dispatchEvent(new Event("history-preview-clear", {bubbles: true, composed: true}))
    }
    if(changed.has("historyState")) this.scrollNewHistoryCardIntoView(changed.get("historyState"))
    if(
      changed.has("activeMenu") || changed.has("expanded") || changed.has("packages") ||
      changed.has("installedPackages") || changed.has("packageSearchQuery") ||
      changed.has("localPackages") || changed.has("historyState")
    ) this.scheduleResponsiveLayout()
    if(changed.has("marks")) {
      if(!this.marks.includes("a")) this.closeLinkAttributeMenu()
    }
  }

  private markButton(option: MarkOption) {
    const shortcut = this.commandShortcut(`mark:${option.name}`)
      || markShortcutLabel(option, isOnApple())
    const group = mergedMarkGroupFor(option.name)
    const active = group?.primary === option.name
      ? group.members.some(mark => this.marks.includes(mark))
      : this.marks.includes(option.name)
    return html`
      <ribbon-button
        compact
        toggle
        label=${option.label}
        action=${`mark:${option.name}`}
        icon=${option.icon}
        shortcut=${shortcut}
        ?active=${active}
        ?disabled=${!this.canMark}
      ></ribbon-button>
    `
  }

  private visibleMarkButton(name: MarkName) {
    return this.markButton(this.markOption(name))
  }

  private markOption(name: MarkName) {
    return [...primaryMarkOptions, ...secondaryMarkOptions].find(option => option.name === name)!
  }

  private dispatchMarkAttribute(mark: MarkName, attribute: string, event: Event) {
    const value = (event.currentTarget as HTMLInputElement | HTMLSelectElement).value
    this.dispatchEvent(new CustomEvent("mark-attribute-change", {
      detail: {mark, attribute, value},
      bubbles: true,
      composed: true,
    }))
  }

  private closeLinkAttributeMenu() {
    this.linkAttributeMenuOpen = false
  }

  private toggleLinkAttributeMenu() {
    if(!this.canMark) return
    if(this.linkAttributeMenuOpen) this.closeLinkAttributeMenu()
    else this.linkAttributeMenuOpen = true
  }

  private handleLinkAttributeMenuKeydown(event: KeyboardEvent) {
    if(event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    this.toggleLinkAttributeMenu()
  }

  private renderMarkAttribute(mark: MarkName, option: MarkAttributeOption) {
    return html`
      <label class=${`mark-attribute${mark === "a" && option.name === "href" ? " mark-attribute-link" : ""}`}>
        <span>${option.label}</span>
        ${option.options ? html`<select
          aria-label=${`${this.markOption(mark).label}: ${option.label}`}
          .value=${this.markAttributes[mark]?.[option.name] ?? option.options[0]?.value ?? ""}
          ?disabled=${!this.canMark}
          @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
        >${option.options.map(item => html`<option value=${item.value}>${item.label}</option>`)}</select>` : html`<input
          type=${option.inputType ?? "text"}
          aria-label=${`${this.markOption(mark).label}: ${option.label}`}
          placeholder=${option.placeholder}
          .value=${this.markAttributes[mark]?.[option.name] ?? ""}
          ?disabled=${!this.canMark}
          @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
        />`}
      </label>
    `
  }

  private renderDropdownAttribute(mark: MarkName, option: MarkAttributeOption, active = true) {
    if(option.options) return html`
      <select
        class="mark-dropdown-attribute"
        aria-label=${`${this.markOption(mark).label}: ${option.label}`}
        title=${option.label}
        .value=${this.markAttributes[mark]?.[option.name] ?? option.options[0]?.value ?? ""}
        ?disabled=${!this.canMark || !active}
        @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
      >${option.options.map(item => html`<option value=${item.value}>${item.label}</option>`)}</select>
    `
    return html`
      <input
        class="mark-dropdown-attribute"
        type=${option.inputType ?? "text"}
        aria-label=${`${this.markOption(mark).label}: ${option.label}`}
        placeholder=${option.placeholder}
        title=${option.label}
        .value=${this.markAttributes[mark]?.[option.name] ?? ""}
        ?disabled=${!this.canMark || !active}
        @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
      />
    `
  }

  private renderLinkDropdown() {
    const [href, ...advanced] = markAttributeOptionsFor("a")
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Link options">
        ${href ? this.renderMarkAttribute("a", href) : ""}
        <button
          class="button-dropdown-more"
          type="button"
          aria-label="More link options"
          aria-expanded=${this.linkAttributeMenuOpen}
          @click=${() => this.toggleLinkAttributeMenu()}
          @keydown=${(event: KeyboardEvent) => this.handleLinkAttributeMenuKeydown(event)}
        >More options</button>
        ${this.linkAttributeMenuOpen ? html`
          <div class="button-dropdown-advanced" role="group" aria-label="Advanced link options">
            ${advanced.map(option => this.renderMarkAttribute("a", option))}
          </div>
        ` : ""}
      </div>
    `
  }

  private spanGroupMembers() {
    return mergedMarkGroupFor("span")?.members ?? []
  }

  private activeSpanMarks() {
    return this.spanGroupMembers().filter(mark => this.marks.includes(mark))
  }

  private spanSelectedMarks() {
    return this.spanMarkSelectionSynced ? this.spanMarkSelection : this.activeSpanMarks()
  }

  private sameMarkSet(first: readonly MarkName[], second: readonly MarkName[]) {
    return first.length === second.length && first.every(mark => second.includes(mark))
  }

  private syncSpanMarkSelection() {
    const active = this.activeSpanMarks()
    if(!this.sameMarkSet(this.spanMarkSelection, active)) this.spanMarkSelection = active
    this.spanMarkSelectionSynced = true
  }

  private toggleSpanMark(mark: MarkName) {
    if(!this.canMark) return
    const selected = this.spanSelectedMarks()
    const next = selected.includes(mark)
      ? selected.filter(candidate => candidate !== mark)
      : [...selected, mark]
    if(this.sameMarkSet(selected, next)) return
    this.spanMarkSelection = next
    this.spanMarkSelectionSynced = true
    this.requestUpdate()
    this.dispatchEvent(new CustomEvent("ribbon-combobox-change", {
      detail: {name: "mark-types", value: next[0] ?? "", values: next},
      bubbles: true,
      composed: true,
    }))
  }

  private renderSpanMarkOption(mark: MarkName, selected: readonly MarkName[]) {
    const option = this.markOption(mark)
    const attributes = markAttributeOptionsFor(mark)
    const active = selected.includes(mark)
    return html`
      <div
        class="mark-dropdown-option"
        role="option"
        aria-selected=${active}
      >
        <input
          type="checkbox"
          data-ribbon-input-persistent
          aria-label=${`Select ${option.label}`}
          .checked=${active}
          ?disabled=${!this.canMark}
          @change=${(event: Event) => {
            this.toggleSpanMark(mark)
            const input = event.currentTarget as HTMLInputElement
            input.checked = this.spanSelectedMarks().includes(mark)
          }}
        />
        <span class="mark-dropdown-option-icon" aria-hidden="true">${ribbonIcon(option.icon)}</span>
        <span class="mark-dropdown-option-name">${option.label}</span>
        ${attributes.length ? html`
          <span class="mark-dropdown-attributes" aria-hidden=${!active}>
            ${attributes.map(attribute => this.renderDropdownAttribute(mark, attribute, active))}
          </span>
        ` : ""}
      </div>
    `
  }

  private renderSpanDropdown(selected: readonly MarkName[]) {
    return html`
      <div class="mark-dropdown-list" role="listbox" aria-label="Advanced mark types" aria-multiselectable="true">
        ${this.spanGroupMembers().map(mark => this.renderSpanMarkOption(mark, selected))}
      </div>
    `
  }

  private renderLinkButton() {
    return html`
      <ribbon-button
        class="mark-link"
        style="grid-column: 8; grid-row: 1"
        toggle
        label="Link"
        action="mark:a"
        icon="MarkLink"
        .dropdown=${this.renderLinkDropdown()}
        ?active=${this.marks.includes("a")}
        ?disabled=${!this.canMark}
      ></ribbon-button>
    `
  }

  private renderSpanButton() {
    const selected = this.spanSelectedMarks()
    const first = selected.length ? this.markOption(selected[0]) : {label: "More", icon: "More"}
    return html`
      <ribbon-button
        class="mark-span"
        style="grid-column: 8; grid-row: 2"
        toggle
        label=${first.label}
        icon=${first.icon}
        action="mark:span"
        .selectionCount=${Math.max(0, selected.length - 1)}
        .dropdown=${this.renderSpanDropdown(selected)}
        ?active=${this.activeSpanMarks().length > 0}
        ?disabled=${!this.canMark}
      ></ribbon-button>
    `
  }

  private renderMarkDrawer() {
    return html`
      <ribbon-drawer
        label="Marks"
        icon="MarkBold"
        layout="marks"
      >
        <ribbon-combobox
          class="font-family"
          name="font-family"
          label="Font family"
          default-value-label="Font"
          .options=${fontFamilyOptions}
          .value=${this.markStyles["font-family"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-combobox
          class="font-size"
          name="font-size"
          label="Font size"
          default-value-label="Size"
          .options=${fontSizeOptions}
          .value=${this.markStyles["font-size"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-button
          compact
          label="Increase font size"
          action="increaseFontSize"
          icon="IncreaseFontSize"
          ?disabled=${!this.canMark}
        ></ribbon-button>
        <ribbon-button
          compact
          label="Decrease font size"
          action="decreaseFontSize"
          icon="DecreaseFontSize"
          ?disabled=${!this.canMark}
        ></ribbon-button>
        <ribbon-combobox
          class="mark-text-color"
          style="grid-column: 1; grid-row: 2"
          name="color"
          label="Text color"
          variant="color"
          .options=${textColorOptions}
          .value=${this.markStyles.color ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-combobox
          class="mark-background-color"
          style="grid-column: 2; grid-row: 2"
          name="background-color"
          label="Text background color"
          variant="color"
          .options=${backgroundColorOptions}
          .value=${this.markStyles["background-color"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        ${primaryDrawerMarkNames.map(mark => this.visibleMarkButton(mark))}
        <ribbon-button
          class="mark-remove"
          style="grid-column: 7; grid-row: 2"
          compact
          label="Remove formatting"
          action="removeMarks"
          icon="RemoveMarks"
          ?disabled=${!this.canMark}
        ></ribbon-button>
        ${this.renderLinkButton()}
        ${this.renderSpanButton()}
      </ribbon-drawer>
    `
  }

  private dispatchSectionType(event: Event) {
    const section = (event.currentTarget as HTMLSelectElement).value as SectionName
    this.dispatchEvent(new CustomEvent("section-type-change", {
      detail: {section},
      bubbles: true,
      composed: true,
    }))
  }

  private renderSectionTypeSelect(label = "Section type") {
    return html`
      <label class="mark-attribute section-type-select">
        <span>${label}</span>
        <select
          aria-label=${label}
          .value=${this.sectionType}
          ?disabled=${!this.canSection}
          @change=${this.dispatchSectionType}
        >
          ${sectionOptions.map(option => html`
            <option value=${option.value}>${option.label}</option>
          `)}
        </select>
      </label>
    `
  }

  private renderSectionDropdown() {
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Section options">
        ${this.renderSectionTypeSelect("Type")}
      </div>
    `
  }

  private renderSectionDrawer() {
    return html`
      <ribbon-drawer label="Section" icon="Section" layout="section">
        ${this.renderSectionTypeSelect()}
        <ribbon-button
          label="Add outer section"
          action="section-add"
          icon="Plus"
          ?disabled=${!this.sectionSelected}
        ></ribbon-button>
        <ribbon-button
          label="Remove section"
          action="section-remove"
          icon="RemoveMarks"
          ?disabled=${!this.sectionSelected}
        ></ribbon-button>
        ${this.sectionType === "blockquote" && this.elementAttributes?.localName === "blockquote" ? html`
          <label class="mark-attribute">
            <span>Citation</span>
            <input
              type="url"
              placeholder="https://…"
              .value=${this.elementAttributes.attributes.cite ?? ""}
              @change=${(event: Event) => this.dispatchSelectedElementAttribute("cite", (event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        ` : ""}
        ${this.sectionType === "figure" && this.figure ? this.renderFigureCaptionControls() : ""}
      </ribbon-drawer>
    `
  }

  private renderFigureCaptionControls() {
    return this.figure?.hasCaption ? html`
      <ribbon-button label="Edit caption" action="figure-caption-edit" icon="Pencil"></ribbon-button>
    ` : html`
      <ribbon-button label="Add caption above" action="figure-caption-before" icon="Plus"></ribbon-button>
      <ribbon-button label="Add caption below" action="figure-caption-after" icon="Plus"></ribbon-button>
    `
  }

  private dispatchSelectedElementAttribute(name: string, value: string | null) {
    if(!this.elementAttributes) return
    this.dispatchEvent(new CustomEvent("element-attribute-change", {
      detail: {
        path: this.elementAttributes.path,
        localName: this.elementAttributes.localName,
        namespaceURI: this.elementAttributes.namespaceURI,
        name,
        value,
      },
      bubbles: true,
      composed: true,
    }))
  }

  private dispatchListAttribute(name: "start" | "reversed" | "type" | "value", value: string | null) {
    this.dispatchEvent(new CustomEvent("list-attribute-change", {
      detail: {name, value},
      bubbles: true,
      composed: true,
    }))
  }

  private renderListDrawer() {
    if(this.listType !== "ol" || !this.orderedList) return nothing
    return html`
      <ribbon-drawer label="List" icon="Enumeration" layout="form">
        <label class="mark-attribute">
          <span>Start at</span>
          <input
            type="number"
            .value=${this.orderedList.start}
            placeholder="Automatic"
            @change=${(event: Event) => this.dispatchListAttribute("start", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="mark-attribute">
          <span>Numbering</span>
          <select
            .value=${this.orderedList.numbering}
            @change=${(event: Event) => this.dispatchListAttribute("type", (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Automatic</option>
            <option value="1">1, 2, 3</option>
            <option value="a">a, b, c</option>
            <option value="A">A, B, C</option>
            <option value="i">i, ii, iii</option>
            <option value="I">I, II, III</option>
          </select>
        </label>
        <label class="mark-attribute">
          <span>Count backwards</span>
          <input
            type="checkbox"
            .checked=${this.orderedList.reversed}
            @change=${(event: Event) => this.dispatchListAttribute("reversed", (event.currentTarget as HTMLInputElement).checked ? "" : null)}
          />
        </label>
        ${this.orderedList.itemValue !== undefined ? html`
          <label class="mark-attribute">
            <span>Item number</span>
            <input
              type="number"
              .value=${this.orderedList.itemValue}
              placeholder="Continue sequence"
              @change=${(event: Event) => this.dispatchListAttribute("value", (event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        ` : ""}
      </ribbon-drawer>
    `
  }

  private renderHeadingGroupDrawer() {
    if(!this.headingGroup) return nothing
    return html`
      <ribbon-drawer label="Heading group" icon="Heading" layout="form">
        <label class="mark-attribute">
          <span>Heading level</span>
          <select
            .value=${this.headingGroup.heading ?? "h1"}
            @change=${(event: Event) => this.dispatchEvent(new CustomEvent("heading-group-level-change", {
              detail: {level: (event.currentTarget as HTMLSelectElement).value},
              bubbles: true,
              composed: true,
            }))}
          >${[1, 2, 3, 4, 5, 6].map(level => html`<option value=${`h${level}`}>Heading ${level}</option>`)}</select>
        </label>
        <ribbon-button label="Add text above" action="heading-group-add-before" icon="Plus"></ribbon-button>
        <ribbon-button label="Add text below" action="heading-group-add-after" icon="Plus"></ribbon-button>
      </ribbon-drawer>
    `
  }

  private renderDisclosureDrawer() {
    if(this.elementAttributes?.localName !== "details") return nothing
    return html`
      <ribbon-drawer label="Disclosure" icon="Details" layout="form">
        <label class="mark-attribute">
          <span>Group</span>
          <input
            type="text"
            placeholder="Independent"
            .value=${this.elementAttributes.attributes.name ?? ""}
            @change=${(event: Event) => this.dispatchSelectedElementAttribute("name", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="mark-attribute">
          <span>Initially open</span>
          <input
            type="checkbox"
            .checked=${Object.hasOwn(this.elementAttributes.attributes, "open")}
            @change=${(event: Event) => this.dispatchSelectedElementAttribute("open", (event.currentTarget as HTMLInputElement).checked ? "" : null)}
          />
        </label>
      </ribbon-drawer>
    `
  }

  private updateCommentDraft(event: Event) {
    this.commentDraft = (event.currentTarget as HTMLTextAreaElement).value
  }

  private commitCommentText() {
    if(!this.commentState.active || this.commentDraft === this.commentState.text) return
    this.dispatchEvent(new CustomEvent("comment-action", {
      detail: {action: "set-text", text: this.commentDraft},
      bubbles: true,
      composed: true,
    }))
  }

  private handleCommentButton(event: Event) {
    event.stopPropagation()
    const action = (event as CustomEvent<{label?: string}>).detail?.label
    if(!["toggle", "remove-all", "previous", "next"].includes(action ?? "")) return
    this.dispatchEvent(new CustomEvent("comment-action", {
      detail: {action, text: this.commentDraft},
      bubbles: true,
      composed: true,
    }))
  }

  private changeCommentHighlighting(event: Event) {
    this.dispatchEvent(new CustomEvent("comment-action", {
      detail: {
        action: "highlight",
        enabled: (event.currentTarget as HTMLInputElement).checked,
      },
      bubbles: true,
      composed: true,
    }))
  }

  private renderCommentDrawer() {
    const {active, activeCount, canComment, count, highlighting} = this.commentState
    return html`
      <ribbon-drawer label="Comments" icon="Comments" layout="comments" @ribbon-button-click=${this.handleCommentButton}>
        <div class="comment-editor">
          <span class="comment-editor-header">
            <span>Comment${activeCount > 1 ? ` (${activeCount} selected)` : ""}</span>
            <label class="comment-highlight-toggle">
              <input
                type="checkbox"
                data-ribbon-input-persistent
                .checked=${highlighting}
                @change=${this.changeCommentHighlighting}
              >
              Highlight
            </label>
          </span>
          <textarea
            aria-label="Comment text"
            data-ribbon-input-persistent
            rows="2"
            placeholder=${active ? "Comment text" : "Add a comment…"}
            .value=${this.commentDraft}
            ?disabled=${!canComment}
            @input=${this.updateCommentDraft}
            @change=${this.commitCommentText}
          ></textarea>
        </div>
        <ribbon-button
          compact
          toggle
          label=${active ? "Remove comment" : "Add comment"}
          action="toggle"
          icon="Comments"
          ?active=${active}
          ?disabled=${!canComment}
        ></ribbon-button>
        <ribbon-button compact label="Remove all" action="remove-all" icon="RemoveMarks" ?disabled=${count === 0}></ribbon-button>
        <ribbon-button compact label="Previous comment" action="previous" icon="Previous" ?disabled=${count === 0}></ribbon-button>
        <ribbon-button compact label="Next comment" action="next" icon="Next" ?disabled=${count === 0}></ribbon-button>
      </ribbon-drawer>
    `
  }

  private get availablePackages() {
    const installed = new Map(this.installedPackages.map(pkg => [pkg.name, pkg]))
    const catalogNames = new Set(this.packages.map(pkg => pkg.name))
    const available = [
      ...this.packages.map(pkg => installed.get(pkg.name) ?? pkg),
      ...this.installedPackages.filter(pkg => !catalogNames.has(pkg.name)),
    ]
    return [
      ...available.filter(pkg => installed.has(pkg.name)),
      ...available.filter(pkg => !installed.has(pkg.name)),
    ]
  }

  private get filteredPackages() {
    const words = this.packageSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return this.availablePackages.filter(pkg => {
      const haystack = [pkg.name, pkg.label, pkg.description, ...pkg.keywords].filter(Boolean).join(" ").toLowerCase()
      return words.every(word => haystack.includes(word))
    })
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
    if(detail?.label === "Packages" && detail.open) this.packageDrawerOpen = true
  }

  private handlePackageDrawerClose = (event: Event) => {
    const detail = (event as CustomEvent<{label?: string}>).detail
    if(detail?.label === "Packages") this.packageDrawerOpen = false
  }

  private handlePackageSearchFocus = () => {
    this.renderRoot.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')?.openDrawer(true)
  }

  private get selectedLocalPackage() {
    return this.localPackages.find(pkg => pkg.name === this.selectedLocalPackageName) ?? this.localPackages[0]
  }

  private get localPackageSelectionName() {
    return this.selectedLocalPackageName || this.localPackages[0]?.name || ""
  }

  private selectLocalPackage = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(!label?.startsWith("local-package-select:")) return
    this.selectedLocalPackageName = label.slice("local-package-select:".length)
  }

  private selectLocalPackageFromSelect = (event: Event) => {
    const name = (event.currentTarget as HTMLSelectElement).value
    this.selectedLocalPackageName = name
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: `local-package-select:${name}`},
      bubbles: true,
      composed: true,
    }))
  }

  private localPackageMetadataChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    this.dispatchEvent(new CustomEvent<{field: string, value: string}>("local-package-metadata-change", {
      detail: {field: input.name, value: input.value},
      bubbles: true,
      composed: true,
    }))
  }

  private localPackageAutoReloadChange = (event: Event) => {
    const enabled = (event.currentTarget as HTMLInputElement).checked
    this.dispatchEvent(new CustomEvent<{enabled: boolean}>("local-package-auto-reload-change", {
      detail: {enabled},
      bubbles: true,
      composed: true,
    }))
  }

  private renderDevelopDrawer() {
    const displayPackages = this.localPackages
    return html`
      <ribbon-drawer
        class="local-packages-drawer"
        label="Local packages"
        icon="Packages"
        layout="packages"
        single-column
        @ribbon-drawer-state-change=${this.handlePackageDrawerState}
      >
        <label class="local-package-selection">
          <span class="local-package-selection-icon" aria-hidden="true">${ribbonIcon("Packages")}</span>
          <select
            class="local-package-select"
            aria-label="Local package"
            .value=${this.localPackageSelectionName}
            ?disabled=${!displayPackages.length}
            @change=${this.selectLocalPackageFromSelect}
          >
            ${displayPackages.length
              ? displayPackages.map(pkg => html`<option value=${pkg.name}>${pkg.name}</option>`)
              : html`<option value="">${this.localPackagesLoading ? "Loading packages…" : "No local packages"}</option>`}
          </select>
        </label>
        <div class="local-package-actions">
          <ribbon-button
            label="Load package"
            action="local-package-add"
            icon="Open"
            keep-drawer-open
          ></ribbon-button>
          <ribbon-button
            label="New package"
            action="local-package-new"
            icon="New"
            keep-drawer-open
          ></ribbon-button>
        </div>
        ${this.localPackageError ? html`<span class="package-status" role="alert">${this.localPackageError}</span>` : ""}
        ${!this.localPackagesLoading && !displayPackages.length && !this.localPackageError
          ? html`<span class="package-status">No local packages</span>`
          : ""}
      </ribbon-drawer>
    `
  }

  private renderMetadataDrawer() {
    const pkg = this.selectedLocalPackage
    const fields = [
      ["name", pkg?.name ?? ""],
      ["version", pkg?.version ?? ""],
      ["description", pkg?.description ?? ""],
      ["license", pkg?.license ?? ""],
    ] as const
    return html`
      <ribbon-drawer label="Metadata" icon="Properties" layout="metadata">
        ${pkg ? html`<div class="develop-fields">
          ${fields.map(([field, value]) => html`
            <label class="develop-field">
              <span>${field}</span>
              <input type="text" name=${field} .value=${value} @change=${this.localPackageMetadataChange} />
            </label>
          `)}
        </div>` : html`<span class="develop-empty">Select a package</span>`}
      </ribbon-drawer>
    `
  }

  private renderDevelopmentDrawer() {
    return html`
      <ribbon-drawer label="Development" icon="Settings" layout="development">
        <label class="develop-field">
          <input
            type="checkbox"
            .checked=${this.selectedLocalPackageAutoReload}
            ?disabled=${!this.selectedLocalPackage}
            @change=${this.localPackageAutoReloadChange}
          />
          <span>Auto-reload</span>
        </label>
      </ribbon-drawer>
    `
  }

  private renderExportsDrawer() {
    const members = this.selectedLocalPackage?.members.filter(member => member.insertable) ?? []
    return html`
      <ribbon-drawer
        class="exports-drawer"
        label="Exports"
        icon="Packages"
        layout="packages"
        single-column
        ?expandable=${members.length > 2}
      >
        ${members.length ? members.map(member => html`
          <ribbon-button
            label=${member.label}
            icon="Packages"
            .action=${packageMemberAction(member)}
            .details=${{heading: member.label, subheading: this.selectedLocalPackage?.label ?? "", description: member.description}}
          ></ribbon-button>
        `) : html`<span class="develop-empty">${this.selectedLocalPackage ? "No insertable exports" : "Select a package"}</span>`}
      </ribbon-drawer>
    `
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

  private mediaSelectionMatches(type: MediaType) {
    if(type === "picture" || type === "img") return this.media?.type === "picture" || this.media?.type === "img"
    if(isWebsiteType(type)) return isWebsiteType(this.media?.type)
    return this.media?.type === type
  }

  private dispatchFormAttribute(type: FormElementType, option: FormAttributeOption, event: Event) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    const value = option.kind === "boolean"
      ? (input as HTMLInputElement).checked ? "" : null
      : input.value || null
    this.dispatchEvent(new CustomEvent("form-attribute-change", {
      detail: {type, attribute: option.name, value},
      bubbles: true,
      composed: true,
    }))
  }

  private renderFormAttribute(type: FormElementType, option: FormAttributeOption) {
    const attributes = this.form?.attributes ?? {}
    if(option.kind === "boolean") {
      return html`
        <label class="mark-attribute form-attribute form-attribute-boolean">
          <span>${option.label}</span>
          <input
            type="checkbox"
            data-ribbon-input-persistent
            aria-label=${`${this.form?.type ?? type}: ${option.label}`}
            .checked=${Object.hasOwn(attributes, option.name)}
            @change=${(event: Event) => this.dispatchFormAttribute(type, option, event)}
          />
        </label>
      `
    }
    if(option.kind === "select") {
      return html`
        <label class="mark-attribute form-attribute">
          <span>${option.label}</span>
          <select
            ${ref(element => {
              if(!(element instanceof HTMLSelectElement)) return
              const value = attributes[option.name] ?? ""
              queueMicrotask(() => {
                if(element.isConnected) element.value = value
              })
            })}
            data-ribbon-input-persistent
            aria-label=${`${this.form?.type ?? type}: ${option.label}`}
            @change=${(event: Event) => this.dispatchFormAttribute(type, option, event)}
          >
            ${option.options?.map(item => html`
              <option value=${item.value} ?selected=${item.value === (attributes[option.name] ?? "")}>${item.label}</option>
            `)}
          </select>
        </label>
      `
    }
    return html`
      <label class="mark-attribute form-attribute">
        <span>${option.label}</span>
        <input
          data-ribbon-input-persistent
          type=${option.kind === "url" ? "url" : option.kind === "number" ? "number" : "text"}
          aria-label=${`${this.form?.type ?? type}: ${option.label}`}
          placeholder=${option.placeholder ?? ""}
          .value=${attributes[option.name] ?? ""}
          @change=${(event: Event) => this.dispatchFormAttribute(type, option, event)}
        />
      </label>
    `
  }

  private dispatchFormText(event: Event) {
    this.dispatchEvent(new CustomEvent("form-text-change", {
      detail: {type: this.form?.type, value: (event.currentTarget as HTMLInputElement).value},
      bubbles: true,
      composed: true,
    }))
  }

  private submitCustomFormAttribute(event: SubmitEvent) {
    event.preventDefault()
    if(!this.form) return
    const form = event.currentTarget as HTMLFormElement
    const name = form.elements.namedItem("attribute") as HTMLInputElement | null
    const value = form.elements.namedItem("value") as HTMLInputElement | null
    if(!name?.value.trim() || !value) return
    this.dispatchEvent(new CustomEvent("form-attribute-change", {
      detail: {type: this.form.type, attribute: name.value.trim(), value: value.value},
      bubbles: true,
      composed: true,
    }))
    name.value = ""
    value.value = ""
  }

  private renderFormEditor() {
    const state = this.form
    if(!state) return nothing
    const options = formAttributeOptions[state.type]
    const knownNames = new Set(options.map(option => option.name))
    const otherAttributes = Object.entries(state.attributes).filter(([name]) => !knownNames.has(name))
    return html`
      <div class="button-dropdown-form form-dropdown-form" role="group" aria-label=${`${state.type} options`}>
        ${state.text !== undefined ? html`
          <label class="mark-attribute form-attribute">
            <span>${state.type === "textarea" ? "Default text" : "Text"}</span>
            <input
              data-ribbon-input-persistent
              type="text"
              aria-label=${`${state.type}: Text`}
              .value=${state.text}
              @change=${this.dispatchFormText}
            />
          </label>
        ` : ""}
        ${options.map(option => this.renderFormAttribute(state.type, option))}
        ${otherAttributes.length ? html`
          <div class="button-dropdown-advanced" role="group" aria-label="Other attributes">
            ${otherAttributes.map(([name, value]) => html`
              <label class="mark-attribute form-attribute">
                <span>${name}</span>
                <input
                  data-ribbon-input-persistent
                  type="text"
                  aria-label=${`${state.type}: ${name}`}
                  .value=${value}
                  @change=${(event: Event) => this.dispatchEvent(new CustomEvent("form-attribute-change", {
                    detail: {
                      type: state.type,
                      attribute: name,
                      value: (event.currentTarget as HTMLInputElement).value || null,
                    },
                    bubbles: true,
                    composed: true,
                  }))}
                />
              </label>
            `)}
          </div>
        ` : ""}
        <form class="button-dropdown-advanced" aria-label="Add attribute" @submit=${this.submitCustomFormAttribute}>
          <label class="mark-attribute form-attribute">
            <span>Attribute</span>
            <input data-ribbon-input-persistent name="attribute" type="text" placeholder="data-name" />
          </label>
          <label class="mark-attribute form-attribute">
            <span>Value</span>
            <input data-ribbon-input-persistent name="value" type="text" placeholder="Value" />
          </label>
          <button class="button-dropdown-more" type="submit">Add attribute</button>
        </form>
      </div>
    `
  }

  private mediaLabel(type: MediaType) {
    if(type === "picture" || type === "img") return "Image"
    if(type === "audio") return "Audio"
    if(type === "video") return "Video"
    return "Website"
  }

  private dispatchMediaAttribute(type: MediaType, option: MediaAttributeOption, event: Event) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    const value = option.kind === "boolean"
      ? (input as HTMLInputElement).checked ? "" : null
      : input.value || null
    this.dispatchEvent(new CustomEvent("media-attribute-change", {
      detail: {type, attribute: option.name, value},
      bubbles: true,
      composed: true,
    }))
  }

  private renderMediaAttribute(type: MediaType, option: MediaAttributeOption) {
    const active = this.mediaSelectionMatches(type)
    const attributes = active ? this.media?.attributes ?? {} : {}
    if(option.kind === "boolean") {
      return html`
        <label class="mark-attribute media-attribute media-attribute-boolean">
          <span>${option.label}</span>
          <input
            type="checkbox"
            data-ribbon-input-persistent
            aria-label=${`${this.mediaLabel(type)}: ${option.label}`}
            .checked=${Object.hasOwn(attributes, option.name)}
            ?disabled=${!active}
            @change=${(event: Event) => this.dispatchMediaAttribute(type, option, event)}
          />
        </label>
      `
    }
    if(option.kind === "select") {
      return html`
        <label class="mark-attribute media-attribute">
          <span>${option.label}</span>
          <select
            data-ribbon-input-persistent
            aria-label=${`${this.mediaLabel(type)}: ${option.label}`}
            ?disabled=${!active}
            @change=${(event: Event) => this.dispatchMediaAttribute(type, option, event)}
          >
            ${option.options?.map(item => html`
              <option value=${item.value} ?selected=${item.value === (attributes[option.name] ?? "")}>${item.label}</option>
            `)}
          </select>
        </label>
      `
    }
    return html`
      <label class="mark-attribute media-attribute">
        <span>${option.label}</span>
        <input
          data-ribbon-input-persistent
          type=${option.kind === "url" ? "url" : option.kind === "number" ? "number" : "text"}
          aria-label=${`${this.mediaLabel(type)}: ${option.label}`}
          placeholder=${option.placeholder ?? ""}
          .value=${attributes[option.name] ?? ""}
          ?disabled=${!active}
          @change=${(event: Event) => this.dispatchMediaAttribute(type, option, event)}
        />
      </label>
    `
  }

  private dispatchMediaResourceAction(detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {type: this.media?.type, ...detail},
      bubbles: true,
      composed: true,
    }))
  }

  private dispatchMediaResourceAttribute(
    resource: TimedMediaResourceType,
    row: TimedMediaResourceState,
    option: MediaAttributeOption,
    event: Event,
  ) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    const value = option.kind === "boolean"
      ? (input as HTMLInputElement).checked ? "" : null
      : input.value || null
    this.dispatchMediaResourceAction({
      action: "set-attribute",
      resource,
      index: row.index,
      expected: row.attributes,
      attribute: option.name,
      value,
    })
  }

  private renderMediaResourceAttribute(
    resource: TimedMediaResourceType,
    row: TimedMediaResourceState,
    option: MediaAttributeOption,
  ) {
    const label = `${resource === "source" ? "Source" : "Track"}: ${option.label}`
    if(option.kind === "boolean") return html`
      <label class="media-attribute media-attribute-boolean">
        <span>${option.label}</span>
        <input
          type="checkbox"
          data-ribbon-input-persistent
          aria-label=${label}
          .checked=${Object.hasOwn(row.attributes, option.name)}
          @change=${(event: Event) => this.dispatchMediaResourceAttribute(resource, row, option, event)}
        />
      </label>
    `
    if(option.kind === "select") return html`
      <label class="media-attribute">
        <span>${option.label}</span>
        <select
          data-ribbon-input-persistent
          aria-label=${label}
          @change=${(event: Event) => this.dispatchMediaResourceAttribute(resource, row, option, event)}
        >
          ${option.options?.map(item => html`
            <option
              value=${item.value}
              ?selected=${item.value === (row.attributes[option.name] ?? option.options?.[0]?.value)}
            >${item.label}</option>
          `)}
        </select>
      </label>
    `
    return html`
      <label class="media-attribute">
        <span>${option.label}</span>
        <input
          data-ribbon-input-persistent
          type=${option.kind === "url" ? "url" : "text"}
          aria-label=${label}
          placeholder=${option.placeholder ?? ""}
          .value=${row.attributes[option.name] ?? ""}
          @change=${(event: Event) => this.dispatchMediaResourceAttribute(resource, row, option, event)}
        />
      </label>
    `
  }

  private renderMediaResourceList(resource: TimedMediaResourceType, rows: TimedMediaResourceState[]) {
    const singular = resource === "source" ? "source" : "track"
    const heading = resource === "source" ? "Sources" : "Text tracks"
    return html`
      <section class="media-resource-editor" aria-label=${heading}>
        <div class="media-resource-heading">
          <span>${heading}</span>
          <button
            class="media-resource-add"
            type="button"
            @click=${() => this.dispatchMediaResourceAction({action: "add", resource})}
          >Add ${singular}</button>
        </div>
        ${rows.map((row, position) => html`
          <div class="media-resource-card" data-resource=${resource}>
            <div class="media-resource-card-heading">
              <span>${resource === "source" ? "Source" : "Track"} ${position + 1}</span>
              <span class="media-resource-card-actions">
                <button
                  class="media-resource-action"
                  type="button"
                  aria-label=${`Move ${singular} ${position + 1} up`}
                  ?disabled=${position === 0}
                  @click=${() => this.dispatchMediaResourceAction({
                    action: "move", resource, index: row.index, expected: row.attributes, direction: -1,
                  })}
                >↑</button>
                <button
                  class="media-resource-action"
                  type="button"
                  aria-label=${`Move ${singular} ${position + 1} down`}
                  ?disabled=${position === rows.length - 1}
                  @click=${() => this.dispatchMediaResourceAction({
                    action: "move", resource, index: row.index, expected: row.attributes, direction: 1,
                  })}
                >↓</button>
                <button
                  class="media-resource-action"
                  type="button"
                  aria-label=${`Remove ${singular} ${position + 1}`}
                  @click=${() => this.dispatchMediaResourceAction({
                    action: "remove", resource, index: row.index, expected: row.attributes,
                  })}
                >×</button>
              </span>
            </div>
            ${timedMediaResourceAttributeOptions[resource]
              .map(option => this.renderMediaResourceAttribute(resource, row, option))}
          </div>
        `)}
      </section>
    `
  }

  private renderTimedMediaResources() {
    if(!this.media || this.media.type !== "audio" && this.media.type !== "video") return nothing
    const fallbackHTML = this.media.fallbackHTML ?? ""
    return html`
      ${this.renderMediaResourceList("source", this.media.sources ?? [])}
      ${this.renderMediaResourceList("track", this.media.tracks ?? [])}
      <section class="media-resource-editor" aria-label="Fallback content">
        <label class="media-attribute">
          <span>Fallback content</span>
          <textarea
            class="media-fallback-input"
            data-ribbon-input-persistent
            aria-label="Fallback content"
            placeholder="Content shown when this media cannot be played"
            .value=${fallbackHTML}
            @change=${(event: Event) => this.dispatchMediaResourceAction({
              action: "set-fallback",
              html: (event.currentTarget as HTMLTextAreaElement).value,
              expectedHTML: fallbackHTML,
            })}
          ></textarea>
        </label>
        <p class="media-fallback-help">Shown when the browser cannot play this media. Basic HTML is supported.</p>
      </section>
    `
  }

  private renderMediaDrawer() {
    if(!this.media) return nothing
    const selectedType = this.media.type
    const label = this.mediaLabel(selectedType)
    return html`
      <ribbon-drawer label=${label} icon=${label} layout="media">
        <div class="media-toolbox-controls" role="group" aria-label=${`${label} options`}>
          ${this.figure ? this.renderFigureCaptionControls() : html`
            <ribbon-button label="Convert to figure" action="media-to-figure" icon="Section"></ribbon-button>
          `}
          ${selectedType === "picture" || selectedType === "img" ? html`
            <button
              class="media-type-switch"
              type="button"
              @click=${() => this.dispatchEvent(new CustomEvent("media-type-change", {
                detail: {type: selectedType === "picture" ? "img" : "picture"},
                bubbles: true,
                composed: true,
              }))}
            >Use &lt;${selectedType === "picture" ? "img" : "picture"}&gt;</button>
          ` : ""}
          ${isWebsiteType(selectedType) ? html`
            <label class="mark-attribute media-attribute">
              <span>Element</span>
              <select
                data-ribbon-input-persistent
                aria-label="Website: Element"
                @change=${(event: Event) => this.dispatchEvent(new CustomEvent("media-type-change", {
                  detail: {type: (event.currentTarget as HTMLSelectElement).value},
                  bubbles: true,
                  composed: true,
                }))}
              >
                ${websiteTypes.map(website => html`
                  <option value=${website} ?selected=${website === selectedType}>&lt;${website}&gt;</option>
                `)}
              </select>
            </label>
          ` : ""}
          ${mediaAttributeOptions[selectedType].map(option => this.renderMediaAttribute(selectedType, option))}
          ${this.renderTimedMediaResources()}
        </div>
      </ribbon-drawer>
    `
  }

  private setTableGridSize(rows: number, columns: number) {
    this.tableGridRows = rows
    this.tableGridColumns = columns
    this.requestUpdate()
  }

  private insertTableSize(rows: number, columns: number) {
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

  private dispatchTableStyle(property: string, value: string) {
    this.dispatchEvent(new CustomEvent("table-style-change", {
      detail: {property, value},
      bubbles: true,
      composed: true,
    }))
  }

  private renderTableBorderControls() {
    const disabled = !this.table?.active
    return html`
      <div class="table-inline-controls table-border-controls" role="group" aria-label="Cell borders">
        <label class="table-parameter">
          <span>Style</span>
          <select
            data-ribbon-input-persistent
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("border-style", (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
            <option value="none">None</option>
          </select>
        </label>
        <label class="table-parameter">
          <span>Width</span>
          <select
            data-ribbon-input-persistent
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("border-width", (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="1px">1 px</option>
            <option value="2px">2 px</option>
            <option value="3px">3 px</option>
            <option value="4px">4 px</option>
          </select>
        </label>
        <label class="table-parameter">
          <span>Color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            value="#000000"
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("border-color", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button class="table-clear-button" type="button" ?disabled=${disabled}
          @click=${() => this.dispatchTableStyle("border-style", "")}>Clear borders</button>
      </div>
    `
  }

  private renderTableBackgroundControls() {
    const disabled = !this.table?.active
    return html`
      <div class="table-inline-controls table-background-controls" role="group" aria-label="Cell background">
        <label class="table-parameter">
          <span>Color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            value="#ffffff"
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("background-color", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button class="table-clear-button" type="button" ?disabled=${disabled}
          @click=${() => this.dispatchTableStyle("background-color", "")}>Clear background</button>
      </div>
    `
  }

  private toggleTableCaption = () => {
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: "table-caption"},
      bubbles: true,
      composed: true,
    }))
  }

  private dispatchGraphicParameter(name: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    this.dispatchGraphicParameterValue(name, input.value)
  }

  private dispatchGraphicParameterValue(name: string, value: string) {
    this.dispatchEvent(new CustomEvent("graphic-parameter-change", {
      detail: {name, value},
      bubbles: true,
      composed: true,
    }))
  }

  private graphicNumberInput(name: string, label: string, options: {
    min?: number
    max?: number
    step?: number
    disabled?: boolean
  } = {}) {
    const parameters = this.graphic?.parameters ?? {}
    const selectionCount = this.graphic?.selectionCount ?? (this.graphic?.shape ? 1 : 0)
    const shared = name === "stroke-width" || name === "opacity"
    return html`
      <label class="mark-attribute graphic-parameter">
        <span>${label}</span>
        <input
          data-ribbon-input-persistent
          type="number"
          aria-label=${`Graphic: ${label}`}
          .value=${parameters[name] ?? ""}
          min=${options.min ?? nothing}
          max=${options.max ?? nothing}
          step=${options.step ?? 1}
          ?disabled=${options.disabled || (shared ? selectionCount < 1 : !this.graphic?.shape)}
          @change=${(event: Event) => this.dispatchGraphicParameter(name, event)}
        />
      </label>
    `
  }

  private renderGraphicPaintControls(kind: "fill" | "stroke") {
    const parameters = this.graphic?.parameters ?? {}
    const selectionCount = this.graphic?.selectionCount ?? (this.graphic?.shape ? 1 : 0)
    const value = parameters[kind]
    const color = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : kind === "fill" ? "#ffffff" : "#334155"
    const disabled = selectionCount < 1 || kind === "fill" && selectionCount === 1
      && (this.graphic?.shape === "line" || this.graphic?.shape === "connector")
    return html`
      <label class="mark-attribute graphic-parameter">
        <span>${kind === "fill" ? "Fill" : "Stroke"}</span>
        <input
          data-ribbon-input-persistent
          type="color"
          aria-label=${`Graphic: ${kind === "fill" ? "Fill" : "Stroke"} color`}
          .value=${color}
          ?disabled=${disabled}
          @change=${(event: Event) => this.dispatchGraphicParameter(kind, event)}
        />
      </label>
      ${kind === "stroke" ? this.graphicNumberInput("stroke-width", "Stroke width", {min: 0, step: 1}) : ""}
      ${kind === "fill" ? this.graphicNumberInput("opacity", "Opacity", {min: 0, max: 1, step: 0.05}) : ""}
    `
  }

  private renderGraphicGeometryControls() {
    const connectorSelected = this.graphic?.shape === "connector"
    return html`
      <div class="graphic-inline-controls graphic-geometry-controls" role="group" aria-label="Graphic geometry">
        ${this.renderGraphicPaintControls("fill")}
        ${this.renderGraphicPaintControls("stroke")}
        ${this.graphicNumberInput("x", "X")}
        ${this.graphicNumberInput("y", "Y")}
        ${this.graphicNumberInput("width", "Width", {min: 1})}
        ${this.graphicNumberInput("height", "Height", {min: 1})}
        ${this.graphicNumberInput("rotation", "Rotation", {step: 1, disabled: connectorSelected})}
        ${this.graphic?.shape === "rectangle"
          ? this.graphicNumberInput("corner-radius", "Corner radius", {min: 0})
          : ""}
        ${this.graphic?.shape === "hexagon"
          ? this.graphicNumberInput("inset", "Corner inset", {min: 0})
          : ""}
        ${this.graphic?.shape === "star"
          ? this.graphicNumberInput("inner-radius", "Inner radius", {min: 5, max: 90, step: 1})
          : ""}
        ${this.graphic?.shape === "arrow" ? html`
          ${this.graphicNumberInput("head-size", "Head size", {min: 15, max: 80, step: 1})}
          ${this.graphicNumberInput("tail-width", "Tail width", {min: 10, max: 90, step: 1})}
        ` : ""}
      </div>
    `
  }

  private renderGraphicConnectorControls(disabled: boolean) {
    const parameters = this.graphic?.parameters ?? {}
    return html`
      <div class="graphic-inline-controls graphic-connector-controls" role="group" aria-label="Connector settings">
        <label class="mark-attribute graphic-parameter">
          <span>Routing</span>
          <select
            data-ribbon-input-persistent
            aria-label="Graphic: Connector routing"
            .value=${parameters.routing ?? "orthogonal"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameter("routing", event)}
          >
            <option value="straight">Straight</option>
            <option value="orthogonal">Orthogonal</option>
          </select>
        </label>
        <label class="mark-attribute graphic-parameter graphic-boolean-parameter">
          <span>Start arrow</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label="Graphic: Start arrow"
            .checked=${parameters["start-arrow"] === "true"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameterValue(
              "start-arrow",
              String((event.currentTarget as HTMLInputElement).checked),
            )}
          />
        </label>
        <label class="mark-attribute graphic-parameter graphic-boolean-parameter">
          <span>End arrow</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label="Graphic: End arrow"
            .checked=${parameters["end-arrow"] === "true"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameterValue(
              "end-arrow",
              String((event.currentTarget as HTMLInputElement).checked),
            )}
          />
        </label>
      </div>
    `
  }

  private renderGraphicLabelControls(disabled: boolean) {
    const parameters = this.graphic?.parameters ?? {}
    return html`
      <div class="graphic-inline-controls graphic-text-controls" role="group" aria-label="Shape text">
        <label class="mark-attribute graphic-parameter graphic-label-parameter">
          <span>Label</span>
          <textarea
            data-ribbon-input-persistent
            rows="3"
            aria-label="Graphic: Label"
            .value=${parameters.label ?? ""}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameter("label", event)}
          ></textarea>
        </label>
        <label class="mark-attribute graphic-parameter">
          <span>Color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            aria-label="Graphic: Text color"
            .value=${/^#[0-9a-f]{6}$/i.test(parameters["text-color"] ?? "") ? parameters["text-color"] : "#0f172a"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameter("text-color", event)}
          />
        </label>
        ${this.graphicNumberInput("font-size", "Font size", {min: 1, step: 1, disabled})}
      </div>
    `
  }

  private dispatchGraphicLayer(operation: GraphicLayerOperation, index: number) {
    this.dispatchEvent(new CustomEvent("graphic-layer-action", {
      detail: {operation, index},
      bubbles: true,
      composed: true,
    }))
  }

  private renderGraphicLayersControls(disabled: boolean) {
    const layers = [...(this.graphic?.layers ?? [])].reverse()
    const primary = layers.find(layer => layer.primary) ?? layers.find(layer => layer.selected)
    return html`
      <div class="graphic-layers-inline" role="group" aria-label="Graphic layers">
        <div class="graphic-layer-list" role="list">
          ${layers.length ? layers.map(layer => html`
            <div
              class="graphic-layer-row"
              role="listitem"
              data-selected=${String(layer.selected)}
              data-layer-index=${layer.index}
            >
              <button
                class="graphic-layer-select"
                type="button"
                title=${layer.label}
                aria-label=${`Select ${layer.label}`}
                ?disabled=${disabled || layer.locked || !layer.visible}
                @click=${() => this.dispatchGraphicLayer("select", layer.index)}
              >
                <span class="graphic-layer-icon">${ribbonIcon(
                  graphicShapeOptions.find(option => option.type === layer.type)?.icon ?? "Graphic",
                )}</span>
                <span>${layer.label}</span>
              </button>
              <button
                class="graphic-layer-action"
                type="button"
                aria-label=${`${layer.visible ? "Hide" : "Show"} ${layer.label}`}
                title=${layer.visible ? "Hide layer" : "Show layer"}
                ?disabled=${disabled}
                @click=${() => this.dispatchGraphicLayer("toggle-visibility", layer.index)}
              >${ribbonIcon(layer.visible ? "Visible" : "Hidden")}</button>
              <button
                class="graphic-layer-action"
                type="button"
                aria-label=${`${layer.locked ? "Unlock" : "Lock"} ${layer.label}`}
                title=${layer.locked ? "Unlock layer" : "Lock layer"}
                ?disabled=${disabled}
                @click=${() => this.dispatchGraphicLayer("toggle-lock", layer.index)}
              >${ribbonIcon(layer.locked ? "Lock" : "Unlock")}</button>
            </div>
          `) : html`<span class="button-dropdown-empty">This graphic has no shapes yet.</span>`}
        </div>
        <div class="graphic-layer-toolbar" role="group" aria-label="Layer order">
          ${([
            ["send-back", "Back"],
            ["move-down", "Down"],
            ["move-up", "Up"],
            ["bring-front", "Front"],
          ] as const).map(([operation, label]) => html`
            <button
              class="graphic-layer-order"
              type="button"
              aria-label=${`${label} layer`}
              ?disabled=${disabled || !primary}
              @click=${() => primary && this.dispatchGraphicLayer(operation, primary.index)}
            >${label}</button>
          `)}
        </div>
      </div>
    `
  }

  private renderGraphicArrangeControls(selectionCount: number, shapesSelected: boolean, captured: boolean) {
    const actionGroup = (
      label: string,
      className: string,
      buttons: typeof graphicAlignButtons,
      disabled: boolean,
    ) => html`
      <div class=${`graphic-arrange-action-group ${className}`} role="group" aria-label=${label}>
        ${buttons.map(button => typeof button === "string" ? nothing : html`
          <ribbon-button
            compact
            label=${button.label}
            action=${button.action}
            icon=${button.icon}
            ?disabled=${disabled}
          ></ribbon-button>
        `)}
      </div>
    `
    return html`
      <div class="graphic-inline-controls graphic-arrange-controls">
        <div class="graphic-arrange-actions" aria-label="Arrange shapes">
          ${actionGroup("Align shapes", "graphic-align-actions", graphicAlignButtons, selectionCount < 2)}
          ${actionGroup("Distribute shapes", "graphic-distribute-actions", graphicDistributeButtons, selectionCount < 3)}
          ${actionGroup("Order shapes", "graphic-order-actions", graphicOrderButtons, !shapesSelected)}
        </div>
        ${this.renderGraphicLayersControls(!captured)}
      </div>
    `
  }

  private dispatchGraphicViewport(operation: GraphicViewportOperation, zoom?: number) {
    this.dispatchEvent(new CustomEvent("graphic-viewport-action", {
      detail: {operation, ...(zoom === undefined ? {} : {zoom})},
      bubbles: true,
      composed: true,
    }))
  }

  private renderGraphicViewportDropdown() {
    const zoom = this.graphic?.viewport?.zoom ?? 100
    return html`
      <div class="button-dropdown-form graphic-zoom-dropdown" role="group" aria-label="Graphic zoom">
        <div class="graphic-zoom-stepper">
          <button class="graphic-zoom-action" type="button" aria-label="Zoom out"
            @click=${() => this.dispatchGraphicViewport("zoom-out")}>−</button>
          <output class="graphic-zoom-value" aria-live="polite">${zoom}%</output>
          <button class="graphic-zoom-action" type="button" aria-label="Zoom in"
            @click=${() => this.dispatchGraphicViewport("zoom-in")}>+</button>
        </div>
        <input
          data-ribbon-input-persistent
          type="range"
          aria-label="Graphic zoom percentage"
          min="25"
          max="400"
          step="5"
          .value=${String(zoom)}
          @change=${(event: Event) => this.dispatchGraphicViewport(
            "set-zoom",
            Number((event.currentTarget as HTMLInputElement).value),
          )}
        />
        <div class="graphic-zoom-presets">
          <button class="graphic-zoom-action" type="button"
            @click=${() => this.dispatchGraphicViewport("actual-size")}>100%</button>
          <button class="graphic-zoom-action" type="button"
            @click=${() => this.dispatchGraphicViewport("fit-content")}>Fit content</button>
        </div>
        <p class="graphic-navigation-hint">
          ${isOnApple() ? "⌘" : "Ctrl"} + wheel to zoom · Space or middle-drag to pan
        </p>
      </div>
    `
  }

  private renderGraphicDrawer() {
    if(!this.graphic?.active) return nothing
    const captured = Boolean(this.graphic?.capture)
    const selectionCount = this.graphic.selectionCount ?? (this.graphic.shape ? 1 : 0)
    const shapeSelected = selectionCount === 1 && Boolean(this.graphic.shape)
    const connectorSelected = shapeSelected && this.graphic.shape === "connector"
    const labelableShapeSelected = shapeSelected && this.graphic.shape !== "line" && this.graphic.shape !== "connector"
    const shapesSelected = selectionCount > 0
    const options = this.graphic.options
    return html`
      <ribbon-drawer label="Graphic" icon="Graphic" layout="graphic">
        ${graphicShapeOptions.map(option => html`
          <ribbon-button
            label=${option.label}
            action=${`add-graphic-shape:${option.type}`}
            icon=${option.icon}
            ?disabled=${!captured}
          ></ribbon-button>
        `)}
      </ribbon-drawer>
      <ribbon-drawer label="Geometry" icon="Geometry" layout="graphic-geometry">
        ${this.renderGraphicGeometryControls()}
      </ribbon-drawer>
      <ribbon-drawer label="Text" icon="Text" layout="graphic-text">
        ${this.renderGraphicLabelControls(!labelableShapeSelected)}
      </ribbon-drawer>
      <ribbon-drawer label="Connector" icon="Connector" layout="graphic-connector">
        ${this.renderGraphicConnectorControls(!connectorSelected)}
      </ribbon-drawer>
      <ribbon-drawer label="Arrange" icon="Align" layout="graphic-arrange">
        ${this.renderGraphicArrangeControls(selectionCount, shapesSelected, captured)}
      </ribbon-drawer>
      <ribbon-drawer label="Canvas" icon="Guides" layout="graphic-canvas">
        <ribbon-button
          label="Grid"
          action="toggle-graphic-option:grid"
          icon="Guides"
          toggle
          .active=${options?.grid ?? true}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label="Snap"
          action="toggle-graphic-option:snap"
          icon="Align"
          toggle
          .active=${options?.snap ?? true}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label="Guides"
          action="toggle-graphic-option:guides"
          icon="Guides"
          toggle
          .active=${options?.guides ?? true}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label=${`${this.graphic.viewport?.zoom ?? 100}%`}
          icon="Zoom"
          .dropdown=${this.renderGraphicViewportDropdown()}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label="Fit"
          action="navigate-graphic:fit-content"
          icon="Fullscreen"
          ?disabled=${!captured}
        ></ribbon-button>
      </ribbon-drawer>
    `
  }

  private renderTableDrawers() {
    const active = Boolean(this.table?.active)
    return html`
      <ribbon-drawer label="Layout" icon="TableLayout" layout="table-layout">
        <ribbon-button label="Row above" action="table-row-above" icon="TableRowAbove" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Row below" action="table-row-below" icon="TableRowBelow" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column left" action="table-column-left" icon="TableColumnLeft" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column right" action="table-column-right" icon="TableColumnRight" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Merge cells" action="table-merge-cells" icon="TableMergeCells" ?disabled=${!this.table?.canMerge}></ribbon-button>
        <ribbon-button label="Split cells" action="table-split-cells" icon="TableSplitCells" ?disabled=${!this.table?.canSplit}></ribbon-button>
        <ribbon-button label="Split table" action="table-split" icon="TableSplit" ?disabled=${!active}></ribbon-button>
        <label class="table-caption-toggle">
          <span class="table-caption-icon" aria-hidden="true">${ribbonIcon("TableCaption")}</span>
          <span><input
            type="checkbox"
            data-ribbon-input-persistent
            .checked=${this.table?.hasCaption ?? false}
            ?disabled=${!active}
            @change=${this.toggleTableCaption}
          /> Caption</span>
        </label>
      </ribbon-drawer>
      <ribbon-drawer label="Borders" icon="TableBorders" layout="table-borders">
        ${this.renderTableBorderControls()}
      </ribbon-drawer>
      <ribbon-drawer label="Background" icon="TableBackground" layout="table-background">
        ${this.renderTableBackgroundControls()}
      </ribbon-drawer>
    `
  }

  private renderFormDrawer() {
    if(!this.form) return nothing
    const state = this.form
    return html`
      <ribbon-drawer label=${state.type === "input" ? "Input" : state.type === "textarea" ? "Text area" : "Form"} icon="Form" layout="form">
        <ribbon-button label="Attributes" icon="Settings" .dropdown=${this.renderFormEditor()}></ribbon-button>
        <ribbon-button label="Add field" action="form-add-field" icon="Plus" ?disabled=${!state.canAddField}></ribbon-button>
        <ribbon-button label="Add legend" action="form-add-legend" icon="Plus" ?disabled=${!state.canAddLegend}></ribbon-button>
        <ribbon-button label="Add option" action="form-add-option" icon="Plus" ?disabled=${!state.canAddOption}></ribbon-button>
        <ribbon-button label="Add group" action="form-add-option-group" icon="Plus" ?disabled=${!state.canAddOptionGroup}></ribbon-button>
        <ribbon-button label="Custom select" action="form-customize-select" icon="Dropdown" ?disabled=${!state.canCustomizeSelect}></ribbon-button>
      </ribbon-drawer>
    `
  }

  private dispatchDialogAttribute(attribute: string, value: string | null) {
    this.dispatchEvent(new CustomEvent("dialog-attribute-change", {
      detail: {attribute, value},
      bubbles: true,
      composed: true,
    }))
  }

  private renderDialogEditor() {
    const state = this.dialog
    if(!state) return nothing
    return html`
      <div class="button-dropdown-form form-dropdown-form" role="group" aria-label="Dialog options">
        <label class="mark-attribute form-attribute form-attribute-boolean">
          <span>Initially open (non-modal)</span>
          <input
            type="checkbox"
            data-ribbon-input-persistent
            aria-label="Dialog: Initially open (non-modal)"
            .checked=${state.initiallyOpen}
            @change=${(event: Event) => this.dispatchDialogAttribute(
              "open",
              (event.currentTarget as HTMLInputElement).checked ? "" : null,
            )}
          />
        </label>
        <label class="mark-attribute form-attribute">
          <span>Close behavior</span>
          <select
            data-ribbon-input-persistent
            aria-label="Dialog: Close behavior"
            .value=${state.closedBy}
            @change=${(event: Event) => this.dispatchDialogAttribute(
              "closedby",
              (event.currentTarget as HTMLSelectElement).value || null,
            )}
          >
            <option value="" ?selected=${state.closedBy === ""}>Browser default</option>
            ${dialogClosedByValues.map(value => html`<option value=${value} ?selected=${state.closedBy === value}>${value}</option>`)}
          </select>
        </label>
        ${[
          ["id", "ID", "dialog-id"],
          ["aria-label", "Accessible label", "Dialog title"],
          ["aria-labelledby", "Labelled by", "heading-id"],
          ["title", "Title", ""],
        ].map(([attribute, label, placeholder]) => html`
          <label class="mark-attribute form-attribute">
            <span>${label}</span>
            <input
              data-ribbon-input-persistent
              type="text"
              aria-label=${`Dialog: ${label}`}
              placeholder=${placeholder}
              .value=${state.attributes[attribute] ?? ""}
              @change=${(event: Event) => this.dispatchDialogAttribute(
                attribute,
                (event.currentTarget as HTMLInputElement).value || null,
              )}
            />
          </label>
        `)}
      </div>
    `
  }

  private renderDialogDrawer() {
    if(!this.dialog) return nothing
    return html`
      <ribbon-drawer label="Dialog" icon="Details" layout="form">
        <ribbon-button label="Attributes" icon="Settings" .dropdown=${this.renderDialogEditor()}></ribbon-button>
        <ribbon-button label="Add opener" action="dialog-add-invoker" icon="Plus"></ribbon-button>
        <ribbon-button label="Add close button" action="dialog-add-close" icon="Plus"></ribbon-button>
      </ribbon-drawer>
    `
  }

  private renderElementAttributesDrawer() {
    if(!this.elementAttributes) return nothing
    return html`
      <ribbon-drawer label="Attributes" icon=${this.elementAttributes.icon ?? "Develop"} layout="attributes">
        <element-attribute-editor .state=${this.elementAttributes}></element-attribute-editor>
      </ribbon-drawer>
    `
  }

  private renderInsertionDrawer(drawer: RibbonMenuGroup) {
    const buttonLabel = (button: RibbonMenuButton) => typeof button === "string" ? button : button.label
    const buttonByLabel = (label: string) => {
      const button = drawer.buttons.find(candidate => buttonLabel(candidate) === label)
      if(!button) throw new TypeError(`Missing insertion button ${label}`)
      return button
    }
    const groupedButton = (label: string, icon: string, labels: string[]): RibbonMenuButton => {
      const submenu = labels.map(buttonByLabel)
      const representative = submenu[0]
      return {
        label,
        icon,
        action: typeof representative === "string" ? representative : representative.action ?? representative.label,
        submenu,
      }
    }
    const compactButtons: RibbonMenuButton[] = [
      groupedButton("Text", "Text", ["Paragraph", "Section", "Heading", "List"]),
      groupedButton("Media", "Image", ["Image", "Audio", "Video", "Graphic", "Formula", "Website"]),
      buttonByLabel("Table"),
      groupedButton("Other", "More", ["Form", "HTML", "Details"]),
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
      const active = type
        ? this.mediaSelectionMatches(type)
        : item.label === "List" && this.listType !== null
      const tableDropdown = item.label === "Table" ? this.renderTableSizePicker() : null
      const sectionDropdown = item.label === "Section" ? this.renderSectionDropdown() : null
      return html`
        <ribbon-button
          slot=${slot}
          label=${item.label}
          .action=${item.action ?? item.label}
          .icon=${item.icon ?? item.label}
          .submenu=${type || tableDropdown || sectionDropdown ? [] : submenu}
          .dropdown=${tableDropdown ?? sectionDropdown}
          ?toggle=${item.label === "List" || item.label === "Section"}
          ?active=${item.label === "Section" ? this.sectionActive : active}
          ?disabled=${item.label === "Section" && !this.canSection}
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

  private commandShortcut(action: string) {
    const command = appCommands.find(candidate => candidate.action === action)
    return command ? formatShortcut(this.settings.shortcuts[command.id] ?? "") : ""
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

  private renderSettingsDrawer() {
    return html`
      <ribbon-drawer label="Settings" icon="Settings" layout="settings" collapsed>
        <settings-panel
          .settings=${this.settings}
          @settings-change=${this.handleSettingsChange}
        ></settings-panel>
      </ribbon-drawer>
    `
  }

  private renderDocumentHeadDrawer() {
    return html`
      <ribbon-drawer
        label="Metadata"
        icon="Properties"
        layout="document-head"
        expandable
        @ribbon-drawer-state-change=${(event: CustomEvent<{open: boolean}>) => {
          this.documentHeadDrawerOpen = event.detail.open
          if(!event.detail.open) this.documentHeadAttributeEditorId = ""
        }}
        @document-head-element-options-request=${(event: CustomEvent<{id: string}>) => {
          this.documentHeadAttributeEditorId = event.detail.id
        }}
      >
        <document-head-editor
          mode="common"
          .state=${this.documentHead}
          .expanded=${this.documentHeadDrawerOpen}
          .attributeEditorId=${this.documentHeadAttributeEditorId}
        ></document-head-editor>
        <document-head-editor
          slot="more"
          mode="advanced"
          .state=${this.documentHead}
          .attributeEditorId=${this.documentHeadAttributeEditorId}
        ></document-head-editor>
      </ribbon-drawer>
    `
  }

  private sharingButton() {
    return this.renderRoot.querySelector<RibbonButton>(
      'ribbon-drawer[label="Sharing"] ribbon-button[label="Share"]',
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
            aria-label="Copy"
            title=${this.sharingCopyQRSuccess ? "Copied QR code" : "Copy"}
          >${ribbonIcon("Copy")}</button>
          <button
            class=${`button-dropdown-more sharing-dropdown-action${this.sharingDownloadQRActive ? " is-active" : ""}`}
            type="button"
            aria-pressed=${this.sharingDownloadQRActive}
            @click=${() => void this.downloadSharingQRCodeAndShowFeedback()}
            aria-label="Download"
            title="Download"
          >${ribbonIcon("Download")}</button>
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

  private renderSharingDrawer(drawer: RibbonMenuGroup) {
    const link = this.sharingLink
    return html`
      <ribbon-drawer label="Sharing" icon="Share" layout="sharing">
        ${drawer.buttons.map(button => {
          const item = typeof button === "string" ? {label: button} : button
          if(item.label === "Share") return html`
            <ribbon-button
              class="sharing-qr"
              label="Share"
              action="Share"
              variant="qr"
              .qrValue=${link}
              .dropdown=${this.renderSharingDropdown(link)}
              keep-drawer-open
              dropdown-no-scroll
              @ribbon-button-click=${this.handleSharingButtonClick}
              @ribbon-dropdown-open=${() => void this.ensureSharingQRCodeImage(link)}
            ></ribbon-button>
          `
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

  private renderLearnersDrawer() {
    const enabledCount = this.liveLearners.filter(learner => learner.enabled).length
    const visibleAvatars = this.liveLearners.filter(learner => learner.enabled).slice(0, 4)
    return html`
      <ribbon-drawer label="Learners" icon="Plus" layout="learners" expandable>
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

  private renderElementStyleDrawer(category: ElementStyleCategory) {
    return html`
      <ribbon-drawer
        label=${category.label}
        icon=${category.icon}
        layout="element-style"
        expandable
      >
        <element-style-editor
          mode="basic"
          .orientation=${this.elementStyleEditorOrientation}
          .definitions=${category.basic}
          .state=${this.elementStyle}
        ></element-style-editor>
        <element-style-editor
          slot="more"
          mode="advanced"
          .orientation=${this.elementStyleEditorOrientation}
          .definitions=${category.advanced}
          .state=${this.elementStyle}
          ?allow-custom=${category.id === "other"}
        ></element-style-editor>
      </ribbon-drawer>
    `
  }

  protected get elementStyleEditorOrientation(): "horizontal" | "vertical" {
    return "horizontal"
  }

  private get selectedHistoryCheckpointId() {
    return this.historyState.preview?.checkpointId
      ?? this.historyState.currentCheckpointId
      ?? this.historyState.checkpoints[0]?.id
      ?? null
  }

  private scrollNewHistoryCardIntoView(previousState: unknown) {
    if(this.activeMenu !== "History") return
    const previousCheckpoints = previousState && typeof previousState === "object"
      && Array.isArray((previousState as Partial<VersionHistoryState>).checkpoints)
      ? (previousState as VersionHistoryState).checkpoints
      : []
    const previousIds = new Set(previousCheckpoints.map(checkpoint => checkpoint.id))
    const added = this.historyState.checkpoints.filter(checkpoint => !previousIds.has(checkpoint.id))
    if(!added.length) return
    const checkpoint = added.find(candidate => candidate.id === this.historyState.currentCheckpointId) ?? added[0]
    const card = Array.from(this.renderRoot.querySelectorAll<HTMLElement>(".history-version-card"))
      .find(candidate => candidate.dataset.checkpointId === checkpoint.id)
    card?.scrollIntoView({
      behavior: previousCheckpoints.length ? "smooth" : "auto",
      block: "nearest",
      inline: "nearest",
    })
  }

  private historyTime(timestamp: number) {
    return new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"}).format(new Date(timestamp))
  }

  private historyDate(timestamp: number) {
    return new Intl.DateTimeFormat(undefined, {dateStyle: "medium"}).format(new Date(timestamp))
  }

  private historyTimestamp(timestamp: number) {
    return `${this.historyTime(timestamp)} · ${this.historyDate(timestamp)}`
  }

  private historyAuthor(user: VersionHistoryState["checkpoints"][number]["user"]) {
    return user.clientId === this.historyState.currentUserId ? "you" : user.name
  }

  private selectHistoryCheckpoint = (event: Event) => {
    const checkpointId = (event.currentTarget as HTMLElement).dataset.checkpointId
    if(!checkpointId) return
    this.dispatchEvent(new CustomEvent("history-checkpoint-select", {
      detail: {checkpointId},
      bubbles: true,
      composed: true,
    }))
  }

  private revertHistoryCheckpoint = (event: Event) => {
    const checkpointId = (event.currentTarget as HTMLElement).dataset.checkpointId
    if(!checkpointId) return
    this.dispatchEvent(new CustomEvent("history-revert", {
      detail: {checkpointId},
      bubbles: true,
      composed: true,
    }))
  }

  private renderHistoryVersionsDrawer() {
    const selectedId = this.selectedHistoryCheckpointId
    const checkpoints = [...this.historyState.checkpoints].reverse()
    const currentIndex = checkpoints.findIndex(checkpoint =>
      checkpoint.id === this.historyState.currentCheckpointId,
    )
    return html`
      <ribbon-drawer label="Versions" icon="History" layout="history-versions">
        <div class="history-timeline" role="list" aria-label="Document versions">
          ${this.historyError ? html`<div class="history-error" role="alert">${this.historyError}</div>`
          : this.historyLoading && !this.historyState.checkpoints.length
            ? html`<div class="history-loading">Loading versions…</div>`
            : !this.historyState.checkpoints.length
              ? html`<div class="history-empty">No checkpoints yet</div>`
              : checkpoints.map((checkpoint, index) => html`
                <div
                  class="history-version-card"
                  role="listitem"
                  data-checkpoint-id=${checkpoint.id}
                  ?data-selected=${selectedId === checkpoint.id}
                  ?data-after-current=${currentIndex >= 0 && index > currentIndex}
                >
                  <button
                    class="history-checkpoint"
                    type="button"
                    data-checkpoint-id=${checkpoint.id}
                    aria-pressed=${selectedId === checkpoint.id}
                    title=${checkpoint.label}
                    @click=${this.selectHistoryCheckpoint}
                  >
                    <span
                      class="history-checkpoint-avatar"
                      style=${`--history-user-color: ${checkpoint.user.color}`}
                      aria-hidden="true"
                    >${checkpoint.user.initials}</span>
                    <span class="history-checkpoint-label">${this.historyTimestamp(checkpoint.timestamp)}</span>
                    <span class="history-checkpoint-meta">By ${this.historyAuthor(checkpoint.user)}</span>
                    <span class="history-checkpoint-counts" aria-label=${`${checkpoint.changes.added} added, ${checkpoint.changes.removed} removed, ${checkpoint.changes.modified} changed`}>
                      <span class="history-count" data-kind="added">+${checkpoint.changes.added}</span>
                      <span class="history-count" data-kind="removed">−${checkpoint.changes.removed}</span>
                      <span class="history-count" data-kind="modified">~${checkpoint.changes.modified}</span>
                      ${checkpoint.commentCount ? html`<span class="history-count" data-kind="comments">${checkpoint.commentCount} 💬</span>` : ""}
                    </span>
                  </button>
                  <button
                    class="history-card-restore-button"
                    type="button"
                    data-checkpoint-id=${checkpoint.id}
                    aria-label=${`Restore version from ${this.historyTimestamp(checkpoint.timestamp)}`}
                    title=${checkpoint.id === this.historyState.currentCheckpointId
                      ? "Already active"
                      : `Restore version from ${this.historyTimestamp(checkpoint.timestamp)}`}
                    ?disabled=${this.historyLoading || checkpoint.id === this.historyState.currentCheckpointId}
                    @click=${this.revertHistoryCheckpoint}
                  >
                    <span class="history-card-restore-icon" aria-hidden="true">${ribbonIcon("Restore")}</span>
                    <span>Restore</span>
                  </button>
                </div>
              `)}
        </div>
      </ribbon-drawer>
    `
  }

  protected renderDrawers() {
    if(this.previewActive && this.liveSessionActive && this.liveSessionRole === "host") {
      const sharing = menuGroups.File.find(group => group.label === "Sharing")!
      return [this.renderSharingDrawer(sharing), this.renderLearnersDrawer()]
    }
    const drawers = this.currentMenuGroups.map(drawer => {
      const styleCategory = this.activeMenu === "Style"
        ? elementStyleCategories.find(category => category.label === drawer.label)
        : undefined
      if(styleCategory) return this.renderElementStyleDrawer(styleCategory)
      if(this.activeMenu === "History" && drawer.label === "Versions") return this.renderHistoryVersionsDrawer()
      if(drawer.label === "File") return this.renderFileDrawer(drawer)
      if(drawer.label === "Sharing") return this.renderSharingDrawer(drawer)
      if(drawer.label === "Marks") return this.renderMarkDrawer()
      if(drawer.label === "Section") return this.renderSectionDrawer()
      if(drawer.label === "Heading group") return this.renderHeadingGroupDrawer()
      if(drawer.label === "List") return this.renderListDrawer()
      if(drawer.label === "Disclosure") return this.renderDisclosureDrawer()
      if(drawer.label === "Attributes") return this.renderElementAttributesDrawer()
      if(drawer.label === "Media") return this.renderMediaDrawer()
      if(drawer.label === "Dialog") return this.renderDialogDrawer()
      if(drawer.label === "Comments") return this.renderCommentDrawer()
      if(drawer.label === "Form") return this.renderFormDrawer()
      if(drawer.label === "Layout") return this.renderTableDrawers()
      if(drawer.label === "Graphic") return this.renderGraphicDrawer()
      if(drawer.label === "Packages") return this.renderPackageDrawer()
      if(drawer.label === "Local packages") return this.renderDevelopDrawer()
      if(drawer.label === "Metadata") {
        return this.activeMenu === "File" ? this.renderDocumentHeadDrawer() : this.renderMetadataDrawer()
      }
      if(drawer.label === "Development") return this.renderDevelopmentDrawer()
      if(drawer.label === "Exports") return this.renderExportsDrawer()
      if(drawer.label === "Elements") return this.renderInsertionDrawer(drawer)
      const representative = drawer.buttons[0]
      const icon = typeof representative === "string"
        ? representative
        : representative?.icon ?? representative?.action ?? representative?.label ?? drawer.label
      return html`
        <ribbon-drawer label=${drawer.label} icon=${icon} layout=${drawer.label.toLowerCase()}>
          ${drawer.buttons.map(button => {
            const item = typeof button === "string" ? {label: button} : button
            return html`
              <ribbon-button
                label=${item.label}
                .action=${item.action ?? item.label}
                .icon=${item.icon ?? item.label}
                .submenu=${item.submenu ?? []}
              ></ribbon-button>
            `
          })}
        </ribbon-drawer>
      `
    })
    return this.activeMenu === "File" ? [this.renderSettingsDrawer(), ...drawers] : drawers
  }

  protected get currentMenuGroups() {
    if(this.activeMenu === "Edit" && this.media) {
      return menuGroups.Edit.filter(group => group.label === "Media" || Boolean(this.elementAttributes) && group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.dialog) {
      return menuGroups.Edit.filter(group => group.label === "Dialog"
        || Boolean(this.form) && group.label === "Form"
        || Boolean(this.elementAttributes) && group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.form) {
      return menuGroups.Edit.filter(group => group.label === "Form" || Boolean(this.elementAttributes) && group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.graphic?.active) {
      return menuGroups.Edit.filter(group => group.label === "Graphic" || Boolean(this.elementAttributes) && group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.headingGroup) {
      return menuGroups.Edit.filter(group => group.label === "Heading group"
        || Boolean(this.elementAttributes) && group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.listType === "ol") {
      return menuGroups.Edit.filter(group => group.label === "List"
        || Boolean(this.elementAttributes) && group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.elementAttributes?.localName === "details") {
      return menuGroups.Edit.filter(group => group.label === "Disclosure" || group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.figure) {
      return menuGroups.Edit.filter(group => group.label === "Section"
        || Boolean(this.elementAttributes) && group.label === "Attributes")
    }
    if(this.activeMenu === "Edit" && this.elementAttributes) {
      return menuGroups.Edit.filter(group => group.label === "Attributes")
    }
    if(this.activeMenu !== "Start") return menuGroups[this.activeMenu]
    const packageButtons: RibbonMenuButton[] = this.availablePackages.map(pkg => {
      const members = pkg.members.filter(member => member.insertable)
      return {
        label: pkg.label,
        action: packageAction(pkg),
        submenu: members.slice(1).map(member => ({label: member.label, action: packageMemberAction(member)})),
      }
    })
    return [
      ...menuGroups[this.activeMenu],
      {label: "Packages", buttons: packageButtons},
    ]
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

  render() {
    const visibleTabs = this.previewActive ? ["File"] : menuTabs
    const activeProvider = this.activeAIProvider
    const selectedModelValue = activeProvider && this.aiModel
      ? JSON.stringify([activeProvider.id, this.aiModel])
      : ""
    const modelCount = this.aiProviders.reduce((count, provider) => count + provider.models.length, 0)
    const aiReviewPending = Boolean(this.pendingAIEdit)
    const historyPreviewPending = this.historyState.preview !== null
    return html`
      <div
        class="ribbon"
        @pointerdown=${this.handleRibbonPointerDown}
        @mousedown=${this.handleRibbonPointerDown}
        @focusin=${this.handleRibbonInputFocusIn}
        @focusout=${this.handleRibbonInputFocusOut}
        @change=${this.handleRibbonInputChange}
        @keydown=${this.handleRibbonInputKeydown}
        @ribbon-tab-select=${this.selectMenu}
        @ribbon-button-click=${this.selectLocalPackage}
      >
        <div class="ribbon-top">
          <button
            class="brand"
            ?active=${this.activeMenu === "Start" && !this.previewActive}
            type="button"
            aria-label=${this.previewActive ? "Exit preview" : "Show Start menu"}
            title=${this.previewActive ? "Exit preview" : "Show Start menu"}
            @click=${this.handleBrandClick}
          >
            ${this.logoUrl ? html`<img class="brand-logo" src=${this.logoUrl} alt="WebWriter" />` : ""}
          </button>
          <nav class="ribbon-navigation" aria-label="Editor navigation">
            <div class="tabs" role="tablist" aria-label="Editor menus" ?inert=${aiReviewPending}>
              ${visibleTabs.map(tab => html`
                <ribbon-tab
                  label=${tab}
                  .active=${this.activeMenu === tab && !this.previewActive}
                  .fileName=${tab === "File" ? this.fileName : ""}
                  .fileDirty=${tab === "File" && this.fileDirty}
                  .ribbonCollapsed=${!this.expanded || this.previewTransitioning}
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
                      label="Share"
                      action="Share"
                      compact
                      dropdown-on-click
                      lazy-dropdown
                      dropdown-no-scroll
                      .qrValue=${this.sharingLink}
                      .dropdown=${this.renderSharingDropdown(this.sharingLink)}
                      @ribbon-dropdown-open=${() => void this.ensureSharingQRCodeImage(this.sharingLink)}
                    ></ribbon-button>
                  </div>
                ` : ""}
              `)}
            </div>
            ${this.previewActive ? "" : html`<div class="ai-bar-slot" aria-hidden="true"></div>`}
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
              <div class="history-controls" role="group" aria-label="Undo, version history, and redo">
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
                  class="history-button history-tab-button"
                  type="button"
                  ?active=${this.activeMenu === "History"}
                  aria-label="History"
                  title="Version history"
                  aria-controls="ribbon-content"
                  aria-pressed=${this.activeMenu === "History"}
                  ?disabled=${aiReviewPending}
                  @click=${this.selectHistory}
                >
                  <span class="history-icon" aria-hidden="true">${ribbonIcon("History")}</span>
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
              aria-label=${this.previewActive ? "Stop live session" : "Preview"}
              title=${this.previewActive ? "Stop live session" : "Preview"}
              aria-pressed=${this.previewActive}
              ?disabled=${aiReviewPending || historyPreviewPending}
              @click=${() => this.handleTopButtonClick("Preview")}
            >
              ${this.previewActive ? html`<span class="preview-label" aria-hidden="true">LIVE</span>` : ""}
              <span class="preview-icon" aria-hidden="true">${ribbonIcon("Preview")}</span>
            </button>
            <button
              class="ribbon-toggle"
              type="button"
              aria-controls="ribbon-content"
              aria-expanded=${this.expanded}
              ?disabled=${this.previewActive || this.previewTransitioning || aiReviewPending}
              aria-label=${this.expanded ? "Collapse ribbon" : "Expand ribbon"}
              title=${this.expanded ? "Collapse ribbon" : "Expand ribbon"}
              @click=${this.toggleExpanded}
            >
              <span class="chevron" aria-hidden="true"></span>
            </button>
          </div>
        </div>
        <section
          id="ai-chat-panel"
          class="ai-chat-panel"
          role=${this.aiChatOpen ? "region" : "presentation"}
          aria-label="AI chat"
          ?data-open=${this.aiChatOpen}
          ?data-transitioning=${this.aiChatTransitioning}
          ?hidden=${this.previewActive}
          ?inert=${historyPreviewPending}
        >
          <button
            class="ai-chat-brand-button"
            type="button"
            aria-label=${this.aiChatOpen ? "Collapse AI chat" : "Expand AI chat"}
            title=${this.aiChatOpen ? "Collapse chat" : "Expand chat"}
            aria-expanded=${this.aiChatOpen}
            aria-controls="ai-chat-panel"
            @click=${this.toggleAIChat}
          ><span class="ai-chat-brand-icon" aria-hidden="true">${ribbonIcon("AI")}</span></button>
          <header class="ai-chat-header" ?inert=${!this.aiChatOpen || Boolean(this.pendingAIEdit)}>
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
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            ?inert=${!this.aiChatOpen}
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
            ${this.aiBusy && !this.pendingAIEdit ? html`<div class="ai-chat-working" role="status">AI is working…</div>` : ""}
            ${this.aiError ? html`<div class="ai-chat-error" role="alert">${this.aiError}</div>` : ""}
          </div>
          <form
            class="ai-chat-composer"
            ?inert=${Boolean(this.pendingAIEdit) && this.aiChatOpen}
            @submit=${this.submitAIPrompt}
          >
            <div
              class="ai-composer-surface"
              ?data-has-attachments=${this.aiAttachments.length > 0}
              ?data-review-pending=${Boolean(this.pendingAIEdit) && !this.aiChatOpen}
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
                aria-label=${this.aiChatOpen ? "Chat message" : "AI prompt"}
                placeholder=${this.pendingAIEdit ? "Accept or reject the document change…" : this.aiChatOpen ? "Message AI…" : "Ask AI…"}
                .rows=${this.aiChatOpen ? 3 : 1}
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
              <div class="ai-composer-toolbar" ?inert=${!this.aiChatOpen}>
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
              ${this.pendingAIEdit && !this.aiChatOpen ? html`
                <div class="ai-prompt-review-actions" aria-label="Review pending AI change">
                  <button class="ai-prompt-review-action" type="button" aria-label="Reject AI change" title="Reject" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.rejectAIEdit}>${ribbonIcon("Reject")}</button>
                  <button class="ai-prompt-review-action" type="button" aria-label="Go to AI change" title="Go to change" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.gotoPendingAIEdit}>${ribbonIcon("Goto")}</button>
                  <button class="ai-prompt-review-action" data-kind="approve" type="button" aria-label="Accept AI change" title="Accept" ?disabled=${this.pendingAIEdit.previewing || this.pendingAIEdit.deciding} @click=${this.approveAIEdit}>${ribbonIcon("Accept")}</button>
                </div>
              ` : html`
                <button
                  class="ai-prompt-submit ai-chat-send"
                  type="button"
                  aria-label=${this.aiBusy ? "Stop AI request" : this.aiChatOpen ? "Send chat message" : "Enter AI prompt"}
                  title=${this.aiBusy ? "Stop" : this.aiChatOpen ? "Send" : "Enter"}
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
              aria-controls="ai-chat-panel"
              @click=${this.toggleAIChat}
            ><span class="ai-prompt-expand-chevron" aria-hidden="true"></span></button>
          </form>
        </section>
        <ai-settings-dialog .store=${this.aiProviderStore}></ai-settings-dialog>
        <ribbon-menu
          .groups=${this.currentMenuGroups}
          ?hidden=${!this.menuOpen || this.expanded}
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
