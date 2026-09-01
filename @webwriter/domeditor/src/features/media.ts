import {EditorFeature} from "."
import {stripActiveContent} from "../active-content"
import {$, adoptStylesheet, createStylesheet, getContainer, isElement} from "../utility"
import {
  isEmptyMedia,
  isImageMapHotspotShape,
  isMediaType,
  isTimedMediaResourceType,
  isWebsiteType,
  mediaAttributeOptions,
  mediaContainerForNode,
  mediaDefaultHTML,
  mediaElementSelector,
  imageMapAreaAttributeOptions,
  mediaSourceAttribute,
  mediaSourceTarget,
  timedMediaResourceAttributeOptions,
  websiteTypes,
  type MediaSelectionState,
  type MediaType,
  type ImageMapAreaState,
  type ImageMapHotspotShape,
  type TimedMediaResourceState,
  type TimedMediaResourceType,
  type WebsiteType,
} from "../media"

const mediaSelector = mediaElementSelector
const htmlNamespace = "http://www.w3.org/1999/xhtml"
const maximumMediaFallbackLength = 1_000_000

const isTimedResourceElement = (node: Node, resource?: TimedMediaResourceType): node is Element => (
  node instanceof Element
  && node.namespaceURI === htmlNamespace
  && (resource ? node.localName === resource : isTimedMediaResourceType(node.localName))
)

const stateAttributes = (element: Element) => Object.fromEntries(Array.from(element.attributes).flatMap(attribute => {
  if(attribute.name !== "class") return [[attribute.name, attribute.value]]
  const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
  return classes.length ? [["class", classes.join(" ")]] : []
}))

const equalAttributes = (element: Element, expected: Record<string, string>) => {
  const current = stateAttributes(element)
  const names = Object.keys(current)
  return names.length === Object.keys(expected).length
    && names.every(name => current[name] === expected[name])
}

const mediaPlaceholderStylesheet = createStylesheet(`
  :host {
    position: fixed;
    z-index: 2147483644;
    display: none;
    box-sizing: border-box;
    place-items: center;
    overflow: auto;
    padding: 1.25rem;
    color: #f3f4f6;
    background: rgb(31 41 55 / 94%);
    font: 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
    user-select: none;
    container-type: inline-size;
  }
  :host([data-open]) { display: grid; }
  .content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: min(48rem, 100%);
    gap: .65rem;
  }
  button, input { box-sizing: border-box; font: inherit; }
  .file {
    flex: 0 0 auto;
    min-height: 2.75rem;
    padding: .65rem 1rem;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    color: #343740;
    background: white;
    font-weight: 600;
    cursor: pointer;
  }
  .file:hover, .apply:hover { background: #eef4fb; }
  .or { flex: 0 0 auto; color: #d1d5db; font-size: 1rem; }
  .url-row { display: flex; flex: 1 1 20rem; min-width: 0; gap: .4rem; }
  .url {
    min-width: 0;
    min-height: 2.6rem;
    flex: 1 1 auto;
    padding: .55rem .7rem;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    color: #343740;
    background: white;
  }
  .apply {
    flex: 0 0 auto;
    padding: .55rem .8rem;
    border: 1px solid #c7c9ce;
    border-radius: .35rem;
    color: #343740;
    background: white;
    cursor: pointer;
  }
  input:focus, button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
  @container (max-width: 34rem) {
    .content {
      display: grid;
      width: min(32rem, 100%);
      gap: .75rem;
      justify-items: center;
    }
    .url-row { width: 100%; }
  }
`)

class MediaPlaceholder {
  readonly element = document.createElement("div")
  readonly root: ShadowRoot
  target: Element | null = null
  onSource: ((target: Element, source: string) => void) | null = null
  onInteractionChange: (() => void) | null = null
  private focusWithin = false
  private pickerOpen = false
  private interactionActive = false

  get isInteracting() {
    return this.element.isConnected && this.interactionActive
  }

  constructor() {
    this.element.classList.add("◆", "◆editor-only", "◆media-placeholder")
    this.element.contentEditable = "false"
    this.element.setAttribute("part", "media-placeholder")
    this.element.setAttribute("aria-hidden", "true")
    const root = this.element.attachShadow({mode: "open"})
    this.root = root
    adoptStylesheet(root, mediaPlaceholderStylesheet)
    root.innerHTML = `
      <div class="content">
        <button class="file" type="button"></button>
        <input class="picker" type="file" hidden />
        <span class="or">or</span>
        <div class="url-row">
          <input class="url" type="url" />
          <button class="apply" type="button">Apply</button>
        </div>
      </div>
    `

    const picker = root.querySelector<HTMLInputElement>(".picker")!
    const url = root.querySelector<HTMLInputElement>(".url")!
    const file = root.querySelector<HTMLButtonElement>(".file")!
    root.addEventListener("pointerdown", event => {
      if(!(event.target instanceof Element) || !event.target.closest("button, input")) return
      this.beginInteraction()
    })
    root.addEventListener("focusin", () => {
      this.focusWithin = true
      this.beginInteraction()
    })
    root.addEventListener("focusout", () => {
      this.focusWithin = false
      queueMicrotask(() => {
        if(this.focusWithin || this.pickerOpen) return
        this.interactionActive = false
        this.onInteractionChange?.()
      })
    })
    file.addEventListener("click", () => {
      this.pickerOpen = true
      picker.click()
    })
    root.querySelector<HTMLButtonElement>(".apply")!.addEventListener("click", () => this.applyUrl())
    url.addEventListener("keydown", event => {
      if(event.key !== "Enter") return
      event.preventDefault()
      this.applyUrl()
    })
    picker.addEventListener("change", () => {
      this.pickerOpen = false
      const file = picker.files?.[0]
      if(!file || !this.target) return
      const target = this.target
      const reader = new FileReader()
      reader.addEventListener("load", () => {
        if(typeof reader.result === "string") this.onSource?.(target, reader.result)
      }, {once: true})
      reader.readAsDataURL(file)
      picker.value = ""
    })
    picker.addEventListener("cancel", () => {
      this.pickerOpen = false
      file.focus({preventScroll: true})
      this.beginInteraction()
    })
    this.element.addEventListener("pointerdown", event => event.stopPropagation())
  }

