/** A position in scene coordinates, or in the coordinates of a group. */
export type Point = {x: number; y: number}
/** An axis-aligned box. */
export type Rect = {x: number; y: number; width: number; height: number}
/**
 * How a `ww-path` between two ends is laid out: a straight line, a step (two
 * turns, in the middle), a cubic curve that leaves and arrives along the sides
 * of its ends, an `arc` (a quadratic curve bent by the path's `bend`) or an
 * `orthogonal` line that goes around the other nodes of the scene.
 */
export type Route = "straight" | "step" | "curve" | "arc" | "orthogonal"
/** Translation and uniform scale: what a `ww-group` and the view of a viewport apply. */
export type Transform = {x: number; y: number; k: number}

/** The transform that changes nothing. */
export const IDENTITY: Transform = {x: 0, y: 0, k: 1}

/** A point of the inner coordinates in the outer ones. */
export const apply = (t: Transform, p: Point): Point => ({x: t.x + p.x * t.k, y: t.y + p.y * t.k})
/** A point of the outer coordinates in the inner ones. */
export const invert = (t: Transform, p: Point): Point => ({x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k})
/** `inner` applied first, then `outer`. */
export const compose = (outer: Transform, inner: Transform): Transform => ({x: outer.x + inner.x * outer.k, y: outer.y + inner.y * outer.k, k: outer.k * inner.k})
/** The nearest multiple of `grid`. Without a grid the value itself. */
export const snap = (value: number, grid: number) => (grid > 0 ? Math.round(value / grid) * grid : value)

/** `M x y L x y …` for a polyline. */
export function polyline(points: readonly Point[], closed = false): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("") + (closed && points.length ? "Z" : "")
}

/** A line of a path: a polyline, or one quadratic or cubic Bezier curve. Everything a renderer needs of it is derived from this. */
export type Curve = {type: "poly"; points: Point[]} | {type: "quad"; a: Point; c: Point; b: Point} | {type: "cubic"; a: Point; c1: Point; c2: Point; b: Point}

/** A line from `a` to `b`. */
export const lineCurve = (a: Point, b: Point): Curve => ({type: "poly", points: [a, b]})

/**
 * A line from `a` to `b`. `da` and `db` are the directions the two ends face
 * (unit vectors, away from their node); a step or a curve leaves and arrives
 * along them.
 */
export function routeCurve(a: Point, b: Point, kind: "straight" | "step" | "curve", da: Point, db: Point): Curve {
  if(kind === "step") {
    const points = da.y !== 0 ? [a, {x: a.x, y: (a.y + b.y) / 2}, {x: b.x, y: (a.y + b.y) / 2}, b] : [a, {x: (a.x + b.x) / 2, y: a.y}, {x: (a.x + b.x) / 2, y: b.y}, b]
    return {type: "poly", points}
  }
  if(kind === "curve") {
    const reach = Math.max(24, Math.hypot(b.x - a.x, b.y - a.y) * 0.4)
    return {type: "cubic", a, c1: {x: a.x + da.x * reach, y: a.y + da.y * reach}, c2: {x: b.x + db.x * reach, y: b.y + db.y * reach}, b}
  }
  return lineCurve(a, b)
}

/**
 * A line from `a` to `b`. `da` and `db` are the directions the two ends face
 * (unit vectors, away from their node); a step or a curve leaves and arrives
 * along them. Returns SVG path data and the same line as a polyline.
 */
export function route(a: Point, b: Point, kind: Route, da: Point, db: Point): {d: string; points: Point[]} {
  const curve = routeCurve(a, b, kind === "step" || kind === "curve" ? kind : "straight", da, db)
  return {d: curveD(curve), points: curveSamples(curve)}
}

const lerp = (a: Point, b: Point, t: number): Point => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t})
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const unit = (a: Point): Point => {
  const length = Math.hypot(a.x, a.y)
  return length ? {x: a.x / length, y: a.y / length} : {x: 0, y: 0}
}

