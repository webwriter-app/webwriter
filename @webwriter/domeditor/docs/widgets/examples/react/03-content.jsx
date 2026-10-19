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
  button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
  button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
`

class WwQuiz extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"})
    this.mount = document.createElement("div")
    this.shadowRoot.append(this.mount)
    this.root = null
  }

  connectedCallback() {
    this.root = createRoot(this.mount)
    this.root.render(<ReactQuiz />)
  }

  disconnectedCallback() {
    this.root?.unmount()
    this.root = null
  }
}

function ReactQuiz() {
  return <section>
    <style>{styles}</style>
    <slot><p>Add a question.</p></slot>
    <div className="controls">
      <button type="button" value="true">True</button>
      <button type="button" value="false">False</button>
    </div>
    <output aria-live="polite" />
  </section>
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
