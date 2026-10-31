import {graphicPresetOptions, graphicPresetFillRule, isGraphicPresetType, readGraphicPreset} from "./graphic-shapes"
import {graphicShapePresets, type GraphicShapePreset} from "./graphic-shape-presets"

export const graphicShapeDragType = "application/x-webwriter-graphic-shape"

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg"

type Point = {x: number, y: number}
type Bounds = {x: number, y: number, width: number, height: number}

export const boundsForPoints = (points: Array<{x: number, y: number}>): Bounds => {
  if(!points.length) return {x: 0, y: 0, width: 0, height: 0}
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y}
}

export const regularPolygonPoints = (bounds: Bounds, count: number, startAngle = -90) => Array.from({length: count}, (_, index) => {
  const angle = (startAngle + index * 360 / count) * Math.PI / 180
  return {
    x: bounds.x + bounds.width / 2 + Math.cos(angle) * bounds.width / 2,
    y: bounds.y + bounds.height / 2 + Math.sin(angle) * bounds.height / 2,
  }
})

export const starPoints = (bounds: Bounds, innerRadius = 0.45) => {
  const raw = Array.from({length: 10}, (_, index) => {
    const radius = index % 2 ? innerRadius : 1
    const angle = (-90 + index * 36) * Math.PI / 180
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })
  const source = boundsForPoints(raw)
  return raw.map(point => ({
    x: bounds.x + (point.x - source.x) / source.width * bounds.width,
    y: bounds.y + (point.y - source.y) / source.height * bounds.height,
  }))
}

export const hexagonPoints = (bounds: Bounds, inset = bounds.width * 0.25) => {
  const safeInset = Math.min(bounds.width / 2, Math.max(0, inset))
  return [
    {x: bounds.x + safeInset, y: bounds.y},
    {x: bounds.x + bounds.width - safeInset, y: bounds.y},
    {x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2},
    {x: bounds.x + bounds.width - safeInset, y: bounds.y + bounds.height},
    {x: bounds.x + safeInset, y: bounds.y + bounds.height},
    {x: bounds.x, y: bounds.y + bounds.height / 2},
  ]
}

export const arrowPoints = (bounds: Bounds, headRatio = 0.36, tailRatio = 0.42) => {
  const headStart = bounds.x + bounds.width * (1 - Math.min(0.8, Math.max(0.15, headRatio)))
  const tailHalf = bounds.height * Math.min(0.9, Math.max(0.1, tailRatio)) / 2
  const centerY = bounds.y + bounds.height / 2
  return [
    {x: bounds.x, y: centerY - tailHalf},
    {x: headStart, y: centerY - tailHalf},
    {x: headStart, y: bounds.y},
    {x: bounds.x + bounds.width, y: centerY},
    {x: headStart, y: bounds.y + bounds.height},
    {x: headStart, y: centerY + tailHalf},
    {x: bounds.x, y: centerY + tailHalf},
  ]
}

// Preview paths use the same points and default proportions as insertion.
const previewBounds = {x: 0, y: 0, width: 100, height: 100}
const polygonPreview = (points: Point[]) => `M ${points.map(point => `${point.x} ${point.y}`).join(" L ")} Z`
const basicGraphicShapePaths = {
  rectangle: "M 5 0 L 95 0 A 5 5 0 0 1 100 5 L 100 95 A 5 5 0 0 1 95 100 L 5 100 A 5 5 0 0 1 0 95 L 0 5 A 5 5 0 0 1 5 0 Z",
  ellipse: "M 0 50 A 50 50 0 1 1 100 50 A 50 50 0 1 1 0 50 Z",
  triangle: polygonPreview(regularPolygonPoints(previewBounds, 3)),
  diamond: polygonPreview(regularPolygonPoints(previewBounds, 4)),
  hexagon: polygonPreview(hexagonPoints(previewBounds)),
  star: polygonPreview(starPoints(previewBounds)),
  arrow: polygonPreview(arrowPoints(previewBounds)),
  polygon: polygonPreview(regularPolygonPoints(previewBounds, 5)),
  line: "M 0 50 L 100 50",
  connector: "M 0 21.875 L 50 21.875 L 50 78.125 L 100 78.125",
  image: "M 0 12.5 L 100 12.5 L 100 87.5 L 0 87.5 Z M 0 72.5 L 30 46.25 L 60 72.5 L 80 57.5 L 100 72.5 M 82 31.25 A 10 7.5 0 1 1 62 31.25 A 10 7.5 0 1 1 82 31.25 Z",
}

