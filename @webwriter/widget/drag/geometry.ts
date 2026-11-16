// Geometry of Drag: coordinate spaces under zoom and transforms, the index
// among laid-out siblings, and the box of the drop marker.

/** A position or a vector. */
export type Point = {x: number; y: number}

/** A box in client coordinates. */
export type Box = {left: number; top: number; width: number; height: number}

/** The parent of an element in the tree that is rendered: its slot, its parent, or the host of its shadow root. */
export function flatParent(node: Element): Element | null {
  if(node.assignedSlot) return node.assignedSlot
  const parent = node.parentNode
  if(parent instanceof ShadowRoot) return parent.host
  return parent instanceof Element ? parent : null
}

/** `ancestor.contains(node)`, through shadow roots. */
export function composedContains(ancestor: Node, node: Node | null): boolean {
  for(; node; node = node instanceof ShadowRoot ? node.host : node.parentNode) if(node === ancestor) return true
  return false
}

/** The centre of an element's box on the screen. For any affine transform this is where the centre of its own box lands. */
export function centreOf(element: Element): Point {
  const rect = element.getBoundingClientRect()
  return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
}

/** Applies the linear part of a matrix to a vector. */
export function apply(matrix: DOMMatrix, vector: Point): Point {
  return {x: matrix.a * vector.x + matrix.c * vector.y, y: matrix.b * vector.x + matrix.d * vector.y}
}

/** The linear part of an element's own `rotate`, `scale` and `transform`. Rotations about another axis than z are left out. */
function ownTransform(style: CSSStyleDeclaration): DOMMatrix {
  const parts: string[] = []
  if(/^-?[\d.e+-]+[a-z]+$/i.test(style.rotate)) parts.push(`rotate(${style.rotate})`)
  if(style.scale && style.scale !== "none") parts.push(`scale(${style.scale.split(/\s+/).slice(0, 2).join(", ")})`)
  if(style.transform && style.transform !== "none") parts.push(style.transform)
  if(parts.length === 0) return new DOMMatrix()
  const matrix = new DOMMatrix(parts.join(" "))
  matrix.e = matrix.f = 0
  return matrix
}

/**
 * The linear part of the map from an element's own pixels to the screen:
 * the CSS `zoom` and the transforms of the element and of everything around
 * it. With `own: false` the element's own transform is left out, which gives
 * the space its `translate` is measured in.
 */
export function screenMatrix(element: Element, own = true): DOMMatrix {
  let matrix = new DOMMatrix()
  let zoom = 1
  for(let node: Element | null = element; node; node = flatParent(node)) {
    const style = getComputedStyle(node)
    zoom *= Number(style.zoom) || 1
    if(own || node !== element) matrix = ownTransform(style).multiply(matrix)
  }
  return matrix.scaleSelf(zoom)
}

/** The effective CSS `zoom` of an element: its own times that of everything around it. */
export function zoomOf(element: Element): number {
  let zoom = 1
  for(let node: Element | null = element; node; node = flatParent(node)) zoom *= Number(getComputedStyle(node).zoom) || 1
  return zoom
}

/** The size of an element's border box in its own pixels. Exact for an upright box, rounded to whole pixels for a rotated one. */
function ownSize(element: HTMLElement, matrix: DOMMatrix): {width: number; height: number} {
  const upright = Math.abs(matrix.b) < 1e-6 && Math.abs(matrix.c) < 1e-6 && matrix.a !== 0 && matrix.d !== 0
  if(!upright) return {width: element.offsetWidth, height: element.offsetHeight}
  const rect = element.getBoundingClientRect()
  return {width: rect.width / Math.abs(matrix.a), height: rect.height / Math.abs(matrix.d)}
}

const round = (value: number) => Math.round(value * 100) / 100

/** The surface of a point target as one item meets it. Made by `surfaceOf()`. */
export type Surface = {
  /** The point of the item's top-left corner, in the target's own coordinates, when its centre is at this place on the screen. */
  pointFor(centre: Point): Point
  /** The place on the screen of the item's centre when its top-left corner is at this point. */
  centreFor(point: Point): Point
  /** The nearest point on the grid that keeps the item on the surface. An axis named in `keep` is left as it is. */
  fit(point: Point, keep?: "x" | "y"): Point
}

