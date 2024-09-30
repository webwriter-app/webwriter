import {css, html, PropertyValues} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property, query, queryAssignedElements} from "lit/decorators.js"

import SlButton from "@shoelace-style/shoelace/dist/components/button/button.component.js"
import SlButtonGroup from "@shoelace-style/shoelace/dist/components/button-group/button-group.component.js"
import SlDropdown from "@shoelace-style/shoelace/dist/components/dropdown/dropdown.component.js"
import SlMenu from "@shoelace-style/shoelace/dist/components/menu/menu.component.js"
import SlMenuItem from "@shoelace-style/shoelace/dist/components/menu-item/menu-item.component.js"
import SlIcon from "@shoelace-style/shoelace/dist/components/icon/icon.component.js"
import IconUIChecksGrid from "bootstrap-icons/icons/ui-checks-grid.svg"
import Icon123 from "bootstrap-icons/icons/123.svg"
import IconCardText from "bootstrap-icons/icons/card-text.svg"
import IconHighlighter from "bootstrap-icons/icons/highlighter.svg"
import IconSubtract from "bootstrap-icons/icons/subtract.svg"
import IconBodyText from "bootstrap-icons/icons/body-text.svg"
import IconMic from "bootstrap-icons/icons/mic.svg"
import IconImage from "bootstrap-icons/icons/image.svg"
import IconSearch from "bootstrap-icons/icons/search.svg"
import IconGrid3x3Gap from "bootstrap-icons/icons/grid-3x3-gap.svg"

import "@shoelace-style/shoelace/dist/themes/light.css"
import type { WebwriterTask } from "./webwriter-task.js"


function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

declare global {interface HTMLElementTagNameMap {
  "webwriter-quiz": WebwriterQuiz;
}}

@customElement("webwriter-quiz")
export class WebwriterQuiz extends LitElementWw {

  static localization = {}

  msg = (str: string) => this.lang in WebwriterQuiz.localization? WebwriterQuiz.localization[this.lang][str] ?? str: str

  get answerTypes() {
    return {
      "webwriter-choice": {
        label: this.msg("Choice"),
        icon: IconUIChecksGrid
      },
      "webwriter-order": {
        label: this.msg("Order"),
        icon: Icon123
      },
      "webwriter-text": {
        label: this.msg("Text"),
        icon: IconCardText
      },
      "webwriter-mark": {
        label: this.msg("Mark"),
        icon: IconHighlighter
      },/*
      "webwriter-pairing": {
        label: this.msg("Pairing"),
        icon: IconSubtract
      },
      "webwriter-cloze": {
        label: this.msg("Cloze"),
        icon: IconBodyText
      },*/
      "webwriter-speech": {
        label: this.msg("Speech"),
        //advanced: true,
        icon: IconMic
      },
      /*"webwriter-wordsearch": {
        label: this.msg("Word Search"),
        advanced: true,
        icon: IconSearch
      },
      "webwriter-memory": {
        label: this.msg("Memory"),
        advanced: true,
        icon: IconGrid3x3Gap
      }*/
    }
  }

  static scopedElements = {
    "sl-button": SlButton,
    "sl-button-group": SlButtonGroup,
    "sl-icon": SlIcon,
    "sl-dropdown": SlDropdown,
    "sl-menu": SlMenu,
    "sl-menu-item": SlMenuItem,
  }

  addTask(answerTypeName: string) {
    const task = this.ownerDocument.createElement("webwriter-task") as WebwriterTask
    task.setAttribute("counter", this.counter)
    const prompt = this.ownerDocument.createElement("webwriter-task-prompt")
    const p = this.ownerDocument.createElement("p")
    prompt.append(p)
    prompt.slot = "prompt"
    const answer = this.ownerDocument.createElement(answerTypeName)
    task.appendChild(prompt)
    task.appendChild(answer)
    this.appendChild(task)
    document.getSelection().setBaseAndExtent(p, 0, p, 0)
  }

