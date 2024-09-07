import {html, css, PropertyValues} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, queryAssignedElements, property, query, queryAll} from "lit/decorators.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlDetails from "@shoelace-style/shoelace/dist/components/details/details.component.js"
import SlPopup from "@shoelace-style/shoelace/dist/components/popup/popup.component.js"
import SlButtonGroup from "@shoelace-style/shoelace/dist/components/button-group/button-group.component.js"

import SlTabGroup from "@shoelace-style/shoelace/dist/components/tab-group/tab-group.component.js"
import SlTab from "@shoelace-style/shoelace/dist/components/tab/tab.component.js"
import SlTabPanel from "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.component.js"

import IconPatchQuestion from "bootstrap-icons/icons/patch-question.svg"
import IconPatchQuestionFill from "bootstrap-icons/icons/patch-question-fill.svg"
import IconPatchCheck from "bootstrap-icons/icons/patch-check.svg"
import IconPatchCheckFill from "bootstrap-icons/icons/patch-check-fill.svg"

async function arrayBufferToDataUrl(buffer: ArrayBuffer | Uint8Array) {
  return new Promise(r => {
    const reader = new FileReader()
    reader.onload = () => r(reader.result as string)
    reader.readAsDataURL(new Blob([buffer]))
  }) as Promise<string>
}

async function dataUrlToArrayBuffer(url: string) {
  return await (await (await fetch(url)).blob()).arrayBuffer()
}

function getKeyMaterial(password: string) {
  let enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw", 
    enc.encode(password), 
    {name: "PBKDF2"}, 
    false, 
    ["deriveBits", "deriveKey"]
  );
}

function getKey(keyMaterial: CryptoKey, salt: ArrayBufferView) {
  return window.crypto.subtle.deriveKey(
    {
      "name": "PBKDF2",
      salt: salt, 
      "iterations": 100000,
      "hash": "SHA-256"
    },
    keyMaterial,
    { "name": "AES-GCM", "length": 256},
    true,
    [ "encrypt", "decrypt" ]
  )
}

import "@shoelace-style/shoelace/dist/themes/light.css"
import { WebwriterTaskExplainer } from "./webwriter-task-explainer"
function romanOrdinal(num: number, capitalize=false) {
  let roman = {
    m: 1000,
    cm: 900,
    d: 500,
    cd: 400,
    c: 100,
    xc: 90,
    l: 50,
    xl: 40,
    x: 10,
    ix: 9,
    v: 5,
    iv: 4,
    i: 1
  };
  let str = ''

  for (let i of Object.keys(roman)) {
    let q = Math.floor(num / roman[i])
    num -= q * roman[i]
    str += i.repeat(q)
  }

  return capitalize? str.toUpperCase(): str
}

function alphabeticalOrdinal(num: number, capitalize=false, alphabet="abcdefghijklmnopqrstuvwxyz") {
  const a = alphabet[0]
  const k = alphabet.length
  const str = a.repeat(Math.floor(num / k)) + alphabet[num % k]
  return capitalize? str.toUpperCase(): str
}



interface Answer {
  solution: any
  reportSolution(): void
  reset(): void
}

declare global {interface HTMLElementTagNameMap {
  "webwriter-task": WebwriterTask;
}}

@customElement("webwriter-task")
export class WebwriterTask extends LitElementWw {

  static localization = {}

  static scopedElements = {
    "sl-icon-button": SlIconButton,
    "sl-details": SlDetails,
    "sl-popup": SlPopup,
    "sl-button": SlButton,
    "sl-button-group": SlButtonGroup,
    "sl-tab-group": SlTabGroup,
    "sl-tab": SlTab,
    "sl-tab-panel": SlTabPanel
  }

  msg = (str: string) => this.lang in WebwriterTask.localization? WebwriterTask.localization[this.lang][str] ?? str: str

