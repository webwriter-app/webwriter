import {LitElement} from "lit"
import { property } from "lit/decorators.js"
import {ScopedElementsMixin} from "@open-wc/scoped-elements"

import {Block, BlockElement} from "webwriter-model"

class LitElementWwUnscoped extends LitElement implements BlockElement {
  @property({type: Boolean, attribute: true, reflect: true})
  printable: boolean

  @property({type: Boolean, attribute: true, reflect: true})
  editable: boolean

  @property({type: Boolean, attribute: true, reflect: true})
  editing: boolean

	@property({type: Boolean, attribute: true, reflect: true})
  onlineOnly: boolean

  @property({type: String, attribute: true, reflect: true})
  label: Block["attributes"]["label"]

	@property({type: String, attribute: true, reflect: true})
  author: string

	@property({type: String, attribute: true, reflect: true})
  license: string

  connectedCallback() {
    super.connectedCallback()
    this.getAttributeNames().forEach(name => this.setAttribute(name, this.getAttribute(name)))
  }
}

export const LitElementWw = ScopedElementsMixin(LitElementWwUnscoped)