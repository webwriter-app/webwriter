import { SceneBase, type Drawing, type Style } from "./base.js";
import { SceneGroup, SceneItem } from "./elements.js";
import type { Rect, Transform } from "./geometry.js";
/**
 * The SVG renderer: `ww-scene` for editors with tens to hundreds of objects.
 * It refuses `<ww-sprites>`: the element is reported with `ww-sceneerror`
 * (`detail.code` is `unsupported`) and the rest of the scene is drawn.
 *
 * A path is a `<path>`, with a wide twin below it that takes the pointer, and
 * a `<g part="decor">` after it that holds its markers and labels. A text with a
 * background has a `<rect>` below it. A framed group has a `<g part="frame">` as
 * its first child, and a grid is a `<g part="grid">` with a pattern and a
 * rect that covers the visible part of the scene.
 */
export declare class Scene extends SceneBase {
    #private;
    protected mount(surface: HTMLElement): void;
    protected unmount(): void;
    protected create(item: SceneItem): void;
    protected destroy(item: SceneItem): void;
    protected arrange(group: SceneGroup | null, children: SceneItem[]): void;
    protected draw(item: SceneItem, drawing: Drawing, style: Style): void;
    protected measure(item: SceneItem): Rect | null;
    protected viewed(view: Transform): void;
    rendering(item: SceneItem): SVGElement | undefined;
}
