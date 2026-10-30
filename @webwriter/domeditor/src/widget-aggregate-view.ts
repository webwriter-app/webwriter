import {aggregateContext, aggregateDeclarations, distanceEmbedding, resolveAggregate, structuralDistance} from "./widget-aggregate"
import type {LiveWidgetAggregateInput, WidgetAggregateContext, WidgetAggregateConfig, WidgetAggregateOption} from "./widget-aggregate"
import {stripActiveContent} from "./active-content"
import {createAnchorPositioner} from "./anchor-positioning.js"

export type LiveWidgetAggregateOptions = {path: number[]; options: WidgetAggregateOption[]; selectedId?: string}

type ResolvedAggregate = NonNullable<ReturnType<typeof resolveAggregate>>
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const gridSize = (value: number | undefined, fallback: number) => finite(value) ? Math.max(1, Math.min(40, Math.round(value))) : fallback

/** Editor-owned views, mounted exclusively in the preview body's shadow appendix. */
export class WidgetAggregateViews {
  private layer?: HTMLElement
  private panels = new Map<string, {element: HTMLElement; widget: Element; input: LiveWidgetAggregateInput; constructor: Function; signature?: string}>()
  private positioner?: ReturnType<typeof createAnchorPositioner>

  constructor(readonly root: Document) {}

