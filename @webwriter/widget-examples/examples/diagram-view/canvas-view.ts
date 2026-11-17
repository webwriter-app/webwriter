import { css, html } from "lit";
import { Viewport } from "@webwriter/lit/viewport";
import { ExampleElement } from "../shared/base";

type Box = { x: number; y: number; width: number; height: number; color: string };

const BOXES: Box[] = [
    { x: 0, y: 0, width: 200, height: 120, color: "#dbeafe" },
    { x: 300, y: 180, width: 200, height: 120, color: "#dcfce7" },
    { x: 600, y: 380, width: 200, height: 120, color: "#fee2e2" },
];

/**
 * The canvas form of Viewport: a canvas has nothing to scroll, so the module
 * tracks `{x, y, scale}` and this widget applies it when it draws. `bounds`
 * names the extent of the drawing, which fit shows and panning is limited to.
 */
export class CanvasView extends ExampleElement {
    static styles = css`
        :host { display: block; }
        canvas { display: block; width: 100%; height: 200px; border: 1px solid #c8c8c8; border-radius: 6px; box-sizing: border-box; }
        canvas:focus-visible { outline: 2px solid Highlight; }
    `;

    readonly viewport = new Viewport(this, { bounds: () => ({ x: 0, y: 0, width: 800, height: 500 }) });
    /** Number of draw calls, for the checks. */
    draws = 0;

    render() {
        return html`<canvas data-ww-viewport data-ww-viewport-zoom="0.25 4" aria-label="Boxes"></canvas>`;
    }

    // The viewport is reactive: a change of the view or of the window's size requests an update.
    updated() {
        const canvas = this.renderRoot.querySelector("canvas")!;
        const { x, y, scale, width, height } = this.viewport;
        const ratio = devicePixelRatio;
        if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
        if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
        const context = canvas.getContext("2d")!;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        // The view is in CSS pixels, so the device pixel ratio is applied on top.
        context.setTransform(scale * ratio, 0, 0, scale * ratio, x * ratio, y * ratio);
        for (const box of BOXES) {
            context.fillStyle = box.color;
            context.fillRect(box.x, box.y, box.width, box.height);
            context.strokeRect(box.x, box.y, box.width, box.height);
        }
        this.draws++;
    }
}
customElements.define("ww-canvas-view", CanvasView);

/**
 * The canvas form on an ordinary element, as a renderer with its own drawing
 * surface uses it (a PixiJS scene, a layer of positioned elements). The
 * renderer follows the view with a subscription instead of the widget's
 * render, reports the extent of its content, and tells the viewport when
 * that extent changed.
 */
export class LayerView extends ExampleElement {
    static styles = css`
        :host { display: block; }
        .window { position: relative; height: 200px; overflow: hidden; border: 1px solid #c8c8c8; border-radius: 6px; box-sizing: border-box; background: #f4f4f5; }
        .window:focus-visible { outline: 2px solid Highlight; }
        .layer { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
        .box { position: absolute; box-sizing: border-box; border: 1px solid #52525b; }
    `;

    readonly viewport = new Viewport(this, { bounds: () => this.extent(), margin: 20 });
    #boxes: Box[] = BOXES.slice(0, 2);
    /** The transform lives in a sheet of its own, so the subscription writes no style attribute. */
    readonly #transform = new CSSStyleSheet();
    #stop: (() => void) | null = null;

    /** The extent of the boxes, which is what a renderer reports. */
    extent() {
        const right = Math.max(...this.#boxes.map((box) => box.x + box.width));
        const bottom = Math.max(...this.#boxes.map((box) => box.y + box.height));
        return { x: 0, y: 0, width: right, height: bottom };
    }

    /** Adds a box without a render of the widget, as a renderer does. */
    addBox(box: Box = BOXES[2]) {
        this.#boxes.push(box);
        this.#draw();
        this.viewport.contentChanged();
    }

    connectedCallback() {
        super.connectedCallback();
        const root = this.renderRoot as ShadowRoot;
        if (!root.adoptedStyleSheets.includes(this.#transform)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.#transform];
        this.#stop = this.viewport.core.subscribe(() => this.#apply());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.#stop?.();
        this.#stop = null;
    }

    render() {
        return html`<div class="window" data-ww-viewport="canvas" data-ww-viewport-zoom="0.25 4" aria-label="Layer"><div class="layer"></div></div>`;
    }

    firstUpdated() {
        this.#draw();
        this.#apply();
    }

    #draw() {
        const layer = this.renderRoot.querySelector(".layer")!;
        layer.replaceChildren(
            ...this.#boxes.map((box, i) => {
                const element = document.createElement("div");
                element.className = `box box-${i}`;
                return element;
            }),
        );
        const rules = this.#boxes.map((box, i) => `.box-${i} { left: ${box.x}px; top: ${box.y}px; width: ${box.width}px; height: ${box.height}px; background: ${box.color}; }`);
        this.#transform.replaceSync([this.#transform.cssRules[0]?.cssText ?? ".layer {}", ...rules].join("\n"));
    }

    #apply() {
        const { x, y, scale } = this.viewport;
        (this.#transform.cssRules[0] as CSSStyleRule | undefined)?.style.setProperty("transform", `translate(${x}px, ${y}px) scale(${scale})`);
    }
}
customElements.define("ww-layer-view", LayerView);
