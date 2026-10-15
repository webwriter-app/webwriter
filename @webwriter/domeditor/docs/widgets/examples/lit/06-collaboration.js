import {LitElementWw} from "@webwriter/lit"
import {html, css} from "lit"

class WwQuiz extends LitElementWw {
  static properties = {answer: {type: String, reflect: true}, error: {state: true}}
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
    this.answer = "false"
    this.error = ""
  }

  dataPending() { this.error = "" }
  dataChanged() { this.error = "" }
  dataError(error) { this.error = error.message }

  get choice() {
    try {
      const value = JSON.parse(this.data || "{}").choice
      return value === "true" || value === "false" ? value : ""
    }
    catch { return "" }
  }

  choose(value) {
    if(this.editable || !this.dataReady) return
    try {
      const state = JSON.parse(this.data || "{}")
      this.data = JSON.stringify({...state, choice: value})
    }
    catch(error) {
      this.error = error.message
    }
  }

  resetAnswer() { this.answer = "false" }

  render() {
    const editing = this.editable
    const ready = this.dataReady
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