  static styles = css`
    :host {
      display: flex !important;
      flex-direction: column;
      gap: 1rem;
      position: relative;
      z-index: 1;
    }


    :host(:not([hint])) details {
      display: none;
    }

    sl-tooltip::part(base__popup) {
      cursor: text;
    }

    #hint-popup {
      --arrow-color: var(--sl-color-neutral-700);
      z-index: 1000;
    }

    #hint-popup::part(popup) {
      z-index: 100;
      max-width: 200px;
    }

    :host(:not([contenteditable=true]):not([contenteditable=""]):not([hint])) #hint {
      display: none;
    }
    
    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) .user-only {
      display: none;
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) {
      ::slotted([slot=prompt]:empty) {
        display: none;
      }
    }

    :host(:not([submitted]):not([contenteditable=true]):not([contenteditable=""])) #explainer-group {
      display: none;
    }

    #task-buttons {
      position: absolute;
      right: 0;
      top: 0;
      background: rgba(255, 255, 255, 0.9);
      user-select: none;
      z-index: 100;
    }

    #hint-content {
      background: var(--sl-color-neutral-700);
      color: var(--sl-color-neutral-50);
      min-width: 2ch;
      font-size: 0.75rem;
      padding: 0.5rem;
      border-radius: 4px;
      user-select: auto;
    }

    ::slotted([slot=explainer]:not([active])) {
      display: none !important;
    }

    sl-tab-group {
      &[data-empty] {
        display: none;
      }

      &[data-single] sl-tab {
        display: none;
      }

      & sl-tab::part(base) {
        padding: 10px;
      }

      &::part(tabs) {
        height: 100px;
        margin-left: -1px;
        z-index: 10;
      }

      & ::slotted([name=explainer]) {
        height: 100%;
      }
    }

    header {
      display: flex;
      flex-direction: row;
      gap: 1ch;

      & span:empty {
        display: none;
      } 

      & slot {
        display: block;
        flex-grow: 1;
      }
    }

    .user-actions {
      & #submit {
        flex-grow: 3;
      }

      & #reset {
        flex-grow: 1;
      }
    }

  `

  @queryAssignedElements({slot: "hint"})
  accessor hints: HTMLElement[]

  get hasHintElement() {
    return this.hints.length > 0
  }

  get hasHintContent() {
    return this.hints.some(hint => hint.innerText.trim() !== "")
  }

  @property({type: Boolean, attribute: true, reflect: true})
  accessor hint = false

  @property({type: Boolean, state: true, attribute: false, reflect: false})
  accessor isChanged = false
  
  get directSubmit() {
    return !this.closest("webwriter-quiz")
  }

  @property({type: Boolean, attribute: false, reflect: true})
  private set directSubmit(value: boolean) {
    return
  }

  @property({type: Boolean, attribute: true, reflect: true})
  accessor submitted = false

  toggleHint() {
    this.hintOpen = !this.hintOpen
    if(this.isContentEditable && this.hintOpen) {
      this.hint = true
      if(!this.hasHintElement) {
        const hintEl = this.ownerDocument.createElement("webwriter-task-hint")
        hintEl.slot = "hint"
        this.answer.insertAdjacentElement("beforebegin", hintEl)
        this.ownerDocument.getSelection().setBaseAndExtent(hintEl, 0, hintEl, 0)
      }
    }
    else if(this.isContentEditable && !this.hintOpen) {
      if(!this.hasHintContent) {
        this.hint = false
        this.hintSlotEl.assignedElements().forEach(el => el.remove())
      }
    }
  }

  get explainers(): WebwriterTaskExplainer[] {
    return Array.from(this.querySelectorAll("webwriter-task-explainer")) as unknown as WebwriterTaskExplainer[]
  }

  toggleExplainers = () => {
    if(this.explainers.length) {
      this.explainers.forEach(explainer => explainer.remove())
      this.activeExplainer = undefined
    }
    else {
      const solutionExplainer = this.ownerDocument.createElement("webwriter-task-explainer")
      solutionExplainer.slot = "explainer"
      solutionExplainer.id = "solution"
      solutionExplainer.active = true/*
      const elseExplainer = this.ownerDocument.createElement("webwriter-task-explainer")
      elseExplainer.slot = "explainer"
      elseExplainer.id = "else"*/
      this.append(solutionExplainer)
      this.ownerDocument.getSelection().setBaseAndExtent(solutionExplainer, 0, solutionExplainer, 0)
      this.requestUpdate()
      this.activeExplainer = "solution"
    }
  }

