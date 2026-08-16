import { LitElement, css, html } from "lit"
import type {ListType, PresenceUser} from "../editor-bridge"
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
import { insertionMenuItems } from "./insertion-menu"
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
import {
  mediaAttributeOptions,
  isWebsiteType,
  websiteTypes,
  type MediaAttributeOption,
  type MediaSelectionState,
  type MediaType,
} from "../media"

type RibbonMenuName = "File" | "Start" | "Insert" | "Edit" | "Develop"

type RibbonInputEventDetail = {
  input: HTMLElement
  relatedTarget?: EventTarget | null
  relatedTargetIsInput?: boolean
}

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

const menuTabs: RibbonMenuName[] = ["File", "Insert", "Edit", "Develop"]
const dropdownMenus: RibbonMenuName[] = ["File", "Insert", "Edit"]

const storageLocations = [
  {label: "Local", value: "local", icon: "Local"},
  {label: "Edumix Cloud", value: "edumix-cloud", icon: "Cloud"},
] as const
type StorageLocation = typeof storageLocations[number]["value"]

const placeholderSharingLink = "https://webwriter.app/share/placeholder"

type InsertionSection = "Text" | "Lists" | "Media"

const insertionMenuButtons = (sections: readonly InsertionSection[]) => insertionMenuItems
  .filter(item => sections.includes(item.section))
  .flatMap<RibbonMenuButton>(item => {
    if(item.section === "Lists") {
      if(item.tag === "ul") {
        return [{
          label: item.name,
          action: "toggle-list:ul",
          icon: "List",
          submenu: [{label: "Menu", action: "toggle-list:menu", icon: "List"}],
        }]
      }
      return [{
        label: item.name,
        action: item.tag === "details" ? "insert-details" : `toggle-list:${item.tag}`,
        icon: item.name,
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
        submenu: insertionMenuItems
          .filter(submenuItem => submenuItem.section === item.section && /^h[2-6]$/.test(submenuItem.tag))
          .map(submenuItem => submenuItem.name),
      } satisfies RibbonMenuButton]
    }
    if(item.section === "Text" && /^h[2-6]$/.test(item.tag)) return []
    return [item.name]
  })

const insertionMenuGroup = (section: InsertionSection): RibbonMenuGroup => ({
  label: section,
  buttons: insertionMenuButtons([section]),
})