const basicGraphicShapeOptions = [
  {type: "rectangle", label: "Rectangle", icon: "Rectangle", category: "Rectangles"},
  {type: "ellipse", label: "Ellipse", icon: "Ellipse", category: "Basic shapes"},
  {type: "triangle", label: "Triangle", icon: "Triangle", category: "Basic shapes"},
  {type: "diamond", label: "Diamond", icon: "Diamond", category: "Basic shapes"},
  {type: "hexagon", label: "Hexagon", icon: "Hexagon", category: "Basic shapes"},
  {type: "star", label: "5-point star", icon: "Star", category: "Stars and banners"},
  {type: "arrow", label: "Arrow", icon: "Arrow", category: "Block arrows"},
  {type: "polygon", label: "Polygon", icon: "Polygon", category: "Basic shapes"},
  {type: "line", label: "Line", icon: "Line", category: "Lines"},
  {type: "image", label: "Image", icon: "Image", category: "Lines"},
  {type: "connector", label: "Connector", icon: "Connector", category: "Lines"},
] as const

export const graphicShapeCategories = ["Lines", "Triangles", "Rectangles", "Basic shapes", "Block arrows", "Equation shapes", "Flowchart", "Stars and banners", "Callouts"]
const lineArrowOptions = [
  {type: "line-start-arrow", label: "Narrow left arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 0 50 L 18 41 L 18 59 Z", pathFill: "currentColor"},
  {type: "line-end-arrow", label: "Narrow right arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 100 50 L 82 41 L 82 59 Z", pathFill: "currentColor"},
  {type: "line-both-arrows", label: "Narrow left-right arrow", icon: "Shape", category: "Lines", path: "M 0 50 L 100 50 M 0 50 L 18 41 L 18 59 Z M 100 50 L 82 41 L 82 59 Z", pathFill: "currentColor"},
] as const

const basicShapeOrder: Record<string, number> = {
  parallelogram: 0, trapezoid: 1, diamond: 2, pentagon: 3, hexagon: 4,
  heptagon: 5, octagon: 6, decagon: 7, dodecagon: 8, ellipse: 9,
}

export const graphicShapeOptions = [
  ...graphicPresetOptions.filter(option => option.type === "text-box").map(option => ({...option, category: "Lines"})),
  ...basicGraphicShapeOptions.filter(option => option.type === "image"),
  ...basicGraphicShapeOptions.filter(option => option.type === "line"),
  ...basicGraphicShapeOptions.filter(option => option.type !== "line" && option.type !== "image" && option.type !== "polygon" && option.type !== "rectangle"),
  ...lineArrowOptions,
  ...graphicPresetOptions.filter(option => option.category !== "Lines"
    && !["text-box", "right-triangle", "arc", "not-equal", "multidocument", "line-callout-2", "parentheses", "braces", "curved-ribbon-up", "curved-ribbon-down"].includes(option.type)),
]
  .map(option => ({...option,
    category: option.type === "triangle" || option.type === "right-triangle" ? "Triangles" : option.category,
    path: "path" in option ? option.path : basicGraphicShapePaths[option.type],
    pathFill: "pathFill" in option ? option.pathFill : undefined,
    fillRule: isGraphicPresetType(option.type) ? graphicPresetFillRule(option.type) : "nonzero",
  }))
  .sort((a, b) => graphicShapeCategories.indexOf(a.category) - graphicShapeCategories.indexOf(b.category)
    || (a.category === "Basic shapes" ? (basicShapeOrder[a.type] ?? 14) - (basicShapeOrder[b.type] ?? 14) : 0))

