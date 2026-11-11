import {HashType, TokenType, tokenize} from "@csstools/css-tokenizer"

export type WidgetSignal = {get(): unknown}
export type WidgetEffectDeclaration = {
  label?: string | Record<string, string>
  description?: string | Record<string, string>
  connect(this: Element, source: WidgetSignal, lifetime: AbortSignal): void
}

type WidgetHost = Element & {
  effects?: Record<string, unknown>
  signals?: Record<string, WidgetSignal>
}

export const isWidgetHost = (element: Element) => element.namespaceURI === "http://www.w3.org/1999/xhtml"
  && element.localName.includes("-")

export function widgetEffectDeclarations(widget: WidgetHost, registry?: CustomElementRegistry) {
  try {
    const constructor = registry?.get(widget.localName) ?? widget.constructor
    const declarations = widget.effects ?? (constructor as {effects?: Record<string, unknown>}).effects ?? {}
    return new Map(Object.entries(declarations).flatMap(([attribute, declaration]) => {
      const effect = declaration as WidgetEffectDeclaration | null
      return /^[a-z_][a-z0-9_.-]*$/.test(attribute) && typeof effect?.connect === "function" ? [[attribute, effect]] : []
    }))
  }
  catch { return new Map<string, WidgetEffectDeclaration>() }
}

export function widgetSignals(widget: WidgetHost) {
  try {
    return new Map(Object.entries(widget.signals ?? {}).filter(([name, signal]) => name && typeof signal?.get === "function" && !("set" in signal)))
  }
  catch { return new Map<string, WidgetSignal>() }
}

/** Parse one CSS ID selector immediately followed by an attribute presence selector.
 * The second token names a public signal, so no DOM attribute match is needed. */
export function parseWidgetEffectReference(value: string) {
  const tokens = tokenize({css: value}).filter(token => token[0] !== TokenType.EOF && token[0] !== TokenType.Comment)
  while(tokens[0]?.[0] === TokenType.Whitespace) tokens.shift()
  while(tokens.at(-1)?.[0] === TokenType.Whitespace) tokens.pop()
  const [id, open, ...attribute] = tokens
  if(id?.[0] !== TokenType.Hash || id[4].type !== HashType.ID || open?.[0] !== TokenType.OpenSquare) return
  const [name, close, extra] = attribute.filter(token => token[0] !== TokenType.Whitespace)
  if(name?.[0] === TokenType.Ident && close?.[0] === TokenType.CloseSquare && !extra) {
    return {id: id[4].value, name: name[4].value, idStart: id[2], idEnd: id[3] + 1}
  }
}

export function widgetEffectReference(id: string, name: string) {
  return `#${CSS.escape(id)}[${CSS.escape(name)}]`
}

type EffectLink = {
  source: Element
  signal: WidgetSignal
  subscriber: Element
  attribute: string
  connect: WidgetEffectDeclaration["connect"]
}
type EffectOverride = {widget: Element, attribute: string, value: string}
type EffectStatus = {message: string, cycle?: boolean}

/** Discover authored widget hosts without entering the light DOM of a widget. */
function widgetHosts(root: HTMLElement) {
  const widgets: Element[] = []
  const pending: Element[] = root.firstElementChild ? [root.firstElementChild] : []
  while(pending.length) {
    const element = pending.pop()!
    if(element.nextElementSibling) pending.push(element.nextElementSibling)
    if(isWidgetHost(element)) widgets.push(element)
    else if(element.firstElementChild) pending.push(element.firstElementChild)
  }
  return widgets
}

