import {css, html, PropertyValues} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"

import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import { Sortable } from "@shopify/draggable"
import IconPlus from "bootstrap-icons/icons/plus.svg"

import { WebwriterOrderItem } from "./webwriter-order-item"
import { ifDefined } from "lit/directives/if-defined.js"

export function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

declare global {interface HTMLElementTagNameMap {
  "webwriter-order": WebwriterOrder;
}}

@customElement("webwriter-order")
export class WebwriterOrder extends LitElementWw {

  static scopedElements = {
    "sl-button": SlButton,
    "sl-icon": SlIcon
  }

  static styles = css`
    :host {
      display: flex !important;
      flex-direction: column;
      align-items: flex-start;
      counter-reset: orderItem;
      gap: 2px;
    }

    :host([layout=tiles]) {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 15px;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) {
      --text-color: var(--sl-color-success-700);
    }

    :host ::slotted(*::part(counter)) {
      counter-increment: orderItem;
      content: counter(orderItem) '. ';
      cursor: move;
      text-align: right;
      padding-right: 0.5em;
      min-width: 1.5em;
      color: var(--text-color, auto);
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
      padding: var(--sl-spacing-x-small);
      padding-left: 0;
    }

    #add-option {
      order: 2147483647;
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


    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }
  `

  get layout(): "list" | "tiles" {
    return this.children?.item(0)?.getAttribute("layout") as any ?? "list"
  }

  @property({type: String, attribute: true, reflect: true}) //@ts-ignore
  @option({
    type: "select",
    options: [
      {value: "list", label: {"en": "List"}},
      {value: "tiles", label: {"en": "Tiles"}}
    ]
  })
  set layout(value) {
    this.querySelectorAll("webwriter-order-item").forEach(el => el.setAttribute("layout", value))
    this.requestUpdate("layout")
  }

  get hideOrderButtons() {
    return !!this.items[0]?.hideOrderButtons
  }

  @property({type: Boolean, attribute: true, reflect: true}) //@ts-ignore
  @option({type: Boolean, label: {_: "Hide order buttons"}})
  set hideOrderButtons(value: boolean) {
    this.items.forEach(item => item.hideOrderButtons = value)
  }


  observer: MutationObserver

  connectedCallback() {
    super.connectedCallback()
    this.addEventListener("ww-moveup", this.handleMove)
    this.addEventListener("ww-movedown", this.handleMove)
    this.addEventListener("ww-moveto", this.handleMove)
    this.observer = new MutationObserver(() => {
      this.items.forEach(item => item.requestUpdate())
      if(this.isContentEditable) {
        this.solution = this.items.map(item => item.id)
      }
      this.clearDropPreviews()
    })
    this.observer.observe(this, {childList: true})
    // this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, this.orderSheet]
  }

  serializedCallback() {
    this.shuffleItems()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
    this.observer = undefined
  }

  orderSheet = new CSSStyleSheet()

  addItem() {
    const orderItem = this.ownerDocument.createElement("webwriter-order-item")
    const p = this.ownerDocument.createElement("p")
    orderItem.appendChild(p)
    orderItem.setAttribute("layout", this.layout)
    this.append(orderItem)
    this.solution = [...this.#solution, orderItem.id]
    this.ownerDocument.getSelection().setBaseAndExtent(p, 0, p, 0)
  }

  shuffleItems() {
    const n = this.items.length
    const nums = shuffle([...(new Array(n)).keys()])
    this.innerHTML = nums.map(i => this.children.item(i).outerHTML).join("")
  }

  clearDropPreviews = () => {
    this.items.forEach(item => item.dropPreview = undefined)
  }
  
  @query("#items-slot")
  accessor itemsSlot: HTMLSlotElement

  @queryAssignedElements()
  accessor items: WebwriterOrderItem[]

  handleKeyDown(e: KeyboardEvent) {
    if(e.key == "ArrowDown") {
      e.stopPropagation()
      e.preventDefault()
    }
    else if(e.key === "ArrowUp") {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  /*
  If contenteditable: Reorder solution -> Triggers orderSheet change
  If not contenteditable: Reorder value -> Triggers orderSheet change 
  */
  
  moveChild(elem: HTMLElement, i: number) {
    /*
    let items = this.items.map(el => el !== elem? el: undefined)
    items.splice(i, 0, elem as WebwriterOrderItem)
    items = items.filter(child => child)
    this.replaceChildren(...items)
    this.items.forEach(item => item.requestUpdate())*/
    if(i === 0) {
      this.insertAdjacentElement("afterbegin", elem)
    }
    else if(i < this.items.length) {
      this.items[i].insertAdjacentElement("beforebegin", elem)
    }
    else {
      this.insertAdjacentElement("beforeend", elem)
    }
  }

  handleMove = (e: CustomEvent) => {
    const elem = e.target as HTMLElement
    const children = Array.from(this.children)
    const pos = children.indexOf(elem)
    let i: number
    if(e.type === "ww-moveup") {
      i = Math.max(0, pos - 1)
    }
    else if(e.type === "ww-movedown") {
      i = Math.min(children.length, pos + 2)

    }
    else if(e.type === "ww-moveto") {
      i = e.detail.i
    }
    this.moveChild(elem, i)
  }


  #solution: string[] = []

  get solution() {
    return this.#solution?.length? this.#solution: undefined
  }

  @property({attribute: false})
  set solution(value: string[]) {
    this.#solution = value
    if(value) {
      this.dispatchEvent(new CustomEvent("ww-answer-change", {
        bubbles: true,
        composed: true
      }))
    }
  }

  
  reportSolution() {
    this.solution.forEach((id, i) => this.querySelector(`#${id}`).validOrder = i)
  }

  reset() {
    this.solution = undefined
    this.shuffleItems()
  }

  render() {
    return html`
      <slot id="items-slot" @webwriter-clear-drop-preview=${this.clearDropPreviews}></slot>
      <sl-button size="small" id="add-option" class="author-only" @click=${() => this.addItem()}>
        <sl-icon src=${IconPlus}></sl-icon><span>Add Option</span>
      </sl-button>
    `
  }
}