/**
 * The coordinate space of a point target: the one its absolutely positioned
 * children are placed in, with the origin at the top-left corner of its
 * padding box and its scroll position counted in. `extent` is the size of
 * the surface, `grid` the snap step (0 for none).
 *
 * Correct under CSS `zoom`, scaling, rotation and skewing of the target or of
 * anything around it, because only two facts are used: the centre of a box
 * stays its centre under an affine transform, and the linear part of that
 * transform is the product of the zooms and transforms on the way up.
 */
export function surfaceOf(target: HTMLElement, item: HTMLElement, extent: {width: number; height: number}, grid: number): Surface {
  const matrix = screenMatrix(target)
  const inverse = matrix.inverse()
  const size = ownSize(target, matrix)
  const middle = centreOf(target)
  const itemMatrix = screenMatrix(item)
  const itemSize = ownSize(item, itemMatrix)
  // From the item's top-left corner to its centre, in the target's pixels.
  const half = apply(inverse.multiply(itemMatrix), {x: itemSize.width / 2, y: itemSize.height / 2})
  const style = getComputedStyle(target)
  // `clientLeft` is a whole number, but under zoom a border is laid out a fraction of a pixel wide.
  const edge = (client: number, border: string) => client - Math.round(parseFloat(border) || 0) + (parseFloat(border) || 0)
  // The padding box's corner inside the border box, moved by the scroll position.
  const origin = {x: edge(target.clientLeft, style.borderLeftWidth) - target.scrollLeft, y: edge(target.clientTop, style.borderTopWidth) - target.scrollTop}
  // In a right-to-left target the surface extends to the left of the origin.
  const startX = style.direction === "rtl" ? target.clientWidth - extent.width : 0
  const snap = (value: number) => (grid > 0 ? Math.round(value / grid) * grid : value)
  const within = (value: number, start: number, length: number) => {
    const end = start + Math.max(0, length)
    const [low, high] = grid > 0 ? [Math.ceil(start / grid) * grid, Math.floor(end / grid) * grid] : [start, end]
    return round(Math.min(Math.max(snap(value), low), Math.max(low, high)))
  }
  return {
    pointFor(centre) {
      const offset = apply(inverse, {x: centre.x - middle.x, y: centre.y - middle.y})
      return {x: round(size.width / 2 + offset.x - half.x - origin.x), y: round(size.height / 2 + offset.y - half.y - origin.y)}
    },
    centreFor(point) {
      const offset = apply(matrix, {x: point.x + origin.x + half.x - size.width / 2, y: point.y + origin.y + half.y - size.height / 2})
      return {x: middle.x + offset.x, y: middle.y + offset.y}
    },
    fit(point, keep) {
      return {
        x: keep === "x" ? round(point.x) : within(point.x, startX, extent.width - 2 * Math.abs(half.x)),
        y: keep === "y" ? round(point.y) : within(point.y, 0, extent.height - 2 * Math.abs(half.y)),
      }
    },
  }
}

/** What a point target in world coordinates needs of a viewport: the two conversions. `ViewportCore` satisfies it. */
export type World = {
  toWorld(clientX: number, clientY: number): Point
  toClient(worldX: number, worldY: number): Point
}

/**
 * The surface of a point target that is the window of a canvas viewport: its
 * points are world coordinates. The item's top-left corner lands at the world
 * point that lies under the corner of the lifted item on the screen, so the
 * view's pan and zoom are counted in, and the item keeps its own size on the
 * screen while it is lifted. `grid` is the snap step in world units (0 for
 * none). The world has no edge: nothing is clamped.
 */
