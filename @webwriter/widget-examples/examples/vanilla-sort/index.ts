// The sort list again as a plain custom element: no Lit, only the cores.
import { DragCore } from "@webwriter/widget/drag";
import { PermissionsCore } from "@webwriter/widget/permissions";
import { transaction } from "@webwriter/widget/transaction";
import "../shared/sort-item";

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host { display: block; }
  .list { display: flex; flex-direction: column; gap: 0.5rem; }
  button { margin-top: 0.75rem; }
</style>
<div class="list" data-ww-drop="item" data-ww-drop-position="index" data-ww-label="List">
  <slot data-ww-drag="item" data-ww-drag-handle></slot>
</div>
<button data-ww-can="edit">Sort A–Z</button>`;

export class VanillaSort extends HTMLElement {
    // Without a Lit property the attribute would be "allowreordering", for the editor and for the module.
    // Naming it in the declaration tells both.
    static permissions = {
        allowReordering: { label: { _: "Learners may reorder the items in this widget" }, attribute: "allow-reordering" },
    };

    #permissions = new PermissionsCore(this);
    #drag = new DragCore(this, { can: () => this.#permissions.can("allowReordering") });
    #unsubscribe: (() => void) | null = null;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        root.querySelector("button")!.addEventListener("click", () => this.sort());
    }

    connectedCallback() {
        this.#permissions.connect();
        this.#drag.connect();
        // The template never re-renders, so tell Drag when a permission changed.
        this.#unsubscribe = this.#permissions.subscribe(() => this.#drag.refresh());
    }

    disconnectedCallback() {
        this.#unsubscribe?.();
        this.#drag.disconnect();
        this.#permissions.disconnect();
    }

    sort() {
        transaction(this, () => {
            const sorted = [...this.children].sort((a, b) => (a.textContent ?? "").localeCompare(b.textContent ?? ""));
            this.append(...sorted);
        });
    }
}
customElements.define("ww-vanilla-sort", VanillaSort);
