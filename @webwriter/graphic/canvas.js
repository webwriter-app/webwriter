import { SVG_NAMESPACE, boundsForPoints, graphicShapeForNode, graphicShapeGeometry, graphicShapeRoots, graphicStrokePoints } from "./graphic";
const ALLOWED_SHAPE_TAGS = /* @__PURE__ */ new Set(["path", "line", "rect", "ellipse", "circle", "polygon", "polyline", "g"]);
const ALLOWED_SHAPE_ATTRS = /* @__PURE__ */ new Set([
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
class GraphicCanvas {
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
    const rect = this.svg.getBoundingClientRect();
    const vb = this.svg.viewBox?.baseVal;
    const vbX = vb && vb.width > 0 ? vb.x : 0;
    const vbY = vb && vb.height > 0 ? vb.y : 0;
    const vbW = vb && vb.width > 0 ? vb.width : Number(this.svg.getAttribute("width")) || rect.width || 800;
    const vbH = vb && vb.height > 0 ? vb.height : Number(this.svg.getAttribute("height")) || rect.height || 320;
    const w = rect.width || vbW || 1;
    const h = rect.height || vbH || 1;
    const rx = Math.max(0, Math.min(1, (event.clientX - rect.left) / w));
    const ry = Math.max(0, Math.min(1, (event.clientY - rect.top) / h));
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
      const rect = this.#createShape("rect");
      rect.setAttribute("x", String(pt.x));
      rect.setAttribute("y", String(pt.y));
      rect.setAttribute("width", "1");
      rect.setAttribute("height", "1");
      rect.setAttribute("rx", "2");
      this.svg.appendChild(rect);
      this.#activeElement = rect;
    } else if (this.#tool === "ellipse") {
      const ellipse = this.#createShape("ellipse");
      ellipse.setAttribute("cx", String(pt.x));
      ellipse.setAttribute("cy", String(pt.y));
      ellipse.setAttribute("rx", "0.5");
      ellipse.setAttribute("ry", "0.5");
      this.svg.appendChild(ellipse);
      this.#activeElement = ellipse;
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
}
export {
  GraphicCanvas,
  loadGraphicMarkup
};
