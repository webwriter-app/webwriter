import {serializeDoctype} from "./serialization"
import {nodeAtPath, pathFromNode} from "./utility"
import type {LiveSession, LiveSessionRegion as SessionRegion, LiveSessionWidgetState} from "./live-session"

type PublishPreviewStep = (step: Parameters<LiveSession["publish"]>[0]) => void
const clampUnit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

export function previewElementPath(element: Element, previewDocument = element.ownerDocument) {
  return previewDocument.body ? pathFromNode(previewDocument.body, element) : null
}

export function previewElementAtPath(path: number[], previewDocument: Document) {
  const current = previewDocument.body ? nodeAtPath(previewDocument.body, path) : null
  return current?.nodeType === Node.ELEMENT_NODE ? current as Element : null
}

export function previewWidgetElements(previewDocument: Document) {
  return Array.from(previewDocument.body?.querySelectorAll("*") ?? [])
    .filter(element => element.localName.includes("-"))
}

/** Owns the observations and snapshots of one preview iframe. The authored
 * editor DOM and session policy remain with their existing owners. */
export class LivePreview {
  readonly baseWidgetStates = new Map<string, LiveSessionWidgetState>()
  private widgetPaths = new WeakMap<Element, number[]>()
  private observer: MutationObserver | null = null
  private cleanup: (() => void)[] = []
  private pendingMutations: MutationRecord[] = []
  private documentUpdateQueued = false
  private generation = 0

  private seedWidgetPaths(previewDocument: Document) {
    this.widgetPaths = new WeakMap()
    previewWidgetElements(previewDocument).forEach(widget => {
      const path = previewElementPath(widget, previewDocument)
      if(path) this.widgetPaths.set(widget, path)
    })
  }

  private captureWidgetPublicState(widget: Element) {
    const state: Record<string, unknown> = {}
    for(const key of Object.keys(widget).slice(0, 64)) {
      if(key === "__proto__" || key === "constructor" || key === "prototype") continue
      try {
        const value = (widget as unknown as Record<string, unknown>)[key]
        if(typeof value === "function" || value instanceof Node || (
          value !== null && typeof value === "object" && typeof (value as {nodeType?: unknown}).nodeType === "number"
        )) continue
        const serialized = JSON.stringify(value)
        if(serialized === undefined || serialized.length > 32_000) continue
        state[key] = JSON.parse(serialized)
      }
      catch {
        // Cyclic or host-owned fields are not part of the widget's portable state.
      }
    }
    return state
  }

  captureWidgetStates(previewDocument: Document): LiveSessionWidgetState[] {
    return previewWidgetElements(previewDocument).flatMap(widget => {
      const path = this.widgetPaths.get(widget) ?? previewElementPath(widget, previewDocument)
      if(path && !this.widgetPaths.has(widget)) this.widgetPaths.set(widget, path)
      return path ? [{path, html: widget.outerHTML, state: this.captureWidgetPublicState(widget)}] : []
    })
  }

  private previewHTML(previewDocument: Document) {
    return `${serializeDoctype(previewDocument.doctype)}${previewDocument.documentElement.outerHTML}`
  }

  private normalizedPreviewPoint(x: number, y: number, previewDocument: Document) {
    const view = previewDocument.defaultView
    const width = view?.innerWidth || previewDocument.documentElement.clientWidth || 1
    const height = view?.innerHeight || previewDocument.documentElement.clientHeight || 1
    return {x: clampUnit(x / width), y: clampUnit(y / height)}
  }

  private mutationRegions(mutations: MutationRecord[], previewDocument: Document): SessionRegion[] {
    const view = previewDocument.defaultView
    const width = view?.innerWidth || previewDocument.documentElement.clientWidth || 1
    const height = view?.innerHeight || previewDocument.documentElement.clientHeight || 1
    const regions = new Map<string, SessionRegion>()
    for(const mutation of mutations) {
      const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target as Element : mutation.target.parentElement
      if(!element || element === previewDocument.documentElement || !previewDocument.body?.contains(element)) continue
      const path = previewElementPath(element, previewDocument)
      if(!path) continue
      const key = JSON.stringify(path)
      const rect = element.getBoundingClientRect()
      regions.set(key, {
        id: key,
        path,
        x: clampUnit(rect.left / width),
        y: clampUnit(rect.top / height),
        width: clampUnit((rect.width || width) / width),
        height: clampUnit((rect.height || Math.min(20, height)) / height),
      })
      if(regions.size >= 32) break
    }
    return [...regions.values()]
  }

  private previewScrollState(previewDocument: Document) {
    const scroller = previewDocument.scrollingElement ?? previewDocument.documentElement
    const view = previewDocument.defaultView
    return {
      top: scroller.scrollTop,
      left: scroller.scrollLeft,
      height: scroller.scrollHeight,
      viewport: view?.innerHeight || previewDocument.documentElement.clientHeight,
    }
  }

  disconnect() {
    this.generation++
    this.widgetPaths = new WeakMap()
    this.baseWidgetStates.clear()
    this.observer?.disconnect()
    this.observer = null
    this.cleanup.splice(0).forEach(cleanup => cleanup())
    this.pendingMutations = []
    this.documentUpdateQueued = false
  }