  private beginInteraction() {
    this.interactionActive = true
    this.onInteractionChange?.()
  }

  private applyUrl() {
    const input = this.root.querySelector<HTMLInputElement>(".url")!
    const source = input.value.trim()
    if(this.target && source) this.onSource?.(this.target, source)
  }

  showFor(target: Element) {
    this.target = target
    const type = target.localName as MediaType
    const noun = type === "picture" || type === "img" ? "image"
      : isWebsiteType(type) ? "website" : type
    const file = this.root.querySelector<HTMLButtonElement>(".file")!
    const picker = this.root.querySelector<HTMLInputElement>(".picker")!
    const url = this.root.querySelector<HTMLInputElement>(".url")!
    file.textContent = `Select ${noun} file`
    picker.accept = type === "picture" || type === "img" ? "image/*"
      : type === "audio" ? "audio/*"
      : type === "video" ? "video/*"
      : ".html,.htm,text/html"
    url.placeholder = `Enter ${noun} URL`
    const rect = target.getBoundingClientRect()
    Object.assign(this.element.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    this.element.setAttribute("data-open", "")
    this.element.removeAttribute("aria-hidden")
  }

  hide() {
    this.target = null
    this.element.removeAttribute("data-open")
    this.element.setAttribute("aria-hidden", "true")
  }
}

const imageMapOverlayStylesheet = createStylesheet(`
  :host {
    position: fixed;
    z-index: 2147483643;
    display: none;
    box-sizing: border-box;
    pointer-events: none;
  }
  :host([data-open]) { display: block; }
  :host([data-drawing]) { pointer-events: auto; cursor: crosshair; }
  svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .hotspot {
    fill: rgb(37 99 235 / 16%);
    stroke: #2563eb;
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .preview {
    fill: rgb(245 158 11 / 22%);
    stroke: #f59e0b;
    stroke-width: 2;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .vertex {
    fill: #f59e0b;
    stroke: white;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .panel {
    position: absolute;
    top: .5rem;
    left: .5rem;
    display: none;
    align-items: center;
    gap: .4rem;
    max-width: calc(100% - 1rem);
    padding: .35rem .45rem;
    border-radius: .3rem;
    color: white;
    background: rgb(31 41 55 / 94%);
    box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
    font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    cursor: default;
    pointer-events: auto;
  }
  :host([data-drawing]) .panel { display: flex; }
  .instruction { min-width: 0; }
  button {
    flex: 0 0 auto;
    min-height: 1.65rem;
    padding: .2rem .45rem;
    border: 1px solid #c7c9ce;
    border-radius: .25rem;
    color: #343740;
    background: white;
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: #eef4fb; }
  button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
  button:disabled { opacity: .5; cursor: default; }
`)

type ImageMapGeometry = {
  left: number
  top: number
  width: number
  height: number
  coordinateWidth: number
  coordinateHeight: number
}

type ImageMapDrawingSession = {
  image: HTMLImageElement
  map: HTMLMapElement
  shape: ImageMapHotspotShape
  geometry: ImageMapGeometry
}

const imageMapGeometry = (image: HTMLImageElement): ImageMapGeometry | null => {
  const rect = image.getBoundingClientRect()
  if(!Number.isFinite(rect.left) || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0) return null
  const authoredWidth = Number(image.getAttribute("width"))
  const authoredHeight = Number(image.getAttribute("height"))
  const coordinateWidth = image.naturalWidth || (authoredWidth > 0 ? authoredWidth : rect.width)
  const coordinateHeight = image.naturalHeight || (authoredHeight > 0 ? authoredHeight : rect.height)
  if(!Number.isFinite(coordinateWidth) || !Number.isFinite(coordinateHeight)
    || coordinateWidth <= 0 || coordinateHeight <= 0) return null
  return {left: rect.left, top: rect.top, width: rect.width, height: rect.height, coordinateWidth, coordinateHeight}
}

const equalImageMapGeometry = (left: ImageMapGeometry | null, right: ImageMapGeometry) => !!left
  && (["left", "top", "width", "height", "coordinateWidth", "coordinateHeight"] as const)
    .every(name => Math.abs(left[name] - right[name]) < 0.5)

class ImageMapOverlay {
  readonly element = document.createElement("div")
  readonly root: ShadowRoot
  image: HTMLImageElement | null = null
  map: HTMLMapElement | null = null
  onCommit: ((session: ImageMapDrawingSession, coords: string) => boolean) | null = null
  private session: ImageMapDrawingSession | null = null
  private startPoint: [number, number] | null = null
  private currentPoint: [number, number] | null = null
  private polygonPoints: Array<[number, number]> = []