/** The first point of a curve. */
export const curveStart = (c: Curve): Point => (c.type === "poly" ? c.points[0] : c.a)
/** The last point of a curve. */
export const curveEnd = (c: Curve): Point => (c.type === "poly" ? c.points[c.points.length - 1] : c.b)

/** SVG path data of a curve. */
export function curveD(c: Curve): string {
  if(c.type === "poly") return polyline(c.points)
  if(c.type === "quad") return `M${c.a.x} ${c.a.y}Q${c.c.x} ${c.c.y} ${c.b.x} ${c.b.y}`
  return `M${c.a.x} ${c.a.y}C${c.c1.x} ${c.c1.y} ${c.c2.x} ${c.c2.y} ${c.b.x} ${c.b.y}`
}

/** The point of a Bezier curve at `t`. */
function bezierAt(c: Exclude<Curve, {type: "poly"}>, t: number): Point {
  const u = 1 - t
  if(c.type === "quad") return {x: u * u * c.a.x + 2 * u * t * c.c.x + t * t * c.b.x, y: u * u * c.a.y + 2 * u * t * c.c.y + t * t * c.b.y}
  return {
    x: u * u * u * c.a.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * c.b.x,
    y: u * u * u * c.a.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * c.b.y,
  }
}

/** The point of a polyline at `t`, a fraction of its length. */
function polyAt(points: readonly Point[], t: number): Point {
  if(points.length === 1) return points[0]
  const lengths = points.slice(1).map((p, i) => dist(points[i], p))
  let left = lengths.reduce((sum, length) => sum + length, 0) * Math.min(1, Math.max(0, t))
  for(let i = 0; i < lengths.length; i++) {
    if(left <= lengths[i] || i === lengths.length - 1) return lerp(points[i], points[i + 1], lengths[i] ? Math.min(1, left / lengths[i]) : 0)
    left -= lengths[i]
  }
  return points[points.length - 1]
}

/**
 * The point at `t`. A Bezier curve is walked by its parameter, a polyline by
 * the fraction of its length.
 */
export function curveAt(c: Curve, t: number): Point {
  return c.type === "poly" ? polyAt(c.points, t) : bezierAt(c, t)
}

/** The curve as a polyline: its own points, or `steps` + 1 points of a Bezier curve. */
export function curveSamples(c: Curve, steps = 16): Point[] {
  if(c.type === "poly") return c.points
  const points: Point[] = []
  for(let i = 0; i <= steps; i++) points.push(bezierAt(c, i / steps))
  return points
}

/** The part of a curve between the parameters `t0` and `t1` (`0 <= t0 < t1 <= 1`). */
export function curveBetween(c: Curve, t0: number, t1: number): Curve {
  if(t0 <= 0 && t1 >= 1) return c
  if(c.type === "poly") {
    const lengths = c.points.slice(1).map((p, i) => dist(c.points[i], p))
    const total = lengths.reduce((sum, length) => sum + length, 0)
    const [from, to] = [t0 * total, t1 * total]
    const points: Point[] = [polyAt(c.points, t0)]
    let walked = 0
    for(let i = 0; i < lengths.length; i++) {
      walked += lengths[i]
      if(walked > from + 1e-9 && walked < to - 1e-9) points.push(c.points[i + 1])
    }
    points.push(polyAt(c.points, t1))
    return {type: "poly", points}
  }
  // De Casteljau: split at t1, then split the first part at t0 / t1.
  const split = (points: Point[], t: number): [Point[], Point[]] => {
    const left: Point[] = [points[0]]
    const right: Point[] = [points[points.length - 1]]
    let level = points
    while(level.length > 1) {
      level = level.slice(1).map((p, i) => lerp(level[i], p, t))
      left.push(level[0])
      right.unshift(level[level.length - 1])
    }
    return [left, right]
  }
  const control = c.type === "quad" ? [c.a, c.c, c.b] : [c.a, c.c1, c.c2, c.b]
  const first = t1 < 1 ? split(control, t1)[0] : control
  const part = t0 > 0 ? split(first, t0 / t1)[1] : first
  return part.length === 3 ? {type: "quad", a: part[0], c: part[1], b: part[2]} : {type: "cubic", a: part[0], c1: part[1], c2: part[2], b: part[3]}
}

