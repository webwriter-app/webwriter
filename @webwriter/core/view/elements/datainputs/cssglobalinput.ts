import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { msg } from "@lit/localize"
import { emitCustomEvent } from "#model/utility/index.js"



@customElement("css-global-input")
export class CSSGlobalInput extends LitElement {

  static values = ["custom", "none", "inherit", "initial", "unset", "revert-layer", "revert"] as const

  static get labels() {
    return {
        "none": msg("Set special value"),
        "custom": msg("Custom"),
        "initial": msg("Initial"),
        "inherit": msg("Inherit"),
        "unset": msg("Unset"),
        "revert": msg("Revert"),
        "revert-layer": msg("Revert layer"),
    }
  }

  static decorations = {
    "none": "none",
    "custom": "none",
    "initial": "2px line-through var(--sl-color-amber-600)",
    "inherit": "2px overline var(--sl-color-amber-600)",
    "unset": "2px overline line-through var(--sl-color-amber-600)",
    "revert": "2px underline double var(--sl-color-amber-600)",
    "revert-layer": "2px underline var(--sl-color-amber-600)",
  }

  static styles = css`
    :host {
      display: inline;
      position: relative;
    }

    :host(:is([value=none])) #restore {
      display: none;
    }

    #restore {
      position: absolute;
      right: -1em;
      top: -0.25em;
      height: calc(100% + 0.25em);

      &::part(base) {
        padding: 0;
        background: white;
        border-radius: 100%;
        color: var(--sl-color-primary-600);
      }
    }
  `
  
  @property({type: String, attribute: true, reflect: true})
  value: (typeof CSSGlobalInput)["values"][number] = "none"

  @property({type: Boolean, attribute: true, reflect: true})
  disabled = false

  get #disabled() {
    return this.disabled && (this.value === "none" || this.value === "custom")
  }

  handleChange = () => {
    try {
      this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    } catch(err) {console.error(err)}
  }

  handleClick = (e: MouseEvent, reset=false) => {
    const values = CSSGlobalInput.values.slice(1)
    if(!this.#disabled || reset) {
      this.value = reset
        ? "none"
        : values[(values.indexOf(this.value) + 1) % values.length]
      e.preventDefault()
      e.stopImmediatePropagation()
      if(reset) {
        emitCustomEvent(this, "ww-restore")
      }
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    this.addEventListener("click", this.handleClick)
  }

  render() {
    return html`
      <slot style=${`display: inline flex; align-items: center; gap: 0.5ch; text-decoration: ${CSSGlobalInput.decorations[this.value]}; cursor: ${!this.#disabled? "pointer": "unset"};`} title=${this.disabled? "": CSSGlobalInput.labels[this.value]}></slot>
      <sl-icon-button id="restore" name="restore" @click=${(e: MouseEvent) => this.handleClick(e, true)} title=${msg("Reset to default")}></sl-icon-button>
    `
  }
}