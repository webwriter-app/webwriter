import {graphicShapePresets, legacyArrowPresets, legacyCalloutPresets, legacyChordPreset, legacyCloudPreset, legacySpeechBubblePresets, isConnectedCalloutType, connectedCalloutTypes, speechBubblePrefix, type GraphicShapePreset} from "./graphic-shape-presets"

export type GraphicPresetType = keyof typeof graphicShapePresets
type Bounds = {x: number, y: number, width: number, height: number}
type Point = {x: number, y: number}
export type GraphicPresetState = {
  type: GraphicPresetType
  definition: GraphicShapePreset
  bounds: Bounds
  values: number[]
}

const numberPattern = /[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g

// These open detail contours run opposite to the silhouette. SVG closes
// them for filling, so reverse their direction to keep the overlap solid.
const reversedDetailPresets = new Set<GraphicPresetType>([
  "cylinder", "cube", "folded-corner", "ribbon-up", "ribbon-down",
  "magnetic-disk", "direct-access-storage", "sequential-access-storage",
])

function presetDrawing(type: GraphicPresetType, values: number[]) {
  const path = graphicShapePresets[type].draw(values)
  if(!reversedDetailPresets.has(type)) return path
  return path.split(/(?=M)/).map(subpath => {
    if(subpath.includes("Z")) return subpath.trim()
    const commands = Array.from(subpath.matchAll(/([MLQC])([^MLQCZ]+)/g), match => ({
      command: match[1], values: coordinates(match[2]),
    }))
    const end = commands.at(-1)!.values.slice(-2)
    const reversed = commands.slice(1).map((command, i) => {
      const start = commands[i].values.slice(-2)
      const controls = command.values.slice(0, -2)
      if(command.command === "C") controls.push(...controls.splice(0, 2))
      return `${command.command} ${[...controls, ...start].join(" ")}`
    }).reverse()
    return `M ${end.join(" ")} ${reversed.join(" ")}`
  }).join(" ")
}

export function graphicPresetFillRule(type: GraphicPresetType) {
  return ["frame", "donut", "prohibited"].includes(type) ? "evenodd" : "nonzero"
}

export const graphicPresetOptions = (Object.keys(graphicShapePresets) as GraphicPresetType[]).map(type => {
  const definition: GraphicShapePreset = graphicShapePresets[type]
  return {
    type, label: definition.label, category: definition.category, icon: "Shape",
    path: type === "text-box"
      ? "M 0 0 L 100 0 L 100 100 L 0 100 Z M 12 50 L 25 15 L 38 50 M 17 38 L 33 38 M 48 20 L 88 20 M 48 40 L 88 40 M 12 65 L 88 65 M 12 82 L 88 82"
      : presetDrawing(type, definition.adjustments.map(adjustment => adjustment.default)),
  }
})

export function isGraphicPresetType(type: string): type is GraphicPresetType {
  return Object.hasOwn(graphicShapePresets, type)
}

const defaults = (definition: GraphicShapePreset) => definition.adjustments.map(adjustment => adjustment.default)
function coordinates(path: string) { return Array.from(path.matchAll(numberPattern), match => Number(match[0])) }
const signature = (path: string) => path.replace(numberPattern, "#").replace(/[\s,]+/g, "")
const coordinateOrArcPattern = new RegExp(`A([^MLQCAZ]+)|${numberPattern.source}`, "g")

function scalePath(path: string, bounds: Bounds, precision = 1e6) {
  const clean = (value: number) => String(Math.round(value * precision) / precision)
  let index = 0
  return path.replace(coordinateOrArcPattern, (value, arc: string | undefined) => {
    if(arc) {
      const [rx, ry, rotation, large, sweep, x, y] = coordinates(arc)
      return `A ${clean(rx / 100 * bounds.width)} ${clean(ry / 100 * bounds.height)} ${rotation} ${large} ${sweep} ${clean(bounds.x + x / 100 * bounds.width)} ${clean(bounds.y + y / 100 * bounds.height)} `
    }
    const horizontal = index++ % 2 === 0
    return clean((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height))
  })
}

export function graphicPresetPath(type: GraphicPresetType, bounds: Bounds, values = defaults(graphicShapePresets[type])) {
  return scalePath(presetDrawing(type, values), bounds, type === "chord" ? 1e10 : 1e6)
}

export function writeGraphicPreset(element: Element, state: GraphicPresetState, bounds = state.bounds, values = state.values) {
  element.setAttribute("d", graphicPresetPath(state.type, bounds, values))
  element.setAttribute("fill-rule", graphicPresetFillRule(state.type))
}

type Template = {
  type: GraphicPresetType
  definition: GraphicShapePreset
  base: number[]
  deltas: number[][]
  draw: (values: number[]) => string
  upgrade?: (values: number[]) => number[]
}
let templates: Map<string, Template[]> | undefined

function getTemplates() {
  if(templates) return templates
  templates = new Map()
  for(const option of graphicPresetOptions) {
    const definition: GraphicShapePreset = graphicShapePresets[option.type]
    // Retain recognition of previously serialized paths. Geometry edits use
    // the current recipe without requiring private metadata in saved content.
    const drawings: Template["draw"][] = option.type === "pie"
      ? [([p]) => `M 50 50 L 100 ${p} C 100 78 78 100 50 100 C 22 100 0 78 0 50 C 0 22 22 0 50 0 L 50 50 Z`]
      : option.type === "chord" || isConnectedCalloutType(option.type) ? [] : [values => presetDrawing(option.type, values)]
    if(reversedDetailPresets.has(option.type)) drawings.push(definition.draw)
    if(option.type === "double-wave") {
      drawings.push(([d]) => `M 0 20 Q 25 ${20-d} 50 20 Q 75 ${20+d} 100 20 L 100 80 Q 75 ${80+d} 50 80 Q 25 ${80-d} 0 80 Z`)
    }
    if(option.type === "collate") {
      drawings.push(([p]) => `M 0 0 L 100 0 L 0 100 L 100 100 L ${p} 50 Z`)
    }
    if(option.type === "moon") {
      drawings.push(([d]) => `M ${75-d/2} 8 C 40 18 30 65 65 92 C 45 92 15 78 10 52 C 5 25 35 3 ${75-d/2} 8 Z`)
    }
    if(option.type === "prohibited") {
      const outer = definition.draw([0]).split(/(?=M)/)[0]
      drawings.push(([r]) => `${outer} M ${50-r*.7} ${50-r*.7} C ${50-r*1.5} ${50+r*.2} ${50-r*.2} ${50+r*1.5} ${50+r*.7} ${50+r*.7} Z M ${50+r*.7} ${50+r*.7-12} C ${50+r*1.5} ${50-r*.2} ${50+r*.2} ${50-r*1.5} ${50-r*.7+12} ${50-r*.7} Z`)
    }
    const legacy = option.type === "cloud" ? legacyCloudPreset : option.type === "chord" ? legacyChordPreset : legacyCalloutPresets[option.type] ?? legacyArrowPresets[option.type]
    const variants = [...drawings.map(draw => ({draw, definition, upgrade: undefined as Template["upgrade"]})),
      ...(legacy ? [{draw: legacy.definition.draw, definition: legacy.definition, upgrade: legacy.upgrade}] : []),
      ...(legacySpeechBubblePresets[option.type] ? [{draw:legacySpeechBubblePresets[option.type].definition.draw,definition:legacySpeechBubblePresets[option.type].definition,upgrade:legacySpeechBubblePresets[option.type].upgrade}] : [])]
    for(const {draw: originalDraw, definition, upgrade} of variants) {
      const normalizedIndex = definition.adjustments.findIndex(adjustment => adjustment.name === (definition as GraphicShapePreset).normalizedAdjustment)
      const draw = normalizedIndex < 0 ? originalDraw : (values: number[]) => originalDraw(values.map((value, i) => i === normalizedIndex ? definition.adjustments[i].default : value))
      const zero = definition.adjustments.map(() => 0)
      const path = draw(zero)
      const base = coordinates(path)
      const deltas = zero.map((_, index) => coordinates(draw(zero.map((_, i) => i === index ? 1 : 0)))
        .map((value, i) => value - base[i]))
      const key = signature(path)
      const candidates = templates.get(key) ?? []
      candidates.push({type: option.type, definition, base, deltas, draw, upgrade})
      templates.set(key, candidates)
    }
  }
  return templates
}

/** Fit the affine coordinates encoded by the actual path. Dependent columns
 * are omitted (for example, a horizontal adjustment has no vertical term).
 * The complete path is verified afterward, so unrelated paths are untouched. */
function fitAxis(template: Pick<Template,"base"|"deltas">, actual: number[], axis: number) {
  const columns = [actual.filter((_, i) => i % 2 === axis).map(() => 1),
    template.base.filter((_, i) => i % 2 === axis),
    ...template.deltas.map(delta => delta.filter((_, i) => i % 2 === axis))]
  const target = actual.filter((_, i) => i % 2 === axis)
  const orthogonal: number[][] = []
  const indices: number[] = []
  const triangular: number[][] = []
  const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0)
  columns.forEach((column, index) => {
    const residual = [...column]
    const coefficients = orthogonal.map(vector => {
      const coefficient = dot(vector, residual)
      vector.forEach((value, i) => residual[i] -= coefficient * value)
      return coefficient
    })
    const length = Math.hypot(...residual)
    if(length < 1e-8) return
    coefficients.push(length)
    triangular.push(coefficients)
    orthogonal.push(residual.map(value => value / length))
    indices.push(index)
  })
  if(!indices.includes(1)) return null
  const projected = orthogonal.map(vector => dot(vector, target))
  const result: Array<number | undefined> = columns.map(() => undefined)
  for(let i = indices.length - 1; i >= 0; i--) {
    let value = projected[i]
    for(let j = i + 1; j < indices.length; j++) value -= triangular[j][i] * result[indices[j]]!
    result[indices[i]] = value / triangular[i][i]
  }
  return result
}