  constructor() {
    this.element.classList.add("◆", "◆editor-only", "◆image-map-overlay")
    this.element.contentEditable = "false"
    this.element.tabIndex = -1
    this.element.setAttribute("part", "image-map-overlay")
    this.element.setAttribute("aria-hidden", "true")
    this.root = this.element.attachShadow({mode: "open"})
    adoptStylesheet(this.root, imageMapOverlayStylesheet)
    this.root.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="areas"></g>
        <g class="preview-layer"></g>
      </svg>
      <div class="panel">
        <span class="instruction"></span>
        <button class="finish" type="button">Finish polygon</button>
        <button class="cancel" type="button">Cancel</button>
      </div>
    `
    const svg = this.root.querySelector<SVGSVGElement>("svg")!
    svg.addEventListener("pointerdown", this.handlePointerDown)
    svg.addEventListener("pointermove", this.handlePointerMove)
    svg.addEventListener("pointerup", this.handlePointerUp)
    svg.addEventListener("click", this.handleClick)
    svg.addEventListener("dblclick", event => {
      if(this.session?.shape !== "poly") return
      event.preventDefault()
      this.finishPolygon()
    })
    this.root.querySelector<HTMLButtonElement>(".finish")!.addEventListener("click", () => this.finishPolygon())
    this.root.querySelector<HTMLButtonElement>(".cancel")!.addEventListener("click", () => this.cancelDrawing())
    this.element.addEventListener("keydown", event => {
      if(event.key === "Escape") {
        event.preventDefault()
        this.cancelDrawing()
      }
      else if(event.key === "Enter" && this.session?.shape === "poly") {
        event.preventDefault()
        this.finishPolygon()
      }
    })
  }

  get isDrawing() {
    return this.session !== null
  }

  showFor(image: HTMLImageElement, map: HTMLMapElement) {
    this.image = image
    this.map = map
    const geometry = imageMapGeometry(image)
    if(!geometry) {
      this.element.removeAttribute("data-open")
      this.element.setAttribute("aria-hidden", "true")
      return
    }
    Object.assign(this.element.style, {
      left: `${geometry.left}px`,
      top: `${geometry.top}px`,
      width: `${geometry.width}px`,
      height: `${geometry.height}px`,
    })
    const svg = this.root.querySelector<SVGSVGElement>("svg")!
    svg.setAttribute("viewBox", `0 0 ${geometry.coordinateWidth} ${geometry.coordinateHeight}`)
    this.element.setAttribute("data-open", "")
    this.element.removeAttribute("aria-hidden")
    this.renderAreas(geometry)
  }

  hide() {
    this.cancelDrawing()
    this.image = null
    this.map = null
    this.element.removeAttribute("data-open")
    this.element.setAttribute("aria-hidden", "true")
  }

  startDrawing(shape: ImageMapHotspotShape) {
    if(!isImageMapHotspotShape(shape) || !this.image || !this.map) return false
    const geometry = imageMapGeometry(this.image)
    if(!geometry || !this.image.isConnected || !this.map.isConnected) return false
    this.session = {image: this.image, map: this.map, shape, geometry}
    this.startPoint = null
    this.currentPoint = null
    this.polygonPoints = []
    this.element.setAttribute("data-drawing", shape)
    this.element.removeAttribute("aria-hidden")
    const instruction = shape === "rect" ? "Drag across the rectangular hotspot."
      : shape === "circle" ? "Drag from the hotspot centre to its edge."
      : "Click each polygon corner, then finish or double-click."
    this.root.querySelector<HTMLElement>(".instruction")!.textContent = instruction
    const finish = this.root.querySelector<HTMLButtonElement>(".finish")!
    finish.hidden = shape !== "poly"
    finish.disabled = true
    this.renderPreview()
    this.element.focus({preventScroll: true})
    return true
  }

  private pointForEvent(event: PointerEvent): [number, number] | null {
    const geometry = this.session?.geometry
    if(!geometry) return null
    const x = Math.max(0, Math.min(geometry.coordinateWidth,
      (event.clientX - geometry.left) * geometry.coordinateWidth / geometry.width))
    const y = Math.max(0, Math.min(geometry.coordinateHeight,
      (event.clientY - geometry.top) * geometry.coordinateHeight / geometry.height))
    return [Math.round(x), Math.round(y)]
  }

  private handlePointerDown = (event: PointerEvent) => {
    if(!this.session || this.session.shape === "poly" || event.button !== 0) return
    const point = this.pointForEvent(event)
    if(!point) return
    event.preventDefault()
    this.startPoint = point
    this.currentPoint = point
    ;(event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId)
    this.renderPreview()
  }

  private handlePointerMove = (event: PointerEvent) => {
    if(!this.session || this.session.shape === "poly" || !this.startPoint) return
    const point = this.pointForEvent(event)
    if(!point) return
    this.currentPoint = point
    this.renderPreview()
  }

  private handlePointerUp = (event: PointerEvent) => {
    if(!this.session || this.session.shape === "poly" || !this.startPoint) return
    const point = this.pointForEvent(event)
    if(point) this.currentPoint = point
    const coords = this.currentShapeCoordinates()
    if(coords) this.commit(coords)
    else this.cancelDrawing()
  }

  private handleClick = (event: MouseEvent) => {
    if(!this.session || this.session.shape !== "poly" || event.detail > 1) return
    const point = this.pointForEvent(event as PointerEvent)
    if(!point) return
    event.preventDefault()
    this.polygonPoints.push(point)
    this.root.querySelector<HTMLButtonElement>(".finish")!.disabled = this.polygonPoints.length < 3
    this.renderPreview()
  }

  private finishPolygon() {
    if(this.session?.shape !== "poly" || this.polygonPoints.length < 3) return
    this.commit(this.polygonPoints.flat().join(","))
  }

  private currentShapeCoordinates() {
    if(!this.session || !this.startPoint || !this.currentPoint) return null
    const [startX, startY] = this.startPoint
    const [endX, endY] = this.currentPoint
    if(this.session.shape === "rect") {
      const left = Math.min(startX, endX)
      const top = Math.min(startY, endY)
      const right = Math.max(startX, endX)
      const bottom = Math.max(startY, endY)
      return right > left && bottom > top ? [left, top, right, bottom].join(",") : null
    }
    const radius = Math.round(Math.hypot(endX - startX, endY - startY))
    return radius > 0 ? [startX, startY, radius].join(",") : null
  }

  private commit(coords: string) {
    const session = this.session
    const committed = Boolean(session && equalImageMapGeometry(imageMapGeometry(session.image), session.geometry)
      && this.onCommit?.(session, coords))
    this.clearDrawing()
    if(committed && this.image && this.map) this.showFor(this.image, this.map)
    else if(!committed) this.hide()
  }

  private cancelDrawing() {
    this.clearDrawing()
    if(this.image && this.map) this.showFor(this.image, this.map)
  }

  private clearDrawing() {
    this.session = null
    this.startPoint = null
    this.currentPoint = null
    this.polygonPoints = []
    this.element.removeAttribute("data-drawing")
    this.root.querySelector<SVGElement>(".preview-layer")!.replaceChildren()
  }

  private renderAreas(geometry: ImageMapGeometry) {
    const group = this.root.querySelector<SVGElement>(".areas")!
    const shapes = Array.from(this.map?.querySelectorAll("area") ?? []).flatMap(area => {
      const shape = area.getAttribute("shape")?.toLowerCase() || "rect"
      const coords = (area.getAttribute("coords") ?? "").split(",").map(value => Number(value.trim()))
      if(coords.some(value => !Number.isFinite(value))) return []
      let element: SVGElement | null = null
      if(shape === "rect" && coords.length === 4) {
        element = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        element.setAttribute("x", String(Math.min(coords[0], coords[2])))
        element.setAttribute("y", String(Math.min(coords[1], coords[3])))
        element.setAttribute("width", String(Math.abs(coords[2] - coords[0])))
        element.setAttribute("height", String(Math.abs(coords[3] - coords[1])))
      }
      else if(shape === "circle" && coords.length === 3) {
        element = document.createElementNS("http://www.w3.org/2000/svg", "circle")
        element.setAttribute("cx", String(coords[0]))
        element.setAttribute("cy", String(coords[1]))
        element.setAttribute("r", String(Math.max(0, coords[2])))
      }
      else if(shape === "poly" && coords.length >= 6 && coords.length % 2 === 0) {
        element = document.createElementNS("http://www.w3.org/2000/svg", "polygon")
        element.setAttribute("points", Array.from({length: coords.length / 2}, (_, index) => (
          `${coords[index * 2]},${coords[index * 2 + 1]}`
        )).join(" "))
      }
      else if(shape === "default") {
        element = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        element.setAttribute("x", "0")
        element.setAttribute("y", "0")
        element.setAttribute("width", String(geometry.coordinateWidth))
        element.setAttribute("height", String(geometry.coordinateHeight))
      }
      if(!element) return []
      element.classList.add("hotspot")
      return [element]
    })
    group.replaceChildren(...shapes)
  }

  private renderPreview() {
    const group = this.root.querySelector<SVGElement>(".preview-layer")!
    const elements: SVGElement[] = []
    if(this.session?.shape === "poly") {
      if(this.polygonPoints.length) {
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polyline")
        polygon.setAttribute("points", this.polygonPoints.map(point => point.join(",")).join(" "))
        polygon.classList.add("preview")
        elements.push(polygon)
        this.polygonPoints.forEach(([x, y]) => {
          const vertex = document.createElementNS("http://www.w3.org/2000/svg", "circle")
          vertex.setAttribute("cx", String(x))
          vertex.setAttribute("cy", String(y))
          vertex.setAttribute("r", "4")
          vertex.classList.add("vertex")
          elements.push(vertex)
        })
      }
    }
    else {
      const coords = this.currentShapeCoordinates()?.split(",").map(Number)
      if(coords && this.session?.shape === "rect") {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        rect.setAttribute("x", String(coords[0]))
        rect.setAttribute("y", String(coords[1]))
        rect.setAttribute("width", String(coords[2] - coords[0]))
        rect.setAttribute("height", String(coords[3] - coords[1]))
        rect.classList.add("preview")
        elements.push(rect)
      }
      else if(coords && this.session?.shape === "circle") {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
        circle.setAttribute("cx", String(coords[0]))
        circle.setAttribute("cy", String(coords[1]))
        circle.setAttribute("r", String(coords[2]))
        circle.classList.add("preview")
        elements.push(circle)
      }
    }
    group.replaceChildren(...elements)
  }
}

/** Media insertion and editing. Empty media are marked only with editor
 * classes; their interactive UI lives in the BODY shadow appendix. */
export class MediaFeature extends EditorFeature {
  private observer: MutationObserver | null = null
  private refreshQueued = false
  private mediaPlaceholder: MediaPlaceholder | null = null
  private imageMapOverlayController: ImageMapOverlay | null = null

  get isPlaceholderInteraction() {
    return this.mediaPlaceholder?.isInteracting ?? false
  }

  get placeholder() {
    if(!this.mediaPlaceholder) {
      this.mediaPlaceholder = new MediaPlaceholder()
      this.mediaPlaceholder.onSource = (target, source) => this.setSource(target, source)
      this.mediaPlaceholder.onInteractionChange = this.scheduleRefresh
      this.editor.addAppendix(this.mediaPlaceholder.element)
    }
    return this.mediaPlaceholder
  }

  get imageMapOverlay() {
    if(!this.imageMapOverlayController) {
      this.imageMapOverlayController = new ImageMapOverlay()
      this.imageMapOverlayController.onCommit = (session, coords) => this.commitImageMapArea(session, coords)
      this.editor.addAppendix(this.imageMapOverlayController.element)
    }
    return this.imageMapOverlayController
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    const FrameMutationObserver = document.defaultView?.MutationObserver
    if(FrameMutationObserver) {
      this.observer = new FrameMutationObserver(() => this.scheduleRefresh())
      try {
        this.observer.observe(document.body, {subtree: true, childList: true, attributes: true})
      }
      catch {
        // Scoped-registry startup can briefly pair the iframe document with a
        // MutationObserver from the document being replaced. Explicit media
        // operations still refresh synchronously, so observation is optional.
        this.observer.disconnect()
        this.observer = null
      }
    }
    window.addEventListener("resize", this.scheduleRefresh)
    document.addEventListener("scroll", this.scheduleRefresh, true)
    this.refresh()
  }

  disable() {
    if(!this.isEnabled) return
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener("resize", this.scheduleRefresh)
    document.removeEventListener("scroll", this.scheduleRefresh, true)
    this.mediaPlaceholder?.element.remove()
    this.mediaPlaceholder = null
    this.imageMapOverlayController?.element.remove()
    this.imageMapOverlayController = null
    document.querySelectorAll(".◆media-empty").forEach(element => this.setEmptyMarker(element, false))
    super.disable()
  }

  passiveListeners = {
    selectionchange: () => this.scheduleRefresh(),
  }

  activeListeners = {
    pointerdown: (event: PointerEvent) => {
      const target = event.target instanceof Node ? mediaContainerForNode(event.target) : null
      if(!target || !isEmptyMedia(target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      $.selectElement(target)
      this.editor.features.selection.processSelection()
      this.editor.postSelectionPath()
      this.refresh()
    },
  }

  actions = {
    insertMedia: ({media}: {type: "insertMedia", media: MediaType}) => {
      if(!isMediaType(media)) throw new TypeError(`Unsupported media type '${String(media)}'`)
      const template = document.createElement("template")
      template.innerHTML = mediaDefaultHTML(media)
      const element = template.content.firstElementChild!
      this.editor.features.manipulation.insert(template.content)
      if(element.isConnected) {
        $.selectElement(element)
        this.editor.features.selection.processSelection()
      }
      this.refresh()
    },
    setMediaAttribute: ({name, value}: {type: "setMediaAttribute", name: string, value: string | null}) => {
      const element = this.selectedMedia()
      if(!element || !mediaAttributeOptions[element.localName as MediaType].some(option => option.name === name)) {
        throw new TypeError(`Attribute '${name}' is not editable for the selected media`)
      }
      const target = mediaSourceTarget(element)
      value === null ? target.removeAttribute(name) : target.setAttribute(name, value)
      this.refresh()
    },
    addTimedMediaResource: ({resource}: {type: "addTimedMediaResource", resource: TimedMediaResourceType}) => {
      if(!isTimedMediaResourceType(resource)) throw new TypeError(`Unsupported media resource '${String(resource)}'`)
      const media = this.selectedTimedMedia()
      if(!media) return false
      const element = document.createElement(resource)
      if(resource === "track") element.setAttribute("kind", "subtitles")
      const resources = this.directResources(media, resource)
      const reference = resources.at(-1)?.nextSibling
        ?? (resource === "source" ? this.directResources(media, "track")[0] : null)
        ?? Array.from(media.childNodes).find(node => !isTimedResourceElement(node))
        ?? null
      media.insertBefore(element, reference)
      this.finishTimedMediaChange()
      return true
    },
    setTimedMediaResourceAttribute: ({resource, index, expected, name, value}: {
      type: "setTimedMediaResourceAttribute"
      resource: TimedMediaResourceType
      index: number
      expected: Record<string, string>
      name: string
      value: string | null
    }) => {
      const target = this.timedMediaResource(resource, index, expected)
      if(!target || !timedMediaResourceAttributeOptions[resource].some(option => option.name === name)) return false
      value === null ? target.removeAttribute(name) : target.setAttribute(name, value)
      this.finishTimedMediaChange()
      return true
    },
    moveTimedMediaResource: ({resource, index, expected, direction}: {
      type: "moveTimedMediaResource"
      resource: TimedMediaResourceType
      index: number
      expected: Record<string, string>
      direction: -1 | 1
    }) => {
      if(direction !== -1 && direction !== 1) throw new TypeError("Media resources can only move up or down")
      const target = this.timedMediaResource(resource, index, expected)
      const media = this.selectedTimedMedia()
      if(!target || !media || target.parentElement !== media) return false
      const resources = this.directResources(media, resource)
      const position = resources.indexOf(target)
      const neighbour = resources[position + direction]
      if(!neighbour) return false
      if(direction < 0) media.insertBefore(target, neighbour)
      else media.insertBefore(target, neighbour.nextSibling)
      this.finishTimedMediaChange()
      return true
    },
    removeTimedMediaResource: ({resource, index, expected}: {
      type: "removeTimedMediaResource"
      resource: TimedMediaResourceType
      index: number
      expected: Record<string, string>
    }) => {
      const target = this.timedMediaResource(resource, index, expected)
      if(!target) return false
      target.remove()
      this.finishTimedMediaChange()
      return true
    },
    setTimedMediaFallbackHTML: ({html, expected}: {
      type: "setTimedMediaFallbackHTML"
      html: string
      expected: string
    }) => {
      if(typeof html !== "string" || typeof expected !== "string") throw new TypeError("Media fallback content must be HTML")
      if(html.length > maximumMediaFallbackLength) throw new RangeError("Media fallback content is too large")
      const media = this.selectedTimedMedia()
      if(!media || this.fallbackHTML(media) !== expected) return false
      const template = document.createElement("template")
      template.innerHTML = html
      this.editor.clearEditingArtifacts(template.content)
      const removedUnsafeItems = stripActiveContent(template.content)
      const fragment = template.content
      if(fragment.querySelector("source, track, audio, video")) {
        throw new TypeError("Media fallback content cannot contain media resources or nested timed media")
      }
      Array.from(media.childNodes)
        .filter(node => !isTimedResourceElement(node))
        .forEach(node => node.remove())
      media.append(fragment)
      this.finishTimedMediaChange()
      return {changed: true, removedUnsafeItems}
    },
    addImageMap: ({}: {type: "addImageMap"}) => {
      const image = this.selectedImage(true)
      if(!image || this.associatedImageMap(image)) return false
      const authoredName = image.getAttribute("usemap")?.trim()
      const requestedName = authoredName?.startsWith("#") ? authoredName.slice(1).trim() : ""
      const name = requestedName || this.uniqueImageMapName()
      const map = document.createElement("map")
      map.setAttribute("name", name)
      const media = mediaContainerForNode(image) ?? image
      let anchor: Element = media
      if(anchor.parentElement?.matches("a")) anchor = anchor.parentElement
      if(!anchor.parentNode) return false
      anchor.after(map)
      image.setAttribute("usemap", `#${name}`)
      this.finishImageMapChange()
      return true
    },
    removeImageMap: ({}: {type: "removeImageMap"}) => {
      const image = this.selectedImage(false)
      const map = image ? this.associatedImageMap(image) : null
      if(!image || !map) return false
      image.removeAttribute("usemap")
      const shared = this.imagesUsingMap(map).length > 0
      if(!shared) map.remove()
      this.finishImageMapChange()
      return {removedMap: !shared}
    },
    startImageMapDrawing: ({shape}: {type: "startImageMapDrawing", shape: ImageMapHotspotShape}) => {
      if(!isImageMapHotspotShape(shape)) throw new TypeError(`Unsupported hotspot shape '${String(shape)}'`)
      const image = this.selectedImage(false)
      const map = image ? this.associatedImageMap(image) : null
      if(!image || !map) return false
      this.imageMapOverlay.showFor(image, map)
      return this.imageMapOverlay.startDrawing(shape)
    },
    setImageMapAreaAttribute: ({path, expected, name, value}: {
      type: "setImageMapAreaAttribute"
      path: number[]
      expected: Record<string, string>
      name: string
      value: string | null
    }) => {
      const area = this.selectedImageMapArea(path, expected)
      if(!area || !imageMapAreaAttributeOptions.some(option => option.name === name)) return false
      value === null ? area.removeAttribute(name) : area.setAttribute(name, value)
      this.finishImageMapChange()
      return true
    },
    removeImageMapArea: ({path, expected}: {
      type: "removeImageMapArea"
      path: number[]
      expected: Record<string, string>
    }) => {
      const area = this.selectedImageMapArea(path, expected)
      if(!area) return false
      area.remove()
      this.finishImageMapChange()
      return true
    },
    wrapMediaInFigure: ({}: {type: "wrapMediaInFigure"}) => {
      const selected = this.selectedMedia()
      if(!selected || selected.closest("figure")) return false
      const wrapped = this.editor.features.manipulation.addSection("figure")
      if(!wrapped || !selected.isConnected) return false
      $.selectElement(selected)
      this.editor.features.selection.processSelection()
      this.refresh()
      return true
    },
    switchImageType: ({image}: {type: "switchImageType", image: "picture" | "img"}) => {
      if(image !== "picture" && image !== "img") throw new TypeError(`Unsupported image type '${String(image)}'`)
      const selected = this.selectedMedia()
      if(!selected || !selected.matches("picture, img") || selected.localName === image) return
      let replacement: Element
      if(image === "img") {
        replacement = selected.querySelector(":scope > img") ?? document.createElement("img")
        selected.replaceWith(replacement)
      }
      else {
        replacement = document.createElement("picture")
        selected.replaceWith(replacement)
        replacement.append(selected)
      }
      $.selectElement(replacement)
      this.editor.features.selection.processSelection()
      this.refresh()
    },
    switchWebsiteType: ({website}: {type: "switchWebsiteType", website: WebsiteType}) => {
      if(!isWebsiteType(website)) throw new TypeError(`Unsupported website type '${String(website)}'`)
      const selected = this.selectedMedia()
      if(!selected || !isWebsiteType(selected.localName) || selected.localName === website) return

      const replacement = document.createElement(website)
      const allowed = new Set(mediaAttributeOptions[website].map(option => option.name))
      const websiteAttributes = new Set(websiteTypes.flatMap(type => mediaAttributeOptions[type].map(option => option.name)))
      const source = selected.getAttribute(mediaSourceAttribute(selected))
      Array.from(selected.attributes).forEach(attribute => {
        if(attribute.name === "class") {
          const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
          if(classes.length) replacement.setAttribute("class", classes.join(" "))
          return
        }
        if(attribute.name === "src" || attribute.name === "data") return
        if(websiteAttributes.has(attribute.name) && !allowed.has(attribute.name)) return
        replacement.setAttribute(attribute.name, attribute.value)
      })
      if(source) replacement.setAttribute(mediaSourceAttribute(website), source)
      selected.replaceWith(replacement)
      $.selectElement(replacement)
      this.editor.features.selection.processSelection()
      this.refresh()
    },
  } as const

