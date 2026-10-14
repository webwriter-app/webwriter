class WwQuiz extends HTMLElement {
  static observedAttributes = ["answer", "contenteditable", "shared"]
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
  readyBlock = null
  error = ""

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <style>
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
      </style>
      <slot><p>Add a question.</p></slot>
      <div class="controls">
        <button type="button" value="true">True</button>
        <button type="button" value="false">False</button>
      </div>
      <p class="author-hint" hidden>Edit the question and correct answer, then use Preview.</p>
      <output aria-live="polite"></output>`
    this.shadowRoot.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => this.choose(button.value))
    })
    this.addEventListener("datachange", event => {
      if(event.target !== this.block) return
      this.readyBlock = event.target
      this.error = ""
      this.update()
    })
    this.addEventListener("dataerror", event => {
      if(event.target !== this.block) return
      this.readyBlock = null
      this.error = event.detail.message
      this.update()
    })
  }

  get answer() { return this.getAttribute("answer") ?? "false" }

  connectedCallback() { this.update() }

  attributeChangedCallback(name, oldValue, value) {
    if(name === "shared" && oldValue !== value) this.readyBlock = null
    this.update()
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
      this.update()
    }
  }

  resetAnswer() { this.setAttribute("answer", "false") }

  update() {
    const editing = this.isContentEditable
    const controls = this.shadowRoot.querySelector(".controls")
    controls.hidden = editing
    this.shadowRoot.querySelector(".author-hint").hidden = !editing
    const ready = this.block && this.block === this.readyBlock
    controls.querySelectorAll("button").forEach(button => { button.disabled = !ready })
    const output = this.shadowRoot.querySelector("output")
    output.textContent = this.error || (!ready ? "Loading answers…" : (this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : ""))
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