const SCAN = 64

/**
 * The curve without the parts that lie inside the shapes at its two ends, which
 * are given as tests of a point. A curve that is inside one of them from end to
 * end, or whose ends cross, leaves nothing: null.
 */
export function clipCurve(c: Curve, insideStart: ((p: Point) => boolean) | null, insideEnd: ((p: Point) => boolean) | null): Curve | null {
  let t0 = 0
  let t1 = 1
  if(insideStart) {
    let i = 0
    while(i <= SCAN && insideStart(curveAt(c, i / SCAN))) i++
    if(i > SCAN) return null
    if(i > 0) {
      let [inside, outside] = [(i - 1) / SCAN, i / SCAN]
      for(let n = 0; n < 24; n++) {
        const middle = (inside + outside) / 2
        if(insideStart(curveAt(c, middle))) inside = middle
        else outside = middle
      }
      t0 = outside
    }
  }
  if(insideEnd) {
    let i = SCAN
    while(i >= 0 && insideEnd(curveAt(c, i / SCAN))) i--
    if(i < 0) return null
    if(i < SCAN) {
      let [inside, outside] = [(i + 1) / SCAN, i / SCAN]
      for(let n = 0; n < 24; n++) {
        const middle = (inside + outside) / 2
        if(insideEnd(curveAt(c, middle))) inside = middle
        else outside = middle
      }
      t1 = outside
    }
  }
  return t0 < t1 ? curveBetween(c, t0, t1) : null
}

/**
 * The curve shortened so that it ends `length` before its end point, measured
 * in a straight line from that point. At least a tenth of it is kept.
 */
export function trimCurveEnd(c: Curve, length: number): Curve {
  return trimmed(c, length, false)
}
/** Like `trimCurveEnd`, at the start. */
export function trimCurveStart(c: Curve, length: number): Curve {
  return trimmed(c, length, true)
}

function trimmed(c: Curve, length: number, atStart: boolean): Curve {
  if(length <= 0) return c
  const end = atStart ? curveStart(c) : curveEnd(c)
  let i = 1
  // The first sample, from the end, that is at least `length` away.
  while(i <= SCAN && dist(curveAt(c, atStart ? i / SCAN : 1 - i / SCAN), end) < length) i++
  const limit = 0.9
  if(i > SCAN) return atStart ? curveBetween(c, limit, 1) : curveBetween(c, 0, 1 - limit)
  let [near, far] = [(i - 1) / SCAN, i / SCAN]
  for(let n = 0; n < 24; n++) {
    const middle = (near + far) / 2
    if(dist(curveAt(c, atStart ? middle : 1 - middle), end) < length) near = middle
    else far = middle
  }
  const t = Math.min(limit, far)
  return atStart ? curveBetween(c, t, 1) : curveBetween(c, 0, 1 - t)
}

/** The point at a distance along a polyline, and the unit direction of the line there. The distance is clamped to the line. */
export function pointAlong(points: readonly Point[], distance: number): {at: Point; direction: Point} {
  if(points.length < 2) return {at: points[0] ?? {x: 0, y: 0}, direction: {x: 1, y: 0}}
  let left = Math.max(0, distance)
  for(let i = 0; i < points.length - 1; i++) {
    const length = dist(points[i], points[i + 1])
    if(left <= length || i === points.length - 2) {
      const t = length ? Math.min(1, left / length) : 0
      const direction = length ? unit({x: points[i + 1].x - points[i].x, y: points[i + 1].y - points[i].y}) : {x: 1, y: 0}
      return {at: lerp(points[i], points[i + 1], t), direction}
    }
    left -= length
  }
  return {at: points[points.length - 1], direction: {x: 1, y: 0}}
}