  getState(): MediaSelectionState | undefined {
    const element = this.selectedMedia()
    if(!element) return
    const target = mediaSourceTarget(element, false)
    const state: MediaSelectionState = {
      type: element.localName as MediaType,
      attributes: stateAttributes(target),
    }
    if(element.matches("audio, video")) {
      state.sources = this.resourceState(element, "source")
      state.tracks = this.resourceState(element, "track")
      state.fallbackHTML = this.fallbackHTML(element)
    }
    if(element.matches("picture, img")) {
      const image = this.imageForMedia(element, false)
      const map = image ? this.associatedImageMap(image) : null
      state.imageMap = image && map ? {
        name: map.getAttribute("name") ?? "",
        shared: this.imagesUsingMap(map).some(candidate => candidate !== image),
        areas: this.imageMapAreaState(map),
      } : null
    }
    return state
  }

  private selectedMedia() {
    const selected = $.selectedElement
    if(selected?.matches(mediaSelector)) return mediaContainerForNode(selected)
    const container = $.anchorContainer
    return isElement(container) ? mediaContainerForNode(container) : null
  }

  private imageForMedia(media: Element, create: boolean) {
    const target = mediaSourceTarget(media, create)
    return target.matches("img") && target.namespaceURI === htmlNamespace
      ? target as HTMLImageElement
      : null
  }

