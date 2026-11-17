import { css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { Drag, type DragCommitDetail, type DragPickDetail } from "@webwriter/lit/drag";
import { Permissions } from "@webwriter/lit/permissions";
import { ExampleElement } from "../shared/base";

type Shape = { id: string; type: string; x: number; y: number };

const TYPES: Record<string, string> = { circle: "Circle", square: "Square", slider: "Slider" };

/**
 * A palette and a free canvas. A shape is dragged from the palette (a copy:
 * the button stays) onto the canvas, which resolves a point on a grid. Placed
 * shapes are moved the same way and deleted by a drop on the trash. A slider
 * only moves sideways. All of it also works with the keyboard and by a click
 * on the shape and then on the place.
 */
export class Palette extends ExampleElement {
    static properties = {
        shapes: { type: Array, reflect: true },
        allowArranging: { type: Boolean, attribute: "allow-arranging", reflect: true },
    };

    static permissions = {
        allowArranging: { label: { _: "Learners may place, move and delete shapes in this widget" } },
    };

    static styles = css`
        :host { display: block; }
        .palette { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
        .palette button { font: inherit; padding: 0.3rem 0.7rem; border: 1px solid #888; border-radius: 6px; background: Canvas; color: CanvasText; cursor: grab; }
        .canvas { position: relative; height: 240px; overflow: auto; border: 1px solid #888; background-image: radial-gradient(#bbb 1px, transparent 1px); background-size: 20px 20px; background-position: -10px -10px; }
        .shape { position: absolute; box-sizing: border-box; width: 40px; height: 40px; border: 2px solid #333; background: #9cf; cursor: grab; }
        .shape.circle { border-radius: 50%; }
        .shape.slider { width: 60px; height: 20px; border-radius: 10px; background: #fc6; cursor: ew-resize; }
        .trash { margin-top: 0.5rem; padding: 0.6rem; border: 1px dashed #888; border-radius: 6px; text-align: center; }
        [data-ww-dragging] { outline: 2px solid Highlight; }
        [data-ww-drop-candidate] { border-color: Highlight; }
        [data-ww-drop-over] { background-color: color-mix(in srgb, Highlight 15%, transparent); }
        :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
    `;

    declare shapes: Shape[];
    declare allowArranging: boolean;

    readonly #permissions = new Permissions(this);
    readonly #drag = new Drag(this, { can: () => this.#permissions.can("allowArranging") });

    constructor() {
        super();
        this.shapes = [];
    }

    /** A new shape goes only to the canvas: there is nothing to delete yet. */
    #pick(event: CustomEvent<DragPickDetail>) {
        const { detail } = event;
        if (detail.effect === "copy") detail.candidates = detail.candidates.filter((target) => !target.classList.contains("trash"));
    }

    /** The same commit creates a shape (a copy from the palette) or moves one. */
    #place(event: CustomEvent<DragCommitDetail>) {
        const { effect, item, key, x, y } = event.detail;
        if (x === null || y === null) return;
        if (effect === "copy") {
            const next = Math.max(0, ...this.shapes.map((shape) => Number(shape.id.slice(1)) || 0)) + 1;
            this.shapes = [...this.shapes, { id: `s${next}`, type: item.dataset.type!, x, y }];
        } else this.shapes = this.shapes.map((shape) => (shape.id === key ? { ...shape, x, y } : shape));
    }

    #remove(event: CustomEvent<DragCommitDetail>) {
        this.shapes = this.shapes.filter((shape) => shape.id !== event.detail.key);
    }

    render() {
        // The markers are rendered only while the permission holds, so nothing looks movable to a reader who may not move it.
        const kind = this.#permissions.can("allowArranging") ? "shape" : nothing;
        return html`
            <div class="palette" role="group" aria-label="Shapes" @ww-dragpick=${this.#pick}>
                ${Object.entries(TYPES).map(
                    ([type, name]) => html`<button data-ww-drag=${kind} data-ww-drag-effect="copy" data-ww-key=${`new-${type}`} data-type=${type}>${name}</button>`,
                )}
            </div>
            <div class="canvas" data-ww-drop="shape" data-ww-drop-position="point" data-ww-drop-grid="20" data-ww-label="Canvas" @ww-dragcommit=${this.#place}>
                ${repeat(
                    this.shapes,
                    (shape) => shape.id,
                    (shape) => html`<div
                        class="shape ${shape.type}"
                        role="img"
                        aria-label=${TYPES[shape.type] ?? shape.type}
                        data-ww-drag=${kind}
                        data-ww-key=${shape.id}
                        data-ww-drag-axis=${shape.type === "slider" ? "x" : nothing}
                        style=${styleMap({ left: `${shape.x}px`, top: `${shape.y}px` })}
                    ></div>`,
                )}
            </div>
            <div class="trash" data-ww-drop="shape" data-ww-label="Trash" @ww-dragcommit=${this.#remove}>Trash</div>
        `;
    }
}
customElements.define("ww-palette", Palette);
