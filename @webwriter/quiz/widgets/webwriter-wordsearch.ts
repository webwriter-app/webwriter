import {html, css} from "lit"
import {LitElementWw, option} from "@webwriter/lit"
import {customElement, property, query} from "lit/decorators.js"
import "@shoelace-style/shoelace/dist/themes/light.css"
import {keyed} from "lit/directives/keyed.js"
import { styleMap } from "lit/directives/style-map.js"

import SlIconButton from "@shoelace-style/shoelace/dist/components/icon-button/icon-button.component.js"
import IconPlusSquare from "bootstrap-icons/icons/plus-square.svg"
import IconDashSquare from "bootstrap-icons/icons/dash-square.svg"

export function range(a: number, b?: number) {
  return [...Array((b ?? a*2) - a).keys()].map(x => x + (b? a: 0))
}

@customElement("webwriter-wordsearch")
export class WebwriterWordSearch extends LitElementWw {

  static scopedElements = {
    "sl-icon-button": SlIconButton
  }

  @property({type: Number, attribute: true, reflect: true})
  @option({type: "number"})
  rows: number = 5

  @property({type: Number, attribute: true, reflect: true})
  @option({type: "number"})
  columns: number = 10

  static styles = css`

    :host {
      display: flex !important;
      flex-direction: row;
      align-items: flex-start;
      padding-bottom: 40px;
      overflow-x: auto;
    }

    :host(:is([contenteditable=true], [contenteditable=""])) span {
      background: var(--sl-color-gray-200);
    }

    :host(:not([contenteditable=true]):not([contenteditable=""])) .author-only {
      display: none;
    }

    main {
      width: auto;
      display: grid;
      gap: 1ch;
      position: relative;

      #col {
        position: absolute;
        right: -40px;
        top: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        margin: auto 0;
      }

      #row {
        position: absolute;
        bottom: -40px;
        left: 0;
        right: 0;
        margin: 0 auto;
        display: flex;
        justify-content: center;
      }
    }

    span {
      min-width: 1ch;
      min-height: 1em;
      display: inline-block;
      font-family: monospace;
      text-align: center;
    }

    span:focus {
      outline: none;
    }
  `

  get activeEl() {
    return this.shadowRoot.activeElement
  }

  get spanText() {
    const spans = [...this.shadowRoot.querySelectorAll("span")]
    return spans.map(span => span.innerText).join("")
  }

  connectedCallback(): void {
      super.connectedCallback()
      new MutationObserver(() => this.requestUpdate()).observe(this, {childList: true, characterData: true})
      this.addEventListener("keydown", e => {
        if(e.key === "ArrowLeft") {
          const prev = this.activeEl.previousElementSibling  as HTMLElement | null
          prev && (prev as any).focus()
          e.preventDefault()
        }
        else if(e.key === "ArrowRight") {
          const next = this.activeEl.nextElementSibling as HTMLElement | null
          next && (next as any).focus()
          e.preventDefault()
        }
        else if(e.key === "ArrowUp") {
          const children = [...this.mainEl.children]
          const pos = children.indexOf(this.activeEl)
          const nextPos = Math.max(0, pos - this.columns)
          const next = this.mainEl.children.item(nextPos) as HTMLElement
          next.focus()
          e.preventDefault()
        }
        else if(e.key === "ArrowDown") {
          const children = [...this.mainEl.children]
          const pos = children.indexOf(this.activeEl)
          const nextPos = Math.min(this.rows * this.columns - 1, pos + this.columns)
          const next = this.mainEl.children.item(nextPos) as HTMLElement
          next.focus()
          e.preventDefault()
        }
      })
      new MutationObserver(mutations => {
        this.textContent = this.spanText
      }).observe(this.shadowRoot, {subtree: true, characterData: true, characterDataOldValue: true})
  }

  changeCount(value: number = 1, direction: "row" | "col" = "row") {
    if(direction === "row") {
      this.rows = Math.max(this.rows + value, 2)
    }
    else {
      this.columns = Math.max(this.columns + value, 2)
    }
  }

  insertContent(pos: number, value?: string) {
    
  }

  removeContent() {

  }


  @query("main")
  mainEl: HTMLDivElement

  render() {
    const chars = [...this.textContent]
    const content = keyed({}, range(this.rows * this.columns).map(i => html`
      <span contenteditable=${this.isContentEditable? "plaintext-only": "false"}>${chars[i]}</span>
    `))
    const styles = styleMap({
      "grid-template-rows": `repeat(${this.rows}, 3ch)`,
      "grid-template-columns": `repeat(${this.columns}, 3ch)`
    })
    console.log(this.contentEditable)
    return html`<main style=${styles}>
      ${this.textContent? content: html`<span contenteditable=${this.isContentEditable? "plaintext-only": "false"}></span>`}
      <div id="col">
        <sl-icon-button id="rem-col" class="author-only" src=${IconDashSquare} @click=${() => this.changeCount(-1, "col")}></sl-icon-button>
        <sl-icon-button id="add-col" class="author-only" src=${IconPlusSquare} @click=${() => this.changeCount(1, "col")}></sl-icon-button>
      </div>
      <div id="row">
        <sl-icon-button id="rem-row" class="author-only" src=${IconDashSquare} @click=${() => this.changeCount(-1, "row")}></sl-icon-button>
        <sl-icon-button id="add-row" class="author-only" src=${IconPlusSquare} @click=${() => this.changeCount(1, "row")}></sl-icon-button>
      </div>
    </main>`
  }
}