function effectGraph(root: HTMLElement, supports: (element: Element) => boolean, override?: EffectOverride,
  onHost?: (host: Element) => void) {
  const hosts = widgetHosts(root).filter(element => supports(element))
  const counts = new Map<string, number>()
  for(const element of root.ownerDocument.querySelectorAll("[id]")) {
    const id = element.getAttribute("id")!
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const sources = new Map<string, {element: Element, signals: Map<string, WidgetSignal>}>()
  for(const host of hosts) {
    onHost?.(host)
    const id = host.getAttribute("id")
    if(id && counts.get(id) === 1) sources.set(id, {element: host, signals: widgetSignals(host)})
  }
  const links: EffectLink[] = []
  const statuses = new Map<Element, Map<string, EffectStatus>>()
  const mark = (widget: Element, attribute: string, status: EffectStatus) => {
    let attributes = statuses.get(widget)
    if(!attributes) statuses.set(widget, attributes = new Map())
    attributes.set(attribute, status)
  }
  for(const subscriber of hosts) {
    for(const [attribute, effect] of widgetEffectDeclarations(subscriber)) {
      const value = override?.widget === subscriber && override.attribute === attribute
        ? override.value : subscriber.getAttribute(attribute)
      if(!value) continue
      const reference = parseWidgetEffectReference(value)
      const source = reference && sources.get(reference.id)
      const signal = source && reference && source.signals.get(reference.name)
      if(!reference) mark(subscriber, attribute, {message: "Use a selector like #sensor[celsius]."})
      else if(!source || !signal) mark(subscriber, attribute, {message: `Signal unavailable: ${value}`})
      else links.push({source: source.element, signal, subscriber, attribute, connect: effect.connect})
    }
  }
  return {hosts, sources, links, statuses, mark}
}

/** A link is circular exactly when both endpoints are in the same strongly
 * connected component. Use iterative traversals so deep documents are safe. */
function effectCycles(links: readonly EffectLink[]) {
  const forward = new Map<Element, Element[]>()
  const reverse = new Map<Element, Element[]>()
  for(const {source, subscriber} of links) {
    if(!forward.has(source)) forward.set(source, [])
    if(!forward.has(subscriber)) forward.set(subscriber, [])
    if(!reverse.has(subscriber)) reverse.set(subscriber, [])
    forward.get(source)!.push(subscriber)
    reverse.get(subscriber)!.push(source)
  }
  const order: Element[] = []
  const seen = new Set<Element>()
  for(const element of forward.keys()) {
    if(seen.has(element)) continue
    seen.add(element)
    const stack = [{element, next: 0}]
    while(stack.length) {
      const entry = stack[stack.length - 1]
      const next = forward.get(entry.element)?.[entry.next++]
      if(next) {
        if(seen.has(next)) continue
        seen.add(next)
        stack.push({element: next, next: 0})
      }
      else order.push(stack.pop()!.element)
    }
  }
  const components = new Map<Element, Element>()
  for(const element of order.reverse()) {
    if(components.has(element)) continue
    const stack = [element]
    components.set(element, element)
    while(stack.length) {
      for(const next of reverse.get(stack.pop()!) ?? []) {
        if(components.has(next)) continue
        components.set(next, element)
        stack.push(next)
      }
    }
  }
  return links.filter(({source, subscriber}) => components.get(source) === components.get(subscriber))
}

function widgetEffectGraph(root: HTMLElement, supports: (element: Element) => boolean, override?: EffectOverride,
  onHost?: (host: Element) => void) {
  const graph = effectGraph(root, supports, override, onHost)
  const cycles = new Set(effectCycles(graph.links))
  for(const {subscriber, attribute} of cycles) graph.mark(subscriber, attribute, {message: "Circular signal connection", cycle: true})
  return {...graph, cycles}
}

export function inspectWidgetEffects(root: HTMLElement, widget: Element, supports: (element: Element) => boolean) {
  const {hosts, sources, statuses} = widgetEffectGraph(root, supports)
  if(!hosts.includes(widget)) return
  const choices = [...sources].flatMap(([id, {element, signals}]) => {
    const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.localName
    return [...signals.keys()].map(name => {
      const value = widgetEffectReference(id, name)
      return {value, label: `${label} ${value}`}
    })
  })
  return {choices, statuses: statuses.get(widget)}
}

export function validateWidgetEffect(root: HTMLElement, widget: Element, attribute: string, value: string,
  supports: (element: Element) => boolean) {
  const graph = widgetEffectGraph(root, supports, {widget, attribute, value})
  if(!graph.hosts.includes(widget)) return "Select a widget in the authored document."
  const status = graph.statuses.get(widget)?.get(attribute)
  if(!status?.cycle) return status?.message
  const link = graph.links.find(candidate => candidate.subscriber === widget && candidate.attribute === attribute)!
  const routes = new Map<Element, Element[]>()
  for(const {source, subscriber} of graph.cycles) {
    const sinks = routes.get(source)
    if(sinks) sinks.push(subscriber)
    else routes.set(source, [subscriber])
  }
  const path = new Map<Element, Element | null>([[link.subscriber, null]])
  const queue = [link.subscriber]
  for(let index = 0; index < queue.length && !path.has(link.source); index++) {
    const node = queue[index]
    for(const next of routes.get(node) ?? []) {
      if(path.has(next)) continue
      path.set(next, node)
      queue.push(next)
    }
  }
  const cycle = [link.subscriber]
  for(let node: Element | null = link.source; node; node = path.get(node) ?? null) cycle.push(node)
  return `Circular signal connection: ${cycle.reverse().map(node => node.getAttribute("id") || node.localName).join(" → ")}`
}

/** Reconcile only the authored links. Signals and their subscriptions belong to widgets. */
export function mountWidgetEffects(root: HTMLElement, {supports = isWidgetHost, onChange}: {
  supports?: (element: Element) => boolean
  onChange?: () => void
} = {}) {
  const registry = root.ownerDocument.defaultView?.customElements
  const active = new Map<Element, Map<string, EffectLink & {controller: AbortController}>>()
  const pending = new Set<string>()
  const lifetime = new AbortController()
  let queued = false
  const schedule = () => {
    if(queued || lifetime.signal.aborted) return
    queued = true
    queueMicrotask(() => {
      queued = false
      refresh()
    })
  }
  const watchDefinition = (host: Element) => {
    const name = host.localName
    if(!registry || registry.get(name) || pending.has(name)) return
    pending.add(name)
    void registry.whenDefined(name).then(schedule, () => {})
  }
  const refresh = () => {
    if(lifetime.signal.aborted) return
    const {links, cycles} = widgetEffectGraph(root, supports, undefined, watchDefinition)
    const next = new Map<Element, Map<string, EffectLink>>()
    for(const link of links) {
      if(cycles.has(link)) continue
      let effects = next.get(link.subscriber)
      if(!effects) next.set(link.subscriber, effects = new Map())
      effects.set(link.attribute, link)
    }
    for(const [widget, effects] of active) {
      for(const [attribute, previous] of effects) {
        const current = next.get(widget)?.get(attribute)
        if(current && current.source === previous.source && current.signal === previous.signal && current.connect === previous.connect) {
          next.get(widget)!.delete(attribute)
          continue
        }
        effects.delete(attribute)
        previous.controller.abort()
      }
      if(!effects.size) active.delete(widget)
    }
    for(const [widget, effects] of next) {
      for(const link of effects.values()) {
        const controller = new AbortController()
        try {
          link.connect.call(widget, link.signal, controller.signal)
          let bindings = active.get(widget)
          if(!bindings) active.set(widget, bindings = new Map())
          bindings.set(link.attribute, {...link, controller})
        }
        catch(error) {
          controller.abort()
          console.error(`Could not connect ${widget.localName}[${link.attribute}]`, error)
        }
      }
    }
    onChange?.()
  }
  const Observer = root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver
  const observer = new Observer(records => {
    if(records.some(record => {
      if(record.type === "attributes") {
        const target = record.target as Element
        return record.attributeName === "id" || isWidgetHost(target)
          && (record.attributeName === "aria-label" || record.attributeName === "title"
            || widgetEffectDeclarations(target).has(record.attributeName ?? ""))
      }
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1)
    })) schedule()
  })
  observer.observe(root.ownerDocument, {subtree: true, childList: true, attributes: true})
  refresh()
  return {refresh, destroy() {
    lifetime.abort()
    observer.disconnect()
    for(const effects of active.values()) for(const link of effects.values()) link.controller.abort()
    active.clear()
  }}
}
