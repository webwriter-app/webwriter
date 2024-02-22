import {html, css} from "lit"
import {styleMap} from "lit/directives/style-map.js"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, queryAssignedElements, property, query} from "lit/decorators.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"
import SlDetails from "@shoelace-style/shoelace/dist/components/details/details.component.js"
import SlPopup from "@shoelace-style/shoelace/dist/components/popup/popup.component.js"

import IconPatchQuestion from "bootstrap-icons/icons/patch-question.svg"
import IconPatchQuestionFill from "bootstrap-icons/icons/patch-question-fill.svg"
import IconCheckCircle from "bootstrap-icons/icons/check-circle.svg"
import IconCheckCircleFill from "bootstrap-icons/icons/check-circle-fill.svg"

import IconSendCheck from "bootstrap-icons/icons/send-check.svg"

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

@customElement("webwriter-task")
export class WebwriterTask extends LitElementWw {

  static localization = {}

  static scopedElements = {
    "sl-icon-button": SlIconButton,
    "sl-details": SlDetails,
    "sl-popup": SlPopup
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
  `

  @queryAssignedElements({slot: "hint"})
  hints: HTMLElement[]

  get hasHintContent() {
    return this.hints.length > 0
  }

  @property({type: Boolean, attribute: true, reflect: true})
  hint = false

  @property({type: Boolean, attribute: true, reflect: true})
  @option({type: Boolean})
  directSubmit = false

  toggleHint() {
    this.hintOpen = !this.hintOpen
    if(this.isContentEditable) {
      this.hint = true
      if(!this.hasHintContent) {
        const p = this.ownerDocument.createElement("p")
        p.slot = "hint"
        this.appendChild(p)
        this.ownerDocument.getSelection().setBaseAndExtent(p, 0, p, 0)
        p.focus()
        this.requestUpdate()
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

  @property({type: String, attribute: true, reflect: true})
  password: string

  #decodeSolution(): Record<string, string> {
    // TODO: Encode/Decode password  
    return JSON.parse(atob(this.getAttribute("solution") ?? "") || "[]")
  }

  #encodeSolution(value: Record<string, string>) {
    this.setAttribute("solution", btoa(JSON.stringify(value)))
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

  handleAnswerChange = (e: CustomEvent) => {
    if(this.isContentEditable) {
      this.#encodeSolution(e.detail)
    }
  }

  handleSlotChange = (e: Event) => {
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
    if(this.hintSlotEl.assignedElements().length === 0) {
      this.hintOpen = false
      this.hint = false
    }
  }

  render() {
    return html`
      <header>
        <span>${this.ordinalExpr}</span>
        <slot name="prompt" style=${styleMap({"--ww-placeholder": `"${this.msg("Prompt")}"`})}></slot>
        <sl-popup id="hint-popup" ?active=${this.hintOpen} placement="left" arrow auto-size shift>
          <sl-icon-button slot="anchor" id="hint" src=${!this.hasHintContent? IconPatchQuestion: IconPatchQuestionFill} @click=${() => this.toggleHint()}></sl-icon-button>
          <div id="hint-content">
            <slot name="hint" @slotchange=${this.handleHintSlotChange}></slot>
          </div>
        </sl-popup>
      </header>
      <!--<sl-icon-button class="user-only" id="check" src=${IconCheckCircleFill}></sl-icon-button>-->
      <slot @ww-answer-change=${this.handleAnswerChange} @slotchange=${this.handleSlotChange}></slot>
    `
  }
}