const cache = new WeakMap<Element, {path: string, label: string | null, state: GraphicPresetState | null}>()

/** Native arc radii and center encode the frame, even for tiny or full slices.
 * The halfway endpoint distinguishes an empty sweep from a full revolution. */
function readPiePreset(path: string, actual: number[]): GraphicPresetState | null {
  if(signature(path) !== "M##L##A#######A#######Z" || !actual.every(Number.isFinite)) return null
  const [cx, cy, , , rx, ry, , , , middleX, middleY] = actual
  if(!(rx > 0 && ry > 0)) return null
  const bounds = {x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2}
  const sweep = 2 * Math.atan2(Math.max(0, -(middleX - cx) / rx), -(middleY - cy) / ry) * 180 / Math.PI
  const expected = coordinates(graphicPresetPath("pie", bounds, [sweep]))
  if(expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > .0001)) return null
  return {type: "pie", definition: graphicShapePresets.pie, bounds, values: [sweep]}
}

/** The first native arc spans at most 120 degrees, so its radii and
 * endpoints determine a stable ellipse even when the segment is a full circle. */
function readChordPreset(path: string, actual: number[]): GraphicPresetState | null {
  if(signature(path) !== "M##A#######A#######Z" || !actual.every(Number.isFinite)) return null
  const [sx, sy, rx, ry, , , , mx, my] = actual
  if(!(rx > 0 && ry > 0)) return null
  const dx = (sx - mx) / (2 * rx), dy = (sy - my) / (2 * ry)
  const distance = dx * dx + dy * dy
  if(distance <= 0 || distance > .750001) return null
  const factor = -Math.sqrt((1 - distance) / distance)
  const cx = (sx + mx) / 2 + factor * rx * dy
  const cy = (sy + my) / 2 - factor * ry * dx
  const bounds = {x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2}
  let start = (Math.atan2(-(sx - cx) / rx, -(sy - cy) / ry) * 180 / Math.PI + 360) % 360
  if(Math.min(start, 360 - start) < 1e-7) start = 0
  let sweep = 6 * Math.asin(Math.min(1, Math.sqrt(distance))) * 180 / Math.PI
  if(sweep > 360 - 1e-7) sweep = 360
  if(sweep < .5 - 1e-7 || sweep > 360) return null
  const expected = coordinates(graphicPresetPath("chord", bounds, [start, sweep]))
  if(expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > .0001)) return null
  return {type: "chord", definition: graphicShapePresets.chord, bounds, values: [start, Math.max(.5, sweep)]}
}

