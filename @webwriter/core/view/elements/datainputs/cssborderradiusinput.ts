import { LitElement, html, css, PropertyValues } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { CSSAngleValue, CSSColorValue, CSSIntegerValue, CSSLengthValue, CSSNumberValue, CSSPercentageValue, CSSPropertySpecs, CSSResolutionValue, CSSTimeValue, CSSValueDefinition, ICSSValueDefinition } from "#model"
import { SlInput, SlSelect } from "@shoelace-style/shoelace"
import { CSSNumericInput } from "./cssnumericinput"
import { ScopedElementsMixin } from "@open-wc/scoped-elements/lit-element.js"
import { msg } from "@lit/localize"

@customElement("css-border-radius-input")
export class CSSBorderRadiusInput extends LitElement {

  @property({type: String, attribute: true, reflect: true})
  get value() {
    return !this.miniPreview? undefined as any: getComputedStyle(this.miniPreview).borderRadius
  }

  set value(v: string) {
    if(this.miniPreview) {
      this.miniPreview.style.borderRadius = v
    }
    this.requestUpdate("value")
  }

  @property({type: Boolean, attribute: true, reflect: true})
  get complex() {
    const cornerValues = ["top-left", "top-right", "bottom-right", "bottom-left"].map((v: any) => this.getCornerValue(v))
    let last
    for(const v of cornerValues) {
      if(last && v !== last) {
        return true
      }
      last = v
    }
    return false
  }

  getCornerValue(
    location: "top-left" | "top-right" | "bottom-right" | "bottom-left",
    direction?: "x" | "y"
  ) {
    const value = this.miniPreview?.style.getPropertyValue(`border-${location}-radius`) ?? "0px"
    return !direction? value: value.split(/\s+/).at(direction === "x"? 0: -1)!.trim()
  }

  setCornerValue(
    location: "top-left" | "top-right" | "bottom-right" | "bottom-left",
    x?: string | CSSLengthValue | CSSPercentageValue,
    y?: string | CSSLengthValue | CSSPercentageValue
  ) {
    const [oldX, oldY] = this.getCornerValue(location).split(/\s+/)
    this.miniPreview.style.setProperty(`border-${location}-radius`, y? `${x ?? oldX} ${y ?? oldY}`: String(x))
    this.requestUpdate("value")
  }

  @property({type: Boolean, attribute: true, reflect: true})
  corners = false

  @property({type: Boolean, attribute: true, reflect: true})
  elliptical = false

  @property({type: Boolean, attribute: true, reflect: true})
  active = false

  @query("#mini-preview")
  miniPreview: HTMLDivElement

  @query("#full-preview")
  fullPreview: HTMLDivElement

  static get styles() {
    return css`

      :host {
        border: 1px solid var(--sl-color-gray-300);
        border-radius: 4px;
        background: var(--sl-color-gray-100);
        padding: 0;
        min-height: unset;
        width: 0.975rem;
        height: 0.975rem;
        box-sizing: border-box;
      }

      :host(:is([elliptical], [corners], [complex])) [name=border-radius] {
        display: none;
      }

      [name=border-radius] {
        grid-column: span 2;
      }

      :host(:not([elliptical]):not([complex])) .elliptical {
        display: none;
      }

      :host(:not([corners]):not([complex])) :is(.top-left, .top-right, .bottom-right, .bottom-left) {
        display: none;
      }

      #mini-preview {
        width: 7px;
        height: 7px;
        border: 1.5px solid var(--sl-color-gray-700);
      }

      #full-preview {
        grid-column: span 2;
        grid-row: span 2;
        background: var(--sl-color-gray-100);
        width: 100%;
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;

        & #preview-box {
          display: block;
          width: 50%;
          height: 50%;
          border: 1.5px solid var(--sl-color-gray-700);
        }
      }

      sl-button[slot=anchor] {
        width: 100%;
        height: 100%;
        display: block;
        background: none;
        
        &::part(base) {
          background: none;
          border: none;
          padding: 0;
          min-height: 0;
          width: 100%;
          height: 100%;
          display: block;
        }

        &::part(label) {
          border: none;
          padding: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      }

      sl-popup[active]::part(popup) {
        width: 200px;
        padding: 10px;
        background-color: var(--sl-panel-background-color);
        user-select: none;
        font-family: var(--sl-font-sans);
        font-size: var(--sl-font-size-medium);
        font-weight: var(--sl-font-weight-normal);
        box-shadow: var(--sl-shadow-large);
        border-radius: var(--sl-border-radius-medium);
        border: 2px var(--sl-color-gray-600);
        z-index: 100;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 1ch;
      }
    
    `
  }

