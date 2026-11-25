import { graphicPresetOptions } from "./shapes";
export declare const graphicShapeDragType = "application/x-webwriter-graphic-shape";
export declare const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
type Bounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export declare const boundsForPoints: (points: Array<{
    x: number;
    y: number;
}>) => Bounds;
export declare const regularPolygonPoints: (bounds: Bounds, count: number, startAngle?: number) => {
    x: number;
    y: number;
}[];
export declare const starPoints: (bounds: Bounds, innerRadius?: number) => {
    x: number;
    y: number;
}[];
export declare const hexagonPoints: (bounds: Bounds, inset?: number) => {
    x: number;
    y: number;
}[];
export declare const arrowPoints: (bounds: Bounds, headRatio?: number, tailRatio?: number) => {
    x: number;
    y: number;
}[];
declare const basicGraphicShapeOptions: readonly [{
    readonly type: "rectangle";
    readonly label: "Rectangle";
    readonly icon: "Rectangle";
    readonly category: "Rectangles";
}, {
    readonly type: "ellipse";
    readonly label: "Ellipse";
    readonly icon: "Ellipse";
    readonly category: "Basic shapes";
}, {
    readonly type: "triangle";
    readonly label: "Triangle";
    readonly icon: "Triangle";
    readonly category: "Basic shapes";
}, {
    readonly type: "diamond";
    readonly label: "Diamond";
    readonly icon: "Diamond";
    readonly category: "Basic shapes";
}, {
    readonly type: "hexagon";
    readonly label: "Hexagon";
    readonly icon: "Hexagon";
    readonly category: "Basic shapes";
}, {
    readonly type: "star";
    readonly label: "5-point star";
    readonly icon: "Star";
    readonly category: "Stars and banners";
}, {
    readonly type: "arrow";
    readonly label: "Arrow";
    readonly icon: "Arrow";
    readonly category: "Block arrows";
}, {
    readonly type: "polygon";
    readonly label: "Polygon";
    readonly icon: "Polygon";
    readonly category: "Basic shapes";
}, {
    readonly type: "line";
    readonly label: "Line";
    readonly icon: "Line";
    readonly category: "Lines";
}, {
    readonly type: "image";
    readonly label: "Image";
    readonly icon: "Image";
    readonly category: "Lines";
}, {
    readonly type: "connector";
    readonly label: "Connector";
    readonly icon: "Connector";
    readonly category: "Lines";
}];
export declare const graphicShapeCategories: string[];
declare const lineArrowOptions: readonly [{
    readonly type: "line-start-arrow";
    readonly label: "Narrow left arrow";
    readonly icon: "Shape";
    readonly category: "Lines";
    readonly path: "M 0 50 L 100 50 M 0 50 L 18 41 L 18 59 Z";
    readonly pathFill: "currentColor";
}, {
    readonly type: "line-end-arrow";
    readonly label: "Narrow right arrow";
    readonly icon: "Shape";
    readonly category: "Lines";
    readonly path: "M 0 50 L 100 50 M 100 50 L 82 41 L 82 59 Z";
    readonly pathFill: "currentColor";
}, {
    readonly type: "line-both-arrows";
    readonly label: "Narrow left-right arrow";
    readonly icon: "Shape";
    readonly category: "Lines";
    readonly path: "M 0 50 L 100 50 M 0 50 L 18 41 L 18 59 Z M 100 50 L 82 41 L 82 59 Z";
    readonly pathFill: "currentColor";
}];
export declare const graphicShapeOptions: ({
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "sort" | "data" | "curve" | "display" | "multiply" | "frame" | "document" | "not-equal" | "summing-junction" | "or" | "straight-arrow" | "double-arrow" | "elbow-connector" | "elbow-connector-arrow" | "elbow-connector-double-arrow" | "curved-connector" | "curved-connector-arrow" | "curved-connector-double-arrow" | "square-rectangle" | "rounded-rectangle" | "snip-one" | "snip-same-side" | "snip-diagonal" | "snip-round" | "round-one" | "round-same-side" | "round-diagonal" | "text-box" | "right-triangle" | "parallelogram" | "trapezoid" | "pentagon" | "heptagon" | "corner" | "octagon" | "decagon" | "dodecagon" | "pie" | "chord" | "teardrop" | "half-frame" | "diagonal-stripe" | "plus" | "plaque" | "cylinder" | "cube" | "donut" | "prohibited" | "block-arc" | "folded-corner" | "heart" | "lightning-bolt" | "sun" | "moon" | "cloud" | "arc" | "parentheses" | "braces" | "left-bracket" | "right-bracket" | "left-brace" | "right-brace" | "left-arrow" | "up-arrow" | "down-arrow" | "left-right-arrow" | "up-down-arrow" | "quad-arrow" | "left-right-up-arrow" | "bent-arrow" | "u-turn-arrow" | "left-up-arrow" | "bent-up-arrow" | "curved-left-arrow" | "curved-right-arrow" | "curved-up-arrow" | "curved-down-arrow" | "striped-right-arrow" | "notched-right-arrow" | "home-plate" | "chevron" | "right-arrow-callout" | "down-arrow-callout" | "left-arrow-callout" | "up-arrow-callout" | "left-right-arrow-callout" | "quad-arrow-callout" | "circular-arrow" | "equation-plus" | "equation-minus" | "divide" | "equal" | "process" | "alternate-process" | "decision" | "predefined-process" | "internal-storage" | "wave" | "multidocument" | "terminator" | "preparation" | "manual-input" | "manual-operation" | "flowchart-connector" | "offpage-connector" | "card" | "punched-tape" | "collate" | "extract" | "merge" | "stored-data" | "delay" | "sequential-access-storage" | "magnetic-disk" | "direct-access-storage" | "seal-1" | "seal-2" | "star-3" | "star-4" | "star-6" | "star-7" | "star-8" | "star-10" | "star-12" | "star-16" | "star-24" | "star-32" | "ribbon-up" | "ribbon-down" | "curved-ribbon-up" | "curved-ribbon-down" | "vertical-scroll" | "horizontal-scroll" | "double-wave" | "oval-callout" | "rounded-rectangular-callout" | "rectangular-callout" | "cloud-callout" | "line-callout-1" | "line-callout-2";
    label: string;
    icon: string;
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "ellipse";
    label: "Ellipse";
    icon: "Ellipse";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "triangle";
    label: "Triangle";
    icon: "Triangle";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "diamond";
    label: "Diamond";
    icon: "Diamond";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "hexagon";
    label: "Hexagon";
    icon: "Hexagon";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "star";
    label: "5-point star";
    icon: "Star";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "arrow";
    label: "Arrow";
    icon: "Arrow";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "line";
    label: "Line";
    icon: "Line";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "image";
    label: "Image";
    icon: "Image";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "connector";
    label: "Connector";
    icon: "Connector";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "line-start-arrow";
    label: "Narrow left arrow";
    icon: "Shape";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "line-end-arrow";
    label: "Narrow right arrow";
    icon: "Shape";
} | {
    category: string;
    path: string;
    pathFill: "currentColor" | undefined;
    fillRule: string;
    type: "line-both-arrows";
    label: "Narrow left-right arrow";
    icon: "Shape";
})[];
export declare const graphicShapeSections: ({
    label: "Arrows";
    rows: ({
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "sort" | "data" | "curve" | "display" | "multiply" | "frame" | "document" | "not-equal" | "summing-junction" | "or" | "straight-arrow" | "double-arrow" | "elbow-connector" | "elbow-connector-arrow" | "elbow-connector-double-arrow" | "curved-connector" | "curved-connector-arrow" | "curved-connector-double-arrow" | "square-rectangle" | "rounded-rectangle" | "snip-one" | "snip-same-side" | "snip-diagonal" | "snip-round" | "round-one" | "round-same-side" | "round-diagonal" | "text-box" | "right-triangle" | "parallelogram" | "trapezoid" | "pentagon" | "heptagon" | "corner" | "octagon" | "decagon" | "dodecagon" | "pie" | "chord" | "teardrop" | "half-frame" | "diagonal-stripe" | "plus" | "plaque" | "cylinder" | "cube" | "donut" | "prohibited" | "block-arc" | "folded-corner" | "heart" | "lightning-bolt" | "sun" | "moon" | "cloud" | "arc" | "parentheses" | "braces" | "left-bracket" | "right-bracket" | "left-brace" | "right-brace" | "left-arrow" | "up-arrow" | "down-arrow" | "left-right-arrow" | "up-down-arrow" | "quad-arrow" | "left-right-up-arrow" | "bent-arrow" | "u-turn-arrow" | "left-up-arrow" | "bent-up-arrow" | "curved-left-arrow" | "curved-right-arrow" | "curved-up-arrow" | "curved-down-arrow" | "striped-right-arrow" | "notched-right-arrow" | "home-plate" | "chevron" | "right-arrow-callout" | "down-arrow-callout" | "left-arrow-callout" | "up-arrow-callout" | "left-right-arrow-callout" | "quad-arrow-callout" | "circular-arrow" | "equation-plus" | "equation-minus" | "divide" | "equal" | "process" | "alternate-process" | "decision" | "predefined-process" | "internal-storage" | "wave" | "multidocument" | "terminator" | "preparation" | "manual-input" | "manual-operation" | "flowchart-connector" | "offpage-connector" | "card" | "punched-tape" | "collate" | "extract" | "merge" | "stored-data" | "delay" | "sequential-access-storage" | "magnetic-disk" | "direct-access-storage" | "seal-1" | "seal-2" | "star-3" | "star-4" | "star-6" | "star-7" | "star-8" | "star-10" | "star-12" | "star-16" | "star-24" | "star-32" | "ribbon-up" | "ribbon-down" | "curved-ribbon-up" | "curved-ribbon-down" | "vertical-scroll" | "horizontal-scroll" | "double-wave" | "oval-callout" | "rounded-rectangular-callout" | "rectangular-callout" | "cloud-callout" | "line-callout-1" | "line-callout-2";
        label: string;
        icon: string;
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "ellipse";
        label: "Ellipse";
        icon: "Ellipse";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "triangle";
        label: "Triangle";
        icon: "Triangle";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "diamond";
        label: "Diamond";
        icon: "Diamond";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "hexagon";
        label: "Hexagon";
        icon: "Hexagon";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "star";
        label: "5-point star";
        icon: "Star";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "arrow";
        label: "Arrow";
        icon: "Arrow";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line";
        label: "Line";
        icon: "Line";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "image";
        label: "Image";
        icon: "Image";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "connector";
        label: "Connector";
        icon: "Connector";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-start-arrow";
        label: "Narrow left arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-end-arrow";
        label: "Narrow right arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-both-arrows";
        label: "Narrow left-right arrow";
        icon: "Shape";
    })[][];
} | {
    label: "Advanced";
    rows: ({
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "sort" | "data" | "curve" | "display" | "multiply" | "frame" | "document" | "not-equal" | "summing-junction" | "or" | "straight-arrow" | "double-arrow" | "elbow-connector" | "elbow-connector-arrow" | "elbow-connector-double-arrow" | "curved-connector" | "curved-connector-arrow" | "curved-connector-double-arrow" | "square-rectangle" | "rounded-rectangle" | "snip-one" | "snip-same-side" | "snip-diagonal" | "snip-round" | "round-one" | "round-same-side" | "round-diagonal" | "text-box" | "right-triangle" | "parallelogram" | "trapezoid" | "pentagon" | "heptagon" | "corner" | "octagon" | "decagon" | "dodecagon" | "pie" | "chord" | "teardrop" | "half-frame" | "diagonal-stripe" | "plus" | "plaque" | "cylinder" | "cube" | "donut" | "prohibited" | "block-arc" | "folded-corner" | "heart" | "lightning-bolt" | "sun" | "moon" | "cloud" | "arc" | "parentheses" | "braces" | "left-bracket" | "right-bracket" | "left-brace" | "right-brace" | "left-arrow" | "up-arrow" | "down-arrow" | "left-right-arrow" | "up-down-arrow" | "quad-arrow" | "left-right-up-arrow" | "bent-arrow" | "u-turn-arrow" | "left-up-arrow" | "bent-up-arrow" | "curved-left-arrow" | "curved-right-arrow" | "curved-up-arrow" | "curved-down-arrow" | "striped-right-arrow" | "notched-right-arrow" | "home-plate" | "chevron" | "right-arrow-callout" | "down-arrow-callout" | "left-arrow-callout" | "up-arrow-callout" | "left-right-arrow-callout" | "quad-arrow-callout" | "circular-arrow" | "equation-plus" | "equation-minus" | "divide" | "equal" | "process" | "alternate-process" | "decision" | "predefined-process" | "internal-storage" | "wave" | "multidocument" | "terminator" | "preparation" | "manual-input" | "manual-operation" | "flowchart-connector" | "offpage-connector" | "card" | "punched-tape" | "collate" | "extract" | "merge" | "stored-data" | "delay" | "sequential-access-storage" | "magnetic-disk" | "direct-access-storage" | "seal-1" | "seal-2" | "star-3" | "star-4" | "star-6" | "star-7" | "star-8" | "star-10" | "star-12" | "star-16" | "star-24" | "star-32" | "ribbon-up" | "ribbon-down" | "curved-ribbon-up" | "curved-ribbon-down" | "vertical-scroll" | "horizontal-scroll" | "double-wave" | "oval-callout" | "rounded-rectangular-callout" | "rectangular-callout" | "cloud-callout" | "line-callout-1" | "line-callout-2";
        label: string;
        icon: string;
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "ellipse";
        label: "Ellipse";
        icon: "Ellipse";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "triangle";
        label: "Triangle";
        icon: "Triangle";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "diamond";
        label: "Diamond";
        icon: "Diamond";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "hexagon";
        label: "Hexagon";
        icon: "Hexagon";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "star";
        label: "5-point star";
        icon: "Star";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "arrow";
        label: "Arrow";
        icon: "Arrow";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line";
        label: "Line";
        icon: "Line";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "image";
        label: "Image";
        icon: "Image";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "connector";
        label: "Connector";
        icon: "Connector";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-start-arrow";
        label: "Narrow left arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-end-arrow";
        label: "Narrow right arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-both-arrows";
        label: "Narrow left-right arrow";
        icon: "Shape";
    })[][];
} | {
    label: "Flowchart";
    rows: ({
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "sort" | "data" | "curve" | "display" | "multiply" | "frame" | "document" | "not-equal" | "summing-junction" | "or" | "straight-arrow" | "double-arrow" | "elbow-connector" | "elbow-connector-arrow" | "elbow-connector-double-arrow" | "curved-connector" | "curved-connector-arrow" | "curved-connector-double-arrow" | "square-rectangle" | "rounded-rectangle" | "snip-one" | "snip-same-side" | "snip-diagonal" | "snip-round" | "round-one" | "round-same-side" | "round-diagonal" | "text-box" | "right-triangle" | "parallelogram" | "trapezoid" | "pentagon" | "heptagon" | "corner" | "octagon" | "decagon" | "dodecagon" | "pie" | "chord" | "teardrop" | "half-frame" | "diagonal-stripe" | "plus" | "plaque" | "cylinder" | "cube" | "donut" | "prohibited" | "block-arc" | "folded-corner" | "heart" | "lightning-bolt" | "sun" | "moon" | "cloud" | "arc" | "parentheses" | "braces" | "left-bracket" | "right-bracket" | "left-brace" | "right-brace" | "left-arrow" | "up-arrow" | "down-arrow" | "left-right-arrow" | "up-down-arrow" | "quad-arrow" | "left-right-up-arrow" | "bent-arrow" | "u-turn-arrow" | "left-up-arrow" | "bent-up-arrow" | "curved-left-arrow" | "curved-right-arrow" | "curved-up-arrow" | "curved-down-arrow" | "striped-right-arrow" | "notched-right-arrow" | "home-plate" | "chevron" | "right-arrow-callout" | "down-arrow-callout" | "left-arrow-callout" | "up-arrow-callout" | "left-right-arrow-callout" | "quad-arrow-callout" | "circular-arrow" | "equation-plus" | "equation-minus" | "divide" | "equal" | "process" | "alternate-process" | "decision" | "predefined-process" | "internal-storage" | "wave" | "multidocument" | "terminator" | "preparation" | "manual-input" | "manual-operation" | "flowchart-connector" | "offpage-connector" | "card" | "punched-tape" | "collate" | "extract" | "merge" | "stored-data" | "delay" | "sequential-access-storage" | "magnetic-disk" | "direct-access-storage" | "seal-1" | "seal-2" | "star-3" | "star-4" | "star-6" | "star-7" | "star-8" | "star-10" | "star-12" | "star-16" | "star-24" | "star-32" | "ribbon-up" | "ribbon-down" | "curved-ribbon-up" | "curved-ribbon-down" | "vertical-scroll" | "horizontal-scroll" | "double-wave" | "oval-callout" | "rounded-rectangular-callout" | "rectangular-callout" | "cloud-callout" | "line-callout-1" | "line-callout-2";
        label: string;
        icon: string;
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "ellipse";
        label: "Ellipse";
        icon: "Ellipse";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "triangle";
        label: "Triangle";
        icon: "Triangle";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "diamond";
        label: "Diamond";
        icon: "Diamond";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "hexagon";
        label: "Hexagon";
        icon: "Hexagon";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "star";
        label: "5-point star";
        icon: "Star";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "arrow";
        label: "Arrow";
        icon: "Arrow";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line";
        label: "Line";
        icon: "Line";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "image";
        label: "Image";
        icon: "Image";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "connector";
        label: "Connector";
        icon: "Connector";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-start-arrow";
        label: "Narrow left arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-end-arrow";
        label: "Narrow right arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-both-arrows";
        label: "Narrow left-right arrow";
        icon: "Shape";
    })[][];
} | {
    label: "Basic";
    rows: ({
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "sort" | "data" | "curve" | "display" | "multiply" | "frame" | "document" | "not-equal" | "summing-junction" | "or" | "straight-arrow" | "double-arrow" | "elbow-connector" | "elbow-connector-arrow" | "elbow-connector-double-arrow" | "curved-connector" | "curved-connector-arrow" | "curved-connector-double-arrow" | "square-rectangle" | "rounded-rectangle" | "snip-one" | "snip-same-side" | "snip-diagonal" | "snip-round" | "round-one" | "round-same-side" | "round-diagonal" | "text-box" | "right-triangle" | "parallelogram" | "trapezoid" | "pentagon" | "heptagon" | "corner" | "octagon" | "decagon" | "dodecagon" | "pie" | "chord" | "teardrop" | "half-frame" | "diagonal-stripe" | "plus" | "plaque" | "cylinder" | "cube" | "donut" | "prohibited" | "block-arc" | "folded-corner" | "heart" | "lightning-bolt" | "sun" | "moon" | "cloud" | "arc" | "parentheses" | "braces" | "left-bracket" | "right-bracket" | "left-brace" | "right-brace" | "left-arrow" | "up-arrow" | "down-arrow" | "left-right-arrow" | "up-down-arrow" | "quad-arrow" | "left-right-up-arrow" | "bent-arrow" | "u-turn-arrow" | "left-up-arrow" | "bent-up-arrow" | "curved-left-arrow" | "curved-right-arrow" | "curved-up-arrow" | "curved-down-arrow" | "striped-right-arrow" | "notched-right-arrow" | "home-plate" | "chevron" | "right-arrow-callout" | "down-arrow-callout" | "left-arrow-callout" | "up-arrow-callout" | "left-right-arrow-callout" | "quad-arrow-callout" | "circular-arrow" | "equation-plus" | "equation-minus" | "divide" | "equal" | "process" | "alternate-process" | "decision" | "predefined-process" | "internal-storage" | "wave" | "multidocument" | "terminator" | "preparation" | "manual-input" | "manual-operation" | "flowchart-connector" | "offpage-connector" | "card" | "punched-tape" | "collate" | "extract" | "merge" | "stored-data" | "delay" | "sequential-access-storage" | "magnetic-disk" | "direct-access-storage" | "seal-1" | "seal-2" | "star-3" | "star-4" | "star-6" | "star-7" | "star-8" | "star-10" | "star-12" | "star-16" | "star-24" | "star-32" | "ribbon-up" | "ribbon-down" | "curved-ribbon-up" | "curved-ribbon-down" | "vertical-scroll" | "horizontal-scroll" | "double-wave" | "oval-callout" | "rounded-rectangular-callout" | "rectangular-callout" | "cloud-callout" | "line-callout-1" | "line-callout-2";
        label: string;
        icon: string;
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "ellipse";
        label: "Ellipse";
        icon: "Ellipse";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "triangle";
        label: "Triangle";
        icon: "Triangle";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "diamond";
        label: "Diamond";
        icon: "Diamond";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "hexagon";
        label: "Hexagon";
        icon: "Hexagon";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "star";
        label: "5-point star";
        icon: "Star";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "arrow";
        label: "Arrow";
        icon: "Arrow";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line";
        label: "Line";
        icon: "Line";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "image";
        label: "Image";
        icon: "Image";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "connector";
        label: "Connector";
        icon: "Connector";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-start-arrow";
        label: "Narrow left arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-end-arrow";
        label: "Narrow right arrow";
        icon: "Shape";
    } | {
        category: string;
        path: string;
        pathFill: "currentColor" | undefined;
        fillRule: string;
        type: "line-both-arrows";
        label: "Narrow left-right arrow";
        icon: "Shape";
    })[][];
})[];
export type GraphicShapeType = typeof basicGraphicShapeOptions[number]["type"] | typeof graphicPresetOptions[number]["type"] | typeof lineArrowOptions[number]["type"] | "freehand" | "polyline" | "bezier";
export type GraphicShapePaint = Partial<Record<"fill" | "stroke" | "stroke-width" | "opacity", string>>;
export declare function readGraphicShapeDrag(data: DataTransfer): {
    shape: GraphicShapeType;
    paint?: GraphicShapePaint;
} | null;
export declare const defaultGraphicShapePaint: Required<GraphicShapePaint>;
export declare const defaultGraphicEndingSize = 18;
export declare const graphicConnectorEndings: {
    readonly triangle: {
        readonly label: "Filled arrow";
        readonly icons: readonly ["◀︎", "▶︎"];
        readonly path: "M 0 0 L 10 5 L 0 10 z";
        readonly outline: readonly [readonly [0, 0], readonly [10, 5], readonly [0, 10]];
    };
    readonly "open-arrow": {
        readonly label: "Open arrow";
        readonly icons: readonly ["❮", "❯"];
        readonly path: "M 0 1 L 1 0 L 10 5 L 1 10 L 0 9 L 7 5 Z";
        readonly outline: readonly [readonly [0, 0], readonly [10, 5], readonly [0, 10]];
    };
    readonly diamond: {
        readonly label: "Diamond";
        readonly icons: readonly ["◆", "◆"];
        readonly path: "M 0 5 L 5 0 L 10 5 L 5 10 Z";
        readonly outline: readonly [readonly [0, 5], readonly [5, 0], readonly [10, 5], readonly [5, 10]];
    };
    readonly circle: {
        readonly label: "Circle";
        readonly icons: readonly ["●", "●"];
        readonly path: "M 0 5 A 5 5 0 1 0 10 5 A 5 5 0 1 0 0 5 Z";
        readonly outline: readonly [readonly [0, 0], readonly [10, 0], readonly [10, 10], readonly [0, 10]];
    };
    readonly bar: {
        readonly label: "Bar";
        readonly icons: readonly ["│", "│"];
        readonly path: "M 4 0 H 6 V 10 H 4 Z";
        readonly outline: readonly [readonly [4, 0], readonly [6, 0], readonly [6, 10], readonly [4, 10]];
    };
};
export type GraphicConnectorEnding = keyof typeof graphicConnectorEndings;
export declare function isGraphicConnectorEnding(value: string): value is GraphicConnectorEnding;
/** Open geometry must remain unfilled, including when insertion paint is set. */
export declare function graphicShapeIsOpen(type: GraphicShapeType): boolean;
export declare const graphicArrangeOperations: readonly ["align-left", "align-center", "align-right", "align-top", "align-middle", "align-bottom", "distribute-horizontal", "distribute-vertical", "bring-forward", "send-backward", "bring-front", "send-back"];
export type GraphicArrangeOperation = typeof graphicArrangeOperations[number];
export declare const graphicLayerOperations: readonly ["select", "toggle-visibility", "toggle-lock", "move-up", "move-down", "bring-front", "send-back"];
export type GraphicLayerOperation = typeof graphicLayerOperations[number];
export declare const graphicViewportOperations: readonly ["zoom-in", "zoom-out", "actual-size", "fit-content", "set-zoom"];
export type GraphicViewportOperation = typeof graphicViewportOperations[number];
export type GraphicLayerState = {
    index: number;
    label: string;
    type: GraphicShapeType;
    selected: boolean;
    primary: boolean;
    visible: boolean;
    locked: boolean;
};
export type GraphicMode = "select" | "draw" | "lines" | "curves";
export type GraphicSelectionState = {
    active: true;
    capture: boolean;
    alternativeText?: string;
    mode?: GraphicMode;
    selectionCount?: number;
    shape?: GraphicShapeType;
    canConvertToConnector?: boolean;
    parameters?: Record<string, string>;
    options?: {
        grid: boolean;
        snap: boolean;
        guides: boolean;
    };
    layers?: GraphicLayerState[];
    viewport?: {
        zoom: number;
    };
};
export declare function isGraphicShapeType(value: unknown): value is GraphicShapeType;
export declare function isGraphicArrangeOperation(value: unknown): value is GraphicArrangeOperation;
export declare function isGraphicLayerOperation(value: unknown): value is GraphicLayerOperation;
export declare function isGraphicViewportOperation(value: unknown): value is GraphicViewportOperation;
export declare function graphicContainerForNode(node: Node | null): SVGSVGElement | null;
/** The absolute M/Q/L geometry used for freehand strokes. Inspect authored
 * geometry on every read; no editor metadata or retained point model is needed. */
export declare function graphicStrokePoints(element: Element): {
    x: number;
    y: number;
}[] | null;
/** Editable absolute line/cubic paths. Unsupported SVG commands stay untouched. */
export declare function graphicPathGeometry(element: Element): {
    kind: "lines" | "curves";
    closed: boolean;
    points: {
        x: number;
        y: number;
    }[];
} | null;
/** Returns the authored geometry represented by a selectable shape. A label
 * group is recognized only when it contains one primitive and optional native
 * SVG text/title children, so unfamiliar SVG groups stay untouched. */
export declare function graphicShapeGeometry(element: Element | null): SVGGraphicsElement | null;
export declare function graphicShapeType(element: Element | null): GraphicShapeType | null;
export declare function graphicShapeForNode(node: Node | null): SVGGraphicsElement | null;
/** Finds selectable SVG shape roots without counting labeled primitives twice. */
export declare function graphicShapeRoots(graphic: SVGSVGElement): SVGGraphicsElement[];
/** An unclipped, single-shape viewport is edited as one document element.
 * Inspect the live children so added content and unfamiliar groups stay canvases. */
export declare function standaloneGraphicShape(graphic: Element | null): SVGGraphicsElement | null;
export {};
