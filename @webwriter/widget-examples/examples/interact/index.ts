// What a reader does in a Scene, and what the widget is told while and after: a board with wires
// between ports (capacity, taking an end of a wire to another port or off, picking a wire up by a click),
// nodes that are wired as a whole, items that are constrained (one axis, limits, edges to resize,
// a step for the keys), a group, and events for the preview of a move, a click, a context menu and a
// click on the background. The file registers it with the SVG renderer and, under another tag, with Pixi.
import { css, html, nothing } from "lit";
import { sceneElements, type ConnectDetail, type DisconnectDetail, type MoveDetail, type ReconnectDetail, type ResizeDetail, type SelectDetail } from "@webwriter/widget/scene";
import { PixiScene } from "@webwriter/widget/scene/pixi";
import { SceneController } from "@webwriter/lit/scene";
import { ExampleElement } from "../shared/base";

type Place = { x: number; y: number };
type Wire = { id: string; from: string; to: string };

/** The events the widget records, in the order they came. `seen` holds them as they were sent. */
export const EVENTS = [
    "ww-select", "ww-move", "ww-moving", "ww-resize", "ww-resizing", "ww-connect", "ww-connecting", "ww-reconnect", "ww-disconnect",
    "ww-activate", "ww-context", "ww-background", "ww-ready",
] as const;

export const BOARD = { width: 700, height: 440 };

export class Interact extends ExampleElement {
    static scopedElements: Record<string, CustomElementConstructor> = { ...sceneElements };

    static properties = {
        places: { attribute: false },
        sizes: { attribute: false },
        wires: { attribute: false },
        selection: { attribute: false },
        nodeLinks: { attribute: false },
        clickConnect: { attribute: false },
        step: { attribute: false },
        select: { attribute: false },
        grid: { attribute: false },
        refused: { attribute: false },
        locked: { attribute: false },
    };

    static styles = css`
        :host { display: block; font: 12px system-ui, sans-serif; --ww-scene-selection: rgb(200, 0, 120); }
        ww-scene { width: ${BOARD.width}px; height: ${BOARD.height}px; color: rgb(60, 60, 70); }
        ww-node { box-sizing: border-box; background: #fff; border: 1px solid #555; padding: 4px; }
        ww-node.net { border-radius: 8px; }
        ww-node[data-ww-link] { background: rgb(235, 245, 255); }
        .port { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: rgb(0, 120, 255); }
        .port.in { background: rgb(0, 160, 80); }
        .port.right { right: -7px; top: 23px; }
        .port.left { left: -7px; top: 23px; }
        .port.bottom { left: 43px; bottom: -7px; }
        .port[data-ww-port-candidate] { box-shadow: 0 0 0 3px rgba(255, 200, 0, 0.6); }
        .port[data-ww-port-over] { box-shadow: 0 0 0 3px rgb(255, 120, 0); }
        ww-path { stroke: rgb(40, 40, 40); stroke-width: 2px; }
        ww-path:state(rewiring) { opacity: 0.3; }
        ww-path.msg { stroke: rgb(0, 0, 160); }
        ww-shape { fill: rgb(220, 240, 220); stroke: rgb(0, 100, 0); stroke-width: 2px; }
        ww-group { fill: rgba(200, 200, 255, 0.3); stroke: rgb(0, 0, 160); }
        ww-scene::part(link) { stroke: rgb(255, 0, 0); stroke-width: 3px; }
    `;

    declare places: Record<string, Place>;
    declare sizes: Record<string, { width: number; height: number }>;
    declare wires: Wire[];
    declare selection: string[];
    /** The nodes n1 to n3 are wired as a whole. */
    declare nodeLinks: boolean;
    declare clickConnect: boolean;
    /** The step of the arrow keys, or 0 for the scene's own. */
    declare step: number;
    declare select: string;
    declare grid: number;
    /** Names of ports that start no wire, as the widget's `can` says. */
    declare refused: string[];
    /** The reader may connect nothing. */
    declare locked: boolean;

    /** Every event of the list `EVENTS` that reached the widget, as it was sent. */
    readonly seen: CustomEvent[] = [];

