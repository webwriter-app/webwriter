import {zoomOf, type Box, type Point} from "./geometry.js"

/** CSS of the overlay. The widget's own sheet comes later and can restyle the marker and the connector. */
export const overlayStyles = `
[data-ww-drag-overlay] { position: fixed; inset: 0; z-index: 2147483647; width: auto; height: auto; margin: 0; border: 0; padding: 0; overflow: visible; background: none; color: inherit; pointer-events: none; }
[data-ww-drop-marker] { position: absolute; border-radius: 1px; background: var(--ww-drop-marker-color, Highlight); }
[data-ww-drag-overlay] svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
[data-ww-drag-connector] { stroke: var(--ww-drag-connector-color, Highlight); stroke-width: 2; stroke-linecap: round; }
`

const SVG = "http://www.w3.org/2000/svg"

/**
 * What Drag draws over the widget: the drop marker of an index target and the
 * connector of a link. Both live in one element of the shadow root that is
 * shown as a popover. The top layer is positioned against the viewport
 * whatever is around the widget, so a transform, a filter or a containment on
 * an ancestor does not displace them, and no clipping or stacking context
 * hides them. Without the Popover API the element is `position: fixed`,
 * which is displaced by a transformed ancestor.
 *
 * The element exists only while something is drawn. A framework that clears
 * the shadow root removes it; the next call puts it back.
 */
export class Overlay {
  readonly #root: () => ShadowRoot
  /** The rule that places the marker, in the module's style sheet. */
  readonly #place: CSSStyleRule
  #element: HTMLElement | null = null
  #marker: HTMLElement | null = null
  #line: SVGLineElement | null = null

  constructor(root: () => ShadowRoot, sheet: CSSStyleSheet) {
    this.#root = root
    this.#place = sheet.cssRules[sheet.insertRule("[data-ww-drop-marker] {}", sheet.cssRules.length)] as CSSStyleRule
  }

  /** Shows the drop marker in this box, in client coordinates, or removes it. */
  marker(box: Box | null): void {
    if(!box) {
      this.#marker?.remove()
      return this.#tidy()
    }
    const element = this.#mount()
    this.#marker ??= part(element.ownerDocument.createElement("div"), "data-ww-drop-marker", "ww-drop-marker")
    if(this.#marker.parentNode !== element) element.append(this.#marker)
    // Lengths of the overlay are zoomed with the widget, the client coordinates are not.
    const zoom = zoomOf(element)
    for(const side of ["left", "top", "width", "height"] as const) this.#place.style.setProperty(side, `${box[side] / zoom}px`)
  }

  /** Draws the connector between two places on the screen, or removes it. */
  connector(from: Point | null, to?: Point): void {
    if(!from || !to) {
      this.#line?.parentNode?.parentNode?.removeChild(this.#line.parentNode)
      return this.#tidy()
    }
    const element = this.#mount()
    if(!this.#line) {
      this.#line = part(element.ownerDocument.createElementNS(SVG, "line"), "data-ww-drag-connector", "ww-drag-connector")
      element.ownerDocument.createElementNS(SVG, "svg").append(this.#line)
    }
    const svg = this.#line.parentNode!
    if(svg.parentNode !== element) element.append(svg)
    const zoom = zoomOf(element)
    const ends = {x1: from.x, y1: from.y, x2: to.x, y2: to.y}
    for(const [name, value] of Object.entries(ends)) this.#line.setAttribute(name, String(value / zoom))
  }

  /** Removes everything. */
  remove(): void {
    this.#element?.remove()
    this.#element = this.#marker = this.#line = null
  }

  #mount(): HTMLElement {
    const root = this.#root()
    if(!this.#element) {
      this.#element = root.ownerDocument.createElement("div")
      this.#element.setAttribute("data-ww-drag-overlay", "")
      this.#element.setAttribute("aria-hidden", "true")
      this.#element.setAttribute("popover", "manual")
    }
    const element = this.#element
    if(element.parentNode !== root) root.append(element)
    if(typeof element.showPopover === "function" && !element.matches(":popover-open")) element.showPopover()
    return element
  }

  /** Takes the overlay out of the shadow root when nothing is drawn in it. */
  #tidy() {
    if(this.#element && !this.#element.firstChild) this.#element.remove()
  }
}

function part<E extends Element>(element: E, marker: string, name: string): E {
  element.setAttribute(marker, "")
  element.setAttribute("part", name)
  return element
}
