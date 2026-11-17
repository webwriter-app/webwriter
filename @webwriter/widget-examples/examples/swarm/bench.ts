// A scene with one of everything, for the checks of what the two renderers
// share. This file registers it with the SVG renderer; bench-pixi.ts registers
// the same class with the Pixi renderer.
import { css, html, nothing } from "lit";
import type { MessagesOption } from "@webwriter/widget/messages";
import { sceneElements, type ConnectDetail, type MoveDetail, type ResizeDetail, type SceneErrorDetail, type SceneMessages, type SelectDetail } from "@webwriter/widget/scene";
import { Permissions } from "@webwriter/lit/permissions";
import { SceneController } from "@webwriter/lit/scene";
import { Viewport } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";

/** A square of one colour: as a canvas, which is an image source, and as a URL. */
function swatch(colour: string, size = 20): HTMLCanvasElement {
    const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
    const context = canvas.getContext("2d")!;
    context.fillStyle = colour;
    context.fillRect(0, 0, size, size);
    return canvas;
}
export const RED_URL = swatch("rgb(200, 0, 0)").toDataURL();
export const BROKEN_URL = "data:image/png;base64,AAAA";

/** A component of its own inside a node. Its port is in its shadow root, and it renders by itself. */
export class Socket extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<style>:host { display: block; position: relative; height: 20px; } span { position: absolute; left: -12px; top: 6px; width: 8px; height: 8px; background: #555; }</style><span data-ww-port="deep" data-ww-accept="wire"></span>`;
    }

    /** Moves the port. Nothing outside the shadow root changes. */
    shift(top: number) {
        this.shadowRoot!.querySelector("span")!.setAttribute("style", `top: ${top}px`);
    }
}

const LINE = [{ x: 0, y: 0 }, { x: 200, y: 0 }];

type Place = { x: number; y: number };
type Wire = { id: string; from: string; to: string };

export class Bench extends ExampleElement {
    static scopedElements: Record<string, CustomElementConstructor> = { ...sceneElements, "ww-socket": Socket };

    static properties = {
        places: { attribute: false },
        selection: { attribute: false },
        wires: { attribute: false },
        note: { attribute: false },
        caption: { attribute: false },
        picture: { attribute: false },
        windowed: { type: Boolean },
        allowEditing: { type: Boolean, attribute: "allow-editing", reflect: true },
    };

    static permissions = { allowEditing: { label: { _: "Learners may change the scene" } } };

    static styles = css`
        :host { display: block; font: 12px system-ui, sans-serif; --ww-scene-selection: rgb(200, 0, 120); }
        ww-scene { width: 560px; height: 320px; }
        ww-scene::part(marquee) { stroke-dasharray: 3px, 2px; }
        ww-shape.board { fill: rgb(240, 240, 240); }
        ww-shape.under { fill: rgb(0, 0, 255); }
        ww-shape.over { fill: rgb(0, 128, 0); }
        ww-shape.crate { fill: rgb(255, 128, 0); }
        ww-shape.crate[selected] { fill: rgb(128, 0, 128); }
        ww-shape.pane { fill: rgb(220, 220, 255); stroke: rgb(0, 0, 120); stroke-width: 1px; }
        ww-path { stroke: rgb(40, 40, 40); stroke-width: 2px; }
        ww-path.line:state(hover) { stroke: rgb(255, 0, 0); }
        ww-text { fill: rgb(0, 0, 120); font-size: 14px; }
        ww-node { padding: 4px 10px; border: 1px solid #555; background: #fff; }
        ww-node.note { background: #fff8c5; }
        .port { position: absolute; width: 8px; height: 8px; margin: -4px; top: 50%; background: #555; }
        .port.out { left: 100%; }
        .port.in { left: 0; }
        .port.odd { left: 4px; top: 100%; }
        .port[data-ww-port-candidate] { background: orange; }
        .scroller { height: 24px; width: 60px; overflow: auto; }
        .scroller > div { height: 80px; position: relative; }
        .scroller .port { left: 0; top: 60px; }
    `;

