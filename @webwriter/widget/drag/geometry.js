function flatParent(node) {
  if (node.assignedSlot) return node.assignedSlot;
  const parent = node.parentNode;
  if (parent instanceof ShadowRoot) return parent.host;
  return parent instanceof Element ? parent : null;
}
function composedContains(ancestor, node) {
  for (; node; node = node instanceof ShadowRoot ? node.host : node.parentNode) if (node === ancestor) return true;
  return false;
}
function centreOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
function apply(matrix, vector) {
  return { x: matrix.a * vector.x + matrix.c * vector.y, y: matrix.b * vector.x + matrix.d * vector.y };
}
function ownTransform(style) {
  const parts = [];
  if (/^-?[\d.e+-]+[a-z]+$/i.test(style.rotate)) parts.push(`rotate(${style.rotate})`);
  if (style.scale && style.scale !== "none") parts.push(`scale(${style.scale.split(/\s+/).slice(0, 2).join(", ")})`);
  if (style.transform && style.transform !== "none") parts.push(style.transform);
  if (parts.length === 0) return new DOMMatrix();
  const matrix = new DOMMatrix(parts.join(" "));
  matrix.e = matrix.f = 0;
  return matrix;
}
function screenMatrix(element, own = true) {
  let matrix = new DOMMatrix();
  let zoom = 1;
  for (let node = element; node; node = flatParent(node)) {
    const style = getComputedStyle(node);
    zoom *= Number(style.zoom) || 1;
    if (own || node !== element) matrix = ownTransform(style).multiply(matrix);
  }
  return matrix.scaleSelf(zoom);
}
function zoomOf(element) {
  let zoom = 1;
  for (let node = element; node; node = flatParent(node)) zoom *= Number(getComputedStyle(node).zoom) || 1;
  return zoom;
}
function ownSize(element, matrix) {
  const upright = Math.abs(matrix.b) < 1e-6 && Math.abs(matrix.c) < 1e-6 && matrix.a !== 0 && matrix.d !== 0;
  if (!upright) return { width: element.offsetWidth, height: element.offsetHeight };
  const rect = element.getBoundingClientRect();
  return { width: rect.width / Math.abs(matrix.a), height: rect.height / Math.abs(matrix.d) };
}
const round = (value) => Math.round(value * 100) / 100;
function surfaceOf(target, item, extent, grid) {
  const matrix = screenMatrix(target);
  const inverse = matrix.inverse();
  const size = ownSize(target, matrix);
  const middle = centreOf(target);
  const itemMatrix = screenMatrix(item);
  const itemSize = ownSize(item, itemMatrix);
  const half = apply(inverse.multiply(itemMatrix), { x: itemSize.width / 2, y: itemSize.height / 2 });
  const style = getComputedStyle(target);
  const edge = (client, border) => client - Math.round(parseFloat(border) || 0) + (parseFloat(border) || 0);
  const origin = { x: edge(target.clientLeft, style.borderLeftWidth) - target.scrollLeft, y: edge(target.clientTop, style.borderTopWidth) - target.scrollTop };
  const startX = style.direction === "rtl" ? target.clientWidth - extent.width : 0;
  const snap = (value) => grid > 0 ? Math.round(value / grid) * grid : value;
  const within = (value, start, length) => {
    const end = start + Math.max(0, length);
    const [low, high] = grid > 0 ? [Math.ceil(start / grid) * grid, Math.floor(end / grid) * grid] : [start, end];
    return round(Math.min(Math.max(snap(value), low), Math.max(low, high)));
  };
  return {
    pointFor(centre) {
      const offset = apply(inverse, { x: centre.x - middle.x, y: centre.y - middle.y });
      return { x: round(size.width / 2 + offset.x - half.x - origin.x), y: round(size.height / 2 + offset.y - half.y - origin.y) };
    },
    centreFor(point) {
      const offset = apply(matrix, { x: point.x + origin.x + half.x - size.width / 2, y: point.y + origin.y + half.y - size.height / 2 });
      return { x: middle.x + offset.x, y: middle.y + offset.y };
    },
    fit(point, keep) {
      return {
        x: keep === "x" ? round(point.x) : within(point.x, startX, extent.width - 2 * Math.abs(half.x)),
        y: keep === "y" ? round(point.y) : within(point.y, 0, extent.height - 2 * Math.abs(half.y))
      };
    }
  };
}
function worldSurfaceOf(world, item, grid) {
  const matrix = screenMatrix(item);
  const size = ownSize(item, matrix);
  const half = apply(matrix, { x: size.width / 2, y: size.height / 2 });
  const snap = (value) => round(grid > 0 ? Math.round(value / grid) * grid : value);
  return {
    pointFor(centre) {
      const point = world.toWorld(centre.x - half.x, centre.y - half.y);
      return { x: round(point.x), y: round(point.y) };
    },
    centreFor(point) {
      const client = world.toClient(point.x, point.y);
      return { x: client.x + half.x, y: client.y + half.y };
    },
    fit(point, keep) {
      return { x: keep === "x" ? round(point.x) : snap(point.x), y: keep === "y" ? round(point.y) : snap(point.y) };
    }
  };
}
function flowOf(target, rects) {
  if (rects.length > 1) {
    const [first, second] = rects;
    const inline2 = second.top < first.bottom - 1 && second.left !== first.left;
    return { inline: inline2, reverse: inline2 ? second.left < first.left : second.top < first.top };
  }
  const style = getComputedStyle(target);
  const flex = style.display.includes("flex") ? style.flexDirection : "";
  const inline = flex.startsWith("row");
  return { inline, reverse: inline ? style.direction === "rtl" !== flex.endsWith("reverse") : flex === "column-reverse" };
}
function indexAt(flow, rects, x, y) {
  if (!flow.inline) {
    const index = rects.findIndex((rect) => y < rect.top + rect.height / 2 !== flow.reverse);
    return { index: index < 0 ? rects.length : index, trailing: false };
  }
  for (let start = 0; start < rects.length; ) {
    let end = start + 1;
    while (end < rects.length && !startsRow(flow, rects[end - 1], rects[end])) end++;
    const bottom = Math.max(...rects.slice(start, end).map((rect) => rect.bottom));
    if (y <= bottom || end === rects.length) {
      for (let index = start; index < end; index++) {
        const middle = rects[index].left + rects[index].width / 2;
        if (x < middle !== flow.reverse) return { index, trailing: false };
      }
      return { index: end, trailing: end < rects.length };
    }
    start = end;
  }
  return { index: 0, trailing: false };
}
function startsRow(flow, previous, next) {
  return flow.reverse ? next.right > previous.right + 0.5 : next.left < previous.left - 0.5;
}
function markerBox(flow, rects, index, trailing, empty, thickness = 2) {
  const previous = rects[index - 1];
  const next = trailing ? void 0 : rects[index];
  const box = next ?? previous ?? empty;
  const [start, end] = flow.inline ? flow.reverse ? ["right", "left"] : ["left", "right"] : flow.reverse ? ["bottom", "top"] : ["top", "bottom"];
  const sameLine = previous && next && (!flow.inline || !startsRow(flow, previous, next));
  const at = sameLine ? (previous[end] + next[start]) / 2 : next ? next[start] : previous ? previous[end] : empty[start];
  return flow.inline ? { left: at - thickness / 2, top: box.top, width: thickness, height: box.height } : { left: box.left, top: at - thickness / 2, width: box.width, height: thickness };
}
export {
  apply,
  centreOf,
  composedContains,
  flatParent,
  flowOf,
  indexAt,
  markerBox,
  screenMatrix,
  surfaceOf,
  worldSurfaceOf,
  zoomOf
};
