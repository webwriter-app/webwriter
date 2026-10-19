/** Public, library-independent widget aggregation interface. All values are snapshots. */
export type WidgetDataSnapshot = Readonly<{
  status: "ready" | "pending" | "error"
  format: "json" | "xml"
  mode: "local" | "individual" | "all" | "group"
  scopeId?: string
  text?: string
}>

export type WidgetAggregateSample = Readonly<{
  id: string
  learners: readonly string[]
  value: unknown
  data: WidgetDataSnapshot
}>
export type WidgetAggregateContext = Readonly<{
  widget: Readonly<{id: string; attributes: Readonly<Record<string, string>>; html: string}>
  participants: readonly Readonly<{id: string; name: string}>[]
  samples: readonly WidgetAggregateSample[]
  missing: number
  reference?: unknown
}>
type AggregateBase = {
  /** Stable selector ID. Defaults to the shape, so repeated shapes need IDs. */
  id?: string
  title?: string
  /** Extract one response; return undefined to omit an unanswered sample. */
  value?: (data: unknown, sample: WidgetAggregateSample) => unknown
  /** Explicit correct/reference value in the extracted value's format. */
  reference?: unknown
}
export type WidgetAggregateItem = Readonly<{id: string; label: string}>
export type WidgetAggregateConfig = AggregateBase & (
  | {shape: "selection" | "ordering"; items: readonly WidgetAggregateItem[]}
  | {shape: "number"; bins?: number}
  | {shape: "text"}
  | {shape: "spatial"; bounds: {width: number; height: number}; columns?: number; rows?: number}
  | {shape: "distancemap"; distance?: (a: unknown, b: unknown) => number; distances?: readonly (readonly number[])[]}
  | {shape: "custom"; element: string}
)
export type WidgetAggregateDeclarations = WidgetAggregateConfig | readonly WidgetAggregateConfig[]
export type WidgetAggregateDeclaration = WidgetAggregateDeclarations | ((context: WidgetAggregateContext) => WidgetAggregateDeclarations)
export type WidgetAggregateOption = Readonly<{id: string; title: string}>
export type ResolvedWidgetAggregateDeclaration = Readonly<{id: string; title: string; config: WidgetAggregateConfig}>
export type WidgetAggregateParticipant = {id: string; name: string; snapshot?: {data?: WidgetDataSnapshot; html?: string; state?: unknown}}
export type LiveWidgetView = "aggregate" | "thumbnails" | "individual"
export type LiveWidgetAggregateInput = {
  path: number[]
  id?: string
  aggregateId?: string
  view: LiveWidgetView
  participants: WidgetAggregateParticipant[]
}

export function freezeSnapshot<T>(value: T): T {
  if(value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeSnapshot)
    Object.freeze(value)
  }
  return value
}

export function aggregateContext(widget: {id: string; attributes: Record<string, string>; html: string}, participants: WidgetAggregateParticipant[]): WidgetAggregateContext {
  const samples = new Map<string, WidgetAggregateSample>()
  let missing = 0
  for(const participant of participants) {
    const data = participant.snapshot?.data
    if(data?.status !== "ready" || typeof data.text !== "string" || data.mode === "group" && !data.scopeId) { missing++; continue }
    try {
      const value: unknown = data.format === "json" ? JSON.parse(data.text || "{}") : data.text
      // Shared scopes are response units. Never infer group identity from equal answers.
      const id = data.mode === "all" || data.mode === "group"
        ? JSON.stringify([data.mode, data.scopeId ?? "all"]) : JSON.stringify([data.mode, participant.id])
      const previous = samples.get(id)
      samples.set(id, {id, value, data: {...data}, learners: [...previous?.learners ?? [], participant.id]})
    }
    catch { missing++ }
  }
  return freezeSnapshot({widget, participants: participants.map(({id, name}) => ({id, name})), samples: [...samples.values()], missing})
}

const supportedAggregateShapes = ["selection", "ordering", "number", "text", "spatial", "distancemap", "custom"] as const
const isAggregateConfig = (config: unknown): config is WidgetAggregateConfig => {
  if(!config || typeof config !== "object") return false
  const shape = (config as {shape?: unknown}).shape
  return typeof shape === "string" && (supportedAggregateShapes as readonly string[]).includes(shape)
}

/** Evaluate declarations and expose supported choices without validating shape-specific data. */
export function aggregateDeclarations(widget: Element, context: WidgetAggregateContext): ResolvedWidgetAggregateDeclaration[] {
  const declaration = (widget.constructor as typeof HTMLElement & {aggregate?: WidgetAggregateDeclaration}).aggregate
  const declared = typeof declaration === "function" ? declaration(context) : declaration
  if(declared === undefined || declared === null) return []
  const configs = Array.isArray(declared) ? declared : [declared]
  if(configs.length > 50) throw new TypeError("Invalid aggregate declarations: maximum is 50")
  const entries: ResolvedWidgetAggregateDeclaration[] = []
  const ids = new Set<string>()
  for(const candidate of configs) {
    if(!isAggregateConfig(candidate)) continue
    const config = candidate
    const id = config.id ?? config.shape
    if(typeof id !== "string" || !id.trim() || id.length > 128) throw new TypeError("Invalid aggregate declaration ID")
    if(config.title !== undefined && typeof config.title !== "string") throw new TypeError("Invalid aggregate declaration title")
    if(ids.has(id)) throw new TypeError("Duplicate aggregate declaration ID")
    ids.add(id)
    entries.push({id, title: config.title || config.shape, config})
  }
  return entries
}

