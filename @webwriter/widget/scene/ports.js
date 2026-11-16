const SIDES = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };
const NEAREST = [SIDES.left, SIDES.right, SIDES.top, SIDES.bottom];
function portElements(node, entered) {
  const found = [];
  const walk = (parent) => {
    for (const child of parent.children) {
      if (child instanceof HTMLElement && child.hasAttribute("data-ww-port")) found.push(child);
      if (child.shadowRoot) {
        entered?.(child.shadowRoot);
        walk(child.shadowRoot);
      }
      if (child.firstElementChild) walk(child);
    }
  };
  walk(node);
  return found;
}
function measurePorts(node, entered) {
  const box = node.getBoundingClientRect();
  const byName = /* @__PURE__ */ new Map();
  if (box.width === 0 && box.height === 0) return { rendered: false, width: 0, height: 0, list: [], byName };
  const [width, height] = [node.offsetWidth, node.offsetHeight];
  const k = box.width / width || 1;
  const list = [];
  for (const element of portElements(node, entered)) {
    const rect = element.getBoundingClientRect();
    const at = { x: (rect.left + rect.width / 2 - box.left) / k, y: (rect.top + rect.height / 2 - box.top) / k };
    const declared = SIDES[element.dataset.wwSide];
    const distances = [at.x, width - at.x, at.y, height - at.y];
    const port = { name: element.dataset.wwPort, element, at, side: declared ?? NEAREST[distances.indexOf(Math.min(...distances))] };
    list.push(port);
    if (!byName.has(port.name)) byName.set(port.name, port);
  }
  if (!byName.has("")) byName.set("", { name: "", element: null, at: { x: width / 2, y: height / 2 }, side: { x: 0, y: 0 } });
  return { rendered: true, width, height, list, byName };
}
export {
  measurePorts,
  portElements
};