  handleChange = (ev: Event) => {
    try {
      const el = ev.target as CSSNumericInput
      const name = el.getAttribute("name")
      const v = String(el.value)
      if(!name) {
        return
      }
      else if(name === "border-radius") {
        this.value = v
      }
      else {
        const location = name.split("-").slice(2, -1).join("-") as any
        const direction = name.split("-").at(-1)
        direction === "x"
          ? this.setCornerValue(location, v)
          : this.setCornerValue(location, undefined, v)
      }
      this.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    } catch(err) {console.error(err)}
  }

  connectedCallback(): void {
    super.connectedCallback()
    // this.addEventListener("blur", () => this.active = false)
    this.addEventListener("change", this.handleChange)
  }

  @query("[name=border-radius]")
  borderRadiusEl: CSSNumericInput

  protected updated(_changedProperties: PropertyValues): void {
    if(_changedProperties.has("active") && this.active) {
      this.borderRadiusEl.focus()
    }
  }

  render() {
    return html`
      <sl-popup ?active=${this.active} strategy="fixed" shift shift-padding=${10} placement="bottom-start">
        <sl-button size="small" slot="anchor" @click=${() => this.active = !this.active}>
          <div id="mini-preview" style=${`border-radius: ${this.value}`}></div>
        </sl-button>
        <div id="full-preview" style=${`border-radius: ${this.value}`}>
          <div id="preview-box"></div>
          <div class="corner-highlight" id="corner-highlight-top-left"></div>
          <div class="corner-highlight" id="corner-highlight-top-right"></div>
          <div class="corner-highlight" id="corner-highlight-bottom-right"></div>
          <div class="corner-highlight" id="corner-highlight-bottom-left"></div>
        </div>
        
        <css-numeric-input name="border-radius" min="0" type="length percentage" value=${this.value}>
          <slot name="label" slot="label">
            ${msg("Border radius")}
          </slot>
        </css-numeric-input>
        
        <css-numeric-input class="top-left" name="border-radius-top-left-x" min="0" type="length percentage" value=${this.getCornerValue("top-left", this.elliptical? "x": undefined)}>
          <slot name="label-top-left" slot="label">
            ${msg("Top left")}
          </slot>
        </css-numeric-input>
        <css-numeric-input class="elliptical top-left" name="border-radius-top-left-y" min="0" type="length percentage" value=${this.getCornerValue("top-left", this.elliptical? "y": undefined)}>
          <slot name="label-top-left-y" slot="label">
            ${msg("Top left (y)")}
          </slot>
        </css-numeric-input>
        
        <css-numeric-input class="top-right" name="border-radius-top-right-x" min="0" type="length percentage" value=${this.getCornerValue("top-right", this.elliptical? "x": undefined)}>
          <slot name="label-top-right" slot="label">
            ${msg("Top right")}
          </slot>
        </css-numeric-input>
        <css-numeric-input class="elliptical top-right" name="border-radius-top-right-y" min="0" type="length percentage" value=${this.getCornerValue("top-right", this.elliptical? "y": undefined)}>
          <slot name="label-top-right-y" slot="label">
            ${msg("Top right (y)")}
          </slot>
        </css-numeric-input>
        
        <css-numeric-input class="bottom-right" name="border-radius-bottom-right-x" min="0" type="length percentage" value=${this.getCornerValue("bottom-right", this.elliptical? "x": undefined)}>
          <slot name="label-bottom-right" slot="label">
            ${msg("Bottom right")}
          </slot>
        </css-numeric-input>
        <css-numeric-input class="elliptical bottom-right" name="border-radius-bottom-right-y" min="0" type="length percentage" value=${this.getCornerValue("bottom-right", this.elliptical? "y": undefined)}>
          <slot name="label-bottom-right-y" slot="label">
            ${msg("Bottom right (y)")}
          </slot>
        </css-numeric-input>
        
        <css-numeric-input class="bottom-left" name="border-radius-bottom-left-x" min="0" type="length percentage" value=${this.getCornerValue("bottom-left", this.elliptical? "y": undefined)}>
          <slot name="label-bottom-left" slot="label">
            ${msg("Bottom left")}
          </slot>
        </css-numeric-input>
        <css-numeric-input class="elliptical bottom-left" name="border-radius-bottom-left-y" min="0" type="length percentage" value=${this.getCornerValue("bottom-left", this.elliptical? "y": undefined)}>
          <slot name="label-bottom-left-y" slot="label">
            ${msg("Bottom left (y)")}
          </slot>
        </css-numeric-input>
      </sl-popup>
    `
  }
}