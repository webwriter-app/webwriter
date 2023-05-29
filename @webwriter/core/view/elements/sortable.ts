import { LitElement, css, html } from "lit"
import { customElement, query, property } from "lit/decorators.js"
import SortableJS, { SortableOptions } from "sortablejs"

@customElement("ww-sortable")
export class Sortable extends LitElement {

  @query("[part=base]")
  base: Sortable

  @query("slot")
  slotElement: HTMLSlotElement

  sortable: SortableJS

  @property({type: Object})
  options: Omit<SortableOptions, `on${string}`>

  static get styles() {
    return css`
      :host {
        display: contents;
      }
    `
  }

  firstUpdated() {
    const handlerNames = ["onChoose", "onUnchoose", "onStart", "onEnd", "onAdd", "onUpdate", "onSort", "onRemove", "onFilter", "onMove", "onClone", "onChange"] 
    const handlerEntries = handlerNames.map(n => [n, (e: any) => new CustomEvent(n.toLowerCase().slice(2), {composed: true, bubbles: true, detail: e})])
    const handlers = Object.fromEntries(handlerEntries)
    this.sortable = new SortableJS(this.slotElement, {...this.options, ...handlers}) 
  }



  render() {
    return html`<slot></slot>`
  }
}