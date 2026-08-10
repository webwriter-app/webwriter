import {LitElement, css, html} from "lit"
import {
  markShortcutLabel,
  primaryMarkOptions,
  secondaryMarkOptions,
  type MarkName,
  type MarkOption,
} from "../marks"
import {ribbonIcon} from "../ribbon-icons"
import {isOnApple} from "../utility"
import "./ribbon-button"

/** Compact mark toggles plus a downward-opening drawer of secondary marks. */
export class MarkRibbonGroup extends LitElement {
  static properties = {
    disabled: {type: Boolean, reflect: true},
    drawerOpen: {state: true},
    marks: {attribute: false},
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
    }

    .group {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      padding: 0 0.5rem;
      border-right: 1px solid #d8dee6;
    }

    .controls {
      display: grid;
      flex: 1 1 auto;
      grid-template-rows: repeat(2, 1.75rem);
      grid-auto-flow: column;
      grid-auto-columns: 1.75rem;
      align-content: center;
      gap: 0.15rem;
      min-width: 0;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
    }

    .drawer-toggle {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 1.75rem;
      height: 1.75rem;
      padding: 0.25rem;
      border: 1px solid transparent;
      border-radius: 0.35rem;
      color: #526b86;
      background: transparent;
      cursor: pointer;
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

    .drawer-icon,
    .drawer-icon svg {
      display: block;
      width: 1rem;
      height: 1rem;
    }

    .drawer {
      position: fixed;
      inset: auto;
      z-index: 2147483647;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(2, 1.75rem);
      grid-auto-rows: 1.75rem;
      grid-auto-flow: column;
      grid-template-rows: repeat(6, 1.75rem);
      gap: 0.15rem;
      width: max-content;
      margin: 0;
      padding: 0.35rem;
      border: 1px solid #a8a8a8;
      border-radius: 0.35rem;
      background: #ffffff;
      box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 16%);
    }

    .drawer[hidden] {
      display: none;
    }

    @media (max-width: 36rem) {
      .group {
        padding: 0.15rem 0.25rem;
        border-right: 0;
        border-bottom: 1px solid #d8dee6;
      }
    }
  `

  disabled = true
  marks: MarkName[] = []
  private drawerOpen = false

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    if(this.drawerOpen && !event.composedPath().includes(this)) this.closeDrawer()
  }

  private readonly handleDocumentKeydown = (event: KeyboardEvent) => {
    if(this.drawerOpen && event.key === "Escape") this.closeDrawer()
  }

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener("pointerdown", this.handleDocumentPointerDown)
    document.addEventListener("keydown", this.handleDocumentKeydown)
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown)
    super.disconnectedCallback()
  }

  closeDrawer() {
    const drawer = this.renderRoot.querySelector<HTMLElement>(".drawer")
    if(drawer && "hidePopover" in drawer && drawer.matches(":popover-open")) drawer.hidePopover()
    this.drawerOpen = false
  }

  private toggleDrawer() {
    if(this.drawerOpen) {
      this.closeDrawer()
      return
    }
    this.drawerOpen = true
    void this.openDrawer()
  }

  private async openDrawer() {
    await this.updateComplete
    const drawer = this.renderRoot.querySelector<HTMLElement>(".drawer")
    if(drawer && "showPopover" in drawer) drawer.showPopover()
    await this.positionDrawer()
  }

  private async positionDrawer() {
    await this.updateComplete
    if(!this.drawerOpen) return
    const toggle = this.renderRoot.querySelector<HTMLElement>(".drawer-toggle")
    const drawer = this.renderRoot.querySelector<HTMLElement>(".drawer")
    if(!toggle || !drawer) return

    const buttonRect = toggle.getBoundingClientRect()
    const drawerRect = drawer.getBoundingClientRect()
    const margin = 8
    const left = Math.min(
      Math.max(margin, buttonRect.left),
      Math.max(margin, window.innerWidth - drawerRect.width - margin),
    )
    const below = buttonRect.bottom + 4
    const top = below + drawerRect.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, buttonRect.top - drawerRect.height - 4)
    drawer.style.left = `${left}px`
    drawer.style.top = `${top}px`
  }

  private markButton(option: MarkOption) {
    const shortcut = markShortcutLabel(option, isOnApple())
    return html`
      <ribbon-button
        compact
        toggle
        label=${option.label}
        action=${`mark:${option.name}`}
        icon=${option.icon}
        shortcut=${shortcut}
        ?active=${this.marks.includes(option.name)}
        ?disabled=${this.disabled}
      ></ribbon-button>
    `
  }

  render() {
    return html`
      <section class="group" aria-label="Marks" @ribbon-button-click=${this.closeDrawer}>
        <div class="controls">
          ${primaryMarkOptions.map(option => this.markButton(option))}
          <ribbon-button
            compact
            label="Remove marks"
            action="removeMarks"
            icon="RemoveMarks"
            ?disabled=${this.disabled}
          ></ribbon-button>
          <button
            class="drawer-toggle"
            type="button"
            aria-label="More marks"
            title="More marks"
            aria-controls="secondary-marks"
            aria-expanded=${this.drawerOpen}
            @click=${this.toggleDrawer}
          >
            <span class="drawer-icon" aria-hidden="true">${ribbonIcon("MoreMarks")}</span>
          </button>
        </div>
        <div
          id="secondary-marks"
          class="drawer"
          popover="manual"
          role="group"
          aria-label="More marks"
          ?hidden=${!this.drawerOpen}
        >
          ${secondaryMarkOptions.map(option => this.markButton(option))}
        </div>
      </section>
    `
  }
}

if(!customElements.get("mark-ribbon-group")) {
  customElements.define("mark-ribbon-group", MarkRibbonGroup)
}

declare global {
  interface HTMLElementTagNameMap {
    "mark-ribbon-group": MarkRibbonGroup
  }
}
