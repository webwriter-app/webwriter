/** A position in scene coordinates, or in the coordinates of a group. */
export type Point = {
    x: number;
    y: number;
};
/** An axis-aligned box. */
export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/**
 * How a `ww-path` between two ends is laid out: a straight line, a step (two
 * turns, in the middle), a cubic curve that leaves and arrives along the sides
 * of its ends, an `arc` (a quadratic curve bent by the path's `bend`) or an
 * `orthogonal` line that goes around the other nodes of the scene.
 */
export type Route = "straight" | "step" | "curve" | "arc" | "orthogonal";
/** Translation and uniform scale: what a `ww-group` and the view of a viewport apply. */
export type Transform = {
    x: number;
    y: number;
    k: number;
};
/** The transform that changes nothing. */
export declare const IDENTITY: Transform;
/** A point of the inner coordinates in the outer ones. */
export declare const apply: (t: Transform, p: Point) => Point;
/** A point of the outer coordinates in the inner ones. */
export declare const invert: (t: Transform, p: Point) => Point;
/** `inner` applied first, then `outer`. */
export declare const compose: (outer: Transform, inner: Transform) => Transform;
/** The nearest multiple of `grid`. Without a grid the value itself. */
export declare const snap: (value: number, grid: number) => number;
/** `M x y L x y …` for a polyline. */
export declare function polyline(points: readonly Point[], closed?: boolean): string;
/** A line of a path: a polyline, or one quadratic or cubic Bezier curve. Everything a renderer needs of it is derived from this. */
export type Curve = {
    type: "poly";
    points: Point[];
} | {
    type: "quad";
    a: Point;
    c: Point;
    b: Point;
} | {
    type: "cubic";
    a: Point;
    c1: Point;
    c2: Point;
    b: Point;
};
/** A line from `a` to `b`. */
export declare const lineCurve: (a: Point, b: Point) => Curve;
/**
 * A line from `a` to `b`. `da` and `db` are the directions the two ends face
 * (unit vectors, away from their node); a step or a curve leaves and arrives
 * along them.
 */
export declare function routeCurve(a: Point, b: Point, kind: "straight" | "step" | "curve", da: Point, db: Point): Curve;
/**
 * A line from `a` to `b`. `da` and `db` are the directions the two ends face
 * (unit vectors, away from their node); a step or a curve leaves and arrives
 * along them. Returns SVG path data and the same line as a polyline.
 */
export declare function route(a: Point, b: Point, kind: Route, da: Point, db: Point): {
    d: string;
    points: Point[];
};
/** The first point of a curve. */
export declare const curveStart: (c: Curve) => Point;
/** The last point of a curve. */
export declare const curveEnd: (c: Curve) => Point;
/** SVG path data of a curve. */
export declare function curveD(c: Curve): string;
/**
 * The point at `t`. A Bezier curve is walked by its parameter, a polyline by
 * the fraction of its length.
 */
export declare function curveAt(c: Curve, t: number): Point;
/** The curve as a polyline: its own points, or `steps` + 1 points of a Bezier curve. */
export declare function curveSamples(c: Curve, steps?: number): Point[];
/** The part of a curve between the parameters `t0` and `t1` (`0 <= t0 < t1 <= 1`). */
export declare function curveBetween(c: Curve, t0: number, t1: number): Curve;
/**
 * The curve without the parts that lie inside the shapes at its two ends, which
 * are given as tests of a point. A curve that is inside one of them from end to
 * end, or whose ends cross, leaves nothing: null.
 */
export declare function clipCurve(c: Curve, insideStart: ((p: Point) => boolean) | null, insideEnd: ((p: Point) => boolean) | null): Curve | null;
/**
 * The curve shortened so that it ends `length` before its end point, measured
 * in a straight line from that point. At least a tenth of it is kept.
 */
export declare function trimCurveEnd(c: Curve, length: number): Curve;
/** Like `trimCurveEnd`, at the start. */
export declare function trimCurveStart(c: Curve, length: number): Curve;
/** The point at a distance along a polyline, and the unit direction of the line there. The distance is clamped to the line. */
export declare function pointAlong(points: readonly Point[], distance: number): {
    at: Point;
    direction: Point;
};
/** The length of a polyline. */
export declare const polylineLength: (points: readonly Point[]) => number;
/** How a node is outlined where a path ends at it. */
export type OutlineKind = "rect" | "rounded" | "circle" | "ellipse";
/** A node's outline: its box, and the radius of its corners for `rounded`. */
export type Outline = {
    kind: OutlineKind;
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
};
/** True if a point lies in a node's outline (its border included). */
export declare function outlineContains(o: Outline, p: Point): boolean;
/** The point where a ray from the centre of an outline, along a unit direction, meets its border. */
export declare function outlineEdge(o: Outline, direction: Point): Point;
/** The unit vector of the side of a box that faces a direction: the axis that the direction follows most. */
export declare const dominantSide: (d: Point) => Point;
/** The control point of the arc between two points: the middle of the chord, moved sideways by `bend` times its length. A positive bend is to the left of the way from `a` to `b`. */
export declare function arcControl(a: Point, b: Point, bend: number): Point;
/**
 * A loop from a point back to a point, leaving and arriving about the direction
 * `angle` (degrees, 0 up, clockwise). `reach` is how far its tip is to be from
 * the middle of the two points.
 */
