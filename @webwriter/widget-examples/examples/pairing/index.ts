import { css, html, nothing, svg } from "lit";
import { transaction } from "@webwriter/widget/transaction";
import { Drag, type DragCommitDetail, type DragPickDetail } from "@webwriter/lit/drag";
import { ExampleElement } from "../shared/base";

const TERMS = [
    { id: "cell", text: "Cell" },
    { id: "gene", text: "Gene" },
    { id: "enzyme", text: "Enzyme" },
];
const DEFINITIONS = [
    { id: "enzyme", text: "A protein that speeds up a reaction" },
    { id: "cell", text: "The smallest unit of life" },
    { id: "organ", text: "A group of tissues with one function" },
    { id: "gene", text: "A stretch of DNA that codes for a product" },
];

/**
 * A matching exercise: a reader links each term to a definition. Nothing is
 * lifted; Drag draws a connector while a link is made and the widget draws
 * the links it has. A definition takes one term (`data-ww-drop-max="1"`);
 * with `replace` a new link pushes the old one out. After "Check", a pairing
 * that was wrong can no longer be chosen for that term: the `ww-dragpick`
 * handler takes it out of the candidates.
 */
export class Pairing extends ExampleElement {
    static properties = {
        links: { type: Object, reflect: true },
        replace: { type: Boolean, reflect: true },
        rejected: { state: true },
    };

    static styles = css`
        :host { display: block; }
        .board { position: relative; display: grid; grid-template-columns: 1fr 2fr; gap: 0.5rem 4rem; }
        ul { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; align-content: start; }
        .term, .definition { box-sizing: border-box; width: 100%; font: inherit; text-align: start; padding: 0.4rem 0.6rem; border: 1px solid #888; border-radius: 6px; background: Canvas; color: CanvasText; }
        .term { cursor: grab; }
        .definition small { display: block; opacity: 0.7; }
        .definition small button { font: inherit; margin-inline-start: 0.25rem; }
        svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
        line { stroke: #555; stroke-width: 2; }
        [data-ww-dragging] { outline: 2px solid Highlight; }
        [data-ww-drop-candidate] { border-style: dashed; border-color: Highlight; }
        [data-ww-drop-over] { background: color-mix(in srgb, Highlight 15%, Canvas); }
        :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
        .hint { margin: 0 0 0.5rem; }
        .check { margin-top: 0.75rem; }
    `;

    /** Term id → definition id. */
    declare links: Record<string, string>;
    /** A new link to a definition that has one replaces it. Otherwise a linked definition takes no other term. */
    declare replace: boolean;
    /** Term id → the definitions that were marked wrong for it. */
    declare rejected: Record<string, string[]>;

    // There is nothing to gate here: linking is the exercise.
    readonly #drag = new Drag(this);
    #resized = new ResizeObserver(() => this.#draw());

    constructor() {
        super();
        this.links = {};
        this.replace = false;
        this.rejected = {};
    }

    connectedCallback() {
        super.connectedCallback();
        this.#resized.observe(this);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.#resized.disconnect();
    }

    /**
     * Changes the links outside a drag as one undo step. The step lasts until the render: Lit
     * writes the `links` attribute, which is what the document keeps, only then.
     */
    #write(links: Record<string, string>) {
        transaction(this, async () => {
            this.links = links;
            await this.updateComplete;
        });
    }

    /** Marks the wrong pairings: they are removed and cannot be chosen again. */
    check() {
        const links = { ...this.links };
        const rejected = { ...this.rejected };
        for (const [term, definition] of Object.entries(links)) {
            if (term === definition) continue;
            rejected[term] = [...(rejected[term] ?? []), definition];
            delete links[term];
        }
        this.rejected = rejected;
        // Nothing was wrong: nothing is written, and there is no undo step.
        if (Object.keys(links).length !== Object.keys(this.links).length) this.#write(links);
    }

    /** A constraint that depends on the dragged term and the model together. */
    #pick(event: CustomEvent<DragPickDetail>) {
        const refused = this.rejected[event.detail.key ?? ""] ?? [];
        event.detail.candidates = event.detail.candidates.filter((target) => !refused.includes(target.dataset.id!));
    }

    #link(event: CustomEvent<DragCommitDetail>) {
        const { key, target, displaced } = event.detail;
        const links = { ...this.links };
        // The term a full definition hands back loses its link.
        if (displaced?.dataset.wwKey) delete links[displaced.dataset.wwKey];
        links[key!] = target.dataset.id!;
        this.links = links;
    }

    #unlink(term: string) {
        const { [term]: _, ...links } = this.links;
        this.#write(links);
    }

    updated() {
        this.#draw();
    }

    /** The links are lines between the boxes, measured after the layout. */
    #draw() {
        const board = this.renderRoot.querySelector<HTMLElement>(".board");
        if (!board) return;
        const frame = board.getBoundingClientRect();
        const scale = frame.width / board.offsetWidth || 1;
        for (const line of board.querySelectorAll<SVGLineElement>("line")) {
            const from = board.querySelector(`.term[data-ww-key="${line.dataset.term}"]`)!.getBoundingClientRect();
            const to = board.querySelector(`.definition[data-id="${this.links[line.dataset.term!]}"]`)!.getBoundingClientRect();
            const ends = { x1: from.right, y1: from.top + from.height / 2, x2: to.left, y2: to.top + to.height / 2 };
            for (const [name, value] of Object.entries(ends)) {
                line.setAttribute(name, String((value - (name.startsWith("x") ? frame.left : frame.top)) / scale));
            }
        }
    }

    render() {
        const termOf = (definition: string) => TERMS.find((term) => this.links[term.id] === definition);
        const linking = TERMS.find((term) => term.id === this.#drag.item?.dataset.wwKey);
        return html`
            <p class="hint">${linking ? `Choose the definition of “${linking.text}”.` : "Link each term to its definition."}</p>
            <div class="board">
                <ul @ww-dragpick=${this.#pick}>
                    ${TERMS.map((term) => html`<li><button class="term" data-ww-drag="term" data-ww-drag-effect="link" data-ww-key=${term.id}>${term.text}</button></li>`)}
                </ul>
                <ul @ww-dragcommit=${this.#link}>
                    ${DEFINITIONS.map((definition) => {
                        const term = termOf(definition.id);
                        return html`<li
                            class="definition"
                            data-id=${definition.id}
                            data-ww-drop="term"
                            data-ww-drop-max="1"
                            data-ww-drop-full=${this.replace ? "swap" : nothing}
                            data-ww-drop-linked=${term?.id ?? nothing}
                            data-ww-label=${definition.text}
                        >
                            ${definition.text}
                            ${term ? html`<small>${term.text}<button aria-label=${`Remove the link to ${term.text}`} @click=${() => this.#unlink(term.id)}>×</button></small>` : nothing}
                        </li>`;
                    })}
                </ul>
                <svg aria-hidden="true">${Object.keys(this.links).map((term) => svg`<line data-term=${term}></line>`)}</svg>
            </div>
            <button class="check" @click=${this.check}>Check</button>
        `;
    }
}
customElements.define("ww-pairing", Pairing);
