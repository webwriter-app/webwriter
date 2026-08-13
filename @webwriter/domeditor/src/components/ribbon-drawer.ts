import {LitElement, css, html} from "lit"
import {ribbonIcon} from "../ribbon-icons"

export type RibbonDrawerLayoutWidths = {
  collapsed: number
  expanded: number
}

/**
 * A labelled ribbon drawer with an optional second tier of controls. At narrow
 * widths it exchanges its controls for a representative summary and reuses the
 * complete control grid in a fixed-width panel below the ribbon.
 *
 * Widths can be tailored with `--ribbon-drawer-expanded-width`,
 * `--ribbon-drawer-collapsed-width`, and `--ribbon-drawer-width`.
 */
export class RibbonDrawer extends LitElement {
  static properties = {
    collapsed: {type: Boolean, reflect: true},
    drawerOpen: {type: Boolean, reflect: true, attribute: "drawer-open"},
    drawerContentOpen: {type: Boolean, reflect: true, attribute: "drawer-visible"},
    drawerSettled: {type: Boolean, reflect: true, attribute: "drawer-settled"},
    expandable: {type: Boolean, reflect: true},
    icon: {type: String},
    label: {type: String},
    layout: {type: String, reflect: true},
  }

  static styles = css`
    :host {
      --ribbon-drawer-expanded-width: 13.25rem;
      --ribbon-drawer-collapsed-width: 5rem;
      --ribbon-drawer-width: var(--ribbon-drawer-expanded-width);
      --ribbon-drawer-height: 5rem;
      --ribbon-drawer-more-height: 5.85rem;
      --ribbon-drawer-panel-padding-block: 0.5rem;
      --ribbon-drawer-inline-start: 0;
      --ribbon-drawer-inline-end: auto;
      display: block;
      flex: 0 0 var(--ribbon-drawer-expanded-width);
      position: relative;
      z-index: 0;
      min-width: var(--ribbon-drawer-expanded-width);
    }

    :host([layout="marks"]) {
      --ribbon-drawer-expanded-width: 16.625rem;
      --ribbon-drawer-height: 10.3rem;
      --ribbon-drawer-panel-padding-block: 0.375rem;
    }

    :host([layout="text"]) {
      --ribbon-drawer-expanded-width: 5.25rem;
    }

    :host([layout="lists"]) {
      --ribbon-drawer-expanded-width: 9.25rem;
    }

    :host([layout="packages"]) {
      --ribbon-drawer-expanded-width: 16.5rem;
      --ribbon-drawer-width: min(42rem, calc(100vw - 1rem));
      --ribbon-drawer-height: 10rem;
      --ribbon-drawer-more-height: 8rem;
      flex-grow: 1;
    }

    :host([collapsed]) {
      flex: 0 0 var(--ribbon-drawer-collapsed-width);
      min-width: var(--ribbon-drawer-collapsed-width);
    }

    :host([drawer-open]),
    :host([drawer-visible]) {
      z-index: 3;
    }

    .drawer {
      --collapsed-drawer-height: calc(100% - var(--ribbon-drawer-more-height));
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      position: relative;
      anchor-name: --responsive-ribbon-drawer;
      height: 100%;
      max-height: var(--drawer-collapsed-height, 100%);
      min-height: 0;
      padding: 0 0.5rem;
      border: 1px solid transparent;
      border-right-color: #d8dee6;
      background: #f2f2f2;
      transition: max-height 180ms ease;
    }

    :host(:last-child) .drawer {
      border-right-color: transparent;
    }

    :host([layout="packages"]) .drawer {
      border-right-color: #d8dee6;
    }

    .drawer.expanded {
      height: calc(100% + var(--ribbon-drawer-more-height));
      max-height: calc(100% + var(--ribbon-drawer-more-height));
      margin-left: -1px;
      padding-left: calc(0.5rem + 1px);
      border-color: transparent;
      border-right-color: #d8dee6;
      border-bottom-color: #d8dee6;
      border-left-color: #d8dee6;
      background: #f2f2f2;
      box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 18%);
      clip-path: polygon(
        0 0,
        100% 0,
        100% calc(var(--collapsed-drawer-height) + 3px),
        calc(100% + 1rem) calc(var(--collapsed-drawer-height) + 3px),
        calc(100% + 1rem) calc(100% + 1rem),
        -1rem calc(100% + 1rem),
        -1rem calc(var(--collapsed-drawer-height) + 3px),
        0 calc(var(--collapsed-drawer-height) + 3px)
      );
    }

    .drawer.expanded.closing {
      max-height: var(--drawer-collapsed-height, 100%);
    }

    .controls {
      box-sizing: border-box;
      display: grid;
      flex: 1 1 auto;
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-flow: column;
      grid-auto-columns: 4rem;
      align-content: stretch;
      align-items: center;
      gap: 0;
      padding-bottom: 0.25rem;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    slot {
      display: contents;
    }

    slot[hidden] {
      display: none;
    }

    :host([layout="marks"]) .controls {
      grid-template-columns: repeat(8, 1.75rem);
      grid-template-rows: none;
      grid-auto-flow: row;
      grid-auto-columns: auto;
      grid-auto-rows: 1.75rem;
      align-content: start;
      align-items: stretch;
      gap: 0.2rem;
      padding-top: 0;
      padding-bottom: 0.375rem;
      overflow-x: hidden;
      overflow-y: hidden;
    }

    :host([layout="packages"]) .controls {
      grid-template-columns: repeat(auto-fill, minmax(4rem, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      grid-auto-flow: row;
      grid-auto-columns: minmax(4rem, 1fr);
      grid-auto-rows: minmax(0, 1fr);
      align-content: stretch;
      align-items: stretch;
    }

    :host([layout="packages"]) .drawer.expanded {
      height: var(--package-expanded-height, calc(100% + var(--ribbon-drawer-more-height)));
      max-height: var(--package-expanded-height, calc(100% + var(--ribbon-drawer-more-height)));
    }

    :host([layout="packages"]) .drawer.expanded.closing {
      max-height: var(--drawer-collapsed-height, 100%);
    }

    :host([layout="packages"][drawer-visible]) .controls {
      grid-template-rows: repeat(2, var(--package-row-height, 2.45rem));
      grid-auto-rows: var(--package-row-height, 2.45rem);
      flex: 0 1 auto;
      align-content: start;
      padding-top: var(--package-expanded-grid-offset, 0);
      padding-bottom: var(--package-expanded-grid-padding, 0.25rem);
      overflow-x: hidden;
      overflow-y: hidden;
    }

    :host([layout="packages"][drawer-open][drawer-settled]) .controls {
      overflow-y: auto;
    }

    :host([layout="packages"]) ::slotted(package-search) {
      grid-column: span 2;
      width: 100%;
    }

    :host([layout="marks"]) ::slotted(.font-family) {
      grid-column: span 4;
    }

    :host([layout="marks"]) ::slotted(.font-size) {
      grid-column: span 2;
    }

    .summary {
      display: none;
    }

    .drawer-toggle {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      position: absolute;
      left: calc(50% + 1px);
      bottom: -0.25rem;
      z-index: 1;
      justify-self: center;
      align-self: center;
      width: 5rem;
      height: 1.125rem;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 0.3rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
      transform: translateX(-50%);
      transition: bottom 180ms ease;
    }

    .drawer.expanded .drawer-toggle {
      bottom: -0.625rem;
    }

    .drawer-toggle[hidden] {
      display: none;
    }

    .drawer-toggle:hover,
    .drawer-toggle[aria-expanded="true"] {
      border-color: #c8d2df;
      color: #1e4f87;
      background: #eef4fb;
    }

    .drawer-toggle:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .drawer-icon {
      display: block;
      box-sizing: border-box;
      width: 0.35rem;
      height: 0.35rem;
      border-right: 1.25px solid currentColor;
      border-bottom: 1.25px solid currentColor;
      transform: rotate(45deg);
      transition: transform 120ms ease;
    }

    .drawer-toggle[aria-expanded="true"] .drawer-icon {
      transform: rotate(225deg);
    }

    :host([collapsed]) .drawer,
    :host([collapsed]) .drawer.expanded,
    :host([collapsed]) .drawer.expanded.closing {
      height: 100%;
      max-height: 100%;
      margin-left: 0;
      padding: 0 0.25rem;
      border-color: transparent;
      border-right-color: #d8dee6;
      background: #f2f2f2;
      box-shadow: none;
      clip-path: none;
    }

    :host([collapsed]) .summary {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-height: 0;
      padding: 0.1rem 0 0.65rem;
      color: #2f3742;
      text-align: center;
    }

    .summary-icon {
      display: block;
      flex: 0 0 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
      color: #526b86;
    }

    .summary-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .summary-label {
      display: block;
      max-width: 100%;
      overflow: hidden;
      font-size: 0.6rem;
      line-height: 0.8rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :host([collapsed]) .controls {
      position: absolute;
      top: calc(100% - 1px);
      inset-inline-start: var(--ribbon-drawer-inline-start);
      inset-inline-end: var(--ribbon-drawer-inline-end);
      z-index: 0;
      width: var(--ribbon-drawer-width);
      height: var(--ribbon-drawer-height);
      max-height: 0;
      padding: 0 0.5rem;
      border: 1px solid #d8dee6;
      background: #f2f2f2;
      box-shadow: 0 0.45rem 1rem rgb(0 0 0 / 18%);
      visibility: hidden;
      overflow: hidden;
      pointer-events: none;
      transition:
        max-height 180ms ease,
        padding 180ms ease,
        visibility 0s linear 180ms;
    }

    :host([collapsed][drawer-visible]) .controls {
      visibility: visible;
    }

    :host([collapsed][drawer-open]) .controls {
      max-height: var(--ribbon-drawer-height);
      padding-top: var(--ribbon-drawer-panel-padding-block);
      padding-bottom: var(--ribbon-drawer-panel-padding-block);
      visibility: visible;
      pointer-events: auto;
      transition-delay: 0s;
    }

    :host([collapsed]) .drawer-toggle {
      width: calc(100% - 0.5rem);
    }

    :host([collapsed][drawer-open]) .drawer-toggle {
      bottom: calc(0px - var(--ribbon-drawer-height) + 1px - 0.5625rem);
    }

    .size-probe {
      position: absolute;
      width: var(--probe-width);
      height: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .expanded-size-probe {
      --probe-width: var(--ribbon-drawer-expanded-width);
    }

    .collapsed-size-probe {
      --probe-width: var(--ribbon-drawer-collapsed-width);
    }

    @supports (top: anchor(bottom)) {
      :host([collapsed]) .controls {
        position: fixed;
        position-anchor: --responsive-ribbon-drawer;
        top: calc(anchor(bottom) - 1px);
        inset-inline: auto;
        left: clamp(
          0.5rem,
          anchor(left),
          calc(100vw - var(--ribbon-drawer-width) - 0.5rem)
        );
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .drawer,
      .controls,
      .drawer-toggle,
      .drawer-icon {
        transition-duration: 0s;
      }
    }
  `