  private selectedImage(create: boolean) {
    const media = this.selectedMedia()
    return media?.matches("picture, img") ? this.imageForMedia(media, create) : null
  }

  private associatedImageMap(image: HTMLImageElement) {
    const usemap = image.getAttribute("usemap")?.trim()
    if(!usemap?.startsWith("#") || usemap.length < 2) return null
    const name = usemap.slice(1)
    return Array.from(document.querySelectorAll<HTMLMapElement>("map[name]"))
      .find(map => map.namespaceURI === htmlNamespace && map.getAttribute("name") === name) ?? null
  }

  private imagesUsingMap(map: HTMLMapElement) {
    const name = map.getAttribute("name")
    if(!name) return []
    return Array.from(document.querySelectorAll<HTMLImageElement>("img[usemap]"))
      .filter(image => image.namespaceURI === htmlNamespace && image.getAttribute("usemap")?.trim() === `#${name}`)
  }

  private uniqueImageMapName() {
    const names = new Set(Array.from(document.querySelectorAll("map[name]"), map => map.getAttribute("name")))
    let name = "image-map"
    let suffix = 2
    while(names.has(name)) name = `image-map-${suffix++}`
    return name
  }

  private pathFrom(root: Node, node: Node) {
    const path: number[] = []
    let current: Node | null = node
    while(current && current !== root) {
      const parent: ParentNode | null = current.parentNode
      if(!parent) return null
      const index = Array.from(parent.childNodes).indexOf(current as ChildNode)
      if(index < 0) return null
      path.unshift(index)
      current = parent as Node
    }
    return current === root ? path : null
  }

