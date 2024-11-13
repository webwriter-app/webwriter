import {html, css, PropertyValues} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property, queryAll} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

import IconPlus from "bootstrap-icons/icons/plus.svg"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"
import type { WebwriterPairingItem } from "./webwriter-pairing-item"

import LOCALIZE from "../../localization/generated"
import {msg} from "@lit/localize"

declare global {interface HTMLElementTagNameMap {
  "webwriter-pairing": WebwriterPairing;
}}

@customElement("webwriter-pairing")
export class WebwriterPairing extends LitElementWw {

  localize = LOCALIZE

  static shadowRootOptions = {...LitElementWw.shadowRootOptions, slotAssignment: "manual" as const}

  static scopedElements = {
    "sl-button": SlButton,
    "sl-icon": SlIcon
  }

  static styles = css`
    :host {
      display: flex !important;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 30px;
      padding-bottom: 30px;
    }

    sl-button {

      &::part(base) {
        width: 125px;
        height: 125px;
        border: 1px solid darkgray;
        border-radius: 2px;
        padding: 10px;
        overflow: hidden;
      }

      &::part(label) {
        padding: 0;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
      }
    }

    .pair {
      position: relative;

      & .a-slot, & .b-slot {
        display: block;

        &:is(:focus-within, :has(::selection)) {
          background: green;
        }
      }

      & .b-slot {
        position: absolute;
        left: 20px;
        top: 20px;
        z-index: 1000;
      }
    }

  `

  @property({attribute: true, reflect: true})
  @option({type: "select", options: [
    {value: "drag"},
    {value: "memory"}
  ]})
  accessor mode: "drag" | "memory" = "drag"

  @property({type: Array, attribute: true, reflect: true})
  accessor solution: ([string, string] | string)[] = []
  
  addItem = () => {
    const item = document.createElement("webwriter-pairing-item")
    const picture = document.createElement("picture")
    item.appendChild(picture)
    this.appendChild(item)
  }

  Pair = (i: number) => {
    return html`<div class="pair">
      <slot class="a-slot" name=${`${i}a`}></slot>
      <slot class="b-slot" name=${`${i}b`}></slot>
    </div>`
  }

  getPairSlot() {}

  
  get pairs() {
    let allPairs = Array.from(this.children)  as (WebwriterPairingItem | [WebwriterPairingItem, WebwriterPairingItem])[]
    for(const [a, b] of this.solution) {
      const elA = this.querySelector(`webwriter-pairing-item#${a}`) as WebwriterPairingItem
      const elB = this.querySelector(`webwriter-pairing-item#${b}`) as WebwriterPairingItem
      allPairs.splice(allPairs.indexOf(elA), 1, [elA, elB])
      allPairs.splice(allPairs.indexOf(elB), 1)
    }
    return allPairs
  }

  pair(a: string, b?: string) {
    let pairIds = this.pairs.map(entry => Array.isArray(entry)? [entry[0].id, entry[1].id]: entry.id)
    const pairIndexOfA = this.solution.findIndex(val => Array.isArray(val) && val.includes(a))
    const pairIndexOfB = this.solution.findIndex(val => Array.isArray(val) && val.includes(b))
    if(!b) {
      pairIds.splice(pairIndexOfA, 1, (pairIds[pairIndexOfA] as [string, string]).filter(id => id !== a)[0])
      pairIds.push(a)
    }
    else {
      if(pairIndexOfB !== -1) {
        pairIds.splice(pairIndexOfB, 1, (pairIds[pairIndexOfB] as [string, string]).filter(id => id !== b)[0])
      }
      const indexOfA = this.solution.indexOf(a)
      pairIds.splice(indexOfA, 1, [a, b])
      pairIds = pairIds.filter(id => id !== b)
    }
    this.solution = pairIds.filter(entry => Array.isArray(entry)) as any
  }

  handlePairWith(e: CustomEvent) {
    if(e.type === "ww-pairwith") {
      this.pair((e.target as HTMLElement).id, e.detail.with)
    }
  }

  observer: MutationObserver

  connectedCallback(): void {
    super.connectedCallback()
    this.observer = new MutationObserver(() => {
      let childIds = Array.from(this.children).map(child => child.id)
      let solution = [...this.solution]
      // solution = solution.filter(k => childIds.includes(k as any))
      // solution = [...solution, ...childIds]
      this.requestUpdate()
    })
    this.observer.observe(this, {childList: true})
    this.addEventListener("ww-pairwith", this.handlePairWith)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer.disconnect()
  }
  
  protected willUpdate(_changedProperties: PropertyValues): void {
    // this.solution = this.solution.filter(id => childIds.includes(id))
  }

  protected updated(_changedProperties: PropertyValues): void {
    const slots = Array.from(this.slots)
    for(const value of this.pairs) {
      if(Array.isArray(value)) {
        const [a, b] = value
        slots.shift().assign(a)
        slots.shift().assign(b)
      }
      else {
        slots.shift().assign(value)
        slots.shift()
      }
    }
  }

  @queryAll("slot")
  accessor slots: NodeListOf<HTMLSlotElement>

  render() {
    return html`
      ${this.pairs.map((el, i) => this.Pair(i))}
      <sl-button @click=${this.addItem}>
        <sl-icon src=${IconPlus}></sl-icon>
      </sl-button>
    `
  }
}