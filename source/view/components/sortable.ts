import {property, query, customElement} from "lit/decorators.js"
import {LitElement, html} from "lit"
import SortableJS, {SortableOptions} from "sortablejs"

@customElement("ww-sortable")
export class Sortable extends LitElement {

  @query("[part=base]")
  base: Sortable

  @query("slot")
  slotElement: HTMLSlotElement

  sortable: SortableJS

  @property({type: Object})
  options: Omit<SortableOptions, `on${string}`>

  firstUpdated() {
    const handlerNames = ["onChoose", "onUnchoose", "onStart", "onEnd", "onAdd", "onUpdate", "onSort", "onRemove", "onFilter", "onMove", "onClone", "onChange"] 
    const handlerEntries = handlerNames.map(n => [n, e => new CustomEvent(n.toLowerCase().slice(2), {composed: true, bubbles: true, detail: e})])
    const handlers = Object.fromEntries(handlerEntries)
    this.sortable = new SortableJS(this.slotElement, {...this.options, ...handlers}) 
  }



  render() {
    return html`
      <div part="base">
        <slot></slot>
      </div>
    `
  }
}

