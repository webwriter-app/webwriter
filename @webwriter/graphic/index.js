// presets.ts
var a = (name, label, value, min, max, axis = "x") => ({ name, label, default: value, min, max, axis, point: (values) => axis === "x" ? { x: values[0] ?? value, y: 0 } : { x: 0, y: values[0] ?? value } });
var v = (values, i, fallback) => values[i] ?? fallback;
var polygon = (points) => `M ${points.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`;
var ellipse = (cx = 50, cy = 50, rx = 50, ry = 50) => `M ${cx - rx} ${cy} C ${cx - rx} ${cy - ry * 0.5523} ${cx - rx * 0.5523} ${cy - ry} ${cx} ${cy - ry} C ${cx + rx * 0.5523} ${cy - ry} ${cx + rx} ${cy - ry * 0.5523} ${cx + rx} ${cy} C ${cx + rx} ${cy + ry * 0.5523} ${cx + rx * 0.5523} ${cy + ry} ${cx} ${cy + ry} C ${cx - rx * 0.5523} ${cy + ry} ${cx - rx} ${cy + ry * 0.5523} ${cx - rx} ${cy} Z`;
var piePoint = (sweep) => {
  const angle = (-90 - sweep) * Math.PI / 180;
  return { x: 50 + 50 * Math.cos(angle), y: 50 + 50 * Math.sin(angle) };
};
var rect = (r = 0, inset = 0) => {
  const q = r;
  return `M ${inset + q} ${inset} L ${100 - inset - q} ${inset} Q ${100 - inset} ${inset} ${100 - inset} ${inset + q} L ${100 - inset} ${100 - inset - q} Q ${100 - inset} ${100 - inset} ${100 - inset - q} ${100 - inset} L ${inset + q} ${100 - inset} Q ${inset} ${100 - inset} ${inset} ${100 - inset - q} L ${inset} ${inset + q} Q ${inset} ${inset} ${inset + q} ${inset} Z`;
};
var base = (label, category, draw, adjustments) => ({ label, category, adjustments, draw });
var cornerControl = (name, corner, index, value) => ({
  name,
  label: `${corner.replace("-", " ")} corner`,
  default: value,
  min: 0,
  max: 50,
  axis: "x",
  corner,
  point: (values) => ({ x: corner.endsWith("right") ? 100 - values[index] : values[index], y: corner.startsWith("bottom") ? 100 : 0 })
});
var roundedCorners = ([tl = 12, tr = tl, br = tl, bl = tl]) => `M ${tl} 0 L ${100 - tr} 0 Q 100 0 100 ${tr} L 100 ${100 - br} Q 100 100 ${100 - br} 100 L ${bl} 100 Q 0 100 0 ${100 - bl} L 0 ${tl} Q 0 0 ${tl} 0 Z`;
var roundedCornerControls = (value) => [
  cornerControl("radius", "top-left", 0, value),
  cornerControl("radius-top-right", "top-right", 1, value),
  cornerControl("radius-bottom-right", "bottom-right", 2, value),
  cornerControl("radius-bottom-left", "bottom-left", 3, value)
];
var star = (n, inner = 38) => (values) => {
  const ri = v(values, 0, inner);
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : 48;
    const t = -Math.PI / 2 + i * Math.PI / n;
    p.push([50 + r * Math.cos(t), 50 + r * Math.sin(t)]);
  }
  return polygon(p);
};
var poi = (name, label, value, min, max, point, axis = "x") => ({
  name,
  label,
  default: value,
  min,
  max,
  axis,
  point: (values) => point(values[0])
});
var turn = (path, quarters, reflectY = false) => {
  const numbers = /[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g;
  const values = Array.from(path.matchAll(numbers), (m) => Number(m[0]));
  for (let i2 = 0; i2 < values.length; i2 += 2) {
    if (reflectY) values[i2 + 1] = 100 - values[i2 + 1];
    for (let j = 0; j < quarters; j++) [values[i2], values[i2 + 1]] = [100 - values[i2 + 1], values[i2]];
  }
  let i = 0;
  return path.replace(numbers, () => String(values[i++]));
};
var prohibitedPath = (radius) => {
  const q = Math.SQRT1_2, k = 4 / 3 * Math.tan((Math.PI / 4 + Math.atan2(0.6, 0.8)) / 4);
  const point = (x, y) => `${50 + radius * x} ${50 + radius * y}`;
  const hole = `M ${point(-0.8, -0.6)} C ${point(-0.8 - 0.6 * k, -0.6 + 0.8 * k)} ${point(-q * (1 + k), q * (1 - k))} ${point(-q, q)} C ${point(-q * (1 - k), q * (1 + k))} ${point(0.6 - 0.8 * k, 0.8 + 0.6 * k)} ${point(0.6, 0.8)} Z`;
  return `${ellipse()} ${hole} ${turn(hole, 2)}`;
};
var blockArrow = (label, direction) => base(label, "Block arrows", ([d]) => turn(polygon([
  [0, 34],
  [100 - d, 34],
  [100 - d, 0],
  [100, 50],
  [100 - d, 100],
  [100 - d, 66],
  [0, 66]
]), direction), [poi(
  "head",
  "Head depth",
  30,
  10,
  65,
  (p) => direction === 1 ? { x: 100, y: 100 - p } : direction === 2 ? { x: p, y: 100 } : { x: 0, y: p },
  direction % 2 ? "y" : "x"
)]);
var quadArrow = (t, callout = false) => {
  const quarter = callout ? [[50, 0], [70, 18], [50 + t, 18], [50 + t, 30], [70, 30], [70, 50 - t], [82, 50 - t], [82, 30]] : [[50, 0], [70, 20], [50 + t, 20], [50 + t, 50 - t], [80, 50 - t], [80, 30]];
  const points = [];
  for (let q = 0; q < 4; q++) for (const source of quarter) {
    let [x, y] = source;
    for (let i = 0; i < q; i++) [x, y] = [100 - y, x];
    points.push([x, y]);
  }
  return polygon(points);
};
var curvedArrow = (label, direction) => base(label, "Block arrows", ([t]) => turn(
  `M 90 0 C -20 0 -20 85 70 85 L 70 100 L 100 75 L 70 50 L 70 ${85 - t} C ${t} ${85 - t} ${t} ${t} 90 ${t} Z`,
  direction
), [poi("thickness", "Band thickness", 14, 5, 25, (p) => direction === 0 ? { x: 90, y: p } : direction === 1 ? { x: 100 - p, y: 90 } : direction === 2 ? { x: 10, y: 100 - p } : { x: p, y: 10 }, direction % 2 ? "x" : "y")]);
var arrowCallout = (label, direction) => base(label, "Block arrows", ([d]) => turn(polygon([
  [0, 0],
  [d, 0],
  [d, 40],
  [80, 40],
  [80, 25],
  [100, 50],
  [80, 75],
  [80, 60],
  [d, 60],
  [d, 100],
  [0, 100]
]), direction), [poi("box", "Box width", 65, 30, 75, (p) => direction === 0 ? { x: p, y: 0 } : direction === 1 ? { x: 100, y: p } : direction === 2 ? { x: 100 - p, y: 100 } : { x: 0, y: 100 - p }, direction % 2 ? "y" : "x")]);
var crossPath = (t) => polygon([[50 - t / 2, 0], [50 + t / 2, 0], [50 + t / 2, 50 - t / 2], [100, 50 - t / 2], [100, 50 + t / 2], [50 + t / 2, 50 + t / 2], [50 + t / 2, 100], [50 - t / 2, 100], [50 - t / 2, 50 + t / 2], [0, 50 + t / 2], [0, 50 - t / 2], [50 - t / 2, 50 - t / 2]]);
var roundFlow = (r) => `M 0 50 C 0 ${50 - r} ${50 - r} 0 50 0 C ${50 + r} 0 100 ${50 - r} 100 50 C 100 ${50 + r} ${50 + r} 100 50 100 C ${50 - r} 100 0 ${50 + r} 0 50 Z`;
var flowchartCurvature = poi("curvature", "Curvature", 27.615, 0, 50, (p) => ({ x: 25 - 0.375 * p, y: 25 - 0.375 * p }));
var roundFlowSymbol = (label, detail) => {
  const draw = (r) => `${roundFlow(r)} ${detail}`;
  return {
    preset: base(label, "Flowchart", () => draw(flowchartCurvature.default), []),
    legacy: {
      definition: base(label, "Flowchart", ([r]) => draw(r), [flowchartCurvature]),
      upgrade: () => []
    }
  };
};
var summingJunction = roundFlowSymbol("Summing junction", "M 15 15 L 85 85 M 15 85 L 85 15");
var orSymbol = roundFlowSymbol("Or", "M 0 50 L 100 50 M 50 0 L 50 100");
var legacyRoundFlowPresets = {
  "summing-junction": summingJunction.legacy,
  "or": orSymbol.legacy
};
var cylinderPath = (d) => `M 0 ${d} C 0 ${-d / 3} 100 ${-d / 3} 100 ${d} L 100 ${100 - d} C 100 ${100 + d / 3} 0 ${100 + d / 3} 0 ${100 - d} Z M 0 ${d} C 0 ${d * 7 / 3} 100 ${d * 7 / 3} 100 ${d}`;
var irregularStar = (n, inner, variant) => polygon(Array.from({ length: n * 2 }, (_, i) => {
  const theta = -Math.PI / 2 + i * Math.PI / n;
  const radius = i % 2 ? inner : 40 + (i * 7 + variant * 3) % 11;
  return [50 + radius * Math.cos(theta), 50 + radius * Math.sin(theta)];
}));
var starPreset = (n, inner) => base(`${n}-point star`, "Stars and banners", star(n), [poi("inner", "Inner radius", inner, 0, 48, (p) => ({ x: 50 + p * Math.sin(Math.PI / n), y: 50 - p * Math.cos(Math.PI / n) }))]);
var ribbonOutline = (d) => `M 20 ${20 - d / 2} L 80 ${20 - d / 2} L 80 30 L 100 30 L 90 55 L 100 80 L 80 80 L 65 65 L 35 65 L 20 80 L 0 80 L 10 55 L 0 30 L 20 30 Z`;
var ribbonPreset = (label, down, curved) => base(label, "Stars and banners", ([d]) => {
  const path = curved ? `M 20 15 Q 50 ${15 + d} 80 15 L 80 30 L 100 25 L 90 50 L 100 75 L 80 70 L 80 80 Q 50 ${80 + d} 20 80 L 20 70 L 0 75 L 10 50 L 0 25 L 20 30 Z M 20 30 L 20 70 M 80 30 L 80 70 M 20 70 L 35 80 M 80 70 L 65 80` : `M 20 ${20 - d / 2} L 80 ${20 - d / 2} L 80 30 L 100 30 L 90 55 L 100 80 L 65 80 L 65 65 L 35 65 L 35 80 L 0 80 L 10 55 L 0 30 L 20 30 Z M 80 30 L 80 65 L 20 65 L 20 30 M 20 65 L 35 80 M 80 65 L 65 80`;
  return down ? turn(path, 2) : path;
}, [poi("fold", curved ? "Ribbon curve" : "Fold depth", 15, 0, curved ? 28 : 40, (p) => ({ x: 50, y: down ? curved ? 85 - p / 2 : 80 + p / 2 : curved ? 15 + p / 2 : 20 - p / 2 }), "y")]);
var scrollPath = (radius) => {
  const k = radius * 4 / 3 * (Math.SQRT2 - 1);
  const near = 20 + radius, far = 100 - radius, diameter = 2 * radius;
  const halfOutline = `L ${far} 0
    C ${far + k} 0 100 ${radius - k} 100 ${radius}
    C 100 ${radius + k} ${far + k} ${diameter} ${far} ${diameter}
    L 80 ${diameter} L 80 ${far}
    C 80 ${far + k} ${80 - radius + k} 100 ${80 - radius} 100`;
  const end = `M ${near} 0
    C ${near + k} 0 ${near + radius} ${radius - k} ${near + radius} ${radius}
    C ${near + radius} ${radius + k} ${near + k} ${diameter} ${near} ${diameter}
    C ${near - k} ${diameter} 20 ${radius + k} 20 ${radius}
    M ${near} ${diameter} L 80 ${diameter}`;
  return `M ${near} 0 ${halfOutline} ${turn(halfOutline, 2)} Z ${end} ${turn(end, 2)}`;
};
var legacyRibbonPath = (d) => `${ribbonOutline(d)} M 20 30 L 20 65 L 80 65 L 80 30 M 20 65 L 35 80 M 80 65 L 65 80`;
var legacyScrollPath = (d) => `M 20 ${d} Q 20 0 30 0 L 95 0 Q 100 ${d} 90 ${d} L 80 ${d} L 80 ${100 - d} Q 80 100 70 100 L 5 100 Q 0 ${100 - d} 10 ${100 - d} L 20 ${100 - d} Z M 30 0 Q 40 ${d} 30 ${d} L 20 ${d} M 70 100 Q 60 ${100 - d} 70 ${100 - d} L 80 ${100 - d}`;
var legacyRibbonSeams = (d) => `${ribbonOutline(d)} M 20 30 L 20 80 M 80 30 L 80 80 M 20 65 L 80 65`;
var legacyBannerPaths = {
  "ribbon-up": [([d]) => legacyRibbonPath(d), ([d]) => legacyRibbonSeams(d)],
  "ribbon-down": [([d]) => turn(legacyRibbonPath(d), 2), ([d]) => turn(legacyRibbonSeams(d), 2)],
  "vertical-scroll": [([d]) => legacyScrollPath(d)],
  "horizontal-scroll": [([d]) => turn(legacyScrollPath(d), 1)]
};
var cloudBubble = () => "M 12 60 C -5 60 -3 38 10 35 C -2 18 12 10 25 15 C 28 -3 46 -3 50 10 C 63 -3 78 0 78 15 C 96 5 105 20 92 33 C 110 40 100 58 88 58 C 88 78 68 80 60 67 C 48 83 32 78 30 65 C 17 78 7 73 12 60 Z";
var cloudCoordinates = cloudBubble().match(/-?\d+/g).map(Number);
var cloudPoints = Array.from({ length: cloudCoordinates.length / 2 }, (_, i) => ({ x: cloudCoordinates[i * 2], y: cloudCoordinates[i * 2 + 1] }));
var cloudPath = (inner) => {
  const offset = (point) => ({ x: (point.x - 50) * (inner / 30 - 1), y: (point.y - 40) * (inner / 30 - 1) });
  const first = cloudPoints[0], delta = offset(first);
  let path = `M ${first.x + delta.x} ${first.y + delta.y}`;
  for (let i = 1; i < cloudPoints.length; i += 3) {
    const [start, a2, b, end] = cloudPoints.slice(i - 1, i + 3), from = offset(start), to = offset(end);
    path += ` C ${a2.x + (-2 * from.x + to.x) / 3} ${a2.y + (-2 * from.y + to.y) / 3} ${b.x + (from.x - 2 * to.x) / 3} ${b.y + (from.y - 2 * to.y) / 3} ${end.x + to.x} ${end.y + to.y}`;
  }
  return `${path} Z`;
};
var legacyCloudPreset = {
  definition: base("Cloud", "Basic shapes", ([p]) => cloudBubble().replace("46 -3", `46 ${p}`), [
    poi("puff", "Cloud lobe", -3, -10, 10, (p) => ({ x: 37.125, y: 2 + 0.375 * p }), "y")
  ]),
  upgrade: (_values) => [30]
};
var legacyChordPreset = {
  definition: base(
    "Chord",
    "Basic shapes",
    ([p]) => `M ${p} 0 C 0 0 0 100 50 100 C 75 100 90 88 100 75 Z`,
    [poi("chord", "Chord endpoint", 50, 20, 80, (p) => ({ x: p, y: 0 }))]
  ),
  upgrade: ([p]) => {
    const start = (Math.atan2(50 - p, 50) * 180 / Math.PI + 360) % 360;
    return [start, (Math.atan2(-1, -0.5) * 180 / Math.PI - start + 720) % 360];
  }
};
var legacyCalloutPreset = (label, form) => base(label, "Callouts", ([p]) => {
  if (form === "oval") return `M 0 38 C 0 -12 100 -12 100 38 C 100 60 75 75 48 75 L ${p} 100 L 28 69 C 10 64 0 55 0 38 Z`;
  if (form === "rounded") return `M 12 0 L 88 0 Q 100 0 100 12 L 100 63 Q 100 75 88 75 L 45 75 L ${p} 100 L 25 75 L 12 75 Q 0 75 0 63 L 0 12 Q 0 0 12 0 Z`;
  return `M 0 0 L 100 0 L 100 75 L 45 75 L ${p} 100 L 25 75 L 0 75 Z`;
}, [poi("tail", "Tail tip", 18, 0, 100, (p) => ({ x: p, y: 100 }))]);
var calloutPoint = (name, label, x, y, index, offset = [0, 0]) => [
  {
    name: `${name}-x`,
    label: `${label} X`,
    default: x,
    min: -150,
    max: 250,
    axis: "x",
    pairedWith: `${name}-y`,
    point: (values) => ({ x: values[index] + offset[0], y: values[index + 1] + offset[1] })
  },
  {
    name: `${name}-y`,
    label: `${label} Y`,
    default: y,
    min: -150,
    max: 250,
    axis: "y",
    point: (values) => ({ x: values[index] + offset[0], y: values[index + 1] + offset[1] })
  }
];
var calloutControls = (start, end, roundness, oval = false, startOffset = [0, 0]) => [
  ...calloutPoint("start", "Connector start", ...start, 0, startOffset),
  ...calloutPoint("end", "Connector end", ...end, 2),
  {
    name: "roundness",
    label: oval ? "Bubble roundness" : "Corner roundness",
    default: roundness,
    min: 0,
    max: oval ? 50 : 35,
    axis: "x",
    point: (values) => oval ? { x: 25 - 0.375 * values[4], y: 18.75 - 0.28125 * values[4] } : { x: values[4], y: 0 }
  }
];
var independentCalloutPreset = (label, form) => base(label, "Callouts", ([sx, sy, ex, ey, r]) => {
  if (form === "oval") return `M 0 37.5 C 0 ${37.5 - r * 0.75} ${50 - r} 0 50 0 C ${50 + r} 0 100 ${37.5 - r * 0.75} 100 37.5 C 100 ${37.5 + r * 0.75} ${50 + r} 75 ${sx + 10} ${sy + 3} L ${ex} ${ey} L ${sx - 10} ${sy - 3} C ${50 - r} 75 0 ${37.5 + r * 0.75} 0 37.5 Z`;
  return `M ${r} 0 L ${100 - r} 0 Q 100 0 100 ${r} L 100 ${75 - r} Q 100 75 ${100 - r} 75 L ${sx + 10} ${sy} L ${ex} ${ey} L ${sx - 10} ${sy} L ${r} 75 Q 0 75 0 ${75 - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}, calloutControls(form === "oval" ? [38, 72] : [35, 75], [18, 100], form === "oval" ? 27.6 : form === "rounded" ? 12 : 0, form === "oval", [10, form === "oval" ? 3 : 0]));
var speechBubbleTypes = ["rectangular-callout", "rounded-rectangular-callout", "oval-callout"];
var connectedCalloutTypes = [...speechBubbleTypes, "cloud-callout", "line-callout-1", "line-callout-2"];
var isConnectedCalloutType = (type) => connectedCalloutTypes.includes(type);
var isSpeechBubbleType = (type) => speechBubbleTypes.includes(type);
var bubblePoint = (x, y) => ({ x, y });
var bubbleTurn = ({ x, y }, quarters) => {
  for (let i = 0; i < quarters; i++) [x, y] = [100 - y / 75 * 100, x / 100 * 75];
  return { x, y };
};
var bubbleDirection = (x, y) => (Math.round((Math.atan2((y - 37.5) / 37.5, (x - 50) / 50) - Math.PI / 2) / (Math.PI / 2) + 1e-6) + 4) % 4;
var bubbleSegments = (oval, r) => oval ? [
  [bubblePoint(0, 37.5), bubblePoint(0, 37.5 - r * 0.75), bubblePoint(50 - r, 0), bubblePoint(50, 0)],
  [bubblePoint(50, 0), bubblePoint(50 + r, 0), bubblePoint(100, 37.5 - r * 0.75), bubblePoint(100, 37.5)],
  [bubblePoint(100, 37.5), bubblePoint(100, 37.5 + r * 0.75), bubblePoint(50 + r, 75), bubblePoint(50, 75)],
  [bubblePoint(50, 75), bubblePoint(50 - r, 75), bubblePoint(0, 37.5 + r * 0.75), bubblePoint(0, 37.5)]
] : [
  [bubblePoint(0, 37.5), bubblePoint(0, r * 0.75)],
  [bubblePoint(0, r * 0.75), bubblePoint(0, 0), bubblePoint(r, 0)],
  [bubblePoint(r, 0), bubblePoint(100 - r, 0)],
  [bubblePoint(100 - r, 0), bubblePoint(100, 0), bubblePoint(100, r * 0.75)],
  [bubblePoint(100, r * 0.75), bubblePoint(100, 37.5)],
  [bubblePoint(100, 37.5), bubblePoint(100, 75 - r * 0.75)],
  [bubblePoint(100, 75 - r * 0.75), bubblePoint(100, 75), bubblePoint(100 - r, 75)],
  [bubblePoint(100 - r, 75), bubblePoint(r, 75)],
  [bubblePoint(r, 75), bubblePoint(0, 75), bubblePoint(0, 75 - r * 0.75)],
  [bubblePoint(0, 75 - r * 0.75), bubblePoint(0, 37.5)]
];
var splitBubbleCurve = (points, t) => {
  const left = [points[0]], right = [points.at(-1)];
  for (let row = points; row.length > 1; ) {
    row = row.slice(1).map((point, i) => bubblePoint(row[i].x + (point.x - row[i].x) * t, row[i].y + (point.y - row[i].y) * t));
    left.push(row[0]);
    right.unshift(row.at(-1));
  }
  return [left, right];
};
var bubbleCommand = (points, direction) => `${["", "L", "Q", "C"][points.length - 1]} ${points.slice(1).map((point) => {
  const p = bubbleTurn(point, direction);
  return `${p.x} ${p.y}`;
}).join(" ")}`;
function speechBubblePrefix(type, r, direction) {
  if (type === "cloud-callout") return cloudLobes(r);
  if (type.startsWith("line-callout-")) return lineBoxPath(r);
  const segments = bubbleSegments(type === "oval-callout", r), start = bubbleTurn(segments[0][0], direction);
  return `M ${start.x} ${start.y} ${segments.slice(0, segments.length / 2).map((segment) => bubbleCommand(segment, direction)).join(" ")}`;
}
function speechBubblePath(type, [ex, ey, r]) {
  const oval = type === "oval-callout", direction = bubbleDirection(ex, ey), tip = bubbleTurn(bubblePoint(ex, ey), (4 - direction) % 4);
  const segments = bubbleSegments(oval, r).slice(oval ? 2 : 5);
  const samples = [];
  let length = 0, previous = segments[0][0];
  segments.forEach((segment, index2) => {
    for (let step = 0; step <= 32; step++) {
      const t = step / 32, point = splitBubbleCurve(segment, t)[0].at(-1);
      const current = bubbleTurn(point, direction), prior = bubbleTurn(previous, direction);
      length += Math.hypot(current.x - prior.x, current.y - prior.y);
      samples.push({ segment: index2, t, point, length });
      previous = point;
    }
  });
  const angle = Math.atan2(tip.y - 37.5, tip.x - 50);
  let closest = samples[0];
  for (const sample of samples) if (Math.abs(Math.atan2(sample.point.y - 37.5, sample.point.x - 50) - angle) < Math.abs(Math.atan2(closest.point.y - 37.5, closest.point.x - 50) - angle)) closest = sample;
  const index = samples.indexOf(closest), neighbor = samples[Math.max(0, Math.min(samples.length - 1, index + (Math.atan2(closest.point.y - 37.5, closest.point.x - 50) < angle ? 1 : -1)))];
  const a2 = Math.atan2(closest.point.y - 37.5, closest.point.x - 50), b = Math.atan2(neighbor.point.y - 37.5, neighbor.point.x - 50);
  const center = closest.length + (neighbor.length - closest.length) * (b === a2 ? 0 : Math.max(0, Math.min(1, (angle - a2) / (b - a2))));
  const at = (distance) => {
    const i = Math.max(1, samples.findIndex((sample) => sample.length >= distance)), left = samples[i - 1], right = samples[i];
    const fraction = right.length === left.length ? 0 : (distance - left.length) / (right.length - left.length);
    return { segment: right.segment, t: left.segment === right.segment ? left.t + (right.t - left.t) * fraction : right.t * fraction };
  };
  const first = at(Math.max(0, center - 10)), last = at(Math.min(length, center + 10));
  const before = segments.slice(0, first.segment), after = segments.slice(last.segment + 1);
  before.push(splitBubbleCurve(segments[first.segment], first.t)[0]);
  const remaining = splitBubbleCurve(segments[last.segment], last.t)[1];
  const end = bubbleTurn(remaining[0], direction);
  return `${speechBubblePrefix(type, r, direction)} ${before.map((segment) => bubbleCommand(segment, direction)).join(" ")} L ${ex} ${ey} L ${end.x} ${end.y} ${[remaining, ...after].map((segment) => bubbleCommand(segment, direction)).join(" ")} Z`;
}
var calloutPreset = (label, form) => {
  const type = form === "oval" ? "oval-callout" : form === "rounded" ? "rounded-rectangular-callout" : "rectangular-callout";
  return base(label, "Callouts", (values) => speechBubblePath(type, values), [
    ...calloutPoint("end", "Connector end", 18, 100, 0),
    {
      name: "roundness",
      label: form === "oval" ? "Bubble roundness" : "Corner roundness",
      default: form === "oval" ? 27.6 : form === "rounded" ? 12 : 0,
      min: 0,
      max: form === "oval" ? 50 : 35,
      axis: "x",
      point: ([ex, ey, r]) => bubbleTurn(form === "oval" ? bubblePoint(25 - 0.375 * r, 18.75 - 0.28125 * r) : bubblePoint(r / 4, r * 3 / 16), bubbleDirection(ex, ey))
    }
  ]);
};
var legacySpeechBubblePresets = Object.fromEntries([
  ["rectangular-callout", "Rectangular callout", "rectangle"],
  ["rounded-rectangular-callout", "Rounded rectangular callout", "rounded"],
  ["oval-callout", "Oval callout", "oval"]
].map(([type, label, form]) => [type, { definition: independentCalloutPreset(label, form), upgrade: ([, , ex, ey, r]) => [ex, ey, r] }]));
var independentLineCalloutPreset = (label, bent) => base(
  label,
  "Callouts",
  ([sx, sy, ex, ey, r]) => `M ${30 + r} 0 L ${100 - r} 0 Q 100 0 100 ${r} L 100 ${75 - r} Q 100 75 ${100 - r} 75 L ${30 + r} 75 Q 30 75 30 ${75 - r} L 30 ${r} Q 30 0 ${30 + r} 0 Z M ${sx} ${sy} ${bent ? `L ${sx - 10} ${sy} ` : ""}L ${ex} ${ey}${bent ? ` L ${sx - 10} ${sy} L ${sx} ${sy}` : ""}`,
  calloutControls([28, 15], [5, 100], 0).map((control) => control.name === "roundness" ? { ...control, point: (values) => ({ x: 30 + values[4], y: 0 }) } : control)
);
var cloudLobes = (frizziness) => {
  const count = 12, step = Math.PI * 2 / count, k = 4 / 3 * Math.tan(step / 4);
  const point = (angle) => ({ x: 50 + 48 * Math.cos(angle), y: 37.5 + 34 * Math.sin(angle) });
  const start = point(-Math.PI / 2 - step / 2);
  let path = `M ${start.x} ${start.y}`;
  for (let i = 0; i < count; i++) {
    const a2 = -Math.PI / 2 - step / 2 + i * step, b = a2 + step, middle = a2 + step / 2;
    const p = point(a2), q = point(b);
    path += ` C ${p.x - 48 * k * Math.sin(a2) + frizziness * Math.cos(middle)} ${p.y + 34 * k * Math.cos(a2) + frizziness * Math.sin(middle)} ${q.x + 48 * k * Math.sin(b) + frizziness * Math.cos(middle)} ${q.y - 34 * k * Math.cos(b) + frizziness * Math.sin(middle)} ${q.x} ${q.y}`;
  }
  return `${path} Z`;
};
var independentThoughtCalloutPreset = base("Cloud callout", "Callouts", ([sx, sy, ex, ey, f]) => `${cloudLobes(f)} ${ellipse(sx, sy, 5, 4)} ${ellipse(ex, ey, 3, 2)}`, [
  ...calloutPoint("start", "Connector start", 22, 86, 0, [5, 0]),
  ...calloutPoint("end", "Connector end", 14, 96, 2, [3, 0]),
  {
    name: "frizziness",
    label: "Cloud frizziness",
    default: 12,
    min: 0,
    max: 30,
    axis: "y",
    point: (values) => ({ x: 50, y: 3.5 - values[4] * 0.75 })
  }
]);
var lineBoxPath = (r) => `M ${30 + r} 0 L ${100 - r} 0 Q 100 0 100 ${r} L 100 ${75 - r} Q 100 75 ${100 - r} 75 L ${30 + r} 75 Q 30 75 30 ${75 - r} L 30 ${r} Q 30 0 ${30 + r} 0 Z`;
function connectorAttachment(path, center, tip) {
  const direction = bubblePoint(tip.x - center.x, tip.y - center.y);
  if (Math.hypot(direction.x, direction.y) < 1e-8) direction.y = 1;
  const cross = (point) => (point.x - center.x) * direction.y - (point.y - center.y) * direction.x;
  let current = center, start = center, best = { point: center, normal: bubblePoint(0, 1), distance: -Infinity };
  for (const match of path.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const numbers = (match[2].match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    const points = Array.from({ length: numbers.length / 2 }, (_, i) => bubblePoint(numbers[i * 2], numbers[i * 2 + 1]));
    if (match[1] === "M") {
      current = start = points[0];
      continue;
    }
    const curve = [current, ...match[1] === "Z" ? [start] : points];
    for (let step = 1; step <= 32; step++) {
      let lo = (step - 1) / 32, hi = step / 32;
      const first = cross(splitBubbleCurve(curve, lo)[0].at(-1)), last = cross(splitBubbleCurve(curve, hi)[0].at(-1));
      if (first * last > 0) continue;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2, value = cross(splitBubbleCurve(curve, mid)[0].at(-1));
        if (first * value > 0) lo = mid;
        else hi = mid;
      }
      const t = (lo + hi) / 2, point = splitBubbleCurve(curve, t)[0].at(-1);
      const distance = ((point.x - center.x) * direction.x + (point.y - center.y) * direction.y) / (direction.x ** 2 + direction.y ** 2);
      if (distance < 0 || distance <= best.distance) continue;
      const derivative = curve.slice(1).map((point2, i) => bubblePoint(point2.x - curve[i].x, point2.y - curve[i].y));
      const tangent = splitBubbleCurve(derivative, t)[0].at(-1), length = Math.hypot(tangent.x, tangent.y);
      if (length < 1e-8) continue;
      best = { point, normal: bubblePoint(tangent.y / length, -tangent.x / length), distance };
    }
    current = curve.at(-1);
  }
  return best;
}
function constrainCalloutTip(type, values, previous) {
  const cloud = type === "cloud-callout";
  if (!cloud && !isSpeechBubbleType(type)) return values;
  const [x, y, roundness] = values;
  const center = bubblePoint(50, 37.5);
  const segments = cloud ? [] : bubbleSegments(type === "oval-callout", roundness);
  const body = cloud ? cloudLobes(roundness) : `M 0 37.5 ${segments.map((segment) => bubbleCommand(segment, 0)).join(" ")} Z`;
  let dx = x - center.x, dy = y - center.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    dx = previous[0] - center.x;
    dy = previous[1] - center.y;
    if (Math.hypot(dx, dy) < 1e-6) dy = 1;
  }
  const directionLength = Math.hypot(dx, dy);
  dx /= directionLength;
  dy /= directionLength;
  const tip = bubblePoint(center.x + dx, center.y + dy);
  let edge = connectorAttachment(body, center, tip).distance;
  if (cloud) {
    edge = Math.max(edge, connectorAttachment(body, bubblePoint(center.x + 3, center.y), bubblePoint(tip.x + 3, tip.y)).distance);
  }
  const minimum = edge + (cloud ? 4 : 0.5);
  if (length >= minimum) return values;
  return [center.x + dx * minimum, center.y + dy * minimum, roundness];
}
var lineCalloutPreset = (label, bent) => base(label, "Callouts", ([ex, ey, r]) => {
  const body = lineBoxPath(r), { point: start, normal } = connectorAttachment(body, bubblePoint(65, 37.5), bubblePoint(ex, ey));
  const elbow = bubblePoint(start.x + normal.x * 10, start.y + normal.y * 10);
  return `${body} M ${start.x} ${start.y} ${bent ? `L ${elbow.x} ${elbow.y} ` : ""}L ${ex} ${ey}${bent ? ` L ${elbow.x} ${elbow.y} L ${start.x} ${start.y}` : ""}`;
}, [
  ...calloutPoint("end", "Connector end", 5, 100, 0),
  { name: "roundness", label: "Corner roundness", default: 0, min: 0, max: 35, axis: "x", point: ([, , r]) => ({ x: 30 + r, y: 0 }) }
]);
var thoughtCalloutPreset = base("Cloud callout", "Callouts", ([ex, ey, f]) => {
  const body = cloudLobes(f), { point } = connectorAttachment(body, bubblePoint(50, 37.5), bubblePoint(ex, ey));
  const start = bubblePoint(point.x + (ex - point.x) * 0.6, point.y + (ey - point.y) * 0.6);
  return `${body} ${ellipse(start.x, start.y, 5, 4)} ${ellipse(ex, ey, 3, 2)}`;
}, [
  ...calloutPoint("end", "Connector end", 14, 96, 0, [3, 0]),
  { name: "frizziness", label: "Cloud frizziness", default: 12, min: 0, max: 30, axis: "y", point: ([, , f]) => ({ x: 50, y: 3.5 - f * 0.75 }) }
]);
Object.assign(legacySpeechBubblePresets, {
  "cloud-callout": { definition: independentThoughtCalloutPreset, upgrade: ([, , ex, ey, f]) => [ex, ey, f] },
  "line-callout-1": { definition: independentLineCalloutPreset("Line callout 1", false), upgrade: ([, , ex, ey, r]) => [ex, ey, r] },
  "line-callout-2": { definition: independentLineCalloutPreset("Line callout 2", true), upgrade: ([, , ex, ey, r]) => [ex, ey, r] }
});
var legacyCalloutPresets = {
  "rectangular-callout": { definition: legacyCalloutPreset("Rectangular callout", "rectangle"), upgrade: ([p]) => [p, 100, 0] },
  "rounded-rectangular-callout": { definition: legacyCalloutPreset("Rounded rectangular callout", "rounded"), upgrade: ([p]) => [p, 100, 12] },
  "oval-callout": { definition: legacyCalloutPreset("Oval callout", "oval"), upgrade: ([p]) => [p, 100, 27.6] },
  "cloud-callout": { definition: base("Cloud callout", "Callouts", ([p]) => `${cloudBubble()} ${ellipse(22, 86, 5, 4)} ${ellipse(p, 96, 3, 2)}`, [poi("tail", "Thought tail position", 14, 4, 45, (p) => ({ x: p, y: 96 }))]), upgrade: ([p]) => [p, 96, 12] },
  "line-callout-1": { definition: base("Line callout 1", "Callouts", ([p]) => `M 30 0 L 100 0 L 100 75 L 30 75 Z M 28 15 L ${p} 100`, [poi("tail", "Leader endpoint", 5, 0, 25, (p) => ({ x: p, y: 100 }))]), upgrade: ([p]) => [p, 100, 0] },
  "line-callout-2": { definition: base("Line callout 2", "Callouts", ([p]) => `M 30 0 L 100 0 L 100 75 L 30 75 Z M 28 15 L 18 15 L ${p} 100`, [poi("tail", "Leader endpoint", 5, 0, 25, (p) => ({ x: p, y: 100 }))]), upgrade: ([p]) => [p, 100, 0] }
};
var tapeTailHeight = poi("tail", "Tail height", 45 * (1 - Math.SQRT1_2), 4, 30, (height) => ({ x: 100, y: 90 - height }), "y");
var legacySequentialStoragePreset = {
  definition: base(
    "Sequential access storage",
    "Flowchart",
    ([height]) => `${ellipse(45, 45, 45, 45)} M 45 90 L 100 90 L 100 ${90 - height} L 75 ${90 - height}`,
    [poi("tail", "Tail height", 10, 0, 90, (height) => ({ x: 100, y: 90 - height }), "y")]
  ),
  upgrade: ([height]) => [Math.max(tapeTailHeight.min, Math.min(tapeTailHeight.max, height))]
};
var originalGraphicShapePresets = {
  "straight-arrow": { ...base("Straight arrow", "Lines", ([p]) => `M 0 0 L 100 100 M ${100 - p} 100 L 100 100 L 100 ${100 - p}`, [poi("head", "Arrowhead size", 22, 8, 40, (p) => ({ x: 100 - p, y: 100 }))]), open: true },
  "double-arrow": { ...base("Double arrow", "Lines", ([p]) => `M 0 0 L 100 100 M ${100 - p} 100 L 100 100 L 100 ${100 - p} M 0 ${p} L 0 0 L ${p} 0`, [poi("head", "Arrowhead size", 22, 8, 40, (p) => ({ x: p, y: 0 }))]), open: true },
  "elbow-connector": { ...base("Elbow connector", "Lines", (values) => {
    const d = v(values, 0, 50);
    return `M 10 15 L ${d} 15 L ${d} 85 L 90 85`;
  }, [poi("bend", "Bend", 50, 10, 90, (p) => ({ x: p, y: 15 }))]), open: true },
  "elbow-connector-arrow": { ...base("Elbow connector arrow", "Lines", ([p]) => `M 0 0 L ${p} 0 L ${p} 85 L 100 85 M 85 70 L 100 85 L 85 100`, [poi("bend", "Bend", 50, 0, 100, (p) => ({ x: p, y: 0 }))]), open: true },
  "elbow-connector-double-arrow": { ...base("Elbow connector double arrow", "Lines", ([p]) => `M 0 15 L ${p} 15 L ${p} 85 L 100 85 M 85 70 L 100 85 L 85 100 M 15 0 L 0 15 L 15 30`, [poi("bend", "Bend", 50, 0, 100, (p) => ({ x: p, y: 15 }))]), open: true },
  "curved-connector": { ...base("Curved connector", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100 - p} 100 100 100`, [poi("bend", "Bend", 80, 0, 100, (p) => ({ x: 15.625 + 0.28125 * p, y: 15.625 }))]), open: true },
  "curved-connector-arrow": { ...base("Curved connector arrow", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100 - p} 100 100 100 M 85 85 L 100 100 L 82 100`, [poi("bend", "Bend", 80, 0, 100, (p) => ({ x: 15.625 + 0.28125 * p, y: 15.625 }))]), open: true },
  "curved-connector-double-arrow": { ...base("Curved connector double arrow", "Lines", ([p]) => `M 0 0 C ${p} 0 ${100 - p} 100 100 100 M 85 85 L 100 100 L 82 100 M 15 15 L 0 0 L 18 0`, [poi("bend", "Bend", 80, 0, 100, (p) => ({ x: 15.625 + 0.28125 * p, y: 15.625 }))]), open: true },
  "curve": { ...base("Curve", "Lines", ([p]) => `M 0 70 C 20 0 ${p} 0 50 50 C ${100 - p} 100 80 100 100 70`, [poi("curve", "Curve control", 40, 0, 100, (p) => ({ x: 13.75 + 0.375 * p, y: 15 }))]), open: true },
  "square-rectangle": base("Rectangle", "Rectangles", roundedCorners, roundedCornerControls(0)),
  "rounded-rectangle": base("Rounded rectangle", "Rectangles", roundedCorners, roundedCornerControls(12)),
  "snip-one": base("Snip one corner", "Rectangles", ([tl = 15]) => polygon([[tl, 0], [100, 0], [100, 100], [0, 100], [0, tl]]), [cornerControl("snip", "top-left", 0, 15)]),
  "snip-same-side": base("Snip same side", "Rectangles", ([tl = 15, tr = tl]) => polygon([[tl, 0], [100 - tr, 0], [100, tr], [100, 100], [0, 100], [0, tl]]), [cornerControl("snip", "top-left", 0, 15), cornerControl("snip-top-right", "top-right", 1, 15)]),
  "snip-diagonal": base("Snip diagonal", "Rectangles", ([tl = 15, br = tl]) => polygon([[tl, 0], [100, 0], [100, 100 - br], [100 - br, 100], [0, 100], [0, tl]]), [cornerControl("snip", "top-left", 0, 15), cornerControl("snip-bottom-right", "bottom-right", 1, 15)]),
  "snip-round": base("Snip round", "Rectangles", ([tl = 15, br = tl]) => `M ${tl} 0 L 100 0 L 100 ${100 - br} Q 100 100 ${100 - br} 100 L 0 100 L 0 ${tl} Z`, [cornerControl("snip", "top-left", 0, 15), cornerControl("radius-bottom-right", "bottom-right", 1, 15)]),
  "round-one": base("Round one corner", "Rectangles", ([tl = 12]) => `M ${tl} 0 L 100 0 L 100 100 L 0 100 L 0 ${tl} Q 0 0 ${tl} 0 Z`, [cornerControl("radius", "top-left", 0, 12)]),
  "round-same-side": base("Round same side", "Rectangles", ([tl = 12, tr = tl]) => `M ${tl} 0 L ${100 - tr} 0 Q 100 0 100 ${tr} L 100 100 L 0 100 L 0 ${tl} Q 0 0 ${tl} 0 Z`, [cornerControl("radius", "top-left", 0, 12), cornerControl("radius-top-right", "top-right", 1, 12)]),
  "round-diagonal": base("Round diagonal", "Rectangles", ([tl = 12, br = tl]) => `M ${tl} 0 L 100 0 L 100 ${100 - br} Q 100 100 ${100 - br} 100 L 0 100 L 0 ${tl} Q 0 0 ${tl} 0 Z`, [cornerControl("radius", "top-left", 0, 12), cornerControl("radius-bottom-right", "bottom-right", 1, 12)]),
  "text-box": { ...base("Text box", "Basic shapes", (values) => rect(v(values, 0, 4)), [a("radius", "Radius", 4, 0, 15)]), contentSize: { maxWidth: 480, padding: 8 } },
  "right-triangle": base("Right triangle", "Basic shapes", ([p]) => polygon([[p, 0], [100, 100], [0, 100]]), [poi("apex", "Apex position", 0, 0, 100, (p) => ({ x: p, y: 0 }))]),
  "parallelogram": base("Parallelogram", "Basic shapes", (values) => {
    const d = v(values, 0, 18);
    return polygon([[d, 0], [100, 0], [100 - d, 100], [0, 100]]);
  }, [a("slant", "Slant", 18, 0, 50)]),
  "trapezoid": base("Trapezoid", "Basic shapes", (values) => {
    const d = v(values, 0, 25);
    return polygon([[d, 0], [100 - d, 0], [100, 100], [0, 100]]);
  }, [a("top-inset", "Top inset", 25, 0, 50)]),
  "pentagon": base("Pentagon", "Basic shapes", (values) => {
    const d = v(values, 0, 38);
    return polygon([[50, 0], [100, d], [82, 100], [18, 100], [0, d]]);
  }, [poi("shoulder", "Shoulder height", 38, 0, 50, (p) => ({ x: 100, y: p }), "y")]),
  "heptagon": base("Heptagon", "Basic shapes", (values) => {
    const d = v(values, 0, 19);
    return polygon([[50, 0], [89, d], [98, 62], [72, 100], [28, 100], [2, 62], [11, d]]);
  }, [poi("shoulder", "Shoulder height", 19, 0, 62, (p) => ({ x: 89, y: p }), "y")]),
  "octagon": base("Octagon", "Basic shapes", (values) => {
    const d = v(values, 0, 25);
    return polygon([[d, 0], [100 - d, 0], [100, d], [100, 100 - d], [100 - d, 100], [d, 100], [0, 100 - d], [0, d]]);
  }, [a("corner", "Corner", 25, 0, 50)]),
  "decagon": base("Decagon", "Basic shapes", (values) => {
    const d = v(values, 0, 7);
    return polygon([[50, 0], [79, d], [98, 35], [98, 65], [79, 93], [50, 100], [21, 93], [2, 65], [2, 35], [21, d]]);
  }, [poi("shoulder", "Shoulder height", 7, 0, 35, (p) => ({ x: 79, y: p }), "y")]),
  "dodecagon": base("Dodecagon", "Basic shapes", (values) => {
    const d = v(values, 0, 13);
    return polygon([[37, 0], [63, 0], [87, d], [100, 37], [100, 63], [87, 87], [63, 100], [37, 100], [13, 87], [0, 63], [0, 37], [13, d]]);
  }, [poi("shoulder", "Shoulder height", 13, 0, 37, (p) => ({ x: 87, y: p }), "y")]),
  "pie": base("Pie", "Basic shapes", ([sweep]) => {
    const middle = piePoint(sweep / 2), end = piePoint(sweep);
    return `M 50 50 L 50 0 A 50 50 0 0 0 ${middle.x} ${middle.y} A 50 50 0 0 0 ${end.x} ${end.y} Z`;
  }, [{ name: "sweep", label: "Slice angle", default: 270, min: 0, max: 360, axis: "angle", point: (values) => piePoint(values[0]) }]),
  "chord": base("Chord", "Basic shapes", ([start, sweep]) => {
    const first = piePoint(start), middle = piePoint(start + sweep / 3), last = piePoint(start + sweep);
    return `M ${first.x} ${first.y} A 50 50 0 0 0 ${middle.x} ${middle.y} A 50 50 0 ${sweep > 270 ? 1 : 0} 0 ${last.x} ${last.y} Z`;
  }, [
    { name: "start-angle", label: "Start endpoint", default: 0, min: 0, max: 360, axis: "angle", point: (values) => piePoint(values[0]) },
    { name: "sweep", label: "End endpoint", default: 240, min: 0.5, max: 360, axis: "angle", point: (values) => piePoint(values[0] + values[1]) }
  ]),
  "teardrop": base("Teardrop", "Basic shapes", (values) => `M 50 0 C 75 32 95 52 82 78 C 68 ${100 - v(values, 0, 6)} 32 ${100 - v(values, 0, 6)} 18 78 C 5 52 25 32 50 0 Z`, [poi("bulge", "Bulge", 6, 0, 25, (p) => ({ x: 50, y: 94.5 - 0.75 * p }), "y")]),
  "frame": base("Frame", "Basic shapes", (values) => `${rect(0)} ${rect(0, v(values, 0, 15))}`, [poi("thickness", "Frame thickness", 15, 0, 50, (p) => ({ x: p, y: p }))]),
  "half-frame": base("Half frame", "Basic shapes", ([d]) => polygon([[0, 0], [100, 0], [100 - d, d], [d, d], [d, 100 - d], [0, 100]]), [poi("thickness", "Frame thickness", 25, 0, 50, (p) => ({ x: p, y: p }))]),
  "corner": base("L corner", "Basic shapes", ([d]) => polygon([[0, 0], [d, 0], [d, 100 - d], [100, 100 - d], [100, 100], [0, 100]]), [poi("thickness", "Arm thickness", 35, 0, 100, (p) => ({ x: p, y: 0 }))]),
  "diagonal-stripe": base("Diagonal stripe", "Basic shapes", ([d]) => polygon([[100 - d, 0], [100, 0], [0, 100], [0, 100 - d]]), [poi("width", "Stripe width", 40, 0, 100, (p) => ({ x: 100 - p, y: 0 }))]),
  "plus": base("Plus", "Basic shapes", (values) => {
    const d = v(values, 0, 30);
    return polygon([[d, 0], [100 - d, 0], [100 - d, d], [100, d], [100, 100 - d], [100 - d, 100 - d], [100 - d, 100], [d, 100], [d, 100 - d], [0, 100 - d], [0, d], [d, d]]);
  }, [a("arm", "Arm width", 30, 0, 50)]),
  "plaque": base("Plaque", "Basic shapes", ([r]) => `M ${r} 0 L ${100 - r} 0 Q ${100 - r} ${r} 100 ${r} L 100 ${100 - r} Q ${100 - r} ${100 - r} ${100 - r} 100 L ${r} 100 Q ${r} ${100 - r} 0 ${100 - r} L 0 ${r} Q ${r} ${r} ${r} 0 Z`, [poi("radius", "Corner cutout", 18, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "cylinder": base("Cylinder", "Basic shapes", (values) => {
    const d = v(values, 0, 16);
    return `M 5 ${d + 2} C 5 2 95 2 95 ${d + 2} L 95 ${100 - d} C 95 98 5 98 5 ${100 - d} Z M 5 ${d + 2} C 5 ${d * 2 + 2} 95 ${d * 2 + 2} 95 ${d + 2}`;
  }, [poi("depth", "Cap depth", 16, 0, 50, (p) => ({ x: 5, y: p + 2 }), "y")]),
  "cube": base("Cube", "Basic shapes", ([d]) => `M ${d} 0 L 100 0 L 100 ${100 - d} L ${100 - d} 100 L 0 100 L 0 ${d} Z M 0 ${d} L ${100 - d} ${d} L 100 0 M ${100 - d} ${d} L ${100 - d} 100`, [poi("depth", "Depth", 25, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "donut": base("Donut", "Basic shapes", (values) => `${ellipse()} ${ellipse(50, 50, v(values, 0, 25), v(values, 0, 25))}`, [poi("hole", "Hole radius", 25, 0, 50, (p) => ({ x: 50 + p, y: 50 }))]),
  "prohibited": base("No / prohibited", "Basic shapes", ([r]) => prohibitedPath(r), [poi("hole", "Inner radius", 35, 0, 50, (p) => ({ x: 50 - p * Math.SQRT1_2, y: 50 + p * Math.SQRT1_2 }))]),
  "block-arc": base("Block arc", "Basic shapes", ([r]) => `M 0 100 C 0 -33.333 100 -33.333 100 100 L ${50 + r} 100 C ${50 + r} ${100 - r * 2.66666} ${50 - r} ${100 - r * 2.66666} ${50 - r} 100 Z`, [poi("inner", "Inner radius", 30, 0, 50, (p) => ({ x: 50 + p, y: 100 }))]),
  "folded-corner": base("Folded corner", "Basic shapes", ([d]) => `M 0 0 L 100 0 L 100 ${100 - d} L ${100 - d} 100 L 0 100 Z M 100 ${100 - d} L ${100 - d} ${100 - d} L ${100 - d} 100`, [poi("fold", "Fold size", 18, 0, 50, (p) => ({ x: 100 - p, y: 100 }))]),
  "heart": base("Heart", "Basic shapes", (values) => {
    const d = v(values, 0, 22);
    return `M 50 90 C 42 80 5 55 5 28 C 5 5 35 0 50 ${d} C 65 0 95 5 95 28 C 95 55 58 80 50 90 Z`;
  }, [poi("cleft", "Cleft depth", 22, 0, 50, (p) => ({ x: 50, y: p }), "y")]),
  "lightning-bolt": base("Lightning bolt", "Basic shapes", ([left = 20, right = 18]) => polygon([[55, 0], [left, 55], [45, 55], [35, 100], [100 - right, 38], [55, 38]]), [
    { name: "width", label: "Left corner", default: 20, min: 5, max: 35, axis: "x", opposite: "right-width", point: (values) => ({ x: values[0], y: 55 }) },
    { name: "right-width", label: "Right corner", default: 18, min: 5, max: 35, axis: "x", opposite: "width", point: (values) => ({ x: 100 - values[1], y: 38 }) }
  ]),
  "sun": base("Sun", "Basic shapes", ([r]) => `${ellipse(50, 50, 25, 25)} ${Array.from({ length: 8 }, (_, i) => {
    const t = i * Math.PI / 4;
    return polygon([[50 + 48 * Math.cos(t), 50 + 48 * Math.sin(t)], [50 + r * Math.cos(t - 0.2), 50 + r * Math.sin(t - 0.2)], [50 + r * Math.cos(t + 0.2), 50 + r * Math.sin(t + 0.2)]]);
  }).join(" ")}`, [poi("ray", "Ray inner radius", 34, 25, 48, (p) => ({ x: 50 + p * Math.cos(0.2), y: 50 + p * Math.sin(0.2) }))]),
  "moon": base("Moon", "Basic shapes", ([phase]) => {
    const control = 50 + (phase - 50) * 0.5523;
    return `M 50 0 C 22.385 0 0 22.385 0 50 C 0 77.615 22.385 100 50 100 C ${control} 100 ${phase} 77.615 ${phase} 50 C ${phase} 22.385 ${control} 0 50 0 Z`;
  }, [poi("phase", "Moon phase", 20, 0, 100, (p) => ({ x: p, y: 50 }))]),
  "cloud": base("Cloud", "Basic shapes", ([inner]) => cloudPath(inner), [poi("inner", "Inner radius", 30, 0, 38, (p) => ({ x: 50 + 28 * p / 30, y: 40 - 25 * p / 30 }))]),
  "arc": { ...base("Arc", "Basic shapes", ([p]) => `M 0 0 C ${p} 0 100 ${100 - p} 100 100`, [poi("curve", "Curve control", 55.23, 0, 100, (p) => ({ x: 50 + 0.375 * p, y: 50 - 0.375 * p }))]), open: true },
  "parentheses": { ...base("Parentheses pair", "Basic shapes", (values) => {
    const d = v(values, 0, 20);
    return `M 38 5 C ${38 - d} 25 ${38 - d} 75 38 95 M 62 5 C ${62 + d} 25 ${62 + d} 75 62 95`;
  }, [poi("curve", "Curve", 20, 0, 38, (p) => ({ x: 38 - 0.75 * p, y: 50 }))]), open: true },
  "braces": { ...base("Braces pair", "Basic shapes", (values) => {
    const d = v(values, 0, 12);
    return `M 42 5 Q ${42 - d} 5 32 25 L 32 40 Q 32 50 20 50 Q 32 50 32 60 L 32 75 Q ${42 - d} 95 42 95 M 58 5 Q ${58 + d} 5 68 25 L 68 40 Q 68 50 80 50 Q 68 50 68 60 L 68 75 Q ${58 + d} 95 58 95`;
  }, [poi("curve", "Curve", 12, 0, 42, (p) => ({ x: 39.5 - 0.5 * p, y: 10 }))]), open: true },
  "left-bracket": { ...base("Left bracket", "Basic shapes", ([r]) => `M 75 0 L ${25 + r} 0 Q 25 0 25 ${r} L 25 ${100 - r} Q 25 100 ${25 + r} 100 L 75 100`, [poi("radius", "Corner radius", 0, 0, 50, (p) => ({ x: 25 + p, y: 0 }))]), open: true },
  "right-bracket": { ...base("Right bracket", "Basic shapes", ([r]) => `M 25 0 L ${75 - r} 0 Q 75 0 75 ${r} L 75 ${100 - r} Q 75 100 ${75 - r} 100 L 25 100`, [poi("radius", "Corner radius", 0, 0, 50, (p) => ({ x: 75 - p, y: 0 }))]), open: true },
  "left-brace": { ...base("Left brace", "Basic shapes", (values) => `M 70 5 Q 52 5 52 25 L 52 40 Q 52 50 ${v(values, 0, 25)} 50 Q 52 50 52 60 L 52 75 Q 52 95 70 95`, [poi("width", "Brace width", 25, 0, 52, (p) => ({ x: p, y: 50 }))]), open: true },
  "right-brace": { ...base("Right brace", "Basic shapes", (values) => `M 30 5 Q 48 5 48 25 L 48 40 Q 48 50 ${100 - v(values, 0, 25)} 50 Q 48 50 48 60 L 48 75 Q 48 95 30 95`, [poi("width", "Brace width", 25, 0, 100, (p) => ({ x: 100 - p, y: 50 }))]), open: true },
  "left-arrow": blockArrow("Left arrow", 2),
  "up-arrow": blockArrow("Up arrow", 3),
  "down-arrow": blockArrow("Down arrow", 1),
  "left-right-arrow": base("Left-right arrow", "Block arrows", ([d]) => polygon([[0, 50], [d, 0], [d, 34], [100 - d, 34], [100 - d, 0], [100, 50], [100 - d, 100], [100 - d, 66], [d, 66], [d, 100]]), [poi("head", "Head depth", 25, 8, 44, (p) => ({ x: p, y: 0 }))]),
  "up-down-arrow": base("Up-down arrow", "Block arrows", ([d]) => turn(polygon([[0, 50], [d, 0], [d, 34], [100 - d, 34], [100 - d, 0], [100, 50], [100 - d, 100], [100 - d, 66], [d, 66], [d, 100]]), 1), [poi("head", "Head depth", 25, 8, 44, (p) => ({ x: 100, y: p }), "y")]),
  "quad-arrow": base("Quad arrow", "Block arrows", ([t]) => quadArrow(t), [poi("shaft", "Shaft half-width", 10, 4, 16, (p) => ({ x: 50 + p, y: 25 }))]),
  "left-right-up-arrow": base("Left-right-up arrow", "Block arrows", ([t]) => polygon([[0, 65], [25, 40], [25, 55], [50 - t, 55], [50 - t, 25], [25, 25], [50, 0], [75, 25], [50 + t, 25], [50 + t, 55], [75, 55], [75, 40], [100, 65], [75, 90], [75, 75], [25, 75], [25, 90]]), [poi("shaft", "Shaft half-width", 10, 4, 18, (p) => ({ x: 50 + p, y: 25 }))]),
  "bent-arrow": base("Bent arrow", "Block arrows", ([t]) => `M 0 100 L 0 40 Q 0 10 30 10 L 70 10 L 70 0 L 100 25 L 70 50 L 70 ${10 + t} L 30 ${10 + t} Q ${t} ${10 + t} ${t} 40 L ${t} 100 Z`, [poi("thickness", "Shaft thickness", 20, 8, 30, (p) => ({ x: p, y: 100 }))]),
  "u-turn-arrow": base("U-turn arrow", "Block arrows", ([t]) => `M 0 100 L 0 38 C 0 -12 80 -12 80 38 L 80 60 L 100 60 L 70 90 L 40 60 L ${80 - t} 60 L ${80 - t} 38 C ${80 - t} ${-12 + t} ${t} ${-12 + t} ${t} 38 L ${t} 100 Z`, [poi("thickness", "Shaft thickness", 18, 8, 28, (p) => ({ x: p, y: 100 }))]),
  "left-up-arrow": base("Left-up arrow", "Block arrows", ([t]) => polygon([[0, 75], [25, 50], [25, 65], [65, 65], [65, 25], [50, 25], [75, 0], [100, 25], [85, 25], [85, 85], [25, 85], [25, 100]]).replace("65 65", `${65 - t} ${65 - t}`).replace("65 25", `${65 - t} 25`).replace("25 65", `25 ${65 - t}`), [poi("thickness", "Bend thickness", 0, -10, 15, (p) => ({ x: 65 - p, y: 65 - p }))]),
  "bent-up-arrow": base("Bent-up arrow", "Block arrows", ([t]) => polygon([[0, 100], [0, 100 - t], [65, 100 - t], [65, 25], [50, 25], [75, 0], [100, 25], [85, 25], [85, 100]]), [poi("thickness", "Base thickness", 20, 8, 40, (p) => ({ x: 0, y: 100 - p }), "y")]),
  "curved-left-arrow": curvedArrow("Curved left arrow", 2),
  "curved-right-arrow": curvedArrow("Curved right arrow", 0),
  "curved-up-arrow": curvedArrow("Curved up arrow", 3),
  "curved-down-arrow": curvedArrow("Curved down arrow", 1),
  "striped-right-arrow": base("Striped right arrow", "Block arrows", ([d]) => `M 25 35 L ${100 - d} 35 L ${100 - d} 0 L 100 50 L ${100 - d} 100 L ${100 - d} 65 L 25 65 Z M 0 35 L 5 35 L 5 65 L 0 65 Z M 12 35 L 19 35 L 19 65 L 12 65 Z`, [poi("head", "Head depth", 30, 15, 55, (p) => ({ x: 100 - p, y: 0 }))]),
  "notched-right-arrow": base("Notched right arrow", "Block arrows", ([d]) => polygon([[0, 30], [65, 30], [65, 0], [100, 50], [65, 100], [65, 70], [0, 70], [d, 50]]), [poi("notch", "Notch depth", 15, 3, 40, (p) => ({ x: p, y: 50 }))]),
  "home-plate": base("Pentagon arrow", "Block arrows", ([d]) => polygon([[0, 0], [100 - d, 0], [100, 50], [100 - d, 100], [0, 100]]), [poi("head", "Point depth", 30, 5, 70, (p) => ({ x: 100 - p, y: 0 }))]),
  "chevron": base("Chevron", "Block arrows", ([d]) => polygon([[0, 0], [100 - d, 0], [100, 50], [100 - d, 100], [0, 100], [d, 50]]), [poi("depth", "Point depth", 30, 5, 48, (p) => ({ x: p, y: 50 }))]),
  "right-arrow-callout": arrowCallout("Right arrow callout", 0),
  "down-arrow-callout": arrowCallout("Down arrow callout", 1),
  "left-arrow-callout": arrowCallout("Left arrow callout", 2),
  "up-arrow-callout": arrowCallout("Up arrow callout", 3),
  "left-right-arrow-callout": base("Left-right arrow callout", "Block arrows", ([d]) => polygon([[0, 50], [18, 30], [18, 42], [d, 42], [d, 15], [100 - d, 15], [100 - d, 42], [82, 42], [82, 30], [100, 50], [82, 70], [82, 58], [100 - d, 58], [100 - d, 85], [d, 85], [d, 58], [18, 58], [18, 70]]), [poi("inset", "Box inset", 30, 20, 40, (p) => ({ x: p, y: 15 }))]),
  "quad-arrow-callout": base("Quad arrow callout", "Block arrows", ([t]) => quadArrow(t, true), [poi("shaft", "Shaft half-width", 7, 3, 12, (p) => ({ x: 50 + p, y: 18 }))]),
  "circular-arrow": base("Circular arrow", "Block arrows", ([t]) => `M 10 70 C -10 30 15 0 50 0 C 75 0 95 20 95 45 L 100 45 L 85 68 L 65 45 L ${95 - t} 45 C ${95 - t} ${20 + t} 75 ${t} 50 ${t} C ${15 + t} ${t} ${t} 30 ${10 + t} 70 Z`, [poi("thickness", "Band thickness", 12, 5, 22, (p) => ({ x: 50, y: p }), "y")]),
  "equation-plus": base("Plus sign", "Equation shapes", ([t]) => crossPath(t), [poi("thickness", "Bar thickness", 24, 0, 100, (p) => ({ x: 50 + p / 2, y: 0 }))]),
  "equation-minus": base("Minus", "Equation shapes", ([r]) => `M ${r} 38 L ${100 - r} 38 Q 100 38 100 ${38 + r} L 100 ${62 - r} Q 100 62 ${100 - r} 62 L ${r} 62 Q 0 62 0 ${62 - r} L 0 ${38 + r} Q 0 38 ${r} 38 Z`, [poi("roundness", "Corner roundness", 0, 0, 12, (p) => ({ x: p, y: 38 }))]),
  "multiply": base("Multiply", "Equation shapes", ([t]) => polygon([[t, 0], [50, 50 - t], [100 - t, 0], [100, t], [50 + t, 50], [100, 100 - t], [100 - t, 100], [50, 50 + t], [t, 100], [0, 100 - t], [50 - t, 50], [0, t]]), [poi("thickness", "Bar width", 20, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "divide": base("Divide", "Equation shapes", ([r]) => `M 0 40 L 100 40 L 100 60 L 0 60 Z ${ellipse(50, 15, r, r)} ${ellipse(50, 85, r, r)}`, [poi("dot", "Dot radius", 10, 0, 15, (p) => ({ x: 50 + p, y: 15 }))]),
  "equal": base("Equal", "Equation shapes", ([t]) => `M 0 15 L 100 15 L 100 ${15 + t} L 0 ${15 + t} Z M 0 ${85 - t} L 100 ${85 - t} L 100 85 L 0 85 Z`, [poi("thickness", "Bar thickness", 20, 0, 35, (p) => ({ x: 50, y: 15 + p }), "y")]),
  "not-equal": { ...base("Not equal", "Equation shapes", ([s]) => `M 0 25 L ${50 - s} 25 L ${65 - s} 0 L 80 0 L 65 25 L 100 25 L 100 42 L 55 42 L 45 58 L 100 58 L 100 75 L 35 75 L 20 100 L ${5 + s} 100 L ${20 + s} 75 L 0 75 L 0 58 L ${30 + s} 58 L ${40 + s} 42 L 0 42 Z`, [poi("slash", "Slash width", 0, -5, 5, (p) => ({ x: 50 - p, y: 25 }))]) },
  "process": base("Process", "Flowchart", ([r]) => rect(r), [poi("roundness", "Corner roundness", 0, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "alternate-process": base("Alternate process", "Flowchart", ([r]) => rect(r), [poi("radius", "Corner radius", 15, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "decision": base("Decision", "Flowchart", ([p]) => polygon([[p, 0], [100, 50], [p, 100], [0, 50]]), [poi("apex", "Apex position", 50, 0, 100, (p) => ({ x: p, y: 0 }))]),
  "data": base("Data", "Flowchart", ([s]) => polygon([[s, 0], [100, 0], [100 - s, 100], [0, 100]]), [poi("slant", "Slant", 20, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "predefined-process": base("Predefined process", "Flowchart", ([m]) => `${rect()} M ${m} 0 L ${m} 100 M ${100 - m} 0 L ${100 - m} 100`, [poi("margin", "Side margin", 12, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "internal-storage": base("Internal storage", "Flowchart", ([m]) => `${rect()} M ${m} 0 L ${m} 100 M 0 ${m} L 100 ${m}`, [poi("margin", "Header margin", 15, 0, 50, (p) => ({ x: p, y: p }))]),
  "document": base("Document", "Flowchart", ([d]) => `M 0 0 L 100 0 L 100 85 C 65 ${85 - d} 35 ${85 + d} 0 85 Z`, [poi("wave", "Wave depth", 20, 0, 35, (p) => ({ x: 25.46875, y: 85 + 0.28125 * p }), "y")]),
  "multidocument": base("Multiple documents", "Flowchart", ([d]) => `M 0 15 L 85 15 L 85 85 C 55 ${85 - d} 30 ${85 + d} 0 85 Z M 8 8 L 93 8 L 93 78 M 15 0 L 100 0 L 100 70`, [poi("wave", "Wave depth", 15, 0, 30, (p) => ({ x: 21.71875, y: 85 + 0.28125 * p }), "y")]),
  "terminator": base("Terminator", "Flowchart", ([r]) => `M ${r} 25 L ${100 - r} 25 C 100 25 100 75 ${100 - r} 75 L ${r} 75 C 0 75 0 25 ${r} 25 Z`, [poi("roundness", "End roundness", 25, 0, 50, (p) => ({ x: p, y: 25 }))]),
  "preparation": base("Preparation", "Flowchart", ([p]) => polygon([[p, 0], [100 - p, 0], [100, 50], [100 - p, 100], [p, 100], [0, 50]]), [poi("point", "Point depth", 22, 0, 50, (p) => ({ x: p, y: 0 }))]),
  "manual-input": base("Manual input", "Flowchart", ([s]) => polygon([[0, s], [100, 0], [100, 100], [0, 100]]), [poi("slope", "Top slope", 22, 0, 100, (p) => ({ x: 0, y: p }), "y")]),
  "manual-operation": base("Manual operation", "Flowchart", ([s]) => polygon([[0, 0], [100, 0], [100 - s, 100], [s, 100]]), [poi("inset", "Bottom inset", 20, 0, 50, (p) => ({ x: p, y: 100 }))]),
  "flowchart-connector": base("Connector", "Flowchart", ([r]) => roundFlow(r), [flowchartCurvature]),
  "offpage-connector": base("Off-page connector", "Flowchart", ([p]) => polygon([[0, 0], [100, 0], [100, p], [50, 100], [0, p]]), [poi("point", "Shoulder height", 75, 0, 100, (p) => ({ x: 100, y: p }), "y")]),
  "card": base("Card", "Flowchart", ([p]) => polygon([[p, 0], [100, 0], [100, 100], [0, 100], [0, p]]), [poi("corner", "Clipped corner", 25, 0, 100, (p) => ({ x: p, y: 0 }))]),
  "punched-tape": base("Punched tape", "Flowchart", ([d]) => `M 0 15 C 30 ${15 + d} 70 ${15 - d} 100 15 L 100 85 C 70 ${85 - d} 30 ${85 + d} 0 85 Z`, [poi("wave", "Wave depth", 20, 0, 35, (p) => ({ x: 24.0625, y: 15 + 0.28125 * p }), "y")]),
  "summing-junction": summingJunction.preset,
  "or": orSymbol.preset,
  "collate": base("Collate", "Flowchart", ([p]) => polygon([[0, 0], [100, 0], [50, p], [100, 100], [0, 100], [50, p]]), [poi("waist", "Waist height", 50, 0, 100, (p) => ({ x: 50, y: p }), "y")]),
  "sort": base("Sort", "Flowchart", ([p]) => `${polygon([[50, 0], [100, p], [50, 100], [0, p]])} M 0 ${p} L 100 ${p}`, [poi("division", "Division height", 50, 0, 100, (p) => ({ x: 0, y: p }), "y")]),
  "extract": base("Extract", "Flowchart", ([p]) => polygon([[p, 0], [100, 100], [0, 100]]), [poi("apex", "Apex position", 50, 0, 100, (p) => ({ x: p, y: 0 }))]),
  "merge": base("Merge", "Flowchart", ([p]) => polygon([[0, 0], [100, 0], [p, 100]]), [poi("apex", "Apex position", 50, 0, 100, (p) => ({ x: p, y: 100 }))]),
  "stored-data": base("Stored data", "Flowchart", ([r]) => `M ${r} 0 L 100 0 C ${100 - r} 0 ${100 - r} 100 100 100 L ${r} 100 C 0 100 0 0 ${r} 0 Z`, [poi("curve", "End curvature", 20, 0, 100, (p) => ({ x: p, y: 0 }))]),
  "delay": base(
    "Delay",
    "Flowchart",
    ([r]) => `M 0 0 L ${100 - r} 0 C ${100 - r / 3} 0 100 25 100 50 C 100 75 ${100 - r / 3} 100 ${100 - r} 100 L 0 100 Z`,
    [poi("curve", "End curvature", 38, 0, 100, (p) => ({ x: 100 - p, y: 0 }))]
  ),
  "sequential-access-storage": base("Sequential access storage", "Flowchart", ([height]) => {
    const y = 90 - height;
    const x = 50 + 50 * Math.sqrt(1 - ((y - 45) / 45) ** 2);
    return `M 50 90 A 50 45 0 0 1 0 45 A 50 45 0 0 1 50 0 A 50 45 0 0 1 ${x} ${y} L 100 ${y} L 100 90 Z`;
  }, [tapeTailHeight]),
  "magnetic-disk": base("Magnetic disk", "Flowchart", ([d]) => cylinderPath(d), [poi("depth", "Cap depth", 15, 0, 30, (p) => ({ x: 0, y: p }), "y")]),
  "direct-access-storage": base("Direct access storage", "Flowchart", ([d]) => turn(cylinderPath(d), 1), [poi("depth", "Cap depth", 15, 0, 30, (p) => ({ x: 100 - p, y: 0 }))]),
  "display": base("Display", "Flowchart", ([d]) => `M ${d} 0 L 80 0 C 100 0 100 100 80 100 L ${d} 100 L 0 50 Z`, [poi("point", "Point depth", 20, 0, 80, (p) => ({ x: p, y: 0 }))]),
  "seal-1": base("Explosion 1", "Stars and banners", ([p]) => irregularStar(12, p, 0), [poi("inner", "Inner radius", 26, 8, 38, (p) => ({ x: 50 + p * Math.sin(Math.PI / 12), y: 50 - p * Math.cos(Math.PI / 12) }))]),
  "seal-2": base("Explosion 2", "Stars and banners", ([p]) => irregularStar(16, p, 1), [poi("inner", "Inner radius", 32, 8, 38, (p) => ({ x: 50 + p * Math.sin(Math.PI / 16), y: 50 - p * Math.cos(Math.PI / 16) }))]),
  "star-3": starPreset(3, 16),
  "star-4": starPreset(4, 12),
  "star-6": starPreset(6, 25),
  "star-7": starPreset(7, 30),
  "star-8": starPreset(8, 30),
  "star-10": starPreset(10, 34),
  "star-12": starPreset(12, 34),
  "star-16": starPreset(16, 36),
  "star-24": starPreset(24, 39),
  "star-32": starPreset(32, 41),
  "ribbon-up": ribbonPreset("Ribbon up", false, false),
  "ribbon-down": ribbonPreset("Ribbon down", true, false),
  "curved-ribbon-up": ribbonPreset("Curved ribbon up", false, true),
  "curved-ribbon-down": ribbonPreset("Curved ribbon down", true, true),
  "vertical-scroll": base("Vertical scroll", "Stars and banners", ([d]) => scrollPath(d), [poi("curl", "Roll thickness", 10, 4, 18, (p) => ({ x: 20, y: p }), "y")]),
  "horizontal-scroll": base("Horizontal scroll", "Stars and banners", ([d]) => turn(scrollPath(d), 1), [poi("curl", "Roll thickness", 10, 4, 18, (p) => ({ x: 100 - p, y: 20 }))]),
  "wave": base("Wave", "Stars and banners", ([d]) => `M 0 20 C 35 ${20 - d} 65 ${20 + d} 100 20 L 100 80 C 65 ${80 + d} 35 ${80 - d} 0 80 Z`, [poi("amplitude", "Wave amplitude", 30, 5, 45, (p) => ({ x: 25.46875, y: 20 - 0.28125 * p }), "y")]),
  "double-wave": base("Double wave", "Stars and banners", ([d]) => `M 0 20 Q 12.5 ${20 - d} 25 20 Q 37.5 ${20 + d} 50 20 Q 62.5 ${20 - d} 75 20 Q 87.5 ${20 + d} 100 20 L 100 80 Q 87.5 ${80 + d} 75 80 Q 62.5 ${80 - d} 50 80 Q 37.5 ${80 + d} 25 80 Q 12.5 ${80 - d} 0 80 Z`, [poi("amplitude", "Wave amplitude", 25, 5, 40, (p) => ({ x: 12.5, y: 20 - p / 2 }), "y")]),
  "rectangular-callout": calloutPreset("Rectangular callout", "rectangle"),
  "rounded-rectangular-callout": calloutPreset("Rounded rectangular callout", "rounded"),
  "oval-callout": calloutPreset("Oval callout", "oval"),
  "cloud-callout": thoughtCalloutPreset,
  "line-callout-1": lineCalloutPreset("Line callout 1", false),
  "line-callout-2": lineCalloutPreset("Line callout 2", true)
};
var arrowTurnPoint = (point, direction, reflectY = false) => {
  let { x, y } = point;
  if (reflectY) y = 100 - y;
  for (let i = 0; i < direction; i++) [x, y] = [100 - y, x];
  return { x, y };
};
var arrowControl = (name, label, value, min, max, point, axis, direction, reflectY = false) => ({
  name,
  label,
  default: value,
  min,
  max,
  axis: direction % 2 ? axis === "x" ? "y" : "x" : axis,
  point: (values) => arrowTurnPoint(point(values), direction, reflectY)
});
var arrowPreset = (label, draw, values, controls, direction = 0, normalized = false, limits, extra, reflectY = false) => ({
  ...base(label, "Block arrows", (values2) => turn(draw(values2), direction, reflectY), [
    arrowControl("shaft", "Shaft thickness", values[0], 0, 50, ...controls[0], direction, reflectY),
    arrowControl("head-start", "Arrowhead start", values[1], 0, 100, ...controls[1], direction, reflectY),
    arrowControl("head-width", "Arrowhead thickness", values[2], normalized ? 1 : 0, 100, ...controls[2], direction, reflectY),
    ...extra ? [extra] : []
  ]),
  ...normalized ? { normalizedAdjustment: "head-width" } : {},
  adjustmentLimits: limits ?? (([shaft, , head], index) => index === 0 ? [0, head] : index === 2 ? [Math.max(normalized ? 1 : 0, shaft), 100] : index === 3 && extra ? [extra.min, extra.max] : [0, 100])
});
var horizontalArrowControls = [
  [([t]) => ({ x: 0, y: 50 - t }), "y"],
  [([t, s]) => ({ x: s, y: 50 - t }), "x"],
  [([, s, h]) => ({ x: s, y: 50 - h }), "y"]
];
var straightBlockArrow = (label, direction) => arrowPreset(label, ([t, s, h]) => polygon([
  [0, 50 - t],
  [s, 50 - t],
  [s, 50 - h],
  [100, 50],
  [s, 50 + h],
  [s, 50 + t],
  [0, 50 + t]
]), [16, 70, 50], horizontalArrowControls, direction, true);
var doubleBlockArrow = (label, direction) => arrowPreset(label, ([t, d, h]) => polygon([
  [0, 50],
  [d, 50 - h],
  [d, 50 - t],
  [100 - d, 50 - t],
  [100 - d, 50 - h],
  [100, 50],
  [100 - d, 50 + h],
  [100 - d, 50 + t],
  [d, 50 + t],
  [d, 50 + h]
]), [16, 25, 50], [
  [([t]) => ({ x: 50, y: 50 - t }), "y"],
  [([t, d]) => ({ x: d, y: 50 - t }), "x"],
  [([, d, h]) => ({ x: d, y: 50 - h }), "y"]
], direction, true, ([t, , h], i) => i === 0 ? [0, h] : i === 1 ? [0, 50] : [Math.max(1, t), 100]);
var multipleArrowControls = [
  [([t, d]) => ({ x: 50 + t, y: (d + 50 - t) / 2 }), "x"],
  [([t, d]) => ({ x: 50 + t, y: d }), "y"],
  [([, d, h]) => ({ x: 50 + h, y: d }), "x"]
];
var radialArrow = (values, callout = false) => {
  const [t, d, h] = values;
  const quarter = callout ? [[50, 0], [50 + h, d], [50 + t, d], [50 + t, 30], [70, 30], [70, 50 - t], [100 - d, 50 - t], [100 - d, 50 - h]] : [[50, 0], [50 + h, d], [50 + t, d], [50 + t, 50 - t], [100 - d, 50 - t], [100 - d, 50 - h]];
  const points = [];
  for (let direction = 0; direction < 4; direction++) for (const [x, y] of quarter) {
    const point = arrowTurnPoint({ x, y }, direction);
    points.push([point.x, point.y]);
  }
  return polygon(points);
};
var radialArrowLimits = ([t, d, h], i, callout = false) => i === 0 ? [0, Math.min(h, 50 - d, callout ? 20 : 50)] : i === 1 ? [0, Math.min(callout ? 30 : 50, 50 - h)] : [t, 50 - d];
var curvedBlockArrow = (label, direction, reflectY = direction < 2) => arrowPreset(
  label,
  ([t, s, h]) => `M 90 ${7 - t} C ${-3 - 17 * t / 7} ${7 - t} ${-3 - 17 * t / 7} ${75 + t} ${s} ${75 + t} L ${s} ${75 + h} L 100 75 L ${s} ${75 - h} L ${s} ${75 - t} C ${-3 + 17 * t / 7} ${75 - t} ${-3 + 17 * t / 7} ${7 + t} 90 ${7 + t} Z`,
  [7, 70, 25],
  [
    [([t]) => ({ x: 90, y: 7 - t }), "y"],
    [([t, s]) => ({ x: s, y: 75 - t }), "x"],
    [([, s, h]) => ({ x: s, y: 75 - h }), "y"]
  ],
  direction,
  false,
  ([t, , h], i) => i === 0 ? [0, Math.min(20, h)] : i === 1 ? [0, 100] : [t, 50],
  void 0,
  reflectY
);
var elbowArrowControls = [
  [([t]) => ({ x: 75 + t, y: 65 }), "x"],
  [([t, d]) => ({ x: 75 + t, y: d }), "y"],
  [([, d, h]) => ({ x: 75 + h, y: d }), "x"]
];
var hiddenArrowParameter = (name, label, value, min, max) => ({
  name,
  label,
  default: value,
  min,
  max,
  axis: "x",
  hidden: true,
  point: () => ({ x: 0, y: 0 })
});
var blockArrowCallout = (label, direction) => arrowPreset(
  label,
  ([t, s, h, b = 65]) => polygon([
    [0, 0],
    [b, 0],
    [b, 50 - t],
    [s, 50 - t],
    [s, 50 - h],
    [100, 50],
    [s, 50 + h],
    [s, 50 + t],
    [b, 50 + t],
    [b, 100],
    [0, 100]
  ]),
  [10, 80, 25],
  [
    [([t, s, , b = 65]) => ({ x: (b + s) / 2, y: 50 - t }), "y"],
    ...horizontalArrowControls.slice(1)
  ],
  direction,
  false,
  ([t, s, h, b = 65], i) => i === 0 ? [0, Math.min(h, 50)] : i === 1 ? [b, 100] : i === 2 ? [t, 50] : [0, s],
  hiddenArrowParameter("box", "Box width", 65, 0, 100)
);
var arrowPresets = {
  "left-arrow": straightBlockArrow("Left arrow", 2),
  "up-arrow": straightBlockArrow("Up arrow", 3),
  "down-arrow": straightBlockArrow("Down arrow", 1),
  "left-right-arrow": doubleBlockArrow("Left-right arrow", 0),
  "up-down-arrow": doubleBlockArrow("Up-down arrow", 1),
  "quad-arrow": arrowPreset("Quad arrow", (values) => radialArrow(values), [10, 20, 20], multipleArrowControls, 0, false, radialArrowLimits),
  "left-right-up-arrow": arrowPreset("Left-right-up arrow", ([t, d, h]) => polygon([
    [0, 65],
    [d, 65 - h],
    [d, 65 - t],
    [50 - t, 65 - t],
    [50 - t, d],
    [50 - h, d],
    [50, 0],
    [50 + h, d],
    [50 + t, d],
    [50 + t, 65 - t],
    [100 - d, 65 - t],
    [100 - d, 65 - h],
    [100, 65],
    [100 - d, 65 + h],
    [100 - d, 65 + t],
    [d, 65 + t],
    [d, 65 + h]
  ]), [10, 25, 25], [
    [([t]) => ({ x: 50 + t, y: 40 }), "x"],
    ...multipleArrowControls.slice(1)
  ], 0, false, ([t, d, h], i) => i === 0 ? [0, Math.min(h, 50 - d)] : i === 1 ? [0, Math.min(50, 65 - h)] : [t, 65 - d]),
  "bent-arrow": arrowPreset(
    "Bent arrow",
    ([t, s, h]) => `M ${10 - t} 100 L ${10 - t} 40 Q ${10 - t} ${20 - t} 30 ${20 - t} L ${s} ${20 - t} L ${s} ${25 - h} L 100 25 L ${s} ${25 + h} L ${s} ${20 + t} L 30 ${20 + t} Q ${10 + t} ${20 + t} ${10 + t} 40 L ${10 + t} 100 Z`,
    [10, 70, 25],
    [
      [([t]) => ({ x: 10 - t, y: 100 }), "x"],
      [([t, s]) => ({ x: s, y: 20 - t }), "x"],
      [([, s, h]) => ({ x: s, y: 25 - h }), "y"]
    ],
    0,
    false,
    ([t, , h], i) => i === 0 ? [0, Math.min(20, h - 5)] : i === 1 ? [30, 100] : [t + 5, 50]
  ),
  "u-turn-arrow": arrowPreset(
    "U-turn arrow",
    ([t, s, h]) => `M ${9 - t} 100 L ${9 - t} 38 C ${9 - t} ${-3 - t} ${71 + t} ${-3 - t} ${71 + t} 38 L ${71 + t} ${s} L ${70 + h} ${s} L 70 90 L ${70 - h} ${s} L ${71 - t} ${s} L ${71 - t} 38 C ${71 - t} ${-3 + t} ${9 + t} ${-3 + t} ${9 + t} 38 L ${9 + t} 100 Z`,
    [9, 60, 30],
    [
      [([t]) => ({ x: 9 - t, y: 100 }), "x"],
      [([t, s]) => ({ x: 71 + t, y: s }), "y"],
      [([, s, h]) => ({ x: 70 + h, y: s }), "x"]
    ],
    0,
    false,
    ([t, , h], i) => i === 0 ? [0, Math.min(20, h - 1)] : i === 1 ? [38, 90] : [t + 1, 50]
  ),
  "left-up-arrow": arrowPreset("Left-up arrow", ([t, d, h]) => polygon([
    [0, 75],
    [d, 75 - h],
    [d, 75 - t],
    [75 - t, 75 - t],
    [75 - t, d],
    [75 - h, d],
    [75, 0],
    [75 + h, d],
    [75 + t, d],
    [75 + t, 75 + t],
    [d, 75 + t],
    [d, 75 + h]
  ]), [10, 25, 25], elbowArrowControls, 0, false, ([t, d, h], i) => i === 0 ? [0, Math.min(h, 75 - d)] : i === 1 ? [0, 75 - h] : [t, 75 - d]),
  "bent-up-arrow": arrowPreset("Bent-up arrow", ([t, d, h]) => polygon([
    [0, 90 + t],
    [0, 90 - t],
    [75 - t, 90 - t],
    [75 - t, d],
    [75 - h, d],
    [75, 0],
    [75 + h, d],
    [75 + t, d],
    [75 + t, 90 + t]
  ]), [10, 25, 25], [[([t]) => ({ x: 0, y: 90 - t }), "y"], ...elbowArrowControls.slice(1)]),
  "curved-left-arrow": curvedBlockArrow("Curved left arrow", 2),
  "curved-right-arrow": curvedBlockArrow("Curved right arrow", 0),
  "curved-up-arrow": curvedBlockArrow("Curved up arrow", 3),
  "curved-down-arrow": curvedBlockArrow("Curved down arrow", 1),
  "striped-right-arrow": arrowPreset(
    "Striped right arrow",
    ([t, s, h]) => `${polygon([[25, 50 - t], [s, 50 - t], [s, 50 - h], [100, 50], [s, 50 + h], [s, 50 + t], [25, 50 + t]])} ${polygon([[0, 50 - t], [5, 50 - t], [5, 50 + t], [0, 50 + t]])} ${polygon([[12, 50 - t], [19, 50 - t], [19, 50 + t], [12, 50 + t]])}`,
    [15, 70, 50],
    [[([t]) => ({ x: 25, y: 50 - t }), "y"], ...horizontalArrowControls.slice(1)],
    0,
    true,
    ([t, , h], i) => i === 0 ? [0, h] : i === 1 ? [25, 100] : [Math.max(1, t), 100]
  ),
  "notched-right-arrow": arrowPreset("Notched right arrow", ([t, s, h, notch = 15]) => polygon([
    [0, 50 - t],
    [s, 50 - t],
    [s, 50 - h],
    [100, 50],
    [s, 50 + h],
    [s, 50 + t],
    [0, 50 + t],
    [notch, 50]
  ]), [20, 65, 50], horizontalArrowControls, 0, true, void 0, hiddenArrowParameter("notch", "Notch depth", 15, 3, 40)),
  "home-plate": arrowPreset("Pentagon arrow", ([t, s, h]) => polygon([
    [0, 50 - t],
    [s, 50 - h],
    [100, 50],
    [s, 50 + h],
    [0, 50 + t]
  ]), [50, 70, 50], [horizontalArrowControls[0], [([, s, h]) => ({ x: s, y: 50 + h }), "x"], horizontalArrowControls[2]], 0, true),
  "chevron": arrowPreset("Chevron", ([t, s, h, notch = 30]) => polygon([
    [0, 50 - t],
    [s, 50 - t],
    [s, 50 - h],
    [100, 50],
    [s, 50 + h],
    [s, 50 + t],
    [0, 50 + t],
    [notch, 50]
  ]), [50, 70, 50], horizontalArrowControls, 0, true, void 0, hiddenArrowParameter("notch", "Notch depth", 30, 5, 48)),
  "right-arrow-callout": blockArrowCallout("Right arrow callout", 0),
  "down-arrow-callout": blockArrowCallout("Down arrow callout", 1),
  "left-arrow-callout": blockArrowCallout("Left arrow callout", 2),
  "up-arrow-callout": blockArrowCallout("Up arrow callout", 3),
  "left-right-arrow-callout": arrowPreset(
    "Left-right arrow callout",
    ([t, d, h, b = 30]) => polygon([
      [0, 50],
      [d, 50 - h],
      [d, 50 - t],
      [b, 50 - t],
      [b, 15],
      [100 - b, 15],
      [100 - b, 50 - t],
      [100 - d, 50 - t],
      [100 - d, 50 - h],
      [100, 50],
      [100 - d, 50 + h],
      [100 - d, 50 + t],
      [100 - b, 50 + t],
      [100 - b, 85],
      [b, 85],
      [b, 50 + t],
      [d, 50 + t],
      [d, 50 + h]
    ]),
    [8, 18, 20],
    [
      [([t, d, , b = 30]) => ({ x: (b + d) / 2, y: 50 - t }), "y"],
      [([t, d]) => ({ x: d, y: 50 - t }), "x"],
      [([, d, h]) => ({ x: d, y: 50 - h }), "y"]
    ],
    0,
    false,
    ([t, d, h, b = 30], i) => i === 0 ? [0, Math.min(h, 35)] : i === 1 ? [0, b] : i === 2 ? [t, 50] : [d, 50],
    hiddenArrowParameter("box", "Box inset", 30, 0, 50)
  ),
  "quad-arrow-callout": arrowPreset("Quad arrow callout", (values) => radialArrow(values, true), [7, 18, 20], [
    [([t, d]) => ({ x: 50 + t, y: (d + 30) / 2 }), "x"],
    ...multipleArrowControls.slice(1)
  ], 0, false, (values, index) => radialArrowLimits(values, index, true)),
  "circular-arrow": arrowPreset(
    "Circular arrow",
    ([t, s, h]) => `M ${16 - t} 70 C ${1 - t} 30 ${21 - t} ${6 - t} 50 ${6 - t} C 75 ${6 - t} ${89 + t} ${26 - t} ${89 + t} ${s} L ${85 + h} ${s} L 85 68 L ${85 - h} ${s} L ${89 - t} ${s} C ${89 - t} ${26 + t} 75 ${6 + t} 50 ${6 + t} C ${21 + t} ${6 + t} ${1 + t} 30 ${16 + t} 70 Z`,
    [6, 45, 17.5],
    [
      [([t]) => ({ x: 50, y: 6 - t }), "y"],
      [([t, s]) => ({ x: 89 + t, y: s }), "y"],
      [([, s, h]) => ({ x: 85 + h, y: s }), "x"]
    ],
    0,
    false,
    ([t, , h], i) => i === 0 ? [0, Math.min(15, h - 4)] : i === 1 ? [0, 68] : [t + 4, 45]
  )
};
var upgradeArrowValues = {
  "left-arrow": ([d]) => [16, 100 - d, 50],
  "up-arrow": ([d]) => [16, 100 - d, 50],
  "down-arrow": ([d]) => [16, 100 - d, 50],
  "left-right-arrow": ([d]) => [16, d, 50],
  "up-down-arrow": ([d]) => [16, d, 50],
  "quad-arrow": ([t]) => [t, 20, 20],
  "left-right-up-arrow": ([t]) => [t, 25, 25],
  "bent-arrow": ([t]) => [t / 2, 70, 25],
  "u-turn-arrow": ([t]) => [t / 2, 60, 30],
  "left-up-arrow": ([t]) => [10 + t / 2, 25, 25],
  "bent-up-arrow": ([t]) => [t / 2, 25, 25],
  "curved-left-arrow": ([t]) => [t / 2, 70, 25],
  "curved-right-arrow": ([t]) => [t / 2, 70, 25],
  "curved-up-arrow": ([t]) => [t / 2, 70, 25],
  "curved-down-arrow": ([t]) => [t / 2, 70, 25],
  "striped-right-arrow": ([d]) => [15, 100 - d, 50],
  "notched-right-arrow": ([d]) => [20, 65, 50, d],
  "home-plate": ([d]) => [50, 100 - d, 50],
  "chevron": ([d]) => [50, 100 - d, 50, d],
  "right-arrow-callout": ([b]) => [10, 80, 25, b],
  "down-arrow-callout": ([b]) => [10, 80, 25, b],
  "left-arrow-callout": ([b]) => [10, 80, 25, b],
  "up-arrow-callout": ([b]) => [10, 80, 25, b],
  "left-right-arrow-callout": ([b]) => [8, 18, 20, b],
  "quad-arrow-callout": ([t]) => [t, 18, 20],
  "circular-arrow": ([t]) => [t / 2, 45, 17.5]
};
var legacyArrowPresets = Object.fromEntries(Object.keys(arrowPresets).map((type) => [type, {
  definition: originalGraphicShapePresets[type],
  upgrade: upgradeArrowValues[type]
}]));
var legacyCurvedArrowPresets = {
  "curved-right-arrow": curvedBlockArrow("Curved right arrow", 0, false),
  "curved-down-arrow": curvedBlockArrow("Curved down arrow", 1, false)
};
var graphicShapePresets = { ...originalGraphicShapePresets, ...arrowPresets };

// shapes.ts
var graphicConnectorRole = "connector";
var numberPattern = /[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g;
var reversedDetailPresets = /* @__PURE__ */ new Set([
  "cylinder",
  "cube",
  "folded-corner",
  "magnetic-disk",
  "direct-access-storage"
]);
function presetDrawing(type, values) {
  const path = graphicShapePresets[type].draw(values);
  if (!reversedDetailPresets.has(type)) return path;
  return orientDetailContours(path);
}
function orientDetailContours(path) {
  return path.split(/(?=M)/).map((subpath) => {
    if (subpath.includes("Z")) return subpath.trim();
    const commands = Array.from(subpath.matchAll(/([MLQC])([^MLQCZ]+)/g), (match) => ({
      command: match[1],
      values: coordinates(match[2])
    }));
    const end = commands.at(-1).values.slice(-2);
    const reversed = commands.slice(1).map((command, i) => {
      const start = commands[i].values.slice(-2);
      const controls = command.values.slice(0, -2);
      if (command.command === "C") controls.push(...controls.splice(0, 2));
      return `${command.command} ${[...controls, ...start].join(" ")}`;
    }).reverse();
    return `M ${end.join(" ")} ${reversed.join(" ")}`;
  }).join(" ");
}
function graphicPresetFillRule(type) {
  return ["frame", "donut", "prohibited"].includes(type) ? "evenodd" : "nonzero";
}
var graphicPresetOptions = Object.keys(graphicShapePresets).map((type) => {
  const definition = graphicShapePresets[type];
  return {
    type,
    label: definition.label,
    category: definition.category,
    icon: "Shape",
    path: type === "text-box" ? "M 0 0 L 100 0 L 100 100 L 0 100 Z M 12 50 L 25 15 L 38 50 M 17 38 L 33 38 M 48 20 L 88 20 M 48 40 L 88 40 M 12 65 L 88 65 M 12 82 L 88 82" : presetDrawing(type, definition.adjustments.map((adjustment) => adjustment.default))
  };
});
function isGraphicPresetType(type) {
  return Object.hasOwn(graphicShapePresets, type);
}
var defaults = (definition) => definition.adjustments.map((adjustment) => adjustment.default);
function coordinates(path) {
  return Array.from(path.matchAll(numberPattern), (match) => Number(match[0]));
}
var signature = (path) => path.replace(numberPattern, "#").replace(/[\s,]+/g, "");
var coordinateOrArcPattern = new RegExp(`A([^MLQCAZ]+)|${numberPattern.source}`, "g");
function scalePath(path, bounds, precision = 1e6) {
  const clean = (value) => String(Math.round(value * precision) / precision);
  let index = 0;
  return path.replace(coordinateOrArcPattern, (value, arc) => {
    if (arc) {
      const [rx, ry, rotation, large, sweep, x, y] = coordinates(arc);
      return `A ${clean(rx / 100 * bounds.width)} ${clean(ry / 100 * bounds.height)} ${rotation} ${large} ${sweep} ${clean(bounds.x + x / 100 * bounds.width)} ${clean(bounds.y + y / 100 * bounds.height)} `;
    }
    const horizontal = index++ % 2 === 0;
    return clean((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height));
  });
}
function reflectPoint(point, bounds, reflection) {
  return {
    x: reflection?.horizontal ? 2 * bounds.x + bounds.width - point.x : point.x,
    y: reflection?.vertical ? 2 * bounds.y + bounds.height - point.y : point.y
  };
}
function reflectPath(path, bounds, reflection) {
  let index = 0;
  const clean = (value) => String(Math.round(value * 1e10) / 1e10);
  return path.replace(coordinateOrArcPattern, (value, arc) => {
    if (arc) {
      const [rx, ry, rotation, large, sweep, x, y] = coordinates(arc);
      const point2 = reflectPoint({ x, y }, bounds, reflection), reverse = reflection.horizontal !== reflection.vertical;
      return `A ${rx} ${ry} ${reverse ? -rotation : rotation} ${large} ${reverse ? 1 - sweep : sweep} ${clean(point2.x)} ${clean(point2.y)} `;
    }
    const horizontal = index++ % 2 === 0, axis = horizontal ? "x" : "y";
    const point = reflectPoint({ x: Number(value), y: Number(value) }, bounds, reflection);
    return clean(point[axis]);
  });
}
function graphicPresetPath(type, bounds, values = defaults(graphicShapePresets[type]), reflection) {
  const path = scalePath(presetDrawing(type, values), bounds, type === "chord" || type === "sequential-access-storage" ? 1e10 : 1e6);
  return reflection?.horizontal || reflection?.vertical ? reflectPath(path, bounds, reflection) : path;
}
function writeGraphicPreset(element, state, bounds = state.bounds, values = state.values) {
  element.setAttribute("d", graphicPresetPath(state.type, bounds, values, state.reflection));
  element.setAttribute("fill-rule", graphicPresetFillRule(state.type));
}
var templates;
var legacyDelayPath = ([r]) => `M 0 0 L ${100 - r} 0 C 100 0 100 100 ${100 - r} 100 L 0 100 Z`;
function getTemplates() {
  if (templates) return templates;
  templates = /* @__PURE__ */ new Map();
  for (const option of graphicPresetOptions) {
    const definition = graphicShapePresets[option.type];
    const drawings = option.type === "pie" ? [([p]) => `M 50 50 L 100 ${p} C 100 78 78 100 50 100 C 22 100 0 78 0 50 C 0 22 22 0 50 0 L 50 50 Z`] : option.type === "chord" || option.type === "sequential-access-storage" || isConnectedCalloutType(option.type) ? [] : [(values) => presetDrawing(option.type, values)];
    if (reversedDetailPresets.has(option.type)) drawings.push(definition.draw);
    for (const legacyBanner of legacyBannerPaths[option.type] ?? []) {
      drawings.push(legacyBanner);
      if (option.type === "ribbon-up" || option.type === "ribbon-down") {
        drawings.push((values) => orientDetailContours(legacyBanner(values)));
      }
    }
    if (option.type === "delay") drawings.push(legacyDelayPath);
    if (option.type === "left-brace") {
      drawings.push(([p]) => `M 70 5 Q 48 5 52 25 L 52 40 Q 52 50 ${p} 50 Q 52 50 52 60 L 52 75 Q 48 95 70 95`);
    }
    if (option.type === "right-brace") {
      drawings.push(([p]) => `M 30 5 Q 52 5 48 25 L 48 40 Q 48 50 ${100 - p} 50 Q 48 50 48 60 L 48 75 Q 52 95 30 95`);
    }
    if (option.type === "double-wave") {
      drawings.push(([d]) => `M 0 20 Q 25 ${20 - d} 50 20 Q 75 ${20 + d} 100 20 L 100 80 Q 75 ${80 + d} 50 80 Q 25 ${80 - d} 0 80 Z`);
    }
    if (option.type === "collate") {
      drawings.push(([p]) => `M 0 0 L 100 0 L 0 100 L 100 100 L ${p} 50 Z`);
    }
    if (option.type === "moon") {
      drawings.push(([d]) => `M ${75 - d / 2} 8 C 40 18 30 65 65 92 C 45 92 15 78 10 52 C 5 25 35 3 ${75 - d / 2} 8 Z`);
    }
    if (option.type === "prohibited") {
      const outer = definition.draw([0]).split(/(?=M)/)[0];
      drawings.push(([r]) => `${outer} M ${50 - r * 0.7} ${50 - r * 0.7} C ${50 - r * 1.5} ${50 + r * 0.2} ${50 - r * 0.2} ${50 + r * 1.5} ${50 + r * 0.7} ${50 + r * 0.7} Z M ${50 + r * 0.7} ${50 + r * 0.7 - 12} C ${50 + r * 1.5} ${50 - r * 0.2} ${50 + r * 0.2} ${50 - r * 1.5} ${50 - r * 0.7 + 12} ${50 - r * 0.7} Z`);
    }
    const legacy = option.type === "cloud" ? legacyCloudPreset : option.type === "chord" ? legacyChordPreset : legacyRoundFlowPresets[option.type] ?? legacyCalloutPresets[option.type] ?? legacyArrowPresets[option.type];
    const variants = [
      ...drawings.map((draw) => ({ draw, definition, upgrade: void 0 })),
      ...legacy ? [{ draw: legacy.definition.draw, definition: legacy.definition, upgrade: legacy.upgrade }] : [],
      ...legacySpeechBubblePresets[option.type] ? [{ draw: legacySpeechBubblePresets[option.type].definition.draw, definition: legacySpeechBubblePresets[option.type].definition, upgrade: legacySpeechBubblePresets[option.type].upgrade }] : []
    ];
    if (option.type === "sequential-access-storage") {
      const { definition: definition2, upgrade } = legacySequentialStoragePreset;
      variants.push(
        { draw: definition2.draw, definition: definition2, upgrade },
        { draw: (values) => orientDetailContours(definition2.draw(values)), definition: definition2, upgrade }
      );
    }
    for (const { draw: originalDraw, definition: definition2, upgrade } of variants) {
      const normalizedIndex = definition2.adjustments.findIndex((adjustment) => adjustment.name === definition2.normalizedAdjustment);
      const draw = normalizedIndex < 0 ? originalDraw : (values) => originalDraw(values.map((value, i) => i === normalizedIndex ? definition2.adjustments[i].default : value));
      const zero = definition2.adjustments.map(() => 0);
      const path = draw(zero);
      const base2 = coordinates(path);
      const deltas = zero.map((_, index) => coordinates(draw(zero.map((_2, i) => i === index ? 1 : 0))).map((value, i) => value - base2[i]));
      const key = signature(path);
      const candidates = templates.get(key) ?? [];
      candidates.push({ type: option.type, definition: definition2, base: base2, deltas, draw, upgrade });
      templates.set(key, candidates);
    }
  }
  return templates;
}
function fitAxis(template, actual, axis) {
  const columns = [
    actual.filter((_, i) => i % 2 === axis).map(() => 1),
    template.base.filter((_, i) => i % 2 === axis),
    ...template.deltas.map((delta) => delta.filter((_, i) => i % 2 === axis))
  ];
  const target = actual.filter((_, i) => i % 2 === axis);
  const orthogonal = [];
  const indices = [];
  const triangular = [];
  const dot = (a2, b) => a2.reduce((sum, value, i) => sum + value * b[i], 0);
  columns.forEach((column, index) => {
    const residual = [...column];
    const coefficients = orthogonal.map((vector) => {
      const coefficient = dot(vector, residual);
      vector.forEach((value, i) => residual[i] -= coefficient * value);
      return coefficient;
    });
    const length = Math.hypot(...residual);
    if (length < 1e-8) return;
    coefficients.push(length);
    triangular.push(coefficients);
    orthogonal.push(residual.map((value) => value / length));
    indices.push(index);
  });
  if (!indices.includes(1)) return null;
  const projected = orthogonal.map((vector) => dot(vector, target));
  const result = columns.map(() => void 0);
  for (let i = indices.length - 1; i >= 0; i--) {
    let value = projected[i];
    for (let j = i + 1; j < indices.length; j++) value -= triangular[j][i] * result[indices[j]];
    result[indices[i]] = value / triangular[i][i];
  }
  return result;
}
var cache = /* @__PURE__ */ new WeakMap();
function readPiePreset(path, actual) {
  if (signature(path) !== "M##L##A#######A#######Z" || !actual.every(Number.isFinite)) return null;
  const [cx, cy, , , rx, ry, , , , middleX, middleY] = actual;
  if (!(rx > 0 && ry > 0)) return null;
  const bounds = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  const sweep = 2 * Math.atan2(Math.max(0, -(middleX - cx) / rx), -(middleY - cy) / ry) * 180 / Math.PI;
  const expected = coordinates(graphicPresetPath("pie", bounds, [sweep]));
  if (expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) return null;
  return { type: "pie", definition: graphicShapePresets.pie, bounds, values: [sweep] };
}
function readChordPreset(path, actual) {
  if (signature(path) !== "M##A#######A#######Z" || !actual.every(Number.isFinite)) return null;
  const [sx, sy, rx, ry, , , , mx, my] = actual;
  if (!(rx > 0 && ry > 0)) return null;
  const dx = (sx - mx) / (2 * rx), dy = (sy - my) / (2 * ry);
  const distance = dx * dx + dy * dy;
  if (distance <= 0 || distance > 0.750001) return null;
  const factor = -Math.sqrt((1 - distance) / distance);
  const cx = (sx + mx) / 2 + factor * rx * dy;
  const cy = (sy + my) / 2 - factor * ry * dx;
  const bounds = { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  let start = (Math.atan2(-(sx - cx) / rx, -(sy - cy) / ry) * 180 / Math.PI + 360) % 360;
  if (Math.min(start, 360 - start) < 1e-7) start = 0;
  let sweep = 6 * Math.asin(Math.min(1, Math.sqrt(distance))) * 180 / Math.PI;
  if (sweep > 360 - 1e-7) sweep = 360;
  if (sweep < 0.5 - 1e-7 || sweep > 360) return null;
  const expected = coordinates(graphicPresetPath("chord", bounds, [start, sweep]));
  if (expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) return null;
  return { type: "chord", definition: graphicShapePresets.chord, bounds, values: [start, Math.max(0.5, sweep)] };
}
function readSequentialStoragePreset(path, actual) {
  if (signature(path) !== "M##A#######A#######A#######L##L##Z" || !actual.every(Number.isFinite)) return null;
  const [, bottom, rx, ry, , , , left, centerY] = actual;
  if (!(rx > 0 && ry > 0)) return null;
  const bounds = { x: left, y: centerY - ry, width: rx * 2, height: ry / 0.45 };
  const type = "sequential-access-storage", definition = graphicShapePresets[type];
  const { min, max } = definition.adjustments[0];
  const height = (bottom - actual.at(-3)) / bounds.height * 100;
  if (height < min - 1e-4 || height > max + 1e-4) return null;
  const values = [Math.max(min, Math.min(max, height))];
  const expected = coordinates(graphicPresetPath(type, bounds, values));
  if (expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) return null;
  return { type, definition, bounds, values };
}
function readSpeechBubblePreset(path, label) {
  const commands = [...path.matchAll(/([MLQCZ])([^MLQCZ]*)/g)];
  const types = [...connectedCalloutTypes].sort((a2, b) => Number(graphicShapePresets[b].label === label) - Number(graphicShapePresets[a2].label === label));
  for (const type of types) for (let direction = 0; direction < (type.startsWith("line-callout-") || type === "cloud-callout" ? 1 : 4); direction++) {
    const prefix = speechBubblePrefix(type, 0, direction), count = [...prefix.matchAll(/[MLQCZ]/g)].length;
    const source = commands.slice(0, count).map((command) => command[0]).join(" ");
    if (signature(source) !== signature(prefix)) continue;
    const base2 = coordinates(prefix), changed = coordinates(speechBubblePrefix(type, 1, direction));
    const template = { base: base2, deltas: [changed.map((value, i) => value - base2[i])] };
    const actual = coordinates(source), horizontal = fitAxis(template, actual, 0), vertical = fitAxis(template, actual, 1);
    if (!horizontal || !vertical || horizontal[1] <= 0 || vertical[1] <= 0) continue;
    const axis = horizontal[2] === void 0 ? vertical : horizontal;
    const r = axis[2] === void 0 ? 0 : axis[2] / axis[1];
    const definition = graphicShapePresets[type], adjustment = definition.adjustments[2];
    if (r < adjustment.min - 1e-4 || r > adjustment.max + 1e-4) continue;
    const bounds = { x: horizontal[0], y: vertical[0], width: horizontal[1] * 100, height: vertical[1] * 100 };
    const numbers = coordinates(path);
    for (const command of commands.slice(count)) {
      if (command[1] !== (type === "cloud-callout" ? "M" : "L")) continue;
      const [x, y] = coordinates(command[2]), ex = (x - bounds.x) / bounds.width * 100 + (type === "cloud-callout" ? 3 : 0), ey = (y - bounds.y) / bounds.height * 100;
      if (!Number.isFinite(ex) || !Number.isFinite(ey) || ex < -150 - 1e-4 || ex > 250 + 1e-4 || ey < -150 - 1e-4 || ey > 250 + 1e-4) continue;
      const values = [ex, ey, Math.max(adjustment.min, Math.min(adjustment.max, r))];
      const expected = graphicPresetPath(type, bounds, values);
      if (signature(expected) !== signature(path)) continue;
      const points = coordinates(expected);
      if (points.length === numbers.length && points.every((value, i) => Math.abs(value - numbers[i]) < 1e-4)) return { type, definition, bounds, values };
    }
  }
  return null;
}
function readGraphicPreset(element) {
  if (element?.namespaceURI !== "http://www.w3.org/2000/svg" || element.localName !== "path" || element.getAttribute("aria-roledescription") === graphicConnectorRole) return null;
  const path = element.getAttribute("d") ?? "";
  const label = element.getAttribute("aria-label");
  const previous = cache.get(element);
  if (previous?.path === path && previous.label === label) return previous.state;
  const preferred = graphicPresetOptions.find((option) => option.label === label)?.type;
  let state = null;
  const reflections = [
    { horizontal: false, vertical: false },
    { horizontal: true, vertical: false },
    { horizontal: false, vertical: true },
    { horizontal: true, vertical: true }
  ];
  for (const type of preferred ? [preferred, void 0] : [void 0]) {
    for (const reflection of reflections) {
      const mirrored = reflection.horizontal || reflection.vertical;
      const candidate = readPreset(mirrored ? reflectPath(path, { x: 0, y: 0, width: 0, height: 0 }, reflection) : path, label, type);
      if (!candidate) continue;
      state = mirrored ? { ...candidate, bounds: {
        ...candidate.bounds,
        x: reflection.horizontal ? -candidate.bounds.x - candidate.bounds.width : candidate.bounds.x,
        y: reflection.vertical ? -candidate.bounds.y - candidate.bounds.height : candidate.bounds.y
      }, reflection } : candidate;
      break;
    }
    if (state) break;
  }
  cache.set(element, { path, label, state });
  return state;
}
function readPreset(path, label, preferred) {
  const actual = coordinates(path);
  let state = readPiePreset(path, actual) ?? readChordPreset(path, actual) ?? readSequentialStoragePreset(path, actual) ?? readSpeechBubblePreset(path, label);
  if (state && preferred && state.type !== preferred) state = null;
  const candidates = state ? [] : [...getTemplates().get(signature(path)) ?? []];
  candidates.sort((a2, b) => Number(b.definition.label === label) - Number(a2.definition.label === label));
  for (const template of candidates) {
    if (preferred && template.type !== preferred) continue;
    const horizontal = fitAxis(template, actual, 0);
    const vertical = fitAxis(template, actual, 1);
    if (!horizontal || !vertical || horizontal[1] <= 0 || vertical[1] <= 0) continue;
    const values = template.definition.adjustments.map((adjustment, i) => {
      const axis = horizontal[i + 2] !== void 0 ? horizontal : vertical;
      return axis[i + 2] === void 0 ? adjustment.default : axis[i + 2] / axis[1];
    });
    if (values.some((value, i) => !Number.isFinite(value) || value < template.definition.adjustments[i].min - 1e-4 || value > template.definition.adjustments[i].max + 1e-4)) continue;
    if (template.type === "pie" && (values[0] < 5 - 1e-4 || values[0] > 75 + 1e-4)) continue;
    const bounds = { x: horizontal[0], y: vertical[0], width: horizontal[1] * 100, height: vertical[1] * 100 };
    const expected = coordinates(scalePath(template.draw(values), bounds));
    if (expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 1e-4)) continue;
    if (template.draw === legacyDelayPath) {
      const inset = bounds.width * values[0] / 100;
      bounds.width -= inset / 4;
      values[0] = inset * 0.75 / bounds.width * 100;
    }
    state = {
      type: template.type,
      definition: graphicShapePresets[template.type],
      bounds,
      values: template.upgrade ? template.upgrade(values) : template.type === "pie" ? [270 - Math.atan2(values[0] - 50, 50) * 180 / Math.PI] : values
    };
    break;
  }
  return state;
}
function graphicPresetHandles(state) {
  return state.definition.adjustments.flatMap((adjustment, index) => {
    if (adjustment.hidden) return [];
    if (state.definition.adjustments.some((other) => other.pairedWith === adjustment.name)) return [];
    const point = reflectPoint(adjustment.point(state.values), { x: 0, y: 0, width: 100, height: 100 }, state.reflection);
    return {
      name: `adjust-${adjustment.name}`,
      label: adjustment.pairedWith ? adjustment.label.replace(/ X$/, "") : adjustment.label,
      index,
      point: { x: state.bounds.x + point.x / 100 * state.bounds.width, y: state.bounds.y + point.y / 100 * state.bounds.height }
    };
  });
}
function graphicPresetAngle(bounds, input, previous, reflection) {
  input = reflectPoint(input, bounds, reflection);
  const x = (input.x - bounds.x - bounds.width / 2) / (bounds.width / 2);
  const y = (input.y - bounds.y - bounds.height / 2) / (bounds.height / 2);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 1e-4) return void 0;
  let value = (Math.atan2(-x, -y) * 180 / Math.PI + 360) % 360;
  value += Math.trunc((previous - value) / 360) * 360;
  if (value - previous > 180) value -= 360;
  else if (value - previous < -180) value += 360;
  return value;
}
function adjustGraphicPreset(element, state, name, input, mirror = {}) {
  if (typeof input !== "number") input = reflectPoint(input, state.bounds, state.reflection);
  const index = state.definition.adjustments.findIndex((adjustment2) => `adjust-${adjustment2.name}` === name);
  if (index < 0) return false;
  const adjustment = state.definition.adjustments[index];
  if (state.type === "chord") {
    const [start, sweep] = state.values, end = start + sweep;
    let value2 = typeof input === "number" ? input : graphicPresetAngle(state.bounds, input, index === 0 ? start : end);
    if (value2 === void 0 || !Number.isFinite(value2)) return false;
    if (index === 0) {
      const next = Math.max(end - 360, Math.min(end - 0.5, value2));
      writeGraphicPreset(element, state, state.bounds, [(next % 360 + 360) % 360, end - next]);
    } else {
      if (typeof input !== "number") value2 -= start;
      writeGraphicPreset(element, state, state.bounds, [start, Math.max(0.5, Math.min(360, value2))]);
    }
    return true;
  }
  const values = [...state.values];
  let value;
  if (typeof input === "number") value = input;
  else if (adjustment.axis === "angle") {
    const angle = graphicPresetAngle(state.bounds, input, state.values[index]);
    if (angle === void 0) return false;
    value = angle;
  } else {
    const axis = adjustment.axis;
    const origin = adjustment.point(values)[axis];
    values[index] += 1;
    const slope = adjustment.point(values)[axis] - origin;
    if (Math.abs(slope) < 1e-8) return false;
    const size = axis === "x" ? state.bounds.width : state.bounds.height;
    if (size <= 0) return false;
    value = state.values[index] + ((input[axis] - state.bounds[axis]) / size * 100 - origin) / slope;
  }
  if (!Number.isFinite(value)) return false;
  values[index] = Math.max(adjustment.min, Math.min(adjustment.max, value));
  if (typeof input !== "number" && adjustment.pairedWith) {
    const pairedIndex = state.definition.adjustments.findIndex((other) => other.name === adjustment.pairedWith);
    if (pairedIndex >= 0) {
      const paired = state.definition.adjustments[pairedIndex], axis = paired.axis === "y" ? "y" : "x";
      const origin = paired.point(state.values)[axis], sample = [...state.values];
      sample[pairedIndex] += 1;
      const slope = paired.point(sample)[axis] - origin;
      const size = axis === "x" ? state.bounds.width : state.bounds.height;
      if (Math.abs(slope) > 1e-8 && size > 0) {
        const coordinate = state.values[pairedIndex] + ((input[axis] - state.bounds[axis]) / size * 100 - origin) / slope;
        if (!Number.isFinite(coordinate)) return false;
        values[pairedIndex] = Math.max(paired.min, Math.min(paired.max, coordinate));
      }
    }
  }
  if ((adjustment.corner || adjustment.opposite) && (mirror.horizontal || mirror.vertical)) {
    const [vertical, horizontal] = adjustment.corner?.split("-") ?? [];
    const delta = values[index] - state.values[index];
    state.definition.adjustments.forEach((other, i) => {
      if (i === index) return;
      const [otherVertical, otherHorizontal] = other.corner?.split("-") ?? [];
      const reflectedCorner = adjustment.corner && other.corner && (vertical === otherVertical || mirror.vertical) && (horizontal === otherHorizontal || mirror.horizontal);
      if (other.name === adjustment.opposite || reflectedCorner) {
        values[i] = Math.max(other.min, Math.min(other.max, state.values[i] + delta));
      }
    });
  }
  if (state.definition.adjustmentLimits) {
    const [min, max] = state.definition.adjustmentLimits(state.values, index);
    values[index] = Math.max(adjustment.min, min, Math.min(adjustment.max, max, values[index]));
  }
  writeGraphicPreset(element, state, state.bounds, constrainCalloutTip(state.type, values, state.values));
  return true;
}

// graphic.ts
var graphicShapeDragType = "application/x-webwriter-graphic-shape";
var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
var boundsForPoints = (points) => {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};
var regularPolygonPoints = (bounds, count, startAngle = -90) => Array.from({ length: count }, (_, index) => {
  const angle = (startAngle + index * 360 / count) * Math.PI / 180;
  return {
    x: bounds.x + bounds.width / 2 + Math.cos(angle) * bounds.width / 2,
    y: bounds.y + bounds.height / 2 + Math.sin(angle) * bounds.height / 2
  };
});
var starPoints = (bounds, innerRadius = 0.45) => {
  const raw = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 ? innerRadius : 1;
    const angle = (-90 + index * 36) * Math.PI / 180;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  });
  const source = boundsForPoints(raw);
  return raw.map((point) => ({
    x: bounds.x + (point.x - source.x) / source.width * bounds.width,
    y: bounds.y + (point.y - source.y) / source.height * bounds.height
  }));
};
var hexagonPoints = (bounds, inset = bounds.width * 0.25) => {
  const safeInset = Math.min(bounds.width / 2, Math.max(0, inset));
  return [
    { x: bounds.x + safeInset, y: bounds.y },
    { x: bounds.x + bounds.width - safeInset, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { x: bounds.x + bounds.width - safeInset, y: bounds.y + bounds.height },
    { x: bounds.x + safeInset, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height / 2 }
  ];
};
var arrowPoints = (bounds, headRatio = 0.36, tailRatio = 0.42) => {
  const headStart = bounds.x + bounds.width * (1 - Math.min(0.8, Math.max(0.15, headRatio)));
  const tailHalf = bounds.height * Math.min(0.9, Math.max(0.1, tailRatio)) / 2;
  const centerY = bounds.y + bounds.height / 2;
  return [
    { x: bounds.x, y: centerY - tailHalf },
    { x: headStart, y: centerY - tailHalf },
    { x: headStart, y: bounds.y },
    { x: bounds.x + bounds.width, y: centerY },
    { x: headStart, y: bounds.y + bounds.height },
    { x: headStart, y: centerY + tailHalf },
    { x: bounds.x, y: centerY + tailHalf }
  ];
};
var previewBounds = { x: 0, y: 0, width: 100, height: 100 };
var polygonPreview = (points) => `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
var basicGraphicShapePaths = {
  rectangle: "M 5 0 L 95 0 A 5 5 0 0 1 100 5 L 100 95 A 5 5 0 0 1 95 100 L 5 100 A 5 5 0 0 1 0 95 L 0 5 A 5 5 0 0 1 5 0 Z",
  ellipse: "M 0 50 A 50 50 0 1 1 100 50 A 50 50 0 1 1 0 50 Z",
  triangle: polygonPreview(regularPolygonPoints(previewBounds, 3)),
  diamond: polygonPreview(regularPolygonPoints(previewBounds, 4)),
  hexagon: polygonPreview(hexagonPoints(previewBounds)),
  star: polygonPreview(starPoints(previewBounds)),
  arrow: polygonPreview(arrowPoints(previewBounds)),
  polygon: polygonPreview(regularPolygonPoints(previewBounds, 5)),
  line: "M 0 50 L 100 50",
  connector: "M 0 21.875 L 50 21.875 L 50 78.125 L 100 78.125",
  image: "M 0 12.5 L 100 12.5 L 100 87.5 L 0 87.5 Z M 0 72.5 L 30 46.25 L 60 72.5 L 80 57.5 L 100 72.5 M 82 31.25 A 10 7.5 0 1 1 62 31.25 A 10 7.5 0 1 1 82 31.25 Z"
};
var basicGraphicShapeOptions = [
  { type: "rectangle", label: "Rectangle", icon: "Rectangle", category: "Rectangles" },
  { type: "ellipse", label: "Ellipse", icon: "Ellipse", category: "Basic shapes" },
  { type: "triangle", label: "Triangle", icon: "Triangle", category: "Basic shapes" },
  { type: "diamond", label: "Diamond", icon: "Diamond", category: "Basic shapes" },
  { type: "hexagon", label: "Hexagon", icon: "Hexagon", category: "Basic shapes" },
  { type: "star", label: "5-point star", icon: "Star", category: "Stars and banners" },
  { type: "arrow", label: "Arrow", icon: "Arrow", category: "Block arrows" },
  { type: "polygon", label: "Polygon", icon: "Polygon", category: "Basic shapes" },
  { type: "line", label: "Line", icon: "Line", category: "Lines" },
  { type: "image", label: "Image", icon: "Image", category: "Lines" },
  { type: "connector", label: "Connector", icon: "Connector", category: "Lines" }
];
var graphicShapeCategories = ["Lines", "Triangles", "Rectangles", "Basic shapes", "Block arrows", "Equation shapes", "Flowchart", "Stars and banners", "Callouts"];
var lineArrowOptions = [
  { type: "line-start-arrow", label: "Narrow left arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 0 50 L 18 41 L 18 59 Z", pathFill: "currentColor" },
  { type: "line-end-arrow", label: "Narrow right arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 100 50 L 82 41 L 82 59 Z", pathFill: "currentColor" },
  { type: "line-both-arrows", label: "Narrow left-right arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 0 50 L 18 41 L 18 59 Z M 100 50 L 82 41 L 82 59 Z", pathFill: "currentColor" }
];
var basicShapeOrder = {
  parallelogram: 0,
  trapezoid: 1,
  diamond: 2,
  pentagon: 3,
  hexagon: 4,
  heptagon: 5,
  octagon: 6,
  decagon: 7,
  dodecagon: 8,
  ellipse: 9
};
var graphicShapeOptions = [
  ...graphicPresetOptions.filter((option) => option.type === "text-box").map((option) => ({ ...option, category: "Lines" })),
  ...basicGraphicShapeOptions.filter((option) => option.type === "image"),
  ...basicGraphicShapeOptions.filter((option) => option.type === "line"),
  ...basicGraphicShapeOptions.filter((option) => option.type !== "line" && option.type !== "image" && option.type !== "polygon" && option.type !== "rectangle"),
  ...lineArrowOptions,
  ...graphicPresetOptions.filter((option) => (option.category !== "Lines" || option.type === "curved-connector") && !["text-box", "right-triangle", "arc", "not-equal", "multidocument", "line-callout-2", "parentheses", "braces", "curved-ribbon-up", "curved-ribbon-down"].includes(option.type))
].map((option) => ({
  ...option,
  category: option.type === "triangle" || option.type === "right-triangle" ? "Triangles" : option.category,
  path: "path" in option ? option.path : basicGraphicShapePaths[option.type],
  pathFill: "pathFill" in option ? option.pathFill : void 0,
  fillRule: isGraphicPresetType(option.type) ? graphicPresetFillRule(option.type) : "nonzero"
})).sort((a2, b) => graphicShapeCategories.indexOf(a2.category) - graphicShapeCategories.indexOf(b.category) || (a2.category === "Basic shapes" ? (basicShapeOrder[a2.type] ?? 14) - (basicShapeOrder[b.type] ?? 14) : 0));
var starPointCount = (type) => type === "star" ? 5 : Number(type.slice(5));
var basicShapeRows = [
  graphicShapeOptions.filter((option) => option.category === "Lines"),
  graphicShapeOptions.filter((option) => option.category === "Rectangles" || ["parallelogram", "trapezoid"].includes(option.type)).sort((a2, b) => Number(b.type === "square-rectangle") - Number(a2.type === "square-rectangle")),
  graphicShapeOptions.filter((option) => option.category === "Triangles" || [
    "diamond",
    "pentagon",
    "hexagon",
    "heptagon",
    "octagon",
    "decagon",
    "dodecagon",
    "ellipse",
    "pie",
    "chord"
  ].includes(option.type)),
  graphicShapeOptions.filter((option) => /^star(?:-|$)/.test(option.type)).sort((a2, b) => starPointCount(a2.type) - starPointCount(b.type))
];
var basicShapes = new Set(basicShapeRows.flat().map((option) => option.type));
var arrowRowTypes = [
  ["arrow", "left-arrow", "up-arrow", "down-arrow", "left-right-arrow", "up-down-arrow", "quad-arrow", "left-right-up-arrow", "left-up-arrow", "bent-up-arrow"],
  ["bent-arrow", "u-turn-arrow", "curved-left-arrow", "curved-right-arrow", "curved-up-arrow", "curved-down-arrow", "circular-arrow"]
];
var groupedArrows = new Set(arrowRowTypes.flat());
var arrowShapeRows = [
  ...arrowRowTypes.map((types) => graphicShapeOptions.filter((option) => types.includes(option.type))),
  graphicShapeOptions.filter((option) => option.category === "Block arrows" && !groupedArrows.has(option.type))
];
var bracketShapeTypes = /* @__PURE__ */ new Set(["left-bracket", "right-bracket", "left-brace", "right-brace"]);
var explosionShapeTypes = /* @__PURE__ */ new Set(["seal-1", "seal-2"]);
var advancedShapes = graphicShapeOptions.filter((option) => !basicShapes.has(option.type) && option.category !== "Block arrows" && option.category !== "Flowchart");
var advancedShapeRows = [
  advancedShapes.filter((option) => option.category === "Basic shapes" && !bracketShapeTypes.has(option.type) || explosionShapeTypes.has(option.type)),
  [
    ...advancedShapes.filter((option) => option.category === "Equation shapes"),
    ...advancedShapes.filter((option) => bracketShapeTypes.has(option.type))
  ],
  advancedShapes.filter((option) => option.category !== "Basic shapes" && option.category !== "Equation shapes" && !explosionShapeTypes.has(option.type))
].flatMap((options) => Array.from({ length: Math.ceil(options.length / 11) }, (_, index) => options.slice(index * 11, (index + 1) * 11)));
var graphicShapeSections = [
  { label: "Basic", rows: basicShapeRows },
  ...["Advanced", "Arrows", "Flowchart"].map((label) => {
    if (label === "Arrows") return { label, rows: arrowShapeRows };
    if (label === "Advanced") return { label, rows: advancedShapeRows };
    const options = graphicShapeOptions.filter((option) => option.category === "Flowchart");
    return { label, rows: Array.from({ length: Math.ceil(options.length / 11) }, (_, index) => options.slice(index * 11, (index + 1) * 11)) };
  })
];
function readGraphicShapeDrag(data) {
  try {
    const detail = JSON.parse(data.getData(graphicShapeDragType));
    return detail && isGraphicShapeType(detail.shape) ? { shape: detail.shape, paint: detail.paint } : null;
  } catch {
    return null;
  }
}
var defaultGraphicShapePaint = {
  fill: "#ffffff",
  stroke: "#334155",
  "stroke-width": "4",
  opacity: "1"
};
var defaultGraphicEndingSize = 18;
var graphicConnectorEndings = {
  triangle: { label: "Filled arrow", icons: ["\u25C0\uFE0E", "\u25B6\uFE0E"], path: "M 0 0 L 10 5 L 0 10 z", outline: [[0, 0], [10, 5], [0, 10]] },
  "open-arrow": { label: "Open arrow", icons: ["\u276E", "\u276F"], path: "M 0 1 L 1 0 L 10 5 L 1 10 L 0 9 L 7 5 Z", outline: [[0, 0], [10, 5], [0, 10]] },
  diamond: { label: "Diamond", icons: ["\u25C6", "\u25C6"], path: "M 0 5 L 5 0 L 10 5 L 5 10 Z", outline: [[0, 5], [5, 0], [10, 5], [5, 10]] },
  circle: { label: "Circle", icons: ["\u25CF", "\u25CF"], path: "M 0 5 A 5 5 0 1 0 10 5 A 5 5 0 1 0 0 5 Z", outline: [[0, 0], [10, 0], [10, 10], [0, 10]] },
  bar: { label: "Bar", icons: ["\u2502", "\u2502"], path: "M 4 0 H 6 V 10 H 4 Z", outline: [[4, 0], [6, 0], [6, 10], [4, 10]] }
};
function isGraphicConnectorEnding(value) {
  return Object.hasOwn(graphicConnectorEndings, value);
}
function graphicShapeIsOpen(type) {
  return type === "freehand" || type === "polyline" || type === "bezier" || type === "line" || type === "connector" || lineArrowOptions.some((option) => option.type === type) || isGraphicPresetType(type) && Boolean(graphicShapePresets[type].open);
}
var graphicArrangeOperations = [
  "align-left",
  "align-center",
  "align-right",
  "align-top",
  "align-middle",
  "align-bottom",
  "distribute-horizontal",
  "distribute-vertical",
  "bring-forward",
  "send-backward",
  "bring-front",
  "send-back"
];
var graphicLayerOperations = [
  "select",
  "toggle-visibility",
  "toggle-lock",
  "move-up",
  "move-down",
  "bring-front",
  "send-back"
];
var graphicViewportOperations = [
  "zoom-in",
  "zoom-out",
  "actual-size",
  "fit-content",
  "set-zoom"
];
function isGraphicShapeType(value) {
  return typeof value === "string" && (["freehand", "polyline", "bezier"].includes(value) || basicGraphicShapeOptions.some((option) => option.type === value) || lineArrowOptions.some((option) => option.type === value) || isGraphicPresetType(value));
}
function isGraphicArrangeOperation(value) {
  return typeof value === "string" && graphicArrangeOperations.includes(value);
}
function isGraphicLayerOperation(value) {
  return typeof value === "string" && graphicLayerOperations.includes(value);
}
function isGraphicViewportOperation(value) {
  return typeof value === "string" && graphicViewportOperations.includes(value);
}
function graphicContainerForNode(node) {
  const element = node instanceof Element ? node : node?.parentElement;
  const graphic = element?.closest("svg") ?? null;
  return graphic?.namespaceURI === SVG_NAMESPACE ? graphic : null;
}
function graphicStrokePoints(element) {
  if (element.namespaceURI !== SVG_NAMESPACE || element.localName !== "path" || element.getAttribute("fill") !== "none") return null;
  const number = "[-+]?(?:\\d*\\.)?\\d+(?:[eE][-+]?\\d+)?";
  const pair = `${number}[ ,]+${number}`;
  const path = element.getAttribute("d") ?? "";
  if (!new RegExp(`^M\\s*${pair}(?:\\s*Q\\s*${pair}[ ,]+${pair})*\\s*L\\s*${pair}\\s*$`).test(path)) return null;
  const values = path.match(new RegExp(number, "g")).map(Number);
  if (!values.every(Number.isFinite) || !path.includes("Q") && (values[0] !== values[2] || values[1] !== values[3])) return null;
  return Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }));
}
function graphicPathGeometry(element) {
  if (element.namespaceURI !== SVG_NAMESPACE || element.localName !== "path") return null;
  const number = "[-+]?(?:\\d*\\.)?\\d+(?:[eE][-+]?\\d+)?";
  const pair = `${number}[ ,]+${number}`;
  const path = element.getAttribute("d") ?? "";
  const cubic = new RegExp(`^M\\s*${pair}(?:\\s*C\\s*${pair}[ ,]+${pair}[ ,]+${pair})+\\s*Z?\\s*$`).test(path);
  if (!cubic && !new RegExp(`^M\\s*${pair}(?:\\s*L\\s*${pair})+\\s*Z?\\s*$`).test(path)) return null;
  const values = path.match(new RegExp(number, "g")).map(Number);
  if (!values.every(Number.isFinite)) return null;
  return {
    kind: cubic ? "curves" : "lines",
    closed: /Z\s*$/.test(path),
    points: Array.from({ length: values.length / 2 }, (_, index) => ({ x: values[index * 2], y: values[index * 2 + 1] }))
  };
}
function primitiveGraphicShapeType(element) {
  if (!element || element.namespaceURI !== SVG_NAMESPACE) return null;
  if (element.localName === "path") {
    const preset = readGraphicPreset(element);
    if (preset) return preset.type;
    if (graphicStrokePoints(element)) return "freehand";
    const path = graphicPathGeometry(element);
    if (path && !path.closed && element.getAttribute("aria-roledescription") === graphicConnectorRole) return "connector";
    return path ? path.kind === "curves" ? "bezier" : "polyline" : null;
  }
  if (element.localName === "rect") return "rectangle";
  if (element.localName === "ellipse" || element.localName === "circle") return "ellipse";
  if (element.localName === "line") return "line";
  if (element.localName === "image") return "image";
  if (element.localName === "polyline") return "connector";
  if (element.localName !== "polygon") return null;
  const coordinateCount = element.getAttribute("points")?.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)?.length ?? 0;
  const pointCount = Math.floor(coordinateCount / 2);
  if (pointCount === 3) return "triangle";
  if (pointCount === 4) return "diamond";
  if (pointCount === 6) return "hexagon";
  if (pointCount === 7) return "arrow";
  if (pointCount === 10) return "star";
  return "polygon";
}
function graphicShapeGeometry(element) {
  const primitive = primitiveGraphicShapeType(element);
  if (primitive) return element;
  if (!element || element.namespaceURI !== SVG_NAMESPACE || element.localName !== "g") return null;
  const children = Array.from(element.children);
  const geometry = children.filter((child) => primitiveGraphicShapeType(child));
  const allowed = children.every((child) => primitiveGraphicShapeType(child) || child.localName === "text" || child.localName === "title");
  return geometry.length === 1 && allowed ? geometry[0] : null;
}
function graphicShapeType(element) {
  return primitiveGraphicShapeType(graphicShapeGeometry(element));
}
function graphicShapeForNode(node) {
  let element = node instanceof Element ? node : node?.parentElement ?? null;
  let shape = null;
  while (element && element.localName !== "svg") {
    if (graphicShapeType(element)) shape = element;
    element = element.parentElement;
  }
  return shape;
}
function graphicShapeRoots(graphic) {
  const shapes = [];
  const skip = /* @__PURE__ */ new Set(["defs", "marker", "clipPath", "mask", "pattern", "symbol"]);
  const visit = (parent) => Array.from(parent.children).forEach((child) => {
    if (skip.has(child.localName)) return;
    if (graphicShapeType(child)) {
      shapes.push(child);
      return;
    }
    if (child.namespaceURI === SVG_NAMESPACE) visit(child);
  });
  visit(graphic);
  return shapes;
}
function standaloneGraphicShape(graphic) {
  if (graphic?.namespaceURI !== SVG_NAMESPACE || graphic.localName !== "svg" || graphic.getAttribute("overflow") !== "visible") return null;
  const content = Array.from(graphic.children).filter((child) => !["defs", "title", "desc", "metadata"].includes(child.localName));
  return content.length === 1 && graphicShapeType(content[0]) ? content[0] : null;
}

