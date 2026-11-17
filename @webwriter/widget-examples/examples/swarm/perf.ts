// Measurements, not checks: what a scene described with elements costs.
//   node scripts/build.mjs swarm && node test/run.mjs examples/swarm/perf.html
// Each line of the result is reported as a passed "check" whose name holds the numbers.
import { css, html } from "lit";
import { SceneBase, sceneElements } from "@webwriter/widget/scene";
import { PixiScene } from "@webwriter/widget/scene/pixi";
import { SceneController } from "@webwriter/lit/scene";
import { ExampleElement } from "../shared/base";

class Perf extends ExampleElement {
    static properties = { count: { type: Number }, kind: {} };
    static styles = css`
        ww-scene { width: 1200px; height: 900px; }
        ww-shape { fill: rgb(0, 100, 200); stroke: #333; stroke-width: 1px; }
        ww-shape.odd { fill: var(--odd, orange); }
        ww-path { stroke: #555; stroke-width: 1.5px; }
        ww-node { padding: 1px 5px; border: 1px solid #333; background: #fff; font: 9px sans-serif; }
        .port { position: absolute; width: 4px; height: 4px; margin: -2px; top: 50%; }
        .out { left: 100%; }
        .in { left: 0; }
    `;
    declare count: number;
    declare kind: "shapes" | "nodes";
    readonly #scene = new SceneController(this);

    render() {
        const indices = Array.from({ length: this.count }, (_, i) => i);
        const columns = Math.ceil(Math.sqrt(this.count));
        if (this.kind === "shapes") {
            return html`<ww-scene>${indices.map((i) => html`<ww-shape kind="rect" class=${i % 2 ? "odd" : ""} x=${(i % columns) * 12} y=${Math.floor(i / columns) * 12} width="10" height="10"></ww-shape>`)}</ww-scene>`;
        }
        return html`<ww-scene>
            ${indices.slice(1).map((i) => html`<ww-path from="n${i - 1}:out" to="n${i}:in" route="curve"></ww-path>`)}
            ${indices.map((i) => html`<ww-node data-ww-key="n${i}" x=${(i % columns) * 60} y=${Math.floor(i / columns) * 30}><span class="port in" data-ww-port="in"></span>N${i}<span class="port out" data-ww-port="out"></span></ww-node>`)}
        </ww-scene>`;
    }
}
class SvgPerf extends Perf {
    static scopedElements = { ...sceneElements };
}
class PixiPerf extends Perf {
    static scopedElements = { ...sceneElements, "ww-scene": PixiScene };
}
customElements.define("ww-perf-svg", SvgPerf);
customElements.define("ww-perf-pixi", PixiPerf);

// Time the scene's own share of a render.
let flushing = 0;
const flush = SceneBase.prototype.flush;
SceneBase.prototype.flush = function (this: SceneBase) {
    const before = performance.now();
    flush.call(this);
    flushing += performance.now() - before;
};

const ms = (value: number) => `${value.toFixed(value < 10 ? 2 : 1)} ms`;
const layout = () => void document.body.offsetWidth;

/** Median of seven runs of a synchronous step, including the style and layout work it leaves behind. */
function time(step: () => void): number {
    const runs = Array.from({ length: 7 }, () => {
        const start = performance.now();
        step();
        layout();
        return performance.now() - start;
    });
    return runs.sort((a, b) => a - b)[3];
}

