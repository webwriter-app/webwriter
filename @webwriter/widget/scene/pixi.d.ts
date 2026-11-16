import { Container } from "pixi.js";
import { SceneBase, type Drawing, type Style } from "./base.js";
import { SceneGroup, SceneItem } from "./elements.js";
import { type Rect, type Transform } from "./geometry.js";
/**
 * The Pixi renderer: `ww-scene` for simulations with thousands of moving objects.
 *
 * It needs WebGL. Without it the scene reports `ww-sceneerror` (`detail.code`
 * is `webgl`) on itself, sets `ww-scene:state(failed)` and draws nothing; the
 * HTML nodes stay where they are and stay usable. A widget that wants a
 * drawing in that case chooses the renderer when it registers its elements:
 *
 *     static scopedElements = {...sceneElements, "ww-scene": webglAvailable() ? PixiScene : Scene}
 *
 * The template is the same for both. The SVG renderer refuses only
 * `<ww-sprites>`, with the same event.
 *
 * Where Pixi does the nearest thing instead of the exact one:
 *
 * - A text with `dominant-baseline: alphabetic` puts its first baseline about 0.8 em below the top of the line. The other baselines are exact.
 * - Without a `line-height` of its own a text has Pixi's natural line height; the SVG renderer and `measureText()` use 1.2 times the font size.
 * - A dashed rounded rect is dashed along its rounded outline in eight steps per corner.
 * - The marks of the `background` are drawn from one small texture at the resolution of the view, so a dot of a pixel or two is a little softer than in SVG.
 */
export declare class PixiScene extends SceneBase {
    #private;
    protected mount(surface: HTMLElement): void;
    protected unmount(): void;
    /** True while the scene has given its WebGL context back, or has none yet. */
    get contextLost(): boolean;
    /** Draws now. False if there is no context to draw with. Runs by itself in the frame after a change. */
    render(): boolean;
    protected painted(): void;
    protected resized(width: number, height: number): void;
    protected viewed(view: Transform): void;
    protected create(item: SceneItem): void;
    protected destroy(item: SceneItem): void;
    protected arrange(group: SceneGroup | null, children: SceneItem[]): void;
    protected draw(item: SceneItem, drawing: Drawing, style: Style): void;
    protected measure(item: SceneItem): Rect | null;
    rendering(item: SceneItem): Container | undefined;
}
