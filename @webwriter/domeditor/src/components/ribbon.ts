import { LitElement, css, html, nothing } from "lit"
import type {ElementStyleState, ListType, PresenceUser} from "../editor-bridge"
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
  detailsInsertionTags,
  formInsertionTags,
  headingInsertionTags,
  insertionMenuItems,
  scriptInsertionTags,
  sectionInsertionTags,
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
  websiteTypes,
  type MediaAttributeOption,
  type MediaSelectionState,
  type MediaType,
} from "../media"
import type {TableSelectionState} from "../table"
import {
  graphicShapeOptions,
  type GraphicLayerOperation,
  type GraphicSelectionState,
  type GraphicViewportOperation,
} from "../graphic"
import {emptyDocumentHeadState, type DocumentHeadState} from "../document-head"
import {elementStyleCategories, type ElementStyleCategory} from "../element-styles"
import "./document-head-editor"
import "./element-style-editor"

type RibbonMenuName = "File" | "Start" | "Insert" | "Edit" | "Style" | "Develop"

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

const menuTabs: RibbonMenuName[] = ["File", "Insert", "Edit", "Style", "Develop"]
const dropdownMenus: RibbonMenuName[] = ["File", "Insert", "Edit", "Style"]

const aiEfforts: {label: string, value: AIEffort}[] = [
  {label: "Low effort", value: "low"},
  {label: "Medium effort", value: "medium"},
  {label: "High effort", value: "high"},
]

const storageLocations = [
  {label: "Local", value: "local", icon: "Local"},
  {label: "Development server", value: "development-server", icon: "Cloud"},
] as const
type StorageLocation = typeof storageLocations[number]["value"]

const placeholderSharingLink = "https://webwriter.app/share/placeholder"

type InsertionSection = "Text" | "Lists" | "Media"

const insertGraphicShapeButtons: RibbonMenuButton[] = graphicShapeOptions.map(option => ({
  label: option.label,
  action: `insert-graphic-shape:${option.type}`,
  icon: option.icon,
}))

const addGraphicShapeButtons: RibbonMenuButton[] = graphicShapeOptions.map(option => ({
  label: option.label,
  action: `add-graphic-shape:${option.type}`,
  icon: option.icon,
}))

const graphicAlignButtons: RibbonMenuButton[] = [
  {label: "Align left", action: "arrange-graphic:align-left", icon: "Graphic align left"},
  {label: "Align center", action: "arrange-graphic:align-center", icon: "Graphic align center"},
  {label: "Align right", action: "arrange-graphic:align-right", icon: "Graphic align right"},
  {label: "Align top", action: "arrange-graphic:align-top", icon: "Graphic align top"},
  {label: "Align middle", action: "arrange-graphic:align-middle", icon: "Graphic align middle"},
  {label: "Align bottom", action: "arrange-graphic:align-bottom", icon: "Graphic align bottom"},
]

const graphicDistributeButtons: RibbonMenuButton[] = [
  {label: "Distribute horizontally", action: "arrange-graphic:distribute-horizontal", icon: "Distribute horizontally"},
  {label: "Distribute vertically", action: "arrange-graphic:distribute-vertical", icon: "Distribute vertically"},
]

const graphicOrderButtons: RibbonMenuButton[] = [
  {label: "Bring forward", action: "arrange-graphic:bring-forward", icon: "Bring forward"},
  {label: "Send backward", action: "arrange-graphic:send-backward", icon: "Send backward"},
  {label: "Bring to front", action: "arrange-graphic:bring-front", icon: "Bring to front"},
  {label: "Send to back", action: "arrange-graphic:send-back", icon: "Send to back"},
]

const insertionButtonForTag = (tag: string): RibbonMenuButton => {
  const item = insertionMenuItems.find(candidate => candidate.tag === tag)
  if(!item) throw new TypeError(`Missing insertion menu item for <${tag}>`)
  return {label: item.name, action: item.name, icon: item.icon ?? item.name}
}

const insertionSubmenuForTags = (tags: readonly string[]) => tags.map(insertionButtonForTag)

const glossaryInsertionButton: RibbonMenuButton = {
  label: "Glossary",
  action: "toggle-list:dl",
  icon: "Glossary",
}

