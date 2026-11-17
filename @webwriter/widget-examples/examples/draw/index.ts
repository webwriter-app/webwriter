// A small diagram on the Scene module, with everything that Scene draws besides
// nodes: paths between whole nodes, bent and looped, with markers and labels,
// shapes and text with the styles that Scene reads, a background grid and a
// framed group. The file registers it with the SVG renderer and, under another
// tag, with the Pixi renderer.
import { css, html, nothing } from "lit";
import { sceneElements, type MoveDetail, type ResizeDetail, type SelectDetail } from "@webwriter/widget/scene";
import { PixiScene } from "@webwriter/widget/scene/pixi";
import { SceneController } from "@webwriter/lit/scene";
import { Viewport } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";

type Place = { x: number; y: number };
type Size = { width: number; height: number };

/** The shapes a marker can have, in the order of a row of short lines. */
export const MARKER_KINDS = ["arrow", "open-arrow", "triangle", "triangle-filled", "diamond", "diamond-filled", "circle", "circle-open"] as const;

/** The markers that are drawn hollow: with `--ww-scene-marker-fill` inside. */
const HOLLOW = new Set<string>(["triangle", "diamond", "circle-open"]);

export const BOARD = { width: 760, height: 490 };

export class Draw extends ExampleElement {
    static scopedElements: Record<string, CustomElementConstructor> = { ...sceneElements };

    static properties = {
        places: { attribute: false },
        sizes: { attribute: false },
        selection: { attribute: false },
        grid: { attribute: false },
        spacing: { attribute: false },
        windowed: { type: Boolean },
    };

    static styles = css`
        :host { display: block; font: 12px system-ui, sans-serif; --ww-scene-selection: rgb(200, 0, 120); }
        ww-scene { width: ${BOARD.width}px; height: ${BOARD.height}px; color: rgb(60, 60, 70); --ww-scene-grid-color: rgb(120, 120, 140); }
        ww-node { box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid #555; font-size: 12px; }
        ww-node.plain { border-radius: 0; }
        ww-path { stroke: rgb(40, 40, 40); stroke-width: 2px; }
        ww-path.thick { stroke-width: 6px; }
        ww-path.hollow { --ww-scene-marker-fill: rgb(255, 255, 255); }
        ww-path ww-text { font-size: 12px; fill: rgb(0, 0, 120); }
        ww-scene.alt ww-path ww-text { fill: rgb(200, 0, 0); }
        ww-path ww-text.pre { white-space: pre-line; line-height: 16px; }
        ww-path ww-text.boxed { background-color: rgb(255, 255, 200); padding: 2px 4px; border-radius: 3px; }
        ww-path:state(hover) { stroke: rgb(255, 0, 0); }
        ww-text { fill: rgb(0, 0, 120); font-size: 14px; }
        ww-text.pre { white-space: pre-line; line-height: 18px; }
        ww-text.halo { stroke: rgb(255, 255, 0); stroke-width: 4px; }
        ww-text.box { background-color: rgb(255, 230, 200); padding: 3px 6px 3px 10px; border-radius: 4px; }
        ww-text.mid { dominant-baseline: middle; }
        ww-text.end { text-anchor: end; }
        ww-shape { fill: rgb(220, 240, 220); stroke: rgb(0, 100, 0); stroke-width: 2px; }
        ww-group.net { fill: rgb(235, 235, 255); stroke: rgb(0, 0, 160); stroke-width: 1px; color: rgb(0, 0, 160); font-size: 12px; }
        ww-group.net ww-node { background: #fff; }
    `;

    declare places: Record<string, Place>;
    declare sizes: Record<string, Size>;
    declare selection: string[];
    /** `dots`, `lines` or nothing. */
    declare grid: string;
    declare spacing: number;
    /** Make the scene the window of a viewport that tracks its view. */
    declare windowed: boolean;

    /** Every move and resize the widget applied, as `type:what`. */
    readonly log: string[] = [];

    readonly #viewport: Viewport = new Viewport(this, { bounds: () => this.#scene.extent(), can: () => !this.#scene.marquee });
    readonly #scene: SceneController = new SceneController(this, { viewport: this.#viewport.core });

    constructor() {
        super();
        this.places = {
            a: { x: 40, y: 50 }, b: { x: 260, y: 50 }, c: { x: 480, y: 70 }, d: { x: 260, y: 190 }, h: { x: 480, y: 200 },
            e: { x: 40, y: 330 }, f: { x: 520, y: 330 }, g: { x: 270, y: 320 }, net: { x: 0, y: 0 },
        };
        this.sizes = { a: { width: 80, height: 40 } };
        this.selection = [];
        this.grid = "dots";
        this.spacing = 20;
        this.windowed = false;
    }

    get view(): Viewport {
        return this.#viewport;
    }