  static styles = css`
    :host {
      border-top: 1px solid darkgray;
      border-bottom: 1px solid darkgray;
      padding: 1ch;
      display: flex !important;
      flex-direction: column;
      gap: 2rem;
      counter-reset: task;
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) .user-only {
      display: none;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) ::slotted(*) {
      order: unset !important;
    }

    sl-button-group::part(base) {
      display: flex;
    }

    sl-button-group > *:not(sl-dropdown) {
      flex-grow: 1;
    }

    sl-dropdown[data-empty] {
      display: none;
    }

    sl-button:not([caret])::part(label) {
      padding: 0;
      display: flex;
      flex-direction: row;
      width: 100%;
      justify-content: space-evenly;
      align-items: center;
    }

    sl-icon {
      width: 18px;
      height: 18px;
    }

    sl-menu::part(menu) {
      z-index: 10000;
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
  
  @property({type: Boolean, attribute: true, reflect: true})
  @option({type: Boolean, label: {"en": "Random Task Order"}})
  accessor randomOrder = false

  get counter(): "number" | "roman" | "roman-capitalized" | "alphabetical" | "alphabetical-capitalized" {
    return this.tasks[0]?.counter
  }

  @property({attribute: true}) //@ts-ignore
  @option({
    type: "select",
    label: {
      "en": "Counter"
    },
    options: [
      {value: undefined, label: {"en": "None"}},
      {value: "number", label: {"en": "1. 2. 3."}},
      {value: "roman", label: {"en": "i. ii. iii."}},
      {value: "roman-capitalized", label: {"en": "I. II. III."}},
      {value: "alphabetical", label: {"en": "a. b. c."}},
      {value: "alphabetical-capitalized", label: {"en": "A. B. C."}},
    ]
  })
  set counter(value) {
    this.tasks.forEach(el => el.counter = value)
  }

  shuffleTasks() {
    const n = this.tasks.length
    const nums = shuffle([...(new Array(n)).keys()])
    this.tasks.forEach((el, i) => el.style.order = String(nums[i]))
  }

  handleSubmit(e: Event) {
    this.submitted = true
    this.dispatchEvent(new Event("submit"))
    this.tasks.forEach(task => task.handleSubmit())
  }

  handleReset = () => {
    this.tasks.forEach(task => task.reset())
    this.requestUpdate()
    this.submitted = false
  }

  observer: MutationObserver

  connectedCallback(): void {
    super.connectedCallback()
    this.observer = new MutationObserver(() => {
      if(!this.contentEditable && this.randomOrder) {
        this.shuffleTasks()
      }
    })
    this.observer.observe(this, {childList: true})
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer.disconnect()
  }

  @query("slot")
  accessor slotEl: HTMLSlotElement

  @queryAssignedElements()
  accessor tasks: WebwriterTask[]

  @property({type: Boolean, attribute: true, reflect: true})
  accessor submitted = false

  get isChanged() {
    return this.tasks.some(task => task.isChanged)
  }

  render() {
    const basicAnswerTypes = Object.keys(this.answerTypes).filter(k => !this.answerTypes[k]?.advanced)
    const otherAnswerTypes = Object.keys(this.answerTypes).filter(k => this.answerTypes[k]?.advanced)
    return html`
      <slot ?inert=${this.submitted} @ww-answer-change=${() => this.requestUpdate()}></slot>
        <sl-button-group class="user-only user-actions">
          <sl-button id="submit" @click=${this.handleSubmit}>Submit</sl-button>
          <sl-button ?disabled=${!this.isChanged} id="reset" @click=${this.handleReset}>Reset</sl-button>
        </sl-button-group>
      <sl-button-group class="author-only">
        ${basicAnswerTypes.map(k => html`
          <sl-button @click=${() => this.addTask(k)}>
            <sl-icon src=${this.answerTypes[k]?.icon}></sl-icon>
            ${this.answerTypes[k].label}
          </sl-button>
        `)}
        <sl-dropdown data-empty=${!otherAnswerTypes.length} placement="bottom-end" hoist>
          <sl-button slot="trigger" caret></sl-button>
          <sl-menu>
            ${otherAnswerTypes.map(k => html`
            <sl-menu-item @click=${() => this.addTask(k)}>
              <sl-icon src=${this.answerTypes[k]?.icon}></sl-icon>
              ${this.answerTypes[k].label}
            </sl-menu-item>
            `)}
          </sl-menu>
        </sl-dropdown>
      </sl-button-group>
      `
  }
}