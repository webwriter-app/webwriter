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
    expandable: {type: Boolean, reflect: true},
    icon: {type: String},
    label: {type: String},
    layout: {type: String, reflect: true},
  }

  static styles = css`
    :host {
      --ribbon-drawer-expanded-width: 13rem;
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
      max-height: 100%;
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
      max-height: 100%;
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
      gap: 0.15rem;
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
      bottom: -0.2rem;
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

    .drawer-toggle[hidden] {
      display: none;
    }

    .drawer.expanded:not(.closing) .drawer-toggle {
      bottom: -0.5625rem;
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
  private drawerCloseTimer: ReturnType<typeof setTimeout> | undefined

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(this.drawerOpen && !event.composedPath().includes(this)) this.closeDrawer()
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(!this.drawerOpen || event.key !== "Escape") return
    this.closeDrawer()
    this.renderRoot.querySelector<HTMLButtonElement>(".drawer-toggle")?.focus()
  }

  private readonly handleRibbonAction = () => this.closeDrawer()

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener("ribbon-button-click", this.handleRibbonAction)
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown)
  }

  disconnectedCallback() {
    this.cancelDrawerClose()
    this.removeEventListener("ribbon-button-click", this.handleRibbonAction)
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown)
    super.disconnectedCallback()
  }

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("collapsed") && !this.collapsed) this.closeDrawer()
    if(changed.has("expandable") && !this.expandable && !this.collapsed) this.closeDrawer()
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
        this.layout === "marks" ? 266 : 208,
      ),
    }
  }

  closeDrawer() {
    this.querySelectorAll<HTMLElement & {close?: () => void}>("ribbon-combobox")
      .forEach(combobox => combobox.close?.())
    if(!this.drawerOpen) return
    this.drawerOpen = false
    this.scheduleDrawerClose()
  }

  private toggleDrawer() {
    if(!this.collapsed && !this.expandable) return
    if(this.drawerOpen) {
      this.closeDrawer()
      return
    }
    this.cancelDrawerClose()
    if(!this.drawerContentOpen) {
      const drawer = this.renderRoot.querySelector<HTMLElement>(".drawer")
      const collapsedHeight = drawer?.getBoundingClientRect().height ?? 0
      if(collapsedHeight > 0) {
        drawer?.style.setProperty("--collapsed-drawer-height", `${collapsedHeight}px`)
      }
    }
    this.drawerContentOpen = true
    this.drawerOpen = true
  }

  private cancelDrawerClose() {
    if(this.drawerCloseTimer === undefined) return
    clearTimeout(this.drawerCloseTimer)
    this.drawerCloseTimer = undefined
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
    if(event.propertyName === "max-height" && !this.drawerOpen) this.finishDrawerClose()
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
