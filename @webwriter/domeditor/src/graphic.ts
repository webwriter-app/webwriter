import {graphicPresetOptions, isGraphicPresetType, readGraphicPreset} from "./graphic-shapes"
import {graphicShapePresets, type GraphicShapePreset} from "./graphic-shape-presets"

export const graphicShapeDragType = "application/x-webwriter-graphic-shape"

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg"

const basicGraphicShapeOptions = [
  {type: "rectangle", label: "Rectangle", icon: "Rectangle", category: "Rectangles"},
  {type: "ellipse", label: "Ellipse", icon: "Ellipse", category: "Basic shapes"},
  {type: "triangle", label: "Triangle", icon: "Triangle", category: "Basic shapes"},
  {type: "diamond", label: "Diamond", icon: "Diamond", category: "Basic shapes"},
  {type: "hexagon", label: "Hexagon", icon: "Hexagon", category: "Basic shapes"},
  {type: "star", label: "Star", icon: "Star", category: "Stars and banners"},
  {type: "arrow", label: "Arrow", icon: "Arrow", category: "Block arrows"},
  {type: "polygon", label: "Polygon", icon: "Polygon", category: "Basic shapes"},
  {type: "line", label: "Line", icon: "Line", category: "Lines"},
  {type: "image", label: "Image", icon: "Image", category: "Lines"},
  {type: "connector", label: "Connector", icon: "Connector", category: "Lines"},
] as const

export const graphicShapeCategories = ["Lines", "Rectangles", "Basic shapes", "Block arrows", "Equation shapes", "Flowchart", "Stars and banners", "Callouts"]
const lineArrowOptions = [
  {type: "line-start-arrow", label: "Line with start arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 20 30 L 0 50 L 20 70"},
  {type: "line-end-arrow", label: "Line with end arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 80 30 L 100 50 L 80 70"},
  {type: "line-both-arrows", label: "Line with arrows at both ends", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 20 30 L 0 50 L 20 70 M 80 30 L 100 50 L 80 70"},
] as const

export const graphicShapeOptions = [
  ...graphicPresetOptions.filter(option => option.type === "text-box").map(option => ({...option, category: "Lines"})),
  ...basicGraphicShapeOptions.filter(option => option.type === "image"),
  ...basicGraphicShapeOptions.filter(option => option.type === "line"),
  ...basicGraphicShapeOptions.filter(option => option.type !== "line" && option.type !== "image" && option.type !== "polygon"),
  ...graphicPresetOptions.filter(option => option.category !== "Lines"
    && !["text-box", "not-equal", "multidocument", "line-callout-2"].includes(option.type)),
]
  .map(option => ({path: undefined as string | undefined, ...option}))
  .sort((a, b) => graphicShapeCategories.indexOf(a.category) - graphicShapeCategories.indexOf(b.category))

export type GraphicShapeType = typeof basicGraphicShapeOptions[number]["type"] | typeof graphicPresetOptions[number]["type"] | typeof lineArrowOptions[number]["type"] | "freehand" | "polyline" | "bezier"

export type GraphicShapePaint = Partial<Record<"fill" | "stroke" | "stroke-width" | "opacity", string>>

export const defaultGraphicShapePaint: Required<GraphicShapePaint> = {
  fill: "#ffffff", stroke: "#334155", "stroke-width": "4", opacity: "1",
}

/** Open geometry must remain unfilled, including when insertion paint is set. */
export function graphicShapeIsOpen(type: GraphicShapeType) {
  return type === "freehand" || type === "polyline" || type === "bezier" || type === "line" || type === "connector" || type.startsWith("line-") && type.endsWith("arrow")
    || isGraphicPresetType(type) && Boolean((graphicShapePresets[type] as GraphicShapePreset).open)
}

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

export type GraphicMode = "select" | "draw" | "lines" | "curves"

export type GraphicSelectionState = {
  active: true
  capture: boolean
  mode?: GraphicMode
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
  return typeof value === "string" && (["freehand", "polyline", "bezier"].includes(value) || basicGraphicShapeOptions.some(option => option.type === value)
    || lineArrowOptions.some(option => option.type === value) || isGraphicPresetType(value))
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

/** The absolute M/Q/L geometry used for freehand strokes. Inspect authored
 * geometry on every read; no editor metadata or retained point model is needed. */
export function graphicStrokePoints(element: Element) {
  if(element.namespaceURI !== SVG_NAMESPACE || element.localName !== "path" || element.getAttribute("fill") !== "none") return null
  const number = "[-+]?(?:\\d*\\.)?\\d+(?:[eE][-+]?\\d+)?"
  const pair = `${number}[ ,]+${number}`
  const path = element.getAttribute("d") ?? ""
  if(!new RegExp(`^M\\s*${pair}(?:\\s*Q\\s*${pair}[ ,]+${pair})*\\s*L\\s*${pair}\\s*$`).test(path)) return null
  const values = path.match(new RegExp(number, "g"))!.map(Number)
  if(!values.every(Number.isFinite) || !path.includes("Q") && (values[0] !== values[2] || values[1] !== values[3])) return null
  return Array.from({length: values.length / 2}, (_, index) => ({x: values[index * 2], y: values[index * 2 + 1]}))
}

/** Editable absolute line/cubic paths. Unsupported SVG commands stay untouched. */
export function graphicPathGeometry(element: Element) {
  if(element.namespaceURI !== SVG_NAMESPACE || element.localName !== "path") return null
  const number = "[-+]?(?:\\d*\\.)?\\d+(?:[eE][-+]?\\d+)?"
  const pair = `${number}[ ,]+${number}`
  const path = element.getAttribute("d") ?? ""
  const cubic = new RegExp(`^M\\s*${pair}(?:\\s*C\\s*${pair}[ ,]+${pair}[ ,]+${pair})+\\s*Z?\\s*$`).test(path)
  if(!cubic && !new RegExp(`^M\\s*${pair}(?:\\s*L\\s*${pair})+\\s*Z?\\s*$`).test(path)) return null
  const values = path.match(new RegExp(number, "g"))!.map(Number)
  if(!values.every(Number.isFinite)) return null
  return {
    kind: cubic ? "curves" as const : "lines" as const,
    closed: /Z\s*$/.test(path),
    points: Array.from({length: values.length / 2}, (_, index) => ({x: values[index * 2], y: values[index * 2 + 1]})),
  }
}

function primitiveGraphicShapeType(element: Element | null): GraphicShapeType | null {
  if(!element || element.namespaceURI !== SVG_NAMESPACE) return null
  if(element.localName === "path") {
    const preset = readGraphicPreset(element)
    if(preset) return preset.type
    if(graphicStrokePoints(element)) return "freehand"
    const path = graphicPathGeometry(element)
    return path ? path.kind === "curves" ? "bezier" : "polyline" : null
  }
  if(element.localName === "rect") return "rectangle"
  if(element.localName === "ellipse" || element.localName === "circle") return "ellipse"
  if(element.localName === "line") return "line"
  if(element.localName === "image") return "image"
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

/** An unclipped, single-shape viewport is edited as one document element.
 * Inspect the live children so added content and unfamiliar groups stay canvases. */
export function standaloneGraphicShape(graphic: Element | null) {
  if(graphic?.namespaceURI !== SVG_NAMESPACE || graphic.localName !== "svg"
    || graphic.getAttribute("overflow") !== "visible") return null
  const content = Array.from(graphic.children).filter(child => !["defs", "title", "desc", "metadata"].includes(child.localName))
  return content.length === 1 && graphicShapeType(content[0]) ? content[0] as SVGGraphicsElement : null
}
