import { html, css } from "lit"
import { property, query } from "lit/decorators.js"

import { LitElementWw } from "webwriter-lit"

export default class WwH5P extends LitElementWw {

  static get styles() {
    return css``
  }


  render() {
    return html`
      ${this.editable? null: null}
      ${this.printable? null: null}
    `
  }
}