/** The length of a polyline. */
export const polylineLength = (points: readonly Point[]): number => points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0)

// ── The outline of a node ─────────────────────────────────────────────────

/** How a node is outlined where a path ends at it. */
export type OutlineKind = "rect" | "rounded" | "circle" | "ellipse"
/** A node's outline: its box, and the radius of its corners for `rounded`. */
export type Outline = {kind: OutlineKind; x: number; y: number; width: number; height: number; radius: number}

/** True if a point lies in a node's outline (its border included). */
export function outlineContains(o: Outline, p: Point): boolean {
  const [hw, hh] = [o.width / 2, o.height / 2]
  const [dx, dy] = [Math.abs(p.x - (o.x + hw)), Math.abs(p.y - (o.y + hh))]
  if(o.kind === "circle") return Math.hypot(dx, dy) <= Math.min(hw, hh)
  if(o.kind === "ellipse") return hw > 0 && hh > 0 && (dx / hw) ** 2 + (dy / hh) ** 2 <= 1
  if(dx > hw || dy > hh) return false
  const r = o.kind === "rounded" ? Math.min(o.radius, hw, hh) : 0
  if(r <= 0 || dx <= hw - r || dy <= hh - r) return true
  return Math.hypot(dx - (hw - r), dy - (hh - r)) <= r
}

/** The point where a ray from the centre of an outline, along a unit direction, meets its border. */
export function outlineEdge(o: Outline, direction: Point): Point {
  const centre = {x: o.x + o.width / 2, y: o.y + o.height / 2}
  let [inside, outside] = [0, o.width + o.height + 1]
  for(let n = 0; n < 32; n++) {
    const middle = (inside + outside) / 2
    if(outlineContains(o, {x: centre.x + direction.x * middle, y: centre.y + direction.y * middle})) inside = middle
    else outside = middle
  }
  return {x: centre.x + direction.x * inside, y: centre.y + direction.y * inside}
}

/** The unit vector of the side of a box that faces a direction: the axis that the direction follows most. */
export const dominantSide = (d: Point): Point => (Math.abs(d.x) >= Math.abs(d.y) ? {x: Math.sign(d.x) || 1, y: 0} : {x: 0, y: Math.sign(d.y)})

// ── Routes ────────────────────────────────────────────────────────────────

/** The control point of the arc between two points: the middle of the chord, moved sideways by `bend` times its length. A positive bend is to the left of the way from `a` to `b`. */
export function arcControl(a: Point, b: Point, bend: number): Point {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  return {x: (a.x + b.x) / 2 + dy * bend, y: (a.y + b.y) / 2 - dx * bend}
}

/** The angle, in degrees, that a loop spreads to both sides of its direction. */
const LOOP_SPREAD = 40

/**
 * A loop from a point back to a point, leaving and arriving about the direction
 * `angle` (degrees, 0 up, clockwise). `reach` is how far its tip is to be from
 * the middle of the two points.
 */
export function loopCurve(a: Point, b: Point, angle: number, reach: number): Curve {
  const radians = ((angle - 90) * Math.PI) / 180
  const spread = (LOOP_SPREAD * Math.PI) / 180
  const length = reach / (0.75 * Math.cos(spread))
  const along = (turn: number) => ({x: Math.cos(radians + turn) * length, y: Math.sin(radians + turn) * length})
  const [left, right] = [along(-spread), along(spread)]
  return {type: "cubic", a, c1: {x: a.x + left.x, y: a.y + left.y}, c2: {x: b.x + right.x, y: b.y + right.y}, b}
}

/** True if a segment, horizontal or vertical, crosses a box. */
function segmentHits(a: Point, b: Point, box: Rect): boolean {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)]
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  return x1 > box.x && x0 < box.x + box.width && y1 > box.y && y0 < box.y + box.height
}

