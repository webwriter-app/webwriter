import { LitElement, css, html } from "lit"
import type {ListType, PresenceUser} from "../editor-bridge"
import {
  backgroundColorOptions,
  fontFamilyOptions,
  fontSizeOptions,
  markShortcutLabel,
  primaryMarkOptions,
  secondaryMarkOptions,
  textColorOptions,
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
import "./ribbon-combobox"
import {type RibbonDrawer} from "./ribbon-drawer"
import "./ribbon-drawer"
import { type RibbonMenu, type RibbonMenuButton, type RibbonMenuGroup } from "./ribbon-menu"
import "./ribbon-menu"
import "./ribbon-tab"
import "./package-search"

type RibbonMenuName = "File" | "Start" | "Insert" | "Format" | "Review" | "Settings"

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

const menuTabs: RibbonMenuName[] = ["File", "Insert", "Format", "Review", "Settings"]
const dropdownMenus: RibbonMenuName[] = ["File", "Insert", "Format", "Review", "Settings"]

const insertionMenuGroup = (section: "Text" | "Lists" | "Media"): RibbonMenuGroup => ({
  label: section,
  buttons: insertionMenuItems
    .filter(item => item.section === section)
    .flatMap<RibbonMenuButton>(item => {
      if(section === "Lists") {
        if(item.tag === "ul") {
          return [{
            label: item.name,
            action: "toggle-list:ul",
            submenu: [{label: "Menu", action: "toggle-list:menu", icon: "List"}],
          }]
        }
        return [{
          label: item.name,
          action: item.tag === "details" ? "insert-details" : `toggle-list:${item.tag}`,
        }]
      }
      if(item.tag === "p") {
        return [{
          label: item.name,
          action: item.name,
          submenu: insertionMenuItems
            .filter(submenuItem => submenuItem.section === section && submenuItem.tag === "pre")
            .map(submenuItem => submenuItem.name),
        } satisfies RibbonMenuButton]
      }
      if(item.tag === "pre") return []
      if(item.tag === "h1") {
        return [{
          label: "Heading",
          action: item.name,
          submenu: insertionMenuItems
            .filter(submenuItem => submenuItem.section === section && /^h[2-6]$/.test(submenuItem.tag))
            .map(submenuItem => submenuItem.name),
        } satisfies RibbonMenuButton]
      }
      if(/^h[2-6]$/.test(item.tag)) return []
      return [item.name]
    }),
})

const menuGroups: Record<RibbonMenuName, RibbonMenuGroup[]> = {
  File: [
    {label: "Document", buttons: ["New", "Open", "Save"]},
    {label: "Output", buttons: ["Print", "Download", "Share"]},
  ],
  Start: [
    {label: "Marks", buttons: []},
    insertionMenuGroup("Text"),
    insertionMenuGroup("Lists"),
    insertionMenuGroup("Media"),
  ],
  Insert: [
    insertionMenuGroup("Text"),
    insertionMenuGroup("Lists"),
    insertionMenuGroup("Media"),
  ],
  Format: [
    {label: "Marks", buttons: []},
    {label: "Styles", buttons: ["Heading", "Theme", "Clear"]},
    {label: "Font", buttons: ["Family", "Size", "Color"]},
    {label: "Effects", buttons: ["Highlight", "Superscript", "More"]},
    {label: "Page", buttons: ["Margins", "Columns", "Orientation"]},
    {label: "Arrange", buttons: ["Position", "Order", "Group"]},
    {label: "View", buttons: ["Zoom", "Guides", "Fullscreen"]},
  ],
  Review: [
    {label: "Proofing", buttons: ["Spelling", "Grammar", "Translate"]},
    {label: "Comments", buttons: ["New Comment", "Previous", "Next"]},
    {label: "Changes", buttons: ["Track Changes", "Accept", "Reject"]},
  ],
  Settings: [
    {label: "Editor", buttons: ["General", "Shortcuts", "Accessibility"]},
    {label: "Appearance", buttons: ["Theme", "Zoom", "Fullscreen"]},
    {label: "Advanced", buttons: ["Preferences", "Extensions", "About"]},
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
    presenceUsers: {attribute: false},
    packages: {attribute: false},
    installedPackages: {attribute: false},
    packagesLoading: {type: Boolean, attribute: "packages-loading"},
    busyPackageNames: {attribute: false},
    packageError: {type: String, attribute: "package-error"},
    packageSearchQuery: {type: String, state: true},
    packageDrawerOpen: {type: Boolean, state: true},
    packageVisibleCount: {type: Number, state: true},
    listType: {type: String, attribute: "list-type"},
    listStyle: {type: String, attribute: "list-style"},
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
      transition: max-height 180ms ease;
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

    .preview-button:hover {
      color: #243447;
      background: #e8eef5;
    }

    .preview-button:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -2px;
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

    .package-status {
      align-self: center;
      padding: 0.25rem;
      color: #667085;
      font-size: 0.66rem;
      white-space: nowrap;
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
  presenceUsers: PresenceUser[] = []
  packages: WebWriterPackage[] = []
  installedPackages: WebWriterPackage[] = []
  packagesLoading = false
  busyPackageNames: string[] = []
  packageError = ""
  listType: ListType | null = null
  listStyle = ""
  private packageSearchQuery = ""
  private packageDrawerOpen = false
  private packageVisibleCount = 2
  private ribbonContentObserver: ResizeObserver | undefined
  private responsiveLayoutQueued = false

  private readonly handleWindowResize = () => this.scheduleResponsiveLayout()

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
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
    if(!input) return
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
    window.addEventListener("resize", this.handleWindowResize)
  }

  disconnectedCallback() {
    this.ribbonContentObserver?.disconnect()
    this.ribbonContentObserver = undefined
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
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
    const columns = Math.max(2, Math.floor((usableWidth + gap) / (buttonWidth + gap)))
    // The two-cell search field cannot share its trailing single cell when
    // the grid has an odd column count. Calculate each row independently so
    // no package is accidentally placed in a clipped third row.
    const visibleCount = Math.max(
      0,
      Math.floor((columns - 2) / 2) + Math.floor(columns / 2),
    )
    if(this.packageVisibleCount !== visibleCount) this.packageVisibleCount = visibleCount
  }

  private toggleExpanded() {
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
    this.activeMenu = "Start"
    this.menuOpen = false
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

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("expanded") && !this.expanded) {
      this.dispatchEvent(new Event("ribbon-collapse", {bubbles: true, composed: true}))
    }
    if((changed.has("menuOpen") && !this.menuOpen) || changed.has("activeMenu")) {
      this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")?.closeSubmenus()
    }
    if(changed.has("activeMenu") && this.activeMenu === "Insert") {
      this.dispatchEvent(new Event("package-catalog-request", {bubbles: true, composed: true}))
    }
    if(
      changed.has("activeMenu") || changed.has("expanded") || changed.has("packages") ||
      changed.has("installedPackages") || changed.has("packageSearchQuery")
    ) this.scheduleResponsiveLayout()
  }

  private markButton(option: MarkOption, slot = "") {
    const shortcut = markShortcutLabel(option, isOnApple())
    return html`
      <ribbon-button
        slot=${slot}
        compact
        toggle
        label=${option.label}
        action=${`mark:${option.name}`}
        icon=${option.icon}
        shortcut=${shortcut}
        ?active=${this.marks.includes(option.name)}
        ?disabled=${!this.canMark}
      ></ribbon-button>
    `
  }

  private visibleMarkButton(name: MarkName) {
    const option = primaryMarkOptions.find(candidate => candidate.name === name)!
    return this.markButton(option)
  }

  private renderMarkDrawer() {
    return html`
      <ribbon-drawer
        label="Marks"
        icon="MarkBold"
        layout="marks"
        expandable
      >
        <ribbon-combobox
          class="font-family"
          name="font-family"
          label="Font family"
          .options=${fontFamilyOptions}
          .value=${this.markStyles["font-family"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-combobox
          class="font-size"
          name="font-size"
          label="Font size"
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
          name="color"
          label="Text color"
          variant="color"
          .options=${textColorOptions}
          .value=${this.markStyles.color ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-combobox
          name="background-color"
          label="Text background color"
          variant="color"
          .options=${backgroundColorOptions}
          .value=${this.markStyles["background-color"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        ${this.visibleMarkButton("b")}
        ${this.visibleMarkButton("i")}
        ${this.visibleMarkButton("u")}
        ${this.visibleMarkButton("s")}
        ${this.visibleMarkButton("a")}
        <ribbon-button
          compact
          label="Remove formatting"
          action="removeMarks"
          icon="RemoveMarks"
          ?disabled=${!this.canMark}
        ></ribbon-button>
        ${primaryMarkOptions.slice(5).map(option => this.markButton(option, "more"))}
        ${secondaryMarkOptions.map(option => this.markButton(option, "more"))}
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

  private renderDrawers() {
    return this.currentMenuGroups.map(drawer => {
      if(drawer.label === "Marks") return this.renderMarkDrawer()
      if(drawer.label === "Packages") return this.renderPackageDrawer()
      if(drawer.label === "Lists") return this.renderListDrawer()
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
      >
        <div class="ribbon-top">
          <button
            class="brand"
            ?active=${this.activeMenu === "Start"}
            type="button"
            aria-label="Show Start menu"
            title="Show Start menu"
            @click=${this.selectStart}
          >
            ${this.logoUrl ? html`<img class="brand-logo" src=${this.logoUrl} alt="WebWriter" />` : ""}
          </button>
          <nav class="tabs" role="tablist" aria-label="Editor menus">
            ${menuTabs.map(tab => html`
              <ribbon-tab label=${tab} .active=${this.activeMenu === tab}></ribbon-tab>
            `)}
          </nav>
          ${this.renderPresence()}
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
          <button
            class="preview-button"
            type="button"
            aria-label="Preview"
            title="Preview"
            @click=${() => this.handleTopButtonClick("Preview")}
          >
            <span class="preview-icon" aria-hidden="true">${ribbonIcon("Preview")}</span>
          </button>
          <button
            class="ribbon-toggle"
            type="button"
            aria-controls="ribbon-content"
            aria-expanded=${this.expanded}
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