export declare function loopCurve(a: Point, b: Point, angle: number, reach: number): Curve;
/**
 * A line of horizontal and vertical segments from `a` to `b` that goes around
 * boxes. It leaves `a` along `da` and arrives at `b` against `db` (unit vectors
 * along an axis; a zero vector picks the axis from the two points), with two
 * turns. The place of the middle segment is the middle between the ends if
 * that is free; otherwise the free place nearest to it, beside one of the boxes
 * with `gap` between; if there is none, the middle again.
 */
export declare function orthogonalRoute(a: Point, da: Point, b: Point, db: Point, boxes: readonly Rect[], gap: number): Point[];
/** What can sit at an end of a path. */
export type MarkerKind = "none" | "arrow" | "open-arrow" | "triangle" | "triangle-filled" | "diamond" | "diamond-filled" | "circle" | "circle-open";
export declare const MARKERS: readonly MarkerKind[];
/** A marker as shapes: a closed polygon, an open polyline or a circle. `filled` markers are painted in the stroke colour; the others are outlines. */
export type Marker = {
    kind: MarkerKind;
    filled: boolean;
    polygon: Point[] | null;
    line: Point[] | null;
    circle: {
        x: number;
        y: number;
        r: number;
    } | null;
};
/** The length of a marker for a stroke width, when the style gives no size: 8 pixels and twice the width. */
export declare const markerSize: (strokeWidth: number) => number;
/** The length of a marker's body along the line: how far before its tip the path stops. */
export declare function markerInset(kind: MarkerKind, size: number): number;
/**
 * The shapes of a marker whose tip is at `tip`. `out` is the unit vector that
 * points along the line, past its end.
 */
export declare function marker(kind: MarkerKind, tip: Point, out: Point, size: number): Marker | null;
/** The outline of a marker as a polygon, for hit tests, selection and extents. */
export declare function markerPolygon(m: Marker): Point[];
/** Where a label sits against its line. */
export type LabelSide = "on" | "left" | "right" | "above" | "below";
/** A point turned about an origin by `degrees` clockwise (the y axis points down). */
export declare function turned(p: Point, origin: Point, degrees: number): Point;
/** The direction a curve leaves its start (`atStart`) or its end in, outwards: a unit vector. */
export declare function curveDirection(c: Curve, atStart: boolean): Point;
/** The four corners of a box of `width` and `height` centred at `x`, `y` and turned by `rotate` degrees. */
export declare function turnedBox(x: number, y: number, width: number, height: number, rotate: number): Point[];
/**
 * The centre and the angle of a label of a given size on a line. `where` is the
 * fraction of the line's length and `along` pixels more; `gap` is the space
 * between the line and the label box on the other sides than `on`. With
 * `follow` the label is turned to the line and kept upright; otherwise it
 * has the angle `rotate`.
 */
export declare function placeLabel(line: readonly Point[], spec: {
    where: number;
    along: number;
    side: LabelSide;
    gap: number;
    follow: boolean;
    rotate: number;
    width: number;
    height: number;
}): {
    x: number;
    y: number;
    rotate: number;
};
/** The box around some points. Null without points. */
export declare function bounds(points: Iterable<Point>): Rect | null;
/** The four corners of a box, clockwise from its top-left one. */
export declare const corners: (r: Rect) => Point[];
/** True if two boxes touch or overlap. */
export declare function rectsIntersect(a: Rect, b: Rect): boolean;
/** True if any segment of the polyline touches the rectangle (Liang–Barsky clipping). */
export declare function polylineHitsRect(points: readonly Point[], r: Rect): boolean;
/** The distance from a point to the nearest segment of a polyline. Infinite without points. */
export declare function distanceToPolyline(points: readonly Point[], x: number, y: number): number;
/** True if a point lies inside a closed polygon (even-odd rule). */
export declare function polygonContains(points: readonly Point[], p: Point): boolean;
