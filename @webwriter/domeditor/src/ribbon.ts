import { LitElement, css, html } from "lit"
import { slashMenuItems } from "./slash-menu"
import { type RibbonButton } from "./ribbon-button"
import "./ribbon-button"
import "./ribbon-group"
import { type RibbonMenu, type RibbonMenuButton, type RibbonMenuGroup } from "./ribbon-menu"
import "./ribbon-menu"
import "./ribbon-tab"

type RibbonMenuName = "File" | "Start" | "Insert" | "Format" | "Layout"

const menuTabs: RibbonMenuName[] = ["File", "Insert", "Format", "Layout"]
const dropdownMenus: RibbonMenuName[] = ["File", "Insert", "Format", "Layout"]

const slashMenuGroup = (section: "Text" | "Media"): RibbonMenuGroup => ({
  label: section,
  buttons: slashMenuItems
    .filter(item => item.section === section)
    .flatMap(item => {
      if(item.tag === "h1") {
        return [{
          label: "Heading",
          action: item.name,
          submenu: slashMenuItems
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
    {label: "Clipboard", buttons: ["Paste", "Cut", "Copy"]},
    {label: "Text", buttons: ["Bold", "Italic", "Underline"]},
    {label: "Paragraph", buttons: ["Align", "Lists", "Spacing"]},
  ],
  Insert: [
    slashMenuGroup("Text"),
    slashMenuGroup("Media"),
  ],
  Format: [
    {label: "Styles", buttons: ["Heading", "Theme", "Clear"]},
    {label: "Font", buttons: ["Family", "Size", "Color"]},
    {label: "Effects", buttons: ["Highlight", "Superscript", "More"]},
  ],
  Layout: [
    {label: "Page", buttons: ["Margins", "Columns", "Orientation"]},
    {label: "Arrange", buttons: ["Position", "Order", "Group"]},
    {label: "View", buttons: ["Zoom", "Guides", "Fullscreen"]},
  ],
}

/** The editor's tabbed, responsive ribbon toolbar. */
export class AppRibbon extends LitElement {
  static properties = {
    activeMenu: {type: String, attribute: "active-menu"},
    expanded: {type: Boolean, reflect: true},
    menuOpen: {type: Boolean, reflect: true},
    logoUrl: {type: String, attribute: "logo-url"},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      width: 100%;
      height: 120px;
      max-height: 120px;
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
      border-bottom: 0.5px solid #a8a8a8;
      background: #ffffff;
      transition: background-color 180ms ease;
    }

    .ribbon-top {
      box-sizing: border-box;
      display: flex;
      flex: 0 0 40px;
      align-items: center;
      height: 40px;
      min-height: 40px;
      padding: 0 0.5rem 0 0;
      gap: 0;
    }

    .brand {
      display: flex;
      flex: 0 0 50px;
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

    .brand:hover {
      background: #f2f2f2;
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
      align-items: end;
      min-width: 0;
      overflow: visible;
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
      gap: 0;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.25rem 0.5rem 0.2rem;
      border-top: 1px solid #d8dee6;
      background: #f2f2f2;
    }

    .ribbon-content[hidden] {
      display: none;
    }

    .ribbon-content > ribbon-group {
      flex: 1 0 13rem;
      min-width: 13rem;
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

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(!this.menuOpen || this.expanded) return

    const menu = this.renderRoot.querySelector("ribbon-menu")
    if(menu && event.composedPath().includes(menu)) return

    this.selectStart()
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    super.disconnectedCallback()
  }

  private toggleExpanded() {
    this.expanded = !this.expanded
    this.menuOpen = false
    if(!this.expanded) this.selectStart()
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
    if((changed.has("menuOpen") && !this.menuOpen) || changed.has("activeMenu")) {
      this.renderRoot.querySelector<RibbonMenu>("ribbon-menu")?.closeSubmenus()
    }
  }

  private renderGroups() {
    return menuGroups[this.activeMenu].map(group => html`
      <ribbon-group label=${group.label}>
        ${group.buttons.map(button => {
          const item = typeof button === "string" ? {label: button} : button
          return html`
            <ribbon-button
              label=${item.label}
              .action=${item.action ?? item.label}
              .submenu=${item.submenu ?? []}
            ></ribbon-button>
          `
        })}
      </ribbon-group>
    `)
  }

  render() {
    return html`
      <div class="ribbon" @ribbon-tab-select=${this.selectMenu}>
        <div class="ribbon-top">
          <button
            class="brand"
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
          .groups=${menuGroups[this.activeMenu]}
          ?hidden=${!this.menuOpen || this.expanded}
        ></ribbon-menu>
        <div
          id="ribbon-content"
          class="ribbon-content"
          role="tabpanel"
          aria-label=${this.activeMenu}
          ?hidden=${!this.expanded}
        >
          ${this.renderGroups()}
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
