import {css, html, PropertyValues} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {classMap} from "lit/directives/class-map.js"
import {unsafeStatic} from "lit/static-html.js"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property, query} from "lit/decorators.js"

import SlRadio from "@shoelace-style/shoelace/dist/components/radio/radio.component.js"
import SlCheckbox from "@shoelace-style/shoelace/dist/components/checkbox/checkbox.component.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import { keyed } from "lit/directives/keyed.js"

declare global {interface HTMLElementTagNameMap {
  "webwriter-choice-item": WebwriterChoiceItem;
}}

@customElement("webwriter-choice-item")
export class WebwriterChoiceItem extends LitElementWw {

  static localization = {}

  msg = (str: string) => this.lang in WebwriterChoiceItem.localization? WebwriterChoiceItem.localization[this.lang][str] ?? str: str

  @property({type: Boolean, attribute: false})
  accessor active = false

  @property({type: Boolean, attribute: false})
  accessor valid = false

  @property({type: String, attribute: true, reflect: true})
  accessor layout: "list" | "tiles" = "list"

  static scopedElements = {
    "sl-radio": SlRadio,
    "sl-checkbox": SlCheckbox
  }

  static styles = css`

    :host {
      width: 100%;
    }

    sl-checkbox.valid {
      --webwriter-control-color-600: var(--sl-color-success-600);
      --webwriter-control-color-400: var(--sl-color-success-400);
    }

    sl-checkbox {
      display: block;
      width: 100%;
      &::part(base) {
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        cursor: unset;
      }

      &::part(control) {
        cursor: pointer;
        border-radius: var(--webwriter-choice-radius, 2px);
        border-width: 2px;
      }

      &::part(control):not(:hover){
        border-color: var(--sl-color-gray-500);
      }

      &::part(control):hover {
        border-color: var(--sl-color-gray-700);
      }

      &::part(control--checked):not(:hover) {
        background-color: var(--webwriter-control-color-600, var(--sl-color-primary-600));
        border-color: var(--sl-color-gray-500);
      }
      &::part(control--checked):hover {
        background-color: var(--webwriter-control-color-400, var(--sl-color-primary-400));
        border-color: var(--webwriter-control-color-600, var(--sl-color-primary-600));
      }

      &::part(label) {
        width: 100%;
      }
    }

    :host([layout=tiles]) {
      position: relative;
      overflow: visible !important;

      & ::slotted(:is(picture, audio, video, img, iframe)) {
        height: 100%;
        width: 100%;
      }

      & ::slotted(:not(:is(picture, audio, video, img, iframe))) {
        margin: 5px !important;
      }

      sl-checkbox {
      display: block;
      &::part(base) {
        display: flex;
        flex-direction: row;
        align-items: center;
        cursor: unset;
        position: static;
      }

      &::part(control) {
        position: absolute;
        bottom: -10px;
        left: -10px;
        cursor: pointer;
        border-radius: var(--webwriter-choice-radius, 2px);
        z-index: 100;
        border-color: var(--sl-color-gray-500);
      }

      &::part(control--checked):not(:hover) {
        background-color: var(--webwriter-control-color-600, var(--sl-color-primary-600));
        border-color: var(--sl-color-gray-500);
      }
      &::part(control--checked):hover {
        background-color: var(--webwriter-control-color-400, var(--sl-color-primary-400));
        border-color: var(--webwriter-control-color-600, var(--sl-color-primary-600));
      }

      &::part(label) {
        aspect-ratio: 1;
        min-width: 125px;
        max-width: 350px;
        min-height: 125px;
        max-height: 350px;
        overflow: hidden;
        resize: both;
        margin-inline-start: 0;
        overflow-y: auto;
        scrollbar-width: thin;
      }
    }    
    }
  `

  handleClick = (e: PointerEvent) => {
    const checkboxClicked = e.composedPath().some(v => (v as HTMLElement)?.classList?.contains("checkbox__control"))
    const editable = this.isContentEditable
    if(editable && !checkboxClicked) {
      e.preventDefault()
    }
    else {
      e.stopImmediatePropagation()
    }
  }

  handleChange = (e: CustomEvent) => {
    if(this.isContentEditable) {
      this.valid = !this.valid
    }
    else {
      this.active = !this.active
    }
  }

  @query("sl-checkbox")
  accessor checkbox: SlCheckbox

  observer: MutationObserver

  protected async updated(_changedProperties: PropertyValues) {
    await this.checkbox.updateComplete
    const labelEl = this.checkbox.shadowRoot.querySelector(".checkbox__label") as HTMLElement

    if(_changedProperties.has("layout") && this.layout === "list") {
      this.syncSize(true)
      this.observer?.disconnect()
    }
    else if(_changedProperties.has("layout") && this.layout === "tiles") {
      this.syncSize()
      this.observer = new MutationObserver(() => this.syncSize())
      this.observer.observe(labelEl, {attributeFilter: ["style"], attributes: true})
    }
  }

  syncSize(clear=false) {
    const labelEl = this.checkbox?.shadowRoot.querySelector(".checkbox__label") as HTMLElement
    if(labelEl && !clear) {
      this.style.width = labelEl.style.width
      this.style.height = labelEl.style.height
    }
    else if(labelEl && clear) {
      this.style.width = labelEl.style.width = null
      this.style.height = labelEl.style.height = null
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  render() {
    return keyed(this.layout, html`
      <sl-checkbox class=${classMap({valid: this.valid, active: this.active})} exportparts="base, control, label" @click=${this.handleClick} @sl-change=${this.handleChange} ?checked=${this.valid || this.active}>
        <slot part="slot" style=${styleMap({"--ww-placeholder": `"${this.msg("Option")}"`})}></slot>
      </sl-checkbox>
    `)
  }
}