  private nodeAtPath(root: Node, path: number[]) {
    return path.reduce<Node | null>((node, index) => node?.childNodes.item(index) ?? null, root)
  }

  private imageMapAreaState(map: HTMLMapElement): ImageMapAreaState[] {
    return Array.from(map.querySelectorAll("area")).flatMap(area => {
      if(area.namespaceURI !== htmlNamespace) return []
      const path = this.pathFrom(map, area)
      return path ? [{path, attributes: stateAttributes(area)}] : []
    })
  }

  private selectedImageMapArea(path: number[], expected: Record<string, string>) {
    if(!Array.isArray(path) || path.some(index => !Number.isInteger(index) || index < 0)
      || !expected || typeof expected !== "object" || Array.isArray(expected)
      || Object.entries(expected).some(([name, value]) => !name || typeof value !== "string")) return null
    const image = this.selectedImage(false)
    const map = image ? this.associatedImageMap(image) : null
    const area = map ? this.nodeAtPath(map, path) : null
    return area instanceof Element
      && area.namespaceURI === htmlNamespace
      && area.localName === "area"
      && equalAttributes(area, expected)
      ? area as HTMLAreaElement
      : null
  }

  private commitImageMapArea(session: ImageMapDrawingSession, coords: string) {
    if(!session.image.isConnected || !session.map.isConnected
      || this.associatedImageMap(session.image) !== session.map
      || !isImageMapHotspotShape(session.shape)) return false
    const area = document.createElement("area")
    area.setAttribute("shape", session.shape)
    area.setAttribute("coords", coords)
    area.setAttribute("alt", "")
    session.map.append(area)
    const media = mediaContainerForNode(session.image)
    if(media) {
      $.selectElement(media)
      this.editor.features.selection.processSelection()
    }
    this.finishImageMapChange()
    return true
  }