const condensedInsertionMenuButtons = (section: InsertionSection): RibbonMenuButton[] => insertionMenuButtons([section])
  .map(button => {
    const item = typeof button === "string" ? {label: button} : button
    return {
      label: item.label,
      action: item.action ?? item.label,
      icon: item.icon ?? item.label,
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
    {label: "Sharing", buttons: ["Share", "Print", "Download"]},
    {label: "Editor", buttons: ["General", "Shortcuts", "Accessibility"]},
    {label: "Appearance", buttons: ["Theme", "Zoom", "Fullscreen"]},
    {label: "Advanced", buttons: ["Preferences", "Extensions", "About"]},
  ],
  Start: [
    {label: "Marks", buttons: []},
    elementInsertionMenuGroup,
  ],
  Insert: [
    insertionMenuGroup("Text"),
    insertionMenuGroup("Lists"),
    insertionMenuGroup("Media"),
  ],
  Edit: [
    {label: "Marks", buttons: []},
    {label: "Styles", buttons: ["Heading", "Theme", "Clear"]},
    {label: "Font", buttons: ["Family", "Size", "Color"]},
    {label: "Effects", buttons: ["Highlight", "Superscript", "More"]},
    {
      label: "Review",
      buttons: [
        "Spelling", "Grammar", "Translate",
        "New Comment", "Previous", "Next",
        "Track Changes", "Accept", "Reject",
      ],
    },
    {label: "Page", buttons: ["Margins", "Columns", "Orientation"]},
    {label: "Arrange", buttons: ["Position", "Order", "Group"]},
    {label: "View", buttons: ["Zoom", "Guides", "Fullscreen"]},
  ],
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
    fileName: {type: String, attribute: "file-name"},
    fileDirty: {type: Boolean, attribute: "file-dirty"},
    previewActive: {type: Boolean, attribute: "preview-active"},
    previewTransitioning: {type: Boolean, attribute: "preview-transition", reflect: true},
    storageLocation: {type: String, state: true},
    linkAttributeMenuOpen: {type: Boolean, state: true},
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
      padding: 0 0.5rem 0 0;
      gap: 0;
      z-index: 1;
    }

    .brand {
      display: flex;
      flex: 0 0 50px;
      position: relative;
      width: 50px;
      align-items: center;
      justify-content: center;
      min-width: 50px;
      height: 40px;
      padding: 0;
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
      left: 50%;
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

    .tabs {
      display: flex;
      flex: 1 1 auto;
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
      --ribbon-drawer-expanded-width: 14rem;
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
  fileName = ""
  fileDirty = false
  previewActive = false
  storageLocation: StorageLocation = "local"
  private packageSearchQuery = ""
  private packageDrawerOpen = false
  private packageVisibleCount = 2
  private linkAttributeMenuOpen = false
  private spanMarkSelection: MarkName[] = []
  private spanMarkSelectionSynced = false
  private ribbonContentObserver: ResizeObserver | undefined
  private responsiveLayoutQueued = false
  private previewTransitioning = false
  private previewExpandedBefore = true
  private previewMenuBefore: RibbonMenuName = "Start"
  private previewTransitionTimer: ReturnType<typeof setTimeout> | undefined

  private readonly handleWindowResize = () => this.scheduleResponsiveLayout()

  private schedulePreviewTransitionEnd() {
    if(this.previewTransitionTimer !== undefined) clearTimeout(this.previewTransitionTimer)
    this.previewTransitionTimer = setTimeout(() => {
      this.previewTransitionTimer = undefined
      this.previewTransitioning = false
    }, 180)
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(event.key !== "Escape" || !this.linkAttributeMenuOpen) return
    event.stopImmediatePropagation()
    this.closeLinkAttributeMenu()
    this.renderRoot.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')
      ?.shadowRoot?.querySelector<HTMLButtonElement>(".button-dropdown-more")?.focus()
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
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
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown, true)
    window.addEventListener("resize", this.handleWindowResize)
  }

  disconnectedCallback() {
    if(this.previewTransitionTimer !== undefined) clearTimeout(this.previewTransitionTimer)
    this.previewTransitionTimer = undefined
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
  }

  private handleBrandClick = () => this.selectStart()

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
      if(this.previewActive) {
        if(nextMenu === "File") {
          this.dispatchEvent(new Event("ribbon-preview-exit", {bubbles: true, composed: true}))
        }
        return
      }
      if(this.expanded) {
        this.activeMenu = nextMenu
        this.menuOpen = false
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
    return this.localPackages.find(pkg => pkg.name === this.selectedLocalPackageName)
  }

  private selectLocalPackage = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(!label?.startsWith("local-package-select:")) return
    this.selectedLocalPackageName = label.slice("local-package-select:".length)
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

  private renderLocalPackageButton(pkg: WebWriterPackage) {
    return html`
      <ribbon-button
        variant="package"
        label=${pkg.label}
        icon="Packages"
        icon-url=${pkg.iconUrl ?? ""}
        .action=${`local-package-select:${pkg.name}`}
        .submenu=${[]}
        .details=${this.packageDetails(pkg)}
        ?active=${pkg.name === this.selectedLocalPackageName}
        ?keep-drawer-open=${true}
      ></ribbon-button>
    `
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
        ?expandable=${displayPackages.length > 1}
        @ribbon-drawer-state-change=${this.handlePackageDrawerState}
      >
        <ribbon-button
          label="Add package"
          action="local-package-add"
          icon="Plus"
          keep-drawer-open
        ></ribbon-button>
        ${displayPackages.map(pkg => this.renderLocalPackageButton(pkg))}
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

  private readonly unorderedListStyles: RibbonMenuButton[] = [
    {label: "Menu", action: "toggle-list:menu", icon: "List"},
    {label: "Disc", action: "list-style:ul:disc", icon: "List"},
    {label: "Circle", action: "list-style:ul:circle", icon: "List"},
    {label: "Square", action: "list-style:ul:square", icon: "List"},
    {label: "No marker", action: "list-style:ul:none", icon: "List"},
  ]

  private readonly orderedListStyles: RibbonMenuButton[] = [
    {label: "1, 2, 3", action: "list-style:ol:decimal", icon: "Enumeration"},
    {label: "01, 02, 03", action: "list-style:ol:decimal-leading-zero", icon: "Enumeration"},
    {label: "a, b, c", action: "list-style:ol:lower-alpha", icon: "Enumeration"},
    {label: "A, B, C", action: "list-style:ol:upper-alpha", icon: "Enumeration"},
    {label: "i, ii, iii", action: "list-style:ol:lower-roman", icon: "Enumeration"},
    {label: "I, II, III", action: "list-style:ol:upper-roman", icon: "Enumeration"},
    {label: "No marker", action: "list-style:ol:none", icon: "Enumeration"},
  ]

  private renderListDrawer() {
    return html`
      <ribbon-drawer label="Lists" icon="Lists" layout="lists">
        <ribbon-button
          toggle
          label="List"
          action="toggle-list:ul"
          icon="List"
          .submenu=${this.unorderedListStyles}
          ?active=${this.listType === "ul" || this.listType === "menu"}
        ></ribbon-button>
        <ribbon-button
          toggle
          label="Enumeration"
          action="toggle-list:ol"
          icon="Enumeration"
          .submenu=${this.orderedListStyles}
          ?active=${this.listType === "ol"}
        ></ribbon-button>
        <ribbon-button
          toggle
          label="Glossary"
          action="toggle-list:dl"
          icon="Glossary"
          ?active=${this.listType === "dl"}
        ></ribbon-button>
        <ribbon-button
          label="Details"
          action="insert-details"
          icon="Details"
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
          return html`
            <ribbon-button
              label=${item.label}
              .action=${item.action ?? item.label}
              .icon=${item.icon ?? item.label}
              .submenu=${type ? [] : submenu}
              .dropdown=${type ? this.renderMediaDropdown(type) : null}
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
    }
  }

  private renderFileDrawer(drawer: RibbonMenuGroup) {
    const selectedStorageLocation = storageLocations.find(location => location.value === this.storageLocation) ?? storageLocations[0]
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
              ${storageLocations.map(location => html`
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

  private async copySharingContent(link: string): Promise<boolean> {
    try {
      if(!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        await this.copySharingLink(link)
        return false
      }

      const qrCode = this.sharingQRCodeElement()
      if(!qrCode) {
        await this.copySharingLink(link)
        return false
      }
      await qrCode.updateComplete
      const qrDataURL = qrCode.toDataURL()
      if(!qrDataURL) {
        await this.copySharingLink(link)
        return false
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

  private async copySharingLink(link: string) {
    try {
      if(navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
        return
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
    }
    catch {
      // Clipboard access can be denied by the browser or document context.
    }
  }

  private async copySharingQRCode() {
    try {
      const blob = await this.sharingQRCodeBlob()
      if(!blob || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") return
      await navigator.clipboard.write([new ClipboardItem({[blob.type || "image/png"]: blob})])
    }
    catch {
      // Clipboard access can be denied by the browser or document context.
    }
  }

  private async downloadSharingQRCode() {
    try {
      const blob = await this.sharingQRCodeBlob()
      if(!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `webwriter-qr-code.${blob.type === "image/svg+xml" ? "svg" : "png"}`
      link.click()
      URL.revokeObjectURL(url)
    }
    catch {
      // QR export can fail when the browser cannot rasterize the QR code.
    }
  }

  private handleSharingButtonClick = (event: Event) => {
    const label = (event as CustomEvent<{label?: string}>).detail?.label
    if(label !== "Share") return
    event.stopPropagation()
    void this.copySharingContent(placeholderSharingLink).then(copied => {
      if(copied) this.sharingButton()?.showNotification("Copied QR code and link")
    })
  }

  private renderSharingDropdown(link: string) {
    return html`
      <div class="sharing-dropdown" role="group" aria-label="Sharing options">
        <label class="sharing-link-field">
          <span class="sharing-link-label">Link</span>
          <input
            class="sharing-link-input"
            aria-label="Sharing link"
            readonly
            .value=${link}
            @click=${(event: Event) => (event.currentTarget as HTMLInputElement).select()}
          />
        </label>
        <div class="sharing-dropdown-actions">
          <button
            class="button-dropdown-more"
            type="button"
            @click=${() => void this.copySharingLink(link)}
          >Copy link</button>
          <button
            class="button-dropdown-more"
            type="button"
            @click=${() => void this.copySharingQRCode()}
          >Copy QR code</button>
          <button
            class="button-dropdown-more"
            type="button"
            @click=${() => void this.downloadSharingQRCode()}
          >Download QR code</button>
        </div>
      </div>
    `
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

  private renderDrawers() {
    return this.currentMenuGroups.map(drawer => {
      if(drawer.label === "File") return this.renderFileDrawer(drawer)
      if(drawer.label === "Sharing") return this.renderSharingDrawer(drawer)
      if(drawer.label === "Marks") return this.renderMarkDrawer()
      if(drawer.label === "Packages") return this.renderPackageDrawer()
      if(drawer.label === "Local packages") return this.renderDevelopDrawer()
      if(drawer.label === "Metadata") return this.renderMetadataDrawer()
      if(drawer.label === "Development") return this.renderDevelopmentDrawer()
      if(drawer.label === "Exports") return this.renderExportsDrawer()
      if(drawer.label === "Lists") return this.renderListDrawer()
      if(drawer.label === "Elements" || drawer.label === "Media") return this.renderInsertionDrawer(drawer)
      const representative = drawer.buttons[0]
      const icon = typeof representative === "string"
        ? representative
        : representative?.action ?? representative?.label ?? drawer.label
      return html`
        <ribbon-drawer label=${drawer.label} icon=${icon} layout=${drawer.label.toLowerCase()}>
          ${drawer.buttons.map(button => {
            const item = typeof button === "string" ? {label: button} : button
            return html`
              <ribbon-button
                label=${item.label}
                .action=${item.action ?? item.label}
                .submenu=${item.submenu ?? []}
              ></ribbon-button>
            `
          })}
        </ribbon-drawer>
      `
    })
  }

  private get currentMenuGroups() {
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
          <nav class="tabs" role="tablist" aria-label="Editor menus">
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
          ${this.renderPresence()}
          ${this.previewActive ? "" : html`
            <button
              class="history-button"
              type="button"
              aria-label="Undo"
              title="Undo"
              @click=${() => this.handleTopButtonClick("Undo")}
            >
              <span class="history-icon" aria-hidden="true">${ribbonIcon("Undo")}</span>
            </button>
            <button
              class="history-button"
              type="button"
              aria-label="Redo"
              title="Redo"
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
            ?disabled=${this.previewActive || this.previewTransitioning}
            aria-label=${this.expanded ? "Collapse ribbon" : "Expand ribbon"}
            title=${this.expanded ? "Collapse ribbon" : "Expand ribbon"}
            @click=${this.toggleExpanded}
          >
            <span class="chevron" aria-hidden="true"></span>
          </button>
        </div>
        <ribbon-menu
          .groups=${this.currentMenuGroups}
          ?hidden=${!this.menuOpen || this.expanded}
        ></ribbon-menu>
        <div
          id="ribbon-content"
          class="ribbon-content"
          role="tabpanel"
          aria-label=${this.activeMenu}
          ?hidden=${!this.expanded}
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
