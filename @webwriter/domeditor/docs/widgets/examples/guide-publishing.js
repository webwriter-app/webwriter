import {LitElementWw, WidgetDrawer} from "@webwriter/lit"
import {css, html} from "lit"

class WwFieldJournal extends LitElementWw {
  static scopedElements = {"ww-widget-drawer": WidgetDrawer}
  static properties = {note: {state: true}}
  static styles = css`
    :host { display: block; font: 1rem/1.5 system-ui, sans-serif; }
    label { display: block; font-weight: 650; margin-block-end: .35rem; }
    textarea { box-sizing: border-box; display: block; font: inherit; min-height: 8rem; padding: .65rem; resize: vertical; width: 100%; }
    textarea:focus-visible { outline: 3px solid #255ec7; outline-offset: 2px; }
  `

  constructor() {
    super()
    this.note = ""
  }

  dataChanged(rawText) {
    try {
      const value = JSON.parse(rawText || "{}")
      this.note = typeof value.note === "string" ? value.note : ""
    } catch {
      this.note = ""
    }
  }

  save(event) {
    if(!this.dataReady || this.editable) return
    let value = {}
    try { value = JSON.parse(this.data || "{}") } catch {}
    this.data = JSON.stringify({...value, note: event.target.value})
  }

  render() {
    return html`
      <label for="note">Field note</label>
      <textarea id="note" .value=${this.note} @input=${this.save}></textarea>
      <ww-widget-drawer .widget=${this}></ww-widget-drawer>
    `
  }
}

export function mount(root) {
  const widget = document.createElement("ww-field-journal")
  widget.id = "garden-notes"
  widget.setAttribute("standalone", "")
  const data = document.createElement("script")
  data.type = "application/json"
  data.slot = "data"
  data.textContent = JSON.stringify({note: "Watch the first crocus open."})
  widget.append(data)
  root.replaceChildren(widget)
  if(!customElements.get("ww-field-journal")) {
    customElements.define("ww-field-journal", WwFieldJournal)
  }
  return widget
}