/** Reject malformed selected declarations before constructing a visualization. */
export function resolveAggregate(widget: Element, context: WidgetAggregateContext, aggregateId?: string, declarations: ReturnType<typeof aggregateDeclarations> = aggregateDeclarations(widget, context)) {
  const selected = declarations.find(declaration => declaration.id === aggregateId) ?? declarations[0]
  if(!selected) return null
  const {config, id: selectedId} = selected
  if(config.value !== undefined && typeof config.value !== "function") throw new TypeError("Invalid aggregate value extractor")
  if(config.shape === "selection" || config.shape === "ordering") {
    if(!Array.isArray(config.items) || config.items.length === 0 || config.items.length > 200
      || config.items.some(item => !item || typeof item.id !== "string" || typeof item.label !== "string")
      || new Set(config.items.map(item => item.id)).size !== config.items.length) throw new TypeError("Invalid aggregate items")
  }
  if(config.shape === "spatial" && (!config.bounds || !Number.isFinite(config.bounds.width) || config.bounds.width <= 0
    || !Number.isFinite(config.bounds.height) || config.bounds.height <= 0)) throw new TypeError("Invalid spatial bounds")
  if(config.shape === "custom" && (typeof config.element !== "string" || !/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(config.element))) throw new TypeError("Invalid aggregate element")
  const extracted = context.samples.map(sample => config.value ? config.value(sample.value, sample) : sample.value)
  const samples = context.samples.filter((_, i) => extracted[i] !== undefined)
  const missing = context.missing + context.samples.filter((_, i) => extracted[i] === undefined).reduce((sum, sample) => sum + sample.learners.length, 0)
  return {
    config,
    values: extracted.filter(value => value !== undefined),
    context: freezeSnapshot({...context, samples, missing,
      ...(config.reference !== undefined ? {reference: JSON.parse(JSON.stringify(config.reference)) as unknown} : {})}),
    options: declarations.map(({id, title}) => ({id, title})),
    selectedId,
  }
}

/** A deterministic structural distance; object key order carries no meaning. */
export function structuralDistance(a: unknown, b: unknown) {
  const leaves = (value: unknown, path: string[] = [], result = new Map<string, string>()) => {
    if(value !== null && typeof value === "object" && Object.keys(value).length) {
      for(const [key, child] of Object.entries(value)) leaves(child, [...path, key], result)
    }
    else result.set(JSON.stringify(path), JSON.stringify(value) ?? "undefined")
    return result
  }
  const left = leaves(a), right = leaves(b)
  const keys = new Set([...left.keys(), ...right.keys()])
  return [...keys].filter(key => left.get(key) !== right.get(key)).length / (keys.size || 1)
}

/** Classical metric MDS with deterministic power iteration for two coordinates. */
export function distanceEmbedding(distances: readonly (readonly number[])[]) {
  const n = distances.length
  if(!n || distances.some(row => row.length !== n || row.some(value => !Number.isFinite(value) || value < 0))) throw new TypeError("Invalid distance matrix")
  if(distances.some((row, i) => row[i] !== 0 || row.some((value, j) => Math.abs(value - distances[j][i]) > 1e-8))) throw new TypeError("Distances must be symmetric with a zero diagonal")
  const means = distances.map(row => row.reduce((sum, value) => sum + value * value, 0) / n)
  const mean = means.reduce((sum, value) => sum + value, 0) / n
  const matrix = distances.map((row, i) => row.map((value, j) => -0.5 * (value * value - means[i] - means[j] + mean)))
  const axes: number[][] = []
  const vectors: number[][] = []
  for(let axis = 0; axis < 2; axis++) {
    let vector = Array.from({length: n}, (_, i) => Math.sin((i + 1) * (axis + 1)))
    for(let iteration = 0; iteration < 80; iteration++) {
      const next = matrix.map(row => row.reduce((sum, value, j) => sum + value * vector[j], 0))
      for(const previous of vectors) {
        const dot = next.reduce((sum, value, i) => sum + value * previous[i], 0)
        next.forEach((value, i) => next[i] = value - dot * previous[i])
      }
      const length = Math.hypot(...next)
      vector = next.map(value => length > 1e-10 ? value / length : 0)
    }
    const eigenvalue = vector.reduce((sum, value, i) => sum + value * matrix[i].reduce((dot, cell, j) => dot + cell * vector[j], 0), 0)
    vectors.push(vector)
    axes.push(vector.map(value => value * Math.sqrt(Math.max(0, eigenvalue))))
  }
  return axes[0].map((x, i) => ({x, y: axes[1][i]}))
}