/**
 * A line of horizontal and vertical segments from `a` to `b` that goes around
 * boxes. It leaves `a` along `da` and arrives at `b` against `db` (unit vectors
 * along an axis; a zero vector picks the axis from the two points), with two
 * turns. The place of the middle segment is the middle between the ends if
 * that is free; otherwise the free place nearest to it, beside one of the boxes
 * with `gap` between; if there is none, the middle again.
 */
export function orthogonalRoute(a: Point, da: Point, b: Point, db: Point, boxes: readonly Rect[], gap: number): Point[] {
  const horizontal = da.x !== 0 ? true : da.y !== 0 ? false : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  // Work in one orientation: `u` along the first segment, `v` across it.
  const flip = (p: Point): Point => (horizontal ? p : {x: p.y, y: p.x})
  const [fa, fb] = [flip(a), flip(b)]
  const [ua, ub] = [horizontal ? da.x : da.y, horizontal ? db.x : db.y]
  const wrap = (box: Rect): Rect => (horizontal ? box : {x: box.y, y: box.x, width: box.height, height: box.width})
  const flipped = boxes.map(wrap)
  const middle = (fa.x + fb.x) / 2
  const route = (x: number): Point[] => [fa, {x, y: fa.y}, {x, y: fb.y}, fb]
  const free = (points: Point[]) => points.slice(1).every((p, i) => flipped.every(box => !segmentHits(points[i], p, {x: box.x - gap / 2, y: box.y - gap / 2, width: box.width + gap, height: box.height + gap})))
  const candidates = [middle, ...flipped.flatMap(box => [box.x - gap, box.x + box.width + gap])]
    // No turning back into the node an end leaves from, and no stub that is shorter than the gap.
    .filter(x => (ua === 0 || (x - fa.x) * ua >= 0) && (ub === 0 || (x - fb.x) * ub >= 0))
    .sort((p, q) => Math.abs(p - middle) - Math.abs(q - middle))
  const x = candidates.find(candidate => free(route(candidate)))
  if(x !== undefined) return simple(route(x)).map(flip)
  // No free place for the middle segment: leave, go across at a free height, and arrive.
  const stub = (sign: number, towards: number) => gap * (sign || Math.sign(towards) || 1)
  const [x1, x2] = [fa.x + stub(ua, fb.x - fa.x), fb.x + stub(ub, fa.x - fb.x)]
  const detour = (y: number): Point[] => [fa, {x: x1, y: fa.y}, {x: x1, y}, {x: x2, y}, {x: x2, y: fb.y}, fb]
  const heights = flipped.flatMap(box => [box.y - gap, box.y + box.height + gap]).sort((p, q) => Math.abs(p - (fa.y + fb.y) / 2) - Math.abs(q - (fa.y + fb.y) / 2))
  const y = heights.find(candidate => free(detour(candidate)))
  return simple(y === undefined ? route(middle) : detour(y)).map(flip)
}

/** The points of a route without repeats, and without a point in the middle of a straight run. */
const simple = (points: Point[]): Point[] => {
  const apart = points.filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y)
  return apart.filter((p, i, all) => i === 0 || i === all.length - 1 || !((p.x === all[i - 1].x && p.x === all[i + 1].x) || (p.y === all[i - 1].y && p.y === all[i + 1].y)))
}

// ── Markers ───────────────────────────────────────────────────────────────

/** What can sit at an end of a path. */
export type MarkerKind = "none" | "arrow" | "open-arrow" | "triangle" | "triangle-filled" | "diamond" | "diamond-filled" | "circle" | "circle-open"

export const MARKERS: readonly MarkerKind[] = ["none", "arrow", "open-arrow", "triangle", "triangle-filled", "diamond", "diamond-filled", "circle", "circle-open"]

/** A marker as shapes: a closed polygon, an open polyline or a circle. `filled` markers are painted in the stroke colour; the others are outlines. */
export type Marker = {kind: MarkerKind; filled: boolean; polygon: Point[] | null; line: Point[] | null; circle: {x: number; y: number; r: number} | null}

/** The length of a marker for a stroke width, when the style gives no size: 8 pixels and twice the width. */
export const markerSize = (strokeWidth: number): number => 8 + 2 * strokeWidth