const orderedListStyles: RibbonMenuButton[] = [
  {label: "1, 2, 3", action: "list-style:ol:decimal", icon: "Enumeration"},
  {label: "01, 02, 03", action: "list-style:ol:decimal-leading-zero", icon: "Enumeration"},
  {label: "a, b, c", action: "list-style:ol:lower-alpha", icon: "Enumeration"},
  {label: "A, B, C", action: "list-style:ol:upper-alpha", icon: "Enumeration"},
  {label: "i, ii, iii", action: "list-style:ol:lower-roman", icon: "Enumeration"},
  {label: "I, II, III", action: "list-style:ol:upper-roman", icon: "Enumeration"},
  {label: "No marker", action: "list-style:ol:none", icon: "Enumeration"},
]

const listInsertionOptions: RibbonMenuButton[] = [
  {
    label: "Enumeration",
    action: "toggle-list:ol",
    icon: "Enumeration",
    submenu: orderedListStyles,
  },
  {label: "Menu", action: "toggle-list:menu", icon: "List"},
  {label: "Disc", action: "list-style:ul:disc", icon: "List"},
  {label: "Circle", action: "list-style:ul:circle", icon: "List"},
  {label: "Square", action: "list-style:ul:square", icon: "List"},
  {label: "No marker", action: "list-style:ul:none", icon: "List"},
  glossaryInsertionButton,
]

const mediaInsertionSubmenuTags = (tag: string): readonly string[] | undefined => {
  if(tag === "form") return formInsertionTags
  if(tag === "section") return sectionInsertionTags
  if(tag === "script") return scriptInsertionTags
}

const groupedMediaInsertionTags = new Set<string>([
  ...formInsertionTags,
  ...sectionInsertionTags,
  ...scriptInsertionTags,
])

const insertionMenuButtons = (sections: readonly InsertionSection[]) => insertionMenuItems
  .filter(item => sections.includes(item.section))
  .flatMap<RibbonMenuButton>(item => {
    if(item.section === "Lists" && detailsInsertionTags.includes(item.tag as typeof detailsInsertionTags[number])) return []
    if(item.section === "Lists") {
      if(item.tag === "ul") {
        return [{
          label: item.name,
          action: "toggle-list:ul",
          icon: "List",
          submenu: listInsertionOptions,
        }]
      }
      if(item.tag === "ol" || item.tag === "dl") return []
      return [{
        label: item.name,
        action: item.tag === "details" ? "insert-details" : `toggle-list:${item.tag}`,
        icon: item.icon ?? item.name,
        ...(item.tag === "details" ? {submenu: insertionSubmenuForTags(detailsInsertionTags)} : {}),
      }]
    }
    if(item.section === "Text" && item.tag === "p") {
      return [{
        label: item.name,
        action: item.name,
        submenu: insertionMenuItems
          .filter(submenuItem => submenuItem.section === item.section && submenuItem.tag === "pre")
          .map(submenuItem => submenuItem.name),
      } satisfies RibbonMenuButton]
    }
    if(item.section === "Text" && item.tag === "pre") return []
    if(item.section === "Text" && item.tag === "h1") {
      return [{
        label: "Heading",
        action: item.name,
        submenu: insertionSubmenuForTags(headingInsertionTags),
      } satisfies RibbonMenuButton]
    }
    if(item.section === "Text" && headingInsertionTags.includes(item.tag as typeof headingInsertionTags[number])) return []
    const mediaSubmenuTags = item.section === "Media" ? mediaInsertionSubmenuTags(item.tag) : undefined
    if(mediaSubmenuTags) {
      return [{
        label: item.name,
        action: item.name,
        icon: item.icon ?? item.name,
        submenu: insertionSubmenuForTags(mediaSubmenuTags),
      }]
    }
    if(item.section === "Media" && groupedMediaInsertionTags.has(item.tag)) return []
    if(item.section === "Media" && item.tag === "svg") {
      return [{label: item.name, action: item.name, icon: "Graphic", submenu: insertGraphicShapeButtons}]
    }
    return [item.name]
  })

const insertionButtonLabel = (button: RibbonMenuButton) => typeof button === "string" ? button : button.label

const groupedInsertionMenuGroup = (
  label: string,
  buttonLabels: readonly string[],
): RibbonMenuGroup => {
  const buttons = insertionMenuButtons(["Text", "Lists", "Media"])
  return {
    label,
    buttons: buttonLabels.map(buttonLabel => {
      const button = buttons.find(candidate => insertionButtonLabel(candidate) === buttonLabel)
      if(!button) throw new TypeError(`Missing insertion button ${buttonLabel}`)
      return button
    }),
  }
}

const condensedInsertionMenuButtons = (section: InsertionSection): RibbonMenuButton[] => insertionMenuButtons([section])
  .map(button => {
    const item = typeof button === "string" ? {label: button} : button
    return {
      label: item.label,
      action: item.action ?? item.label,
      icon: item.icon ?? item.label,
      ...(section === "Lists" && item.label === "List" ? {submenu: item.submenu} : {}),
    }
  })

