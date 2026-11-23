const IDENTITY = { x: 0, y: 0, k: 1 };
const apply = (t, p) => ({ x: t.x + p.x * t.k, y: t.y + p.y * t.k });
const invert = (t, p) => ({ x: (p.x - t.x) / t.k, y: (p.y - t.y) / t.k });
const compose = (outer, inner) => ({ x: outer.x + inner.x * outer.k, y: outer.y + inner.y * outer.k, k: outer.k * inner.k });
const snap = (value, grid) => grid > 0 ? Math.round(value / grid) * grid : value;
function polyline(points, closed = false) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("") + (closed && points.length ? "Z" : "");
}
const lineCurve = (a, b) => ({ type: "poly", points: [a, b] });
function routeCurve(a, b, kind, da, db) {
  if (kind === "step") {
    const points = da.y !== 0 ? [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b] : [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b];
    return { type: "poly", points };
  }
  if (kind === "curve") {
    const reach = Math.max(24, Math.hypot(b.x - a.x, b.y - a.y) * 0.4);
    return { type: "cubic", a, c1: { x: a.x + da.x * reach, y: a.y + da.y * reach }, c2: { x: b.x + db.x * reach, y: b.y + db.y * reach }, b };
  }
  return lineCurve(a, b);
}
function route(a, b, kind, da, db) {
  const curve = kind === "avoid" ? { type: "poly", points: avoidRoute(a, da, b, db, [], 12) } : routeCurve(a, b, kind === "step" || kind === "curve" ? kind : "straight", da, db);
  return { d: curveD(curve), points: curveSamples(curve) };
}
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a) => {
  const length = Math.hypot(a.x, a.y);
  return length ? { x: a.x / length, y: a.y / length } : { x: 0, y: 0 };
};
const curveStart = (c) => c.type === "poly" ? c.points[0] : c.a;
const curveEnd = (c) => c.type === "poly" ? c.points[c.points.length - 1] : c.b;
function curveD(c) {
  if (c.type === "poly") return polyline(c.points);
  if (c.type === "quad") return `M${c.a.x} ${c.a.y}Q${c.c.x} ${c.c.y} ${c.b.x} ${c.b.y}`;
  return `M${c.a.x} ${c.a.y}C${c.c1.x} ${c.c1.y} ${c.c2.x} ${c.c2.y} ${c.b.x} ${c.b.y}`;
}
function bezierAt(c, t) {
  const u = 1 - t;
  if (c.type === "quad") return { x: u * u * c.a.x + 2 * u * t * c.c.x + t * t * c.b.x, y: u * u * c.a.y + 2 * u * t * c.c.y + t * t * c.b.y };
  return {
    x: u * u * u * c.a.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * c.b.x,
    y: u * u * u * c.a.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * c.b.y
  };
}
function polyAt(points, t) {
  if (points.length === 1) return points[0];
  const lengths = points.slice(1).map((p, i) => dist(points[i], p));
  let left = lengths.reduce((sum, length) => sum + length, 0) * Math.min(1, Math.max(0, t));
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) return lerp(points[i], points[i + 1], lengths[i] ? Math.min(1, left / lengths[i]) : 0);
    left -= lengths[i];
  }
  return points[points.length - 1];
}
function curveAt(c, t) {
  return c.type === "poly" ? polyAt(c.points, t) : bezierAt(c, t);
}
function curveSamples(c, steps = 16) {
  if (c.type === "poly") return c.points;
  const points = [];
  for (let i = 0; i <= steps; i++) points.push(bezierAt(c, i / steps));
  return points;
}
function curveBetween(c, t0, t1) {
  if (t0 <= 0 && t1 >= 1) return c;
  if (c.type === "poly") {
    const lengths = c.points.slice(1).map((p, i) => dist(c.points[i], p));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const [from, to] = [t0 * total, t1 * total];
    const points = [polyAt(c.points, t0)];
    let walked = 0;
    for (let i = 0; i < lengths.length; i++) {
      walked += lengths[i];
      if (walked > from + 1e-9 && walked < to - 1e-9) points.push(c.points[i + 1]);
    }
    points.push(polyAt(c.points, t1));
    return { type: "poly", points };
  }
  const split = (points, t) => {
    const left = [points[0]];
    const right = [points[points.length - 1]];
    let level = points;
    while (level.length > 1) {
      level = level.slice(1).map((p, i) => lerp(level[i], p, t));
      left.push(level[0]);
      right.unshift(level[level.length - 1]);
    }
    return [left, right];
  };
  const control = c.type === "quad" ? [c.a, c.c, c.b] : [c.a, c.c1, c.c2, c.b];
  const first = t1 < 1 ? split(control, t1)[0] : control;
  const part = t0 > 0 ? split(first, t0 / t1)[1] : first;
  return part.length === 3 ? { type: "quad", a: part[0], c: part[1], b: part[2] } : { type: "cubic", a: part[0], c1: part[1], c2: part[2], b: part[3] };
}
const SCAN = 64;
function clipCurve(c, insideStart, insideEnd) {
  let t0 = 0;
  let t1 = 1;
  if (insideStart) {
    let i = 0;
    while (i <= SCAN && insideStart(curveAt(c, i / SCAN))) i++;
    if (i > SCAN) return null;
    if (i > 0) {
      let [inside, outside] = [(i - 1) / SCAN, i / SCAN];
      for (let n = 0; n < 24; n++) {
        const middle = (inside + outside) / 2;
        if (insideStart(curveAt(c, middle))) inside = middle;
        else outside = middle;
      }
      t0 = outside;
    }
  }
  if (insideEnd) {
    let i = SCAN;
    while (i >= 0 && insideEnd(curveAt(c, i / SCAN))) i--;
    if (i < 0) return null;
    if (i < SCAN) {
      let [inside, outside] = [(i + 1) / SCAN, i / SCAN];
      for (let n = 0; n < 24; n++) {
        const middle = (inside + outside) / 2;
        if (insideEnd(curveAt(c, middle))) inside = middle;
        else outside = middle;
      }
      t1 = outside;
    }
  }
  return t0 < t1 ? curveBetween(c, t0, t1) : null;
}
function trimCurveEnd(c, length) {
  return trimmed(c, length, false);
}
function trimCurveStart(c, length) {
  return trimmed(c, length, true);
}
function trimmed(c, length, atStart) {
  if (length <= 0) return c;
  const end = atStart ? curveStart(c) : curveEnd(c);
  let i = 1;
  while (i <= SCAN && dist(curveAt(c, atStart ? i / SCAN : 1 - i / SCAN), end) < length) i++;
  const limit = 0.9;
  if (i > SCAN) return atStart ? curveBetween(c, limit, 1) : curveBetween(c, 0, 1 - limit);
  let [near, far] = [(i - 1) / SCAN, i / SCAN];
  for (let n = 0; n < 24; n++) {
    const middle = (near + far) / 2;
    if (dist(curveAt(c, atStart ? middle : 1 - middle), end) < length) near = middle;
    else far = middle;
  }
  const t = Math.min(limit, far);
  return atStart ? curveBetween(c, t, 1) : curveBetween(c, 0, 1 - t);
}
function pointAlong(points, distance) {
  if (points.length < 2) return { at: points[0] ?? { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
  let left = Math.max(0, distance);
  for (let i = 0; i < points.length - 1; i++) {
    const length = dist(points[i], points[i + 1]);
    if (left <= length || i === points.length - 2) {
      const t = length ? Math.min(1, left / length) : 0;
      const direction = length ? unit({ x: points[i + 1].x - points[i].x, y: points[i + 1].y - points[i].y }) : { x: 1, y: 0 };
      return { at: lerp(points[i], points[i + 1], t), direction };
    }
    left -= length;
  }
  return { at: points[points.length - 1], direction: { x: 1, y: 0 } };
}
const polylineLength = (points) => points.slice(1).reduce((sum, p, i) => sum + dist(points[i], p), 0);
function outlineContains(o, p) {
  const [hw, hh] = [o.width / 2, o.height / 2];
  const [dx, dy] = [Math.abs(p.x - (o.x + hw)), Math.abs(p.y - (o.y + hh))];
  if (o.kind === "circle") return Math.hypot(dx, dy) <= Math.min(hw, hh);
  if (o.kind === "ellipse") return hw > 0 && hh > 0 && (dx / hw) ** 2 + (dy / hh) ** 2 <= 1;
  if (dx > hw || dy > hh) return false;
  const r = o.kind === "rounded" ? Math.min(o.radius, hw, hh) : 0;
  if (r <= 0 || dx <= hw - r || dy <= hh - r) return true;
  return Math.hypot(dx - (hw - r), dy - (hh - r)) <= r;
}
function outlineEdge(o, direction) {
  const centre = { x: o.x + o.width / 2, y: o.y + o.height / 2 };
  let [inside, outside] = [0, o.width + o.height + 1];
  for (let n = 0; n < 32; n++) {
    const middle = (inside + outside) / 2;
    if (outlineContains(o, { x: centre.x + direction.x * middle, y: centre.y + direction.y * middle })) inside = middle;
    else outside = middle;
  }
  return { x: centre.x + direction.x * inside, y: centre.y + direction.y * inside };
}
const dominantSide = (d) => Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x) || 1, y: 0 } : { x: 0, y: Math.sign(d.y) };
function arcControl(a, b, bend) {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  return { x: (a.x + b.x) / 2 + dy * bend, y: (a.y + b.y) / 2 - dx * bend };
}
const LOOP_SPREAD = 40;
function loopCurve(a, b, angle, reach) {
  const radians = (angle - 90) * Math.PI / 180;
  const spread = LOOP_SPREAD * Math.PI / 180;
  const length = reach / (0.75 * Math.cos(spread));
  const along = (turn) => ({ x: Math.cos(radians + turn) * length, y: Math.sin(radians + turn) * length });
  const [left, right] = [along(-spread), along(spread)];
  return { type: "cubic", a, c1: { x: a.x + left.x, y: a.y + left.y }, c2: { x: b.x + right.x, y: b.y + right.y }, b };
}
function segmentHits(a, b, box) {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return x1 > box.x && x0 < box.x + box.width && y1 > box.y && y0 < box.y + box.height;
}
function orthogonalRoute(a, da, b, db, boxes, gap) {
  const horizontal = da.x !== 0 ? true : da.y !== 0 ? false : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const flip = (p) => horizontal ? p : { x: p.y, y: p.x };
  const [fa, fb] = [flip(a), flip(b)];
  const [ua, ub] = [horizontal ? da.x : da.y, horizontal ? db.x : db.y];
  const wrap = (box) => horizontal ? box : { x: box.y, y: box.x, width: box.height, height: box.width };
  const flipped = boxes.map(wrap);
  const middle = (fa.x + fb.x) / 2;
  const route2 = (x3) => [fa, { x: x3, y: fa.y }, { x: x3, y: fb.y }, fb];
  const free = (points) => points.slice(1).every((p, i) => flipped.every((box) => !segmentHits(points[i], p, { x: box.x - gap / 2, y: box.y - gap / 2, width: box.width + gap, height: box.height + gap })));
  const candidates = [middle, ...flipped.flatMap((box) => [box.x - gap, box.x + box.width + gap])].filter((x3) => (ua === 0 || (x3 - fa.x) * ua >= 0) && (ub === 0 || (x3 - fb.x) * ub >= 0)).sort((p, q) => Math.abs(p - middle) - Math.abs(q - middle));
  const x = candidates.find((candidate) => free(route2(candidate)));
  if (x !== void 0) return simple(route2(x)).map(flip);
  const stub = (sign, towards) => gap * (sign || Math.sign(towards) || 1);
  const [x1, x2] = [fa.x + stub(ua, fb.x - fa.x), fb.x + stub(ub, fa.x - fb.x)];
  const detour = (y2) => [fa, { x: x1, y: fa.y }, { x: x1, y: y2 }, { x: x2, y: y2 }, { x: x2, y: fb.y }, fb];
  const heights = flipped.flatMap((box) => [box.y - gap, box.y + box.height + gap]).sort((p, q) => Math.abs(p - (fa.y + fb.y) / 2) - Math.abs(q - (fa.y + fb.y) / 2));
  const y = heights.find((candidate) => free(detour(candidate)));
  return simple(y === void 0 ? route2(middle) : detour(y)).map(flip);
}
const simple = (points) => {
  const apart = points.filter((p, i, all) => i === 0 || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
  return apart.filter((p, i, all) => i === 0 || i === all.length - 1 || !(p.x === all[i - 1].x && p.x === all[i + 1].x || p.y === all[i - 1].y && p.y === all[i + 1].y));
};
function avoidRoute(a, da, b, db, boxes, gap, paths = []) {
  gap = Math.max(1, gap);
  const padded = boxes.map((box) => ({ x: box.x - gap, y: box.y - gap, width: box.width + 2 * gap, height: box.height + 2 * gap }));
  const contains = (box, p) => p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height;
  const axis = (direction, towards) => direction.x || direction.y ? dominantSide(direction) : dominantSide(towards);
  da = axis(da, { x: b.x - a.x, y: b.y - a.y });
  db = axis(db, { x: a.x - b.x, y: a.y - b.y });
  const escape = (p, direction) => {
    let reach = gap;
    const owner = boxes.findIndex((box) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height);
    for (const box of owner < 0 ? [] : [padded[owner]]) if (contains(box, p)) {
      reach = Math.max(reach, direction.x > 0 ? box.x + box.width - p.x : direction.x < 0 ? p.x - box.x : direction.y > 0 ? box.y + box.height - p.y : p.y - box.y);
    }
    const point = { x: p.x + direction.x * reach, y: p.y + direction.y * reach };
    return padded.some((box, index) => index !== owner && segmentHits(p, point, box)) ? null : point;
  };
  const [start, end] = [escape(a, da), escape(b, db)];
  if (!start || !end) return [];
  const xs = /* @__PURE__ */ new Set([start.x - gap, start.x, start.x + gap, end.x - gap, end.x, end.x + gap]);
  const ys = /* @__PURE__ */ new Set([start.y - gap, start.y, start.y + gap, end.y - gap, end.y, end.y + gap]);
  for (const box of padded) {
    xs.add(box.x).add(box.x + box.width);
    ys.add(box.y).add(box.y + box.height);
  }
  for (const path of paths) {
    const box = bounds(path);
    if (box) {
      xs.add(box.x - gap).add(box.x + box.width + gap);
      ys.add(box.y - gap).add(box.y + box.height + gap);
    }
    for (let i = 1; i < path.length; i++) {
      if (path[i].x === path[i - 1].x) xs.add(path[i].x - gap).add(path[i].x + gap);
      if (path[i].y === path[i - 1].y) ys.add(path[i].y - gap).add(path[i].y + gap);
    }
  }
  const xx = [...xs].sort((p, q) => p - q), yy = [...ys].sort((p, q) => p - q);
  const width = xx.length, count = width * yy.length;
  const at = (index) => ({ x: xx[index % width], y: yy[Math.floor(index / width)] });
  const indexOf = (p) => yy.indexOf(p.y) * width + xx.indexOf(p.x);
  const [first, last] = [indexOf(start), indexOf(end)];
  if (padded.some((box) => contains(box, start) || contains(box, end))) return [];
  const edges = /* @__PURE__ */ new Map();
  const cost = (from, to, vertical) => {
    const key = Math.min(from, to) * 2 + Number(vertical);
    const cached = edges.get(key);
    if (cached !== void 0) return cached;
    const [p, q] = [at(from), at(to)];
    let value = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
    if (padded.some((box) => segmentHits(p, q, box))) value = Infinity;
    else for (const path of paths) for (let i = 1; i < path.length; i++) {
      const [r, s] = [path[i - 1], path[i]];
      if (vertical ? r.x === s.x : r.y === s.y) {
        const separation = Math.abs(vertical ? p.x - r.x : p.y - r.y);
        const overlap = vertical ? Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)) : Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x));
        if (separation < gap && overlap > 0) value += 40 * overlap * (1 - separation / gap);
      } else {
        const dx = q.x - p.x, dy = q.y - p.y, ex = s.x - r.x, ey = s.y - r.y;
        const cross = dx * ey - dy * ex;
        if (cross) {
          const t = ((r.x - p.x) * ey - (r.y - p.y) * ex) / cross;
          const u = ((r.x - p.x) * dy - (r.y - p.y) * dx) / cross;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) value += gap * 16 * (t === 0 || t === 1 ? 0.5 : 1);
        }
      }
    }
    edges.set(key, value);
    return value;
  };
  const distance = new Float64Array(count * 2).fill(Infinity);
  const previous = new Int32Array(count * 2).fill(-1);
  const heap = [];
  const push = (entry) => {
    let i = heap.length;
    heap.push(entry);
    while (i > 0) {
      const parent = i - 1 >> 1;
      if (heap[parent].score <= entry.score) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const entry = heap[0], tail = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= tail.score) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = tail;
    }
    return entry;
  };
  const initial = first * 2 + Number(da.y !== 0);
  distance[initial] = 0;
  push({ state: initial, cost: 0, score: Math.abs(start.x - end.x) + Math.abs(start.y - end.y) });
  while (heap.length) {
    const current = pop(), node = current.state >> 1, direction = current.state & 1;
    if (current.cost !== distance[current.state]) continue;
    if (node === last) {
      const points = [];
      for (let state = current.state; state !== -1; state = previous[state]) points.push(at(state >> 1));
      return simple([a, ...points.reverse(), b]);
    }
    const p = at(node), x = node % width, y = Math.floor(node / width);
    for (const next of [x > 0 ? node - 1 : -1, x + 1 < width ? node + 1 : -1, y > 0 ? node - width : -1, y + 1 < yy.length ? node + width : -1]) {
      if (next < 0) continue;
      const q = at(next), vertical = q.y !== p.y;
      if (node === first && (q.x - p.x) * da.x + (q.y - p.y) * da.y < 0) continue;
      if (next === last && (q.x - p.x) * db.x + (q.y - p.y) * db.y > 0) continue;
      const nextState = next * 2 + Number(vertical);
      const nextCost = current.cost + cost(node, next, vertical) + (Number(vertical) === direction ? 0 : gap * 2);
      if (nextCost >= distance[nextState]) continue;
      distance[nextState] = nextCost;
      previous[nextState] = current.state;
      push({ state: nextState, cost: nextCost, score: nextCost + Math.abs(q.x - end.x) + Math.abs(q.y - end.y) });
    }
  }
  return [];
}
const MARKERS = ["none", "arrow", "open-arrow", "triangle", "triangle-filled", "diamond", "diamond-filled", "circle", "circle-open"];
const markerSize = (strokeWidth) => 8 + 2 * strokeWidth;
function markerInset(kind, size) {
  if (kind === "arrow" || kind === "triangle" || kind === "triangle-filled") return size;
  if (kind === "diamond" || kind === "diamond-filled") return 1.5 * size;
  if (kind === "circle" || kind === "circle-open") return 0.8 * size;
  return 0;
}
function marker(kind, tip, out, size) {
  if (kind === "none") return null;
  const side = { x: -out.y, y: out.x };
  const at = (back, across) => ({ x: tip.x - out.x * back + side.x * across, y: tip.y - out.y * back + side.y * across });
  const result = { kind, filled: kind === "arrow" || kind === "triangle-filled" || kind === "diamond-filled" || kind === "circle", polygon: null, line: null, circle: null };
  if (kind === "arrow" || kind === "triangle" || kind === "triangle-filled") result.polygon = [tip, at(size, 0.4 * size), at(size, -0.4 * size)];
  else if (kind === "open-arrow") result.line = [at(size, 0.4 * size), tip, at(size, -0.4 * size)];
  else if (kind === "diamond" || kind === "diamond-filled") result.polygon = [tip, at(0.75 * size, 0.45 * size), at(1.5 * size, 0), at(0.75 * size, -0.45 * size)];
  else {
    const r = 0.4 * size;
    const centre = at(r, 0);
    result.circle = { x: centre.x, y: centre.y, r };
  }
  return result;
}
function markerPolygon(m) {
  if (m.polygon) return m.polygon;
  if (m.line) return m.line;
  const c = m.circle;
  return Array.from({ length: 12 }, (_, i) => ({ x: c.x + c.r * Math.cos(i / 12 * 2 * Math.PI), y: c.y + c.r * Math.sin(i / 12 * 2 * Math.PI) }));
}
function turned(p, origin, degrees) {
  if (!degrees) return p;
  const [cos, sin] = [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)];
  const [dx, dy] = [p.x - origin.x, p.y - origin.y];
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
}
function curveDirection(c, atStart) {
  const points = c.type === "poly" ? atStart ? c.points : [...c.points].reverse() : c.type === "quad" ? atStart ? [c.a, c.c, c.b] : [c.b, c.c, c.a] : atStart ? [c.a, c.c1, c.c2, c.b] : [c.b, c.c2, c.c1, c.a];
  const other = points.slice(1).find((p) => p.x !== points[0].x || p.y !== points[0].y) ?? { x: points[0].x - 1, y: points[0].y };
  return unit({ x: points[0].x - other.x, y: points[0].y - other.y });
}
function turnedBox(x, y, width, height, rotate) {
  const [cos, sin] = [Math.cos(rotate * Math.PI / 180), Math.sin(rotate * Math.PI / 180)];
  return [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2]
  ].map(([px, py]) => ({ x: x + px * cos - py * sin, y: y + px * sin + py * cos }));
}
function placeLabel(line, spec) {
  const length = polylineLength(line);
  const { at, direction } = pointAlong(line, Math.min(length, Math.max(0, spec.where * length + spec.along)));
  let rotate = spec.rotate;
  if (spec.follow) {
    rotate = Math.atan2(direction.y, direction.x) * 180 / Math.PI;
    if (rotate > 90) rotate -= 180;
    else if (rotate <= -90) rotate += 180;
  }
  if (spec.side === "on") return { x: at.x, y: at.y, rotate };
  const left = { x: direction.y, y: -direction.x };
  const sign = spec.side === "left" ? 1 : spec.side === "right" ? -1 : spec.side === "above" ? left.y < -1e-6 || Math.abs(left.y) <= 1e-6 && left.x > 0 ? 1 : -1 : left.y > 1e-6 || Math.abs(left.y) <= 1e-6 && left.x < 0 ? 1 : -1;
  const normal = { x: left.x * sign, y: left.y * sign };
  const radians = rotate * Math.PI / 180;
  const [u, v] = [{ x: Math.cos(radians), y: Math.sin(radians) }, { x: -Math.sin(radians), y: Math.cos(radians) }];
  const reach = Math.abs(normal.x * u.x + normal.y * u.y) * (spec.width / 2) + Math.abs(normal.x * v.x + normal.y * v.y) * (spec.height / 2);
  return { x: at.x + normal.x * (spec.gap + reach), y: at.y + normal.y * (spec.gap + reach), rotate };
}
function bounds(points) {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return left > right ? null : { x: left, y: top, width: right - left, height: bottom - top };
}
const corners = (r) => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height }
];
function rectsIntersect(a, b) {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}
function polylineHitsRect(points, r) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const dx = points[i + 1].x - a.x;
    const dy = points[i + 1].y - a.y;
    let t0 = 0;
    let t1 = 1;
    const edges = [
      [-dx, a.x - r.x],
      [dx, r.x + r.width - a.x],
      [-dy, a.y - r.y],
      [dy, r.y + r.height - a.y]
    ];
    let inside = true;
    for (const [p, q] of edges) {
      if (p === 0) inside &&= q >= 0;
      else if (p < 0) t0 = Math.max(t0, q / p);
      else t1 = Math.min(t1, q / p);
    }
    if (inside && t0 <= t1) return true;
  }
  return false;
}
function distanceToPolyline(points, x, y) {
  let nearest = points.length === 1 ? Math.hypot(x - points[0].x, y - points[0].y) : Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const dx = points[i + 1].x - a.x;
    const dy = points[i + 1].y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return nearest;
}
function polygonContains(points, p) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [a, b] = [points[i], points[j]];
    if (a.y > p.y !== b.y > p.y && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export {
  IDENTITY,
  MARKERS,
  apply,
  arcControl,
  avoidRoute,
  bounds,
  clipCurve,
  compose,
  corners,
  curveAt,
  curveBetween,
  curveD,
  curveDirection,
  curveEnd,
  curveSamples,
  curveStart,
  distanceToPolyline,
  dominantSide,
  invert,
  lineCurve,
  loopCurve,
  marker,
  markerInset,
  markerPolygon,
  markerSize,
  orthogonalRoute,
  outlineContains,
  outlineEdge,
  placeLabel,
  pointAlong,
  polygonContains,
  polyline,
  polylineHitsRect,
  polylineLength,
  rectsIntersect,
  route,
  routeCurve,
  snap,
  trimCurveEnd,
  trimCurveStart,
  turned,
  turnedBox
};
