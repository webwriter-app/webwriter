import { css, html, nothing } from "lit";
import { transaction } from "@webwriter/widget/transaction";
import { Drag } from "@webwriter/lit/drag";
import { Permissions } from "@webwriter/lit/permissions";
import { ExampleElement } from "../shared/base";
import "../shared/sort-item";

/**
 * A list whose authored children a reader may reorder if the author allows it.
 * The children stay in the light DOM; the module moves them on release.
 */
export class SortList extends ExampleElement {
    static properties = {
        allowReordering: { type: Boolean, attribute: "allow-reordering", reflect: true },
    };

    static permissions = {
        allowReordering: { label: { _: "Learners may reorder the items in this widget" } },
    };

    static styles = css`
        :host { display: block; }
        .list { display: flex; flex-direction: column; gap: 0.5rem; }
        button { margin-top: 0.75rem; }
    `;

    declare allowReordering: boolean;

    readonly #permissions = new Permissions(this);
    readonly #drag = new Drag(this, { can: () => this.#permissions.can("allowReordering") });

    /** Author action: one undo step for the whole reordering. */
    sort() {
        transaction(this, () => {
            const sorted = [...this.children].sort((a, b) => (a.textContent ?? "").localeCompare(b.textContent ?? ""));
            this.append(...sorted);
        });
    }

    render() {
        // The marker is rendered only while the permission holds, so readers who may not
        // reorder keep touch scrolling on the items.
        const kind = this.#permissions.can("allowReordering") ? "item" : nothing;
        return html`
            <div class="list" data-ww-drop="item" data-ww-drop-position="index" data-ww-label="List">
                <slot data-ww-drag=${kind} data-ww-drag-handle></slot>
            </div>
            <button data-ww-can="edit" @click=${this.sort}>Sort A–Z</button>
        `;
    }
}
customElements.define("ww-sort-list", SortList);