/** The length of a marker's body along the line: how far before its tip the path stops. */
export function markerInset(kind: MarkerKind, size: number): number {
  if(kind === "arrow" || kind === "triangle" || kind === "triangle-filled") return size
  if(kind === "diamond" || kind === "diamond-filled") return 1.5 * size
  if(kind === "circle" || kind === "circle-open") return 0.8 * size
  return 0
}

/**
 * The shapes of a marker whose tip is at `tip`. `out` is the unit vector that
 * points along the line, past its end.
 */
export function marker(kind: MarkerKind, tip: Point, out: Point, size: number): Marker | null {
  if(kind === "none") return null
  const side = {x: -out.y, y: out.x}
  const at = (back: number, across: number): Point => ({x: tip.x - out.x * back + side.x * across, y: tip.y - out.y * back + side.y * across})
  const result: Marker = {kind, filled: kind === "arrow" || kind === "triangle-filled" || kind === "diamond-filled" || kind === "circle", polygon: null, line: null, circle: null}
  if(kind === "arrow" || kind === "triangle" || kind === "triangle-filled") result.polygon = [tip, at(size, 0.4 * size), at(size, -0.4 * size)]
  else if(kind === "open-arrow") result.line = [at(size, 0.4 * size), tip, at(size, -0.4 * size)]
  else if(kind === "diamond" || kind === "diamond-filled") result.polygon = [tip, at(0.75 * size, 0.45 * size), at(1.5 * size, 0), at(0.75 * size, -0.45 * size)]
  else {
    const r = 0.4 * size
    const centre = at(r, 0)
    result.circle = {x: centre.x, y: centre.y, r}
  }
  return result
}

/** The outline of a marker as a polygon, for hit tests, selection and extents. */
export function markerPolygon(m: Marker): Point[] {
  if(m.polygon) return m.polygon
  if(m.line) return m.line
  const c = m.circle!
  return Array.from({length: 12}, (_, i) => ({x: c.x + c.r * Math.cos((i / 12) * 2 * Math.PI), y: c.y + c.r * Math.sin((i / 12) * 2 * Math.PI)}))
}

// ── Labels ────────────────────────────────────────────────────────────────

/** Where a label sits against its line. */
export type LabelSide = "on" | "left" | "right" | "above" | "below"

/** A point turned about an origin by `degrees` clockwise (the y axis points down). */
export function turned(p: Point, origin: Point, degrees: number): Point {
  if(!degrees) return p
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)]
  const [dx, dy] = [p.x - origin.x, p.y - origin.y]
  return {x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos}
}

/** The direction a curve leaves its start (`atStart`) or its end in, outwards: a unit vector. */
export function curveDirection(c: Curve, atStart: boolean): Point {
  const points = c.type === "poly" ? (atStart ? c.points : [...c.points].reverse()) : c.type === "quad" ? (atStart ? [c.a, c.c, c.b] : [c.b, c.c, c.a]) : atStart ? [c.a, c.c1, c.c2, c.b] : [c.b, c.c2, c.c1, c.a]
  // The first point that is not the end itself.
  const other = points.slice(1).find(p => p.x !== points[0].x || p.y !== points[0].y) ?? {x: points[0].x - 1, y: points[0].y}
  return unit({x: points[0].x - other.x, y: points[0].y - other.y})
}

/** The four corners of a box of `width` and `height` centred at `x`, `y` and turned by `rotate` degrees. */
export function turnedBox(x: number, y: number, width: number, height: number, rotate: number): Point[] {
  const [cos, sin] = [Math.cos((rotate * Math.PI) / 180), Math.sin((rotate * Math.PI) / 180)]
  return [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([px, py]) => ({x: x + px * cos - py * sin, y: y + px * sin + py * cos}))
}