    readonly #scene: SceneController = new SceneController(this, {
        // The port is the third argument for a connection that starts or ends at one.
        can: (action, _item, port) => !(action === "connect" && (this.locked || (!!port && this.refused.includes((port as HTMLElement).dataset.wwPort ?? "")))),
    });

    constructor() {
        super();
        this.places = {
            a: { x: 40, y: 40 }, b: { x: 300, y: 40 }, c: { x: 300, y: 160 }, d: { x: 40, y: 160 },
            n1: { x: 500, y: 40 }, n2: { x: 500, y: 160 }, n3: { x: 600, y: 100 },
            lifeline: { x: 40, y: 320 }, msg: { x: 160, y: 340 }, act: { x: 420, y: 320 }, bar: { x: 520, y: 330 }, gp: { x: 160, y: 250 }, acts: { x: 330, y: 320 }, slot: { x: 400, y: 400 },
        };
        this.sizes = { act: { width: 40, height: 60 }, bar: { width: 80, height: 40 }, acts: { width: 30, height: 40 } };
        this.wires = [{ id: "w1", from: "a:out", to: "b:in" }, { id: "w2", from: "d:out", to: "c:in" }, { id: "w3", from: "n1", to: "n2" }];
        this.selection = [];
        this.nodeLinks = true;
        this.clickConnect = false;
        this.step = 0;
        this.select = "multiple";
        this.grid = 0;
        this.refused = [];
        this.locked = false;
        for (const type of EVENTS) {
            this.addEventListener(type, (event) => {
                this.seen.push(event as CustomEvent);
                (this as unknown as Record<string, (event: CustomEvent) => void>)[`on${type}`]?.call(this, event as CustomEvent);
            });
        }
    }

    get scene(): SceneController {
        return this.#scene;
    }

    /** The events of one type, as they were sent. */
    of(type: string): CustomEvent[] {
        return this.seen.filter((event) => event.type === type);
    }

    ["onww-select"](event: CustomEvent<SelectDetail>) {
        this.selection = event.detail.keys;
    }

    ["onww-move"](event: CustomEvent<MoveDetail>) {
        const places = { ...this.places };
        for (const { key, x, y } of event.detail.items) places[key] = { x, y };
        this.places = places;
    }

    ["onww-resize"](event: CustomEvent<ResizeDetail>) {
        const { key, x, y, width, height } = event.detail;
        this.places = { ...this.places, [key]: { x, y } };
        this.sizes = { ...this.sizes, [key]: { width, height } };
    }

    ["onww-connect"](event: CustomEvent<ConnectDetail>) {
        // A port that takes one wire takes the new one in place of the old.
        const { from, to } = event.detail;
        this.wires = [...this.wires, { id: `w${this.wires.length + 1}-${Date.now() % 1000}`, from, to }];
    }

    ["onww-reconnect"](event: CustomEvent<ReconnectDetail>) {
        const { path, from, to } = event.detail;
        this.wires = this.wires.map((wire) => (wire.id === path.getAttribute("data-ww-key") ? { ...wire, from, to } : wire));
    }

    ["onww-disconnect"](event: CustomEvent<DisconnectDetail>) {
        this.wires = this.wires.filter((wire) => wire.id !== event.detail.path.getAttribute("data-ww-key"));
    }

    render() {
        const at = (key: string) => this.places[key];
        const chosen = (key: string) => this.selection.includes(key);
        const link = this.nodeLinks ? "net" : undefined;
        return html`
            <ww-scene select=${this.select} grid=${this.grid || nothing} move-step=${this.step || nothing} ?connect-click=${this.clickConnect} aria-label="Interact">
                <ww-node data-ww-key="a" x=${at("a").x} y=${at("a").y} width="100" height="60" selectable movable ?selected=${chosen("a")}>a
                    <span class="port right" data-ww-port="out" data-ww-link="sig"></span></ww-node>
                <ww-node data-ww-key="b" x=${at("b").x} y=${at("b").y} width="100" height="60" selectable movable ?selected=${chosen("b")}>b (one wire)
                    <span class="port in left" data-ww-port="in" data-ww-accept="sig" data-ww-capacity="1"></span></ww-node>
                <ww-node data-ww-key="c" x=${at("c").x} y=${at("c").y} width="100" height="60" selectable movable ?selected=${chosen("c")}>c
                    <span class="port in left" data-ww-port="in" data-ww-accept="sig" data-ww-capacity="1"></span>
                    <span class="port in bottom" data-ww-port="free" data-ww-accept="sig"></span></ww-node>
                <ww-node data-ww-key="d" x=${at("d").x} y=${at("d").y} width="100" height="60" selectable movable ?selected=${chosen("d")}>d (two wires)
                    <span class="port right" data-ww-port="out" data-ww-link="sig" data-ww-capacity="2"></span></ww-node>

                ${this.wires.map((wire) => html`<ww-path data-ww-key=${wire.id} from=${wire.from} to=${wire.to} rewire marker-end="arrow" ?selected=${chosen(wire.id)} selectable></ww-path>`)}

                <ww-node class="net" data-ww-key="n1" x=${at("n1").x} y=${at("n1").y} width="80" height="50" outline="rounded" radius="8" data-ww-link=${link ?? nothing} data-ww-accept=${link ?? nothing} selectable movable ?selected=${chosen("n1")}>n1</ww-node>
                <ww-node class="net" data-ww-key="n2" x=${at("n2").x} y=${at("n2").y} width="80" height="50" outline="rounded" radius="8" data-ww-link=${link ?? nothing} data-ww-accept=${link ?? nothing} selectable movable ?selected=${chosen("n2")}>n2</ww-node>
                <ww-node class="net" data-ww-key="n3" x=${at("n3").x} y=${at("n3").y} width="80" height="50" outline="rounded" radius="8" data-ww-link=${link ?? nothing} data-ww-accept=${link ?? nothing} data-ww-capacity="1" selectable movable ?selected=${chosen("n3")}>n3 (one)</ww-node>

                <ww-node data-ww-key="lifeline" x=${at("lifeline").x} y=${at("lifeline").y} width="80" height="40" axis="x" min-x="20" max-x="120" selectable movable ?selected=${chosen("lifeline")}>lifeline</ww-node>
                <ww-path class="msg" data-ww-key="msg" x=${at("msg").x} y=${at("msg").y} .points=${[{ x: 0, y: 0 }, { x: 150, y: 0 }]} marker-end="arrow"
                    axis="y" min-y="300" max-y="400" selectable movable ?selected=${chosen("msg")}></ww-path>
                <ww-shape data-ww-key="act" kind="rect" x=${at("act").x} y=${at("act").y} width=${this.sizes.act.width} height=${this.sizes.act.height}
                    resizable="s" min-height="20" max-height="120" selectable ?selected=${chosen("act")}></ww-shape>
                <ww-node data-ww-key="bar" x=${at("bar").x} y=${at("bar").y} width=${this.sizes.bar.width} height=${this.sizes.bar.height}
                    resizable="e w" min-width="40" max-width="160" selectable movable ?selected=${chosen("bar")}>bar</ww-node>

                <ww-shape data-ww-key="acts" kind="rect" x=${at("acts").x} y=${at("acts").y} width=${this.sizes.acts.width} height=${this.sizes.acts.height}
                    resizable="n s" movable axis="y" bounds="330 300 30 100" min-height="15" selectable ?selected=${chosen("acts")}></ww-shape>
                <ww-node data-ww-key="slot" x=${at("slot").x} y=${at("slot").y} width="60" height="30" movable axis="x" grid="50" ?selected=${chosen("slot")}>slot</ww-node>

                <ww-group data-ww-key="gp" x=${at("gp").x} y=${at("gp").y} selectable movable ?selected=${chosen("gp")}>
                    <ww-node data-ww-key="m1" x="0" y="0" width="70" height="30" selectable>m1<button>ok</button></ww-node>
                    <ww-node data-ww-key="m2" x="90" y="0" width="70" height="30">m2</ww-node>
                </ww-group>
                <ww-shape data-ww-key="dot" kind="circle" x="660" y="400" r="15"></ww-shape>
            </ww-scene>
        `;
    }
}

