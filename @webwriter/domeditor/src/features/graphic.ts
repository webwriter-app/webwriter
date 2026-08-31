import {EditorFeature, type DocumentListenerMap} from "."
import {$, modifierKeyDown} from "../utility"
import {
  SVG_NAMESPACE,
  graphicContainerForNode,
  graphicShapeForNode,
  graphicShapeGeometry,
  graphicShapeOptions,
  graphicShapeRoots,
  graphicShapeType,
  isGraphicArrangeOperation,
  isGraphicLayerOperation,
  isGraphicShapeType,
  isGraphicViewportOperation,
  type GraphicArrangeOperation,
  type GraphicLayerOperation,
  type GraphicSelectionState,
  type GraphicShapeType,
  type GraphicViewportOperation,
} from "../graphic"

type Point = {x: number, y: number}
type Bounds = {x: number, y: number, width: number, height: number}
type Matrix = {a: number, b: number, c: number, d: number, e: number, f: number}
type GraphicOption = "grid" | "snap" | "guides"
type ConnectorRouting = "straight" | "orthogonal"
type PortDirection = "n" | "e" | "s" | "w"
type ConnectorEndpoint = "start" | "end"
type SnapKind = "object" | "canvas" | "grid"
type SnapTarget = {value: number, kind: SnapKind}
type SnapCandidates = {x: SnapTarget[], y: SnapTarget[]}
type ActiveGuides = {x?: SnapTarget, y?: SnapTarget}
type PointerSnapshot = {
  client: Point
  point: Point
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

type InteractionItem = {
  source: SVGGraphicsElement
  bounds: Bounds
  visualBounds: Bounds
  points: Point[]
  rotation: number
  signature: string
  preview?: SVGGraphicsElement
}

type Interaction = {
  kind: "move" | "resize" | "rotate" | "roundness" | "radius-x" | "radius-y" | "vertex" | "line-start" | "line-end" | "connector-start" | "connector-end"
  handle: string
  start: Point
  startClient: Point
  latest: PointerSnapshot
  bounds: Bounds
  points: Point[]
  rotation: number
  pointerId: number
  captureTarget: Element | null
  active: boolean
  matrix: Matrix
  candidates: SnapCandidates
  items: InteractionItem[]
  frameBounds?: Bounds
  frameRotation?: number
  previewRoot?: SVGSVGElement
  vertex?: number
  attachedConnectors: AttachedConnector[]
  portTarget?: PortTarget | null
}

type ConnectorBinding = {
  shape: SVGGraphicsElement
  endpoint: ConnectorEndpoint
  port: PortDirection
}

type AttachedConnector = {
  source: SVGPolylineElement
  signature: string
  points: Point[]
  routing: ConnectorRouting
  orientation: "horizontal" | "vertical"
  bindings: ConnectorBinding[]
  preview?: SVGPolylineElement
}

type PortTarget = {
  shape: SVGGraphicsElement
  port: PortDirection
  point: Point
  client: Point
}

type ConnectorDrawInteraction = {
  graphic: SVGSVGElement
  sourceShape: SVGGraphicsElement
  sourceSignature: string
  sourcePort: PortDirection
  start: Point
  startClient: Point
  latest: PointerSnapshot
  pointerId: number
  captureTarget: Element | null
  active: boolean
  matrix: Matrix
  routing: ConnectorRouting
  previewRoot?: SVGSVGElement
  preview?: SVGPolylineElement
  portTarget?: PortTarget | null
}

type MarqueeInteraction = {
  graphic: SVGSVGElement
  start: Point
  latest: Point
  startClient: Point
  pointerId: number
  captureTarget: Element | null
  additive: boolean
  active: boolean
  baseSelection: SVGGraphicsElement[]
}

type LabelEditor = {
  element: HTMLTextAreaElement
  shape: SVGGraphicsElement
  initial: string
}

type GraphicViewport = {
  scale: number
  x: number
  y: number
}

type PanInteraction = {
  graphic: SVGSVGElement
  startClient: Point
  startViewport: GraphicViewport
  baseMatrix: Matrix
  pointerId: number
  captureTarget: Element | null
}

const numberPattern = "[-+]?(?:\\d*\\.)?\\d+(?:[eE][-+]?\\d+)?"
const rotatePattern = new RegExp(`rotate\\(\\s*(${numberPattern})(?:[ ,]+(${numberPattern})[ ,]+(${numberPattern}))?\\s*\\)`, "i")

const cleanNumber = (value: number) => {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? "0" : String(rounded)
}

const polygonShapeTypes = new Set<GraphicShapeType>(["triangle", "diamond", "hexagon", "star", "arrow", "polygon"])
const naturalGraphicShapeSize: Record<GraphicShapeType, {width: number, height: number}> = {
  rectangle: {width: 240, height: 240},
  ellipse: {width: 240, height: 240},
  triangle: {width: 240, height: 240},
  diamond: {width: 240, height: 240},
  hexagon: {width: 240, height: 240},
  star: {width: 240, height: 240},
  arrow: {width: 240, height: 240},
  polygon: {width: 240, height: 240},
  line: {width: 320, height: 0},
  connector: {width: 320, height: 180},
}
const isPolygonShape = (shape: Element | null) => {
  const type = graphicShapeType(shape)
  return Boolean(type && polygonShapeTypes.has(type))
}

const shapeGeometry = (shape: Element) => graphicShapeGeometry(shape) ?? shape as SVGGraphicsElement

const graphicViewBox = (graphic: SVGSVGElement) => {
  const values = (graphic.getAttribute("viewBox") ?? "0 0 1600 900").match(new RegExp(numberPattern, "g"))?.map(Number) ?? []
  const [x = 0, y = 0, width = 1600, height = 900] = values
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width: Number.isFinite(width) && width > 0 ? width : 1600,
    height: Number.isFinite(height) && height > 0 ? height : 900,
  }
}

const applyMatrix = (matrix: Matrix, point: Point): Point => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
})

const applyInverseMatrix = (matrix: Matrix, point: Point): Point => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if(Math.abs(determinant) <= 0.000001) return {...point}
  return {
    x: (matrix.d * (point.x - matrix.e) - matrix.c * (point.y - matrix.f)) / determinant,
    y: (-matrix.b * (point.x - matrix.e) + matrix.a * (point.y - matrix.f)) / determinant,
  }
}

const applyInverseLinearMatrix = (matrix: Matrix, point: Point): Point => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if(Math.abs(determinant) <= 0.000001) return {...point}
  return {
    x: (matrix.d * point.x - matrix.c * point.y) / determinant,
    y: (-matrix.b * point.x + matrix.a * point.y) / determinant,
  }
}

const rotateAround = (point: Point, center: Point, angle: number): Point => {
  if(!angle) return point
  const radians = angle * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = point.x - center.x
  const y = point.y - center.y
  return {
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  }
}

const midpoint = (a: Point, b: Point): Point => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2})

const attributeNumber = (element: Element, name: string, fallback = 0) => {
  const value = Number.parseFloat(element.getAttribute(name) ?? "")
  return Number.isFinite(value) ? value : fallback
}

const parsePoints = (element: Element) => {
  const values = element.getAttribute("points")?.match(new RegExp(numberPattern, "g"))?.map(Number) ?? []
  const points: Array<{x: number, y: number}> = []
  for(let index = 0; index + 1 < values.length; index += 2) {
    if(Number.isFinite(values[index]) && Number.isFinite(values[index + 1])) {
      points.push({x: values[index], y: values[index + 1]})
    }
  }
  return points
}

const setPoints = (element: Element, points: Array<{x: number, y: number}>) => {
  element.setAttribute("points", points.map(point => `${cleanNumber(point.x)},${cleanNumber(point.y)}`).join(" "))
}

const regularPolygonPoints = (bounds: Bounds, count: number, startAngle = -90) => Array.from({length: count}, (_, index) => {
  const angle = (startAngle + index * 360 / count) * Math.PI / 180
  return {
    x: bounds.x + bounds.width / 2 + Math.cos(angle) * bounds.width / 2,
    y: bounds.y + bounds.height / 2 + Math.sin(angle) * bounds.height / 2,
  }
})

