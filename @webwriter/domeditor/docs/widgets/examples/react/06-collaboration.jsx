import {useSyncExternalStore} from "react"
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
  static observedAttributes = ["answer", "contenteditable", "shared"]
  static options = options
  static actions = actions
  readyBlock = null
  error = ""
  dataObserver = null
  lastBlock = null
  revision = 0
  listeners = new Set()

  constructor() {
    super()
    this.attachShadow({mode: "open"})
    this.mount = document.createElement("div")
    this.shadowRoot.append(this.mount)
    this.root = null
    this.subscribe = listener => {
      this.listeners.add(listener)
      return () => this.listeners.delete(listener)
    }
    this.getSnapshot = () => this.revision
    this.onDataChange = event => {
      if(event.target !== this.block) return
      this.readyBlock = event.target
      this.lastBlock = event.target
      this.error = ""
      this.update()
    }
    this.onDataError = event => {
      if(event.target !== this.block) return
      this.readyBlock = null
      this.lastBlock = event.target
      this.error = event.detail?.message ?? "Could not load answers."
      this.update()
    }
    this.onAuthoredStructureChange = records => {
      if(!records.some(record =>
        record.target === this ||
        (record.type === "attributes" && record.target.parentElement === this))) return
      const block = this.block
      if(block !== this.lastBlock) {
        this.lastBlock = block
        this.readyBlock = null
        this.error = ""
      }
      this.update()
    }
  }

  get answer() { return this.getAttribute("answer") ?? "false" }

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

  connectedCallback() {
    this.addEventListener("datachange", this.onDataChange)
    this.addEventListener("dataerror", this.onDataError)
    this.readyBlock = null
    this.lastBlock = this.block
    this.dataObserver = new MutationObserver(this.onAuthoredStructureChange)
    this.dataObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["slot", "type", "src"],
    })
    this.root = createRoot(this.mount)
    this.root.render(<ReactQuiz host={this} />)
  }

  disconnectedCallback() {
    this.removeEventListener("datachange", this.onDataChange)
    this.removeEventListener("dataerror", this.onDataError)
    this.dataObserver?.disconnect()
    this.dataObserver = null
    this.readyBlock = null
    this.root?.unmount()
    this.root = null
    this.listeners.clear()
  }

  attributeChangedCallback(name, oldValue, value) {
    if(name === "shared" && oldValue !== value) this.readyBlock = null
    this.update()
  }

  choose(value) {
    const block = this.block
    if(this.isContentEditable || !block || block !== this.readyBlock) return
    try {
      const state = JSON.parse(block.textContent || "{}")
      block.textContent = JSON.stringify({...state, choice: value})
      this.error = ""
      this.update()
    }
    catch(error) {
      this.error = error.message
      this.update()
    }
  }

  resetAnswer() { this.setAttribute("answer", "false") }

  update() {
    this.revision += 1
    for(const listener of this.listeners) listener()
  }
}

function ReactQuiz({host}) {
  useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot)
  const block = host.block
  const ready = Boolean(block && block === host.readyBlock)
  const result = host.error || (!ready ? "Loading answers…" : (host.choice ? (host.choice === host.answer ? "Correct!" : "Try again.") : ""))

  return <section>
    <style>{styles}</style>
    <slot><p>Add a question.</p></slot>
    <div className="controls" hidden={host.isContentEditable}>
      <button type="button" value="true" disabled={!ready} onClick={() => host.choose("true")}>True</button>
      <button type="button" value="false" disabled={!ready} onClick={() => host.choose("false")}>False</button>
    </div>
    <p className="author-hint" hidden={!host.isContentEditable}>Edit the question and correct answer, then use Preview.</p>
    <output aria-live="polite">{result}</output>
  </section>
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
