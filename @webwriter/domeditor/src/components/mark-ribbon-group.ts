import {LitElement, css, html} from "lit"
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
import {isOnApple} from "../utility"
import "./ribbon-button"
import "./ribbon-combobox"
import type {RibbonCombobox} from "./ribbon-combobox"

/** Compact mark toggles plus a vertically expanding area of secondary marks. */
export class MarkRibbonGroup extends LitElement {
  static properties = {
    disabled: {type: Boolean, reflect: true},
    drawerOpen: {type: Boolean, reflect: true, attribute: "drawer-open"},
    drawerContentOpen: {type: Boolean, reflect: true, attribute: "drawer-visible"},
    marks: {attribute: false},
    styles: {attribute: false},
  }

  static styles = css`
    :host {
      display: block;
      position: relative;
      z-index: 0;
      min-width: 0;
    }

    :host([drawer-open]) {
      z-index: 2;
    }

    :host([drawer-visible]) {
      z-index: 2;
    }

    .group {
      --expanded-area-height: 5.85rem;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      position: relative;
      height: 100%;
      max-height: 100%;
      min-height: 0;
      padding: 0 0.5rem;
      border: 1px solid transparent;
      border-right-color: #d8dee6;
      background: #f2f2f2;
      transition: max-height 180ms ease;
    }

    .group.expanded {
      height: calc(100% + var(--expanded-area-height));
      max-height: calc(100% + var(--expanded-area-height));
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
        100% calc(var(--collapsed-group-height, calc(100% - var(--expanded-area-height))) + 3px),
        calc(100% + 1rem) calc(var(--collapsed-group-height, calc(100% - var(--expanded-area-height))) + 3px),
        calc(100% + 1rem) calc(100% + 1rem),
        -1rem calc(100% + 1rem),
        -1rem calc(var(--collapsed-group-height, calc(100% - var(--expanded-area-height))) + 3px),
        0 calc(var(--collapsed-group-height, calc(100% - var(--expanded-area-height))) + 3px)
      );
    }

    .group.expanded.closing {
      max-height: 100%;
    }

    .controls {
      box-sizing: border-box;
      display: grid;
      flex: 1 1 auto;
      grid-template-columns: repeat(8, 1.75rem);
      grid-auto-flow: row;
      grid-auto-rows: 1.75rem;
      align-content: start;
      gap: 0.2rem;
      min-width: 0;
      min-height: 0;
      padding-top: 0;
      padding-bottom: 0.375rem;
      overflow-x: hidden;
      overflow-y: hidden;
    }

    .font-family {
      grid-column: span 4;
    }

    .font-size {
      grid-column: span 2;
    }

    .drawer-toggle {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      position: absolute;
      left: calc(50% + 1px);
      bottom: -0.2rem;
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
    }

    .group.expanded .drawer-toggle {
      bottom: -0.5625rem;
      z-index: 1;
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

    @media (max-width: 36rem) {
      .group {
        padding: 0.15rem 0.25rem;
        border-right: 0;
        border-bottom: 1px solid #d8dee6;
      }

      .group.expanded {
        padding-left: calc(0.25rem + 1px);
        border-top-color: transparent;
        border-right: 1px solid #d8dee6;
        border-bottom-color: #d8dee6;
        border-left-color: #d8dee6;
      }
    }
  `

  disabled = true
  marks: MarkName[] = []
  styles: StyleMarkValues = {}
  private drawerOpen = false
  private drawerContentOpen = false
  private drawerCloseTimer: ReturnType<typeof setTimeout> | undefined

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
    this.cancelDrawerClose()
    document.removeEventListener("pointerdown", this.handleDocumentPointerDown)
    document.removeEventListener("keydown", this.handleDocumentKeydown)
    super.disconnectedCallback()
  }

  closeDrawer() {
    this.renderRoot.querySelectorAll<RibbonCombobox>("ribbon-combobox")
      .forEach(combobox => combobox.close())
    if(!this.drawerOpen) return
    this.drawerOpen = false
    this.scheduleDrawerClose()
  }

  private toggleDrawer() {
    if(this.drawerOpen) {
      this.closeDrawer()
      return
    }
    this.cancelDrawerClose()
    if(!this.drawerContentOpen) {
      const group = this.renderRoot.querySelector<HTMLElement>(".group")
      const collapsedHeight = group?.getBoundingClientRect().height ?? 0
      if(collapsedHeight > 0) group?.style.setProperty("--collapsed-group-height", `${collapsedHeight}px`)
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

  private readonly handleGroupTransitionEnd = (event: TransitionEvent) => {
    if(event.propertyName === "max-height" && !this.drawerOpen) this.finishDrawerClose()
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

  private visibleMarkButton(name: MarkName) {
    const option = primaryMarkOptions.find(candidate => candidate.name === name)!
    return this.markButton(option)
  }

  render() {
    return html`
      <section
        class=${this.drawerOpen
          ? "group expanded"
          : this.drawerContentOpen? "group expanded closing": "group"}
        aria-label="Marks"
        @transitionend=${this.handleGroupTransitionEnd}
        @ribbon-button-click=${this.closeDrawer}
      >
        <div class="controls">
          <ribbon-combobox
            class="font-family"
            name="font-family"
            label="Font family"
            .options=${fontFamilyOptions}
            .value=${this.styles["font-family"] ?? ""}
            ?disabled=${this.disabled}
          ></ribbon-combobox>
          <ribbon-combobox
            class="font-size"
            name="font-size"
            label="Font size"
            .options=${fontSizeOptions}
            .value=${this.styles["font-size"] ?? ""}
            ?disabled=${this.disabled}
          ></ribbon-combobox>
          <ribbon-button
            compact
            label="Increase font size"
            action="increaseFontSize"
            icon="IncreaseFontSize"
            ?disabled=${this.disabled}
          ></ribbon-button>
          <ribbon-button
            compact
            label="Decrease font size"
            action="decreaseFontSize"
            icon="DecreaseFontSize"
            ?disabled=${this.disabled}
          ></ribbon-button>
          <ribbon-combobox
            name="color"
            label="Text color"
            variant="color"
            .options=${textColorOptions}
            .value=${this.styles.color ?? ""}
            ?disabled=${this.disabled}
          ></ribbon-combobox>
          <ribbon-combobox
            name="background-color"
            label="Text background color"
            variant="color"
            .options=${backgroundColorOptions}
            .value=${this.styles["background-color"] ?? ""}
            ?disabled=${this.disabled}
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
            ?disabled=${this.disabled}
          ></ribbon-button>
          <button
            class="drawer-toggle"
            type="button"
            aria-label="More marks"
            title="More marks"
            aria-expanded=${this.drawerOpen}
            @click=${this.toggleDrawer}
          >
            <span class="drawer-icon" aria-hidden="true"></span>
          </button>
          ${this.drawerContentOpen? html`
            ${primaryMarkOptions.slice(5).map(option => this.markButton(option))}
            ${secondaryMarkOptions.map(option => this.markButton(option))}
          `: ""}
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
