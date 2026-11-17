import { css, html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { Drag, type DragCommitDetail } from "@webwriter/lit/drag";
import { Shortcuts } from "@webwriter/lit/shortcuts";
import { Viewport } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";

export type Chip = { id: string; x: number; y: number };

/** The extent of the board: what fit shows and panning is limited to. */
export const BOARD = { x: 0, y: 0, width: 1200, height: 800 };

/**
 * A board in the canvas form of Viewport with a sidebar beside it. A chip is
 * dragged from the sidebar onto the board: the board is a point target in
 * world coordinates (`data-ww-drop-space="world"`), so the commit says where
 * in the world the chip lands, under the pan and zoom of the view. The view
 * pans when the pointer is held at the edge of the board during the drag. The
 * sidebar is not part of the viewport and can cover its left side: the fit
 * leaves it free (`data-ww-viewport-fit-inset`).
 */
export class WorldView extends ExampleElement {
    static properties = { grid: { type: Number }, drawer: { type: Boolean }, chips: { state: true } };

    static actions = { fit: { label: { _: "Fit" }, shortcut: "F" } };

    static styles = css`
        :host { display: flex; width: 640px; height: 260px; }
        .side { width: 120px; padding: 6px; box-sizing: border-box; border: 1px solid #c8c8c8; }
        .chip { width: 60px; padding: 4px; margin-bottom: 4px; border: 1px solid #555; background: #fff; cursor: grab; touch-action: none; }
        .board { position: relative; flex: 1; min-width: 0; overflow: hidden; border: 1px solid #c8c8c8; background: #f4f4f5; }
        .board:focus-visible { outline: 2px solid Highlight; }
        .world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
        .placed { position: absolute; width: 60px; height: 30px; box-sizing: border-box; border: 1px solid #555; background: #bfdbfe; }
        .controls { position: absolute; right: 6px; top: 6px; }
        [data-ww-drop-over] { background-color: #e0f2fe; }
    `;

    declare grid: number;
    declare drawer: boolean;
    declare chips: Chip[];

    readonly viewport = new Viewport(this, { bounds: () => BOARD, margin: 0 });
    // The viewport is the one that converts the pointer's place into the world's.
    readonly #drag = new Drag(this, { viewport: this.viewport.core });
    readonly #shortcuts = new Shortcuts(this);
    /** What the last commit reported, for the checks. */
    lastDrop: { x: number | null; y: number | null; key: string | undefined } | null = null;

    constructor() {
        super();
        this.grid = 0;
        this.drawer = false;
        this.chips = [];
    }

    /** The widget action behind the key `F`. */
    fit() {
        void this.viewport.fit();
    }

    #drop(event: CustomEvent<DragCommitDetail>) {
        const { x, y, key } = event.detail;
        this.lastDrop = { x, y, key };
        if (x === null || y === null) return;
        this.chips = [...this.chips, { id: `c${this.chips.length}`, x, y }];
    }

    render() {
        const { x, y, scale } = this.viewport;
        const world = { transform: `translate(${x}px, ${y}px) scale(${scale})` };
        return html`
            <div class="side">
                <div class="chip" data-ww-drag="chip" data-ww-drag-effect="copy" data-ww-key="and" data-ww-label="AND" tabindex="0">AND</div>
            </div>
            <div
                class="board"
                data-ww-viewport="canvas"
                data-ww-viewport-zoom="0.25 4"
                data-ww-viewport-fit-inset=${this.drawer ? "0 0 0 100" : "0"}
                data-ww-drop="chip"
                data-ww-drop-position="point"
                data-ww-drop-space="world"
                data-ww-drop-grid=${this.grid || "0"}
                aria-label="Board"
                @ww-dragcommit=${this.#drop}
            >
                <div class="world" style=${styleMap(world)}>
                    ${repeat(this.chips, (chip) => chip.id, (chip) => html`<div class="placed" style="left: ${chip.x}px; top: ${chip.y}px"></div>`)}
                </div>
                <span class="controls" data-ww-viewport-controls></span>
            </div>
        `;
    }
}
customElements.define("ww-world-view", WorldView);