  @property({attribute: false, state: true})
  private accessor hintOpen = false

  @property({attribute: true, reflect: true})
  accessor counter: "number" | "roman" | "roman-capitalized" | "alphabetical" | "alphabetical-capitalized"

  get index() {
    return [...(this?.parentElement?.children ?? [])].indexOf(this)
  }

  get ordinalExpr() {
    if(this.index === undefined || this.index === -1) {
      return undefined
    }
    if(this.counter === "number") {
      return `${this.index + 1}.`
    }
    else if(this.counter === "roman") {
      return `${romanOrdinal(this.index + 1)}.`
    }
    else if(this.counter === "roman-capitalized") {
      return `${romanOrdinal(this.index + 1, true)}.`
    }
    else if(this.counter === "alphabetical") {
      return `${alphabeticalOrdinal(this.index)}.`
    }
    else if(this.counter === "alphabetical-capitalized") {
      return `${alphabeticalOrdinal(this.index, true)}.`
    }
  }

  observer: MutationObserver

  connectedCallback(): void {
    super.connectedCallback()
    this.observer = new MutationObserver(() => this.requestUpdate())
    this.parentElement && this.observer.observe(this.parentElement, {childList: true})
    this.addEventListener("keydown", (e) => this.handleHintKeydown(e))
  }

