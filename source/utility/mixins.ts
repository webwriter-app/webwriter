import {LitElement} from "lit"
import { property } from "lit/decorators.js"

import {Block, BlockElement} from "../model"

export class LitElementWw extends LitElement implements BlockElement {
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
}