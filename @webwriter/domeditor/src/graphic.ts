export const SVG_NAMESPACE = "http://www.w3.org/2000/svg"

export const graphicShapeOptions = [
  {type: "rectangle", label: "Rectangle", icon: "Rectangle"},
  {type: "ellipse", label: "Ellipse", icon: "Ellipse"},
  {type: "triangle", label: "Triangle", icon: "Triangle"},
  {type: "diamond", label: "Diamond", icon: "Diamond"},
  {type: "hexagon", label: "Hexagon", icon: "Hexagon"},
  {type: "star", label: "Star", icon: "Star"},
  {type: "arrow", label: "Arrow", icon: "Arrow"},
  {type: "polygon", label: "Polygon", icon: "Polygon"},
  {type: "line", label: "Line", icon: "Line"},
  {type: "connector", label: "Connector", icon: "Connector"},
] as const

export type GraphicShapeType = typeof graphicShapeOptions[number]["type"]

export const graphicArrangeOperations = [
  "align-left", "align-center", "align-right",
  "align-top", "align-middle", "align-bottom",
  "distribute-horizontal", "distribute-vertical",
  "bring-forward", "send-backward", "bring-front", "send-back",
] as const

export type GraphicArrangeOperation = typeof graphicArrangeOperations[number]

export const graphicLayerOperations = [
  "select", "toggle-visibility", "toggle-lock",
  "move-up", "move-down", "bring-front", "send-back",
] as const

export type GraphicLayerOperation = typeof graphicLayerOperations[number]

export const graphicViewportOperations = [
  "zoom-in", "zoom-out", "actual-size", "fit-content", "set-zoom",
] as const

export type GraphicViewportOperation = typeof graphicViewportOperations[number]

export type GraphicLayerState = {
  index: number
  label: string
  type: GraphicShapeType
  selected: boolean
  primary: boolean
  visible: boolean
  locked: boolean
}

export type GraphicSelectionState = {
  active: true
  capture: boolean
  selectionCount?: number
  shape?: GraphicShapeType
  parameters?: Record<string, string>
  options?: {
    grid: boolean
    snap: boolean
    guides: boolean
  }
  layers?: GraphicLayerState[]
  viewport?: {
    zoom: number
  }
}

export function isGraphicShapeType(value: unknown): value is GraphicShapeType {
  return typeof value === "string" && graphicShapeOptions.some(option => option.type === value)
}

export function isGraphicArrangeOperation(value: unknown): value is GraphicArrangeOperation {
  return typeof value === "string" && graphicArrangeOperations.includes(value as GraphicArrangeOperation)
}

export function isGraphicLayerOperation(value: unknown): value is GraphicLayerOperation {
  return typeof value === "string" && graphicLayerOperations.includes(value as GraphicLayerOperation)
}

export function isGraphicViewportOperation(value: unknown): value is GraphicViewportOperation {
  return typeof value === "string" && graphicViewportOperations.includes(value as GraphicViewportOperation)
}

export function graphicContainerForNode(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement
  const graphic = element?.closest("svg") ?? null
  return graphic?.namespaceURI === SVG_NAMESPACE ? graphic as SVGSVGElement : null
}

function primitiveGraphicShapeType(element: Element | null): GraphicShapeType | null {
  if(!element || element.namespaceURI !== SVG_NAMESPACE) return null
  if(element.localName === "rect") return "rectangle"
  if(element.localName === "ellipse" || element.localName === "circle") return "ellipse"
  if(element.localName === "line") return "line"
  if(element.localName === "polyline") return "connector"
  if(element.localName !== "polygon") return null
  const coordinateCount = element.getAttribute("points")?.match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)?.length ?? 0
  const pointCount = Math.floor(coordinateCount / 2)
  if(pointCount === 3) return "triangle"
  if(pointCount === 4) return "diamond"
  if(pointCount === 6) return "hexagon"
  if(pointCount === 7) return "arrow"
  if(pointCount === 10) return "star"
  return "polygon"
}

/** Returns the authored geometry represented by a selectable shape. A label
 * group is recognized only when it contains one primitive and optional native
 * SVG text/title children, so unfamiliar SVG groups stay untouched. */
export function graphicShapeGeometry(element: Element | null) {
  const primitive = primitiveGraphicShapeType(element)
  if(primitive) return element as SVGGraphicsElement
  if(!element || element.namespaceURI !== SVG_NAMESPACE || element.localName !== "g") return null
  const children = Array.from(element.children)
  const geometry = children.filter(child => primitiveGraphicShapeType(child)) as SVGGraphicsElement[]
  const allowed = children.every(child => primitiveGraphicShapeType(child) || child.localName === "text" || child.localName === "title")
  return geometry.length === 1 && allowed ? geometry[0] : null
}

export function graphicShapeType(element: Element | null): GraphicShapeType | null {
  return primitiveGraphicShapeType(graphicShapeGeometry(element))
}

export function graphicShapeForNode(node: Node | null) {
  let element = node instanceof Element ? node : node?.parentElement ?? null
  let shape: SVGGraphicsElement | null = null
  while(element && element.localName !== "svg") {
    if(graphicShapeType(element)) shape = element as SVGGraphicsElement
    element = element.parentElement
  }
  return shape
}

/** Finds selectable SVG shape roots without counting labeled primitives twice. */
export function graphicShapeRoots(graphic: SVGSVGElement) {
  const shapes: SVGGraphicsElement[] = []
  const skip = new Set(["defs", "marker", "clipPath", "mask", "pattern", "symbol"])
  const visit = (parent: Element) => Array.from(parent.children).forEach(child => {
    if(skip.has(child.localName)) return
    if(graphicShapeType(child)) {
      shapes.push(child as SVGGraphicsElement)
      return
    }
    if(child.namespaceURI === SVG_NAMESPACE) visit(child)
  })
  visit(graphic)
  return shapes
}