export class SvgInteract extends Interact {}
customElements.define("ww-interact-svg", SvgInteract);

export class PixiInteract extends Interact {
    static scopedElements = { ...Interact.scopedElements, "ww-scene": PixiScene };
}
customElements.define("ww-interact-pixi", PixiInteract);

/**
 * The scene is in a component inside the widget, and the controller lives there. The undo step is opened on the
 * host that the editor knows when the controller says `undoHost`: here `"outermost"`, or a function.
 */
export class Inner extends ExampleElement {
    static scopedElements: Record<string, CustomElementConstructor> = { ...sceneElements };
    static properties = { x: { attribute: false } };
    static styles = css`
        :host { display: block; }
        ww-scene { width: 300px; height: 120px; }
        ww-node { box-sizing: border-box; border: 1px solid #555; background: #fff; }
    `;
    declare x: number;
    readonly scene: SceneController;

    constructor() {
        super();
        this.x = 20;
        this.scene = new SceneController(this, this.undo());
    }

    /** The options of the controller. */
    protected undo(): { undoHost?: "outermost" | (() => Element | null) } {
        return { undoHost: "outermost" };
    }

    #move = (event: CustomEvent<MoveDetail>) => {
        this.x = event.detail.items[0].x;
    };

    render() {
        return html`<ww-scene select="single" @ww-move=${this.#move}>
            <ww-node data-ww-key="n" x=${this.x} y="30" width="60" height="40" selectable movable>n</ww-node>
        </ww-scene>`;
    }
}
customElements.define("ww-interact-inner", Inner);

/** The same, with a function that finds the widget. */
export class InnerFunction extends Inner {
    protected undo() {
        return { undoHost: () => (this.getRootNode() as ShadowRoot).host };
    }
}
customElements.define("ww-interact-inner-function", InnerFunction);

/** The same, without `undoHost`: the step is opened on the component. */
export class InnerOwn extends Inner {
    protected undo() {
        return {};
    }
}
customElements.define("ww-interact-inner-own", InnerOwn);

export class Outer extends ExampleElement {
    static scopedElements = { "ww-interact-inner": Inner, "ww-interact-inner-function": InnerFunction, "ww-interact-inner-own": InnerOwn };
    static properties = { inner: { type: String } };
    declare inner: "outermost" | "function" | "own";
    constructor() {
        super();
        this.inner = "outermost";
    }
    render() {
        return this.inner === "function" ? html`<ww-interact-inner-function></ww-interact-inner-function>` : this.inner === "own" ? html`<ww-interact-inner-own></ww-interact-inner-own>` : html`<ww-interact-inner></ww-interact-inner>`;
    }
}
customElements.define("ww-interact-outer", Outer);
