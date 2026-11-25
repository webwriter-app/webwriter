import { graphicShapePresets, type GraphicShapePreset } from "./presets";
export declare const graphicConnectorRole = "connector";
export type GraphicPresetType = keyof typeof graphicShapePresets;
type Bounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};
type Point = {
    x: number;
    y: number;
};
type Reflection = {
    horizontal: boolean;
    vertical: boolean;
};
export type GraphicPresetState = {
    type: GraphicPresetType;
    definition: GraphicShapePreset;
    bounds: Bounds;
    values: number[];
    reflection?: Reflection;
};
export declare function graphicPresetFillRule(type: GraphicPresetType): "evenodd" | "nonzero";
export declare const graphicPresetOptions: {
    type: "sort" | "data" | "curve" | "display" | "multiply" | "frame" | "document" | "not-equal" | "summing-junction" | "or" | "straight-arrow" | "double-arrow" | "elbow-connector" | "elbow-connector-arrow" | "elbow-connector-double-arrow" | "curved-connector" | "curved-connector-arrow" | "curved-connector-double-arrow" | "square-rectangle" | "rounded-rectangle" | "snip-one" | "snip-same-side" | "snip-diagonal" | "snip-round" | "round-one" | "round-same-side" | "round-diagonal" | "text-box" | "right-triangle" | "parallelogram" | "trapezoid" | "pentagon" | "heptagon" | "corner" | "octagon" | "decagon" | "dodecagon" | "pie" | "chord" | "teardrop" | "half-frame" | "diagonal-stripe" | "plus" | "plaque" | "cylinder" | "cube" | "donut" | "prohibited" | "block-arc" | "folded-corner" | "heart" | "lightning-bolt" | "sun" | "moon" | "cloud" | "arc" | "parentheses" | "braces" | "left-bracket" | "right-bracket" | "left-brace" | "right-brace" | "left-arrow" | "up-arrow" | "down-arrow" | "left-right-arrow" | "up-down-arrow" | "quad-arrow" | "left-right-up-arrow" | "bent-arrow" | "u-turn-arrow" | "left-up-arrow" | "bent-up-arrow" | "curved-left-arrow" | "curved-right-arrow" | "curved-up-arrow" | "curved-down-arrow" | "striped-right-arrow" | "notched-right-arrow" | "home-plate" | "chevron" | "right-arrow-callout" | "down-arrow-callout" | "left-arrow-callout" | "up-arrow-callout" | "left-right-arrow-callout" | "quad-arrow-callout" | "circular-arrow" | "equation-plus" | "equation-minus" | "divide" | "equal" | "process" | "alternate-process" | "decision" | "predefined-process" | "internal-storage" | "wave" | "multidocument" | "terminator" | "preparation" | "manual-input" | "manual-operation" | "flowchart-connector" | "offpage-connector" | "card" | "punched-tape" | "collate" | "extract" | "merge" | "stored-data" | "delay" | "sequential-access-storage" | "magnetic-disk" | "direct-access-storage" | "seal-1" | "seal-2" | "star-3" | "star-4" | "star-6" | "star-7" | "star-8" | "star-10" | "star-12" | "star-16" | "star-24" | "star-32" | "ribbon-up" | "ribbon-down" | "curved-ribbon-up" | "curved-ribbon-down" | "vertical-scroll" | "horizontal-scroll" | "double-wave" | "oval-callout" | "rounded-rectangular-callout" | "rectangular-callout" | "cloud-callout" | "line-callout-1" | "line-callout-2";
    label: string;
    category: string;
    icon: string;
    path: string;
}[];
export declare function isGraphicPresetType(type: string): type is GraphicPresetType;
export declare function graphicPresetPath(type: GraphicPresetType, bounds: Bounds, values?: number[], reflection?: Reflection): string;
export declare function writeGraphicPreset(element: Element, state: GraphicPresetState, bounds?: Bounds, values?: number[]): void;
/** No private attributes or parallel document model: recognition and all
 * adjustments derive from the live SVG path, including after reload/undo. */
export declare function readGraphicPreset(element: Element | null): GraphicPresetState | null;
export declare function graphicPresetHandles(state: GraphicPresetState): {
    name: string;
    label: string;
    index: number;
    point: {
        x: number;
        y: number;
    };
}[];
/** Unwrap one pointer sample against the preceding sweep, including the seam. */
export declare function graphicPresetAngle(bounds: Bounds, input: Point, previous: number, reflection?: Reflection): number | undefined;
export declare function adjustGraphicPreset(element: Element, state: GraphicPresetState, name: string, input: number | Point, mirror?: {
    horizontal?: boolean;
    vertical?: boolean;
}): boolean;
export {};