const elementInsertionMenuGroup: RibbonMenuGroup = {
  label: "Elements",
  buttons: [
    {
      label: "Prose",
      action: "Paragraph",
      icon: "Paragraph",
      submenu: condensedInsertionMenuButtons("Text"),
    },
    {
      label: "Lists",
      action: "toggle-list:ul",
      icon: "Lists",
      submenu: condensedInsertionMenuButtons("Lists"),
    },
    {
      label: "Media",
      action: "Table",
      icon: "Table",
      submenu: condensedInsertionMenuButtons("Media"),
    },
  ],
}

const menuGroups: Record<RibbonMenuName, RibbonMenuGroup[]> = {
  File: [
    {
      label: "File",
      buttons: [
        "New",
        "Open",
        {
          label: "Save",
          submenu: [
            {label: "HTML (.html)", action: "save:html"},
            {label: "Offline HTML (.offline.html)", action: "save:offline"},
          ],
        },
        {
          label: "Save as",
          submenu: [
            {label: "HTML (.html)", action: "save-as:html"},
            {label: "Offline HTML (.offline.html)", action: "save-as:offline"},
          ],
        },
      ],
    },
    {label: "Metadata", buttons: []},
    {label: "Sharing", buttons: ["Share", "Print", "Download"]},
    {label: "Editor", buttons: ["General", "Shortcuts", "Accessibility"]},
    {label: "Appearance", buttons: ["Theme", "Zoom", "Fullscreen"]},
    {label: "Advanced", buttons: ["Preferences", "Extensions", "About"]},
  ],
  Start: [
    {label: "Marks", buttons: []},
    {label: "Table", buttons: []},
    elementInsertionMenuGroup,
  ],
  Insert: [
    groupedInsertionMenuGroup("Text", ["Paragraph", "Section", "Heading", "Details"]),
    groupedInsertionMenuGroup("Lists", ["List", "Table"]),
    groupedInsertionMenuGroup("Media", ["Image", "Graphic", "Audio", "Website", "Video", "Formula"]),
    groupedInsertionMenuGroup("Interactive", ["Form", "Script"]),
  ],
  Edit: [
    {label: "Marks", buttons: []},
    {label: "Table", buttons: []},
    {label: "Graphic", buttons: []},
    {
      label: "Review",
      buttons: [
        "Spelling", "Grammar", "Translate",
        "New Comment", "Previous", "Next",
        "Track Changes", "Accept", "Reject",
      ],
    },
    {label: "View", buttons: ["Zoom", "Guides", "Fullscreen"]},
  ],
  Style: elementStyleCategories.map(category => ({label: category.label, buttons: []})),
  Develop: [
    {label: "Local packages", buttons: []},
    {label: "Metadata", buttons: []},
    {label: "Development", buttons: []},
    {label: "Exports", buttons: []},
  ],
}

