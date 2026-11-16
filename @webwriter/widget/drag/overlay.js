import { zoomOf } from "./geometry.js";
const overlayStyles = `
[data-ww-drag-overlay] { position: fixed; inset: 0; z-index: 2147483647; width: auto; height: auto; margin: 0; border: 0; padding: 0; overflow: visible; background: none; color: inherit; pointer-events: none; }
[data-ww-drop-marker] { position: absolute; border-radius: 1px; background: var(--ww-drop-marker-color, Highlight); }
[data-ww-drag-overlay] svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
[data-ww-drag-connector] { stroke: var(--ww-drag-connector-color, Highlight); stroke-width: 2; stroke-linecap: round; }
`;
const SVG = "http://www.w3.org/2000/svg";
class Overlay {
  #root;
  /** The rule that places the marker, in the module's style sheet. */
  #place;
  #element = null;
  #marker = null;
  #line = null;
  constructor(root, sheet) {
    this.#root = root;
    this.#place = sheet.cssRules[sheet.insertRule("[data-ww-drop-marker] {}", sheet.cssRules.length)];
  }
  /** Shows the drop marker in this box, in client coordinates, or removes it. */
  marker(box) {
    if (!box) {
      this.#marker?.remove();
      return this.#tidy();
    }
    const element = this.#mount();
    this.#marker ??= part(element.ownerDocument.createElement("div"), "data-ww-drop-marker", "ww-drop-marker");
    if (this.#marker.parentNode !== element) element.append(this.#marker);
    const zoom = zoomOf(element);
    for (const side of ["left", "top", "width", "height"]) this.#place.style.setProperty(side, `${box[side] / zoom}px`);
  }
  /** Draws the connector between two places on the screen, or removes it. */
  connector(from, to) {
    if (!from || !to) {
      this.#line?.parentNode?.parentNode?.removeChild(this.#line.parentNode);
      return this.#tidy();
    }
    const element = this.#mount();
    if (!this.#line) {
      this.#line = part(element.ownerDocument.createElementNS(SVG, "line"), "data-ww-drag-connector", "ww-drag-connector");
      element.ownerDocument.createElementNS(SVG, "svg").append(this.#line);
    }
    const svg = this.#line.parentNode;
    if (svg.parentNode !== element) element.append(svg);
    const zoom = zoomOf(element);
    const ends = { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
    for (const [name, value] of Object.entries(ends)) this.#line.setAttribute(name, String(value / zoom));
  }
  /** Removes everything. */
  remove() {
    this.#element?.remove();
    this.#element = this.#marker = this.#line = null;
  }
  #mount() {
    const root = this.#root();
    if (!this.#element) {
      this.#element = root.ownerDocument.createElement("div");
      this.#element.setAttribute("data-ww-drag-overlay", "");
      this.#element.setAttribute("aria-hidden", "true");
      this.#element.setAttribute("popover", "manual");
    }
    const element = this.#element;
    if (element.parentNode !== root) root.append(element);
    if (typeof element.showPopover === "function" && !element.matches(":popover-open")) element.showPopover();
    return element;
  }
  /** Takes the overlay out of the shadow root when nothing is drawn in it. */
  #tidy() {
    if (this.#element && !this.#element.firstChild) this.#element.remove();
  }
}
function part(element, marker, name) {
  element.setAttribute(marker, "");
  element.setAttribute("part", name);
  return element;
}
export {
  Overlay,
  overlayStyles
};
