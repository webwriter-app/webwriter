import "@shoelace-style/shoelace/dist/themes/light.css"
import SlTextarea from "@shoelace-style/shoelace/dist/components/textarea/textarea.component.js"
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import { html, css, LitElement } from "lit"
import { property, query, customElement } from "lit/decorators.js"
import { LitElementWw } from "@webwriter/lit";


@customElement("webwriter-textarea")
export default class WebwriterTextarea extends LitElementWw {

  static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true}

  @property({type: String, attribute: true, reflect: true})
  value: string

  @query("sl-textarea")
  textarea: SlTextarea

  setValue = (value: string) => this.value = value

  static scopedElements = {
    "sl-textarea": SlTextarea
  }

  static get styles() {
    return css`
      sl-textarea::part(textarea) {
        min-height: 2.5rem;
      }
      sl-input, sl-input::part(base) {
        display: inline-block;
        margin-bottom: 0.1rem;
      }
    `
  }

  render() {
    return html`
      <sl-textarea
        @sl-change=${e => this.setValue(e.target.value)}
        value=${this.value}
        resize="auto">
      </sl-textarea>
    `
  }
}