  private element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
    const element = this.root.createElement(tag)
    if(text !== undefined) element.textContent = text
    return element
  }

  private mount() {
    if(this.layer) return this.layer
    const body = this.root.body
    const appendix = body.shadowRoot ?? body.attachShadow({mode: "open"})
    if(!appendix.querySelector('slot:not([name])')) appendix.prepend(this.element("slot"))
    const layer = this.element("div")
    layer.className = "◆live-aggregates"
    const shadow = layer.attachShadow({mode: "open"})
    const style = this.element("style")
    style.textContent = `
      :host { position:fixed; inset:0; pointer-events:none; z-index:2147483639; font:14px/1.45 system-ui,sans-serif; color:#25364a; }
      * { box-sizing:border-box; }
      section { position:absolute; overflow:auto; overscroll-behavior:contain; pointer-events:auto; border:1px solid #cbd5e1; border-radius:8px; background:#fff; box-shadow:0 2px 8px #0f172a1a; padding:12px; }
      h3 { margin:0 0 4px; font-size:15px; line-height:1.3; overflow-wrap:anywhere; }
      p { margin:4px 0 10px; color:#64748b; font-size:12px; }
      .rows { display:grid; gap:7px; }
      .row { display:grid; grid-template-columns:minmax(60px,1fr) minmax(45px,2fr) auto; gap:8px; align-items:center; }
      .label { overflow-wrap:anywhere; min-width:0; }
      .track { height:16px; background:#eef2f7; border-radius:4px; overflow:hidden; }
      .bar { height:100%; background:#2879d9; min-width:0; }
      .reference { background:#19965f; }
      table { border-collapse:separate; border-spacing:3px; width:100%; font-size:12px; }
      th { font-weight:600; overflow-wrap:anywhere; max-width:110px; }
      td { text-align:center; min-width:24px; padding:3px; border-radius:3px; }
      td.reference { outline:2px solid #19965f; outline-offset:-2px; }
      ul { padding-left:20px; margin:8px 0; overflow-wrap:anywhere; }
      .density { display:grid; gap:3px; aspect-ratio:2; margin:10px 0; }
      .density span { min-width:0; min-height:0; border-radius:3px; }
      .target { outline:2px dashed #19965f; outline-offset:-2px; }
      svg { display:block; width:100%; height:auto; max-height:200px; background:#f5f7fb; border-radius:5px; }
      .thumbnails { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr)); gap:8px; }
      figure { margin:0; padding:7px; border:1px solid #cbd5e1; border-radius:5px; min-width:0; overflow:hidden; }
      figcaption { font-size:12px; font-weight:600; margin-top:4px; overflow-wrap:anywhere; }
      .thumbnail { height:110px; overflow:hidden; pointer-events:none; }
      .thumbnail > * { transform:scale(.5); transform-origin:top left; width:200%; max-width:none; }
      pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font-size:11px; }
    `
    shadow.append(style)
    appendix.append(layer)
    this.layer = layer
    this.positioner ??= createAnchorPositioner(this.root)
    return layer
  }

  update(inputs: LiveWidgetAggregateInput[], findWidget: (input: LiveWidgetAggregateInput) => Element | null) {
    const keys = new Set<string>()
    const choices: LiveWidgetAggregateOptions[] = []
    for(const input of inputs) {
      const key = JSON.stringify(input.path)
      const widget = findWidget(input)
      if(!widget?.isConnected) continue
      let context: WidgetAggregateContext | undefined
      let declarations: ReturnType<typeof aggregateDeclarations> = []
      try {
        context = aggregateContext({id: widget.id, attributes: Object.fromEntries(Array.from(widget.attributes, attribute => [attribute.name, attribute.value])), html: widget.outerHTML}, input.participants)
        declarations = aggregateDeclarations(widget, context)
      }
      catch { /* Invalid declarations fall back to snapshots. */ }
      const selected = declarations.find(option => option.id === input.aggregateId) ?? declarations[0]
      choices.push({path: input.path, options: declarations.map(({id, title}) => ({id, title})), selectedId: selected?.id})
      if(input.view === "individual") continue
      keys.add(key)
      let panel = this.panels.get(key)
      if(panel && panel.widget !== widget) {
        this.positioner?.release(panel.element)
        panel?.element.remove()
        panel = undefined
      }
      if(!panel) {
        const element = this.element("section")
        element.setAttribute("aria-label", `Live responses for ${widget.id || widget.localName}`)
        this.mount().shadowRoot!.append(element)
        panel = {element, widget, input, constructor: widget.constructor}
        this.panels.set(key, panel)
        this.positioner?.bind(element, widget,
          "left:max(8px,min(anchor(left),calc(100vw - min(max(anchor-size(width),220px),calc(100vw - 16px)) - 8px)));top:anchor(top);width:min(max(anchor-size(width),220px),calc(100vw - 16px));height:max(anchor-size(height),180px);position-visibility:anchors-visible;")
      }
      // Pointer/cursor steps do not reconstruct widget previews or custom renderers.
      const signature = JSON.stringify([input, widget.outerHTML])
      if(panel.constructor === widget.constructor && panel.signature === signature && panel.element.childElementCount) continue
      panel.signature = signature
      panel.input = input
      panel.constructor = widget.constructor
      this.render(panel.element, widget, input, context, declarations)
    }
    for(const [key, panel] of this.panels) if(!keys.has(key)) {
      this.positioner?.release(panel.element)
      panel.element.remove()
      this.panels.delete(key)
    }
    if(!this.panels.size) this.destroy()
    else this.positioner?.refresh()
    return choices
  }

  private render(panel: HTMLElement, widget: Element, input: LiveWidgetAggregateInput, context: WidgetAggregateContext | undefined, declarations: ReturnType<typeof aggregateDeclarations>) {
    panel.replaceChildren()
    try {
      const resolved = input.view === "aggregate" && context ? resolveAggregate(widget, context, input.aggregateId, declarations) : null
      if(!resolved) return this.thumbnails(panel, input, context ?? {missing: input.participants.length})
      const {config, context: ready} = resolved
      panel.append(this.element("h3", config.title || "Class responses"), this.element("p", `${ready.samples.length} independent responses · ${ready.participants.length} learners${ready.missing ? ` · ${ready.missing} unavailable` : ""}`))
      if(!ready.samples.length && config.shape !== "custom") { panel.append(this.element("p", "Waiting for ready widget data.")); return }
      this.visualization(panel, widget, resolved)
    }
    catch {
      panel.replaceChildren()
      this.thumbnails(panel, input, context ?? {missing: input.participants.length}, "Aggregate unavailable. Showing individual snapshots.")
    }
  }

  private rows(panel: HTMLElement, entries: {label: string; count: number; reference?: boolean}[]) {
    const rows = this.element("div")
    rows.className = "rows"
    const max = Math.max(1, ...entries.map(entry => entry.count))
    for(const entry of entries) {
      const row = this.element("div"), text = this.element("span", entry.label), track = this.element("div"), bar = this.element("div")
      row.className = "row"; text.className = "label"; track.className = "track"
      bar.className = entry.reference ? "bar reference" : "bar"
      bar.style.width = `${entry.count / max * 100}%`
      if(entry.reference) text.append(" ✓")
      track.append(bar)
      row.append(text, track, this.element("strong", String(Number(entry.count.toPrecision(3)))))
      rows.append(row)
    }
    panel.append(rows)
  }

  private visualization(panel: HTMLElement, widget: Element, {config, values, context}: ResolvedAggregate) {
    if(config.shape === "selection") {
      if(values.some(value => typeof value !== "string" && (!Array.isArray(value) || value.some(id => typeof id !== "string")))) throw new TypeError("Selection requires item IDs")
      const ids = values.map(value => new Set(Array.isArray(value) ? value : [value]))
      const known = new Set(config.items.map(item => item.id))
      if(ids.some(set => [...set].some(id => !known.has(id)))) throw new TypeError("Unknown selection item")
      const reference = new Set(Array.isArray(config.reference) ? config.reference : [config.reference])
      this.rows(panel, config.items.map(item => ({label: item.label, count: ids.filter(set => set.has(item.id)).length, reference: reference.has(item.id)})))
    }
    else if(config.shape === "ordering") {
      const known = new Set(config.items.map(item => item.id))
      if(values.some(value => !Array.isArray(value) || value.length > config.items.length || new Set(value).size !== value.length || value.some(id => !known.has(id)))) throw new TypeError("Ordering requires unique item IDs")
      const table = this.element("table"), header = this.element("tr")
      header.append(this.element("th", "Item / position"), ...config.items.map((_, i) => this.element("th", String(i + 1))))
      table.append(header)
      for(const item of config.items) {
        const row = this.element("tr")
        row.append(this.element("th", item.label))
        config.items.forEach((_, index) => {
          const count = values.filter(value => (value as unknown[])[index] === item.id).length
          const cell = this.element("td", String(count))
          cell.style.backgroundColor = `rgb(40 121 217 / ${0.08 + count / values.length * 0.72})`
          if(Array.isArray(config.reference) && config.reference[index] === item.id) cell.className = "reference"
          row.append(cell)
        })
        table.append(row)
      }
      panel.append(table)
    }
    else if(config.shape === "number") this.numbers(panel, config, values)
    else if(config.shape === "text") {
      if(values.some(value => typeof value !== "string")) throw new TypeError("Text requires strings")
      const words = new Map<string, number>()
      const list = this.element("ul")
      values.forEach((value, index) => {
        list.append(this.element("li", `${this.sampleNames(context, index)}: ${value}`))
        for(const word of (value as string).toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) words.set(word, (words.get(word) ?? 0) + 1)
      })
      this.rows(panel, [...words].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([word, count]) => ({label: word, count})))
      panel.append(list)
    }
    else if(config.shape === "spatial") this.spatial(panel, config, values)
    else if(config.shape === "distancemap") this.distances(panel, config, values, context)
    else if(config.shape === "custom") {
      const scoped = (widget.shadowRoot as ShadowRoot & {customElementRegistry?: CustomElementRegistry} | null)?.customElementRegistry
      const registry = scoped?.get(config.element) ? scoped : this.root.defaultView?.customElements
      if(!registry?.get(config.element)) throw new TypeError("Aggregate element is not registered")
      const renderer = this.root.createElement(config.element, {customElementRegistry: registry} as ElementCreationOptions) as HTMLElement & {aggregate: WidgetAggregateContext}
      renderer.aggregate = context
      panel.append(renderer)
    }
  }

  private sampleNames(context: WidgetAggregateContext, index: number) {
    return context.samples[index].learners.map(id => context.participants.find(participant => participant.id === id)?.name ?? id).join(", ")
  }

  private numbers(panel: HTMLElement, config: Extract<WidgetAggregateConfig, {shape: "number"}>, values: unknown[]) {
    if(!values.every(finite)) throw new TypeError("Number requires finite numeric values")
    const sorted = [...values].sort((a, b) => a - b)
    const unique = [...new Set(sorted)]
    const min = sorted[0], max = sorted.at(-1)!
    const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
    panel.append(this.element("p", `Median ${median}${finite(config.reference) ? ` · reference ${config.reference}` : ""}`))
    if(unique.length <= 12 && config.bins === undefined) {
      this.rows(panel, unique.map(value => ({label: String(value), count: values.filter(item => item === value).length, reference: value === config.reference})))
    }
    else {
      const count = gridSize(config.bins, 10), step = (max - min) / count || 1
      this.rows(panel, Array.from({length: count}, (_, i) => ({
        label: `${Number((min + i * step).toPrecision(4))}–${Number((min + (i + 1) * step).toPrecision(4))}`,
        count: values.filter(value => Math.min(count - 1, Math.floor((value - min) / step)) === i).length,
        reference: finite(config.reference) && config.reference >= min && config.reference <= max && Math.min(count - 1, Math.floor((config.reference - min) / step)) === i,
      })))
    }
  }

  private spatial(panel: HTMLElement, config: Extract<WidgetAggregateConfig, {shape: "spatial"}>, values: unknown[]) {
    const columns = gridSize(config.columns, 10), rows = gridSize(config.rows, 6)
    const index = (value: unknown) => {
      const point = value as {x: number; y: number} | null
      if(!point || !finite(point.x) || !finite(point.y) || point.x < 0 || point.y < 0 || point.x > config.bounds.width || point.y > config.bounds.height) throw new TypeError("Point outside spatial bounds")
      return Math.min(rows - 1, Math.floor(point.y / config.bounds.height * rows)) * columns + Math.min(columns - 1, Math.floor(point.x / config.bounds.width * columns))
    }
    const counts = Array.from({length: rows * columns}, () => 0)
    // Count each independent response once per cell, even for multiple tokens.
    for(const value of values) for(const cell of new Set((Array.isArray(value) ? value : [value]).map(index))) counts[cell]++
    const targets = new Set(config.reference === undefined ? [] : (Array.isArray(config.reference) ? config.reference : [config.reference]).map(index))
    const grid = this.element("div")
    grid.className = "density"
    grid.style.gridTemplateColumns = `repeat(${columns},1fr)`
    for(const [i, count] of counts.entries()) {
      const cell = this.element("span")
      cell.title = `Column ${i % columns + 1}, row ${Math.floor(i / columns) + 1}: ${count} responses`
      cell.setAttribute("aria-label", cell.title)
      cell.style.backgroundColor = `rgb(40 121 217 / ${0.08 + count / values.length * 0.72})`
      if(targets.has(i)) cell.className = "target"
      grid.append(cell)
    }
    panel.append(grid, this.element("p", "Darker cells contain more responses. Green outlines mark reference cells."))
  }

  private distances(panel: HTMLElement, config: Extract<WidgetAggregateConfig, {shape: "distancemap"}>, values: unknown[], context: WidgetAggregateContext) {
    // Bound quadratic rendering work; preserve all data through the thumbnail fallback.
    if(values.length > 300) throw new RangeError("Distance map supports at most 300 independent responses")
    const normalize = (value: unknown) => {
      if(typeof value !== "string" || !value.trim().startsWith("<")) return value
      const xml = new (this.root.defaultView!.DOMParser)().parseFromString(value, "application/xml")
      const node = (current: Node): unknown => current.nodeType === 1
        ? [(current as Element).namespaceURI, (current as Element).localName, Object.fromEntries(Array.from((current as Element).attributes, attribute => [JSON.stringify([attribute.namespaceURI, attribute.localName]), attribute.value])), Array.from(current.childNodes, node)]
        : [current.nodeType, current.nodeName, current.nodeValue]
      return node(xml.documentElement)
    }
    const distance = config.distance ?? ((a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(finite) && b.every(finite)
      ? Math.hypot(...a.map((value, i) => value - b[i])) : structuralDistance(normalize(a), normalize(b)))
    const matrix = config.distances ?? values.map(a => values.map(b => distance(a, b)))
    if(matrix.length !== values.length) throw new TypeError("Distance matrix must match independent responses")
    const points = distanceEmbedding(matrix)
    const svg = this.root.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("viewBox", "0 0 400 200")
    svg.setAttribute("role", "img")
    svg.setAttribute("aria-label", "Two-dimensional response distances; nearby points have similar states")
    const extent = (axis: "x" | "y") => Math.max(1e-8, ...points.map(point => Math.abs(point[axis])))
    const scale = Math.min(175 / extent("x"), 75 / extent("y"))
    points.forEach((point, i) => {
      const dot = this.root.createElementNS(svg.namespaceURI, "circle")
      dot.setAttribute("cx", String(200 + point.x * scale))
      dot.setAttribute("cy", String(100 + point.y * scale))
      dot.setAttribute("r", "5")
      dot.setAttribute("fill", "#2879d9")
      dot.setAttribute("fill-opacity", ".7")
      const title = this.root.createElementNS(svg.namespaceURI, "title")
      title.textContent = this.sampleNames(context, i)
      dot.append(title); svg.append(dot)
    })
    panel.append(svg)
    if(config.reference !== undefined) {
      panel.append(this.element("p", "Distance to reference"))
      this.rows(panel, values.map((value, i) => {
        const d = distance(value, config.reference)
        if(!finite(d) || d < 0) throw new TypeError("Invalid reference distance")
        return {label: this.sampleNames(context, i), count: d, reference: d === 0}
      }))
    }
    panel.append(this.element("p", "Distances describe similarity, not correctness. Overlapping points can represent identical responses."))
  }

  private thumbnails(panel: HTMLElement, input: LiveWidgetAggregateInput, context: {missing: number}, message?: string) {
    panel.append(this.element("h3", "Learner snapshots"), this.element("p", message ?? `${input.participants.length} learners`))
    const grid = this.element("div")
    grid.className = "thumbnails"
    for(const participant of input.participants) {
      const figure = this.element("figure"), preview = this.element("div")
      preview.className = "thumbnail"
      preview.inert = true
      const snapshot = participant.snapshot
      if(snapshot?.html) {
        const template = this.element("template")
        template.innerHTML = snapshot.html
        stripActiveContent(template.content)
        const clone = template.content.firstElementChild
        if(clone?.localName.includes("-")) {
          const data = snapshot.data
          const block = clone.querySelector(':scope > script[slot="data"]')
          if(block && data?.status === "ready" && typeof data.text === "string") block.textContent = data.text
          // Shadow-only clones have no writable data binding. Legacy public
          // properties remain supported only on these isolated copies.
          preview.append(clone)
          if(snapshot.state && typeof snapshot.state === "object") {
            for(const [key, value] of Object.entries(snapshot.state)) {
              const native = this.root.defaultView!.HTMLElement.prototype
              if(key.startsWith("on") || key in native || ["__proto__", "constructor", "prototype"].includes(key)) continue
              try { (clone as unknown as Record<string, unknown>)[key] = value }
              catch { /* Read-only widget properties remain untouched. */ }
            }
          }
        }
      }
      if(!preview.childElementCount) preview.append(this.element("pre", snapshot?.data?.text ?? "No snapshot yet"))
      figure.append(preview, this.element("figcaption", participant.name))
      grid.append(figure)
    }
    panel.append(grid)
    if(context.missing) panel.append(this.element("p", `${context.missing} learners have no ready aggregate data.`))
  }

  destroy() {
    this.positioner?.destroy()
    this.positioner = undefined
    this.panels.clear()
    this.layer?.remove()
    this.layer = undefined
  }
}