export function worldSurfaceOf(world: World, item: HTMLElement, grid: number): Surface {
  const matrix = screenMatrix(item)
  const size = ownSize(item, matrix)
  // From the item's top-left corner to its centre, on the screen.
  const half = apply(matrix, {x: size.width / 2, y: size.height / 2})
  const snap = (value: number) => round(grid > 0 ? Math.round(value / grid) * grid : value)
  return {
    pointFor(centre) {
      const point = world.toWorld(centre.x - half.x, centre.y - half.y)
      return {x: round(point.x), y: round(point.y)}
    },
    centreFor(point) {
      const client = world.toClient(point.x, point.y)
      return {x: client.x + half.x, y: client.y + half.y}
    },
    fit(point, keep) {
      return {x: keep === "x" ? round(point.x) : snap(point.x), y: keep === "y" ? round(point.y) : snap(point.y)}
    },
  }
}

/** How an index target lays out its items. */
export type Flow = {
  /** The items follow each other in rows. Otherwise they are stacked. */
  inline: boolean
  /** Later items come first on the screen: right to left in a row, bottom to top in a stack. */
  reverse: boolean
}

/**
 * The flow of an index target, read from the layout of its first two items:
 * side by side or stacked, and in which direction. With fewer items it is
 * read from the target's flex direction and writing direction.
 */
export function flowOf(target: Element, rects: readonly DOMRect[]): Flow {
  if(rects.length > 1) {
    const [first, second] = rects
    const inline = second.top < first.bottom - 1 && second.left !== first.left
    return {inline, reverse: inline ? second.left < first.left : second.top < first.top}
  }
  const style = getComputedStyle(target)
  const flex = style.display.includes("flex") ? style.flexDirection : ""
  const inline = flex.startsWith("row")
  return {inline, reverse: inline ? (style.direction === "rtl") !== flex.endsWith("reverse") : flex === "column-reverse"}
}

/**
 * The index a point resolves to among laid-out items, from their midpoints.
 * Rows that wrap are told apart by where the items start over. `trailing`
 * says that the point is behind the last item of a row that is not the last.
 */
export function indexAt(flow: Flow, rects: readonly DOMRect[], x: number, y: number): {index: number; trailing: boolean} {
  if(!flow.inline) {
    const index = rects.findIndex(rect => y < rect.top + rect.height / 2 !== flow.reverse)
    return {index: index < 0 ? rects.length : index, trailing: false}
  }
  for(let start = 0; start < rects.length; ) {
    let end = start + 1
    while(end < rects.length && !startsRow(flow, rects[end - 1], rects[end])) end++
    const bottom = Math.max(...rects.slice(start, end).map(rect => rect.bottom))
    if(y <= bottom || end === rects.length) {
      for(let index = start; index < end; index++) {
        const middle = rects[index].left + rects[index].width / 2
        if(x < middle !== flow.reverse) return {index, trailing: false}
      }
      return {index: end, trailing: end < rects.length}
    }
    start = end
  }
  return {index: 0, trailing: false}
}

function startsRow(flow: Flow, previous: DOMRect, next: DOMRect): boolean {
  return flow.reverse ? next.right > previous.right + 0.5 : next.left < previous.left - 0.5
}

/** The box of the drop marker for an index: a line in the gap between the two neighbours, across the flow. */
export function markerBox(flow: Flow, rects: readonly DOMRect[], index: number, trailing: boolean, empty: DOMRect, thickness = 2): Box {
  const previous: DOMRect | undefined = rects[index - 1]
  const next: DOMRect | undefined = trailing ? undefined : rects[index]
  const box = next ?? previous ?? empty
  const [start, end] = flow.inline
    ? flow.reverse
      ? (["right", "left"] as const)
      : (["left", "right"] as const)
    : flow.reverse
      ? (["bottom", "top"] as const)
      : (["top", "bottom"] as const)
  const sameLine = previous && next && (!flow.inline || !startsRow(flow, previous, next))
  // Between two neighbours the marker sits in the middle of the gap.
  const at = sameLine ? (previous[end] + next[start]) / 2 : next ? next[start] : previous ? previous[end] : empty[start]
  return flow.inline
    ? {left: at - thickness / 2, top: box.top, width: thickness, height: box.height}
    : {left: box.left, top: at - thickness / 2, width: box.width, height: thickness}
}
