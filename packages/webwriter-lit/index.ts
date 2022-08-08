import {LitElement} from "lit"
import { property } from "lit/decorators.js"
import {ScopedElementsMixin} from "@open-wc/scoped-elements"

import {BlockElement} from "webwriter-model"

class LitElementWwUnscoped extends LitElement implements BlockElement {

  static shadowRootOptions = {...LitElement.shadowRootOptions, delegatesFocus: true}
  
  /**WebWriter API: If true, render the component such that easy printing is possible. */
  @property({type: Boolean, attribute: true, reflect: true})
  printable: boolean

  /**WebWriter API: If true, allow user interaction to change the component. */
  @property({type: Boolean, attribute: true, reflect: true})
  editable: boolean

  /**WebWriter API: If true, emit DOM events enriched with xAPI statements. */
  @property({type: Boolean, attribute: true, reflect: true})
  analyzable: boolean

  connectedCallback() {
    super.connectedCallback()
    this.getAttributeNames().forEach(n => this.setAttribute(n, this.getAttribute(n)))
  }
}

/**WebWriter API: Minimal base class for a widget implemented in Lit. Implements the core properties required by WebWriter, initializes the component when loaded and provides a Scoped Custom Element Registry (@open-wc/scoped-elements) to help with namespace conflicts when using other components in this widget. */
export const LitElementWw = ScopedElementsMixin(LitElementWwUnscoped)