// The keyboard and ribbon gallery share section ordering and intentional row breaks.
const starPointCount = (type: string) => type === "star" ? 5 : Number(type.slice(5))
const basicShapeRows = [
  graphicShapeOptions.filter(option => option.category === "Lines"),
  graphicShapeOptions.filter(option => option.category === "Rectangles" || ["parallelogram", "trapezoid"].includes(option.type))
    .sort((a, b) => Number(b.type === "square-rectangle") - Number(a.type === "square-rectangle")),
  graphicShapeOptions.filter(option => option.category === "Triangles" || [
    "diamond", "pentagon", "hexagon", "heptagon", "octagon", "decagon", "dodecagon", "ellipse", "pie", "chord",
  ].includes(option.type)),
  graphicShapeOptions.filter(option => /^star(?:-|$)/.test(option.type))
    .sort((a, b) => starPointCount(a.type) - starPointCount(b.type)),
]
const basicShapes = new Set(basicShapeRows.flat().map(option => option.type))

const arrowRowTypes = [
  ["arrow", "left-arrow", "up-arrow", "down-arrow", "left-right-arrow", "up-down-arrow", "quad-arrow", "left-right-up-arrow", "left-up-arrow", "bent-up-arrow"],
  ["bent-arrow", "u-turn-arrow", "curved-left-arrow", "curved-right-arrow", "curved-up-arrow", "curved-down-arrow", "circular-arrow"],
]
const groupedArrows = new Set(arrowRowTypes.flat())
const arrowShapeRows = [
  ...arrowRowTypes.map(types => graphicShapeOptions.filter(option => types.includes(option.type))),
  graphicShapeOptions.filter(option => option.category === "Block arrows" && !groupedArrows.has(option.type)),
]

const bracketShapeTypes = new Set(["left-bracket", "right-bracket", "left-brace", "right-brace"])
const explosionShapeTypes = new Set(["seal-1", "seal-2"])
const advancedShapes = graphicShapeOptions.filter(option => !basicShapes.has(option.type)
  && option.category !== "Block arrows" && option.category !== "Flowchart")
const advancedShapeRows = [
  advancedShapes.filter(option => option.category === "Basic shapes" && !bracketShapeTypes.has(option.type)
    || explosionShapeTypes.has(option.type)),
  [
    ...advancedShapes.filter(option => option.category === "Equation shapes"),
    ...advancedShapes.filter(option => bracketShapeTypes.has(option.type)),
  ],
  advancedShapes.filter(option => option.category !== "Basic shapes" && option.category !== "Equation shapes"
    && !explosionShapeTypes.has(option.type)),
].flatMap(options => Array.from({length: Math.ceil(options.length / 11)}, (_, index) => options.slice(index * 11, (index + 1) * 11)))

export const graphicShapeSections = [
  {label: "Basic" as const, rows: basicShapeRows},
  ...(["Advanced", "Arrows", "Flowchart"] as const).map(label => {
    if(label === "Arrows") return {label, rows: arrowShapeRows}
    if(label === "Advanced") return {label, rows: advancedShapeRows}
    const options = graphicShapeOptions.filter(option => option.category === "Flowchart")
    return {label, rows: Array.from({length: Math.ceil(options.length / 11)}, (_, index) => options.slice(index * 11, (index + 1) * 11))}
  }),
]

export type GraphicShapeType = typeof basicGraphicShapeOptions[number]["type"] | typeof graphicPresetOptions[number]["type"] | typeof lineArrowOptions[number]["type"] | "freehand" | "polyline" | "bezier"

export type GraphicShapePaint = Partial<Record<"fill" | "stroke" | "stroke-width" | "opacity", string>>

export function readGraphicShapeDrag(data: DataTransfer): {shape: GraphicShapeType, paint?: GraphicShapePaint} | null {
  try {
    const detail = JSON.parse(data.getData(graphicShapeDragType))
    return detail && isGraphicShapeType(detail.shape) ? {shape: detail.shape, paint: detail.paint} : null
  }
  catch { return null }
}

export const defaultGraphicShapePaint: Required<GraphicShapePaint> = {
  fill: "#ffffff", stroke: "#334155", "stroke-width": "4", opacity: "1",
}

/** Open geometry must remain unfilled, including when insertion paint is set. */
export function graphicShapeIsOpen(type: GraphicShapeType) {
  return type === "freehand" || type === "polyline" || type === "bezier" || type === "line" || type === "connector" || lineArrowOptions.some(option => option.type === type)
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
  alternativeText?: string
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
