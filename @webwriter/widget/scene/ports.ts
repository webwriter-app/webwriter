// Finding and measuring the ports of a node. A port is any element marked
// `data-ww-port` in the node's content, also inside nested components with an
// open shadow root.
import type {Point} from "./geometry.js"

/** One measured port. */
export type Port = {
  /** `data-ww-port`. Empty for the node's centre, which a path without a port name attaches to. */
  name: string
  /** The marked element. Null for the node's centre. */
  element: HTMLElement | null
  /** The port's centre, relative to the node's top-left corner, in the node's own pixels. */
  at: Point
  /** The direction a path leaves in: a unit vector, or zero for the centre. */
  side: Point
}

/** The ports of one node, with the size the node had when they were measured. Empty while the node is not rendered. */
export type Ports = {readonly rendered: boolean; readonly width: number; readonly height: number; readonly list: readonly Port[]; readonly byName: ReadonlyMap<string, Port>}

const SIDES = {left: {x: -1, y: 0}, right: {x: 1, y: 0}, top: {x: 0, y: -1}, bottom: {x: 0, y: 1}} as const
const NEAREST = [SIDES.left, SIDES.right, SIDES.top, SIDES.bottom]

/**
 * The elements marked `data-ww-port` below `node`, in tree order. Open shadow
 * roots of nested components are searched too, and each one is reported to
 * `entered`, so that the caller can watch it for changes.
 */
export function portElements(node: Element, entered?: (root: ShadowRoot) => void): HTMLElement[] {
  const found: HTMLElement[] = []
  const walk = (parent: Element | ShadowRoot) => {
    for(const child of parent.children) {
      if(child instanceof HTMLElement && child.hasAttribute("data-ww-port")) found.push(child)
      if(child.shadowRoot) {
        entered?.(child.shadowRoot)
        walk(child.shadowRoot)
      }
      if(child.firstElementChild) walk(child)
    }
  }
  // The node's own shadow root belongs to the module and holds no ports.
  walk(node)
  return found
}

/**
 * Measures where the ports of a node sit inside its box. The result does not
 * depend on where the node is or how the scene is zoomed, so it stays valid
 * until the node resizes or its content changes.
 *
 * A port faces the nearest edge of its node, unless it says otherwise with
 * `data-ww-side="left | right | top | bottom"`.
 */
export function measurePorts(node: HTMLElement, entered?: (root: ShadowRoot) => void): Ports {
  const box = node.getBoundingClientRect()
  const byName = new Map<string, Port>()
  if(box.width === 0 && box.height === 0) return {rendered: false, width: 0, height: 0, list: [], byName}
  const [width, height] = [node.offsetWidth, node.offsetHeight]
  const k = box.width / width || 1
  const list: Port[] = []
  for(const element of portElements(node, entered)) {
    const rect = element.getBoundingClientRect()
    const at = {x: (rect.left + rect.width / 2 - box.left) / k, y: (rect.top + rect.height / 2 - box.top) / k}
    const declared = SIDES[element.dataset.wwSide as keyof typeof SIDES]
    const distances = [at.x, width - at.x, at.y, height - at.y]
    const port: Port = {name: element.dataset.wwPort!, element, at, side: declared ?? NEAREST[distances.indexOf(Math.min(...distances))]}
    list.push(port)
    // The first port of a name answers for it.
    if(!byName.has(port.name)) byName.set(port.name, port)
  }
  if(!byName.has("")) byName.set("", {name: "", element: null, at: {x: width / 2, y: height / 2}, side: {x: 0, y: 0}})
  return {rendered: true, width, height, list, byName}
}
