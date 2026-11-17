import type { Drawing, Style } from "./mirror.js";
import { SceneItem } from "./elements.js";
import type { Rect } from "./geometry.js";
import type { TextSize } from "./mirror.js";
/** Options of `toSVG()`. */
export type SnapshotOptions = {
    /** Space around everything in the scene, in scene pixels. Default 8. */
    padding?: number;
    /** False leaves out the HTML content of `ww-node` elements, which is written as `<foreignObject>`. Default true. */
    nodes?: boolean;
    /** A colour for a rect behind everything. Default none: the picture is transparent. */
    background?: string;
};
/** Options of `toImage()`. */
export type ImageOptions = SnapshotOptions & {
    /** Pixels per scene pixel. Default 2. A picture that would be larger than the browser can make is made smaller. */
    scale?: number;
    /** A MIME type that `canvas.toBlob` supports: `image/png` (default), `image/jpeg` or `image/webp`. */
    type?: string;
    /** 0 to 1, for `image/jpeg` and `image/webp`. */
    quality?: number;
    /** False does not embed the page's web fonts, which a rasterised SVG cannot load by itself. Default true. */
    fonts?: boolean;
};
/** What a snapshot reads from a scene. */
export type SnapshotSource = {
    root: Element;
    extent(): Rect | null;
    drawingOf(item: SceneItem): Drawing | null;
    styleOf(item: SceneItem): Style | null;
    measureText(text: string, source?: Element): TextSize;
};
/** The scene as an SVG document, or null for an empty scene. */
export declare function sceneToSVG(source: SnapshotSource, options?: SnapshotOptions): {
    svg: string;
    width: number;
    height: number;
} | null;
/** Rasterises the scene: see `toImage()`. */
export declare function sceneToImage(source: SnapshotSource, options?: ImageOptions): Promise<Blob>;