/** The editor's tabbed, responsive ribbon toolbar. */
export class AppRibbon extends LitElement {
  static properties = {
    activeMenu: {type: String, attribute: "active-menu"},
    expanded: {type: Boolean, reflect: true},
    menuOpen: {type: Boolean, reflect: true},
    logoUrl: {type: String, attribute: "logo-url"},
    canMark: {type: Boolean, attribute: "can-mark"},
    marks: {attribute: false},
    markStyles: {attribute: false},
    markAttributes: {attribute: false},
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
    packageDrawerOpen: {type: Boolean, state: true},
    packageVisibleCount: {type: Number, state: true},
    listType: {type: String, attribute: "list-type"},
    listStyle: {type: String, attribute: "list-style"},
    media: {attribute: false},
    table: {attribute: false},
    graphic: {attribute: false},
    elementStyle: {attribute: false},
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
    documentHead: {attribute: false},
    documentHeadDrawerOpen: {type: Boolean, state: true},
    documentHeadAttributeEditorId: {type: String, state: true},
    previewActive: {type: Boolean, attribute: "preview-active"},
    previewTransitioning: {type: Boolean, attribute: "preview-transition", reflect: true},
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
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      position: relative;
      z-index: 1;
      width: 100%;
      height: 130px;
      max-height: 130px;
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

    .ai-bar-slot {
      box-sizing: border-box;
      /* Let the AI bar absorb almost all top-row compression before the tabs. */
      flex: 1 100 600px;
      width: auto;
      max-width: 600px;
      min-width: 24px;
      height: 40px;
      min-height: 40px;
      margin-inline: 0.35rem;
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
      max-height: 24px;
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
      width: auto;
      padding-inline: 0.35rem;
      color: #1e4f87;
      background: #dcecff;
      box-shadow: inset 0 0 0 1px rgb(57 119 199 / 12%);
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
      max-width: 17rem;
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

    .file-dirty {
      flex: 0 0 0.6rem;
      color: #526b86;
      font-weight: 700;
      text-align: center;
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
  marks: MarkName[] = []
  markStyles: StyleMarkValues = {}
  markAttributes: MarkAttributeValues = {}
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
  media: MediaSelectionState | null = null
  table: TableSelectionState | null = null
  graphic: GraphicSelectionState | null = null
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
  storageLocation: StorageLocation = "local"
  private packageSearchQuery = ""
  private packageDrawerOpen = false
  private packageVisibleCount = 2
  private linkAttributeMenuOpen = false
  aiDocumentToolHandler: AIDocumentToolHandler | undefined
  aiEditReviewHandler: AIEditReviewHandler | undefined
  backendClient: BackendClient | null = null
  backendState: "probing" | "connected" | "unavailable" = "probing"
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

  private readonly handleRibbonPointerDown = (event: MouseEvent) => {
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

  private readonly handleRibbonInputFocusIn = (event: FocusEvent) => {
    const input = ribbonInputFromEvent(event)
    if(!input) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-focus", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
  }

  private readonly handleRibbonInputFocusOut = (event: FocusEvent) => {
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

  private readonly handleRibbonInputChange = (event: Event) => {
    const input = ribbonInputFromEvent(event)
    if(!input || input.hasAttribute("data-ribbon-input-persistent")) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-commit", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
  }

  private readonly handleRibbonInputKeydown = (event: KeyboardEvent) => {
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
    let requiredWidth = widths.reduce((total, width) => total + width.expanded, 0)
    const collapsed = drawers.map(() => false)

    for(let index = drawers.length - 1; index >= 0 && requiredWidth > availableWidth + 0.5; index--) {
      collapsed[index] = true
      requiredWidth -= widths[index].expanded - widths[index].collapsed
    }

    drawers.forEach((drawer, index) => {
      drawer.collapsed = collapsed[index]
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
    // The two-cell search field cannot share its trailing single cell when
    // the grid has an odd column count. Calculate each row independently so
    // no package is accidentally placed in a clipped third row.
    const visibleCount = columns < 2
      ? 1
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
        this.expanded = false
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
    if(changed.has("marks")) this.syncSpanMarkSelection()
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
    if(changed.has("activeMenu") && this.activeMenu === "Insert") {
      this.dispatchEvent(new Event("package-catalog-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && this.activeMenu === "Develop") {
      this.dispatchEvent(new Event("local-package-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && this.activeMenu === "Style") {
      this.dispatchEvent(new Event("element-style-state-request", {bubbles: true, composed: true}))
    }
    if(
      changed.has("activeMenu") || changed.has("expanded") || changed.has("packages") ||
      changed.has("installedPackages") || changed.has("packageSearchQuery") ||
      changed.has("localPackages")
    ) this.scheduleResponsiveLayout()
    if(changed.has("marks")) {
      if(!this.marks.includes("a")) this.closeLinkAttributeMenu()
    }
  }

  private markButton(option: MarkOption) {
    const shortcut = markShortcutLabel(option, isOnApple())
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
    const value = (event.currentTarget as HTMLInputElement).value
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
        <input
          type=${option.inputType ?? "text"}
          aria-label=${`${this.markOption(mark).label}: ${option.label}`}
          placeholder=${option.placeholder}
          .value=${this.markAttributes[mark]?.[option.name] ?? ""}
          ?disabled=${!this.canMark}
          @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
        />
      </label>
    `
  }

  private renderDropdownAttribute(mark: MarkName, option: MarkAttributeOption, active = true) {
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
        style="grid-column: 9; grid-row: 1"
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
        style="grid-column: 9; grid-row: 2"
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
          style="grid-column: 8; grid-row: 1"
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
        .action=${management ? packageToggleAction(pkg) : packageAction(pkg)}
        .submenu=${management || !installed ? [] : members.slice(1).map(member => ({
          label: member.label,
          action: packageMemberAction(member),
          icon: "Packages",
          iconUrl: pkg.iconUrl,
        }))}
        .corner=${management && installed ? "close" : ""}
        .cornerLabel=${installed ? `Remove ${pkg.label}` : `Add ${pkg.label}`}
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
    if(detail?.label === "Packages") this.packageDrawerOpen = detail.open === true
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

  private renderListDrawer() {
    return html`
      <ribbon-drawer label="Lists" icon="Lists" layout="lists">
        <ribbon-button
          toggle
          label="List"
          action="toggle-list:ul"
          icon="List"
          .submenu=${listInsertionOptions}
          ?active=${this.listType !== null}
        ></ribbon-button>
        <ribbon-button
          label="Table"
          action="Table"
          icon="Table"
          .dropdown=${this.renderTableSizePicker()}
        ></ribbon-button>
      </ribbon-drawer>
    `
  }

  private mediaSelectionMatches(type: MediaType) {
    if(type === "picture" || type === "img") return this.media?.type === "picture" || this.media?.type === "img"
    if(isWebsiteType(type)) return isWebsiteType(this.media?.type)
    return this.media?.type === type
  }

  private mediaLabel(type: MediaType) {
    return isWebsiteType(type) ? "Website" : type
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

  private renderMediaDropdown(type: MediaType) {
    const active = this.mediaSelectionMatches(type)
    const selectedImageType = this.media?.type === "img" ? "img" : "picture"
    const selectedType = type === "iframe" && isWebsiteType(this.media?.type) ? this.media.type : type
    return html`
      <div class="button-dropdown-form media-dropdown-form" role="group" aria-label=${`${isWebsiteType(type) ? "website" : type} options`}>
        ${type === "picture" ? html`
          <button
            class="button-dropdown-more media-type-switch"
            type="button"
            ?disabled=${!active}
            @click=${() => this.dispatchEvent(new CustomEvent("media-type-change", {
              detail: {type: selectedImageType === "picture" ? "img" : "picture"},
              bubbles: true,
              composed: true,
            }))}
          >Use &lt;${selectedImageType === "picture" ? "img" : "picture"}&gt;</button>
        ` : ""}
        ${type === "iframe" ? html`
          <label class="mark-attribute media-attribute">
            <span>Element</span>
            <select
              data-ribbon-input-persistent
              aria-label="Website: Element"
              ?disabled=${!active}
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
        ${!active ? html`<span class="media-dropdown-status">Select a ${isWebsiteType(type) ? "website" : type} to edit its attributes.</span>` : ""}
        <div class="button-dropdown-advanced" role="group" aria-label="Advanced attributes">
          ${mediaAttributeOptions[selectedType].map(option => this.renderMediaAttribute(selectedType, option))}
        </div>
      </div>
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

  private renderTableBorderDropdown() {
    const disabled = !this.table?.active
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Cell borders">
        <label class="mark-attribute">
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
        <label class="mark-attribute">
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
        <label class="mark-attribute">
          <span>Color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            value="#000000"
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("border-color", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button class="button-dropdown-more" type="button" ?disabled=${disabled}
          @click=${() => this.dispatchTableStyle("border-style", "")}>Clear borders</button>
      </div>
    `
  }

  private renderTableBackgroundDropdown() {
    const disabled = !this.table?.active
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Cell background">
        <label class="mark-attribute">
          <span>Color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            value="#ffffff"
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("background-color", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button class="button-dropdown-more" type="button" ?disabled=${disabled}
          @click=${() => this.dispatchTableStyle("background-color", "")}>Clear background</button>
      </div>
    `
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

  private graphicNumberInput(name: string, label: string, options: {min?: number, max?: number, step?: number} = {}) {
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
          ?disabled=${shared ? selectionCount < 1 : !this.graphic?.shape}
          @change=${(event: Event) => this.dispatchGraphicParameter(name, event)}
        />
      </label>
    `
  }

  private renderGraphicPaintDropdown(kind: "fill" | "stroke") {
    const parameters = this.graphic?.parameters ?? {}
    const selectionCount = this.graphic?.selectionCount ?? (this.graphic?.shape ? 1 : 0)
    const value = parameters[kind]
    const color = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : kind === "fill" ? "#ffffff" : "#334155"
    const disabled = selectionCount < 1 || kind === "fill" && selectionCount === 1
      && (this.graphic?.shape === "line" || this.graphic?.shape === "connector")
    return html`
      <div class="button-dropdown-form" role="group" aria-label=${`Graphic ${kind}`}>
        <label class="mark-attribute graphic-parameter">
          <span>Color</span>
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
      </div>
    `
  }

  private renderGraphicGeometryDropdown() {
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Graphic geometry">
        ${this.graphicNumberInput("x", "X")}
        ${this.graphicNumberInput("y", "Y")}
        ${this.graphicNumberInput("width", "Width", {min: 1})}
        ${this.graphicNumberInput("height", "Height", {min: 1})}
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

  private renderGraphicRotationDropdown() {
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Graphic rotation">
        ${this.graphicNumberInput("rotation", "Degrees", {step: 1})}
      </div>
    `
  }

  private renderGraphicConnectorDropdown() {
    const parameters = this.graphic?.parameters ?? {}
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Connector settings">
        <label class="mark-attribute graphic-parameter">
          <span>Routing</span>
          <select
            data-ribbon-input-persistent
            aria-label="Graphic: Connector routing"
            .value=${parameters.routing ?? "orthogonal"}
            @change=${(event: Event) => this.dispatchGraphicParameter("routing", event)}
          >
            <option value="straight">Straight</option>
            <option value="orthogonal">Orthogonal</option>
          </select>
        </label>
        <label class="mark-attribute graphic-parameter">
          <span>Start arrow</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label="Graphic: Start arrow"
            .checked=${parameters["start-arrow"] === "true"}
            @change=${(event: Event) => this.dispatchGraphicParameterValue(
              "start-arrow",
              String((event.currentTarget as HTMLInputElement).checked),
            )}
          />
        </label>
        <label class="mark-attribute graphic-parameter">
          <span>End arrow</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label="Graphic: End arrow"
            .checked=${parameters["end-arrow"] === "true"}
            @change=${(event: Event) => this.dispatchGraphicParameterValue(
              "end-arrow",
              String((event.currentTarget as HTMLInputElement).checked),
            )}
          />
        </label>
      </div>
    `
  }

  private renderGraphicLabelDropdown() {
    const parameters = this.graphic?.parameters ?? {}
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Shape text">
        <label class="mark-attribute graphic-parameter">
          <span>Label</span>
          <textarea
            data-ribbon-input-persistent
            rows="3"
            aria-label="Graphic: Label"
            .value=${parameters.label ?? ""}
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
            @change=${(event: Event) => this.dispatchGraphicParameter("text-color", event)}
          />
        </label>
        ${this.graphicNumberInput("font-size", "Font size", {min: 1, step: 1})}
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

  private renderGraphicLayersDropdown() {
    const layers = [...(this.graphic?.layers ?? [])].reverse()
    const primary = layers.find(layer => layer.primary) ?? layers.find(layer => layer.selected)
    return html`
      <div class="button-dropdown-form graphic-layers-dropdown" role="group" aria-label="Graphic layers">
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
                ?disabled=${layer.locked || !layer.visible}
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
                @click=${() => this.dispatchGraphicLayer("toggle-visibility", layer.index)}
              >${ribbonIcon(layer.visible ? "Visible" : "Hidden")}</button>
              <button
                class="graphic-layer-action"
                type="button"
                aria-label=${`${layer.locked ? "Unlock" : "Lock"} ${layer.label}`}
                title=${layer.locked ? "Unlock layer" : "Lock layer"}
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
              ?disabled=${!primary}
              @click=${() => primary && this.dispatchGraphicLayer(operation, primary.index)}
            >${label}</button>
          `)}
        </div>
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
        <ribbon-button
          label="Add shape"
          action="add-graphic-shape:rectangle"
          icon="Graphic"
          .submenu=${addGraphicShapeButtons}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button label="Fill" icon="Fill" .dropdown=${this.renderGraphicPaintDropdown("fill")} ?disabled=${!shapesSelected}></ribbon-button>
        <ribbon-button label="Stroke" icon="Stroke" .dropdown=${this.renderGraphicPaintDropdown("stroke")} ?disabled=${!shapesSelected}></ribbon-button>
      </ribbon-drawer>
      <ribbon-drawer label="Geometry" icon="Geometry" layout="graphic-geometry">
        <ribbon-button label="Geometry" icon="Geometry" .dropdown=${this.renderGraphicGeometryDropdown()} ?disabled=${!shapeSelected}></ribbon-button>
        <ribbon-button label="Rotate" icon="Rotate" .dropdown=${this.renderGraphicRotationDropdown()} ?disabled=${!shapeSelected || connectorSelected}></ribbon-button>
      </ribbon-drawer>
      <ribbon-drawer label="Text" icon="Text" layout="graphic-geometry">
        <ribbon-button label="Label" icon="Text" .dropdown=${this.renderGraphicLabelDropdown()} ?disabled=${!labelableShapeSelected}></ribbon-button>
      </ribbon-drawer>
      <ribbon-drawer label="Connector" icon="Connector" layout="graphic-geometry">
        <ribbon-button
          label="Routing"
          icon="Connector"
          .dropdown=${this.renderGraphicConnectorDropdown()}
          ?disabled=${!connectorSelected}
        ></ribbon-button>
      </ribbon-drawer>
      <ribbon-drawer label="Arrange" icon="Align" layout="graphic-arrange">
        <ribbon-button
          label="Align"
          action="arrange-graphic:align-left"
          icon="Graphic align left"
          .submenu=${graphicAlignButtons}
          ?disabled=${selectionCount < 2}
        ></ribbon-button>
        <ribbon-button
          label="Distribute"
          action="arrange-graphic:distribute-horizontal"
          icon="Distribute horizontally"
          .submenu=${graphicDistributeButtons}
          ?disabled=${selectionCount < 3}
        ></ribbon-button>
        <ribbon-button
          label="Order"
          action="arrange-graphic:bring-forward"
          icon="Graphic order"
          .submenu=${graphicOrderButtons}
          ?disabled=${!shapesSelected}
        ></ribbon-button>
      </ribbon-drawer>
      <ribbon-drawer label="Layers" icon="Layers" layout="graphic-layers">
        <ribbon-button
          label="Layers"
          icon="Layers"
          .dropdown=${this.renderGraphicLayersDropdown()}
          ?disabled=${!captured}
        ></ribbon-button>
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
      </ribbon-drawer>
      <ribbon-drawer label="View" icon="Zoom" layout="graphic-view">
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

  private renderTableDrawer() {
    const active = Boolean(this.table?.active)
    return html`
      <ribbon-drawer label="Table" icon="Table" layout="table">
        <ribbon-button label="Row above" action="table-row-above" icon="Plus" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Row below" action="table-row-below" icon="Plus" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column left" action="table-column-left" icon="Plus" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column right" action="table-column-right" icon="Plus" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Merge cells" action="table-merge-cells" icon="Table" ?disabled=${!this.table?.canMerge}></ribbon-button>
        <ribbon-button label="Split cells" action="table-split-cells" icon="Table" ?disabled=${!this.table?.canSplit}></ribbon-button>
        <ribbon-button label="Split table" action="table-split" icon="Table" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Caption" action="table-caption" icon="Text" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Borders" icon="Table" .dropdown=${this.renderTableBorderDropdown()} ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Background" icon="Color" .dropdown=${this.renderTableBackgroundDropdown()} ?disabled=${!active}></ribbon-button>
      </ribbon-drawer>
    `
  }

  private renderInsertionDrawer(drawer: RibbonMenuGroup) {
    const elements = drawer.label === "Elements"
    return html`
      <ribbon-drawer
        label=${drawer.label}
        icon=${elements ? "Paragraph" : "Table"}
        layout=${elements ? "elements" : "media"}
      >
        ${drawer.buttons.map(button => {
          const item = typeof button === "string" ? {label: button} : button
          const insertion = insertionMenuItems.find(candidate => candidate.name === item.label)
          const type = insertion?.tag === "picture" || insertion?.tag === "audio" || insertion?.tag === "video" || insertion?.tag === "iframe"
            ? insertion.tag as MediaType
            : null
          const submenu = item.label === "List"
            ? this.unorderedListStyles
            : item.label === "Enumeration"
              ? this.orderedListStyles
              : item.submenu ?? []
          const active = type
            ? this.mediaSelectionMatches(type)
            : item.label === "Lists"
              ? this.listType !== null
              : item.label === "Media"
                ? this.media !== null
                : item.label === "List"
                  ? this.listType === "ul" || this.listType === "menu"
                  : item.label === "Enumeration"
                    ? this.listType === "ol"
                    : item.label === "Glossary"
                      ? this.listType === "dl"
                      : false
          const tableDropdown = item.label === "Table" ? this.renderTableSizePicker() : null
          return html`
            <ribbon-button
              label=${item.label}
              .action=${item.action ?? item.label}
              .icon=${item.icon ?? item.label}
              .submenu=${type || tableDropdown ? [] : submenu}
              .dropdown=${type ? this.renderMediaDropdown(type) : tableDropdown}
              ?toggle=${elements && item.label === "Lists"}
              ?active=${active}
            ></ribbon-button>
          `
        })}
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
            <span
              class="file-dirty"
              aria-label=${this.fileDirty ? "Unsaved changes" : "No unsaved changes"}
              title=${this.fileDirty ? "Unsaved changes" : "Saved"}
            >${this.fileDirty ? "*" : ""}</span>
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
            ></ribbon-button>
          `
        })}
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
    )
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
    void this.ensureSharingQRCodeImage(link)
    return html`
      <div class="sharing-dropdown" role="group" aria-label="Sharing options">
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

  private handleSharingButtonClick = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label !== "Share") return
    event.stopPropagation()
    void this.copySharingContent(placeholderSharingLink).then(copied => {
      if(copied) this.sharingButton()?.showNotification("Copied QR code and link")
    })
  }

  private renderSharingDrawer(drawer: RibbonMenuGroup) {
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
              .qrValue=${placeholderSharingLink}
              .dropdown=${this.renderSharingDropdown(placeholderSharingLink)}
              keep-drawer-open
              @ribbon-button-click=${this.handleSharingButtonClick}
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
          .definitions=${category.basic}
          .state=${this.elementStyle}
        ></element-style-editor>
        <element-style-editor
          slot="more"
          mode="advanced"
          .definitions=${category.advanced}
          .state=${this.elementStyle}
          ?allow-custom=${category.id === "other"}
        ></element-style-editor>
      </ribbon-drawer>
    `
  }

  private renderDrawers() {
    return this.currentMenuGroups.map(drawer => {
      const styleCategory = this.activeMenu === "Style"
        ? elementStyleCategories.find(category => category.label === drawer.label)
        : undefined
      if(styleCategory) return this.renderElementStyleDrawer(styleCategory)
      if(drawer.label === "File") return this.renderFileDrawer(drawer)
      if(drawer.label === "Sharing") return this.renderSharingDrawer(drawer)
      if(drawer.label === "Marks") return this.renderMarkDrawer()
      if(drawer.label === "Table") return this.renderTableDrawer()
      if(drawer.label === "Graphic") return this.renderGraphicDrawer()
      if(drawer.label === "Packages") return this.renderPackageDrawer()
      if(drawer.label === "Local packages") return this.renderDevelopDrawer()
      if(drawer.label === "Metadata") {
        return this.activeMenu === "File" ? this.renderDocumentHeadDrawer() : this.renderMetadataDrawer()
      }
      if(drawer.label === "Development") return this.renderDevelopmentDrawer()
      if(drawer.label === "Exports") return this.renderExportsDrawer()
      if(drawer.label === "Lists") return this.renderListDrawer()
      if(drawer.label === "Elements" || drawer.label === "Media") return this.renderInsertionDrawer(drawer)
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
  }

  private get currentMenuGroups() {
    if(this.activeMenu === "Edit" && this.graphic?.active) {
      return menuGroups.Edit.filter(group => group.label === "Graphic")
    }
    if(this.activeMenu !== "Start" && this.activeMenu !== "Insert") return menuGroups[this.activeMenu]
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
          <nav class="tabs" role="tablist" aria-label="Editor menus" ?inert=${aiReviewPending}>
            ${visibleTabs.map(tab => html`
              <ribbon-tab
                label=${tab}
                .active=${this.activeMenu === tab}
                .fileName=${tab === "File" ? this.fileName : ""}
                .fileDirty=${tab === "File" && this.fileDirty}
                .previewActive=${this.previewActive}
                .ribbonCollapsed=${!this.expanded || this.previewTransitioning}
              ></ribbon-tab>
            `)}
          </nav>
          ${this.previewActive ? "" : html`<div class="ai-bar-slot" aria-hidden="true"></div>`}
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
              <button
                class="history-button"
                type="button"
                aria-label="Undo"
                title="Undo"
                ?disabled=${aiReviewPending}
                @click=${() => this.handleTopButtonClick("Undo")}
              >
                <span class="history-icon" aria-hidden="true">${ribbonIcon("Undo")}</span>
              </button>
              <button
                class="history-button"
                type="button"
                aria-label="Redo"
                title="Redo"
                ?disabled=${aiReviewPending}
                @click=${() => this.handleTopButtonClick("Redo")}
              >
                <span class="history-icon" aria-hidden="true">${ribbonIcon("Redo")}</span>
              </button>
            `}
            <button
              class="preview-button"
              type="button"
              ?active=${this.previewActive}
              aria-label=${this.previewActive ? "Exit preview" : "Preview"}
              title=${this.previewActive ? "Exit preview" : "Preview"}
              aria-pressed=${this.previewActive}
              ?disabled=${aiReviewPending}
              @click=${() => this.handleTopButtonClick("Preview")}
            >
              ${this.previewActive ? html`<span class="preview-label" aria-hidden="true">PREVIEW</span>` : ""}
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
          ?inert=${aiReviewPending}
        ></ribbon-menu>
        <div
          id="ribbon-content"
          class="ribbon-content"
          role="tabpanel"
          aria-label=${this.activeMenu}
          ?hidden=${!this.expanded}
          ?inert=${aiReviewPending}
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