    declare places: Record<string, Place>;
    declare selection: string[];
    declare wires: Wire[];
    declare note: { x: number; y: number; width: number; height: number };
    declare caption: string;
    /** `href` of the picture, so that a check can make it fail. */
    declare picture: string;
    /** Make the scene the window of a viewport that tracks its view, and follow it. */
    declare windowed: boolean;
    declare allowEditing: boolean;

    /** Every scene event in the order it arrived, as `type:what`. */
    readonly log: string[] = [];
    /** The errors the scene reported. */
    readonly errors: SceneErrorDetail[] = [];
    /** Set to refuse the next connection. */
    refuse = false;
    /** Entries that replace the module's texts. */
    texts: MessagesOption<SceneMessages> = {};
    readonly stamp = swatch("rgb(0, 0, 200)");

    readonly #permissions = new Permissions(this);
    readonly #viewport: Viewport = new Viewport(this, { bounds: () => this.#scene.extent(), can: () => !this.#scene.marquee });
    readonly #scene: SceneController = new SceneController(this, {
        can: { move: "allowEditing", resize: "allowEditing", connect: "allowEditing" },
        viewport: this.#viewport.core,
        messages: () => (typeof this.texts === "function" ? this.texts() : this.texts),
    });

    constructor() {
        super();
        this.places = {
            n1: { x: 40, y: 40 }, n2: { x: 220, y: 40 }, n3: { x: 220, y: 130 }, n4: { x: 360, y: 130 },
            line: { x: 260, y: 220 }, crate: { x: 40, y: 230 }, caption: { x: 120, y: 240 }, pic: { x: 180, y: 262 }, cluster: { x: 440, y: 40 },
        };
        this.selection = [];
        this.wires = [{ id: "wire1", from: "n1:out", to: "n2:in" }];
        this.note = { x: 40, y: 120, width: 120, height: 60 };
        this.caption = "caption";
        this.picture = RED_URL;
        this.windowed = false;
    }

    /** The widget's viewport, for the checks. */
    get view(): Viewport {
        return this.#viewport;
    }

    /** The widget's scene controller, for the checks. */
    get scene(): SceneController {
        return this.#scene;
    }

    #select(event: CustomEvent<SelectDetail>) {
        this.log.push(`select:${event.detail.keys.join()}`);
        this.selection = event.detail.keys;
    }

    #move(event: CustomEvent<MoveDetail>) {
        this.log.push(`move:${event.detail.items.map((item) => `${item.key}@${item.x},${item.y}`).join(";")}`);
        const places = { ...this.places };
        for (const { key, x, y } of event.detail.items) {
            if (key === "note") this.note = { ...this.note, x, y };
            else places[key] = { x, y };
        }
        this.places = places;
    }

    #resize(event: CustomEvent<ResizeDetail>) {
        const { x, y, width, height } = event.detail;
        this.log.push(`resize:${x},${y},${width},${height}`);
        this.note = { x, y, width, height };
    }

    #connect(event: CustomEvent<ConnectDetail>) {
        const { from, to, kind } = event.detail;
        this.log.push(`connect:${from}>${to}:${kind}`);
        if (this.refuse) return void event.preventDefault();
        this.wires = [...this.wires, { id: `wire${this.wires.length + 1}`, from, to }];
    }

    #error(event: CustomEvent<SceneErrorDetail>) {
        this.errors.push(event.detail);
        event.preventDefault();
    }

    render() {
        const at = (key: string) => this.places[key];
        const chosen = (key: string) => this.selection.includes(key);
        return html`
            <ww-scene select="multiple" grid="10" data-ww-viewport=${this.windowed ? "canvas" : nothing} data-ww-viewport-fit="none" aria-label="Bench"
                @ww-select=${this.#select} @ww-move=${this.#move} @ww-resize=${this.#resize} @ww-connect=${this.#connect} @ww-sceneerror=${this.#error}>
                <ww-shape data-ww-key="board" class="board" kind="rect" width="560" height="320"></ww-shape>
                <ww-shape data-ww-key="under" class="under" kind="rect" x="300" y="205" width="40" height="30"></ww-shape>
                <ww-path data-ww-key="line" class="line" x=${at("line").x} y=${at("line").y} .points=${LINE}
                    selectable movable ?selected=${chosen("line")}></ww-path>
                <ww-shape data-ww-key="over" class="over" kind="circle" x="400" y="220" r="14"></ww-shape>
                <ww-shape data-ww-key="crate" class="crate" kind="rect" x=${at("crate").x} y=${at("crate").y} width="50" height="30"
                    aria-label="Crate" selectable movable ?selected=${chosen("crate")}></ww-shape>
                <ww-text data-ww-key="caption" x=${at("caption").x} y=${at("caption").y} selectable movable ?selected=${chosen("caption")}>${this.caption}</ww-text>
                <ww-image data-ww-key="pic" x=${at("pic").x} y=${at("pic").y} width="32" height="32" href=${this.picture}
                    selectable movable ?selected=${chosen("pic")}></ww-image>
                <ww-image data-ww-key="stamp" x="230" y="262" .source=${this.stamp}></ww-image>
                <ww-group data-ww-key="cluster" aria-label="Cluster" x=${at("cluster").x} y=${at("cluster").y} selectable movable ?selected=${chosen("cluster")}>
                    <ww-shape data-ww-key="pane" class="pane" kind="rect" width="100" height="80"></ww-shape>
                    <ww-text data-ww-key="title" x="8" y="6">cluster</ww-text>
                    <ww-node data-ww-key="inner" x="20" y="40"><span class="port in" data-ww-port="in" data-ww-accept="wire"></span>inner</ww-node>
                </ww-group>
                <ww-path data-ww-key="hook" from="n1:out" to="n2:odd" route="curve"></ww-path>
                <ww-path data-ww-key="tether" from="n4:far" to="n3:deep"></ww-path>
                <ww-path data-ww-key="leash" from="n2:out" to="guarded:in"></ww-path>
                ${this.wires.map((wire) => html`<ww-path data-ww-key=${wire.id} from=${wire.from} to=${wire.to} route="curve" selectable ?selected=${chosen(wire.id)}></ww-path>`)}
                <ww-node data-ww-key="n1" aria-label="First" x=${at("n1").x} y=${at("n1").y} selectable movable ?selected=${chosen("n1")}>
                    N1<span class="port out" data-ww-port="out" data-ww-link="wire"></span>
                </ww-node>
                <ww-node data-ww-key="n2" x=${at("n2").x} y=${at("n2").y} selectable movable ?selected=${chosen("n2")}>
                    <span class="port in" data-ww-port="in" data-ww-accept="wire"></span>
                    <span class="port odd" data-ww-port="odd" data-ww-side="left"></span>
                    N2<span class="port out" data-ww-port="out" data-ww-link="wire"></span>
                </ww-node>
                <ww-node data-ww-key="n3" x=${at("n3").x} y=${at("n3").y} selectable movable ?selected=${chosen("n3")}>
                    N3<ww-socket></ww-socket>
                </ww-node>
                <ww-node data-ww-key="n4" x=${at("n4").x} y=${at("n4").y}>
                    <div class="scroller"><div><span class="port" data-ww-port="far" data-ww-accept="other"></span></div></div>
                </ww-node>
                <ww-node data-ww-key="guarded" data-ww-can="allowEditing" x="460" y="250"><span class="port in" data-ww-port="in" data-ww-accept="wire"></span>guarded</ww-node>
                <ww-node class="note" data-ww-key="note" x=${this.note.x} y=${this.note.y} width=${this.note.width} height=${this.note.height}
                    selectable movable resizable min-width="60" min-height="40" ?selected=${chosen("note")}>note</ww-node>
            </ww-scene>
            <span data-ww-viewport-controls></span>
        `;
    }
}

export class SvgBench extends Bench {}
customElements.define("ww-bench-svg", SvgBench);