/** Read the fixed, untouched half of the bubble before validating the entire
 * generated contour. The tail never determines the body's design frame. */
function readSpeechBubblePreset(path:string,label:string|null): GraphicPresetState | null {
  const commands=[...path.matchAll(/([MLQCZ])([^MLQCZ]*)/g)]
  const types=[...connectedCalloutTypes].sort((a,b)=>Number(graphicShapePresets[b].label===label)-Number(graphicShapePresets[a].label===label))
  for(const type of types) for(let direction=0;direction<(type.startsWith("line-callout-") || type === "cloud-callout" ? 1 : 4);direction++) {
    const prefix=speechBubblePrefix(type,0,direction),count=[...prefix.matchAll(/[MLQCZ]/g)].length
    const source=commands.slice(0,count).map(command=>command[0]).join(" ")
    if(signature(source)!==signature(prefix)) continue
    const base=coordinates(prefix),changed=coordinates(speechBubblePrefix(type,1,direction))
    const template={base,deltas:[changed.map((value,i)=>value-base[i])]}
    const actual=coordinates(source),horizontal=fitAxis(template,actual,0),vertical=fitAxis(template,actual,1)
    if(!horizontal || !vertical || horizontal[1]!<=0 || vertical[1]!<=0) continue
    const axis=horizontal[2]===undefined ? vertical : horizontal
    const r=axis[2]===undefined ? 0 : axis[2]!/axis[1]!
    const definition=graphicShapePresets[type],adjustment=definition.adjustments[2]
    if(r<adjustment.min-1e-4 || r>adjustment.max+1e-4) continue
    const bounds={x:horizontal[0]!,y:vertical[0]!,width:horizontal[1]!*100,height:vertical[1]!*100}
    const numbers=coordinates(path)
    for(const command of commands.slice(count)) {
      if(command[1]!== (type === "cloud-callout" ? "M" : "L")) continue
      const [x,y]=coordinates(command[2]),ex=(x-bounds.x)/bounds.width*100+(type === "cloud-callout" ? 3 : 0),ey=(y-bounds.y)/bounds.height*100
      if(!Number.isFinite(ex) || !Number.isFinite(ey) || ex< -150-1e-4 || ex>250+1e-4 || ey< -150-1e-4 || ey>250+1e-4) continue
      const values=[ex,ey,Math.max(adjustment.min,Math.min(adjustment.max,r))]
      const expected=graphicPresetPath(type,bounds,values)
      if(signature(expected)!==signature(path)) continue
      const points=coordinates(expected)
      if(points.length===numbers.length && points.every((value,i)=>Math.abs(value-numbers[i])<.0001)) return {type,definition,bounds,values}
    }
  }
  return null
}