  private finishImageMapChange() {
    this.refresh()
    this.editor.postSelectionPath()
  }

  private selectedTimedMedia() {
    const media = this.selectedMedia()
    return media?.matches("audio, video") ? media : null
  }

  private directResources(media: Element, resource: TimedMediaResourceType) {
    return Array.from(media.children).filter(child => isTimedResourceElement(child, resource))
  }

  private resourceState(media: Element, resource: TimedMediaResourceType): TimedMediaResourceState[] {
    return Array.from(media.childNodes).flatMap((node, index) => (
      isTimedResourceElement(node, resource)
        ? [{index, attributes: stateAttributes(node)}]
        : []
    ))
  }

  private timedMediaResource(resource: TimedMediaResourceType, index: number, expected: Record<string, string>) {
    if(!isTimedMediaResourceType(resource)
      || !Number.isInteger(index) || index < 0
      || !expected || typeof expected !== "object" || Array.isArray(expected)
      || Object.entries(expected).some(([name, value]) => !name || typeof value !== "string")) return null
    const media = this.selectedTimedMedia()
    const target = media?.childNodes.item(index)
    return target && isTimedResourceElement(target, resource) && equalAttributes(target, expected)
      ? target
      : null
  }

  private fallbackHTML(media: Element) {
    const fragment = document.createDocumentFragment()
    Array.from(media.childNodes).forEach(node => {
      if(!isTimedResourceElement(node)) fragment.append(node.cloneNode(true))
    })
    this.editor.clearEditingArtifacts(fragment)
    const container = document.createElement("div")
    container.append(fragment)
    return container.innerHTML
  }

