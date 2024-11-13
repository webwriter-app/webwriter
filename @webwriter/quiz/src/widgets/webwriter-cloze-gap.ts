import {LitElement, html, css, RenderOptions} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, query} from "lit/decorators.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"
import SlOption from "@shoelace-style/shoelace/dist/components/option/option.component.js"
import IconPlus from "bootstrap-icons/icons/plus.svg"
import IconSlashCircle from "bootstrap-icons/icons/slash-circle.svg"
import IconCheckCircle from "bootstrap-icons/icons/check-circle.svg"
import IconX from "bootstrap-icons/icons/x.svg"

import { Combobox } from "../lib/combobox"
import { property } from "lit/decorators/property.js"
import { queryAsync } from "lit/decorators/query-async.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import LOCALIZE from "../../localization/generated"
import {msg} from "@lit/localize"

declare global {interface HTMLElementTagNameMap {
  "webwriter-cloze-gap": WebwriterClozeGap;
}}

@customElement("webwriter-cloze-gap")
export class WebwriterClozeGap extends LitElementWw {

  localize = LOCALIZE

  @property({type: Array, attribute: true, reflect: true})
  accessor solution: string[]

  @property({type: String, attribute: true, reflect: true})
  accessor value: string

  @property({type: Array, attribute: true, reflect: true})
  accessor distraction: string[] = []
  
  @property({type: Boolean, attribute: true, reflect: true})
  accessor showOptions = false
  
  static scopedElements = {
    "ww-combobox": Combobox,
    "sl-icon-button": SlIconButton,
    "sl-option": SlOption
  }

  static styles = css`
    :host {
      display: inline-block !important;
      vertical-align: top;
      margin: 0 1ch;
      max-width: calc(100% - 2ch);
      max-height: 1lh;
    }

    :host(::after) {
      content: " ";
      display: block;
    }

    sl-icon-button[data-hidden] {
      visibility: hidden;
    }

    sl-icon-button::part(base) {
      padding: 0;
    }

    :host(:not(:focus-within)) #add {
      visibility: hidden;
    }

    sl-icon-button {
      overflow: visible;
      margin-right: 0;
    }

    ww-combobox::part(base) {
      min-height: unset;
      padding: 2px 2px;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) ww-combobox::part(input) {
      color: var(--sl-color-success-700);
    }

    sl-option::part(base) {
      padding: 0;
      font-size: var(--sl-input-font-size-small);
    }

    sl-option::part(label) {
      padding: var(--sl-spacing-2x-small) 0;
    }

    sl-option::part(label):hover {
      color: var(--sl-color-primary-600);
    }

    sl-option::part(checked-icon) {
      display: none;
    }

    .remove::part(base):hover {
      color: var(--sl-color-danger-600) !important;
    }

    .remove::part(base):active {
      color: var(--sl-color-danger-800) !important;
    }

    :is(.toggle, .remove)::part(base) {
      padding:  var(--sl-spacing-2x-small);
    }

    .solution::part(base) {
      color: var(--sl-color-success-700);
    }

    .toggle {
      color: inherit;
    }


  `
  @query("ww-combobox")
  accessor input: Combobox

  async focus() {
    (await this.input).focus()
  }

  handleChange = (e: CustomEvent) => {
    e.preventDefault()
    if(!this.isContentEditable) {
      this.value = this.input.value as string
    }
  }

  addSolution(value: string) {
    this.solution = Array.from(new Set([...(this.solution ?? []), value]))
  }

  toggleOptionType(value: string) {
    if(this.solution.includes(value)) {
      this.solution = this.solution.filter(v => v !== value)
      this.distraction = Array.from(new Set([...(this.distraction ?? []), value]))
    }
    else if(this.distraction.includes(value)) {
      this.distraction = this.distraction.filter(v => v !== value)
      this.solution = Array.from(new Set([...(this.solution ?? []), value]))
    }
  }

  removeOption(value: string) {
    this.solution = this.solution.filter(v => v !== value)
    this.distraction = this.distraction.filter(v => v !== value)
    if(this.allOptions.length === 0) {
      this.isAdding = false
    }
  }

  handleAddClick = (e: MouseEvent) => {
    e.stopImmediatePropagation()
    e.preventDefault()
    this.addSolution(this.input.value as string)
    this.isAdding = true
    this.input.value = ""
    this.input.open = true
  }

  handleToggleClick = (e: MouseEvent, value: string) => {
    e.stopImmediatePropagation()
    e.preventDefault()
    this.toggleOptionType(value)
  }

  handleRemoveClick = (e: MouseEvent, value: string) => {
    e.stopImmediatePropagation()
    e.preventDefault()
    this.removeOption(value)
  }

  handleKeydown = (e: KeyboardEvent) => {
    if(e.key === "Enter") {
      this.handleAddClick(e as any)
    }
  }

  handleBlur = (e: FocusEvent) => {
    this.isAdding = false
    if(this.solution.length === 1) {
      this.input.value = this.solution[0]
    }
  }

  get allOptions() {
    return [...(this.solution ?? []), ...this.distraction]
  }

  @property({type: Boolean, attribute: false})
  accessor isAdding = false

  render() {
    return html`<ww-combobox @blur=${this.handleBlur} ?suggestions=${this.allOptions.length > 1 || this.isAdding || this.distraction.length > 0} size="small" autosize .value=${this.value} @sl-change=${this.handleChange} @sl-input=${() => this.requestUpdate()} @keydown=${this.handleKeydown} >
      <sl-icon-button id="add" title="Add another solution" ?disabled=${this.allOptions.includes(this.input?.value as string)} ?data-hidden=${!this.input?.value} src=${IconPlus} size="small" slot="prefix" @click=${this.handleAddClick} @mousedown=${(e: Event) => {e.stopPropagation(); e.preventDefault()}} @focus=${e => e.stopPropagation()} ></sl-icon-button>
      ${this.allOptions.sort().map(value => html`
        <sl-option size="small" value=${value} class=${this.solution.includes(value)? "solution": "distraction"} >
          <sl-icon-button title=${this.solution.includes(value)? "Change to a distraction": "Change to a solution"} class="toggle" slot="prefix" src=${this.solution.includes(value)? IconCheckCircle: IconSlashCircle} @click=${(e: any) => this.handleToggleClick(e, value)} @mousedown=${(e: Event) => {e.stopPropagation(); e.preventDefault()}}></sl-icon-button>
          <span title=${this.solution.includes(value)? "Solution": "Distraction"}>${value}</span>
          <sl-icon-button title="Remove" class="remove" slot="suffix" src=${IconX} @click=${(e: any) => this.handleRemoveClick(e, value)} @mousedown=${(e: Event) => {e.stopPropagation(); e.preventDefault()}}></sl-icon-button>
        </sl-option>  
      `)}
    </ww-combobox>`
  }
}