/** No private attributes or parallel document model: recognition and all
 * adjustments derive from the live SVG path, including after reload/undo. */
export function readGraphicPreset(element: Element | null): GraphicPresetState | null {
  if(element?.namespaceURI !== "http://www.w3.org/2000/svg" || element.localName !== "path") return null
  const path = element.getAttribute("d") ?? ""
  const label = element.getAttribute("aria-label")
  const previous = cache.get(element)
  if(previous?.path === path && previous.label === label) return previous.state
  const actual = coordinates(path)
  let state = readPiePreset(path, actual) ?? readChordPreset(path, actual) ?? readSpeechBubblePreset(path,label)
  const candidates = state ? [] : [...getTemplates().get(signature(path)) ?? []]
  // Accessible names disambiguate geometrically identical presets, but never
  // override the path validation or hold editing parameters.
  candidates.sort((a, b) => Number(b.definition.label === label) - Number(a.definition.label === label))
  for(const template of candidates) {
    const horizontal = fitAxis(template, actual, 0)
    const vertical = fitAxis(template, actual, 1)
    if(!horizontal || !vertical || horizontal[1]! <= 0 || vertical[1]! <= 0) continue
    const values = template.definition.adjustments.map((adjustment, i) => {
      const axis = horizontal[i + 2] !== undefined ? horizontal : vertical
      return axis[i + 2] === undefined ? adjustment.default : axis[i + 2]! / axis[1]!
    })
    if(values.some((value, i) => !Number.isFinite(value)
      || value < template.definition.adjustments[i].min - 1e-4
      || value > template.definition.adjustments[i].max + 1e-4)) continue
    if(template.type === "pie" && (values[0] < 5 - 1e-4 || values[0] > 75 + 1e-4)) continue
    const bounds = {x: horizontal[0]!, y: vertical[0]!, width: horizontal[1]! * 100, height: vertical[1]! * 100}
    const expected = coordinates(scalePath(template.draw(values), bounds))
    if(expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 0.0001)) continue
    state = {type: template.type, definition: graphicShapePresets[template.type], bounds,
      values: template.upgrade ? template.upgrade(values) : template.type === "pie" ? [270 - Math.atan2(values[0] - 50, 50) * 180 / Math.PI] : values}
    break
  }
  cache.set(element, {path, label, state})
  return state
}

export function graphicPresetHandles(state: GraphicPresetState) {
  return state.definition.adjustments.flatMap((adjustment, index) => {
    if(adjustment.hidden) return []
    if(state.definition.adjustments.some(other => other.pairedWith === adjustment.name)) return []
    const point = adjustment.point(state.values)
    return {
      name: `adjust-${adjustment.name}`, label: adjustment.pairedWith ? adjustment.label.replace(/ X$/, "") : adjustment.label, index,
      point: {x: state.bounds.x + point.x / 100 * state.bounds.width, y: state.bounds.y + point.y / 100 * state.bounds.height},
    }
  })
}

