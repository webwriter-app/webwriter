// One template, registered twice: once with the SVG renderer and once with the
// Pixi renderer. Used by the checks to show what the two renderers share.
import { css, html } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { sceneElements, type SelectDetail } from "@webwriter/widget/scene";
import { PixiScene } from "@webwriter/widget/scene/pixi";
import { SceneController } from "@webwriter/lit/scene";
import { ExampleElement } from "../shared/base";

export class Diagram extends ExampleElement {
    static properties = { order: { attribute: false }, label: {}, selection: { attribute: false } };

    static styles = css`
        :host { display: block; font: 12px system-ui, sans-serif; }
        ww-scene { width: 520px; height: 260px; }
        ww-shape.plate { fill: oklch(0.9 0.05 150); stroke: none; }
        ww-shape.red { fill: rgb(255, 0, 0); }
        ww-shape.blue { fill: rgb(0, 0, 255); }
        ww-shape.dot { fill: rgb(0, 128, 0); }
        ww-shape.dot[selected] { fill: rgb(255, 128, 0); }
        ww-path { stroke: rgb(40, 40, 40); stroke-width: 2px; }
        ww-path.dashed { stroke: rgb(200, 0, 0); stroke-width: 4px; stroke-dasharray: 10px, 10px; }
        ww-text { fill: rgb(0, 0, 120); font-size: 14px; }
        ww-node { padding: 4px 10px; border: 1px solid #555; background: #fff; }
        .port { position: absolute; width: 6px; height: 6px; margin: -3px; top: 50%; background: #555; }
        .port.out { left: 100%; }
        .port.in { left: 0; }
    `;

    declare order: string[];
    declare label: string;
    declare selection: string[];
    readonly #scene = new SceneController(this);

    constructor() {
        super();
        this.order = ["red", "blue"];
        this.label = "first";
        this.selection = [];
    }

    render() {
        return html`
            <ww-scene select="multiple" @ww-select=${(event: CustomEvent<SelectDetail>) => (this.selection = event.detail.keys)}>
                <ww-shape data-ww-key="plate" kind="rect" class="plate" x="10" y="10" width="240" height="120"></ww-shape>
                ${repeat(this.order, (id) => id, (id) => html`<ww-shape data-ww-key=${id} kind="circle" class=${id} x=${id === "red" ? 60 : 80} y="60" r="20"></ww-shape>`)}
                <ww-shape data-ww-key="dot" kind="circle" class="dot" x="200" y="60" r="15" selectable ?selected=${this.selection.includes("dot")}></ww-shape>
                <ww-path data-ww-key="line" class="dashed" .points=${[{ x: 20, y: 150 }, { x: 220, y: 150 }]}></ww-path>
                <ww-path data-ww-key="wire" from="a:out" to="b:in" route="step"></ww-path>
                <ww-group data-ww-key="group" x="300" y="40" scale="2">
                    <ww-shape data-ww-key="inner" kind="polygon" class="red" points="0,0 20,0 10,15" x="5" y="5"></ww-shape>
                    <ww-node data-ww-key="b" x="10" y="40"><span class="port in" data-ww-port="in"></span>B</ww-node>
                </ww-group>
                <ww-node data-ww-key="a" x="30" y="180">A<span class="port out" data-ww-port="out"></span></ww-node>
                <ww-text data-ww-key="label" x="20" y="225">${this.label}</ww-text>
            </ww-scene>
        `;
    }
}

export class SvgDiagram extends Diagram {
    static scopedElements = { ...sceneElements };
}
export class PixiDiagram extends Diagram {
    static scopedElements = { ...sceneElements, "ww-scene": PixiScene };
}
customElements.define("ww-diagram-svg", SvgDiagram);
customElements.define("ww-diagram-pixi", PixiDiagram);
