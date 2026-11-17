// Shared by the check files of this example.
import { frame, mount, until, type Point } from "../../test/harness";
import type { CanvasView, LayerView } from "./canvas-view";
import type { DiagramView } from "./index";

export const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance;
export const $ = <E extends Element = HTMLElement>(host: Element, selector: string) => host.shadowRoot!.querySelector<E>(selector)!;
export const $$ = <E extends Element = HTMLElement>(host: Element, selector: string) => [...host.shadowRoot!.querySelectorAll<E>(selector)];

/** Dispatches a wheel event and returns true if the module consumed it. */
export function wheel(target: Element, at: Point, init: WheelEventInit = {}): boolean {
    return !target.dispatchEvent(new WheelEvent("wheel", { bubbles: true, composed: true, cancelable: true, clientX: at.x, clientY: at.y, ...init }));
}

export async function diagram(attributes = `allow-panning style="width: 600px"`) {
    const view = await mount<DiagramView>(`<ww-diagram-view ${attributes}></ww-diagram-view>`);
    await until(() => view.viewport.width > 0, "the viewport never opened");
    await frame(2);
    return { view, stage: $(view, ".stage"), world: $<SVGSVGElement>(view, ".world"), button: (name: string) => $<HTMLButtonElement>(view, `[data-ww-viewport-action="${name}"]`) };
}

export async function canvasView() {
    const view = await mount<CanvasView>(`<ww-canvas-view style="width: 500px"></ww-canvas-view>`);
    await until(() => view.viewport.width > 0, "the viewport never opened");
    await frame(2);
    return { view, canvas: $<HTMLCanvasElement>(view, "canvas") };
}

export async function layerView() {
    const view = await mount<LayerView>(`<ww-layer-view style="width: 500px"></ww-layer-view>`);
    await until(() => view.viewport.width > 0, "the viewport never opened");
    await frame(2);
    return { view, win: $(view, ".window"), layer: $(view, ".layer") };
}

/** The centre of what a scroll container shows: its box without border and scrollbars. */
export function middle(win: HTMLElement): Point {
    const rect = win.getBoundingClientRect();
    return { x: rect.left + win.clientLeft + win.clientWidth / 2, y: rect.top + win.clientTop + win.clientHeight / 2 };
}

/** The scale at which the 1200 × 800 world fits the stage. */
export const fitted = (stage: HTMLElement) => Math.floor(Math.min(stage.clientWidth / 1200, stage.clientHeight / 800) * 1000) / 1000;
