import {html, css} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, queryAssignedElements, property, query} from "lit/decorators.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"
import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlDetails from "@shoelace-style/shoelace/dist/components/details/details.component.js"
import SlPopup from "@shoelace-style/shoelace/dist/components/popup/popup.component.js"
import SlButtonGroup from "@shoelace-style/shoelace/dist/components/button-group/button-group.component.js"

import IconPatchQuestion from "bootstrap-icons/icons/patch-question.svg"
import IconPatchQuestionFill from "bootstrap-icons/icons/patch-question-fill.svg"
import IconCheckCircle from "bootstrap-icons/icons/check-circle.svg"
import IconCheckCircleFill from "bootstrap-icons/icons/check-circle-fill.svg"

import IconSendCheck from "bootstrap-icons/icons/send-check.svg"
import "@shoelace-style/shoelace/dist/themes/light.css"
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
    "sl-button-group": SlButtonGroup
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
      z-index: 100;
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


    sl-icon-button {
      background: rgba(255, 255, 255, 0.9);
      &#hint {
        position: absolute;
        right: 0;
        top: 0;
      }

      &#solutions {
        position: absolute;
        right: 30px;
        top: 0;
      }

      &#check {
        position: absolute;
        right: 0;
        bottom: 0;
      }
    }

    #hint-content {
      background: var(--sl-color-neutral-700);
      color: var(--sl-color-neutral-50);
      min-width: 2ch;
      font-size: 0.75rem;
      padding: 0.5rem;
      border-radius: 4px;
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
  hints: HTMLElement[]

  get hasHintElement() {
    return this.hints.length > 0
  }

  get hasHintContent() {
    return this.hints.some(hint => Array.from(hint.children).some(child => !["BR", "WBR"].includes(child.tagName)) || hint.innerText.trim() !== "")
  }

  @property({type: Boolean, attribute: true, reflect: true})
  hint = false

  @property({type: Boolean, attribute: false, reflect: true})
  get directSubmit() {
    return !this.closest("webwriter-quiz")
  }

  @property({type: Boolean, attribute: true, reflect: true})
  submitted = false

  toggleHint() {
    this.hintOpen = !this.hintOpen
    if(this.isContentEditable && this.hintOpen) {
      this.hint = true
      if(!this.hasHintElement) {
        const p = this.ownerDocument.createElement("p")
        p.slot = "hint"
        this.appendChild(p)
        this.ownerDocument.getSelection().setBaseAndExtent(p, 0, p, 0)
        p.focus()
        this.requestUpdate()
      }
    }
    else if(this.isContentEditable && !this.hintOpen) {
      console.log(this.hasHintContent)
      if(!this.hasHintContent) {
        this.hint = false
        this.hintSlotEl.assignedElements().forEach(el => el.remove())
      }
    }
  }

  @property({attribute: false, state: true})
  private hintOpen = false

  @property({attribute: true, reflect: true})
  counter: "number" | "roman" | "roman-capitalized" | "alphabetical" | "alphabetical-capitalized"

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

  connectedCallback(): void {
    super.connectedCallback()
    const observer = new MutationObserver(() => this.requestUpdate())
    this.parentElement && observer.observe(this.parentElement, {childList: true})
  }

  /** Property containing the password currently entered by the author or user */
  @property({type: String, attribute: false, reflect: false})
  password: string

  #encodeSolution(value: Record<string, string>, password?: string) {
    // TODO: Password protection
    // Solution attribute should contain a JSON string with a configuration of attributes for the answer considered correct (`value`)
    this.setAttribute("solution", btoa(JSON.stringify(value)))
  }

  #decodeSolution(password: string): Record<string, string> {
    // reverse of #encodeSolution
    return JSON.parse(atob(this.getAttribute("solution") ?? "") || "[]")
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

  resetSolution() {
    // @ts-ignore
    this.answer.resetSolution()
  }

  handleAnswerChange = (e: CustomEvent) => {
    if(this.isContentEditable) {
      this.#encodeSolution(e.detail)
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

  @query("slot:not([name])")
  slotEl: HTMLSlotElement

  @query("slot[name=hint]")
  hintSlotEl: HTMLSlotElement

  get answer() {
    return this.slotEl?.assignedElements()[0] as HTMLElement
  }



  handleHintSlotChange = (e: Event) => {
    if(!this.hasHintElement) {
      this.hintOpen = false
      this.hint = false
    }
  }

  handleSubmit = () => {
    this.answer.reportSolution()
    this.submitted = true
  }

  handleReset = () => {
    this.answer.resetSolution()
    this.submitted = false
  }

  render() {
    return html`
      <header>
        <span>${this.ordinalExpr}</span>
        <slot name="prompt" style=${styleMap({"--ww-placeholder": `"${this.msg("Prompt")}"`})}></slot>
        <sl-popup id="hint-popup" ?active=${this.hintOpen} placement="left" arrow auto-size shift>
          <sl-icon-button slot="anchor" id="hint" src=${!this.hasHintContent && !this.hintOpen? IconPatchQuestion: IconPatchQuestionFill} @click=${() => this.toggleHint()}></sl-icon-button>
          <div id="hint-content">
            <slot name="hint" @slotchange=${this.handleHintSlotChange}></slot>
          </div>
        </sl-popup>
      </header>
      <!--<sl-icon-button class="user-only" id="check" src=${IconCheckCircleFill}></sl-icon-button>-->
      <slot @ww-answer-change=${this.handleAnswerChange} @slotchange=${this.handleSlotChange}></slot>
      ${!this.directSubmit || !this.answer?.reportSolution? null: html`
        <sl-button-group class="user-only user-actions">
          <sl-button id="submit" @click=${this.handleSubmit}>Submit</sl-button>
          <sl-button ?disabled=${!this.submitted} id="reset" class="user-only" @click=${this.handleReset}>Reset</sl-button>
        </sl-button-group>
      `}
    `
  }
}