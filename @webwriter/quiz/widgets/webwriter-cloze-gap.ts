import {LitElement, html, css, RenderOptions} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators.js"

import SlInput from "@shoelace-style/shoelace/dist/components/input/input.component.js"
import { property } from "lit/decorators/property.js"
import { queryAsync } from "lit/decorators/query-async.js"
import "@shoelace-style/shoelace/dist/themes/light.css"

@customElement("webwriter-cloze-gap")
export class WebwriterClozeGap extends LitElementWw {

  static localization = {}

  @property({type: String, attribute: true, reflect: true})
  solution: string

  @property({type: String, attribute: true, reflect: true})
  value: string

  msg = (str: string) => this.lang in WebwriterClozeGap.localization? WebwriterClozeGap.localization[this.lang][str] ?? str: str

  
  static scopedElements = {
    "sl-input": SlInput
  }

  static styles = css`
    :host {
      display: inline-block !important;
    }
  `
  @queryAsync("sl-input")
  input: Promise<SlInput>

  async focus() {
    (await this.input).focus()
  }

  handleChange = (e: CustomEvent) => {
    const el = e.target as SlInput
    if(this.isContentEditable) {
      this.solution = el.value
    }
    else {
      this.value = el.value
    }
  }

  render() {
    return html`<sl-input size="small" value=${this.isContentEditable? this.solution: this.value} @sl-change=${this.handleChange}></sl-input>`
  }
}