import {css, html} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {classMap} from "lit/directives/class-map.js"
import {unsafeStatic} from "lit/static-html.js"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"

import SlRadio from "@shoelace-style/shoelace/dist/components/radio/radio.component.js"
import SlCheckbox from "@shoelace-style/shoelace/dist/components/checkbox/checkbox.component.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

@customElement("webwriter-choice-item")
export class WebwriterChoiceItem extends LitElementWw {

  static localization = {}

  msg = (str: string) => this.lang in WebwriterChoiceItem.localization? WebwriterChoiceItem.localization[this.lang][str] ?? str: str

  @property({type: Boolean, attribute: false})
  active = false

  @property({type: Boolean, attribute: false})
  valid = false

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
      &::part(base) {
        display: flex;
        flex-direction: row;
        align-items: center;
        cursor: unset;
      }

      &::part(control) {
        cursor: pointer;
        border-radius: var(--webwriter-choice-radius, 2px);
      }

      &::part(control--checked):not(:hover) {
        background-color: var(--webwriter-control-color-600, var(--sl-color-primary-600));
        border-color: var(--webwriter-control-color-600, var(--sl-color-primary-600));
      }
      &::part(control--checked):hover {
        background-color: var(--webwriter-control-color-400, var(--sl-color-primary-400));
        border-color: var(--webwriter-control-color-600, var(--sl-color-primary-600));
      }

      &::part(label) {
        flex-grow: 1;
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

  render() {
    const editable = this.isContentEditable

    return html`
      <sl-checkbox class=${classMap({valid: this.valid, active: this.active})} exportparts="base, control, label" @click=${this.handleClick} @sl-change=${this.handleChange} ?checked=${this.valid || this.active}>
        <slot style=${styleMap({"--ww-placeholder": `"${this.msg("Option")}"`})}></slot>
      </sl-checkbox>
    `
  }
}