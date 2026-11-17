import { css, html, nothing, svg } from "lit";
import { PointerGesture } from "@webwriter/widget/gesture";
import { transaction } from "@webwriter/widget/transaction";
import { Help } from "@webwriter/lit/help";
import { Permissions } from "@webwriter/lit/permissions";
import { Viewport } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";
import "./canvas-view";
import "./tool-panel";

const WORLD = { width: 1200, height: 800 };

/**
 * A diagram larger than the widget. Viewport makes the stage a zoomable scroll
 * container and renders the zoom buttons. Help explains the toolbar, the stage
 * and the zoom buttons from the texts written on them. An author drags the
 * nodes: the widget claims the press and reads the drag in world coordinates.
 */
export class DiagramView extends ExampleElement {
    static properties = {
        nodes: { type: String, reflect: true },
        allowPanning: { type: Boolean, attribute: "allow-panning", reflect: true },
    };

    static permissions = {
        allowPanning: { label: { _: "Learners may pan and zoom the diagram" } },
    };

    static styles = css`
        :host { position: relative; display: flex; flex-direction: column; height: 360px; border: 1px solid #c8c8c8; border-radius: 6px; overflow: hidden; font: 14px system-ui, sans-serif; }
        .toolbar { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid #c8c8c8; }
        .toolbar button { min-width: 40px; height: 28px; }
        .spacer { flex: 1; }
        .stage { flex: 1; min-height: 0; background: #f4f4f5; }
        .stage:focus-visible { outline: 2px solid Highlight; outline-offset: -2px; }
        .world { display: block; background: white; }
        /* The grid covers the world. Without this it would be the target of every press, and no press would be on empty background. */
        .grid { pointer-events: none; }
        .node { fill: #dbeafe; stroke: #1d4ed8; stroke-width: 2; }
        :host([contenteditable]) .node { cursor: grab; }
        .corner { position: absolute; right: 10px; bottom: 10px; }
    `;

    /** Authored: the nodes as "x,y x,y". */
    declare nodes: string;
    declare allowPanning: boolean;

    readonly #permissions = new Permissions(this);
    readonly viewport = new Viewport(this, {
        can: () => this.#permissions.can("allowPanning"),
        canSave: () => this.#permissions.editing,
    });
    readonly help = new Help(this);
    /** A node that is being dragged, at its position under the pointer. Nothing is written until the release. */
    #moving: { index: number; x: number; y: number } | null = null;

    constructor() {
        super();
        this.nodes = "150,150 600,400 1050,650";
    }

    get points(): { x: number; y: number }[] {
        return this.nodes.split(/\s+/).filter(Boolean).map((pair) => pair.split(",").map(Number)).map(([x, y]) => ({ x, y }));
    }

    /** Adds a node in the middle of what the stage shows now. */
    add() {
        const stage = this.renderRoot.querySelector<HTMLElement>(".stage")!;
        const rect = stage.getBoundingClientRect();
        const { x, y } = this.viewport.toWorld(rect.left + stage.clientLeft + stage.clientWidth / 2, rect.top + stage.clientTop + stage.clientHeight / 2);
        this.#write(`${this.nodes} ${Math.round(x)},${Math.round(y)}`.trim());
    }

    /**
     * Changes what the document keeps as one undo step. The step lasts until the render: Lit
     * writes the attribute only then.
     */
    #change(change: () => void) {
        transaction(this, async () => {
            change();
            await this.updateComplete;
        });
    }

    #write(nodes: string) {
        this.#change(() => (this.nodes = nodes));
    }

    /** Lets learners pan and zoom the diagram, or takes that away again. */
    unlock() {
        this.#change(() => (this.allowPanning = !this.allowPanning));
    }

    removeLast() {
        this.#write(this.nodes.split(/\s+/).slice(0, -1).join(" "));
    }

    /**
     * An author's press on a node. `preventDefault()` claims it, so Viewport does
     * not pan, and Viewport's own claim (Space or the middle button) is respected.
     * `convert` delivers the drag in world coordinates, whatever the view does meanwhile.
     */
    async #drag(event: PointerEvent, index: number) {
        if (event.button !== 0 || event.defaultPrevented || !this.#permissions.can("edit")) return;
        event.preventDefault();
        const start = this.points[index];
        const gesture = new PointerGesture(this.renderRoot.querySelector<HTMLElement>(".stage")!, event, { convert: this.viewport.toWorld });
        for await (const { dx, dy } of gesture) {
            this.#moving = { index, x: Math.round(start.x + dx), y: Math.round(start.y + dy) };
            this.requestUpdate();
        }
        const moved = this.#moving;
        this.#moving = null;
        if (!moved || gesture.cancelled) return this.requestUpdate();
        const points = this.points.map((point, i) => (i === index ? moved : point));
        this.#write(points.map(({ x, y }) => `${x},${y}`).join(" "));
    }

    render() {
        const moving = this.#moving;
        const points = this.points.map((point, i) => (moving?.index === i ? moving : point));
        return html`
            <div class="toolbar" role="toolbar">
                <button @click=${this.add} data-ww-help="Add a node in the middle of the view">Add</button>
                ${points.length ? html`<button @click=${this.removeLast} data-ww-help="Remove the newest node">Remove</button>` : nothing}
                <button data-ww-can="edit" @click=${this.unlock} aria-pressed=${this.allowPanning} data-ww-help="Let learners pan and zoom">
                    Unlock
                </button>
                <span class="spacer"></span>
                <button data-ww-help-toggle data-ww-help="Help" aria-label="Help">?</button>
            </div>
            <div
                class="stage"
                aria-label="Diagram"
                data-ww-viewport
                data-ww-viewport-zoom="0.25 3"
                data-ww-viewport-save="view"
                data-ww-help="Scroll to pan. Ctrl + scroll to zoom"
            >
                <svg class="world" width=${WORLD.width} height=${WORLD.height} viewBox="0 0 ${WORLD.width} ${WORLD.height}">
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#e4e4e7" /></pattern>
                    </defs>
                    <rect class="grid" width="100%" height="100%" fill="url(#grid)" />
                    ${points.map(({ x, y }, i) => svg`<circle class="node" cx=${x} cy=${y} r="30" @pointerdown=${(event: PointerEvent) => this.#drag(event, i)} />`)}
                </svg>
            </div>
            <div class="corner" data-ww-viewport-controls data-ww-help="Zoom and fit"></div>
        `;
    }
}
customElements.define("ww-diagram-view", DiagramView);