  protected firstUpdated(_changedProperties: PropertyValues): void {
    if(this.isContentEditable) {
      this.#decodeSolution()
    }
  }


  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer.disconnect()
  }

  @property({type: String, attribute: true, reflect: true})
  accessor solution: string

  /** Property containing the password currently entered by the author or user */
  @property({type: String, attribute: false, reflect: false})
  // @option({type: String, label: {_: "Password"}, description: {_: "Password-protects quiz answers"}})
  accessor password: string = "B08bxd82SAOf"

  @property({type: String, attribute: true, reflect: true})
  accessor salt: string
  
  @property({type: String, attribute: true, reflect: true})
  accessor iv: string

  async #encodeSolution() {
    const value = this.answer.solution as any
    console.log(value)
    let keyMaterial = await getKeyMaterial(this.password)
    let salt = window.crypto.getRandomValues(new Uint8Array(16))
    let iv = window.crypto.getRandomValues(new Uint8Array(12))
    let key = await getKey(keyMaterial, salt)
    let encoder = new TextEncoder();
    let encodedMessage = encoder.encode(JSON.stringify(value))
    const solution = await window.crypto.subtle.encrypt(
      {name: "AES-GCM", iv}, 
      key,
      encodedMessage
    )

    this.solution = await arrayBufferToDataUrl(solution)
    this.iv = await arrayBufferToDataUrl(iv)
    this.salt = await arrayBufferToDataUrl(salt)
  }

  async #decodeSolution() {
    if(!this.solution) {
      return
    }
    const encodedSolution = await dataUrlToArrayBuffer(this.solution)
    const iv = await dataUrlToArrayBuffer(this.iv)
    const salt = await dataUrlToArrayBuffer(this.salt)
    let keyMaterial = await getKeyMaterial(this.password)
    let key = await getKey(keyMaterial, new Uint8Array(salt))
    try {
      const solutionBuffer = await window.crypto.subtle.decrypt({name: "AES-GCM", iv}, key, encodedSolution)
      let decoder = new TextDecoder()
      const solution = JSON.parse(decoder.decode(solutionBuffer))
      this.answer.solution = solution
    }
    catch(err) {
      console.error(err)
      throw new Error("Invalid password")
    }
  }

  checkSolution() {
    const solution = this.#decodeSolution()
    return Object.entries(solution).every(([k, v]) => {
      return JSON.stringify(this.answer[k]) === JSON.stringify(v)
    })
  }

  reportSolution() {
    // @ts-ignore
    this.answer.reportSolution(this.#decodeSolution())
  }

  @query("slot:not([name])")
  accessor slotEl: HTMLSlotElement

  @query("slot[name=hint]")
  accessor hintSlotEl: HTMLSlotElement

  get answer() {
    return this.slotEl?.assignedElements()[0] as HTMLElement
  }



  handleHintSlotChange = (e: Event) => {
    if(!this.hasHintElement) {
      this.hintOpen = false
      this.hint = false
    }
  }

  handleHintKeydown = (e: KeyboardEvent) => {
    console.log(document.getSelection().anchorOffset === 0, this.hints.includes(document.getSelection().anchorNode.parentElement))
    if(e.key === "Backspace" && document.getSelection().anchorOffset === 0 && this.hints.includes(document.getSelection().anchorNode.parentElement)) {
      this.hintOpen = false
      this.hint = false
    }
  }

  handleSubmit = async () => {
    await this.#decodeSolution()
    this.answer.reportSolution()
    this.dispatchEvent(new SubmitEvent("submit", {bubbles: true, composed: true}))
    this.activeExplainer = this.explainers[0].id
    this.submitted = true
  }

  handleReset = () => {
    this.answer.reset && this.answer.reset()
    this.isChanged = false
    this.submitted = false
  }

  handleAnswerChange = async (e: CustomEvent) => {
    this.isChanged = true
    if(this.isContentEditable) {
      this.#encodeSolution()
    }
  }

  handleSlotChange = (e: Event) => {
    this.requestUpdate()
    if(this.isContentEditable) {
      const solution = this.#decodeSolution() ?? {}
      Object.entries(solution).forEach(([k, v]) => {
        this.answer[k] = v
      })
    }
  }

  @property()
  accessor activeExplainer: string

  selectExplainer(id: string) {
    const explainer = this.explainers.find(node => node.id === id)
    explainer.active = true
    this.explainers.filter(node => node.id !== id).forEach(node => node.active = false)
    this.activeExplainer = id
    setTimeout(() => this.ownerDocument.getSelection().setBaseAndExtent(explainer, 0, explainer, 0))
  }

  get explainerLabels() {
    return {
      "solution": "Explainer",
      "else": "Else"
    }
  }

  render() {
    return html`
      <header>
        <span>${this.ordinalExpr}</span>
        <slot name="prompt"></slot>
        <div id="task-buttons">
          <sl-icon-button class="author-only" id="feedback" src=${!this.explainers.length? IconPatchCheck: IconPatchCheckFill} @click=${() => this.toggleExplainers()}></sl-icon-button>
          <sl-popup id="hint-popup" ?active=${this.hintOpen} placement="left" arrow auto-size shift @selectstart=${e => e.stopImmediatePropagation()}>
            <sl-icon-button class="author-only" slot="anchor" id="hint" src=${!this.hasHintContent && !this.hintOpen? IconPatchQuestion: IconPatchQuestionFill} @click=${() => this.toggleHint()}></sl-icon-button>
            <div id="hint-content">
              <slot name="hint" @slotchange=${this.handleHintSlotChange}></slot>
            </div>
          </sl-popup>
        </div>
      </header>
      <slot @ww-answer-change=${this.handleAnswerChange} @slotchange=${this.handleSlotChange} ?inert=${this.submitted}></slot>
      <sl-tab-group id="explainer-group" placement="end" ?data-empty=${!this.explainers.length} ?data-single=${this.explainers.length === 1}>
        ${this.explainers.map((explainer, i) => html`<sl-tab ?active=${this.activeExplainer === explainer.id} slot="nav" @click=${() => this.selectExplainer(explainer.id)}>${this.explainerLabels[explainer.id] ?? explainer.id}</sl-tab>`)}
        <slot name="explainer" style=${styleMap({"--ww-placeholder": `"${this.msg("Explanation")}"`})}></slot>
      </sl-tab-group>
      ${!this.directSubmit || !this.answer?.reportSolution? null: html`
        <sl-button-group class="user-only user-actions">
          <sl-button id="submit" @click=${this.handleSubmit}>Check your answers</sl-button>
          <sl-button ?disabled=${!this.isChanged && !this.submitted} id="reset" class="user-only" @click=${this.handleReset}>Try again</sl-button>
        </sl-button-group>
      `}
    `
  }
}