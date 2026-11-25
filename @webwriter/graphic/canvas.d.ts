export type GraphicCanvasTool = "pen" | "line" | "rect" | "ellipse" | "eraser";
export type GraphicCanvasOptions = {
    tool?: GraphicCanvasTool;
    color?: string;
    strokeWidth?: number;
    disabled?: boolean;
    onChange?: () => void;
};
/** Parses serialized SVG shape markup and replaces `svg`'s graphic shape children safely. */
export declare function loadGraphicMarkup(svg: SVGSVGElement, markup: string): void;
/** Lightweight host-agnostic SVG drawing controller for freehand strokes, basic shapes, erasing, and local undo. */
export declare class GraphicCanvas {
    #private;
    readonly svg: SVGSVGElement;
    constructor(svg: SVGSVGElement, options?: GraphicCanvasOptions);
    get tool(): GraphicCanvasTool;
    get color(): string;
    get strokeWidth(): number;
    get disabled(): boolean;
    get canUndo(): boolean;
    get isEmpty(): boolean;
    setOptions(options: Partial<GraphicCanvasOptions>): void;
    serialize(): string;
    load(markup: string): void;
    undo(): boolean;
    clear(): boolean;
    destroy(): void;
}
