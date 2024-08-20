import {html, css, PropertyValueMap, TemplateResult, PropertyValues} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {LitElementWw, option, action} from "../../lit"
import {customElement, property, queryAssignedElements, query} from "lit/decorators.js"

import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"
import SlRadio from "@shoelace-style/shoelace/dist/components/radio/radio.component.js"
import SlCheckbox from "@shoelace-style/shoelace/dist/components/checkbox/checkbox.component.js"
import SlRadioButton from "@shoelace-style/shoelace/dist/components/radio-button/radio-button.component.js"
import SlRadioGroup from "@shoelace-style/shoelace/dist/components/radio-group/radio-group.component.js"

import IconPlusSquare from "bootstrap-icons/icons/plus-square.svg"
import IconPlusCircle from "bootstrap-icons/icons/plus-circle.svg"
import { WebwriterChoiceItem } from "./webwriter-choice-item.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import MiniMasonry from "minimasonry"


function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

declare global {interface HTMLElementTagNameMap {
  "webwriter-choice": WebwriterChoice;
}}

@customElement("webwriter-choice")
export class WebwriterChoice extends LitElementWw {

  @property({type: String, attribute: true, reflect: true})
  @option({
    type: "select",
    options: [
      {value: "truefalse", label: {"en": "True/False"}},
      {value: "single", label: {"en": "Single Choice"}},
      {value: "multiple", label: {"en": "Multiple Choice"}},
    ]
  })
  accessor mode: "truefalse" | "single" | "multiple" = "single"


  get layout(): "list" | "tiles" {
    return this.children?.item(0)?.getAttribute("layout") as any ?? "list"
  }

  @property({type: String, attribute: true, reflect: true})
  @option({
    type: "select",
    options: [
      {value: "list", label: {"en": "List"}},
      {value: "tiles", label: {"en": "Tiles"}}
    ],
  })
  set layout(value) {
    this.querySelectorAll("webwriter-choice-item").forEach(el => el.setAttribute("layout", value))
    this.requestUpdate("layout")
  }

  @property({type: Boolean, attribute: true, reflect: true})
  @option({
    type: Boolean,
    label: {"en": "Random Choice Order"}
  })
  accessor randomOrder = false

  static scopedElements = {
    "sl-button": SlButton,
    "sl-icon": SlIcon,
    "sl-radio": SlRadio,
    "sl-checkbox": SlCheckbox,
    "sl-radio-button": SlRadioButton,
    "sl-radio-group": SlRadioGroup
  }

  @query("slot")
  accessor slotEl: HTMLSlotElement
  
  @action()
  addItem() {
    /*
    if(this.ownerDocument.getSelection().containsNode(this, true)) {
      this.ownerDocument.getSelection().modify("move", "backward", "character")
    }
    setTimeout(() => {*/
      const choiceItem = this.ownerDocument.createElement("webwriter-choice-item")
      const p = this.ownerDocument.createElement("p")
      choiceItem.appendChild(p)
      choiceItem.setAttribute("layout", this.layout)
      this.appendChild(choiceItem)
      this.ownerDocument.getSelection().setBaseAndExtent(p, 0, p, 0)
    //})
  }

  shuffleItems() {
    const items = this.slotEl.assignedElements() as WebwriterChoiceItem[]
    const n = items.length
    const nums = shuffle([...(new Array(n)).keys()])
    items.forEach((el, i) => el.style.order = String(nums[i]))
  }

  connectedCallback(): void {
    super.connectedCallback()
    const observer = new MutationObserver(() => {
      if(!this.contentEditable && this.randomOrder) {
        this.shuffleItems()
      }
    })
    observer.observe(this, {childList: true})
  }

  protected firstUpdated(_changedProperties: PropertyValues): void {
    if(!this.contentEditable && this.randomOrder) {
      this.shuffleItems()
    }
  }

