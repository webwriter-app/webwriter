import { SceneBase } from "./base.js";
import { SceneGroup, SceneImage, ScenePath, SceneSprites, SceneText } from "./elements.js";
import { FORWARDED } from "./mirror.js";
const SVG = "http://www.w3.org/2000/svg";
const TAGS = { group: "g", rect: "rect", circle: "circle", polygon: "polygon", path: "path", text: "text", image: "image", sprites: "g", grid: "g" };
const urls = /* @__PURE__ */ new WeakMap();
let grids = 0;
function urlOf(picture) {
  if (picture instanceof HTMLImageElement) return picture.currentSrc || picture.src;
  let url = urls.get(picture);
  if (url === void 0) {
    let canvas = picture;
    if (!(canvas instanceof HTMLCanvasElement)) {
      const { width, height } = picture;
      canvas = Object.assign(document.createElement("canvas"), { width, height });
      canvas.getContext("2d").drawImage(picture, 0, 0);
    }
    url = canvas.toDataURL();
    urls.set(picture, url);
  }
  return url;
}
const element = (tag, attributes = {}) => {
  const created = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, String(value));
  return created;
};
const turn = (degrees, x, y) => degrees ? `rotate(${degrees} ${x} ${y})` : "";
class Scene extends SceneBase {
  #svg = null;
  /** Everything drawn is in here, so that the view is one transform. */
  #world = null;
  #shapes = /* @__PURE__ */ new Map();
  /** The wide, invisible twin of a thin line, right below it in the drawing order. */
  #hits = /* @__PURE__ */ new Map();
  /** The box behind a text, right below it. */
  #backs = /* @__PURE__ */ new Map();
  /** The markers and labels of a path, right above it. */
  #decor = /* @__PURE__ */ new Map();
  /** The frame of a group, its first child. */
  #frames = /* @__PURE__ */ new Map();
  #items = /* @__PURE__ */ new WeakMap();
  mount(surface) {
    const svg = this.#svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("part", "drawing");
    this.#world = svg.appendChild(document.createElementNS(SVG, "g"));
    const forward = (event) => {
      for (let target = event.target; target && target !== svg; target = target.parentNode) {
        const item = this.#items.get(target);
        if (item) return void this.forward(event, item);
      }
    };
    for (const type of FORWARDED) svg.addEventListener(type, forward);
    surface.prepend(svg);
    this.viewed(this.view);
  }
  unmount() {
    this.#svg?.remove();
    this.#svg = this.#world = null;
  }
  create(item) {
    if (item instanceof SceneSprites) {
      throw new Error("<ww-sprites> is not drawn by the SVG renderer. Register PixiScene from scene/pixi as ww-scene to draw sprite batches.");
    }
    this.#make(item, item instanceof SceneGroup ? "g" : item instanceof ScenePath ? "path" : item instanceof SceneText ? "text" : item instanceof SceneImage ? "image" : "rect");
  }
  #make(item, tag) {
    const created = document.createElementNS(SVG, tag);
    this.#shapes.set(item, created);
    this.#items.set(created, item);
    return created;
  }
  destroy(item) {
    this.#shapes.get(item)?.remove();
    this.#shapes.delete(item);
    for (const twins of [this.#hits, this.#backs, this.#decor, this.#frames]) {
      twins.get(item)?.remove();
      twins.delete(item);
    }
  }
  arrange(group, children) {
    const container = group ? this.#shapes.get(group) : this.#world;
    if (!container) return;
    const sequence = group && this.#frames.has(group) ? [this.#frames.get(group)] : [];
    for (const child of children) {
      for (const twin of [this.#hits.get(child), this.#backs.get(child), this.#shapes.get(child), this.#decor.get(child)]) if (twin) sequence.push(twin);
    }
    let next = container.firstElementChild;
    for (const wanted of sequence) {
      if (wanted === next) next = next.nextElementSibling;
      else container.insertBefore(wanted, next);
    }
  }
  draw(item, drawing, style) {
    let shape = this.#shapes.get(item);
    if (shape.localName !== TAGS[drawing.type]) {
      const old = shape;
      shape = this.#make(item, TAGS[drawing.type]);
      old.replaceWith(shape);
    }
    const set = (values) => {
      for (const [name, value] of Object.entries(values)) shape.setAttribute(name, String(value));
    };
    const optional = (name, value) => value ? shape.setAttribute(name, value) : shape.removeAttribute(name);
    const css = shape.style;
    css.opacity = String(style.opacity);
    if (drawing.type !== "group" && drawing.type !== "grid") {
      css.transition = style.transition;
      css.stroke = style.stroke;
      css.strokeWidth = `${style.strokeWidth}px`;
      css.strokeDasharray = style.dash;
      css.fill = style.fill;
      if (drawing.type === "text") {
        css.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
        css.textAnchor = style.textAnchor;
        css.dominantBaseline = style.baseline === "alphabetic" ? "alphabetic" : "text-before-edge";
        css.paintOrder = "stroke";
        css.strokeLinejoin = "round";
      }
    }
    if (drawing.type === "group") {
      set({ transform: `translate(${drawing.x} ${drawing.y}) scale(${drawing.scale})` });
      this.#frame(item, shape, drawing.frame, style);
    } else if (drawing.type === "rect") {
      set({ x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height });
      optional("rx", drawing.radius ? String(drawing.radius) : "");
      optional("transform", turn(drawing.rotate, drawing.x + drawing.width / 2, drawing.y + drawing.height / 2));
    } else if (drawing.type === "circle") set({ cx: drawing.x, cy: drawing.y, r: drawing.r });
    else if (drawing.type === "polygon") {
      set({ points: drawing.points.map((point) => `${point.x},${point.y}`).join(" ") });
      optional("transform", turn(drawing.rotate, drawing.origin.x, drawing.origin.y));
    } else if (drawing.type === "path") {
      set({ d: drawing.d });
      this.#hit(item, shape, drawing);
      this.#decorate(item, shape, drawing, style);
    } else if (drawing.type === "image") {
      set({ x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height });
      if (drawing.picture) set({ href: drawing.href ?? urlOf(drawing.picture) });
      else shape.removeAttribute("href");
    } else if (drawing.type === "text") {
      this.#write(shape, drawing.x, drawing.y, drawing.text.split("\n"), style);
      optional("transform", turn(drawing.rotate, drawing.x, drawing.y));
      this.#back(item, shape, style, drawing.rotate ? `rotate(${drawing.rotate} ${drawing.x} ${drawing.y})` : "");
    } else if (drawing.type === "grid") this.#grid(shape, drawing, style);
  }
  /**
   * Writes lines of text. `y` is what the style's baseline says: the top, the
   * middle or the bottom of the whole text, or the alphabetic baseline of its first line.
   */
  #write(text, x, y, lines, style) {
    const factor = style.baseline === "middle" ? 0.5 : style.baseline === "bottom" ? 1 : 0;
    const top = style.baseline === "alphabetic" ? y : y - lines.length * style.lineHeight * factor;
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(top));
    if (lines.length === 1) {
      delete text.dataset.lines;
      if (text.childElementCount || text.textContent !== lines[0]) text.textContent = lines[0];
      return;
    }
    const key = `${x}|${top}|${style.lineHeight}|${lines.join("\n")}`;
    if (text.dataset.lines === key) return;
    text.dataset.lines = key;
    text.replaceChildren(...lines.map((line, index) => Object.assign(element("tspan", { x, dy: index ? style.lineHeight : 0 }), { textContent: line })));
  }
  /** The box behind a text: below it, with its padding and corner radius. Gone for a text without a background. */
  #back(item, text, style, transform) {
    let back = this.#backs.get(item);
    if (style.background === "none") {
      back?.remove();
      this.#backs.delete(item);
      return;
    }
    if (!back) {
      back = element("rect");
      this.#backs.set(item, back);
      this.#items.set(back, item);
    }
    if (back.nextElementSibling !== text) text.before(back);
    const [top, right, bottom, left] = style.padding.split(" ").map(Number);
    const { x, y, width, height } = text.getBBox();
    back.setAttribute("x", String(x - left));
    back.setAttribute("y", String(y - top));
    back.setAttribute("width", String(width + left + right));
    back.setAttribute("height", String(height + top + bottom));
    back.setAttribute("rx", String(style.radius));
    if (transform) back.setAttribute("transform", transform);
    else back.removeAttribute("transform");
    back.style.fill = style.background;
  }
  /**
   * A selectable or movable line takes the pointer in a band around it. The band
   * is drawn right below the line, so a shape above the line still covers it.
   */
  #hit(item, line, drawing) {
    let hit = this.#hits.get(item);
    if (!drawing.hit) {
      hit?.remove();
      this.#hits.delete(item);
      return;
    }
    if (!hit) {
      hit = document.createElementNS(SVG, "polyline");
      hit.setAttribute("part", "hit");
      this.#hits.set(item, hit);
      this.#items.set(hit, item);
    }
    if (hit.nextElementSibling !== line) line.before(hit);
    hit.setAttribute("points", drawing.points.map((point) => `${point.x},${point.y}`).join(" "));
    hit.style.strokeWidth = `${drawing.hit}px`;
  }
  /** The markers and the labels of a path, in one group right above it. */
  #decorate(item, line, drawing, style) {
    let decor = this.#decor.get(item);
    if (!drawing.markers.length && !drawing.labels.length) {
      decor?.remove();
      this.#decor.delete(item);
      return;
    }
    if (!decor) {
      decor = element("g", { part: "decor" });
      this.#decor.set(item, decor);
      this.#items.set(decor, item);
    }
    if (line.nextElementSibling !== decor) line.after(decor);
    decor.replaceChildren(...drawing.markers.map((marker) => this.#marker(marker, style)), ...drawing.labels.map((label) => this.#label(label)));
  }
  /** A marker, in the stroke colour and the stroke width of its path. A hollow one is filled with `--ww-scene-marker-fill`, and still takes the pointer inside. */
  #marker(marker, style) {
    const shape = marker.polygon ? element("polygon", { points: marker.polygon.map((point) => `${point.x},${point.y}`).join(" ") }) : marker.line ? element("polyline", { points: marker.line.map((point) => `${point.x},${point.y}`).join(" ") }) : element("circle", { cx: marker.circle.x, cy: marker.circle.y, r: marker.circle.r });
    const css = shape.style;
    css.pointerEvents = "all";
    css.strokeLinejoin = "round";
    if (marker.filled) {
      css.fill = style.stroke;
      css.stroke = "none";
    } else {
      css.fill = marker.line ? "none" : style.markerFill;
      css.stroke = style.stroke;
      css.strokeWidth = `${style.strokeWidth}px`;
    }
    return shape;
  }
  /** A label: a box with the text of the label in it, turned about the box's centre. */
  #label(label) {
    const { style } = label;
    const group = element("g", { transform: `translate(${label.x} ${label.y})${label.rotate ? ` rotate(${label.rotate})` : ""}` });
    if (style.background !== "none") {
      const box = element("rect", { x: -label.width / 2, y: -label.height / 2, width: label.width, height: label.height, rx: style.radius });
      box.style.fill = style.background;
      group.append(box);
    }
    const text = element("text");
    const css = text.style;
    css.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    css.textAnchor = "middle";
    css.fill = style.fill;
    css.stroke = style.stroke;
    css.strokeWidth = `${style.strokeWidth}px`;
    css.paintOrder = "stroke";
    css.strokeLinejoin = "round";
    const height = label.lines.length * style.lineHeight;
    this.#write(text, label.shift.x, label.shift.y - height / 2, label.lines, { ...style, baseline: "top" });
    group.append(text);
    return group;
  }
  /** The box of a framed group, below its content, with its label; none for a group without one. */
  #frame(item, group, frame, style) {
    let box = this.#frames.get(item);
    if (!frame) {
      box?.remove();
      this.#frames.delete(item);
      return;
    }
    if (!box) {
      box = element("g", { part: "frame" });
      box.append(element("rect"));
      this.#frames.set(item, box);
      this.#items.set(box, item);
      group.prepend(box);
    }
    box.classList.toggle("interactive", frame.interactive);
    const rect = box.firstElementChild;
    for (const [name, value] of Object.entries({ x: frame.x, y: frame.y, width: frame.width, height: frame.height, rx: frame.radius })) rect.setAttribute(name, String(value));
    rect.style.fill = style.fill;
    rect.style.stroke = style.stroke;
    rect.style.strokeWidth = `${style.strokeWidth}px`;
    rect.style.strokeDasharray = style.dash;
    box.querySelector("text")?.remove();
    if (frame.label) {
      const text = element("text");
      text.style.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
      text.style.fill = style.color;
      this.#write(text, frame.label.x, frame.label.y, [frame.label.text], { ...style, baseline: "top" });
      box.append(text);
    }
  }
  /** A grid: one pattern, and one rect over the visible part of the scene that is painted with it. */
  #grid(group, drawing, style) {
    if (!group.firstElementChild) {
      const id = `ww-grid-${++grids}`;
      group.setAttribute("part", "grid");
      const pattern2 = element("pattern", { id, patternUnits: "userSpaceOnUse" });
      group.append(element("defs"), element("rect"));
      group.firstElementChild.append(pattern2);
      group.lastElementChild.setAttribute("fill", `url(#${id})`);
    }
    const pattern = group.querySelector("pattern");
    const { spacing, kind, r, area } = drawing;
    for (const [name, value] of Object.entries({ x: -spacing / 2, y: -spacing / 2, width: spacing, height: spacing })) pattern.setAttribute(name, String(value));
    const mark = kind === "dots" ? element("circle", { cx: spacing / 2, cy: spacing / 2, r }) : element("path", { d: `M${spacing / 2} 0V${spacing}M0 ${spacing / 2}H${spacing}` });
    if (kind === "dots") mark.style.fill = style.fill;
    else {
      mark.style.fill = "none";
      mark.style.stroke = style.stroke;
      mark.style.strokeWidth = `${style.strokeWidth}px`;
    }
    pattern.replaceChildren(mark);
    const rect = group.lastElementChild;
    for (const [name, value] of Object.entries({ x: area.x, y: area.y, width: area.width, height: area.height })) rect.setAttribute(name, String(value));
  }
  measure(item) {
    const shape = this.#shapes.get(item);
    if (!(shape instanceof SVGGraphicsElement) || !shape.isConnected) return null;
    const { x, y, width, height } = shape.getBBox();
    return { x, y, width, height };
  }
  viewed(view) {
    this.#world?.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.k})`);
  }
  rendering(item) {
    return this.#shapes.get(item);
  }
}
export {
  Scene
};