    get scene(): SceneController {
        return this.#scene;
    }

    #select(event: CustomEvent<SelectDetail>) {
        this.selection = event.detail.keys;
    }

    #move(event: CustomEvent<MoveDetail>) {
        this.log.push(`move:${event.detail.items.map((item) => `${item.key}@${item.x},${item.y}`).join(";")}`);
        const places = { ...this.places };
        for (const { key, x, y } of event.detail.items) places[key] = { x, y };
        this.places = places;
    }

    #resize(event: CustomEvent<ResizeDetail>) {
        const { key, x, y, width, height } = event.detail;
        this.log.push(`resize:${key}@${x},${y},${width},${height}`);
        this.places = { ...this.places, [key]: { x, y } };
        this.sizes = { ...this.sizes, [key]: { width, height } };
    }

    render() {
        const at = (key: string) => this.places[key];
        const chosen = (key: string) => this.selection.includes(key);
        const a = this.sizes.a;
        return html`
            <ww-scene select="multiple" background=${this.grid || nothing} background-spacing=${this.spacing} data-ww-viewport=${this.windowed ? "canvas" : nothing} data-ww-viewport-fit="none" aria-label="Draw"
                @ww-select=${this.#select} @ww-move=${this.#move} @ww-resize=${this.#resize}>
                <ww-node data-ww-key="a" aria-label="A" x=${at("a").x} y=${at("a").y} width=${a.width} height=${a.height} outline="rect"
                    selectable movable resizable ?selected=${chosen("a")}>A</ww-node>
                <ww-node data-ww-key="b" aria-label="B" x=${at("b").x} y=${at("b").y} width="80" height="40" outline="rounded" radius="12"
                    selectable movable ?selected=${chosen("b")}>B</ww-node>
                <ww-node data-ww-key="c" aria-label="C" x=${at("c").x} y=${at("c").y} width="60" height="60" outline="circle"
                    selectable movable ?selected=${chosen("c")}>C</ww-node>
                <ww-node data-ww-key="d" aria-label="D" x=${at("d").x} y=${at("d").y} width="100" height="60" outline="ellipse"
                    selectable movable ?selected=${chosen("d")}>D</ww-node>
                <ww-node class="plain" data-ww-key="h" aria-label="H" x=${at("h").x} y=${at("h").y} width="60" height="40"
                    selectable movable ?selected=${chosen("h")}>H</ww-node>
                <ww-node data-ww-key="e" x=${at("e").x} y=${at("e").y} width="60" height="40" outline="rect">E</ww-node>
                <ww-node data-ww-key="f" x=${at("f").x} y=${at("f").y} width="60" height="40" outline="rect">F</ww-node>
                <ww-node data-ww-key="g" x=${at("g").x} y=${at("g").y} width="80" height="60" outline="rect" selectable movable ?selected=${chosen("g")}>G</ww-node>

                <ww-path data-ww-key="ab" from="a" to="b" marker-end="arrow">
                    <ww-text class="boxed" data-ww-key="ab-weight">3</ww-text>
                </ww-path>
                <ww-path data-ww-key="ba" from="b" to="a" bend="0.3" marker-end="arrow" selectable ?selected=${chosen("ba")}>
                    <ww-text side="above">back</ww-text>
                </ww-path>
                <ww-path data-ww-key="bc" class="hollow" from="b" to="c" route="arc" marker-start="circle-open" marker-end="triangle"></ww-path>
                <ww-path data-ww-key="cc" from="c" to="c" loop="45" marker-end="arrow" selectable ?selected=${chosen("cc")}>
                    <ww-text side="above" at="middle">x</ww-text>
                </ww-path>
                <ww-path data-ww-key="ad" from="a" to="d" route="step" marker-end="open-arrow" hit-width="30" selectable ?selected=${chosen("ad")}></ww-path>
                <ww-path data-ww-key="dh" from="d" to="h" waypoints="40,60 e:-40,60" marker-end="arrow"></ww-path>
                <ww-path data-ww-key="hc" from="h" to="c" marker-end="arrow"></ww-path>
                <ww-path data-ww-key="ef" from="e" to="f" route="orthogonal" marker-end="arrow"></ww-path>

                <ww-group class="net" data-ww-key="net" frame label="Net" padding="10" x=${at("net").x} y=${at("net").y} selectable movable ?selected=${chosen("net")}>
                    <ww-node data-ww-key="n1" x="40" y="140" width="50" height="30">n1</ww-node>
                    <ww-node data-ww-key="n2" x="130" y="170" width="50" height="30">n2</ww-node>
                </ww-group>

                <ww-path data-ww-key="uml" .points=${[{ x: 40, y: 250 }, { x: 200, y: 250 }]} marker-end="diamond-filled" selectable ?selected=${chosen("uml")}>
                    <ww-text data-ww-key="uml-start" at="start" along="24" side="above">1..*</ww-text>
                    <ww-text data-ww-key="uml-end" at="end" along="-24" side="above">0..1</ww-text>
                    <ww-text data-ww-key="uml-name" class="boxed" at="middle">owns</ww-text>
                </ww-path>

                <ww-path data-ww-key="rot" .points=${[{ x: 730, y: 300 }, { x: 730, y: 420 }]}>
                    <ww-text data-ww-key="rot-follow" follow at="0.3" side="right">along</ww-text>
                    <ww-text data-ww-key="rot-lines" class="pre" at="0.7" rotate="-20">${"two\nlines"}</ww-text>
                </ww-path>

                ${MARKER_KINDS.map((kind, index) => html`
                    <ww-path data-ww-key=${`m-${kind}`} class=${HOLLOW.has(kind) ? "hollow" : ""}
                        .points=${[{ x: 20 + index * 90, y: 440 }, { x: 90 + index * 90, y: 440 }]} marker-end=${kind}></ww-path>`)}
                <ww-path data-ww-key="m-start" .points=${[{ x: 20, y: 470 }, { x: 110, y: 470 }]} marker-start="triangle" marker-end="circle"></ww-path>

                <ww-text data-ww-key="rotated" x="640" y="40" rotate="30">Rotated</ww-text>
                <ww-text data-ww-key="lines" class="pre" x="600" y="100">${"one\ntwo"}</ww-text>
                <ww-text data-ww-key="halo" class="halo" x="600" y="150">Halo</ww-text>
                <ww-text data-ww-key="box" class="box" x="600" y="190">Box</ww-text>
                <ww-path data-ww-key="guide" .points=${[{ x: 590, y: 250 }, { x: 700, y: 250 }]} style="stroke-width: 1px"></ww-path>
                <ww-text data-ww-key="mid" class="mid" x="600" y="250">Middle</ww-text>
                <ww-shape data-ww-key="round" kind="rect" x="600" y="290" width="80" height="40" radius="14"></ww-shape>
                <ww-shape data-ww-key="turned" kind="rect" x="620" y="350" width="80" height="30" rotate="45"></ww-shape>
                <ww-text data-ww-key="far" class="end" x="750" y="470">far</ww-text>
                <ww-group data-ww-key="lab" x="10" y="0"><ww-text class="end" x="-2" y="6">lab</ww-text></ww-group>
            </ww-scene>
            <span data-ww-viewport-controls></span>
        `;
    }
}