async function measure(tag: string, kind: "shapes" | "nodes", count: number): Promise<string> {
    const widget = document.createElement(tag) as Perf;
    Object.assign(widget, { kind, count });
    flushing = 0;
    const start = performance.now();
    document.body.append(widget);
    await widget.updateComplete;
    layout();
    const first = performance.now() - start;
    const firstFlush = flushing;
    const scene = widget.shadowRoot!.querySelector("ww-scene") as SceneBase;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    if (scene instanceof PixiScene) for (let i = 0; i < 100 && scene.contextLost; i++) await new Promise((done) => setTimeout(done, 50));

    const items = [...scene.querySelectorAll<HTMLElement>("ww-shape, ww-path")];
    const refresh = time(() => scene.refresh());
    const counted = { ...scene.stats };
    scene.refresh();
    const reads = `${scene.stats.styled - counted.styled} styles and ${scene.stats.measured - counted.measured} nodes`;
    // What a refresh did before the two scaling fixes: it read every style and measured the ports of every node.
    const exhaustive = () => (scene.restyle(), scene.remeasure(), scene.flush());
    const everything = time(exhaustive);
    Object.assign(counted, scene.stats);
    exhaustive();
    const allReads = `${scene.stats.styled - counted.styled} styles and ${scene.stats.measured - counted.measured} nodes`;
    const restyle = time(() => (scene.restyle(), scene.flush()));
    const read = time(() => {
        for (const item of items) {
            const style = getComputedStyle(item);
            void [style.stroke, style.strokeWidth, style.strokeDasharray, style.fill, style.opacity, style.transition];
        }
    });
    let odd = 0;
    const recolor = time(() => {
        widget.style.setProperty("--odd", `rgb(${++odd}, 0, 0)`);
        scene.restyle();
        scene.flush();
    });
    const target = scene.querySelector<HTMLElement>(kind === "nodes" ? "ww-node:nth-of-type(2)" : "ww-shape:nth-of-type(2)")!;
    let x = 0;
    const one = time(() => {
        target.setAttribute("x", String(++x));
        scene.flush();
    });
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) { target.setAttribute("x", String(++x)); scene.flush(); }
    const noLayout = (performance.now() - t0) / 20;
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) { target.setAttribute("x", String(++x)); scene.flush(); layout(); }
    const withLayout = (performance.now() - t1) / 20;
    const t2 = performance.now();
    for (let i = 0; i < 20; i++) { target.style.translate = `${++x}px 0px`; layout(); }
    const inline = (performance.now() - t2) / 20;
    target.style.translate = "";
    const render = time(() => {
        widget.requestUpdate();
        (widget as unknown as { performUpdate(): void }).performUpdate();
    });
    const paint = scene instanceof PixiScene ? `, canvas render ${ms(time(() => void scene.render()))}` : "";
    widget.remove();
    return `${tag.slice(8)} ${kind} n=${count}: first render ${ms(first)} (of which scene flush ${ms(firstFlush)}), re-render unchanged ${ms(render)} (refresh alone ${ms(refresh)}, reading ${reads}; with every style and every port read, as before the fixes, ${ms(everything)}, reading ${allReads}), restyle unchanged ${ms(restyle)} (getComputedStyle loop alone ${ms(read)}), custom property changes half ${ms(recolor)}, one x changed ${ms(one)} [no layout ${ms(noLayout)}, with ${ms(withLayout)}, inline style+layout ${ms(inline)}]${paint}`;
}

/** The same picture written straight into an SVG element, as the baseline. */
function baseline(count: number): string {
    const columns = Math.ceil(Math.sqrt(count));
    const start = performance.now();
    const svg = document.body.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
    for (let i = 0; i < count; i++) {
        const rect = svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"));
        for (const [name, value] of Object.entries({ x: (i % columns) * 12, y: Math.floor(i / columns) * 12, width: 10, height: 10 })) rect.setAttribute(name, String(value));
        rect.style.cssText = "fill: rgb(0, 100, 200); stroke: #333; stroke-width: 1px";
    }
    layout();
    const first = performance.now() - start;
    svg.remove();
    return `baseline: ${count} <rect> written directly into an <svg>: ${ms(first)}`;
}

export async function report() {
    const lines: string[] = [];
    for (const count of [100, 1000, 5000]) lines.push(baseline(count));
    for (const tag of ["ww-perf-svg", "ww-perf-pixi"]) {
        await measure(tag, "shapes", 50); // warm up
        for (const count of [100, 1000, 5000]) lines.push(await measure(tag, "shapes", count));
        for (const count of [100, 500, 2000]) lines.push(await measure(tag, "nodes", count));
    }
    await fetch("/__report", { method: "POST", body: JSON.stringify({ results: lines.map((name) => ({ name, ok: true })) }) });
}
