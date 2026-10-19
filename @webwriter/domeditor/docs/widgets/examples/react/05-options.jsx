import {useState} from "react"
import {createRoot} from "react-dom/client"

const styles = `
  :host {
    display: block; box-sizing: border-box;
    max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
    min-inline-size: 0; margin-inline: auto; padding: 1rem;
    border: 1px solid #cbd5e1; border-radius: .5rem;
    background: white; color: #1f2937; container-type: inline-size;
    overflow-wrap: anywhere;
  }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; }
  .controls[hidden] { display: none; }
  button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
  button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
`
const options = {
  answer: {
    type: "select",
    label: {_: "Correct answer"},
    options: [
      {value: "true", label: {_: "True"}},
      {value: "false", label: {_: "False"}},
    ],
  },
}
const actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

class WwQuiz extends HTMLElement {
  static observedAttributes = ["answer", "contenteditable"]
  static options = options
  static actions = actions

  constructor() {
    super()
    this.attachShadow({mode: "open"})
    this.mount = document.createElement("div")
    this.shadowRoot.append(this.mount)
    this.root = null
  }

  get answer() { return this.getAttribute("answer") ?? "false" }

  connectedCallback() {
    this.root = createRoot(this.mount)
    this.update()
  }

  disconnectedCallback() {
    this.root?.unmount()
    this.root = null
  }

  attributeChangedCallback() { this.update() }

  resetAnswer() { this.setAttribute("answer", "false") }

  update() {
    if(!this.root) return
    this.root.render(<ReactQuiz answer={this.answer} editing={this.isContentEditable} />)
  }
}

function ReactQuiz({answer, editing}) {
  const [choice, setChoice] = useState("")

  return <section>
    <style>{styles}</style>
    <slot><p>Add a question.</p></slot>
    <div className="controls" hidden={editing}>
      <button type="button" value="true" onClick={() => { if(!editing) setChoice("true") }}>True</button>
      <button type="button" value="false" onClick={() => { if(!editing) setChoice("false") }}>False</button>
    </div>
    <p className="author-hint" hidden={!editing}>Edit the question and correct answer, then use Preview.</p>
    <output aria-live="polite">{choice ? (choice === answer ? "Correct!" : "Try again.") : ""}</output>
  </section>
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
