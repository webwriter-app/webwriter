import { SceneGroup, SceneItem, SceneNode } from "./elements.js";
const SVG = "http://www.w3.org/2000/svg";
const XHTML = "http://www.w3.org/1999/xhtml";
const make = (tag, attributes = {}) => {
  const created = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, String(value));
  return created;
};
const turn = (degrees, x, y) => degrees ? `rotate(${degrees} ${x} ${y})` : "";
const font = (style) => `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
const points = (list) => list.map((point) => `${point.x},${point.y}`).join(" ");
function dataUrl(picture) {
  try {
    if (picture instanceof HTMLImageElement && picture.currentSrc.startsWith("data:")) return picture.currentSrc;
    let canvas = picture;
    if (!(picture instanceof HTMLCanvasElement)) {
      const { width, height } = picture instanceof HTMLImageElement ? { width: picture.naturalWidth, height: picture.naturalHeight } : picture;
      canvas = Object.assign(document.createElement("canvas"), { width, height });
      canvas.getContext("2d").drawImage(picture, 0, 0);
    }
    return canvas.toDataURL();
  } catch {
    return null;
  }
}
function write(text, x, y, lines, style) {
  const factor = style.baseline === "middle" ? 0.5 : style.baseline === "bottom" ? 1 : 0;
  const top = style.baseline === "alphabetic" ? y : y - lines.length * style.lineHeight * factor;
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(top));
  if (lines.length === 1) text.textContent = lines[0];
  else for (const [index, line] of lines.entries()) text.append(Object.assign(make("tspan", { x, dy: index ? style.lineHeight : 0 }), { textContent: line }));
  return top;
}
function textStyle(text, style, label2 = false) {
  const css = text.style;
  css.font = font(style);
  css.textAnchor = label2 ? "middle" : style.textAnchor;
  css.dominantBaseline = !label2 && style.baseline === "alphabetic" ? "alphabetic" : "text-before-edge";
  css.fill = style.fill;
  css.stroke = style.stroke;
  css.strokeWidth = `${style.strokeWidth}px`;
  css.strokeDasharray = style.dash;
  css.paintOrder = "stroke";
  css.strokeLinejoin = "round";
}
function marker(shape, style) {
  const made = shape.polygon ? make("polygon", { points: points(shape.polygon) }) : shape.line ? make("polyline", { points: points(shape.line) }) : make("circle", { cx: shape.circle.x, cy: shape.circle.y, r: shape.circle.r });
  const css = made.style;
  css.strokeLinejoin = "round";
  if (shape.filled) {
    css.fill = style.stroke;
    css.stroke = "none";
  } else {
    css.fill = shape.line ? "none" : style.markerFill;
    css.stroke = style.stroke;
    css.strokeWidth = `${style.strokeWidth}px`;
  }
  return made;
}
function label(item) {
  const { style } = item;
  const group = make("g", { transform: `translate(${item.x} ${item.y})${item.rotate ? ` rotate(${item.rotate})` : ""}` });
  if (style.background !== "none") {
    const box = make("rect", { x: -item.width / 2, y: -item.height / 2, width: item.width, height: item.height, rx: style.radius });
    box.style.fill = style.background;
    group.append(box);
  }
  const text = make("text");
  textStyle(text, style, true);
  text.style.fill = style.fill;
  const height = item.lines.length * style.lineHeight;
  write(text, item.shift.x, item.shift.y - height / 2, item.lines, { ...style, baseline: "top" });
  group.append(text);
  return group;
}
function inline(source, copy) {
  const computed = getComputedStyle(source);
  const style = copy.style;
  for (const name of computed) style.setProperty(name, computed.getPropertyValue(name), computed.getPropertyPriority(name));
  const from = source.children;
  const to = copy.children;
  for (let index = 0; index < from.length; index++) if (to[index]) inline(from[index], to[index]);
}
function content(node) {
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  if (!width || !height) return null;
  const { x, y } = node.at;
  const object = make("foreignObject", { x, y, width, height });
  const copy = node.cloneNode(true);
  inline(node, copy);
  for (const name of ["translate", "position", "left", "top", "inset", "scale", "rotate", "transform", "visibility", "pointer-events"]) copy.style.removeProperty(name);
  for (const element of [copy, ...copy.querySelectorAll("*")]) {
    for (const name of element.getAttributeNames()) if (/^data-ww-(port-|key)|^tabindex$|^aria-label$/.test(name)) element.removeAttribute(name);
  }
  copy.style.setProperty("margin", "0");
  copy.style.setProperty("width", `${width}px`);
  copy.style.setProperty("height", `${height}px`);
  copy.style.setProperty("display", "block");
  const wrapper = document.createElementNS(XHTML, "div");
  wrapper.append(copy);
  object.append(wrapper);
  return object;
}
function shapeOf(source, item, drawing, style) {
  const result = [];
  const paint = (shape) => {
    const css = shape.style;
    css.opacity = String(style.opacity);
    css.stroke = style.stroke;
    css.strokeWidth = `${style.strokeWidth}px`;
    css.strokeDasharray = style.dash;
    css.fill = style.fill;
  };
  if (drawing.type === "rect") {
    const shape = make("rect", { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height });
    if (drawing.radius) shape.setAttribute("rx", String(drawing.radius));
    const turned = turn(drawing.rotate, drawing.x + drawing.width / 2, drawing.y + drawing.height / 2);
    if (turned) shape.setAttribute("transform", turned);
    paint(shape);
    result.push(shape);
  } else if (drawing.type === "circle") {
    const shape = make("circle", { cx: drawing.x, cy: drawing.y, r: drawing.r });
    paint(shape);
    result.push(shape);
  } else if (drawing.type === "polygon") {
    const shape = make("polygon", { points: points(drawing.points) });
    const turned = turn(drawing.rotate, drawing.origin.x, drawing.origin.y);
    if (turned) shape.setAttribute("transform", turned);
    paint(shape);
    result.push(shape);
  } else if (drawing.type === "path") {
    const shape = make("path", { d: drawing.d });
    paint(shape);
    shape.style.strokeLinecap = "butt";
    result.push(shape);
    if (drawing.markers.length || drawing.labels.length) {
      const decor = make("g");
      decor.append(...drawing.markers.map((item2) => marker(item2, style)), ...drawing.labels.map(label));
      result.push(decor);
    }
  } else if (drawing.type === "image") {
    const picture = drawing.picture ? dataUrl(drawing.picture) : null;
    const href = picture ?? drawing.href;
    if (href) result.push(make("image", { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height, href, preserveAspectRatio: "none" }));
  } else if (drawing.type === "text") {
    const lines = drawing.text.split("\n");
    const text = make("text");
    textStyle(text, style);
    text.style.opacity = String(style.opacity);
    const top = write(text, drawing.x, drawing.y, lines, style);
    const transform = turn(drawing.rotate, drawing.x, drawing.y);
    if (style.background !== "none") {
      const size = source.measureText(drawing.text, item);
      const [pt, pr, pb, pl] = style.padding.split(" ").map(Number);
      const left = style.textAnchor === "middle" ? drawing.x - size.width / 2 : style.textAnchor === "end" ? drawing.x - size.width : drawing.x;
      const back = make("rect", { x: left - pl, y: top - pt, width: size.width + pl + pr, height: size.height + pt + pb, rx: style.radius });
      back.style.fill = style.background;
      if (transform) back.setAttribute("transform", transform);
      result.push(back);
    }
    if (transform) text.setAttribute("transform", transform);
    result.push(text);
  } else if (drawing.type === "sprites" && drawing.texture) {
    const href = dataUrl(drawing.texture);
    if (href) {
      const { width, height } = drawing.texture;
      const group = make("g");
      for (const sprite of drawing.items) {
        const scale = sprite.scale ?? 1;
        const image = make("image", { x: -width / 2, y: -height / 2, width, height, href, transform: `translate(${sprite.x} ${sprite.y}) rotate(${(sprite.rotation ?? 0) * 180 / Math.PI}) scale(${scale})` });
        if (sprite.alpha !== void 0) image.style.opacity = String(sprite.alpha);
        group.append(image);
      }
      result.push(group);
    }
  }
  return result;
}
function frameOf(drawing, style) {
  const { frame } = drawing;
  if (!frame) return null;
  const group = make("g");
  const rect = make("rect", { x: frame.x, y: frame.y, width: frame.width, height: frame.height, rx: frame.radius });
  rect.style.fill = style.fill;
  rect.style.stroke = style.stroke;
  rect.style.strokeWidth = `${style.strokeWidth}px`;
  rect.style.strokeDasharray = style.dash;
  group.append(rect);
  if (frame.label) {
    const text = make("text");
    text.style.font = font(style);
    text.style.fill = style.color;
    text.style.dominantBaseline = "text-before-edge";
    write(text, frame.label.x, frame.label.y, [frame.label.text], { ...style, baseline: "top" });
    group.append(text);
  }
  return group;
}
function build(source, into, parent, layer, nodes) {
  for (const child of parent.children) {
    if (!(child instanceof SceneItem) || child.hidden) continue;
    if (child instanceof SceneGroup) {
      const drawing = source.drawingOf(child);
      const style = source.styleOf(child);
      if (drawing?.type !== "group" || !style) continue;
      const group = make("g", { transform: `translate(${drawing.x} ${drawing.y}) scale(${drawing.scale})` });
      group.style.opacity = String(style.opacity);
      if (layer === "drawn") {
        const frame = frameOf(drawing, style);
        if (frame) group.append(frame);
      }
      build(source, group, child, layer, nodes);
      if (group.childElementCount) into.append(group);
    } else if (child instanceof SceneNode) {
      if (layer === "nodes" && nodes) {
        const object = content(child);
        if (object) into.append(object);
      }
    } else if (layer === "drawn") {
      const drawing = source.drawingOf(child);
      const style = source.styleOf(child);
      if (!drawing || !style || drawing.type === "grid" || drawing.type === "group") continue;
      into.append(...shapeOf(source, child, drawing, style));
    }
  }
}
function sceneToSVG(source, options = {}) {
  const extent = source.extent();
  if (!extent) return null;
  const padding = options.padding ?? 8;
  const box = { x: extent.x - padding, y: extent.y - padding, width: Math.max(1, extent.width + 2 * padding), height: Math.max(1, extent.height + 2 * padding) };
  const svg = make("svg", { viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`, width: box.width, height: box.height });
  svg.setAttribute("xmlns", SVG);
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  if (options.background) svg.append(make("rect", { ...box, fill: options.background }));
  build(source, svg, source.root, "drawn", options.nodes !== false);
  if (options.nodes !== false) build(source, svg, source.root, "nodes", true);
  return { svg: new XMLSerializer().serializeToString(svg), width: box.width, height: box.height };
}
async function toDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function fontFaces(svg) {
  const rules = [];
  const seen = /* @__PURE__ */ new Set();
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of list) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family").replace(/^["']|["']$/g, "");
      const match = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(rule.style.getPropertyValue("src"));
      if (!family || !match || !svg.includes(family)) continue;
      const address = new URL(match[1], sheet.href ?? document.baseURI).href;
      const key = `${family}|${rule.style.getPropertyValue("font-weight")}|${rule.style.getPropertyValue("font-style")}|${address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const response = await fetch(address);
        if (!response.ok) continue;
        const data = await toDataUrl(await response.blob());
        rules.push(`@font-face{font-family:"${family}";font-weight:${rule.style.getPropertyValue("font-weight") || "normal"};font-style:${rule.style.getPropertyValue("font-style") || "normal"};src:url(${data})}`);
      } catch {
      }
    }
  }
  return rules.join("");
}
const MAX_SIDE = 16384;
const MAX_AREA = 12e7;
async function sceneToImage(source, options = {}) {
  const made = sceneToSVG(source, options);
  if (!made) throw new Error("The scene is empty: there is nothing to make a picture of.");
  const type = options.type ?? "image/png";
  let scale = options.scale ?? 2;
  scale = Math.min(scale, MAX_SIDE / made.width, MAX_SIDE / made.height, Math.sqrt(MAX_AREA / (made.width * made.height)));
  let svg = made.svg;
  if (options.fonts !== false) {
    const css = await fontFaces(svg);
    if (css) svg = svg.replace(/^(<svg[^>]*>)/, `$1<defs><style>${css.replace(/</g, "\\3c ")}</style></defs>`);
  }
  const image = new Image();
  image.decoding = "async";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.max(1, Math.round(made.width * scale)), height: Math.max(1, Math.round(made.height * scale)) });
  const context = canvas.getContext("2d");
  const background = options.background ?? (type === "image/png" ? null : "#fff");
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`The browser cannot make a ${type} picture of this scene (a picture from another origin may have tainted it).`)), type, options.quality));
}
export {
  sceneToImage,
  sceneToSVG
};