  static styles = css`
    :host {
      display: flex !important;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    :host([layout=tiles]) {

      flex-direction: row;
      flex-wrap: wrap;
      gap: 15px;

      & ::slotted(*) {
        aspect-ratio: 1;
        min-width: 125px;
        width: 125px;
        max-width: 350px;
        min-height: 125px;
        height: 125px;
        max-height: 350px;
        overflow: hidden;
        resize: both;
        border: 2px solid var(--sl-color-gray-500);
        border-radius: 5px;
      }
    }

    sl-button::part(label) {
      padding: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
    }

    sl-button::part(base) {
      border: none;
      background: transparent;
    }

    sl-icon {
      width: 19px;
      height: 19px;
    }

    sl-icon::part(svg) {
      overflow: visible;
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none !important;
    }

    #add-option span {
      margin-inline-start: 0.5em;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) ::slotted(*) {
      order: unset !important;
    }

    :host(:not([mode=multiple])) {
      --webwriter-choice-radius: 100%;
    }

    #add-option:not(:hover)::part(base) {
      color: darkgray;
    }

    :host([layout=tiles]) #add-option {
      width: 125px;
      height: 125px;
      overflow: hidden;
      border: 2px solid var(--sl-color-gray-300);
      border-radius: 5px;
      padding: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    :host([mode=truefalse]) #add-option {
      display: none;
    }    
  `

  @queryAssignedElements()
  accessor items: WebwriterChoiceItem[]

  #value: number[] = []

  get value() {
    return this.#value
  }

  @property({type: Array, attribute: false})
  set value(value: number[]) {
    this.#value = value
    this.items.forEach((item, i) => {
      this.isContentEditable
        ? item.valid = this.#value.includes(i)
        : item.active = this.#value.includes(i)
    })
  }

  private applyValue() {
    this.#value = this.items
    .map((item, i) => [item.valid, i] as [boolean, number])
    .filter(([valid]) => valid)
    .map(([_, i]) => i)
  }

  reportSolution(solution: {value: number[]}) {
    this.items.forEach((item, i) => item.valid = solution?.value?.includes(i))
  }

  resetSolution() {
    this.items.forEach(item => {item.valid = false; item.active = false})
  }

  handleControlChange = (e: CustomEvent) => {
    if(this.mode === "single") {
      const item = e.target as WebwriterChoiceItem
      const otherItems = this.items.filter(el => el !== item)
      otherItems.forEach(el => this.isContentEditable? el.valid = false: el.active = false)
    }
    this.applyValue()
    this.dispatchEvent(new CustomEvent("ww-answer-change", {
      detail: {value: this.value},
      bubbles: true,
      composed: true
    }))
  }

  handleSlotChange(e: Event) {
    this.requestUpdate()
  }

  protected willUpdate(changed: PropertyValueMap<any>) {
    if(changed.has("mode") && this.mode === "single") {
      this.items
        .filter(el => this.isContentEditable? el.valid: el.active)
        .slice(1)
        .forEach(el => this.isContentEditable? el.valid = false: el.active = false)
    }
    if(changed.has("mode") && this.mode === "truefalse") {
      this.items.forEach(el => el.remove())
    }
  }

  @query("#items-slot")
  accessor itemsSlotEl: HTMLSlotElement

  render() {
    return html`
      ${this.mode === "truefalse"
        ? html`
          <sl-radio-group>
            <sl-radio-button value="true">True</sl-radio-button>
            <sl-radio-button value="false">False</sl-radio-button>
          </sl-radio-group>
        `
        : html`
          <slot id="items-slot" @sl-change=${this.handleControlChange} @slotchange=${this.handleSlotChange}></slot>
        `
      }
      <sl-button size="small" id="add-option" class="author-only" @click=${() => this.addItem()}>
        <sl-icon src=${this.mode === "multiple"? IconPlusSquare: IconPlusCircle}></sl-icon><span>Add Option</span>
      </sl-button>
    `
  }
}