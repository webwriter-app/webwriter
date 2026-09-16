import {graphicShapePresets, type GraphicShapePreset} from "./graphic-shape-presets"

export type GraphicPresetType = keyof typeof graphicShapePresets
type Bounds = {x: number, y: number, width: number, height: number}
type Point = {x: number, y: number}
export type GraphicPresetState = {
  type: GraphicPresetType
  definition: GraphicShapePreset
  bounds: Bounds
  values: number[]
}

export const graphicPresetOptions = (Object.keys(graphicShapePresets) as GraphicPresetType[]).map(type => {
  const definition: GraphicShapePreset = graphicShapePresets[type]
  return {
    type, label: definition.label, category: definition.category, icon: "Shape",
    path: type === "text-box"
      ? "M 0 0 L 100 0 L 100 100 L 0 100 Z M 12 50 L 25 15 L 38 50 M 17 38 L 33 38 M 48 20 L 88 20 M 48 40 L 88 40 M 12 65 L 88 65 M 12 82 L 88 82"
      : definition.draw(definition.adjustments.map(adjustment => adjustment.default)),
  }
})

export function isGraphicPresetType(type: string): type is GraphicPresetType {
  return Object.hasOwn(graphicShapePresets, type)
}

const numberPattern = /[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g
const clean = (value: number) => String(Math.round(value * 1e6) / 1e6)
const defaults = (definition: GraphicShapePreset) => definition.adjustments.map(adjustment => adjustment.default)
const coordinates = (path: string) => Array.from(path.matchAll(numberPattern), match => Number(match[0]))
const signature = (path: string) => path.replace(numberPattern, "#").replace(/[\s,]+/g, "")

export function graphicPresetPath(type: GraphicPresetType, bounds: Bounds, values = defaults(graphicShapePresets[type])) {
  let index = 0
  return graphicShapePresets[type].draw(values).replace(numberPattern, value => {
    const horizontal = index++ % 2 === 0
    return clean((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height))
  })
}

export function writeGraphicPreset(element: Element, state: GraphicPresetState, bounds = state.bounds, values = state.values) {
  element.setAttribute("d", graphicPresetPath(state.type, bounds, values))
}

type Template = {
  type: GraphicPresetType
  definition: GraphicShapePreset
  base: number[]
  deltas: number[][]
}
let templates: Map<string, Template[]> | undefined

function getTemplates() {
  if(templates) return templates
  templates = new Map()
  for(const option of graphicPresetOptions) {
    const definition: GraphicShapePreset = graphicShapePresets[option.type]
    const zero = definition.adjustments.map(() => 0)
    const path = definition.draw(zero)
    const base = coordinates(path)
    const deltas = zero.map((_, index) => coordinates(definition.draw(zero.map((_, i) => i === index ? 1 : 0)))
      .map((value, i) => value - base[i]))
    const key = signature(path)
    const candidates = templates.get(key) ?? []
    candidates.push({type: option.type, definition, base, deltas})
    templates.set(key, candidates)
  }
  return templates
}

/** Fit the affine coordinates encoded by the actual path. Dependent columns
 * are omitted (for example, a horizontal adjustment has no vertical term).
 * The complete path is verified afterward, so unrelated paths are untouched. */
function fitAxis(template: Template, actual: number[], axis: number) {
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

/** No private attributes or parallel document model: recognition and all
 * adjustments derive from the live SVG path, including after reload/undo. */
export function readGraphicPreset(element: Element | null): GraphicPresetState | null {
  if(element?.namespaceURI !== "http://www.w3.org/2000/svg" || element.localName !== "path") return null
  const path = element.getAttribute("d") ?? ""
  const label = element.getAttribute("aria-label")
  const previous = cache.get(element)
  if(previous?.path === path && previous.label === label) return previous.state
  const actual = coordinates(path)
  const candidates = [...getTemplates().get(signature(path)) ?? []]
  // Accessible names disambiguate geometrically identical presets, but never
  // override the path validation or hold editing parameters.
  candidates.sort((a, b) => Number(b.definition.label === label) - Number(a.definition.label === label))
  let state: GraphicPresetState | null = null
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
    const bounds = {x: horizontal[0]!, y: vertical[0]!, width: horizontal[1]! * 100, height: vertical[1]! * 100}
    const expected = coordinates(graphicPresetPath(template.type, bounds, values))
    if(expected.length !== actual.length || expected.some((value, i) => Math.abs(value - actual[i]) > 0.0001)) continue
    state = {type: template.type, definition: template.definition, bounds, values}
    break
  }
  cache.set(element, {path, label, state})
  return state
}

export function graphicPresetHandles(state: GraphicPresetState) {
  return state.definition.adjustments.map((adjustment, index) => {
    const point = adjustment.point(state.values)
    return {
      name: `adjust-${adjustment.name}`, label: adjustment.label, index,
      point: {x: state.bounds.x + point.x / 100 * state.bounds.width, y: state.bounds.y + point.y / 100 * state.bounds.height},
    }
  })
}

export function adjustGraphicPreset(element: Element, state: GraphicPresetState, name: string, input: number | Point) {
  const index = state.definition.adjustments.findIndex(adjustment => `adjust-${adjustment.name}` === name)
  if(index < 0) return false
  const adjustment = state.definition.adjustments[index]
  const values = [...state.values]
  let value: number
  if(typeof input === "number") value = input
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
  writeGraphicPreset(element, state, state.bounds, values)
  return true
}