export class SvgDraw extends Draw {}
customElements.define("ww-draw-svg", SvgDraw);

export class PixiDraw extends Draw {
    static scopedElements = { ...Draw.scopedElements, "ww-scene": PixiScene };
}
customElements.define("ww-draw-pixi", PixiDraw);

/** Nodes in a scaled group, with paths inside the group and from outside to a node inside it. */
export class Nested extends ExampleElement {
    static scopedElements: Record<string, CustomElementConstructor> = { ...sceneElements };

    static properties = { place: { attribute: false } };

    static styles = css`
        :host { display: block; font: 12px system-ui, sans-serif; }
        ww-scene { width: 420px; height: 220px; color: rgb(60, 60, 70); }
        ww-node { box-sizing: border-box; background: #fff; border: 1px solid #555; font-size: 6px; }
        ww-path { stroke: rgb(40, 40, 40); stroke-width: 1px; stroke-dasharray: 3px 2px; }
    `;

    declare place: { x: number; y: number };

    constructor() {
        super();
        this.place = { x: 30, y: 20 };
    }

    #move(event: CustomEvent<MoveDetail>) {
        const [moved] = event.detail.items;
        this.place = { x: moved.x, y: moved.y };
    }

    render() {
        return html`
            <ww-scene select="single" @ww-move=${this.#move}>
                <ww-group data-ww-key="pen" x=${this.place.x} y=${this.place.y} scale="2" movable aria-label="Pen">
                    <ww-node data-ww-key="p" x="10" y="10" width="40" height="20" outline="ellipse">p</ww-node>
                    <ww-node data-ww-key="q" x="80" y="40" width="40" height="20" outline="rect">q</ww-node>
                    <ww-path data-ww-key="pq" from="p" to="q" marker-end="arrow"><ww-text>m</ww-text></ww-path>
                    <ww-path data-ww-key="qq" from="q" to="q" loop="180" marker-end="arrow"></ww-path>
                </ww-group>
                <ww-node data-ww-key="r" x="340" y="100" width="40" height="20" outline="rect">r</ww-node>
                <ww-path data-ww-key="rq" from="r" to="q" marker-end="arrow"></ww-path>
            </ww-scene>
        `;
    }
}
customElements.define("ww-draw-nested", Nested);
