// A list item with its own drag handle, used by both sort examples. It is a
// plain custom element: the handle lives in its (open) shadow root, so nothing
// is written into the authored document.
const template = document.createElement("template");
template.innerHTML = `
<style>
  :host { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border: 1px solid #c8c8c8; border-radius: 6px; background: Canvas; }
  /* The module cannot style inside this shadow root, so the item switches off touch scrolling on its handle itself. */
  button { all: unset; cursor: grab; padding: 0 0.25rem; touch-action: none; }
  button:focus-visible { outline: 2px solid Highlight; }
</style>
<button data-ww-drag-handle aria-label="Move">⠿</button><slot></slot>`;

export class SortItem extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }
}
if (!customElements.get("ww-sort-item")) customElements.define("ww-sort-item", SortItem);