const starPoints = (bounds: Bounds, innerRadius = 0.45) => {
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

const hexagonPoints = (bounds: Bounds, inset = bounds.width * 0.25) => {
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

const arrowPoints = (bounds: Bounds, headRatio = 0.36, tailRatio = 0.42) => {
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

const boundsForPoints = (points: Array<{x: number, y: number}>): Bounds => {
  if(!points.length) return {x: 0, y: 0, width: 0, height: 0}
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y}
}

const starInnerRadius = (points: Point[]) => {
  if(points.length !== 10) return 45
  const center = points.reduce((sum, point) => ({x: sum.x + point.x, y: sum.y + point.y}), {x: 0, y: 0})
  center.x /= points.length
  center.y /= points.length
  const rx = Math.abs((points[2].x - center.x) / Math.cos(-18 * Math.PI / 180))
  const ry = Math.abs(points[0].y - center.y)
  if(!rx || !ry) return 45
  return Math.hypot((points[1].x - center.x) / rx, (points[1].y - center.y) / ry) * 100
}

const shapeBounds = (shape: Element): Bounds => {
  const geometry = shapeGeometry(shape)
  switch(graphicShapeType(shape)) {
    case "rectangle": return {
      x: attributeNumber(geometry, "x"),
      y: attributeNumber(geometry, "y"),
      width: Math.max(0, attributeNumber(geometry, "width")),
      height: Math.max(0, attributeNumber(geometry, "height")),
    }
    case "ellipse": {
      const circle = geometry.localName === "circle"
      const cx = attributeNumber(geometry, "cx")
      const cy = attributeNumber(geometry, "cy")
      const rx = Math.max(0, attributeNumber(geometry, circle ? "r" : "rx"))
      const ry = Math.max(0, attributeNumber(geometry, circle ? "r" : "ry", rx))
      return {x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2}
    }
    case "line": return boundsForPoints([
      {x: attributeNumber(geometry, "x1"), y: attributeNumber(geometry, "y1")},
      {x: attributeNumber(geometry, "x2"), y: attributeNumber(geometry, "y2")},
    ])
    case "connector": return boundsForPoints(parsePoints(geometry))
    case "triangle":
    case "diamond":
    case "hexagon":
    case "star":
    case "arrow":
    case "polygon": return boundsForPoints(parsePoints(geometry))
    default: return {x: 0, y: 0, width: 0, height: 0}
  }
}

const rotationOf = (shape: Element) => {
  const rotation = Number.parseFloat(shape.getAttribute("transform")?.match(rotatePattern)?.[1] ?? "0")
  return Number.isFinite(rotation) ? rotation : 0
}

const shapeCenter = (shape: Element) => {
  const bounds = shapeBounds(shape)
  return {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
}

const unionBounds = (bounds: Bounds[]) => {
  if(!bounds.length) return {x: 0, y: 0, width: 0, height: 0}
  const x = Math.min(...bounds.map(current => current.x))
  const y = Math.min(...bounds.map(current => current.y))
  const right = Math.max(...bounds.map(current => current.x + current.width))
  const bottom = Math.max(...bounds.map(current => current.y + current.height))
  return {x, y, width: right - x, height: bottom - y}
}

const rotatedBounds = (bounds: Bounds, rotation: number) => {
  if(!rotation) return {...bounds}
  const center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
  return boundsForPoints([
    {x: bounds.x, y: bounds.y},
    {x: bounds.x + bounds.width, y: bounds.y},
    {x: bounds.x + bounds.width, y: bounds.y + bounds.height},
    {x: bounds.x, y: bounds.y + bounds.height},
  ].map(point => rotateAround(point, center, rotation)))
}

const visualBounds = (shape: Element) => rotatedBounds(shapeBounds(shape), rotationOf(shape))

const shapePoints = (shape: Element) => isPolygonShape(shape) || graphicShapeType(shape) === "connector" ? parsePoints(shapeGeometry(shape))
  : graphicShapeType(shape) === "line" ? [
    {x: attributeNumber(shapeGeometry(shape), "x1"), y: attributeNumber(shapeGeometry(shape), "y1")},
    {x: attributeNumber(shapeGeometry(shape), "x2"), y: attributeNumber(shapeGeometry(shape), "y2")},
  ] : []

const shapePorts = (shape: Element): Record<PortDirection, Point> => {
  const bounds = shapeBounds(shape)
  const center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
  const rotation = rotationOf(shape)
  return {
    n: rotateAround({x: center.x, y: bounds.y}, center, rotation),
    e: rotateAround({x: bounds.x + bounds.width, y: center.y}, center, rotation),
    s: rotateAround({x: center.x, y: bounds.y + bounds.height}, center, rotation),
    w: rotateAround({x: bounds.x, y: center.y}, center, rotation),
  }
}

const connectorRouting = (connector: Element): ConnectorRouting => parsePoints(connector).length > 2 ? "orthogonal" : "straight"

const connectorOrientation = (points: Point[]) => {
  if(points.length > 2) {
    const start = points[0]
    const next = points[1]
    return Math.abs(next.y - start.y) <= Math.abs(next.x - start.x) ? "horizontal" as const : "vertical" as const
  }
  const start = points[0] ?? {x: 0, y: 0}
  const end = points.at(-1) ?? start
  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "horizontal" as const : "vertical" as const
}

const connectorPoints = (start: Point, end: Point, routing: ConnectorRouting, orientation = connectorOrientation([start, end])) => {
  if(routing === "straight") return [start, end]
  if(orientation === "horizontal") {
    const x = (start.x + end.x) / 2
    return [start, {x, y: start.y}, {x, y: end.y}, end]
  }
  const y = (start.y + end.y) / 2
  return [start, {x: start.x, y}, {x: end.x, y}, end]
}

const setConnectorEndpoints = (
  connector: Element,
  start: Point,
  end: Point,
  routing = connectorRouting(connector),
  orientation = connectorOrientation(parsePoints(connector)),
) => setPoints(connector, connectorPoints(start, end, routing, orientation))

const intersects = (left: Bounds, right: Bounds) => left.x <= right.x + right.width
  && left.x + left.width >= right.x
  && left.y <= right.y + right.height
  && left.y + left.height >= right.y

const shapeText = (shape: Element) => shape.localName === "g"
  ? Array.from(shape.children).find(child => child.localName === "text") as SVGTextElement | undefined ?? null
  : null

const shapeLabel = (shape: Element) => {
  const text = shapeText(shape)
  if(!text) return ""
  const lines = Array.from(text.children).filter(child => child.localName === "tspan")
  return lines.length ? lines.map(line => line.textContent ?? "").join("\n") : text.textContent ?? ""
}

const syncShapeText = (shape: Element) => {
  const text = shapeText(shape)
  if(!text) return
  const center = shapeCenter(shape)
  text.setAttribute("x", cleanNumber(center.x))
  text.setAttribute("y", cleanNumber(center.y))
  const lines = Array.from(text.children).filter(child => child.localName === "tspan") as SVGTSpanElement[]
  lines.forEach((line, index) => {
    line.setAttribute("x", cleanNumber(center.x))
    line.setAttribute("dy", index === 0 ? `${cleanNumber(-(lines.length - 1) * 0.6)}em` : "1.2em")
  })
}

const setRotation = (shape: Element, angle: number) => {
  const transform = shape.getAttribute("transform") ?? ""
  const center = shapeCenter(shape)
  const rotation = `rotate(${cleanNumber(angle)} ${cleanNumber(center.x)} ${cleanNumber(center.y)})`
  const next = rotatePattern.test(transform)
    ? transform.replace(rotatePattern, rotation)
    : `${transform} ${rotation}`.trim()
  if(Math.abs(angle) < 0.005) {
    const withoutRotation = next.replace(rotatePattern, "").replace(/\s+/g, " ").trim()
    withoutRotation ? shape.setAttribute("transform", withoutRotation) : shape.removeAttribute("transform")
  }
  else shape.setAttribute("transform", next)
}

const setShapeBounds = (shape: Element, next: Bounds, initial: Bounds, initialPoints: Array<{x: number, y: number}>) => {
  const geometry = shapeGeometry(shape)
  const minimum = graphicShapeType(shape) === "rectangle" || graphicShapeType(shape) === "ellipse" ? 1 : 0
  const safe = {
    x: next.x,
    y: next.y,
    width: Math.max(minimum, next.width),
    height: Math.max(minimum, next.height),
  }
  const scalePoint = (point: {x: number, y: number}) => ({
    x: safe.x + (initial.width ? (point.x - initial.x) / initial.width * safe.width : point.x - initial.x),
    y: safe.y + (initial.height ? (point.y - initial.y) / initial.height * safe.height : point.y - initial.y),
  })
  switch(graphicShapeType(shape)) {
    case "rectangle":
      geometry.setAttribute("x", cleanNumber(safe.x))
      geometry.setAttribute("y", cleanNumber(safe.y))
      geometry.setAttribute("width", cleanNumber(safe.width))
      geometry.setAttribute("height", cleanNumber(safe.height))
      break
    case "ellipse":
      geometry.setAttribute("cx", cleanNumber(safe.x + safe.width / 2))
      geometry.setAttribute("cy", cleanNumber(safe.y + safe.height / 2))
      if(geometry.localName === "circle") {
        const radius = Math.max(0.5, Math.min(safe.width, safe.height) / 2)
        geometry.setAttribute("r", cleanNumber(radius))
      }
      else {
        geometry.setAttribute("rx", cleanNumber(safe.width / 2))
        geometry.setAttribute("ry", cleanNumber(safe.height / 2))
      }
      break
    case "line": {
      const points = initialPoints.map(scalePoint)
      geometry.setAttribute("x1", cleanNumber(points[0]?.x ?? safe.x))
      geometry.setAttribute("y1", cleanNumber(points[0]?.y ?? safe.y))
      geometry.setAttribute("x2", cleanNumber(points[1]?.x ?? safe.x + safe.width))
      geometry.setAttribute("y2", cleanNumber(points[1]?.y ?? safe.y + safe.height))
      break
    }
    case "connector":
    case "triangle":
    case "diamond":
    case "hexagon":
    case "star":
    case "arrow":
    case "polygon": setPoints(geometry, initialPoints.map(scalePoint)); break
  }
  syncShapeText(shape)
}

/** Native SVG insertion and direct manipulation. Authored geometry stays in
 * SVG attributes; every handle and control is placed in the shadow appendix. */
export class GraphicFeature extends EditorFeature {
  protected handlesCapturedElementInteractions = true
  #selectedShapes = new Set<SVGGraphicsElement>()
  #primaryShape: SVGGraphicsElement | null = null
  #interaction: Interaction | null = null
  #connector: ConnectorDrawInteraction | null = null
  #marquee: MarqueeInteraction | null = null
  #pan: PanInteraction | null = null
  #labelEditor: LabelEditor | null = null
  #overlay: HTMLElement | null = null
  #refreshQueued = false
  #frame: number | null = null
  #presentedGraphic: SVGSVGElement | null = null
  #spaceDown = false
  #lockedShapes = new Set<SVGGraphicsElement>()
  #viewportState = new WeakMap<SVGSVGElement, GraphicViewport>()
  #navigatedGraphics = new Set<SVGSVGElement>()
  #options: Record<GraphicOption, boolean> = {grid: true, snap: true, guides: true}

  enable() {
    if(this.isEnabled) return
    super.enable()
    window.addEventListener("resize", this.#scheduleRefresh)
    window.addEventListener("blur", this.#handleWindowBlur)
    document.addEventListener("scroll", this.#scheduleRefresh, true)
  }

  disable() {
    if(!this.isEnabled) return
    window.removeEventListener("resize", this.#scheduleRefresh)
    window.removeEventListener("blur", this.#handleWindowBlur)
    document.removeEventListener("scroll", this.#scheduleRefresh, true)
    this.#cancelInteraction()
    this.#cancelConnector()
    this.#cancelMarquee()
    this.#cancelPan()
    this.#closeLabelEditor(false, false)
    this.#clearCanvasPresentation()
    this.#clearShapeSelection()
    this.#clearLocks()
    this.#resetViewports()
    this.#overlay?.remove()
    this.#overlay = null
    this.#interaction = null
    this.#connector = null
    super.disable()
  }

  actions = {
    insertGraphic: ({shape}: {type: "insertGraphic", shape?: GraphicShapeType}) => {
      if(shape !== undefined && !isGraphicShapeType(shape)) throw new TypeError(`Unsupported graphic shape '${String(shape)}'`)
      const graphic = this.#createGraphic()
      if(shape) {
        const element = this.#createShape(shape, 0, graphic)
        graphic.append(element)
        this.#fitStandaloneGraphic(graphic, element)
      }
      this.editor.features.manipulation.insert(graphic)
      if(graphic.isConnected) {
        this.editor.features.selection.captureElement(graphic)
        this.#refresh()
        this.editor.postSelectionPath(true)
      }
    },
    addGraphicShape: ({shape}: {type: "addGraphicShape", shape: GraphicShapeType}) => {
      if(!isGraphicShapeType(shape)) throw new TypeError(`Unsupported graphic shape '${String(shape)}'`)
      const graphic = this.#capturedGraphic()
      if(!graphic) return
      const element = this.#createShape(shape, graphicShapeRoots(graphic).length, graphic)
      graphic.append(element)
      this.#selectShape(element)
      this.#refresh()
      this.editor.postSelectionPath()
    },
    setGraphicParameter: ({name, value}: {type: "setGraphicParameter", name: string, value: string}) => {
      const shapes = this.selectedShapes
      if(!shapes.length || typeof value !== "string") return
      const sharedParameter = name === "fill" || name === "stroke" || name === "stroke-width" || name === "opacity"
      if(shapes.length > 1 && !sharedParameter) return
      const attached = this.#captureAttachedConnectors(this.#capturedGraphic(), shapes)
      const replacements = new Map<Element, Element>()
      this.editor.doc.stopCapturing()
      const nextShapes = shapes.map(shape => {
        const next = this.#setParameter(shape, name, value)
        if(next !== shape) replacements.set(shape, next)
        return next
      })
      this.#applyAttachedConnectors(attached, replacements)
      if(replacements.size) {
        const primary = this.selectedShape
        this.#setShapeSelection(nextShapes, primary ? replacements.get(primary) as SVGGraphicsElement ?? primary : null)
      }
      this.editor.doc.stopCapturing()
      this.#refresh()
      this.editor.postSelectionPath()
    },
    toggleGraphicOption: ({name}: {type: "toggleGraphicOption", name: GraphicOption}) => {
      if(name !== "grid" && name !== "snap" && name !== "guides") return
      this.#options[name] = !this.#options[name]
      this.#syncCanvasPresentation()
      if(!this.#options.guides) this.#setGuides({})
      this.editor.postSelectionPath()
    },
    arrangeGraphicShapes: ({operation}: {type: "arrangeGraphicShapes", operation: GraphicArrangeOperation}) => {
      if(!isGraphicArrangeOperation(operation)) return
      this.#arrange(operation)
    },
    manageGraphicLayer: ({operation, index}: {
      type: "manageGraphicLayer"
      operation: GraphicLayerOperation
      index: number
    }) => {
      if(!isGraphicLayerOperation(operation) || !Number.isInteger(index) || index < 0) return
      this.#manageLayer(operation, index)
    },
    navigateGraphic: ({operation, zoom}: {
      type: "navigateGraphic"
      operation: GraphicViewportOperation
      zoom?: number
    }) => {
      if(!isGraphicViewportOperation(operation)) return
      if(operation === "set-zoom" && (typeof zoom !== "number" || !Number.isFinite(zoom))) return
      this.#navigate(operation, zoom)
    },
  } as const

  get selectedShapes() {
    const graphic = this.#capturedGraphic()
    return Array.from(this.#selectedShapes).filter(shape => shape.isConnected && graphic?.contains(shape))
  }

  get selectedShape() {
    return this.#primaryShape && this.selectedShapes.includes(this.#primaryShape) ? this.#primaryShape : null
  }

  getState(): GraphicSelectionState | undefined {
    const capture = this.#capturedGraphic()
    const selected = $.selectedElement
    const graphic = capture ?? (selected?.localName === "svg" && selected.namespaceURI === SVG_NAMESPACE
      ? selected as SVGSVGElement
      : null)
    if(!graphic) return
    const shapes = this.selectedShapes
    const shape = shapes.length === 1 ? shapes[0] : null
    const parameterShape = shape ?? this.selectedShape ?? shapes.at(-1) ?? null
    const type = graphicShapeType(shape)
    this.#pruneLocks()
    const roots = graphicShapeRoots(graphic)
    const layers = roots.flatMap((root, index) => {
      const layerType = graphicShapeType(root)
      if(!layerType) return []
      const fallback = graphicShapeOptions.find(option => option.type === layerType)?.label ?? "Shape"
      return [{
        index,
        label: shapeLabel(root).trim() || `${fallback} ${index + 1}`,
        type: layerType,
        selected: this.#selectedShapes.has(root),
        primary: this.#primaryShape === root,
        visible: root.getAttribute("visibility") !== "hidden",
        locked: this.#isLocked(root),
      }]
    })
    const viewport = this.#viewport(graphic)
    const viewportChanged = Math.abs(viewport.scale - 1) > 0.0001 || viewport.x !== 0 || viewport.y !== 0
    return {
      active: true,
      capture: Boolean(capture),
      selectionCount: shapes.length,
      options: {...this.#options},
      ...(layers.length ? {layers} : {}),
      ...(viewportChanged ? {viewport: {zoom: Math.round(viewport.scale * 100)}} : {}),
      ...(parameterShape ? {parameters: this.#parameters(parameterShape)} : {}),
      ...(shape && type ? {shape: type} : {}),
    }
  }

  /** Repositions direct-manipulation chrome after another editor feature has
   * reconciled authored or collaborative DOM changes. */
  refresh() {
    this.#refresh()
  }

  activeListeners: DocumentListenerMap = {
    pointerdown: event => this.#handlePointerDown(event),
    dblclick: event => this.#handleDoubleClick(event),
    pointermove: event => this.#handlePointerMove(event),
    pointerup: event => this.#finishPointer(event),
    pointercancel: event => this.#cancelPointer(event),
    wheel: event => this.#handleWheel(event),
    beforeinput: event => this.#blockCapturedEditingEvent(event),
    compositionstart: event => this.#blockCapturedEditingEvent(event),
    paste: event => this.#blockCapturedEditingEvent(event),
    keydown: event => {
      const graphic = this.#capturedGraphic()
      if(!graphic) return
      if(this.#handleSpaceDown(event)) return
      if(event.key === "Escape" && this.#labelEditor) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.#closeLabelEditor(false)
        return
      }
      if(event.key === "Escape" && (this.#interaction || this.#connector || this.#marquee || this.#pan)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const stateChanged = Boolean(this.#marquee || this.#pan)
        this.#cancelPointer()
        if(stateChanged) this.editor.postSelectionPath()
        return
      }
      const shapes = this.selectedShapes
      if(event.key === "Escape" && shapes.length) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.#clearShapeSelection()
        this.#refresh()
        this.editor.postSelectionPath()
        return
      }
      if(event.key.toLowerCase() === "a" && modifierKeyDown(event)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const selectable = graphicShapeRoots(graphic).filter(shape => !this.#isLocked(shape))
        this.#setShapeSelection(selectable, selectable.at(-1) ?? null)
        this.#refresh()
        this.editor.postSelectionPath()
        return
      }
      if(event.key === "Enter" && !event.altKey && !event.shiftKey && !modifierKeyDown(event) && shapes.length === 1) {
        const shape = shapes[0]
        const type = graphicShapeType(shape)
        if(type && type !== "line" && type !== "connector" && !this.#isLocked(shape)) {
          event.preventDefault()
          event.stopImmediatePropagation()
          this.#openLabelEditor(shape)
          return
        }
      }
      if(event.key === "Delete" || event.key === "Backspace") {
        this.#claimKeyboardEvent(event)
        if(shapes.length) {
          const attached = this.#captureAttachedConnectors(graphic, shapes)
          const connectors = new Set(attached.map(item => item.source))
          this.editor.doc.stopCapturing()
          connectors.forEach(connector => connector.remove())
          shapes.forEach(shape => shape.remove())
          this.editor.doc.stopCapturing()
          this.#clearShapeSelection()
          this.editor.postSelectionPath()
        }
        return
      }
      const step = event.shiftKey ? 50 : 1
      const movement = event.key === "ArrowLeft" ? {x: -step, y: 0}
        : event.key === "ArrowRight" ? {x: step, y: 0}
          : event.key === "ArrowUp" ? {x: 0, y: -step}
            : event.key === "ArrowDown" ? {x: 0, y: step}
              : null
      if(movement) {
        this.#claimKeyboardEvent(event)
        if(shapes.length) {
          const attached = this.#captureAttachedConnectors(graphic, shapes)
          this.editor.doc.stopCapturing()
          shapes.forEach(shape => this.#moveShape(shape, movement.x, movement.y))
          this.#applyAttachedConnectors(attached)
          this.editor.doc.stopCapturing()
          this.#refresh()
          this.editor.postSelectionPath()
        }
        return
      }
      const isAltGraph = event.getModifierState("AltGraph")
      const isPrintable = event.key.length === 1 && !event.metaKey && (!event.ctrlKey || isAltGraph)
      if(event.key === "Enter" || isPrintable) this.#claimKeyboardEvent(event)
    },
    keyup: event => this.#handleSpaceUp(event),
  }

  #blockCapturedEditingEvent(event: Event) {
    if(!this.#capturedGraphic()) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  #claimKeyboardEvent(event: KeyboardEvent) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  passiveListeners: DocumentListenerMap = {
    selectionchange: () => {
      if(!this.#capturedGraphic()) this.#clearShapeSelection()
      this.#syncCanvasPresentation()
      this.#scheduleRefresh()
    },
  }

  #handleSpaceDown(event: KeyboardEvent) {
    if((event.key !== " " && event.code !== "Space") || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false
    const editable = event.composedPath().some(target => target instanceof HTMLElement
      && (target.isContentEditable || target.matches("input, textarea, select, button")))
    if(editable || !this.#capturedGraphic()) return false
    event.preventDefault()
    event.stopImmediatePropagation()
    this.#spaceDown = true
    document.body.classList.add("◆", "◆graphic-pan-ready")
    return true
  }

  #handleSpaceUp(event: KeyboardEvent) {
    if((event.key !== " " && event.code !== "Space") || !this.#spaceDown) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.#spaceDown = false
    this.#removeMarkerClass(document.body, "◆graphic-pan-ready")
  }

  #handleWindowBlur = () => {
    this.#spaceDown = false
    this.#removeMarkerClass(document.body, "◆graphic-pan-ready")
    this.#cancelPan()
  }

  #handleWheel(event: WheelEvent) {
    if(!event.ctrlKey && !event.metaKey || !(event.target instanceof Node)) return
    const graphic = graphicContainerForNode(event.target)
    if(!graphic || graphic !== this.#capturedGraphic()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const page = graphic.getBoundingClientRect().height || 800
    const delta = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? page
        : 1)
    const current = this.#viewport(graphic)
    this.#zoomAt(graphic, current.scale * Math.exp(-delta * 0.0015), {x: event.clientX, y: event.clientY})
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #capturedGraphic() {
    const captured = this.editor.features.selection.captureSelectedElement
    return captured?.localName === "svg" && captured.namespaceURI === SVG_NAMESPACE
      ? captured as SVGSVGElement
      : null
  }

  #createGraphic() {
    const graphic = document.createElementNS(SVG_NAMESPACE, "svg")
    graphic.setAttribute("viewBox", "0 0 1600 900")
    graphic.setAttribute("width", "100%")
    return graphic
  }

  #createShape(type: GraphicShapeType, index = 0, graphic?: SVGSVGElement) {
    const bounds = this.#shapeInsertionBounds(type, index, graphic)
    let shape: SVGGraphicsElement
    if(type === "rectangle") {
      shape = document.createElementNS(SVG_NAMESPACE, "rect")
      shape.setAttribute("x", cleanNumber(bounds.x))
      shape.setAttribute("y", cleanNumber(bounds.y))
      shape.setAttribute("width", cleanNumber(bounds.width))
      shape.setAttribute("height", cleanNumber(bounds.height))
      shape.setAttribute("rx", cleanNumber(bounds.width / naturalGraphicShapeSize.rectangle.width * 12))
      shape.setAttribute("ry", cleanNumber(bounds.height / naturalGraphicShapeSize.rectangle.height * 12))
    }
    else if(type === "ellipse") {
      shape = document.createElementNS(SVG_NAMESPACE, "ellipse")
      shape.setAttribute("cx", cleanNumber(bounds.x + bounds.width / 2))
      shape.setAttribute("cy", cleanNumber(bounds.y + bounds.height / 2))
      shape.setAttribute("rx", cleanNumber(bounds.width / 2))
      shape.setAttribute("ry", cleanNumber(bounds.height / 2))
    }
    else if(type === "line") {
      shape = document.createElementNS(SVG_NAMESPACE, "line")
      shape.setAttribute("x1", cleanNumber(bounds.x))
      shape.setAttribute("y1", cleanNumber(bounds.y))
      shape.setAttribute("x2", cleanNumber(bounds.x + bounds.width))
      shape.setAttribute("y2", cleanNumber(bounds.y))
      shape.setAttribute("fill", "none")
      shape.setAttribute("stroke-linecap", "round")
    }
    else if(type === "connector") {
      shape = document.createElementNS(SVG_NAMESPACE, "polyline")
      setPoints(shape, connectorPoints(
        {x: bounds.x, y: bounds.y},
        {x: bounds.x + bounds.width, y: bounds.y + bounds.height},
        "orthogonal",
        "horizontal",
      ))
      shape.setAttribute("fill", "none")
      shape.setAttribute("stroke-linecap", "round")
      shape.setAttribute("stroke-linejoin", "round")
    }
    else {
      shape = document.createElementNS(SVG_NAMESPACE, "polygon")
      const points = type === "triangle" ? regularPolygonPoints(bounds, 3)
        : type === "diamond" ? regularPolygonPoints(bounds, 4)
          : type === "hexagon" ? hexagonPoints(bounds)
            : type === "star" ? starPoints(bounds)
              : type === "arrow" ? arrowPoints(bounds)
                : regularPolygonPoints(bounds, 5)
      setPoints(shape, points)
    }
    if(type !== "line" && type !== "connector") shape.setAttribute("fill", "#ffffff")
    shape.setAttribute("stroke", "#334155")
    shape.setAttribute("stroke-width", type === "line" || type === "connector" ? "6" : "4")
    shape.setAttribute("vector-effect", "non-scaling-stroke")
    return shape
  }

  /** Converts a stable screen-space insertion size into authored SVG units.
   * The natural form is only reduced when the rendered graphic cannot fit it. */
  #shapeInsertionBounds(type: GraphicShapeType, index: number, graphic?: SVGSVGElement): Bounds {
    const viewBox = graphic ? graphicViewBox(graphic) : {x: 0, y: 0, width: 1600, height: 900}
    const matrix = graphic?.isConnected ? this.#baseScreenMatrix(graphic) : {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}
    const xScale = Math.max(0.0001, Math.hypot(matrix.a, matrix.b))
    const yScale = Math.max(0.0001, Math.hypot(matrix.c, matrix.d))
    const natural = naturalGraphicShapeSize[type]
    const screenWidth = viewBox.width * xScale
    const screenHeight = viewBox.height * yScale
    const margin = Math.min(32, screenWidth * 0.1, screenHeight * 0.1)
    const fit = Math.min(
      1,
      natural.width ? Math.max(1, screenWidth - margin * 2) / natural.width : 1,
      natural.height ? Math.max(1, screenHeight - margin * 2) / natural.height : 1,
    )
    const width = natural.width * fit / xScale
    const height = natural.height * fit / yScale
    const marginX = margin / xScale
    const marginY = margin / yScale
    const offset = index ? (index % 6) * 36 * fit : 0
    const preferredX = viewBox.x + viewBox.width / 2 + offset / xScale
    const preferredY = viewBox.y + viewBox.height / 2 + offset / yScale
    const minimumX = viewBox.x + marginX + width / 2
    const maximumX = viewBox.x + viewBox.width - marginX - width / 2
    const minimumY = viewBox.y + marginY + height / 2
    const maximumY = viewBox.y + viewBox.height - marginY - height / 2
    const centerX = minimumX <= maximumX ? Math.min(maximumX, Math.max(minimumX, preferredX)) : viewBox.x + viewBox.width / 2
    const centerY = minimumY <= maximumY ? Math.min(maximumY, Math.max(minimumY, preferredY)) : viewBox.y + viewBox.height / 2
    return {x: centerX - width / 2, y: centerY - height / 2, width, height}
  }

  #fitStandaloneGraphic(graphic: SVGSVGElement, shape: SVGGraphicsElement) {
    const bounds = shapeBounds(shape)
    const padding = Math.max(32, attributeNumber(shapeGeometry(shape), "stroke-width") * 3)
    const width = Math.max(1, bounds.width)
    const height = Math.max(1, bounds.height)
    graphic.setAttribute("viewBox", [
      cleanNumber(bounds.x - padding),
      cleanNumber(bounds.y - padding),
      cleanNumber(width + padding * 2),
      cleanNumber(height + padding * 2),
    ].join(" "))
    graphic.setAttribute("width", "320")
  }

  #handleDoubleClick(event: MouseEvent) {
    if(event.button !== 0 || !(event.target instanceof Node)) return
    const graphic = graphicContainerForNode(event.target)
    const shape = graphicShapeForNode(event.target)
    const type = graphicShapeType(shape)
    if(!graphic || !shape || this.#isLocked(shape) || !type || type === "line" || type === "connector") return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(this.#capturedGraphic() !== graphic) this.editor.features.selection.captureElement(graphic)
    this.#selectShape(shape)
    this.#openLabelEditor(shape)
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #openLabelEditor(shape: SVGGraphicsElement) {
    if(this.#labelEditor?.shape === shape) {
      this.#labelEditor.element.focus()
      this.#labelEditor.element.select()
      return
    }
    this.#closeLabelEditor(true, false)
    const element = document.createElement("textarea")
    const initial = shapeLabel(shape)
    element.classList.add("◆", "◆editor-only", "◆graphic-label-editor")
    element.setAttribute("part", "graphic-label-editor")
    element.setAttribute("aria-label", "Shape label")
    element.placeholder = "Type a label"
    element.value = initial
    element.spellcheck = true
    const stop = (event: Event) => event.stopImmediatePropagation()
    element.addEventListener("pointerdown", stop)
    element.addEventListener("mousedown", stop)
    element.addEventListener("click", stop)
    element.addEventListener("dblclick", stop)
    element.addEventListener("input", () => this.#positionLabelEditor())
    element.addEventListener("keydown", event => {
      event.stopImmediatePropagation()
      if(event.key === "Escape") {
        event.preventDefault()
        this.#closeLabelEditor(false)
      }
      else if(event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        this.#closeLabelEditor(true)
      }
    })
    element.addEventListener("blur", () => {
      if(this.#labelEditor?.element === element) this.#closeLabelEditor(true)
    })
    this.editor.addAppendix(element)
    this.#labelEditor = {element, shape, initial}
    this.#positionLabelEditor()
    element.focus()
    element.select()
  }

  #closeLabelEditor(commit: boolean, refresh = true) {
    const editor = this.#labelEditor
    if(!editor) return
    this.#labelEditor = null
    editor.element.remove()
    if(commit && editor.shape.isConnected && editor.element.value !== editor.initial) {
      this.editor.doc.stopCapturing()
      const next = this.#setLabel(editor.shape, editor.element.value)
      this.#setShapeSelection([next], next)
      this.editor.doc.stopCapturing()
      this.editor.postSelectionPath()
    }
    if(refresh) this.#refresh()
  }

  #positionLabelEditor() {
    const editor = this.#labelEditor
    const graphic = editor ? graphicContainerForNode(editor.shape) : null
    if(!editor || !graphic || !editor.shape.isConnected) return
    const matrix = this.#screenMatrix(graphic)
    const bounds = shapeBounds(editor.shape)
    const center = applyMatrix(matrix, shapeCenter(editor.shape))
    const xScale = Math.max(0.0001, Math.hypot(matrix.a, matrix.b))
    const yScale = Math.max(0.0001, Math.hypot(matrix.c, matrix.d))
    const text = shapeText(editor.shape)
    const geometry = shapeGeometry(editor.shape)
    const fontSize = Math.max(14, attributeNumber(text ?? geometry, "font-size", 48) * yScale)
    const lineCount = Math.max(1, editor.element.value.replace(/\r\n?/g, "\n").split("\n").length)
    const fill = geometry.getAttribute("fill")
    Object.assign(editor.element.style, {
      left: `${center.x}px`,
      top: `${center.y}px`,
      width: `${Math.max(100, bounds.width * xScale * 0.9)}px`,
      height: `${Math.max(38, fontSize * lineCount * 1.25 + 10)}px`,
      fontSize: `${fontSize}px`,
      color: text?.getAttribute("fill") ?? "#0f172a",
      backgroundColor: fill && fill !== "none" ? fill : "#ffffff",
      transform: `translate(-50%, -50%) rotate(${cleanNumber(rotationOf(editor.shape))}deg)`,
    })
  }

  #handlePointerDown(event: PointerEvent) {
    const pointerGraphic = event.target instanceof Node ? graphicContainerForNode(event.target) : null
    if((event.button === 1 || event.button === 0 && this.#spaceDown) && pointerGraphic) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if(this.#capturedGraphic() !== pointerGraphic) this.editor.features.selection.captureElement(pointerGraphic)
      this.#startPan(pointerGraphic, event)
      return
    }
    if(event.button !== 0) return
    if(this.#interaction || this.#connector || this.#marquee || this.#pan) this.#cancelPointer()
    const port = event.composedPath().find(target => target instanceof HTMLElement && target.hasAttribute("data-graphic-port")) as HTMLElement | undefined
    if(port && this.selectedShape && graphicShapeType(this.selectedShape) !== "line" && graphicShapeType(this.selectedShape) !== "connector") {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.#startConnector(this.selectedShape, port.dataset.graphicPort as PortDirection, event)
      return
    }
    const handle = event.composedPath().find(target => target instanceof HTMLElement && target.hasAttribute("data-graphic-handle")) as HTMLElement | undefined
    if(handle && this.selectedShapes.length) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.#startInteraction(handle.dataset.graphicHandle!, event)
      return
    }

    const graphic = pointerGraphic
    if(!graphic) {
      this.#clearShapeSelection()
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    if(this.#capturedGraphic() !== graphic) this.editor.features.selection.captureElement(graphic)
    const shape = graphicShapeForNode(event.target instanceof Node ? event.target : null)
    if(shape && !this.#isLocked(shape) && shape.getAttribute("visibility") !== "hidden") {
      if(event.shiftKey) this.#toggleShapeSelection(shape)
      else if(!this.#selectedShapes.has(shape)) this.#selectShape(shape)
      if(this.#selectedShapes.has(shape)) this.#startInteraction("move", event)
    }
    else {
      if(!event.shiftKey) this.#clearShapeSelection()
      this.#startMarquee(graphic, event)
    }
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #startInteraction(handle: string, event: PointerEvent) {
    const shapes = this.selectedShapes
    const shape = this.selectedShape ?? shapes[0]
    const graphic = this.#capturedGraphic()
    if(!shape || !graphic || !shapes.length) return
    const point = this.#clientPoint(graphic, event.clientX, event.clientY)
    const captureTarget = event.composedPath().find(target => target instanceof Element) as Element | undefined
    const kind = handle.startsWith("resize-") ? "resize"
      : handle.startsWith("vertex-") ? "vertex"
        : handle === "line-start" || handle === "line-end" || handle === "connector-start" || handle === "connector-end"
          || handle === "roundness" || handle === "radius-x" || handle === "radius-y" || handle === "rotate"
          ? handle
          : "move"
    if(shapes.length > 1 && kind !== "move" && kind !== "resize" && kind !== "rotate") return
    const items = shapes.map(source => ({
      source,
      bounds: shapeBounds(source),
      visualBounds: visualBounds(source),
      points: shapePoints(source),
      rotation: rotationOf(source),
      signature: this.#geometrySignature(source),
    }))
    const multi = items.length > 1
    this.#interaction = {
      kind,
      handle,
      start: point,
      startClient: {x: event.clientX, y: event.clientY},
      latest: this.#pointerSnapshot(graphic, event),
      bounds: multi ? unionBounds(items.map(item => item.visualBounds)) : items[0].bounds,
      points: items[0].points,
      rotation: multi ? 0 : items[0].rotation,
      pointerId: event.pointerId,
      captureTarget: captureTarget ?? null,
      active: false,
      matrix: this.#screenMatrix(graphic),
      candidates: this.#snapCandidates(graphic, new Set(shapes)),
      items,
      attachedConnectors: this.#captureAttachedConnectors(graphic, shapes),
      ...(kind === "vertex" ? {vertex: Number.parseInt(handle.slice("vertex-".length))} : {}),
    }
    this.#capturePointer(captureTarget, event.pointerId)
  }

  #startConnector(shape: SVGGraphicsElement, port: PortDirection, event: PointerEvent) {
    const graphic = this.#capturedGraphic()
    if(!graphic || !(["n", "e", "s", "w"] as string[]).includes(port)) return
    const captureTarget = event.composedPath().find(target => target instanceof Element) as Element | undefined
    const start = shapePorts(shape)[port]
    this.#connector = {
      graphic,
      sourceShape: shape,
      sourceSignature: this.#geometrySignature(shape),
      sourcePort: port,
      start,
      startClient: {x: event.clientX, y: event.clientY},
      latest: this.#pointerSnapshot(graphic, event),
      pointerId: event.pointerId,
      captureTarget: captureTarget ?? null,
      active: false,
      matrix: this.#screenMatrix(graphic),
      routing: "orthogonal",
    }
    this.#capturePointer(captureTarget, event.pointerId)
  }

  #startMarquee(graphic: SVGSVGElement, event: PointerEvent) {
    const captureTarget = event.composedPath().find(target => target instanceof Element) as Element | undefined
    const point = this.#clientPoint(graphic, event.clientX, event.clientY)
    this.#marquee = {
      graphic,
      start: point,
      latest: point,
      startClient: {x: event.clientX, y: event.clientY},
      pointerId: event.pointerId,
      captureTarget: captureTarget ?? null,
      additive: event.shiftKey,
      active: false,
      baseSelection: event.shiftKey ? this.selectedShapes : [],
    }
    this.#capturePointer(captureTarget, event.pointerId)
  }

  #startPan(graphic: SVGSVGElement, event: PointerEvent) {
    if(this.#interaction || this.#connector || this.#marquee || this.#pan) this.#cancelPointer()
    const captureTarget = event.composedPath().find(target => target instanceof Element) as Element | undefined
    this.#pan = {
      graphic,
      startClient: {x: event.clientX, y: event.clientY},
      startViewport: this.#viewport(graphic),
      baseMatrix: this.#baseScreenMatrix(graphic),
      pointerId: event.pointerId,
      captureTarget: captureTarget ?? null,
    }
    document.body.classList.add("◆", "◆graphic-panning")
    this.#capturePointer(captureTarget, event.pointerId)
  }

  #movePan(event: PointerEvent) {
    const pan = this.#pan
    if(!pan || event.pointerId !== pan.pointerId || pan.graphic !== this.#capturedGraphic()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const delta = applyInverseLinearMatrix(pan.baseMatrix, {
      x: event.clientX - pan.startClient.x,
      y: event.clientY - pan.startClient.y,
    })
    this.#setViewport(pan.graphic, {
      ...pan.startViewport,
      x: pan.startViewport.x + delta.x,
      y: pan.startViewport.y + delta.y,
    })
    this.#scheduleRefresh()
  }

  #finishPan(event: PointerEvent) {
    const pan = this.#pan
    if(!pan || event.pointerId !== pan.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.#releasePointer(pan.captureTarget, pan.pointerId)
    this.#pan = null
    this.#removeMarkerClass(document.body, "◆graphic-panning")
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #cancelPan(event?: PointerEvent) {
    const pan = this.#pan
    if(!pan || event && event.pointerId !== pan.pointerId) return
    event?.preventDefault()
    event?.stopImmediatePropagation()
    this.#releasePointer(pan.captureTarget, pan.pointerId)
    this.#pan = null
    this.#removeMarkerClass(document.body, "◆graphic-panning")
    this.#refresh()
  }

  #capturePointer(target: Element | undefined | null, pointerId: number) {
    try {
      if(target && "setPointerCapture" in target) {
        ;(target as Element & {setPointerCapture(pointerId: number): void}).setPointerCapture(pointerId)
      }
    }
    catch {
      // Synthetic events and detached test nodes may not implement capture.
    }
  }

  #handlePointerMove(event: PointerEvent) {
    if(this.#pan) {
      this.#movePan(event)
      return
    }
    if(this.#connector) {
      this.#moveConnector(event)
      return
    }
    if(this.#marquee) {
      this.#moveMarquee(event)
      return
    }
    const interaction = this.#interaction
    const graphic = this.#capturedGraphic()
    if(!interaction || !graphic || event.pointerId !== interaction.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    interaction.latest = this.#pointerSnapshot(graphic, event)
    if(!interaction.active) {
      const distance = Math.hypot(event.clientX - interaction.startClient.x, event.clientY - interaction.startClient.y)
      if(distance < 3) return
      this.#beginInteractionPreview(interaction)
    }
    this.#scheduleInteractionFrame()
  }

  #finishPointer(event: PointerEvent) {
    if(this.#pan) this.#finishPan(event)
    else if(this.#connector) this.#finishConnector(event)
    else if(this.#marquee) this.#finishMarquee(event)
    else this.#finishInteraction(event)
  }

  #cancelPointer(event?: PointerEvent) {
    if(this.#pan) this.#cancelPan(event)
    if(this.#connector) this.#cancelConnector(event)
    if(this.#marquee) this.#cancelMarquee(event)
    if(this.#interaction) this.#cancelInteraction(event)
  }

  #moveConnector(event: PointerEvent) {
    const connector = this.#connector
    if(!connector || event.pointerId !== connector.pointerId || connector.graphic !== this.#capturedGraphic()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    connector.latest = this.#pointerSnapshot(connector.graphic, event)
    if(!connector.active) {
      const distance = Math.hypot(event.clientX - connector.startClient.x, event.clientY - connector.startClient.y)
      if(distance < 3) return
      this.#beginConnectorPreview(connector)
    }
    this.#scheduleInteractionFrame()
  }

  #moveMarquee(event: PointerEvent) {
    const marquee = this.#marquee
    if(!marquee || event.pointerId !== marquee.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    marquee.latest = this.#clientPoint(marquee.graphic, event.clientX, event.clientY)
    if(!marquee.active) {
      const distance = Math.hypot(event.clientX - marquee.startClient.x, event.clientY - marquee.startClient.y)
      if(distance < 3) return
      marquee.active = true
    }
    const selectionBounds = boundsForPoints([marquee.start, marquee.latest])
    const candidates = graphicShapeRoots(marquee.graphic)
      .filter(shape => !this.#isLocked(shape) && shape.getAttribute("visibility") !== "hidden")
    const enclosed = candidates.filter(shape => intersects(visualBounds(shape), selectionBounds))
    const shapes = marquee.additive
      ? Array.from(new Set([...marquee.baseSelection, ...enclosed]))
      : enclosed
    this.#setShapeSelection(shapes, enclosed.at(-1) ?? marquee.baseSelection.at(-1) ?? null)
    this.#refresh()
  }

  #finishMarquee(event: PointerEvent) {
    const marquee = this.#marquee
    if(!marquee || event.pointerId !== marquee.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.#releasePointer(marquee.captureTarget, marquee.pointerId)
    this.#marquee = null
    this.#hideMarquee()
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #cancelMarquee(event?: PointerEvent) {
    const marquee = this.#marquee
    if(!marquee || event && event.pointerId !== marquee.pointerId) return
    event?.preventDefault()
    event?.stopImmediatePropagation()
    if(marquee.active) this.#setShapeSelection(marquee.baseSelection)
    this.#releasePointer(marquee.captureTarget, marquee.pointerId)
    this.#marquee = null
    this.#hideMarquee()
    this.#refresh()
    if(event) this.editor.postSelectionPath()
  }

  #setMarquee(bounds: Bounds, graphic: SVGSVGElement) {
    const overlay = this.#overlay ?? this.#createOverlay()
    const marquee = overlay.querySelector<SVGRectElement>(".◆graphic-marquee")!
    const matrix = this.#screenMatrix(graphic)
    const screenBounds = boundsForPoints([
      {x: bounds.x, y: bounds.y},
      {x: bounds.x + bounds.width, y: bounds.y},
      {x: bounds.x + bounds.width, y: bounds.y + bounds.height},
      {x: bounds.x, y: bounds.y + bounds.height},
    ].map(point => applyMatrix(matrix, point)))
    marquee.setAttribute("x", cleanNumber(screenBounds.x))
    marquee.setAttribute("y", cleanNumber(screenBounds.y))
    marquee.setAttribute("width", cleanNumber(screenBounds.width))
    marquee.setAttribute("height", cleanNumber(screenBounds.height))
    marquee.removeAttribute("display")
    marquee.removeAttribute("hidden")
    const selectionOutline = overlay.querySelector<SVGGraphicsElement>(".◆graphic-selection-outline")
    const rotationStem = overlay.querySelector<SVGGraphicsElement>(".◆graphic-rotation-stem")
    if(selectionOutline) selectionOutline.style.display = "none"
    if(rotationStem) rotationStem.style.display = "none"
    overlay.querySelectorAll<HTMLElement>(".◆graphic-handle").forEach(handle => handle.hidden = true)
    overlay.hidden = false
  }

  #hideMarquee() {
    const marquee = this.#overlay?.querySelector(".◆graphic-marquee")
    marquee?.setAttribute("display", "none")
    marquee?.setAttribute("hidden", "")
    const selectionOutline = this.#overlay?.querySelector<SVGGraphicsElement>(".◆graphic-selection-outline")
    const rotationStem = this.#overlay?.querySelector<SVGGraphicsElement>(".◆graphic-rotation-stem")
    if(selectionOutline) selectionOutline.style.removeProperty("display")
    if(rotationStem) rotationStem.style.removeProperty("display")
  }

  #releasePointer(target: Element | null, pointerId: number) {
    try {
      if(target && "hasPointerCapture" in target && "releasePointerCapture" in target
        && (target as Element & {hasPointerCapture(pointerId: number): boolean}).hasPointerCapture(pointerId)) {
        ;(target as Element & {releasePointerCapture(pointerId: number): void}).releasePointerCapture(pointerId)
      }
    }
    catch {
      // The pointer or target may already have been released or removed.
    }
  }

  #finishConnector(event: PointerEvent) {
    const interaction = this.#connector
    if(!interaction || event.pointerId !== interaction.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    if(interaction.active) this.#updateConnectorPreview(interaction)
    const sourceIsCurrent = interaction.sourceShape.isConnected
      && interaction.sourceShape.closest("svg") === interaction.graphic
      && this.#geometrySignature(interaction.sourceShape) === interaction.sourceSignature
    if(interaction.active && sourceIsCurrent) {
      const connector = this.#createShape("connector") as SVGPolylineElement
      const end = interaction.portTarget?.point ?? interaction.latest.point
      const orientation = interaction.sourcePort === "e" || interaction.sourcePort === "w" ? "horizontal" : "vertical"
      setConnectorEndpoints(connector, interaction.start, end, interaction.routing, orientation)
      const firstShape = graphicShapeRoots(interaction.graphic)[0] ?? null
      this.editor.doc.stopCapturing()
      interaction.graphic.insertBefore(connector, firstShape)
      this.editor.doc.stopCapturing()
      this.#selectShape(connector)
    }
    this.#cleanupConnector(interaction)
    this.#connector = null
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #cancelConnector(event?: PointerEvent) {
    const interaction = this.#connector
    if(!interaction || event && event.pointerId !== interaction.pointerId) return
    event?.preventDefault()
    event?.stopImmediatePropagation()
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    this.#cleanupConnector(interaction)
    this.#connector = null
    this.#refresh()
  }

  #beginConnectorPreview(interaction: ConnectorDrawInteraction) {
    if(!interaction.sourceShape.isConnected) return
    interaction.active = true
    const previewRoot = document.createElementNS(SVG_NAMESPACE, "svg")
    previewRoot.classList.add("◆", "◆editor-only", "◆graphic-preview")
    previewRoot.setAttribute("part", "graphic-preview")
    previewRoot.setAttribute("aria-hidden", "true")
    previewRoot.setAttribute("viewBox", interaction.graphic.getAttribute("viewBox") ?? "0 0 1600 900")
    const preserveAspectRatio = interaction.graphic.getAttribute("preserveAspectRatio")
    if(preserveAspectRatio) previewRoot.setAttribute("preserveAspectRatio", preserveAspectRatio)
    this.#positionPreviewRoot(previewRoot, interaction.graphic)
    const preview = this.#createShape("connector") as SVGPolylineElement
    setConnectorEndpoints(preview, interaction.start, interaction.start, interaction.routing)
    previewRoot.append(preview)
    this.editor.addAppendix(previewRoot)
    interaction.previewRoot = previewRoot
    interaction.preview = preview
    document.body.classList.add("◆", "◆graphic-manipulating")
  }

  #updateConnectorPreview(interaction: ConnectorDrawInteraction) {
    if(!interaction.preview || !interaction.previewRoot) return
    interaction.matrix = this.#screenMatrix(interaction.graphic)
    this.#positionPreviewRoot(interaction.previewRoot, interaction.graphic)
    interaction.portTarget = this.#nearestPort(
      interaction.graphic,
      interaction.latest.client,
      new Set([interaction.sourceShape]),
      interaction.latest.altKey,
    )
    const end = interaction.portTarget?.point ?? interaction.latest.point
    const orientation = interaction.sourcePort === "e" || interaction.sourcePort === "w" ? "horizontal" : "vertical"
    setConnectorEndpoints(interaction.preview, interaction.start, end, interaction.routing, orientation)
    this.#setPortTarget(interaction.portTarget)
  }

  #cleanupConnector(interaction: ConnectorDrawInteraction) {
    this.#releasePointer(interaction.captureTarget, interaction.pointerId)
    interaction.previewRoot?.remove()
    this.#removeMarkerClass(document.body, "◆graphic-manipulating")
    this.#setPortTarget(null)
  }

  #finishInteraction(event: PointerEvent) {
    const interaction = this.#interaction
    if(!interaction || event.pointerId !== interaction.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    const sourcesAreCurrent = interaction.items.every(item => item.source.isConnected
      && this.#geometrySignature(item.source) === item.signature)
      && interaction.attachedConnectors.every(item => item.source.isConnected
        && this.#geometrySignature(item.source) === item.signature)
    if(interaction.active && sourcesAreCurrent) {
      this.editor.doc.stopCapturing()
      this.#applyInteractionSet(interaction.items.map(item => item.source), interaction)
      this.#applyAttachedConnectors(interaction.attachedConnectors)
      this.editor.doc.stopCapturing()
    }
    this.#cleanupInteraction(interaction)
    this.#interaction = null
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #cancelInteraction(event?: PointerEvent) {
    const interaction = this.#interaction
    if(!interaction) return
    event?.preventDefault()
    event?.stopImmediatePropagation()
    if(this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.#frame = null
    this.#cleanupInteraction(interaction)
    this.#interaction = null
    this.#refresh()
  }

  #beginInteractionPreview(interaction: Interaction) {
    const graphic = this.#capturedGraphic()
    if(!interaction.items.length || !graphic) return
    interaction.active = true
    const previewRoot = document.createElementNS(SVG_NAMESPACE, "svg")
    previewRoot.classList.add("◆", "◆editor-only", "◆graphic-preview")
    previewRoot.setAttribute("part", "graphic-preview")
    previewRoot.setAttribute("aria-hidden", "true")
    previewRoot.setAttribute("viewBox", graphic.getAttribute("viewBox") ?? "0 0 1600 900")
    const preserveAspectRatio = graphic.getAttribute("preserveAspectRatio")
    if(preserveAspectRatio) previewRoot.setAttribute("preserveAspectRatio", preserveAspectRatio)
    this.#positionPreviewRoot(previewRoot, graphic)
    interaction.attachedConnectors.forEach(item => {
      const preview = item.source.cloneNode(true) as SVGPolylineElement
      this.#removeMarkerClasses(preview, true)
      item.preview = preview
      previewRoot.append(preview)
      item.source.classList.add("◆", "◆graphic-preview-source")
    })
    interaction.items.forEach(item => {
      const preview = item.source.cloneNode(true) as SVGGraphicsElement
      this.#removeMarkerClasses(preview, true)
      item.preview = preview
      previewRoot.append(preview)
      item.source.classList.add("◆", "◆graphic-preview-source")
    })
    this.editor.addAppendix(previewRoot)
    interaction.previewRoot = previewRoot
    document.body.classList.add("◆", "◆graphic-manipulating")
  }

  #scheduleInteractionFrame() {
    if(this.#frame !== null) return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null
      if(this.#connector?.active) {
        this.#updateConnectorPreview(this.#connector)
        return
      }
      const interaction = this.#interaction
      const graphic = this.#capturedGraphic()
      const previews = interaction?.items.flatMap(item => item.preview ? [item.preview] : []) ?? []
      if(!interaction?.active || previews.length !== interaction.items.length || !graphic) return
      interaction.matrix = this.#screenMatrix(graphic)
      if(interaction.previewRoot) this.#positionPreviewRoot(interaction.previewRoot, graphic)
      const guides = this.#applyInteractionSet(previews, interaction)
      const previewMap = new Map<Element, Element>(interaction.items.flatMap(item => item.preview ? [[item.source, item.preview] as const] : []))
      interaction.attachedConnectors.forEach(item => {
        if(item.preview) previewMap.set(item.source, item.preview)
      })
      this.#applyAttachedConnectors(interaction.attachedConnectors, previewMap)
      this.#updateOverlaySelection(previews, graphic, interaction.matrix, interaction)
      this.#setGuides(guides, graphic, interaction.matrix)
    })
  }

  #positionPreviewRoot(preview: SVGSVGElement, graphic: SVGSVGElement) {
    const rect = graphic.getBoundingClientRect()
    Object.assign(preview.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    const viewport = this.#viewport(graphic)
    try {
      preview.currentScale = viewport.scale
      const translate = preview.currentTranslate as unknown as {x: number, y: number}
      if(translate) {
        translate.x = viewport.x
        translate.y = viewport.y
      }
    }
    catch {
      // Preview navigation is a progressive enhancement in DOM shims.
    }
  }

  #cleanupInteraction(interaction: Interaction) {
    this.#releasePointer(interaction.captureTarget, interaction.pointerId)
    interaction.previewRoot?.remove()
    interaction.items.forEach(item => this.#removeMarkerClass(item.source, "◆graphic-preview-source"))
    interaction.attachedConnectors.forEach(item => this.#removeMarkerClass(item.source, "◆graphic-preview-source"))
    this.#removeMarkerClass(document.body, "◆graphic-manipulating")
    this.#setGuides({})
    this.#setPortTarget(null)
  }

  #applyInteractionSet(shapes: Element[], interaction: Interaction): ActiveGuides {
    if(shapes.length === 1) return this.#applyInteraction(shapes[0], interaction)
    const point = interaction.latest.point
    if(interaction.kind === "move") {
      let dx = point.x - interaction.start.x
      let dy = point.y - interaction.start.y
      if(interaction.latest.shiftKey) {
        if(Math.abs(dx) >= Math.abs(dy)) dy = 0
        else dx = 0
      }
      const snapped = this.#snapMove({
        ...interaction.bounds,
        x: interaction.bounds.x + dx,
        y: interaction.bounds.y + dy,
      }, interaction)
      const offset = {x: snapped.bounds.x - interaction.bounds.x, y: snapped.bounds.y - interaction.bounds.y}
      shapes.forEach((shape, index) => {
        const item = interaction.items[index]
        setShapeBounds(shape, {
          ...item.bounds,
          x: item.bounds.x + offset.x,
          y: item.bounds.y + offset.y,
        }, item.bounds, item.points)
        setRotation(shape, item.rotation)
      })
      interaction.frameBounds = snapped.bounds
      interaction.frameRotation = 0
      return snapped.guides
    }
    if(interaction.kind === "resize") {
      const originalDirection = interaction.handle.slice("resize-".length)
      const resized = this.#resizeBounds(point, originalDirection, interaction)
      let next = resized.bounds
      if(interaction.latest.shiftKey && originalDirection.length === 2 && interaction.bounds.width && interaction.bounds.height) {
        next = this.#constrainResize(next, resized.direction, interaction.bounds, interaction.latest.metaKey || interaction.latest.ctrlKey)
      }
      const snapped = this.#snapResize(next, resized.direction, originalDirection, interaction)
      const scaleX = interaction.bounds.width ? snapped.bounds.width / interaction.bounds.width : 1
      const scaleY = interaction.bounds.height ? snapped.bounds.height / interaction.bounds.height : 1
      shapes.forEach((shape, index) => {
        const item = interaction.items[index]
        const mapped = {
          x: snapped.bounds.x + (item.bounds.x - interaction.bounds.x) * scaleX,
          y: snapped.bounds.y + (item.bounds.y - interaction.bounds.y) * scaleY,
          width: item.bounds.width * scaleX,
          height: item.bounds.height * scaleY,
        }
        setShapeBounds(shape, mapped, item.bounds, item.points)
        setRotation(shape, item.rotation)
      })
      interaction.frameBounds = snapped.bounds
      interaction.frameRotation = 0
      return snapped.guides
    }
    if(interaction.kind === "rotate") {
      const center = {
        x: interaction.bounds.x + interaction.bounds.width / 2,
        y: interaction.bounds.y + interaction.bounds.height / 2,
      }
      const startAngle = Math.atan2(interaction.start.y - center.y, interaction.start.x - center.x) * 180 / Math.PI
      const currentAngle = Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI
      const delta = this.#snapRotation(currentAngle - startAngle, interaction.latest)
      shapes.forEach((shape, index) => {
        const item = interaction.items[index]
        const initialCenter = {
          x: item.bounds.x + item.bounds.width / 2,
          y: item.bounds.y + item.bounds.height / 2,
        }
        const nextCenter = rotateAround(initialCenter, center, delta)
        setShapeBounds(shape, {
          ...item.bounds,
          x: nextCenter.x - item.bounds.width / 2,
          y: nextCenter.y - item.bounds.height / 2,
        }, item.bounds, item.points)
        setRotation(shape, item.rotation + delta)
      })
      interaction.frameBounds = interaction.bounds
      interaction.frameRotation = delta
      return {}
    }
    return {}
  }

  #applyInteraction(shape: Element, interaction: Interaction): ActiveGuides {
    const {latest} = interaction
    const geometry = shapeGeometry(shape)
    let point = latest.point
    if(interaction.rotation && interaction.kind !== "move" && interaction.kind !== "rotate") {
      const center = {
        x: interaction.bounds.x + interaction.bounds.width / 2,
        y: interaction.bounds.y + interaction.bounds.height / 2,
      }
      point = rotateAround(point, center, -interaction.rotation)
    }
    if(interaction.kind === "move") {
      let dx = point.x - interaction.start.x
      let dy = point.y - interaction.start.y
      if(latest.shiftKey) {
        if(Math.abs(dx) >= Math.abs(dy)) dy = 0
        else dx = 0
      }
      const snapped = this.#snapMove({...interaction.bounds, x: interaction.bounds.x + dx, y: interaction.bounds.y + dy}, interaction)
      setShapeBounds(shape, snapped.bounds, interaction.bounds, interaction.points)
      setRotation(shape, interaction.rotation)
      return snapped.guides
    }
    if(interaction.kind === "rotate") {
      const center = {x: interaction.bounds.x + interaction.bounds.width / 2, y: interaction.bounds.y + interaction.bounds.height / 2}
      const startAngle = Math.atan2(interaction.start.y - center.y, interaction.start.x - center.x) * 180 / Math.PI
      const currentAngle = Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI
      const angle = interaction.rotation + currentAngle - startAngle
      setRotation(shape, this.#snapRotation(angle, latest))
      return {}
    }
    if(interaction.kind === "roundness") {
      const radius = Math.max(0, Math.min(interaction.bounds.height / 2, point.x - interaction.bounds.x))
      geometry.setAttribute("rx", cleanNumber(radius))
      return {}
    }
    if(interaction.kind === "radius-x" || interaction.kind === "radius-y") {
      const center = {
        x: interaction.bounds.x + interaction.bounds.width / 2,
        y: interaction.bounds.y + interaction.bounds.height / 2,
      }
      const attribute = interaction.kind === "radius-x" ? "rx" : "ry"
      const coordinate = interaction.kind === "radius-x" ? point.x - center.x : point.y - center.y
      geometry.setAttribute(geometry.localName === "circle" ? "r" : attribute, cleanNumber(Math.max(0.5, Math.abs(coordinate))))
      syncShapeText(shape)
      return {}
    }
    if(interaction.kind === "line-start" || interaction.kind === "line-end") {
      const snapped = this.#snapPoint(point, interaction)
      const suffix = interaction.kind === "line-start" ? "1" : "2"
      geometry.setAttribute(`x${suffix}`, cleanNumber(snapped.point.x))
      geometry.setAttribute(`y${suffix}`, cleanNumber(snapped.point.y))
      setRotation(shape, interaction.rotation)
      return snapped.guides
    }
    if(interaction.kind === "connector-start" || interaction.kind === "connector-end") {
      const graphic = this.#capturedGraphic()
      const target = graphic
        ? this.#nearestPort(graphic, latest.client, new Set(), latest.altKey)
        : null
      interaction.portTarget = target
      this.#setPortTarget(target)
      const points = interaction.points
      const start = interaction.kind === "connector-start" ? target?.point ?? point : points[0] ?? point
      const end = interaction.kind === "connector-end" ? target?.point ?? point : points.at(-1) ?? point
      setConnectorEndpoints(
        shape,
        start,
        end,
        points.length > 2 ? "orthogonal" : "straight",
        connectorOrientation(points),
      )
      return {}
    }
    if(interaction.kind === "vertex" && interaction.vertex !== undefined) {
      const snapped = this.#snapPoint(point, interaction)
      const points = [...interaction.points]
      if(points[interaction.vertex]) points[interaction.vertex] = snapped.point
      setPoints(geometry, points)
      syncShapeText(shape)
      setRotation(shape, interaction.rotation)
      return snapped.guides
    }
    if(interaction.kind === "resize") {
      const originalDirection = interaction.handle.slice("resize-".length)
      const resized = this.#resizeBounds(point, originalDirection, interaction)
      let next = resized.bounds
      if(latest.shiftKey && originalDirection.length === 2 && interaction.bounds.width && interaction.bounds.height) {
        next = this.#constrainResize(next, resized.direction, interaction.bounds, latest.metaKey || latest.ctrlKey)
      }
      const snapped = this.#snapResize(next, resized.direction, originalDirection, interaction)
      const stable = this.#stabilizeRotatedResize(snapped.bounds, originalDirection, interaction)
      setShapeBounds(shape, stable, interaction.bounds, interaction.points)
      setRotation(shape, interaction.rotation)
      return snapped.guides
    }
    return {}
  }

  /** Normalizes the dragged and fixed coordinates into positive bounds and
   * reports which visual handle direction owns the moving edges after any
   * horizontal or vertical crossing. */
  #resizeBounds(point: Point, direction: string, interaction: Interaction) {
    const initial = interaction.bounds
    const next = {...initial}
    const fromCenter = interaction.latest.metaKey || interaction.latest.ctrlKey
    const center = {x: initial.x + initial.width / 2, y: initial.y + initial.height / 2}
    let horizontal = ""
    let vertical = ""
    if(direction.includes("w") || direction.includes("e")) {
      const fixed = fromCenter ? center.x : direction.includes("w") ? initial.x + initial.width : initial.x
      const delta = point.x - fixed
      horizontal = delta < 0 ? "w" : delta > 0 ? "e" : direction.includes("w") ? "w" : "e"
      next.width = Math.max(1, Math.abs(delta) * (fromCenter ? 2 : 1))
      next.x = fromCenter ? center.x - next.width / 2 : horizontal === "w" ? fixed - next.width : fixed
    }
    if(direction.includes("n") || direction.includes("s")) {
      const fixed = fromCenter ? center.y : direction.includes("n") ? initial.y + initial.height : initial.y
      const delta = point.y - fixed
      vertical = delta < 0 ? "n" : delta > 0 ? "s" : direction.includes("n") ? "n" : "s"
      next.height = Math.max(1, Math.abs(delta) * (fromCenter ? 2 : 1))
      next.y = fromCenter ? center.y - next.height / 2 : vertical === "n" ? fixed - next.height : fixed
    }
    return {bounds: next, direction: `${vertical}${horizontal}`}
  }

  /** Keeps the opposite resize handle fixed when the shape's rotation center
   * moves with its resized bounds. This is the SVG equivalent of deriving a
   * rotated scale box from the fixed and dragged handles. */
  #stabilizeRotatedResize(next: Bounds, direction: string, interaction: Interaction) {
    const fromCenter = interaction.latest.metaKey || interaction.latest.ctrlKey
    if(!interaction.rotation || fromCenter) return next
    const initial = interaction.bounds
    const initialCenter = {
      x: initial.x + initial.width / 2,
      y: initial.y + initial.height / 2,
    }
    const nextCenter = {
      x: next.x + next.width / 2,
      y: next.y + next.height / 2,
    }
    const anchor = {
      x: direction.includes("w") ? initial.x + initial.width
        : direction.includes("e") ? initial.x
          : initialCenter.x,
      y: direction.includes("n") ? initial.y + initial.height
        : direction.includes("s") ? initial.y
          : initialCenter.y,
    }
    const fixed = rotateAround(anchor, initialCenter, interaction.rotation)
    const displaced = rotateAround(anchor, nextCenter, interaction.rotation)
    return {
      ...next,
      x: next.x + fixed.x - displaced.x,
      y: next.y + fixed.y - displaced.y,
    }
  }

  #constrainResize(next: Bounds, direction: string, initial: Bounds, fromCenter = false) {
    const ratio = initial.width / initial.height
    const widthScale = next.width / initial.width
    const heightScale = next.height / initial.height
    const center = {x: initial.x + initial.width / 2, y: initial.y + initial.height / 2}
    if(Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)) {
      const height = Math.max(1, next.width / ratio)
      if(fromCenter) next.y = center.y - height / 2
      else if(direction.includes("n")) next.y = initial.y + initial.height - height
      next.height = height
    }
    else {
      const width = Math.max(1, next.height * ratio)
      if(fromCenter) next.x = center.x - width / 2
      else if(direction.includes("w")) next.x = initial.x + initial.width - width
      next.width = width
    }
    return next
  }

  #snapMove(bounds: Bounds, interaction: Interaction) {
    if(!this.#options.snap || interaction.latest.altKey) return {bounds, guides: {}}
    const threshold = this.#snapThreshold(interaction.matrix)
    const x = this.#bestSnap([bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width], interaction.candidates.x, threshold.x)
      ?? this.#gridSnap(bounds.x, threshold.x)
    const y = this.#bestSnap([bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height], interaction.candidates.y, threshold.y)
      ?? this.#gridSnap(bounds.y, threshold.y)
    return {
      bounds: {...bounds, x: bounds.x + (x?.delta ?? 0), y: bounds.y + (y?.delta ?? 0)},
      guides: {x: x?.target, y: y?.target},
    }
  }

  #snapResize(bounds: Bounds, direction: string, originalDirection: string, interaction: Interaction) {
    if(!this.#options.snap || interaction.latest.altKey) return {bounds, direction, guides: {}}
    const threshold = this.#snapThreshold(interaction.matrix)
    const moving = {
      x: direction.includes("w") ? bounds.x : bounds.x + bounds.width,
      y: direction.includes("n") ? bounds.y : bounds.y + bounds.height,
    }
    let x: {delta: number, target: SnapTarget} | null = null
    let y: {delta: number, target: SnapTarget} | null = null
    if(direction.includes("w") || direction.includes("e")) {
      x = this.#bestSnap([moving.x], interaction.candidates.x, threshold.x) ?? this.#gridSnap(moving.x, threshold.x)
      moving.x += x?.delta ?? 0
    }
    if(direction.includes("n") || direction.includes("s")) {
      y = this.#bestSnap([moving.y], interaction.candidates.y, threshold.y) ?? this.#gridSnap(moving.y, threshold.y)
      moving.y += y?.delta ?? 0
    }
    const resized = this.#resizeBounds(moving, originalDirection, interaction)
    return {bounds: resized.bounds, direction: resized.direction, guides: {x: x?.target, y: y?.target}}
  }

  #snapPoint(point: Point, interaction: Interaction) {
    if(!this.#options.snap || interaction.latest.altKey) return {point, guides: {}}
    const threshold = this.#snapThreshold(interaction.matrix)
    const x = this.#bestSnap([point.x], interaction.candidates.x, threshold.x) ?? this.#gridSnap(point.x, threshold.x)
    const y = this.#bestSnap([point.y], interaction.candidates.y, threshold.y) ?? this.#gridSnap(point.y, threshold.y)
    return {
      point: {x: point.x + (x?.delta ?? 0), y: point.y + (y?.delta ?? 0)},
      guides: {x: x?.target, y: y?.target},
    }
  }

  #snapRotation(angle: number, pointer: PointerSnapshot) {
    const step = pointer.shiftKey ? 15 : this.#options.snap && !pointer.altKey ? 5 : 0
    return step ? Math.round(angle / step) * step : angle
  }

  #bestSnap(anchors: number[], targets: SnapTarget[], threshold: number) {
    let best: {delta: number, target: SnapTarget} | null = null
    anchors.forEach(anchor => targets.forEach(target => {
      const delta = target.value - anchor
      if(Math.abs(delta) > threshold) return
      const sameDistance = best && Math.abs(Math.abs(delta) - Math.abs(best.delta)) < 0.001
      const targetPriority = target.kind === "object" ? 0 : 1
      const bestPriority = best?.target.kind === "object" ? 0 : 1
      if(!best || Math.abs(delta) < Math.abs(best.delta) || sameDistance && targetPriority < bestPriority) best = {delta, target}
    }))
    return best
  }

  #gridSnap(value: number, threshold: number) {
    const target = Math.round(value / 50) * 50
    const delta = target - value
    return Math.abs(delta) <= threshold ? {delta, target: {value: target, kind: "grid"} as SnapTarget} : null
  }

  #snapThreshold(matrix: Matrix) {
    const xScale = Math.max(0.0001, Math.hypot(matrix.a, matrix.b))
    const yScale = Math.max(0.0001, Math.hypot(matrix.c, matrix.d))
    return {x: 6 / xScale, y: 6 / yScale}
  }

  #snapCandidates(graphic: SVGSVGElement, selected: Set<Element>): SnapCandidates {
    const viewBox = graphicViewBox(graphic)
    const candidates: SnapCandidates = {
      x: [viewBox.x, viewBox.x + viewBox.width / 2, viewBox.x + viewBox.width].map(value => ({value, kind: "canvas"})),
      y: [viewBox.y, viewBox.y + viewBox.height / 2, viewBox.y + viewBox.height].map(value => ({value, kind: "canvas"})),
    }
    graphicShapeRoots(graphic).forEach(shape => {
      if(selected.has(shape) || !graphicShapeType(shape)) return
      const bounds = visualBounds(shape)
      candidates.x.unshift(
        {value: bounds.x, kind: "object"},
        {value: bounds.x + bounds.width / 2, kind: "object"},
        {value: bounds.x + bounds.width, kind: "object"},
      )
      candidates.y.unshift(
        {value: bounds.y, kind: "object"},
        {value: bounds.y + bounds.height / 2, kind: "object"},
        {value: bounds.y + bounds.height, kind: "object"},
      )
    })
    return candidates
  }

  #nearestPort(graphic: SVGSVGElement, client: Point, excluded: Set<Element>, bypass = false) {
    if(bypass || !this.#options.snap) return null
    const matrix = this.#screenMatrix(graphic)
    let nearest: (PortTarget & {distance: number}) | null = null
    graphicShapeRoots(graphic).forEach(shape => {
      const type = graphicShapeType(shape)
      if(excluded.has(shape) || !type || type === "line" || type === "connector") return
      const ports = shapePorts(shape)
      ;(["n", "e", "s", "w"] as const).forEach(port => {
        const point = ports[port]
        const portClient = applyMatrix(matrix, point)
        const distance = Math.hypot(portClient.x - client.x, portClient.y - client.y)
        if(distance <= 18 && (!nearest || distance < nearest.distance)) {
          nearest = {shape, port, point, client: portClient, distance}
        }
      })
    })
    if(!nearest) return null
    const match = nearest as PortTarget & {distance: number}
    return {shape: match.shape, port: match.port, point: match.point, client: match.client}
  }

  #captureAttachedConnectors(graphic: SVGSVGElement | null, shapes: SVGGraphicsElement[]) {
    if(!graphic || !shapes.length) return []
    const selected = new Set(shapes)
    const attachable = shapes.filter(shape => {
      const type = graphicShapeType(shape)
      return type && type !== "line" && type !== "connector" && graphic.contains(shape)
    })
    if(!attachable.length) return []
    const result: AttachedConnector[] = []
    graphicShapeRoots(graphic).filter(shape => graphicShapeType(shape) === "connector").forEach(source => {
      if(selected.has(source)) return
      const points = parsePoints(source)
      if(points.length < 2) return
      const bindings: ConnectorBinding[] = []
      ;(["start", "end"] as const).forEach(endpoint => {
        const endpointPoint = endpoint === "start" ? points[0] : points.at(-1)!
        let best: (ConnectorBinding & {distance: number}) | null = null
        attachable.forEach(shape => {
          const ports = shapePorts(shape)
          ;(["n", "e", "s", "w"] as const).forEach(port => {
            const point = ports[port]
            const distance = Math.hypot(point.x - endpointPoint.x, point.y - endpointPoint.y)
            if(distance <= 0.25 && (!best || distance < best.distance)) best = {shape, endpoint, port, distance}
          })
        })
        if(best) {
          const match = best as ConnectorBinding & {distance: number}
          bindings.push({shape: match.shape, endpoint: match.endpoint, port: match.port})
        }
      })
      if(bindings.length) result.push({
        source: source as SVGPolylineElement,
        signature: this.#geometrySignature(source),
        points,
        routing: connectorRouting(source),
        orientation: connectorOrientation(points),
        bindings,
      })
    })
    return result
  }

  #applyAttachedConnectors(items: AttachedConnector[], replacements = new Map<Element, Element>()) {
    items.forEach(item => {
      const connector = replacements.get(item.source) ?? item.source
      if(!connector.isConnected && connector === item.source) return
      let start = item.points[0]
      let end = item.points.at(-1)!
      item.bindings.forEach(binding => {
        const shape = replacements.get(binding.shape) ?? binding.shape
        const point = shapePorts(shape)[binding.port]
        if(binding.endpoint === "start") start = point
        else end = point
      })
      setConnectorEndpoints(connector, start, end, item.routing, item.orientation)
    })
  }

  #pointerSnapshot(graphic: SVGSVGElement, event: PointerEvent): PointerSnapshot {
    return {
      client: {x: event.clientX, y: event.clientY},
      point: this.#clientPoint(graphic, event.clientX, event.clientY),
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
    }
  }

  #geometrySignature(shape: Element) {
    const geometry = shapeGeometry(shape)
    const attributes = ["x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "transform"]
    return [shape, ...(geometry === shape ? [] : [geometry])].map(element => attributes
      .map(name => `${name}=${element.getAttribute(name) ?? ""}`)
      .join(";"),
    ).join("|")
  }

  #viewport(graphic: SVGSVGElement): GraphicViewport {
    const stored = this.#viewportState.get(graphic)
    if(stored) return {...stored}
    let scale = 1
    let x = 0
    let y = 0
    try {
      if(Number.isFinite(graphic.currentScale) && graphic.currentScale > 0) scale = graphic.currentScale
      const translate = graphic.currentTranslate as unknown as {x: number, y: number}
      if(translate && Number.isFinite(translate.x) && Number.isFinite(translate.y)) {
        x = translate.x
        y = translate.y
      }
    }
    catch {
      // DOM shims and nested SVG implementations may not expose navigation.
    }
    return {scale, x, y}
  }

  #setViewport(graphic: SVGSVGElement, viewport: GraphicViewport) {
    const scale = Math.min(4, Math.max(0.25, viewport.scale))
    const x = Number.isFinite(viewport.x) ? viewport.x : 0
    const y = Number.isFinite(viewport.y) ? viewport.y : 0
    const next = {
      scale: Math.abs(scale - 1) < 0.0001 ? 1 : scale,
      x: Math.abs(x) < 0.01 ? 0 : x,
      y: Math.abs(y) < 0.01 ? 0 : y,
    }
    try {
      graphic.currentScale = next.scale
      const translate = graphic.currentTranslate as unknown as {x: number, y: number}
      if(translate) {
        translate.x = next.x
        translate.y = next.y
      }
    }
    catch {
      // The fallback state still makes navigation deterministic in DOM shims.
    }
    const changed = next.scale !== 1 || next.x !== 0 || next.y !== 0
    if(changed) {
      this.#viewportState.set(graphic, next)
      this.#navigatedGraphics.add(graphic)
      graphic.classList.add("◆", "◆graphic-viewport-active")
    }
    else {
      this.#viewportState.delete(graphic)
      this.#navigatedGraphics.delete(graphic)
      this.#removeMarkerClass(graphic, "◆graphic-viewport-active")
    }
  }

  #zoomAt(graphic: SVGSVGElement, scale: number, focal?: Point) {
    const current = this.#viewport(graphic)
    const nextScale = Math.min(4, Math.max(0.25, scale))
    if(Math.abs(nextScale - current.scale) < 0.0001) return
    const rect = graphic.getBoundingClientRect()
    const anchor = focal ?? {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}
    const basePoint = applyInverseMatrix(this.#baseScreenMatrix(graphic), anchor)
    const userPoint = this.#clientPoint(graphic, anchor.x, anchor.y)
    this.#setViewport(graphic, {
      scale: nextScale,
      x: basePoint.x - nextScale * userPoint.x,
      y: basePoint.y - nextScale * userPoint.y,
    })
  }

  #navigate(operation: GraphicViewportOperation, zoom?: number) {
    const graphic = this.#capturedGraphic()
    if(!graphic) return
    const current = this.#viewport(graphic)
    if(operation === "zoom-in") this.#zoomAt(graphic, current.scale * 1.2)
    else if(operation === "zoom-out") this.#zoomAt(graphic, current.scale / 1.2)
    else if(operation === "set-zoom") this.#zoomAt(graphic, (zoom ?? 100) / 100)
    else if(operation === "fit-content") this.#fitContent(graphic)
    else this.#setViewport(graphic, {scale: 1, x: 0, y: 0})
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #fitContent(graphic: SVGSVGElement) {
    const shapes = graphicShapeRoots(graphic).filter(shape => shape.getAttribute("visibility") !== "hidden")
    const rect = graphic.getBoundingClientRect()
    if(!shapes.length || !rect.width || !rect.height) {
      this.#setViewport(graphic, {scale: 1, x: 0, y: 0})
      return
    }
    const matrix = this.#baseScreenMatrix(graphic)
    const authoredContent = unionBounds(shapes.map(shape => visualBounds(shape)))
    const screenContent = unionBounds(shapes.map(shape => {
      const bounds = visualBounds(shape)
      return boundsForPoints([
        {x: bounds.x, y: bounds.y},
        {x: bounds.x + bounds.width, y: bounds.y},
        {x: bounds.x + bounds.width, y: bounds.y + bounds.height},
        {x: bounds.x, y: bounds.y + bounds.height},
      ].map(point => applyMatrix(matrix, point)))
    }))
    const padding = 24
    const availableWidth = Math.max(1, rect.width - padding * 2)
    const availableHeight = Math.max(1, rect.height - padding * 2)
    const scale = Math.min(4, Math.max(0.25, Math.min(
      availableWidth / Math.max(1, screenContent.width),
      availableHeight / Math.max(1, screenContent.height),
    )))
    const viewportCenter = applyInverseMatrix(matrix, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
    const contentCenter = {
      x: authoredContent.x + authoredContent.width / 2,
      y: authoredContent.y + authoredContent.height / 2,
    }
    this.#setViewport(graphic, {
      scale,
      x: viewportCenter.x - scale * contentCenter.x,
      y: viewportCenter.y - scale * contentCenter.y,
    })
  }

  #baseScreenMatrix(graphic: SVGSVGElement) {
    const matrix = this.#screenMatrix(graphic)
    const viewport = this.#viewport(graphic)
    const a = matrix.a / viewport.scale
    const b = matrix.b / viewport.scale
    const c = matrix.c / viewport.scale
    const d = matrix.d / viewport.scale
    return {
      a, b, c, d,
      e: matrix.e - a * viewport.x - c * viewport.y,
      f: matrix.f - b * viewport.x - d * viewport.y,
    }
  }

  #resetViewports() {
    ;[...this.#navigatedGraphics].forEach(graphic => {
      this.#setViewport(graphic, {scale: 1, x: 0, y: 0})
    })
    this.#navigatedGraphics.clear()
    this.#viewportState = new WeakMap()
    this.#spaceDown = false
    this.#removeMarkerClass(document.body, "◆graphic-pan-ready")
    this.#removeMarkerClass(document.body, "◆graphic-panning")
  }

  #screenMatrix(graphic: SVGSVGElement): Matrix {
    try {
      const matrix = graphic.getScreenCTM?.()
      if(matrix && [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) {
        return {a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f}
      }
    }
    catch {
      // Detached/test SVGs may not expose a usable screen transform.
    }
    const rect = graphic.getBoundingClientRect()
    const viewBox = graphicViewBox(graphic)
    const viewport = this.#viewport(graphic)
    const applyViewport = (matrix: Matrix): Matrix => ({
      a: matrix.a * viewport.scale,
      b: matrix.b * viewport.scale,
      c: matrix.c * viewport.scale,
      d: matrix.d * viewport.scale,
      e: matrix.a * viewport.x + matrix.c * viewport.y + matrix.e,
      f: matrix.b * viewport.x + matrix.d * viewport.y + matrix.f,
    })
    if(!rect.width || !rect.height) return applyViewport({
      a: 1, b: 0, c: 0, d: 1, e: rect.left - viewBox.x, f: rect.top - viewBox.y,
    })
    const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height)
    const offsetX = (rect.width - viewBox.width * scale) / 2
    const offsetY = (rect.height - viewBox.height * scale) / 2
    return applyViewport({
      a: scale, b: 0, c: 0, d: scale,
      e: rect.left + offsetX - viewBox.x * scale,
      f: rect.top + offsetY - viewBox.y * scale,
    })
  }

  #moveShape(shape: Element, dx: number, dy: number, interaction?: Interaction) {
    const bounds = interaction?.bounds ?? shapeBounds(shape)
    const points = interaction?.points ?? shapePoints(shape)
    setShapeBounds(shape, {...bounds, x: bounds.x + dx, y: bounds.y + dy}, bounds, points)
    setRotation(shape, interaction?.rotation ?? rotationOf(shape))
  }

  #arrange(operation: GraphicArrangeOperation) {
    const shapes = this.selectedShapes
    const parent = shapes[0]?.parentElement
    if(!parent || shapes.some(shape => shape.parentElement !== parent)) return
    const align = operation.startsWith("align-")
    const distribute = operation.startsWith("distribute-")
    if((align && shapes.length < 2) || (distribute && shapes.length < 3) || !shapes.length) return

    const attached = this.#captureAttachedConnectors(this.#capturedGraphic(), shapes)
    this.editor.doc.stopCapturing()
    if(align) {
      const frame = unionBounds(shapes.map(shape => visualBounds(shape)))
      shapes.forEach(shape => {
        const bounds = visualBounds(shape)
        const dx = operation === "align-left" ? frame.x - bounds.x
          : operation === "align-center" ? frame.x + frame.width / 2 - (bounds.x + bounds.width / 2)
            : operation === "align-right" ? frame.x + frame.width - (bounds.x + bounds.width)
              : 0
        const dy = operation === "align-top" ? frame.y - bounds.y
          : operation === "align-middle" ? frame.y + frame.height / 2 - (bounds.y + bounds.height / 2)
            : operation === "align-bottom" ? frame.y + frame.height - (bounds.y + bounds.height)
              : 0
        this.#moveShape(shape, dx, dy)
      })
    }
    else if(distribute) {
      const horizontal = operation === "distribute-horizontal"
      const sorted = [...shapes].sort((left, right) => {
        const a = visualBounds(left)
        const b = visualBounds(right)
        return horizontal ? a.x - b.x : a.y - b.y
      })
      const bounds = sorted.map(shape => visualBounds(shape))
      const first = bounds[0]
      const last = bounds.at(-1)!
      const start = horizontal ? first.x : first.y
      const end = horizontal ? last.x + last.width : last.y + last.height
      const occupied = bounds.reduce((sum, current) => sum + (horizontal ? current.width : current.height), 0)
      const gap = (end - start - occupied) / (sorted.length - 1)
      let cursor = start
      sorted.forEach((shape, index) => {
        const current = bounds[index]
        if(index > 0 && index < sorted.length - 1) {
          this.#moveShape(shape, horizontal ? cursor - current.x : 0, horizontal ? 0 : cursor - current.y)
        }
        cursor += (horizontal ? current.width : current.height) + gap
      })
    }
    else {
      const selected = new Set(shapes)
      const ordered = Array.from(parent.children).filter((element): element is SVGGraphicsElement => selected.has(element as SVGGraphicsElement))
      if(operation === "bring-front") parent.append(...ordered)
      else if(operation === "send-back") parent.prepend(...ordered)
      else if(operation === "bring-forward") [...ordered].reverse().forEach(shape => {
        let next = shape.nextElementSibling
        while(next && selected.has(next as SVGGraphicsElement)) next = next.nextElementSibling
        if(next) parent.insertBefore(next, shape)
      })
      else if(operation === "send-backward") ordered.forEach(shape => {
        let previous = shape.previousElementSibling
        while(previous && selected.has(previous as SVGGraphicsElement)) previous = previous.previousElementSibling
        if(previous) parent.insertBefore(shape, previous)
      })
    }
    this.#applyAttachedConnectors(attached)
    this.editor.doc.stopCapturing()
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #manageLayer(operation: GraphicLayerOperation, index: number) {
    const graphic = this.#capturedGraphic()
    const shape = graphic ? graphicShapeRoots(graphic)[index] : null
    if(!graphic || !shape) return
    if(operation === "select") {
      if(this.#isLocked(shape) || shape.getAttribute("visibility") === "hidden") return
      this.#selectShape(shape)
    }
    else if(operation === "toggle-lock") {
      if(this.#isLocked(shape)) {
        this.#removeMarkerClass(shape, "◆graphic-shape-locked")
        this.#lockedShapes.delete(shape)
      }
      else {
        shape.classList.add("◆", "◆graphic-shape-locked")
        this.#lockedShapes.add(shape)
        if(this.#selectedShapes.has(shape)) {
          const remaining = this.selectedShapes.filter(selected => selected !== shape)
          this.#setShapeSelection(remaining)
        }
      }
    }
    else if(operation === "toggle-visibility") {
      this.editor.doc.stopCapturing()
      if(shape.getAttribute("visibility") === "hidden") shape.removeAttribute("visibility")
      else shape.setAttribute("visibility", "hidden")
      this.editor.doc.stopCapturing()
      if(shape.getAttribute("visibility") === "hidden" && this.#selectedShapes.has(shape)) {
        const remaining = this.selectedShapes.filter(selected => selected !== shape)
        this.#setShapeSelection(remaining)
      }
    }
    else {
      const parent = shape.parentElement
      if(!parent) return
      const siblings = graphicShapeRoots(graphic).filter(candidate => candidate.parentElement === parent)
      const current = siblings.indexOf(shape)
      if(current < 0) return
      const previous = siblings[current - 1]
      const next = siblings[current + 1]
      const first = siblings[0]
      const last = siblings.at(-1)
      this.editor.doc.stopCapturing()
      if(operation === "move-up" && next) parent.insertBefore(shape, next.nextSibling)
      else if(operation === "move-down" && previous) parent.insertBefore(shape, previous)
      else if(operation === "bring-front" && last && last !== shape) parent.insertBefore(shape, last.nextSibling)
      else if(operation === "send-back" && first && first !== shape) parent.insertBefore(shape, first)
      this.editor.doc.stopCapturing()
    }
    this.#refresh()
    this.editor.postSelectionPath()
  }

  #clientPoint(graphic: SVGSVGElement, x: number, y: number) {
    try {
      const matrix = graphic.getScreenCTM?.()?.inverse()
      if(matrix && typeof DOMPoint === "function") {
        const point = new DOMPoint(x, y).matrixTransform(matrix)
        if(Number.isFinite(point.x) && Number.isFinite(point.y)) return {x: point.x, y: point.y}
      }
    }
    catch {
      // Detached/test SVGs may not expose an invertible screen transform.
    }
    const matrix = this.#screenMatrix(graphic)
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c
    if(Math.abs(determinant) > 0.000001) {
      return {
        x: (matrix.d * (x - matrix.e) - matrix.c * (y - matrix.f)) / determinant,
        y: (-matrix.b * (x - matrix.e) + matrix.a * (y - matrix.f)) / determinant,
      }
    }
    return {
      x,
      y,
    }
  }

  #selectShape(shape: SVGGraphicsElement) {
    if(this.#isLocked(shape) || shape.getAttribute("visibility") === "hidden") return
    this.#setShapeSelection([shape], shape)
  }

  #toggleShapeSelection(shape: SVGGraphicsElement) {
    if(this.#isLocked(shape) || shape.getAttribute("visibility") === "hidden") return
    const current = this.selectedShapes
    if(this.#selectedShapes.has(shape)) {
      this.#removeMarkerClass(shape, "◆graphic-shape-selected")
      this.#selectedShapes.delete(shape)
      if(this.#primaryShape === shape) this.#primaryShape = this.selectedShapes.at(-1) ?? null
      return
    }
    if(current.length && current.some(selected => selected.parentElement !== shape.parentElement)) {
      this.#selectShape(shape)
      return
    }
    this.#selectedShapes.add(shape)
    this.#primaryShape = shape
    shape.classList.add("◆", "◆graphic-shape-selected")
  }

  #setShapeSelection(shapes: SVGGraphicsElement[], primary = shapes.at(-1) ?? null) {
    const next = new Set(shapes.filter(shape => shape.isConnected
      && !this.#isLocked(shape)
      && shape.getAttribute("visibility") !== "hidden"))
    this.#selectedShapes.forEach(shape => {
      if(!next.has(shape)) this.#removeMarkerClass(shape, "◆graphic-shape-selected")
    })
    next.forEach(shape => shape.classList.add("◆", "◆graphic-shape-selected"))
    this.#selectedShapes = next
    this.#primaryShape = primary && next.has(primary) ? primary : next.values().next().value ?? null
  }

  #clearShapeSelection() {
    this.#closeLabelEditor(false, false)
    if(this.#connector) {
      this.#cleanupConnector(this.#connector)
      this.#connector = null
    }
    if(this.#interaction) {
      if(this.#frame !== null) cancelAnimationFrame(this.#frame)
      this.#frame = null
      this.#cleanupInteraction(this.#interaction)
      this.#interaction = null
    }
    document.querySelectorAll(".◆graphic-shape-selected").forEach(element => {
      this.#removeMarkerClass(element, "◆graphic-shape-selected")
    })
    this.#selectedShapes.clear()
    this.#primaryShape = null
    if(this.#overlay) this.#overlay.hidden = true
  }

  #isLocked(shape: Element) {
    return shape.classList.contains("◆graphic-shape-locked")
  }

  #pruneLocks() {
    this.#lockedShapes.forEach(shape => {
      if(!shape.isConnected) {
        this.#removeMarkerClass(shape, "◆graphic-shape-locked")
        this.#lockedShapes.delete(shape)
      }
    })
  }

  #clearLocks() {
    this.#lockedShapes.forEach(shape => this.#removeMarkerClass(shape, "◆graphic-shape-locked"))
    document.querySelectorAll(".◆graphic-shape-locked").forEach(shape => {
      this.#removeMarkerClass(shape, "◆graphic-shape-locked")
    })
    this.#lockedShapes.clear()
  }

  #scheduleRefresh = () => {
    if(this.#refreshQueued) return
    this.#refreshQueued = true
    requestAnimationFrame(() => {
      this.#refreshQueued = false
      this.#refresh()
    })
  }

  #refresh() {
    this.#syncCanvasPresentation()
    this.#positionLabelEditor()
    if(this.#connector?.active) this.#updateConnectorPreview(this.#connector)
    const interaction = this.#interaction
    const marquee = this.#marquee
    const graphic = this.#capturedGraphic()
    const shapes = interaction?.active
      ? interaction.items.flatMap(item => item.preview ? [item.preview] : [])
      : this.selectedShapes
    if(!shapes.length) {
      if(marquee?.active) this.#setMarquee(boundsForPoints([marquee.start, marquee.latest]), marquee.graphic)
      else if(this.#overlay) this.#overlay.hidden = true
      return
    }
    const overlay = this.#overlay ?? this.#createOverlay()
    const owner = graphic ?? graphicContainerForNode(this.#primaryShape)
    if(!owner) {
      overlay.hidden = true
      return
    }
    overlay.hidden = false
    if(interaction?.active) {
      interaction.matrix = this.#screenMatrix(owner)
      if(interaction.previewRoot) this.#positionPreviewRoot(interaction.previewRoot, owner)
    }
    this.#updateOverlaySelection(shapes, owner, interaction?.active ? interaction.matrix : this.#screenMatrix(owner), interaction ?? undefined)
    if(marquee?.active) this.#setMarquee(boundsForPoints([marquee.start, marquee.latest]), marquee.graphic)
  }

  #createOverlay() {
    const overlay = document.createElement("div")
    overlay.classList.add("◆", "◆editor-only", "◆graphic-overlay")
    overlay.contentEditable = "false"
    overlay.setAttribute("part", "graphic-overlay")
    overlay.hidden = true
    const outline = document.createElementNS(SVG_NAMESPACE, "svg")
    outline.classList.add("◆", "◆editor-only", "◆graphic-outline")
    outline.setAttribute("part", "graphic-outline")
    outline.setAttribute("aria-hidden", "true")
    const polygon = document.createElementNS(SVG_NAMESPACE, "polygon")
    polygon.classList.add("◆", "◆editor-only", "◆graphic-selection-outline")
    polygon.setAttribute("part", "graphic-selection-outline")
    const individualOutlines = document.createElementNS(SVG_NAMESPACE, "g")
    individualOutlines.classList.add("◆", "◆editor-only", "◆graphic-individual-outlines")
    individualOutlines.setAttribute("part", "graphic-individual-outlines")
    const marquee = document.createElementNS(SVG_NAMESPACE, "rect")
    marquee.classList.add("◆", "◆editor-only", "◆graphic-marquee")
    marquee.setAttribute("part", "graphic-marquee")
    marquee.setAttribute("display", "none")
    marquee.setAttribute("hidden", "")
    const portTarget = document.createElementNS(SVG_NAMESPACE, "circle")
    portTarget.classList.add("◆", "◆editor-only", "◆graphic-port-target")
    portTarget.setAttribute("part", "graphic-port-target")
    portTarget.setAttribute("r", "7")
    portTarget.setAttribute("display", "none")
    portTarget.setAttribute("hidden", "")
    const stem = document.createElementNS(SVG_NAMESPACE, "line")
    stem.classList.add("◆", "◆editor-only", "◆graphic-rotation-stem")
    stem.setAttribute("part", "graphic-rotation-stem")
    const guideX = document.createElementNS(SVG_NAMESPACE, "line")
    guideX.classList.add("◆", "◆editor-only", "◆graphic-guide")
    guideX.setAttribute("part", "graphic-guide graphic-guide-x")
    guideX.dataset.axis = "x"
    guideX.setAttribute("display", "none")
    guideX.setAttribute("hidden", "")
    const guideY = document.createElementNS(SVG_NAMESPACE, "line")
    guideY.classList.add("◆", "◆editor-only", "◆graphic-guide")
    guideY.setAttribute("part", "graphic-guide graphic-guide-y")
    guideY.dataset.axis = "y"
    guideY.setAttribute("display", "none")
    guideY.setAttribute("hidden", "")
    outline.append(guideX, guideY, individualOutlines, polygon, stem, marquee, portTarget)
    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(direction => this.#createHandle(`resize-${direction}`, `Resize ${direction}`, `graphic-resize graphic-resize-${direction}`))
    overlay.append(
      outline,
      ...handles,
      this.#createHandle("rotate", "Rotate shape", "graphic-rotate"),
      Object.assign(document.createElement("div"), {className: "◆graphic-specific-handles"}),
      Object.assign(document.createElement("div"), {className: "◆graphic-ports"}),
    )
    this.editor.addAppendix(overlay)
    this.#overlay = overlay
    return overlay
  }

  #createHandle(name: string, label: string, part: string) {
    const handle = document.createElement("button")
    handle.type = "button"
    handle.classList.add("◆", "◆editor-only", "◆graphic-handle")
    handle.dataset.graphicHandle = name
    handle.setAttribute("part", `graphic-handle ${part}`)
    handle.setAttribute("aria-label", label)
    handle.title = label
    handle.tabIndex = -1
    return handle
  }

  #createPort(direction: PortDirection) {
    const names: Record<PortDirection, string> = {n: "top", e: "right", s: "bottom", w: "left"}
    const port = document.createElement("button")
    port.type = "button"
    port.classList.add("◆", "◆editor-only", "◆graphic-port")
    port.dataset.graphicPort = direction
    port.setAttribute("part", `graphic-port graphic-port-${direction}`)
    port.setAttribute("aria-label", `Connect from ${names[direction]}`)
    port.title = `Connect from ${names[direction]}`
    port.tabIndex = -1
    return port
  }

  #updateOverlaySelection(shapes: Element[], graphic: SVGSVGElement, matrix: Matrix, interaction?: Interaction) {
    const overlay = this.#overlay ?? this.#createOverlay()
    const outline = overlay.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
    const stem = overlay.querySelector<SVGLineElement>(".◆graphic-rotation-stem")!
    const individualOutlines = overlay.querySelector<SVGGElement>(".◆graphic-individual-outlines")!
    const multi = shapes.length > 1
    const shape = shapes[0]
    const bounds = multi
      ? interaction?.frameBounds ?? unionBounds(shapes.map(current => visualBounds(current)))
      : shapeBounds(shape)
    const rotation = multi ? interaction?.frameRotation ?? 0 : rotationOf(shape)
    const center = {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}
    const toClient = (point: Point) => applyMatrix(matrix, rotateAround(point, center, rotation))
    const corners = {
      nw: toClient({x: bounds.x, y: bounds.y}),
      ne: toClient({x: bounds.x + bounds.width, y: bounds.y}),
      se: toClient({x: bounds.x + bounds.width, y: bounds.y + bounds.height}),
      sw: toClient({x: bounds.x, y: bounds.y + bounds.height}),
    }
    outline.setAttribute("points", [corners.nw, corners.ne, corners.se, corners.sw].map(point => `${cleanNumber(point.x)},${cleanNumber(point.y)}`).join(" "))
    const positions: Record<string, Point> = {
      nw: corners.nw,
      n: midpoint(corners.nw, corners.ne),
      ne: corners.ne,
      e: midpoint(corners.ne, corners.se),
      se: corners.se,
      s: midpoint(corners.se, corners.sw),
      sw: corners.sw,
      w: midpoint(corners.sw, corners.nw),
    }
    while(individualOutlines.children.length < (multi ? shapes.length : 0)) {
      const itemOutline = document.createElementNS(SVG_NAMESPACE, "polygon")
      itemOutline.classList.add("◆", "◆editor-only", "◆graphic-individual-outline")
      itemOutline.setAttribute("part", "graphic-individual-outline")
      individualOutlines.append(itemOutline)
    }
    while(individualOutlines.children.length > (multi ? shapes.length : 0)) individualOutlines.lastElementChild?.remove()
    if(multi) shapes.forEach((current, index) => {
      const itemBounds = shapeBounds(current)
      const itemCenter = {
        x: itemBounds.x + itemBounds.width / 2,
        y: itemBounds.y + itemBounds.height / 2,
      }
      const itemRotation = rotationOf(current)
      const points = [
        {x: itemBounds.x, y: itemBounds.y},
        {x: itemBounds.x + itemBounds.width, y: itemBounds.y},
        {x: itemBounds.x + itemBounds.width, y: itemBounds.y + itemBounds.height},
        {x: itemBounds.x, y: itemBounds.y + itemBounds.height},
      ].map(point => applyMatrix(matrix, rotateAround(point, itemCenter, itemRotation)))
      individualOutlines.children[index].setAttribute(
        "points",
        points.map(point => `${cleanNumber(point.x)},${cleanNumber(point.y)}`).join(" "),
      )
    })
    const line = {x: corners.ne.x - corners.nw.x, y: corners.ne.y - corners.nw.y}
    const length = Math.max(0.0001, Math.hypot(line.x, line.y))
    const top = positions.n
    const rotate = {x: top.x + line.y / length * 24, y: top.y - line.x / length * 24}
    const type = multi ? null : graphicShapeType(shape)
    const endpointShape = type === "line" || type === "connector"
    overlay.dataset.shape = multi ? "multiple" : type ?? ""
    overlay.querySelectorAll<HTMLButtonElement>('[data-graphic-handle^="resize-"]').forEach(handle => {
      handle.hidden = !multi && endpointShape
      const direction = handle.dataset.graphicHandle!.slice("resize-".length)
      this.#positionHandle(handle, positions[direction])
    })
    const rotateHandle = overlay.querySelector<HTMLButtonElement>('[data-graphic-handle="rotate"]')!
    rotateHandle.hidden = !multi && endpointShape
    this.#positionHandle(rotateHandle, rotate)
    stem.toggleAttribute("hidden", !multi && endpointShape)
    stem.setAttribute("x1", cleanNumber(top.x))
    stem.setAttribute("y1", cleanNumber(top.y))
    stem.setAttribute("x2", cleanNumber(rotate.x))
    stem.setAttribute("y2", cleanNumber(rotate.y))
    this.#ensureSpecificHandles(overlay, multi ? null : shape)
    if(!multi) this.#positionSpecificHandles(overlay, shape, toClient)
    this.#updatePorts(overlay, multi ? null : shape, matrix)
    overlay.hidden = false
    void graphic
  }

  #positionHandle(handle: HTMLElement, point?: Point) {
    if(!point) return
    handle.style.left = `${point.x}px`
    handle.style.top = `${point.y}px`
  }

  #ensureSpecificHandles(overlay: HTMLElement, shape: Element | null) {
    const container = overlay.querySelector<HTMLElement>(".◆graphic-specific-handles")!
    const type = graphicShapeType(shape)
    const signature = shape && isPolygonShape(shape) ? `${type}:${parsePoints(shapeGeometry(shape)).length}` : type ?? ""
    if(container.dataset.signature === signature) return
    container.dataset.signature = signature
    container.replaceChildren()
    if(!shape) return
    if(type === "rectangle") {
      container.append(this.#createHandle("roundness", "Adjust corner radius", "graphic-affordance graphic-affordance-roundness"))
    }
    else if(type === "ellipse") {
      container.append(
        this.#createHandle("radius-x", "Adjust horizontal radius", "graphic-affordance graphic-affordance-radius-x"),
        this.#createHandle("radius-y", "Adjust vertical radius", "graphic-affordance graphic-affordance-radius-y"),
      )
    }
    else if(type === "line") {
      container.append(
        this.#createHandle("line-start", "Move line start", "graphic-affordance graphic-affordance-line-start"),
        this.#createHandle("line-end", "Move line end", "graphic-affordance graphic-affordance-line-end"),
      )
    }
    else if(type === "connector") {
      container.append(
        this.#createHandle("connector-start", "Reconnect start", "graphic-affordance graphic-affordance-connector-start"),
        this.#createHandle("connector-end", "Reconnect end", "graphic-affordance graphic-affordance-connector-end"),
      )
    }
    else if(isPolygonShape(shape)) {
      container.append(...parsePoints(shapeGeometry(shape)).map((_, index) => this.#createHandle(
        `vertex-${index}`,
        `Move vertex ${index + 1}`,
        "graphic-affordance graphic-affordance-vertex",
      )))
    }
  }

  #positionSpecificHandles(overlay: HTMLElement, shape: Element, toClient: (point: Point) => Point) {
    const bounds = shapeBounds(shape)
    const type = graphicShapeType(shape)
    const geometry = shapeGeometry(shape)
    const position = (name: string, point: Point) => {
      const handle = overlay.querySelector<HTMLElement>(`[data-graphic-handle="${name}"]`)
      if(handle) this.#positionHandle(handle, toClient(point))
    }
    if(type === "rectangle") position("roundness", {x: bounds.x + attributeNumber(geometry, "rx"), y: bounds.y})
    else if(type === "ellipse") {
      const center = shapeCenter(shape)
      position("radius-x", {x: bounds.x + bounds.width, y: center.y})
      position("radius-y", {x: center.x, y: bounds.y + bounds.height})
    }
    else if(type === "line") {
      position("line-start", {x: attributeNumber(geometry, "x1"), y: attributeNumber(geometry, "y1")})
      position("line-end", {x: attributeNumber(geometry, "x2"), y: attributeNumber(geometry, "y2")})
    }
    else if(type === "connector") {
      const points = parsePoints(geometry)
      if(points[0]) position("connector-start", points[0])
      if(points.length > 1) position("connector-end", points.at(-1)!)
    }
    else if(isPolygonShape(shape)) parsePoints(geometry).forEach((point, index) => position(`vertex-${index}`, point))
  }

  #updatePorts(overlay: HTMLElement, shape: Element | null, matrix: Matrix) {
    const container = overlay.querySelector<HTMLElement>(".◆graphic-ports")!
    const type = graphicShapeType(shape)
    const visible = Boolean(shape && type !== "line" && type !== "connector")
    if(!visible) {
      container.replaceChildren()
      return
    }
    if(container.children.length !== 4) container.replaceChildren(...(["n", "e", "s", "w"] as const).map(port => this.#createPort(port)))
    const ports = shapePorts(shape!)
    const center = applyMatrix(matrix, shapeCenter(shape!))
    ;(["n", "e", "s", "w"] as const).forEach(direction => {
      const point = applyMatrix(matrix, ports[direction])
      const vector = {x: point.x - center.x, y: point.y - center.y}
      const length = Math.max(0.0001, Math.hypot(vector.x, vector.y))
      const handle = container.querySelector<HTMLElement>(`[data-graphic-port="${direction}"]`)!
      this.#positionHandle(handle, {
        x: point.x + vector.x / length * 14,
        y: point.y + vector.y / length * 14,
      })
    })
  }

  #setPortTarget(target: PortTarget | null | undefined) {
    const marker = this.#overlay?.querySelector<SVGCircleElement>(".◆graphic-port-target")
    if(!marker || !target) {
      marker?.setAttribute("display", "none")
      marker?.setAttribute("hidden", "")
      return
    }
    marker.setAttribute("cx", cleanNumber(target.client.x))
    marker.setAttribute("cy", cleanNumber(target.client.y))
    marker.removeAttribute("display")
    marker.removeAttribute("hidden")
  }

  #setGuides(guides: ActiveGuides, graphic?: SVGSVGElement, matrix?: Matrix) {
    const overlay = this.#overlay
    if(!overlay) return
    const viewBox = graphic ? graphicViewBox(graphic) : null
    const screenMatrix = matrix ?? (graphic ? this.#screenMatrix(graphic) : null)
    ;(["x", "y"] as const).forEach(axis => {
      const line = overlay.querySelector<SVGLineElement>(`.◆graphic-guide[data-axis="${axis}"]`)
      const guide = guides[axis]
      if(!line || !guide || !viewBox || !screenMatrix || !this.#options.guides) {
        line?.setAttribute("display", "none")
        line?.setAttribute("hidden", "")
        return
      }
      const start = axis === "x"
        ? applyMatrix(screenMatrix, {x: guide.value, y: viewBox.y})
        : applyMatrix(screenMatrix, {x: viewBox.x, y: guide.value})
      const end = axis === "x"
        ? applyMatrix(screenMatrix, {x: guide.value, y: viewBox.y + viewBox.height})
        : applyMatrix(screenMatrix, {x: viewBox.x + viewBox.width, y: guide.value})
      line.setAttribute("x1", cleanNumber(start.x))
      line.setAttribute("y1", cleanNumber(start.y))
      line.setAttribute("x2", cleanNumber(end.x))
      line.setAttribute("y2", cleanNumber(end.y))
      line.dataset.kind = guide.kind
      line.setAttribute("part", `graphic-guide graphic-guide-${axis} graphic-guide-${guide.kind}`)
      line.removeAttribute("display")
      line.removeAttribute("hidden")
    })
  }

  #syncCanvasPresentation() {
    const captured = this.#capturedGraphic()
    if(this.#presentedGraphic !== captured) this.#clearCanvasPresentation()
    if(!captured) return
    this.#presentedGraphic = captured
    if(this.#options.grid) captured.classList.add("◆", "◆graphic-grid-visible")
    else this.#removeMarkerClass(captured, "◆graphic-grid-visible")
  }

  #clearCanvasPresentation() {
    if(this.#presentedGraphic) this.#removeMarkerClass(this.#presentedGraphic, "◆graphic-grid-visible")
    this.#presentedGraphic = null
  }

  #removeMarkerClass(element: Element, marker: string) {
    element.classList.remove(marker)
    if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) element.classList.remove("◆")
    if(!element.classList.length) element.removeAttribute("class")
  }

  #removeMarkerClasses(element: Element, descendants = false) {
    const elements = descendants ? [element, ...Array.from(element.querySelectorAll("*"))] : [element]
    elements.forEach(current => {
      Array.from(current.classList).filter(name => name.startsWith("◆")).forEach(name => current.classList.remove(name))
      if(!current.classList.length) current.removeAttribute("class")
    })
  }

  #setLabel(shape: SVGGraphicsElement, value: string) {
    const type = graphicShapeType(shape)
    if(!type || type === "line" || type === "connector") return shape
    let root = shape
    if(shape.localName !== "g") {
      if(!value || !shape.parentNode) return shape
      const group = document.createElementNS(SVG_NAMESPACE, "g")
      const transform = shape.getAttribute("transform")
      if(transform) {
        group.setAttribute("transform", transform)
        shape.removeAttribute("transform")
      }
      const opacity = shape.getAttribute("opacity")
      if(opacity) {
        group.setAttribute("opacity", opacity)
        shape.removeAttribute("opacity")
      }
      shape.parentNode.insertBefore(group, shape)
      group.append(shape)
      this.#removeMarkerClass(shape, "◆graphic-shape-selected")
      root = group
    }
    let text = shapeText(root)
    if(!value) {
      text?.remove()
      return root
    }
    if(!text) {
      text = document.createElementNS(SVG_NAMESPACE, "text")
      text.setAttribute("text-anchor", "middle")
      text.setAttribute("dominant-baseline", "middle")
      text.setAttribute("pointer-events", "none")
      text.setAttribute("font-family", "system-ui, sans-serif")
      text.setAttribute("font-size", "48")
      text.setAttribute("fill", "#0f172a")
      root.append(text)
    }
    const lines = value.replace(/\r\n?/g, "\n").split("\n")
    if(lines.length === 1) text.textContent = lines[0]
    else text.replaceChildren(...lines.map(line => {
      const span = document.createElementNS(SVG_NAMESPACE, "tspan")
      span.textContent = line
      return span
    }))
    syncShapeText(root)
    return root
  }

  #parameters(shape: Element) {
    const bounds = shapeBounds(shape)
    const type = graphicShapeType(shape)
    const geometry = shapeGeometry(shape)
    const text = shapeText(shape)
    const points = shapePoints(shape)
    return {
      x: cleanNumber(bounds.x),
      y: cleanNumber(bounds.y),
      width: cleanNumber(bounds.width),
      height: cleanNumber(bounds.height),
      rotation: cleanNumber(rotationOf(shape)),
      fill: geometry.getAttribute("fill") ?? shape.getAttribute("fill") ?? (type === "line" || type === "connector" ? "none" : "#ffffff"),
      stroke: geometry.getAttribute("stroke") ?? shape.getAttribute("stroke") ?? "#334155",
      "stroke-width": geometry.getAttribute("stroke-width") ?? shape.getAttribute("stroke-width") ?? (type === "line" || type === "connector" ? "6" : "4"),
      opacity: shape.getAttribute("opacity") ?? geometry.getAttribute("opacity") ?? "1",
      ...(type !== "line" && type !== "connector" ? {
        label: shapeLabel(shape),
        "text-color": text?.getAttribute("fill") ?? "#0f172a",
        "font-size": text?.getAttribute("font-size") ?? "48",
      } : {}),
      ...(type === "rectangle" ? {"corner-radius": geometry.getAttribute("rx") ?? "0"} : {}),
      ...(type === "hexagon" ? {inset: cleanNumber(Math.max(0, points[0]?.x - bounds.x))} : {}),
      ...(type === "star" ? {"inner-radius": cleanNumber(starInnerRadius(points))} : {}),
      ...(type === "arrow" ? {
        "head-size": cleanNumber(bounds.width ? (bounds.x + bounds.width - (points[1]?.x ?? bounds.x)) / bounds.width * 100 : 36),
        "tail-width": cleanNumber(bounds.height ? Math.abs((points[6]?.y ?? bounds.y) - (points[0]?.y ?? bounds.y)) / bounds.height * 100 : 42),
      } : {}),
      ...(type === "connector" ? {
        routing: connectorRouting(shape),
        "start-arrow": String(shape.hasAttribute("marker-start")),
        "end-arrow": String(shape.hasAttribute("marker-end")),
      } : {}),
    }
  }

  #setParameter(shape: SVGGraphicsElement, name: string, value: string): SVGGraphicsElement {
    if(name === "label") return this.#setLabel(shape, value)
    const geometry = shapeGeometry(shape)
    const text = shapeText(shape)
    if(name === "text-color") {
      if(text && value) text.setAttribute("fill", value)
      else if(text) text.removeAttribute("fill")
      return shape
    }
    if(name === "routing" && graphicShapeType(shape) === "connector" && (value === "straight" || value === "orthogonal")) {
      const points = parsePoints(shape)
      if(points.length > 1) setConnectorEndpoints(shape, points[0], points.at(-1)!, value, connectorOrientation(points))
      return shape
    }
    if((name === "start-arrow" || name === "end-arrow") && graphicShapeType(shape) === "connector") {
      this.#setConnectorArrow(shape as SVGPolylineElement, name === "start-arrow" ? "start" : "end", value === "true")
      return shape
    }
    if(name === "fill" || name === "stroke") {
      if(value) geometry.setAttribute(name, value)
      else geometry.removeAttribute(name)
      return shape
    }
    const numeric = Number.parseFloat(value)
    if(!Number.isFinite(numeric)) return shape
    if(name === "stroke-width") geometry.setAttribute(name, cleanNumber(Math.max(0, numeric)))
    else if(name === "opacity") shape.setAttribute(name, cleanNumber(Math.min(1, Math.max(0, numeric))))
    else if(name === "font-size" && text) text.setAttribute(name, cleanNumber(Math.max(1, numeric)))
    else if(name === "rotation" && graphicShapeType(shape) !== "connector") setRotation(shape, numeric)
    else if(name === "corner-radius" && graphicShapeType(shape) === "rectangle") {
      geometry.setAttribute("rx", cleanNumber(Math.max(0, Math.min(shapeBounds(shape).height / 2, numeric))))
    }
    else if(name === "inset" && graphicShapeType(shape) === "hexagon") {
      setPoints(geometry, hexagonPoints(shapeBounds(shape), numeric))
    }
    else if(name === "inner-radius" && graphicShapeType(shape) === "star") {
      setPoints(geometry, starPoints(shapeBounds(shape), Math.min(0.9, Math.max(0.05, numeric / 100))))
    }
    else if((name === "head-size" || name === "tail-width") && graphicShapeType(shape) === "arrow") {
      const parameters = this.#parameters(shape)
      const head = name === "head-size" ? numeric : Number.parseFloat(parameters["head-size"] ?? "36")
      const tail = name === "tail-width" ? numeric : Number.parseFloat(parameters["tail-width"] ?? "42")
      setPoints(geometry, arrowPoints(shapeBounds(shape), head / 100, tail / 100))
    }
    else if(["x", "y", "width", "height"].includes(name)) {
      const bounds = shapeBounds(shape)
      const points = shapePoints(shape)
      const next = {...bounds, [name]: name === "width" || name === "height" ? Math.max(1, numeric) : numeric}
      const rotation = rotationOf(shape)
      setShapeBounds(shape, next, bounds, points)
      setRotation(shape, rotation)
    }
    syncShapeText(shape)
    return shape
  }

  #setConnectorArrow(connector: SVGPolylineElement, endpoint: ConnectorEndpoint, enabled: boolean) {
    const attribute = endpoint === "start" ? "marker-start" : "marker-end"
    if(!enabled) {
      const reference = connector.getAttribute(attribute)
      connector.removeAttribute(attribute)
      const id = reference?.match(/^url\(#(graphic-arrow-\d+)\)$/)?.[1]
      const graphic = graphicContainerForNode(connector)
      if(id && graphic) {
        const markerReference = `url(#${id})`
        const stillUsed = Array.from(graphic.querySelectorAll("[marker-start], [marker-end]")).some(element =>
          element.getAttribute("marker-start") === markerReference || element.getAttribute("marker-end") === markerReference,
        )
        if(!stillUsed) {
          const marker = Array.from(graphic.querySelectorAll("marker")).find(candidate => candidate.id === id)
          const definitions = marker?.parentElement
          marker?.remove()
          if(definitions?.localName === "defs" && !definitions.children.length) definitions.remove()
        }
      }
      return
    }
    const graphic = graphicContainerForNode(connector)
    if(!graphic) return
    const markerPath = "M 0 0 L 10 5 L 0 10 z"
    let marker = Array.from(graphic.querySelectorAll<SVGMarkerElement>("marker")).find(candidate =>
      candidate.id && candidate.querySelector("path")?.getAttribute("d") === markerPath,
    )
    if(!marker) {
      let index = 1
      while(document.getElementById(`graphic-arrow-${index}`)) index++
      marker = document.createElementNS(SVG_NAMESPACE, "marker")
      marker.id = `graphic-arrow-${index}`
      marker.setAttribute("viewBox", "0 0 10 10")
      marker.setAttribute("refX", "9")
      marker.setAttribute("refY", "5")
      marker.setAttribute("markerWidth", "6")
      marker.setAttribute("markerHeight", "6")
      marker.setAttribute("orient", "auto-start-reverse")
      const path = document.createElementNS(SVG_NAMESPACE, "path")
      path.setAttribute("d", markerPath)
      path.setAttribute("fill", "context-stroke")
      path.setAttribute("stroke", "none")
      marker.append(path)
      let definitions = Array.from(graphic.children).find(child => child.localName === "defs") as SVGDefsElement | undefined
      if(!definitions) {
        definitions = document.createElementNS(SVG_NAMESPACE, "defs")
        graphic.prepend(definitions)
      }
      definitions.append(marker)
    }
    connector.setAttribute(attribute, `url(#${marker.id})`)
  }
}
