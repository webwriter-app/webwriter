import {LitElement, adoptStyles} from "lit"
import { property } from "lit/decorators.js"
import {ScopedElementsMixin} from "@open-wc/scoped-elements"

import {Widget} from "@webwriter/model"

/**WebWriter API: Minimal base class for a widget implemented in Lit. Implements the core properties required by WebWriter, initializes the component when loaded and provides a Scoped Custom Element Registry (@open-wc/scoped-elements) to help with namespace conflicts when using other components in this widget. */
export abstract class LitElementWw extends ScopedElementsMixin(LitElement) implements Widget {

  /**WebWriter API: If true, allow user interaction to change the component. */
  @property({type: String, attribute: true, reflect: true}) contentEditable: string

  connectedCallback() {
    super.connectedCallback()
    let styles = (this.constructor as typeof LitElement).styles
    styles = Array.isArray(styles)? styles: [styles]
    this.shadowRoot && adoptStyles(this.shadowRoot, styles as any)
    this.getAttributeNames().forEach(n => this.setAttribute(n, this.getAttribute(n)!))
  }
}