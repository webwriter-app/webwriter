import { localized, msg } from "@lit/localize"
import { SlTooltip, SlButton } from "@shoelace-style/shoelace"
import { LitElement, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { ifDefined } from "lit/directives/if-defined.js"
import { unsafeStatic } from "lit/static-html.js"
import { CommandEntry } from "../../viewmodel"
import { spreadProps } from "@open-wc/lit-helpers"

type ButtonTooltipOptions = Partial<Pick<SlTooltip, "placement" | "skidding" | "trigger" |"hoist">>

type CommandEntryProps = Omit<CommandEntry, "callback" | "disabled">

@localized()
@customElement("ww-button")
export class Button extends LitElement implements CommandEntryProps {

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
        line-height: 1;
        height: auto;
        padding-inline-start: 0;
        color: inherit;
        font-size: 1.1rem;
        padding: 4px;
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
    `
  ]

  get titleText() {
    const shortcutText = this.shortcut? ` [${this.shortcut}]`: ""
    return this.label && (this.label + shortcutText) || undefined
  }

  render() {
    
    const {id, variant, size, caret, disabled, loading, outline, pill, circle, type, name, value, href, target, rel, download} = this
    const {placement, skidding, hoist} = this.tooltipOptions
    const tagName = unsafeStatic(variant === "icon"? "sl-icon-button": "sl-button")
    return html`<sl-tooltip placement=${ifDefined(placement)} skidding=${ifDefined(skidding)} ?open=${this.confirming} ?disabled=${!this.confirm} trigger="manual" @click=${(e: any) => {
      if(this.confirm) {
        !this.confirming && e.stopPropagation()
        this.confirming = !this.confirming
      }
    }}>
      <sl-button part="base" title=${ifDefined(this.titleText)} variant=${variant === "icon"? "text": variant} ${spreadProps({size, caret, disabled, loading, outline, pill, circle, type, name, value, href, target, rel, download})}>
        <slot name="prefix" slot=${this.icon? "prefix": ""}>
          <sl-icon name=${this.icon}></sl-icon>
        </slot>
        <slot>
        </slot>
      </sl-button>
      <slot name="confirm" slot="content">
        <span>${this.label}</span>
        <span id="fallback">${msg("Are you sure?")}</span>
      </slot>

    </sl-tooltip>
    `
  }

}