  collapsed = false
  expandable = false
  icon = ""
  label = "Drawer"
  layout = "default"
  private drawerOpen = false
  private drawerContentOpen = false
  private drawerSettled = false
  private forcedOpen = false
  private drawerCloseTimer: ReturnType<typeof setTimeout> | undefined
  private drawerSettleTimer: ReturnType<typeof setTimeout> | undefined

  private readonly handleWindowResize = () => {
    if(!this.drawerOpen) return
    if(this.updatePackageDrawerSize()) {
      this.drawerSettled = false
      this.scheduleDrawerSettle()
    }
  }

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(this.drawerOpen && !event.composedPath().includes(this)) this.closeDrawer()
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(!this.drawerOpen || event.key !== "Escape") return
    this.closeDrawer()
    this.renderRoot.querySelector<HTMLButtonElement>(".drawer-toggle")?.focus()
  }

  private readonly handleRibbonAction = (event: Event) => {
    const keepOpen = (event as CustomEvent<{keepDrawerOpen?: boolean}>).detail?.keepDrawerOpen
    if(!keepOpen) this.closeDrawer()
  }

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener("ribbon-button-click", this.handleRibbonAction)
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown)
    window.addEventListener("resize", this.handleWindowResize)
  }

  disconnectedCallback() {
    this.cancelDrawerClose()
    this.cancelDrawerSettle()
    this.removeEventListener("ribbon-button-click", this.handleRibbonAction)
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown)
    window.removeEventListener("resize", this.handleWindowResize)
    super.disconnectedCallback()
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("collapsed") && !this.collapsed) this.closeDrawer()
    if(changed.has("expandable") && !this.expandable && !this.collapsed && !this.forcedOpen) this.closeDrawer()
  }

  private lengthInPixels(value: string, fallback: number) {
    const numeric = Number.parseFloat(value)
    if(!Number.isFinite(numeric)) return fallback
    if(value.endsWith("rem")) {
      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      return numeric * rootFontSize
    }
    if(value.endsWith("em")) {
      const fontSize = Number.parseFloat(getComputedStyle(this).fontSize) || 16
      return numeric * fontSize
    }
    if(value.endsWith("px")) return numeric
    return fallback
  }

  private measuredWidth(selector: string, property: string, fallback: number) {
    const measured = this.renderRoot.querySelector<HTMLElement>(selector)?.getBoundingClientRect().width ?? 0
    if(measured > 0) return measured
    const value = getComputedStyle(this).getPropertyValue(property).trim()
    return this.lengthInPixels(value, fallback)
  }

  /** Fixed widths used by the ribbon's overflow coordinator. */
  get layoutWidths(): RibbonDrawerLayoutWidths {
    return {
      collapsed: this.measuredWidth(
        ".collapsed-size-probe",
        "--ribbon-drawer-collapsed-width",
        80,
      ),
      expanded: this.measuredWidth(
        ".expanded-size-probe",
        "--ribbon-drawer-expanded-width",
        this.layout === "marks" ? 266 : 212,
      ),
    }
  }

  closeDrawer() {
    this.querySelectorAll<HTMLElement & {close?: () => void}>("ribbon-combobox")
      .forEach(combobox => combobox.close?.())
    this.forcedOpen = false
    if(!this.drawerOpen) return
    this.cancelDrawerSettle()
    this.drawerSettled = false
    this.drawerOpen = false
    this.dispatchDrawerState()
    this.scheduleDrawerClose()
  }

  private captureExpandedContentOffset() {
    if(this.layout !== "packages" || this.collapsed) return
    const drawer = this.renderRoot.querySelector<HTMLElement>(".drawer")
    const controls = this.renderRoot.querySelector<HTMLElement>(".controls")
    const firstControl = Array.from(this.children).find(child => (
      child.slot !== "more" && child.localName === "ribbon-button"
    )) as HTMLElement | undefined
    if(!drawer || !controls) return
    const drawerBounds = drawer.getBoundingClientRect()
    const controlsBounds = controls.getBoundingClientRect()
    const controlsStyle = getComputedStyle(controls)
    const rowGap = Number.parseFloat(controlsStyle.rowGap) || 0
    const paddingTop = Number.parseFloat(controlsStyle.paddingTop) || 0
    const paddingBottom = Number.parseFloat(controlsStyle.paddingBottom) || 0
    const offset = firstControl
      ? Math.max(0, firstControl.getBoundingClientRect().top - controlsBounds.top)
      : 0
    const storedRowHeight = Number.parseFloat(controlsStyle.getPropertyValue("--package-row-height")) || 0
    const rowHeight = storedRowHeight || Math.max(
      0,
      (controlsBounds.height - paddingTop - paddingBottom - rowGap) / 2,
    )
    controls.style.setProperty("--package-expanded-grid-offset", `${offset}px`)
    controls.style.setProperty("--package-expanded-grid-padding", `${Math.max(offset, 4)}px`)
    if(rowHeight > 0) controls.style.setProperty("--package-row-height", `${rowHeight}px`)
    drawer.style.setProperty(
      "--package-drawer-chrome-height",
      `${Math.max(0, drawerBounds.height - controlsBounds.height)}px`,
    )
  }

  private updatePackageDrawerSize() {
    if(this.layout !== "packages" || this.collapsed) return false
    const drawer = this.renderRoot.querySelector<HTMLElement>(".drawer")
    const controls = this.renderRoot.querySelector<HTMLElement>(".controls")
    if(!drawer || !controls) return false
    const bounds = this.getBoundingClientRect()
    const drawerBounds = drawer.getBoundingClientRect()
    const controlsBounds = controls.getBoundingClientRect()
    const controlsStyle = getComputedStyle(controls)
    const rowGap = Number.parseFloat(controlsStyle.rowGap) || 0
    const columnGap = Number.parseFloat(controlsStyle.columnGap) || 0
    const paddingTop = Number.parseFloat(controlsStyle.paddingTop) || 0
    const paddingBottom = Number.parseFloat(controlsStyle.paddingBottom) || 0
    const storedRowHeight = Number.parseFloat(controlsStyle.getPropertyValue("--package-row-height")) || 0
    const rowHeight = storedRowHeight || Math.max(
      0,
      (controlsBounds.height - paddingTop - paddingBottom - rowGap) / 2,
    )
    const columnWidth = 64
    const columns = Math.max(1, Math.floor((controlsBounds.width + columnGap) / (columnWidth + columnGap)))
    const spans = Array.from(this.children)
      .filter(child => child instanceof HTMLElement)
      .map(child => child.localName === "package-search" ? 2 : child.localName === "ribbon-button" ? 2 : 1)
    let row = 0
    let column = 0
    let rowCount = 0
    for(const requestedSpan of spans) {
      const span = Math.min(columns, requestedSpan)
      if(column + span > columns) {
        row++
        column = 0
      }
      rowCount = Math.max(rowCount, row + 1)
      column += span
      if(column >= columns) {
        row++
        column = 0
      }
    }
    const storedChromeHeight = Number.parseFloat(
      drawer.style.getPropertyValue("--package-drawer-chrome-height"),
    )
    const chromeHeight = Number.isFinite(storedChromeHeight)
      ? storedChromeHeight
      : Math.max(0, drawerBounds.height - controlsBounds.height)
    const topPadding = Number.parseFloat(
      controlsStyle.getPropertyValue("--package-expanded-grid-offset"),
    ) || 0
    const bottomPadding = Number.parseFloat(
      controlsStyle.getPropertyValue("--package-expanded-grid-padding"),
    ) || 4
    const contentHeight = chromeHeight + topPadding + bottomPadding + rowCount * rowHeight + Math.max(0, rowCount - 1) * rowGap
    const available = Math.max(bounds.height, window.innerHeight - Math.max(0, bounds.top))
    const collapsedHeight = Number.parseFloat(drawer.style.getPropertyValue("--drawer-collapsed-height")) || drawerBounds.height
    const preferredHeight = Math.max(collapsedHeight, Math.min(contentHeight, available))
    const currentTarget = Number.parseFloat(drawer.style.getPropertyValue("--package-expanded-height")) || 0
    const expanded = preferredHeight
    const changed = currentTarget <= 0 || Math.abs(expanded - currentTarget) > 0.5
    if(changed) drawer.style.setProperty("--package-expanded-height", `${expanded}px`)
    this.style.setProperty("--ribbon-drawer-available-height", `${available}px`)
    return changed
  }

  openDrawer(force = false) {
    if(force) this.forcedOpen = true
    if(this.drawerOpen) return
    this.captureExpandedContentOffset()
    this.cancelDrawerClose()
    if(!this.drawerContentOpen) {
      const drawer = this.renderRoot.querySelector<HTMLElement>(".drawer")
      const collapsedHeight = drawer?.getBoundingClientRect().height ?? 0
      if(collapsedHeight > 0) {
        drawer?.style.setProperty("--collapsed-drawer-height", `${collapsedHeight}px`)
        drawer?.style.setProperty("--drawer-collapsed-height", `${collapsedHeight}px`)
      }
    }
    this.updatePackageDrawerSize()
    this.drawerContentOpen = true
    this.drawerSettled = false
    this.drawerOpen = true
    this.dispatchDrawerState()
    this.scheduleDrawerSettle()
  }

  private toggleDrawer() {
    if(!this.collapsed && !this.expandable) return
    if(this.drawerOpen) {
      this.closeDrawer()
      return
    }
    this.openDrawer(false)
  }

  private dispatchDrawerState() {
    this.dispatchEvent(new CustomEvent<{label: string, open: boolean}>("ribbon-drawer-state-change", {
      detail: {label: this.label, open: this.drawerOpen},
      bubbles: true,
      composed: true,
    }))
  }

  private cancelDrawerClose() {
    if(this.drawerCloseTimer === undefined) return
    clearTimeout(this.drawerCloseTimer)
    this.drawerCloseTimer = undefined
  }

  private cancelDrawerSettle() {
    if(this.drawerSettleTimer === undefined) return
    clearTimeout(this.drawerSettleTimer)
    this.drawerSettleTimer = undefined
  }

  private finishDrawerSettle() {
    this.cancelDrawerSettle()
    if(this.drawerOpen) this.drawerSettled = true
  }

  private scheduleDrawerSettle() {
    this.cancelDrawerSettle()
    this.drawerSettleTimer = setTimeout(() => this.finishDrawerSettle(), 180)
  }

  private finishDrawerClose() {
    this.cancelDrawerClose()
    if(this.drawerOpen) return
    this.drawerContentOpen = false
  }

  private scheduleDrawerClose() {
    this.cancelDrawerClose()
    this.drawerCloseTimer = setTimeout(() => this.finishDrawerClose(), 180)
  }

  private readonly handleDrawerTransitionEnd = (event: TransitionEvent) => {
    if(event.propertyName !== "max-height") return
    if(this.drawerOpen) this.finishDrawerSettle()
    else this.finishDrawerClose()
  }

  render() {
    const toggleUnavailable = !this.collapsed && !this.expandable
    return html`
      <section
        class=${this.drawerOpen
          ? "drawer expanded"
          : this.drawerContentOpen ? "drawer expanded closing" : "drawer"}
        aria-label=${this.label}
        @transitionend=${this.handleDrawerTransitionEnd}
      >
        <div class="summary">
          <span class="summary-icon" aria-hidden="true">${ribbonIcon(this.icon || this.label)}</span>
          <span class="summary-label">${this.label}</span>
        </div>
        <div id="drawer-controls" class="controls">
          <slot></slot>
          <slot name="more" ?hidden=${!this.drawerContentOpen}></slot>
        </div>
        <button
          class="drawer-toggle"
          type="button"
          ?hidden=${toggleUnavailable}
          ?disabled=${toggleUnavailable}
          aria-controls="drawer-controls"
          aria-expanded=${this.drawerOpen}
          aria-label=${this.collapsed
            ? `${this.drawerOpen ? "Hide" : "Show"} ${this.label} controls`
            : `More ${this.label.toLocaleLowerCase()}`}
          title=${this.collapsed
            ? `${this.drawerOpen ? "Hide" : "Show"} ${this.label} controls`
            : `More ${this.label.toLocaleLowerCase()}`}
          @click=${this.toggleDrawer}
        >
          <span class="drawer-icon" aria-hidden="true"></span>
        </button>
      </section>
      <span class="size-probe expanded-size-probe" aria-hidden="true"></span>
      <span class="size-probe collapsed-size-probe" aria-hidden="true"></span>
    `
  }
}

if(!customElements.get("ribbon-drawer")) {
  customElements.define("ribbon-drawer", RibbonDrawer)
}

declare global {
  interface HTMLElementTagNameMap {
    "ribbon-drawer": RibbonDrawer
  }
}
