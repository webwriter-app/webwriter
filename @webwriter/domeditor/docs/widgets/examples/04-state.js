class WwQuiz extends HTMLElement {
  static observedAttributes = ["answer", "contenteditable"]
  choice = ""

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
  }

  get answer() { return this.getAttribute("answer") ?? "false" }

  connectedCallback() { this.update() }

  attributeChangedCallback() {
    this.update()
  }

  choose(value) {
    if(this.isContentEditable) return
    this.choice = value
    this.update()
  }

  update() {
    const editing = this.isContentEditable
    const controls = this.shadowRoot.querySelector(".controls")
    controls.hidden = editing
    this.shadowRoot.querySelector(".author-hint").hidden = !editing
    const output = this.shadowRoot.querySelector("output")
    output.textContent = (this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : "")
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
