import { css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { sceneElements, type ConnectDetail, type MoveDetail, type ResizeDetail, type SelectDetail } from "@webwriter/widget/scene";
import { transaction } from "@webwriter/widget/transaction";
import { Permissions } from "@webwriter/lit/permissions";
import { SceneController } from "@webwriter/lit/scene";
import { Viewport } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";

type Gate = { id: string; kind: "IN" | "AND" | "OR" | "NOT" | "OUT"; x: number; y: number; on?: boolean };
type Wire = { id: string; from: string; to: string; input: string };
type Note = { x: number; y: number; width: number; height: number; text: string };
export type CircuitModel = { gates: Gate[]; wires: Wire[]; note: Note; legend?: { x: number; y: number } };

const INPUTS: Record<Gate["kind"], string[]> = { IN: [], AND: ["a", "b"], OR: ["a", "b"], NOT: ["a"], OUT: ["a"] };
/** The size of the board, which is larger than the window that shows it. */
const BOARD = { width: 900, height: 500 };
const LEGEND = { x: 460, y: 210 };
/** A small picture of a live wire, drawn by `ww-image`. */
const BOLT = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0a8f5b" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>')}`;

const initial: CircuitModel = {
    gates: [
        { id: "in1", kind: "IN", x: 30, y: 40, on: true },
        { id: "in2", kind: "IN", x: 30, y: 130 },
        { id: "and", kind: "AND", x: 190, y: 80 },
        { id: "not", kind: "NOT", x: 340, y: 80 },
        { id: "out", kind: "OUT", x: 480, y: 80 },
    ],
    wires: [
        { id: "w1", from: "in1", to: "and", input: "a" },
        { id: "w2", from: "in2", to: "and", input: "b" },
        { id: "w3", from: "and", to: "not", input: "a" },
    ],
    note: { x: 190, y: 200, width: 180, height: 60, text: "Connect NOT to OUT." },
};

/**
 * A small logic circuit. The model is the reflected `model` property; the
 * template is the scene. Scene reports what the reader did, and the handlers
 * below change the model.
 */
export class Circuit extends ExampleElement {
    static scopedElements = { ...sceneElements };

    static properties = {
        model: { type: Object, reflect: true },
        allowEditing: { type: Boolean, attribute: "allow-editing", reflect: true },
        selection: { state: true },
        // How the wires are laid out. The authored circuit does not say: it is a choice of the page.
        wireRoute: { attribute: false },
    };

    static permissions = {
        allowEditing: { label: { _: "Learners may change the circuit" } },
    };

    static styles = css`
        :host { display: block; font: 13px system-ui, sans-serif; --wire: #8a8f98; --live: #0a8f5b; }
        :host(.dark) { --wire: #5b6270; --live: #4ade80; }
        .window { height: 302px; }
        ww-scene { width: ${BOARD.width}px; height: ${BOARD.height}px; border: 1px solid #c9ccd1; border-radius: 6px; color: #30343b; }
        ww-shape.board { fill: #f6f7f9; }
        ww-group.legend ww-shape { fill: #fff; stroke: #c9ccd1; stroke-width: 1px; }
        ww-group.legend ww-text { fill: #30343b; font-size: 12px; }
        ww-path { stroke: var(--wire); stroke-width: 2px; transition: stroke 0.2s; }
        ww-path.live { stroke: var(--live); }
        ww-path:state(hover) { stroke-width: 4px; }
        ww-path[selected] { stroke-dasharray: 6px, 3px; }
        ww-node { min-width: 64px; padding: 8px 14px; background: #fff; border: 1px solid #6b7280; border-radius: 6px; text-align: center; }
        ww-node.note { background: #fff8c5; border-color: #d4b106; text-align: left; }
        ww-node.note > div { height: 100%; overflow: hidden; }
        .port { position: absolute; width: 10px; height: 10px; margin: -5px; border-radius: 50%; background: #6b7280; top: 50%; }
        .port.in { left: 0; }
        .port.in.of2:nth-of-type(1) { top: 30%; }
        .port.in.of2:nth-of-type(2) { top: 70%; }
        .port.out { left: 100%; cursor: crosshair; }
        .port[data-ww-port-candidate] { background: #f59e0b; }
        .port[data-ww-port-over] { box-shadow: 0 0 0 4px #f59e0b66; }
        .port:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
        .bar { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem; }
    `;

    declare model: CircuitModel;
    declare allowEditing: boolean;
    declare selection: ReadonlySet<string>;
    declare wireRoute: "curve" | "orthogonal";

    readonly #permissions = new Permissions(this);
    // The board scrolls in its window, and Viewport zooms it from outside the scene.
    readonly #viewport = new Viewport(this);
    readonly #scene = new SceneController(this, {
        // Anyone may select. Changing the circuit is the author's to allow.
        can: { move: "allowEditing", resize: "allowEditing", connect: "allowEditing" },
    });

    /** The widget's viewport, for the page around it. */
    get view(): Viewport {
        return this.#viewport;
    }

    /** The widget's scene controller, for the page around it. */
    get scene(): SceneController {
        return this.#scene;
    }

    constructor() {
        super();
        this.model = initial;
        this.selection = new Set();
        this.wireRoute = "curve";
    }

    /** The value at a gate's output. */
    value(id: string, seen = new Set<string>()): boolean {
        const gate = this.model.gates.find((other) => other.id === id);
        if (!gate || seen.has(id)) return false;
        seen.add(id);
        const inputs = INPUTS[gate.kind].map((input) => {
            const wire = this.model.wires.find((other) => other.to === id && other.input === input);
            return wire ? this.value(wire.from, new Set(seen)) : false;
        });
        if (gate.kind === "IN") return !!gate.on;
        if (gate.kind === "NOT") return !inputs[0];
        return gate.kind === "OR" ? inputs.some(Boolean) : inputs.every(Boolean);
    }

    /** Widget action: removes the selected gates, their wires and the selected wires as one undo step. */
    deleteSelection() {
        if (!this.#permissions.can("allowEditing") || this.selection.size === 0) return;
        const gone = this.selection;
        transaction(this, async () => {
            const gates = this.model.gates.filter((gate) => !gone.has(gate.id));
            const wires = this.model.wires.filter((wire) => !gone.has(wire.id) && !gone.has(wire.from) && !gone.has(wire.to));
            this.model = { ...this.model, gates, wires };
            this.selection = new Set();
            await this.updateComplete;
        });
    }

    #select(event: CustomEvent<SelectDetail>) {
        // A listener further out may have refused the selection.
        if (!event.defaultPrevented) this.selection = new Set(event.detail.keys);
    }

    #move(event: CustomEvent<MoveDetail>) {
        const moved = new Map(event.detail.items.map((item) => [item.key, item]));
        const at = moved.get("note");
        const legend = moved.get("legend");
        this.model = {
            ...this.model,
            gates: this.model.gates.map((gate) => (moved.has(gate.id) ? { ...gate, x: moved.get(gate.id)!.x, y: moved.get(gate.id)!.y } : gate)),
            note: at ? { ...this.model.note, x: at.x, y: at.y } : this.model.note,
            ...(legend ? { legend: { x: legend.x, y: legend.y } } : {}),
        };
    }

    #resize(event: CustomEvent<ResizeDetail>) {
        const { x, y, width, height } = event.detail;
        this.model = { ...this.model, note: { ...this.model.note, x, y, width, height } };
    }

    #connect(event: CustomEvent<ConnectDetail>) {
        const [from] = event.detail.from.split(":");
        const [to, input] = event.detail.to.split(":");
        // Which connections are allowed is the widget's decision: no gate feeds itself.
        if (from === to) return void event.preventDefault();
        const wires = this.model.wires.filter((wire) => !(wire.to === to && wire.input === input));
        const id = `w${Math.max(0, ...this.model.wires.map((wire) => Number(wire.id.slice(1)))) + 1}`;
        this.model = { ...this.model, wires: [...wires, { id, from, to, input }] };
    }

    #toggle(id: string) {
        transaction(this, async () => {
            this.model = { ...this.model, gates: this.model.gates.map((gate) => (gate.id === id ? { ...gate, on: !gate.on } : gate)) };
            await this.updateComplete;
        });
    }

    render() {
        const { gates, wires, note, legend = LEGEND } = this.model;
        const selected = this.selection;
        const editing = this.#permissions.can("allowEditing");
        return html`
            <div class="window" data-ww-viewport data-ww-viewport-fit="none" data-ww-viewport-zoom="0.5 3" aria-label="Circuit board">
                <ww-scene select="multiple" grid="10" @ww-select=${this.#select} @ww-move=${this.#move} @ww-resize=${this.#resize} @ww-connect=${this.#connect}>
                    <ww-shape class="board" kind="rect" width=${BOARD.width} height=${BOARD.height}></ww-shape>
                    <ww-group class="legend" data-ww-key="legend" aria-label="Legend" x=${legend.x} y=${legend.y} movable>
                        <ww-shape kind="rect" width="120" height="40"></ww-shape>
                        <ww-image x="8" y="8" width="24" height="24" href=${BOLT}></ww-image>
                        <ww-text x="40" y="13">live wire</ww-text>
                    </ww-group>
                    ${wires.map(
                        (wire) => html`
                            <ww-path data-ww-key=${wire.id} from="${wire.from}:out" to="${wire.to}:${wire.input}" route=${this.wireRoute}
                                class=${this.value(wire.from) ? "live" : ""} selectable ?selected=${selected.has(wire.id)}></ww-path>`,
                    )}
                    ${repeat(gates, (gate) => gate.id, (gate) => html`
                            <ww-node data-ww-key=${gate.id} x=${gate.x} y=${gate.y} selectable movable ?selected=${selected.has(gate.id)}>
                                ${INPUTS[gate.kind].map((input, _, all) => html`<span class="port in ${all.length > 1 ? "of2" : ""}" data-ww-port=${input} data-ww-accept="wire"></span>`)}
                                ${gate.kind === "IN"
                                    ? html`<button @click=${() => this.#toggle(gate.id)} ?disabled=${!editing}>${gate.on ? "1" : "0"}</button>`
                                    : gate.kind === "OUT" ? html`OUT ${this.value(gate.id) ? "1" : "0"}` : gate.kind}
                                ${gate.kind === "OUT" ? nothing : html`<span class="port out" data-ww-port="out" data-ww-link="wire"></span>`}
                            </ww-node>`,
                    )}
                    <ww-node class="note" data-ww-key="note" x=${note.x} y=${note.y} width=${note.width} height=${note.height}
                        selectable movable resizable min-width="80" min-height="40" ?selected=${selected.has("note")}><div>${note.text}</div></ww-node>
                </ww-scene>
            </div>
            <div class="bar">
                <button id="delete" data-ww-can="allowEditing" ?disabled=${selected.size === 0} @click=${this.deleteSelection}>Delete selection</button>
                <small>${selected.size} selected</small>
                <span data-ww-viewport-controls></span>
            </div>
        `;
    }
}
customElements.define("ww-circuit", Circuit);
