<svelte:options
  customElement={{
    tag: "ww-quiz",
    props: {
      answer: {type: "String", reflect: true},
      shared: {type: "Boolean", reflect: true},
      choice: {type: "String"},
      ready: {type: "Boolean"},
      error: {type: "String"},
      editing: {type: "Boolean"},
    },
    extend: (Base) => class extends Base {
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

      constructor() {
        super()
        this.__wwQuizReadyBlock = null
        this.__wwQuizError = ""
        this.choice = ""
        this.ready = false
        this.error = ""
        this.editing = false
        this.onMutations = () => this.refresh()
        this.onDataChange = event => {
          if(event.target !== this.dataBlock) return
          this.__wwQuizReadyBlock = event.target
          this.__wwQuizError = ""
          this.refresh()
        }
        this.onDataError = event => {
          if(event.target !== this.dataBlock) return
          this.__wwQuizReadyBlock = null
          this.__wwQuizError = event.detail?.message || "Could not load shared answers."
          this.refresh()
        }
        this.addEventListener("datachange", this.onDataChange)
        this.addEventListener("dataerror", this.onDataError)
        this.__observer = new MutationObserver(this.onMutations)
      }

      static get observedAttributes() {
        return [...super.observedAttributes, "shared"]
      }

      attributeChangedCallback(name, oldValue, value) {
        super.attributeChangedCallback(name, oldValue, value)
        if(name === "shared" && oldValue !== value) {
          this.__wwQuizReadyBlock = null
          this.__wwQuizError = ""
          this.refresh()
        }
      }

      connectedCallback() {
        this.refresh()
        super.connectedCallback()
        this.addEventListener("datachange", this.onDataChange)
        this.addEventListener("dataerror", this.onDataError)
        this.__observer.observe(this, {
          attributes: true,
          attributeFilter: ["contenteditable"],
          characterData: true,
          childList: true,
          subtree: true,
        })
      }

      disconnectedCallback() {
        this.__observer.disconnect()
        this.removeEventListener("datachange", this.onDataChange)
        this.removeEventListener("dataerror", this.onDataError)
        super.disconnectedCallback()
      }

      get dataBlock() {
        return this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
      }

      get answer() { return this.getAttribute("answer") || "false" }
      set answer(value) { this.setAttribute("answer", value) }

      refresh() {
        const dataBlock = this.dataBlock
        if(this.__wwQuizReadyBlock && this.__wwQuizReadyBlock !== dataBlock) this.__wwQuizReadyBlock = null
        this.ready = Boolean(dataBlock && dataBlock === this.__wwQuizReadyBlock)
        this.error = this.__wwQuizError
        this.editing = this.isContentEditable
        try {
          const value = JSON.parse(dataBlock?.textContent || "{}").choice
          this.choice = value === "true" || value === "false" ? value : ""
        }
        catch { this.choice = "" }
      }

      chooseAnswer(value) {
        const dataBlock = this.dataBlock
        if(this.isContentEditable || !dataBlock || dataBlock !== this.__wwQuizReadyBlock) return
        try {
          const state = JSON.parse(dataBlock.textContent || "{}")
          dataBlock.textContent = JSON.stringify({...state, choice: value})
          this.__wwQuizError = ""
          this.__wwQuizReadyBlock = dataBlock
          this.refresh()
        }
        catch(cause) {
          this.__wwQuizError = cause.message
          this.refresh()
        }
      }

      resetAnswer() { this.setAttribute("answer", "false") }
    },
  }}
/>

<script>
  let {answer = "false", ready = false, error = "", choice = "", editing = false} = $props()
  let message = $derived(error || (!ready ? "Loading answers…" : choice ? (choice === answer ? "Correct!" : "Try again.") : ""))
  function choose(event, value) { event.currentTarget.getRootNode().host.chooseAnswer(value) }
</script>

<slot><p>Add a question.</p></slot>
<div class="controls" hidden={editing}>
  <button type="button" value="true" disabled={!ready} onclick={event => choose(event, "true")}>True</button>
  <button type="button" value="false" disabled={!ready} onclick={event => choose(event, "false")}>False</button>
</div>
<p class="author-hint" hidden={!editing}>Edit the question and correct answer, then use Preview.</p>
<output aria-live="polite">{message}</output>

<style>
  :host {
    display: block; box-sizing: border-box;
    max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
    min-inline-size: 0; margin-inline: auto; padding: 1rem;
    border: 1px solid #cbd5e1; border-radius: .5rem;
    background: white; color: #1f2937; container-type: inline-size;
    overflow-wrap: anywhere;
  }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; }
  .controls[hidden], .author-hint[hidden] { display: none; }
  button { font: inherit; padding: .5rem .9rem; max-inline-size: 100%; }
  button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  output { display: block; min-block-size: 1.5em; margin-block-start: .75rem; }
</style>