/** Unwrap one pointer sample against the preceding sweep, including the seam. */
export function graphicPresetAngle(bounds: Bounds, input: Point, previous: number) {
  const x = (input.x - bounds.x - bounds.width / 2) / (bounds.width / 2)
  const y = (input.y - bounds.y - bounds.height / 2) / (bounds.height / 2)
  // Native pointer coordinates can round a transformed center by a subpixel.
  if(!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 1e-4) return undefined
  let value = (Math.atan2(-x, -y) * 180 / Math.PI + 360) % 360
  value += Math.trunc((previous - value) / 360) * 360
  if(value - previous > 180) value -= 360
  else if(value - previous < -180) value += 360
  return value
}

export function adjustGraphicPreset(element: Element, state: GraphicPresetState, name: string, input: number | Point,
  mirror: {horizontal?: boolean, vertical?: boolean} = {}) {
  const index = state.definition.adjustments.findIndex(adjustment => `adjust-${adjustment.name}` === name)
  if(index < 0) return false
  const adjustment = state.definition.adjustments[index]
  if(state.type === "chord") {
    const [start, sweep] = state.values, end = start + sweep
    let value = typeof input === "number" ? input : graphicPresetAngle(state.bounds, input, index === 0 ? start : end)
    if(value === undefined || !Number.isFinite(value)) return false
    if(index === 0) {
      const next = Math.max(end - 360, Math.min(end - .5, value))
      writeGraphicPreset(element, state, state.bounds, [(next % 360 + 360) % 360, end - next])
    }
    else {
      if(typeof input !== "number") value -= start
      writeGraphicPreset(element, state, state.bounds, [start, Math.max(.5, Math.min(360, value))])
    }
    return true
  }
  const values = [...state.values]
  let value: number
  if(typeof input === "number") value = input
  else if(adjustment.axis === "angle") {
    const angle = graphicPresetAngle(state.bounds, input, state.values[index])
    if(angle === undefined) return false
    value = angle
  }
  else {
    const axis = adjustment.axis
    const origin = adjustment.point(values)[axis]
    values[index] += 1
    const slope = adjustment.point(values)[axis] - origin
    if(Math.abs(slope) < 1e-8) return false
    const size = axis === "x" ? state.bounds.width : state.bounds.height
    if(size <= 0) return false
    value = state.values[index] + ((input[axis] - state.bounds[axis]) / size * 100 - origin) / slope
  }
  if(!Number.isFinite(value)) return false
  values[index] = Math.max(adjustment.min, Math.min(adjustment.max, value))
  if(typeof input !== "number" && adjustment.pairedWith) {
    const pairedIndex = state.definition.adjustments.findIndex(other => other.name === adjustment.pairedWith)
    if(pairedIndex >= 0) {
      const paired = state.definition.adjustments[pairedIndex], axis = paired.axis === "y" ? "y" : "x"
      const origin = paired.point(state.values)[axis], sample = [...state.values]
      sample[pairedIndex] += 1
      const slope = paired.point(sample)[axis] - origin
      const size = axis === "x" ? state.bounds.width : state.bounds.height
      if(Math.abs(slope) > 1e-8 && size > 0) {
        const coordinate = state.values[pairedIndex] + ((input[axis] - state.bounds[axis]) / size * 100 - origin) / slope
        if(!Number.isFinite(coordinate)) return false
        values[pairedIndex] = Math.max(paired.min, Math.min(paired.max, coordinate))
      }
    }
  }
  if((adjustment.corner || adjustment.opposite) && (mirror.horizontal || mirror.vertical)) {
    const [vertical, horizontal] = adjustment.corner?.split("-") ?? []
    const delta = values[index] - state.values[index]
    state.definition.adjustments.forEach((other, i) => {
      if(i === index) return
      const [otherVertical, otherHorizontal] = other.corner?.split("-") ?? []
      const reflectedCorner = adjustment.corner && other.corner
        && (vertical === otherVertical || mirror.vertical) && (horizontal === otherHorizontal || mirror.horizontal)
      if(other.name === adjustment.opposite || reflectedCorner) {
        values[i] = Math.max(other.min, Math.min(other.max, state.values[i] + delta))
      }
    })
  }
  if(state.definition.adjustmentLimits) {
    const [min, max] = state.definition.adjustmentLimits(state.values, index)
    values[index] = Math.max(adjustment.min, min, Math.min(adjustment.max, max, values[index]))
  }
  writeGraphicPreset(element, state, state.bounds, values)
  return true
}