  observeLearner(frame: HTMLIFrameElement, previewDocument: Document, publish: PublishPreviewStep) {
    this.disconnect()
    const generation = this.generation
    const view = frame.contentWindow
    const body = previewDocument.body
    if(!view || !body) return
    this.seedWidgetPaths(previewDocument)

    const listen = (
      target: EventTarget,
      type: string,
      listener: EventListener,
      options?: AddEventListenerOptions | boolean,
    ) => {
      target.addEventListener(type, listener, options)
      this.cleanup.push(() => target.removeEventListener(type, listener, options))
    }

    let pendingPointer: {x: number, y: number} | null = null
    let pointerTimer: ReturnType<typeof setTimeout> | undefined
    let lastPointerTime = -Infinity
    const flushPointer = () => {
      pointerTimer = undefined
      if(!pendingPointer) return
      publish({kind: "pointer", pointer: pendingPointer})
      pendingPointer = null
      lastPointerTime = view.performance.now()
    }
    const pointer = (event: Event) => {
      const pointerEvent = event as PointerEvent
      pendingPointer = this.normalizedPreviewPoint(pointerEvent.clientX, pointerEvent.clientY, previewDocument)
      const delay = Math.max(0, 80 - (view.performance.now() - lastPointerTime))
      if(delay === 0) flushPointer()
      else if(pointerTimer === undefined) pointerTimer = setTimeout(flushPointer, delay)
    }
    const click = (event: Event) => {
      const pointerEvent = event as PointerEvent
      const point = this.normalizedPreviewPoint(pointerEvent.clientX, pointerEvent.clientY, previewDocument)
      publish({
        kind: "click",
        click: {...point, button: pointerEvent.button},
        pointer: point,
        widgets: this.captureWidgetStates(previewDocument),
      })
    }
    const selection = () => {
      const selected = previewDocument.getSelection()
      if(!selected?.focusNode) return
      try {
        const range = previewDocument.createRange()
        range.setStart(selected.focusNode, selected.focusOffset)
        range.collapse(true)
        const rect = range.getBoundingClientRect()
        publish({
          kind: "cursor",
          cursor: this.normalizedPreviewPoint(rect.left, rect.top, previewDocument),
        })
      }
      catch {
        // A widget may replace the focus node while selectionchange is delivered.
      }
    }
    let scrollTimer: ReturnType<typeof setTimeout> | undefined
    const scroll = () => {
      if(scrollTimer !== undefined) return
      scrollTimer = setTimeout(() => {
        scrollTimer = undefined
        publish({
          kind: "scroll",
          scroll: this.previewScrollState(previewDocument),
        })
      }, 80)
    }
    const widget = () => publish({
      kind: "widget",
      widgets: this.captureWidgetStates(previewDocument),
    })

    listen(previewDocument, "pointermove", pointer, {capture: true, passive: true})
    listen(previewDocument, "pointerdown", pointer, {capture: true, passive: true})
    listen(previewDocument, "click", click, true)
    listen(previewDocument, "selectionchange", selection)
    listen(previewDocument, "scroll", scroll, {capture: true, passive: true})
    listen(view, "scroll", scroll, {passive: true})
    listen(previewDocument, "input", widget, true)
    listen(previewDocument, "change", widget, true)
    this.cleanup.push(() => {
      if(pointerTimer !== undefined) clearTimeout(pointerTimer)
      if(scrollTimer !== undefined) clearTimeout(scrollTimer)
    })

    const FrameMutationObserver = (view as unknown as {MutationObserver?: typeof MutationObserver}).MutationObserver
      ?? MutationObserver
    const observer = new FrameMutationObserver((mutations: MutationRecord[]) => {
      if(generation !== this.generation) return
      this.pendingMutations.push(...mutations)
      if(this.documentUpdateQueued) return
      this.documentUpdateQueued = true
      queueMicrotask(() => {
        if(generation !== this.generation) return
        this.documentUpdateQueued = false
        const pending = this.pendingMutations.splice(0)
        if(!pending.length) return
        publish({
          kind: "document",
          html: this.previewHTML(previewDocument),
          regions: this.mutationRegions(pending, previewDocument),
          widgets: this.captureWidgetStates(previewDocument),
          scroll: this.previewScrollState(previewDocument),
        })
      })
    })
    this.observer = observer
    observer.observe(body, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    publish({
      kind: "document",
      html: this.previewHTML(previewDocument),
      regions: [],
      widgets: this.captureWidgetStates(previewDocument),
      scroll: this.previewScrollState(previewDocument),
    })
  }

  observeHost(frame: HTMLIFrameElement, previewDocument: Document, update: () => void) {
    this.disconnect()
    this.seedWidgetPaths(previewDocument)
    previewWidgetElements(previewDocument).forEach(widget => {
      const path = previewElementPath(widget, previewDocument)
      if(path) this.baseWidgetStates.set(JSON.stringify(path), {
        path,
        html: widget.outerHTML,
        state: this.captureWidgetPublicState(widget),
      })
    })
    const view = frame.contentWindow
    view?.addEventListener("scroll", update, {passive: true})
    view?.addEventListener("resize", update)
    this.cleanup.push(() => view?.removeEventListener("scroll", update))
    this.cleanup.push(() => view?.removeEventListener("resize", update))
    update()
  }
}