/**
 * The centre and the angle of a label of a given size on a line. `where` is the
 * fraction of the line's length and `along` pixels more; `gap` is the space
 * between the line and the label box on the other sides than `on`. With
 * `follow` the label is turned to the line and kept upright; otherwise it
 * has the angle `rotate`.
 */
export function placeLabel(
  line: readonly Point[],
  spec: {where: number; along: number; side: LabelSide; gap: number; follow: boolean; rotate: number; width: number; height: number},
): {x: number; y: number; rotate: number} {
  const length = polylineLength(line)
  const {at, direction} = pointAlong(line, Math.min(length, Math.max(0, spec.where * length + spec.along)))
  let rotate = spec.rotate
  if(spec.follow) {
    rotate = (Math.atan2(direction.y, direction.x) * 180) / Math.PI
    // Upright: never upside down.
    if(rotate > 90) rotate -= 180
    else if(rotate <= -90) rotate += 180
  }
  if(spec.side === "on") return {x: at.x, y: at.y, rotate}
  const left = {x: direction.y, y: -direction.x}
  const sign = spec.side === "left" ? 1 : spec.side === "right" ? -1 : spec.side === "above" ? (left.y < -1e-6 || (Math.abs(left.y) <= 1e-6 && left.x > 0) ? 1 : -1) : left.y > 1e-6 || (Math.abs(left.y) <= 1e-6 && left.x < 0) ? 1 : -1
  const normal = {x: left.x * sign, y: left.y * sign}
  const radians = (rotate * Math.PI) / 180
  const [u, v] = [{x: Math.cos(radians), y: Math.sin(radians)}, {x: -Math.sin(radians), y: Math.cos(radians)}]
  const reach = Math.abs(normal.x * u.x + normal.y * u.y) * (spec.width / 2) + Math.abs(normal.x * v.x + normal.y * v.y) * (spec.height / 2)
  return {x: at.x + normal.x * (spec.gap + reach), y: at.y + normal.y * (spec.gap + reach), rotate}
}

/** The box around some points. Null without points. */
export function bounds(points: Iterable<Point>): Rect | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
  for(const {x, y} of points) {
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }
  return left > right ? null : {x: left, y: top, width: right - left, height: bottom - top}
}

/** The four corners of a box, clockwise from its top-left one. */
export const corners = (r: Rect): Point[] => [
  {x: r.x, y: r.y},
  {x: r.x + r.width, y: r.y},
  {x: r.x + r.width, y: r.y + r.height},
  {x: r.x, y: r.y + r.height},
]

/** True if two boxes touch or overlap. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
}

/** True if any segment of the polyline touches the rectangle (Liang–Barsky clipping). */
export function polylineHitsRect(points: readonly Point[], r: Rect): boolean {
  for(let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const dx = points[i + 1].x - a.x
    const dy = points[i + 1].y - a.y
    let t0 = 0
    let t1 = 1
    const edges: [number, number][] = [
      [-dx, a.x - r.x],
      [dx, r.x + r.width - a.x],
      [-dy, a.y - r.y],
      [dy, r.y + r.height - a.y],
    ]
    let inside = true
    for(const [p, q] of edges) {
      if(p === 0) inside &&= q >= 0
      else if(p < 0) t0 = Math.max(t0, q / p)
      else t1 = Math.min(t1, q / p)
    }
    if(inside && t0 <= t1) return true
  }
  return false
}

/** The distance from a point to the nearest segment of a polyline. Infinite without points. */
export function distanceToPolyline(points: readonly Point[], x: number, y: number): number {
  let nearest = points.length === 1 ? Math.hypot(x - points[0].x, y - points[0].y) : Infinity
  for(let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const dx = points[i + 1].x - a.x
    const dy = points[i + 1].y - a.y
    const length = dx * dx + dy * dy
    const t = length ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0
    nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, y - a.y - t * dy))
  }
  return nearest
}

/** True if a point lies inside a closed polygon (even-odd rule). */
export function polygonContains(points: readonly Point[], p: Point): boolean {
  let inside = false
  for(let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = [points[i], points[j]]
    if(a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
