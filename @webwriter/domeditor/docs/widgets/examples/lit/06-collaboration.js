import {LitElement, html, css} from "lit"

class WwQuiz extends LitElement {
  static properties = {readyBlock: {state: true}, error: {state: true}}
  static get observedAttributes() {
    return [...super.observedAttributes, "answer", "contenteditable", "shared"]
  }
  static options = {
    answer: {
      type: "select",
      label: {_: "Correct answer"},
      options: [
        {value: "true", label: {_: "True"}},
        {value: "false", label: {_: "False"}},
      ],
    },
  }
  static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}
  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
      min-inline-size: 0;
      margin-inline: auto;
      padding: 1rem;
      border: 1px solid #cbd5e1;
      border-radius: .5rem;
      background: white;
      color: #1f2937;
      container-type: inline-size;
      overflow-wrap: anywhere;
    }
    .controls { display: flex; flex-wrap: wrap; gap: .5rem; }
    .controls[hidden] { display: none; }
    button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
    button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
  `
  constructor() {
    super()
    this.readyBlock = null
    this.error = ""
    this.addEventListener("datachange", event => {
      if(event.target !== this.block) return
      this.readyBlock = event.target
      this.error = ""
      this.requestUpdate()
    })
    this.addEventListener("dataerror", event => {
      if(event.target !== this.block) return
      this.readyBlock = null
      this.error = event.detail.message
    })
  }

  get answer() { return this.getAttribute("answer") ?? "false" }

  attributeChangedCallback(name, oldValue, value) {
    super.attributeChangedCallback(name, oldValue, value)
    if(name === "shared" && oldValue !== value) this.readyBlock = null
    this.requestUpdate()
  }

  get block() {
    return this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
  }

  get choice() {
    try {
      const value = JSON.parse(this.block?.textContent || "{}").choice
      return value === "true" || value === "false" ? value : ""
    }
    catch { return "" }
  }

  choose(value) {
    const block = this.block
    if(this.isContentEditable || !block || block !== this.readyBlock) return
    try {
      const state = JSON.parse(block.textContent || "{}")
      block.textContent = JSON.stringify({...state, choice: value})
    }
    catch(error) {
      this.error = error.message
    }
  }

  resetAnswer() { this.setAttribute("answer", "false") }

  render() {
    const editing = this.isContentEditable
    const ready = this.block && this.block === this.readyBlock
    const result = this.error || (!ready ? "Loading answers…" : (this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : ""))
    return html`
      <slot><p>Add a question.</p></slot>
      <div class="controls" ?hidden=${editing}>
        <button type="button" value="true" ?disabled=${!ready} @click=${() => this.choose("true")}>True</button>
        <button type="button" value="false" ?disabled=${!ready} @click=${() => this.choose("false")}>False</button>
      </div>
      <p class="author-hint" ?hidden=${!editing}>Edit the question and correct answer, then use Preview.</p>
      <output aria-live="polite">${result}</output>`
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
