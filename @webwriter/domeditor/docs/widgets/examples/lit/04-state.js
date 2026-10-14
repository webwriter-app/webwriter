import {LitElement, html, css} from "lit"

class WwQuiz extends LitElement {
  static properties = {choice: {state: true}}
  static get observedAttributes() {
    return [...super.observedAttributes, "answer", "contenteditable"]
  }
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
    this.choice = ""
  }

  get answer() { return this.getAttribute("answer") ?? "false" }

  attributeChangedCallback(name, oldValue, value) {
    super.attributeChangedCallback(name, oldValue, value)
    this.requestUpdate()
  }

  choose(value) {
    if(this.isContentEditable) return
    this.choice = value
  }

  render() {
    const editing = this.isContentEditable
    return html`
      <slot><p>Add a question.</p></slot>
      <div class="controls" ?hidden=${editing}>
        <button type="button" value="true" @click=${() => this.choose("true")}>True</button>
        <button type="button" value="false" @click=${() => this.choose("false")}>False</button>
      </div>
      <p class="author-hint" ?hidden=${!editing}>Edit the question and correct answer, then use Preview.</p>
      <output aria-live="polite">${this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : ""}</output>`
  }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
