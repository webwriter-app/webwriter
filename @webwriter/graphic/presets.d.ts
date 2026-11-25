/** Native SVG recipes in a nominal 0..100 frame. Most coordinates are affine
 * in their adjustments. Circular controls use native arcs, and linked callouts
 * retain an untouched body contour to recover their frame without metadata.
 * Handles lie on the authored contour. Curve handles sample
 * a fixed Bezier parameter so their positions stay affine and invertible. */
export type GraphicShapeAdjustment = {
    name: string;
    label: string;
    default: number;
    min: number;
    max: number;
    axis: "x" | "y" | "angle";
    corner?: "top-left" | "top-right" | "bottom-right" | "bottom-left";
    /** An explicit counterpart linked by either mirror modifier. */
    opposite?: string;
    /** The other coordinate edited by this two-dimensional POI. */
    pairedWith?: string;
    /** Retained geometry parameter without a visible POI. */
    hidden?: boolean;
    point: (values: number[]) => {
        x: number;
        y: number;
    };
};
export type GraphicShapePreset = {
    label: string;
    category: string;
    open?: boolean;
    adjustments: GraphicShapeAdjustment[];
    draw: (values: number[]) => string;
    /** Recover this dimension at its default by absorbing its scale in the frame. */
    normalizedAdjustment?: string;
    adjustmentLimits?: (values: number[], index: number) => [number, number];
    contentSize?: {
        maxWidth: number;
        padding: number;
    };
};
declare const summingJunction: {
    preset: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    legacy: {
        definition: {
            label: string;
            category: string;
            adjustments: GraphicShapeAdjustment[];
            draw: (values: number[]) => string;
        };
        upgrade: () => never[];
    };
};
export declare const legacyRoundFlowPresets: Partial<Record<string, typeof summingJunction.legacy>>;
export declare const legacyBannerPaths: Partial<Record<keyof typeof graphicShapePresets, GraphicShapePreset["draw"][]>>;
export declare const legacyCloudPreset: {
    definition: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    upgrade: (_values: number[]) => number[];
};
export declare const legacyChordPreset: {
    definition: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    upgrade: ([p]: number[]) => number[];
};
export declare const speechBubbleTypes: readonly ["rectangular-callout", "rounded-rectangular-callout", "oval-callout"];
export declare const connectedCalloutTypes: readonly ["rectangular-callout", "rounded-rectangular-callout", "oval-callout", "cloud-callout", "line-callout-1", "line-callout-2"];
export declare const isConnectedCalloutType: (type: string) => type is (typeof connectedCalloutTypes)[number];
export declare const isSpeechBubbleType: (type: string) => type is (typeof speechBubbleTypes)[number];
/** The untouched half of the visible body also identifies its frame on reload. */
export declare function speechBubblePrefix(type: string, r: number, direction: number): string;
/** Earlier independent connector endpoints remain readable without rewriting saved paths. */
export declare const legacySpeechBubblePresets: {
    [k: string]: {
        definition: {
            label: string;
            category: string;
            adjustments: GraphicShapeAdjustment[];
            draw: (values: number[]) => string;
        };
        upgrade: ([, , ex, ey, r]: number[]) => number[];
    };
};
export declare function constrainCalloutTip(type: string, values: number[], previous: number[]): number[];
/** Saved single-axis callouts keep their geometry until the next edit. */
export declare const legacyCalloutPresets: Record<string, {
    definition: GraphicShapePreset;
    upgrade: (values: number[]) => number[];
}>;
export declare const legacySequentialStoragePreset: {
    definition: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    upgrade: ([height]: number[]) => number[];
};
declare const originalGraphicShapePresets: {
    "straight-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "double-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "elbow-connector": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "elbow-connector-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "elbow-connector-double-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-connector": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-connector-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-connector-double-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    curve: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "square-rectangle": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "rounded-rectangle": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-one": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-same-side": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-diagonal": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-round": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "round-one": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "round-same-side": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "round-diagonal": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "text-box": {
        contentSize: {
            maxWidth: number;
            padding: number;
        };
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "right-triangle": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    parallelogram: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    trapezoid: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    pentagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    heptagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    octagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    decagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    dodecagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    pie: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    chord: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    teardrop: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    frame: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "half-frame": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    corner: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "diagonal-stripe": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    plus: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    plaque: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    cylinder: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    cube: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    donut: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    prohibited: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "block-arc": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "folded-corner": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    heart: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "lightning-bolt": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    sun: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    moon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    cloud: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    arc: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    parentheses: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    braces: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-bracket": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "right-bracket": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-brace": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "right-brace": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "up-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "down-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-right-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "up-down-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "quad-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-right-up-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "bent-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "u-turn-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-up-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "bent-up-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-left-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-right-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-up-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-down-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "striped-right-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "notched-right-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "home-plate": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    chevron: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "right-arrow-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "down-arrow-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-arrow-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "up-arrow-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-right-arrow-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "quad-arrow-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "circular-arrow": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "equation-plus": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "equation-minus": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    multiply: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    divide: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    equal: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "not-equal": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    process: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "alternate-process": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    decision: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    data: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "predefined-process": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "internal-storage": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    document: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    multidocument: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    terminator: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    preparation: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "manual-input": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "manual-operation": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "flowchart-connector": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "offpage-connector": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    card: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "punched-tape": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "summing-junction": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    or: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    collate: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    sort: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    extract: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    merge: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "stored-data": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    delay: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "sequential-access-storage": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "magnetic-disk": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "direct-access-storage": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    display: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "seal-1": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "seal-2": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-3": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-4": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-6": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-7": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-8": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-10": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-12": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-16": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-24": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-32": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "ribbon-up": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "ribbon-down": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-ribbon-up": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-ribbon-down": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "vertical-scroll": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "horizontal-scroll": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    wave: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "double-wave": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "rectangular-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "rounded-rectangular-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "oval-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "cloud-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "line-callout-1": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "line-callout-2": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
};
export declare const legacyArrowPresets: Partial<Record<keyof typeof originalGraphicShapePresets, {
    definition: GraphicShapePreset;
    upgrade: (values: number[]) => number[];
}>>;
export declare const legacyCurvedArrowPresets: Partial<Record<keyof typeof originalGraphicShapePresets, GraphicShapePreset>>;
export declare const graphicShapePresets: {
    "left-arrow": GraphicShapePreset;
    "up-arrow": GraphicShapePreset;
    "down-arrow": GraphicShapePreset;
    "left-right-arrow": GraphicShapePreset;
    "up-down-arrow": GraphicShapePreset;
    "quad-arrow": GraphicShapePreset;
    "left-right-up-arrow": GraphicShapePreset;
    "bent-arrow": GraphicShapePreset;
    "u-turn-arrow": GraphicShapePreset;
    "left-up-arrow": GraphicShapePreset;
    "bent-up-arrow": GraphicShapePreset;
    "curved-left-arrow": GraphicShapePreset;
    "curved-right-arrow": GraphicShapePreset;
    "curved-up-arrow": GraphicShapePreset;
    "curved-down-arrow": GraphicShapePreset;
    "striped-right-arrow": GraphicShapePreset;
    "notched-right-arrow": GraphicShapePreset;
    "home-plate": GraphicShapePreset;
    chevron: GraphicShapePreset;
    "right-arrow-callout": GraphicShapePreset;
    "down-arrow-callout": GraphicShapePreset;
    "left-arrow-callout": GraphicShapePreset;
    "up-arrow-callout": GraphicShapePreset;
    "left-right-arrow-callout": GraphicShapePreset;
    "quad-arrow-callout": GraphicShapePreset;
    "circular-arrow": GraphicShapePreset;
    "straight-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "double-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "elbow-connector": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "elbow-connector-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "elbow-connector-double-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-connector": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-connector-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-connector-double-arrow": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    curve: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "square-rectangle": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "rounded-rectangle": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-one": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-same-side": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-diagonal": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "snip-round": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "round-one": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "round-same-side": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "round-diagonal": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "text-box": {
        contentSize: {
            maxWidth: number;
            padding: number;
        };
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "right-triangle": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    parallelogram: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    trapezoid: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    pentagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    heptagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    octagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    decagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    dodecagon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    pie: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    chord: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    teardrop: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    frame: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "half-frame": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    corner: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "diagonal-stripe": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    plus: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    plaque: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    cylinder: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    cube: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    donut: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    prohibited: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "block-arc": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "folded-corner": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    heart: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "lightning-bolt": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    sun: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    moon: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    cloud: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    arc: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    parentheses: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    braces: {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-bracket": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "right-bracket": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "left-brace": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "right-brace": {
        open: true;
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "equation-plus": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "equation-minus": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    multiply: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    divide: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    equal: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "not-equal": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    process: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "alternate-process": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    decision: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    data: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "predefined-process": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "internal-storage": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    document: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    multidocument: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    terminator: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    preparation: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "manual-input": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "manual-operation": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "flowchart-connector": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "offpage-connector": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    card: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "punched-tape": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "summing-junction": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    or: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    collate: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    sort: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    extract: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    merge: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "stored-data": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    delay: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "sequential-access-storage": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "magnetic-disk": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "direct-access-storage": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    display: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "seal-1": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "seal-2": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-3": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-4": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-6": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-7": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-8": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-10": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-12": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-16": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-24": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "star-32": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "ribbon-up": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "ribbon-down": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-ribbon-up": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "curved-ribbon-down": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "vertical-scroll": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "horizontal-scroll": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    wave: {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "double-wave": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "rectangular-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "rounded-rectangular-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "oval-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "cloud-callout": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "line-callout-1": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
    "line-callout-2": {
        label: string;
        category: string;
        adjustments: GraphicShapeAdjustment[];
        draw: (values: number[]) => string;
    };
};
export {};