// canvas.ts
var ALLOWED_SHAPE_TAGS = /* @__PURE__ */ new Set(["path", "line", "rect", "ellipse", "circle", "polygon", "polyline", "g"]);
var ALLOWED_SHAPE_ATTRS = /* @__PURE__ */ new Set([
  "d",
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "fill",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "transform"
]);
function roundCoord(value) {
  return Math.round(value * 10) / 10;
}
function shapeBounds(shape) {
  const geom = graphicShapeGeometry(shape) ?? shape;
  const tag = geom.localName;
  if (tag === "rect") {
    return {
      x: Number(geom.getAttribute("x") ?? 0),
      y: Number(geom.getAttribute("y") ?? 0),
      width: Number(geom.getAttribute("width") ?? 0),
      height: Number(geom.getAttribute("height") ?? 0)
    };
  }
  if (tag === "ellipse" || tag === "circle") {
    const cx = Number(geom.getAttribute("cx") ?? 0);
    const cy = Number(geom.getAttribute("cy") ?? 0);
    const rx = Number(geom.getAttribute(tag === "circle" ? "r" : "rx") ?? 0);
    const ry = Number(geom.getAttribute(tag === "circle" ? "r" : "ry") ?? 0);
    return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }
  if (tag === "line") {
    return boundsForPoints([
      { x: Number(geom.getAttribute("x1") ?? 0), y: Number(geom.getAttribute("y1") ?? 0) },
      { x: Number(geom.getAttribute("x2") ?? 0), y: Number(geom.getAttribute("y2") ?? 0) }
    ]);
  }
  const points = graphicStrokePoints(geom);
  if (points?.length) return boundsForPoints(points);
  if (geom.localName === "path") {
    const d = geom.getAttribute("d") ?? "";
    const coords = Array.from(d.matchAll(/-?\d*\.?\d+/g), (m) => Number(m[0]));
    const pairs = [];
    for (let i = 0; i + 1 < coords.length; i += 2) pairs.push({ x: coords[i], y: coords[i + 1] });
    if (pairs.length) return boundsForPoints(pairs);
  }
  try {
    const box = geom.getBBox?.();
    if (box && (box.width > 0 || box.height > 0)) return box;
  } catch {
  }
  return null;
}
function sanitizeSvgNode(doc, node) {
  const tag = node.localName;
  if (!ALLOWED_SHAPE_TAGS.has(tag)) return null;
  const clean = doc.createElementNS(SVG_NAMESPACE, tag);
  for (const attr of Array.from(node.attributes)) {
    if (ALLOWED_SHAPE_ATTRS.has(attr.name) && !attr.value.toLowerCase().includes("url(")) {
      clean.setAttribute(attr.name, attr.value);
    }
  }
  if (tag === "g") {
    for (const child of Array.from(node.children)) {
      const sanitizedChild = sanitizeSvgNode(doc, child);
      if (sanitizedChild) clean.appendChild(sanitizedChild);
    }
  }
  return clean;
}
function loadGraphicMarkup(svg, markup) {
  for (const child of graphicShapeRoots(svg)) child.remove();
  const trimmed = markup.trim();
  if (!trimmed) return;
  const doc = svg.ownerDocument;
  const wrapped = `<svg xmlns="${SVG_NAMESPACE}">${trimmed}</svg>`;
  const parsed = new DOMParser().parseFromString(wrapped, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return;
  for (const child of Array.from(parsed.documentElement.children)) {
    const clean = sanitizeSvgNode(doc, child);
    if (clean) svg.appendChild(clean);
  }
}
var GraphicCanvas = class {
  svg;
  #tool = "pen";
  #color = "#111827";
  #strokeWidth = 5;
  #disabled = false;
  #onChange;
  #undoStack = [];
  #activeElement = null;
  #startPoint = null;
  #penPoints = [];
  #erasedInGesture = null;
  #destroyed = false;
  constructor(svg, options = {}) {
    this.svg = svg;
    this.setOptions(options);
    this.svg.addEventListener("pointerdown", this.#handlePointerDown);
    this.svg.addEventListener("pointermove", this.#handlePointerMove);
    this.svg.addEventListener("pointerup", this.#handlePointerEnd);
    this.svg.addEventListener("pointercancel", this.#handlePointerEnd);
  }
  get tool() {
    return this.#tool;
  }
  get color() {
    return this.#color;
  }
  get strokeWidth() {
    return this.#strokeWidth;
  }
  get disabled() {
    return this.#disabled;
  }
  get canUndo() {
    return this.#undoStack.length > 0;
  }
  get isEmpty() {
    return graphicShapeRoots(this.svg).length === 0;
  }
  setOptions(options) {
    if (options.tool !== void 0) this.#tool = options.tool;
    if (options.color !== void 0) this.#color = options.color;
    if (options.strokeWidth !== void 0) this.#strokeWidth = options.strokeWidth;
    if (options.disabled !== void 0) {
      this.#disabled = options.disabled;
      if (this.#disabled) this.#cancelActive();
    }
    if (options.onChange !== void 0) this.#onChange = options.onChange;
  }
  serialize() {
    const serializer = new XMLSerializer();
    return graphicShapeRoots(this.svg).map((node) => serializer.serializeToString(node)).join("");
  }
  load(markup) {
    this.#cancelActive();
    this.#undoStack = [];
    loadGraphicMarkup(this.svg, markup);
  }
  undo() {
    if (this.#disabled) return false;
    const entry = this.#undoStack.pop();
    if (!entry) return false;
    if (entry.type === "add") {
      entry.element.remove();
    } else {
      for (let i = entry.removed.length - 1; i >= 0; i--) {
        const { element, nextSibling } = entry.removed[i];
        const anchor = nextSibling && nextSibling.parentNode === this.svg ? nextSibling : null;
        this.svg.insertBefore(element, anchor);
      }
    }
    this.#onChange?.();
    return true;
  }
  clear() {
    if (this.#disabled) return false;
    this.#cancelActive();
    const shapes = graphicShapeRoots(this.svg);
    if (!shapes.length) return false;
    const removed = shapes.map((element) => ({ element, nextSibling: element.nextSibling }));
    for (const element of shapes) element.remove();
    this.#undoStack.push({ type: "erase", removed });
    this.#onChange?.();
    return true;
  }
  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#cancelActive();
    this.svg.removeEventListener("pointerdown", this.#handlePointerDown);
    this.svg.removeEventListener("pointermove", this.#handlePointerMove);
    this.svg.removeEventListener("pointerup", this.#handlePointerEnd);
    this.svg.removeEventListener("pointercancel", this.#handlePointerEnd);
  }
  #clientToViewBox(event) {
    const rect2 = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox?.baseVal;
    const vbX = vb && vb.width > 0 ? vb.x : 0;
    const vbY = vb && vb.height > 0 ? vb.y : 0;
    const vbW = vb && vb.width > 0 ? vb.width : Number(this.svg.getAttribute("width")) || rect2.width || 800;
    const vbH = vb && vb.height > 0 ? vb.height : Number(this.svg.getAttribute("height")) || rect2.height || 320;
    const w = rect2.width || vbW || 1;
    const h = rect2.height || vbH || 1;
    const rx = Math.max(0, Math.min(1, (event.clientX - rect2.left) / w));
    const ry = Math.max(0, Math.min(1, (event.clientY - rect2.top) / h));
    return {
      x: roundCoord(vbX + rx * vbW),
      y: roundCoord(vbY + ry * vbH)
    };
  }
  #cancelActive() {
    if (this.#activeElement) {
      this.#activeElement.remove();
      this.#activeElement = null;
    }
    this.#startPoint = null;
    this.#penPoints = [];
    this.#erasedInGesture = null;
  }
  #createShape(tag) {
    const el = this.svg.ownerDocument.createElementNS(SVG_NAMESPACE, tag);
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", this.#color);
    el.setAttribute("stroke-width", String(this.#strokeWidth));
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    return el;
  }
  #eraseAt(event) {
    const pt = this.#clientToViewBox(event);
    let hit = graphicShapeForNode(event.target instanceof Node && this.svg.contains(event.target) ? event.target : null);
    if (!hit) {
      const root = this.svg.getRootNode();
      const deepTarget = root.elementFromPoint?.(event.clientX, event.clientY) ?? null;
      hit = graphicShapeForNode(deepTarget && this.svg.contains(deepTarget) ? deepTarget : null);
    }
    if (!hit) {
      const shapes = graphicShapeRoots(this.svg);
      const pad = Math.max(6, this.#strokeWidth);
      for (let i = shapes.length - 1; i >= 0; i--) {
        const box = shapeBounds(shapes[i]);
        if (!box) continue;
        if (pt.x >= box.x - pad && pt.x <= box.x + box.width + pad && pt.y >= box.y - pad && pt.y <= box.y + box.height + pad) {
          hit = shapes[i];
          break;
        }
      }
    }
    if (!hit || hit.parentNode !== this.svg) return;
    if (!this.#erasedInGesture) this.#erasedInGesture = [];
    this.#erasedInGesture.push({ element: hit, nextSibling: hit.nextSibling });
    hit.remove();
  }
  #handlePointerDown = (event) => {
    if (this.#disabled || event.button > 0) return;
    try {
      this.svg.setPointerCapture?.(event.pointerId);
    } catch {
    }
    if (this.#tool === "eraser") {
      this.#erasedInGesture = [];
      this.#eraseAt(event);
      return;
    }
    const pt = this.#clientToViewBox(event);
    this.#startPoint = pt;
    if (this.#tool === "pen") {
      const path = this.#createShape("path");
      this.#penPoints = [pt];
      path.setAttribute("d", `M ${pt.x} ${pt.y} L ${roundCoord(pt.x + 0.1)} ${pt.y}`);
      this.svg.appendChild(path);
      this.#activeElement = path;
    } else if (this.#tool === "line") {
      const line = this.#createShape("line");
      line.setAttribute("x1", String(pt.x));
      line.setAttribute("y1", String(pt.y));
      line.setAttribute("x2", String(pt.x));
      line.setAttribute("y2", String(pt.y));
      this.svg.appendChild(line);
      this.#activeElement = line;
    } else if (this.#tool === "rect") {
      const rect2 = this.#createShape("rect");
      rect2.setAttribute("x", String(pt.x));
      rect2.setAttribute("y", String(pt.y));
      rect2.setAttribute("width", "1");
      rect2.setAttribute("height", "1");
      rect2.setAttribute("rx", "2");
      this.svg.appendChild(rect2);
      this.#activeElement = rect2;
    } else if (this.#tool === "ellipse") {
      const ellipse2 = this.#createShape("ellipse");
      ellipse2.setAttribute("cx", String(pt.x));
      ellipse2.setAttribute("cy", String(pt.y));
      ellipse2.setAttribute("rx", "0.5");
      ellipse2.setAttribute("ry", "0.5");
      this.svg.appendChild(ellipse2);
      this.#activeElement = ellipse2;
    }
  };
  #handlePointerMove = (event) => {
    if (this.#disabled) return;
    if (this.#tool === "eraser") {
      if (this.#erasedInGesture) this.#eraseAt(event);
      return;
    }
    if (!this.#activeElement || !this.#startPoint) return;
    const pt = this.#clientToViewBox(event);
    if (this.#tool === "pen") {
      this.#penPoints.push(pt);
      const d = this.#penPoints.map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      this.#activeElement.setAttribute("d", d);
    } else if (this.#tool === "line") {
      this.#activeElement.setAttribute("x2", String(pt.x));
      this.#activeElement.setAttribute("y2", String(pt.y));
    } else if (this.#tool === "rect") {
      const bounds = boundsForPoints([this.#startPoint, pt]);
      this.#activeElement.setAttribute("x", String(roundCoord(bounds.x)));
      this.#activeElement.setAttribute("y", String(roundCoord(bounds.y)));
      this.#activeElement.setAttribute("width", String(Math.max(1, roundCoord(bounds.width))));
      this.#activeElement.setAttribute("height", String(Math.max(1, roundCoord(bounds.height))));
    } else if (this.#tool === "ellipse") {
      const bounds = boundsForPoints([this.#startPoint, pt]);
      this.#activeElement.setAttribute("cx", String(roundCoord(bounds.x + bounds.width / 2)));
      this.#activeElement.setAttribute("cy", String(roundCoord(bounds.y + bounds.height / 2)));
      this.#activeElement.setAttribute("rx", String(Math.max(0.5, roundCoord(bounds.width / 2))));
      this.#activeElement.setAttribute("ry", String(Math.max(0.5, roundCoord(bounds.height / 2))));
    }
  };
  #handlePointerEnd = (event) => {
    try {
      if (this.svg.hasPointerCapture?.(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    } catch {
    }
    if (this.#erasedInGesture) {
      const removed = this.#erasedInGesture;
      this.#erasedInGesture = null;
      if (removed.length) {
        this.#undoStack.push({ type: "erase", removed });
        this.#onChange?.();
      }
      return;
    }
    if (!this.#activeElement) return;
    const completed = this.#activeElement;
    this.#activeElement = null;
    this.#startPoint = null;
    this.#penPoints = [];
    this.#undoStack.push({ type: "add", element: completed });
    this.#onChange?.();
  };
};
export {
  GraphicCanvas,
  SVG_NAMESPACE,
  adjustGraphicPreset,
  arrowPoints,
  boundsForPoints,
  connectedCalloutTypes,
  constrainCalloutTip,
  defaultGraphicEndingSize,
  defaultGraphicShapePaint,
  graphicArrangeOperations,
  graphicConnectorEndings,
  graphicConnectorRole,
  graphicContainerForNode,
  graphicLayerOperations,
  graphicPathGeometry,
  graphicPresetAngle,
  graphicPresetFillRule,
  graphicPresetHandles,
  graphicPresetOptions,
  graphicPresetPath,
  graphicShapeCategories,
  graphicShapeDragType,
  graphicShapeForNode,
  graphicShapeGeometry,
  graphicShapeIsOpen,
  graphicShapeOptions,
  graphicShapePresets,
  graphicShapeRoots,
  graphicShapeSections,
  graphicShapeType,
  graphicStrokePoints,
  graphicViewportOperations,
  hexagonPoints,
  isConnectedCalloutType,
  isGraphicArrangeOperation,
  isGraphicConnectorEnding,
  isGraphicLayerOperation,
  isGraphicPresetType,
  isGraphicShapeType,
  isGraphicViewportOperation,
  isSpeechBubbleType,
  legacyArrowPresets,
  legacyBannerPaths,
  legacyCalloutPresets,
  legacyChordPreset,
  legacyCloudPreset,
  legacyCurvedArrowPresets,
  legacyRoundFlowPresets,
  legacySequentialStoragePreset,
  legacySpeechBubblePresets,
  loadGraphicMarkup,
  readGraphicPreset,
  readGraphicShapeDrag,
  regularPolygonPoints,
  speechBubblePrefix,
  speechBubbleTypes,
  standaloneGraphicShape,
  starPoints,
  writeGraphicPreset
};
