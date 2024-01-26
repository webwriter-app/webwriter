import { localized, msg } from "@lit/localize"
import { SlTooltip, SlButton } from "@shoelace-style/shoelace"
import { LitElement, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { unsafeStatic } from "lit/static-html.js"
import { spreadProps } from "@open-wc/lit-helpers"
import { KeymapManager } from "../configurator"

type ButtonTooltipOptions = Partial<Pick<SlTooltip, "placement" | "skidding" | "trigger" |"hoist">>

@localized()
@customElement("ww-button")
export class Button extends LitElement {

  @property({type: Object, attribute: false})
  tooltipOptions: ButtonTooltipOptions = {
    placement: "bottom",
    trigger: "hover focus manual",
    hoist: true
  }

  @property({type: String, attribute: true, reflect: true})
  id: string

  @property({type: String, attribute: true})
  shortcut: string

  @property({type: String, attribute: true})
  label: string

  @property({type: String, attribute: true})
  description: string

  @property({type: String, attribute: true, reflect: true})
  icon: string

  @property({type: String, attribute: true})
  category: string

  @property({type: String, attribute: true})
  group: string

  @property({type: Boolean, attribute: true})
  allowDefault: boolean

  @property({type: Boolean, attribute: true})
  modified: boolean

  @property({type: Boolean, attribute: true})
  fixedShortcut: boolean

  @query("slot[name=confirm]")
  confirmSlot: HTMLSlotElement

  @property({type: Boolean, attribute: true, reflect: true})
  confirming: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  confirm: boolean = false

  @property({type: String, attribute: true, reflect: true})
  variant: "default" | "primary" | "success" | "neutral" | "warning" | "danger" | "icon" | "text" = "default"

  @property({type: String, attribute: true, reflect: true})
  size: "small" | "medium" | "large" = "medium"

  @property({type: Boolean, attribute: true, reflect: true})
  caret: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  disabled: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  loading: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  outline: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  pill: boolean = false

  @property({type: Boolean, attribute: true, reflect: true})
  circle: boolean = false

  @property({type: String, attribute: true})
  type: "button" | "submit" | "reset" = "button"

  @property({type: Boolean, attribute: true, reflect: true})
  reverse = false

  @property({type: String, attribute: true})
  name: string = ""

  @property({type: String, attribute: true})
  value: string = ""

  @property({type: String, attribute: true})
  href: string = ""

  @property({type: String, attribute: true})
  target: "_blank" | "_parent" | "_self" | "_top" | "" = ""

  @property({type: String, attribute: true})
  rel: string = "noreferrer noopener"

  @property({type: String, attribute: true})
  download: string | undefined

  @property({attribute: false, converter: {toAttribute: (v: Error[]) => !v.length? null: ""}})
  issues: Error[] = []

  constructor() {
    super()
    this.addEventListener("focusout", () => this.confirming = false)
    this.addEventListener("sl-show", e => e.stopPropagation())
  }

  static styles = [
    SlButton.styles,
    css`

      :host([circle]) [part=base] {
        display: flex;
        flex-direction: column;
        justify-content: center;
        background: none !important;
      }

      :host(:not([icon])) slot[name=prefix] {
        display: none;
      }

      :host([confirming])::part(base) {
        text-decoration: 2px solid underline;
      }

      :host([circle]) [part=label] {
        height: min-content;
        line-height: 1;
        padding: var(--sl-spacing-x-small);
      }

      :host([variant=icon]) sl-button::part(base)  {
        min-height: unset;
        padding-inline-start: 0;
        color: inherit;
        padding: 4px;
        box-sizing: border-box;
      }

      :host([variant=icon]) sl-button {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      :host([variant=icon]) sl-button::part(label)  {
        padding: 0;
      }

      :host([variant=icon]) sl-button::part(base):hover {
        color: var(--sl-color-primary-400);
      }

      :host([variant=icon]) sl-button::part(base):active {
        color: var(--sl-color-primary-600);
      }

      :host([reverse]) sl-button::part(base) {
        display: flex;
        flex-direction: row-reverse;
      }

      sl-icon {
        font-size: 20px;
      }

      sl-button, sl-button::part(base) {
        width: 100%;
        height: 100%;
      }

      sl-button::part(base) {
        display: flex;
        flex-direction: row;
        align-items: center;
      }

      :host([size=small]) sl-button::part(base) {
        padding: 0;
      }

      :host([issues]) {
        color: var(--sl-color-danger-600);
      }
    `
  ]

  get titleText() {
    if(this.shortcut) {
      const splitShortcut = this.shortcut.split(",")[0].split("+")
      const localizedShortcut = splitShortcut.map(s => KeymapManager.keyLabelsTextOnly[s.toLowerCase() as keyof typeof KeymapManager.keyLabels] ?? s.toLocaleUpperCase()).join("+")
      const shortcutText = this.shortcut? ` [${localizedShortcut}]`: ""
      return this.label && (this.label + shortcutText) || undefined
    }
    else {
      return this.title || this.label
    }
  }

  render() {
    const {id, variant, size, caret, disabled, loading, outline, pill, circle, type, name, value, href, target, rel, download} = this
    const {placement, skidding, hoist} = this.tooltipOptions
    return html`<sl-tooltip placement=${ifDefined(placement)} skidding=${ifDefined(skidding)} ?open=${this.confirming} ?disabled=${!this.confirm} trigger=${this.issues.length? "hover": "manual"} @click=${(e: any) => {
      if(this.confirm) {
        !this.confirming && e.stopPropagation()
        this.confirming = !this.confirming
      }
    }}>
      <sl-button part="button" title=${ifDefined(this.titleText)} variant=${variant === "icon"? "text": variant} ${spreadProps({size, caret, disabled, loading, outline, pill, circle, type, name, value, href, target, rel, download})} exportparts="base, prefix, label, suffix, caret">
        <slot name="prefix" slot=${this.icon? "prefix": ""}>
          <sl-icon part="icon" name=${this.icon}></sl-icon>
        </slot>
        <slot>
        </slot>
      </sl-button>
      <slot name="confirm" slot="content">
        <div>${!this.issues.length? this.label: this.issues.map(err => html`
          <div>${err.message}</div>
        `)}</div>
        <span id="fallback">${msg("Are you sure?")}</span>
      </slot>

    </sl-tooltip>
    `
  }

}