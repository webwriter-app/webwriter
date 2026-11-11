import {WidgetDrawer} from "@webwriter/lit"
import {css, html} from "lit"
import {WwQuiz} from "../../docs/widgets/examples/lit/06-collaboration.js"

class StandaloneQuiz extends WwQuiz {
  static scopedElements = {"ww-widget-drawer": WidgetDrawer}
  static actions = {
    ...WwQuiz.actions,
    clearResponse: {label: "Clear response", confirm: "Clear this saved quiz response?"},
  }
  static convertFrom = {".json": "importResult"}
  static convertTo = {".json": "exportResult"}
  static styles = [WwQuiz.styles, css`
    .controls button { min-block-size: 3rem; }
    .controls button[aria-pressed="true"] { background: #dbeafe; border-color: #245a9c; }
    ww-widget-drawer { margin-block-start: .5rem; }
  `]

  clearResponse() {
    if(this.dataReady) this.data = JSON.stringify({choice: ""})
  }

  async importResult(file) {
    if(file.size > 8192) throw new Error("Choose a quiz result under 8 KiB.")
    let result
    try { result = JSON.parse(await file.text()) }
    catch { throw new Error("Choose a valid JSON quiz result.") }
    if(!["", "true", "false"].includes(result?.choice)) {
      throw new Error('A quiz result needs a choice of "", "true", or "false".')
    }
    return () => { this.data = JSON.stringify({choice: result.choice}) }
  }

  exportResult() {
    return new File([JSON.stringify({choice: this.choice})], "quiz-result.json", {type: "application/json"})
  }

  render() {
    return html`${super.render()}<ww-widget-drawer .widget=${this}></ww-widget-drawer>`
  }
}

customElements.define("ww-standalone-quiz", StandaloneQuiz)
