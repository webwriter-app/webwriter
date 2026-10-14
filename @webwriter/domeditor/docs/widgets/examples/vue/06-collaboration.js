import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import VueQuiz from "./06-collaboration.vue"

const VueQuizElement = defineCustomElement(VueQuiz)
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

class WwQuiz extends VueQuizElement {
  static observedAttributes = ["answer", "shared", "contenteditable"]
  static options = options
  static actions = actions

  _readyBlock = null
  _dataError = ""
  _dataObserver = null
  _lastBlock = null
  _viewRevision = 0

  constructor() {
    super()
    this._onDataChange = event => {
      if(event.target !== this.block) return
      this._readyBlock = event.target
      this._lastBlock = event.target
      this._dataError = ""
      this._notifyView()
    }
    this._onDataError = event => {
      if(event.target !== this.block) return
      this._readyBlock = null
      this._lastBlock = event.target
      this._dataError = event.detail?.message ?? "Could not load answers."
      this._notifyView()
    }
    this._onAuthoredStructureChange = records => {
      if(records.some(record =>
        record.target === this ||
        (record.type === "attributes" && record.target.parentElement === this))) {
        const currentBlock = this.block
        if(currentBlock !== this._lastBlock) {
          this._lastBlock = currentBlock
          this._readyBlock = null
          this._dataError = ""
        }
        this._notifyView()
      }
    }
    this.addEventListener("datachange", this._onDataChange)
    this.addEventListener("dataerror", this._onDataError)
  }

  get block() {
    return this.querySelector(':scope > script[type="application/json"][slot="data"]:not([src])')
  }

  get answer() { return this.getAttribute("answer") ?? "false" }
  set answer(value) { this.setAttribute("answer", value) }

  _notifyView() {
    this._viewRevision++
    this.dispatchEvent(new CustomEvent("quizrefresh"))
  }

  attributeChangedCallback(name, oldValue) {
    if(oldValue === this.getAttribute(name)) return
    if(name === "shared") {
      this._readyBlock = null
      this._dataError = ""
    }
    this._notifyView()
  }

  connectedCallback() {
    const currentBlock = this.block
    if(this._readyBlock !== currentBlock) {
      this._readyBlock = null
      this._dataError = ""
    }
    this._lastBlock = currentBlock
    this.addEventListener("datachange", this._onDataChange)
    this.addEventListener("dataerror", this._onDataError)
    this._dataObserver = new MutationObserver(this._onAuthoredStructureChange)
    this._dataObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["slot", "type", "src"],
    })
    super.connectedCallback()
    this._notifyView()
  }

  disconnectedCallback() {
    this.removeEventListener("datachange", this._onDataChange)
    this.removeEventListener("dataerror", this._onDataError)
    this._dataObserver?.disconnect()
    this._dataObserver = null
    this._readyBlock = null
    super.disconnectedCallback()
  }

  resetAnswer() { this.setAttribute("answer", "false") }
}

if(!customElements.get("ww-quiz")) customElements.define("ww-quiz", WwQuiz)