  private finishTimedMediaChange() {
    this.refresh()
    this.editor.postSelectionPath()
  }

  private setSource(element: Element, source: string) {
    if(!element.isConnected || !element.matches(mediaSelector)) return
    const target = mediaSourceTarget(element)
    target.setAttribute(mediaSourceAttribute(target), source)
    if(element.matches("audio, video")) element.setAttribute("controls", "")
    $.selectElement(element)
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath()
    this.refresh()
  }

  private setEmptyMarker(element: Element, empty: boolean) {
    element.classList.toggle("◆media-empty", empty)
    if(empty) element.classList.add("◆")
    else if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
      element.classList.remove("◆")
      if(!element.classList.length) element.removeAttribute("class")
    }
  }

  private scheduleRefresh = () => {
    if(this.refreshQueued) return
    this.refreshQueued = true
    queueMicrotask(() => {
      this.refreshQueued = false
      if(this.isEnabled) this.refresh()
    })
  }

  private refresh() {
    document.querySelectorAll(mediaSelector).forEach(element => {
      const empty = isEmptyMedia(element) && !(element.matches("img") && element.closest("picture"))
      if(element.classList.contains("◆media-empty") !== empty) this.setEmptyMarker(element, empty)
    })
    // A control pointerdown can clear the authored Selection before focusin.
    // Keep the affordance bound to its existing media for the full interaction
    // without restoring the Selection, which would steal focus from the input.
    const retained = this.mediaPlaceholder?.isInteracting ? this.mediaPlaceholder.target : null
    const selected = retained ?? this.selectedMedia()
    if(selected?.isConnected && isEmptyMedia(selected)) this.placeholder.showFor(selected)
    else this.placeholder.hide()

    const image = selected?.matches("picture, img") ? this.imageForMedia(selected, false) : null
    const map = image ? this.associatedImageMap(image) : null
    if(image?.isConnected && map?.isConnected) this.imageMapOverlay.showFor(image, map)
    else this.imageMapOverlayController?.hide()
  }
}
