/** Shared DOM canvas camera. Exports embed this source and supply SnapDOM
 * locally, without an editor dependency or a network request. */
export const canvasGridSize = 20
const wheelPanIdleMs = 150
const startingViewSelector = "div.ww-canvas-starting-view:not([is])"

// Tabler outline icons are embedded because this module is also exported standalone.
export const canvasIcons = {
  hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11v-3.5a1.5 1.5 0 0 1 3 0v2.5"/><path d="M11 9.5v-3a1.5 1.5 0 0 1 3 0v3.5"/><path d="M14 7.5a1.5 1.5 0 0 1 3 0v2.5"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M16 16l-2.5 -2.5"/><path d="M3 7v-2a2 2 0 0 1 2 -2h2"/><path d="M3 17v2a2 2 0 0 0 2 2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M17 21h2a2 2 0 0 0 2 -2v-2"/></svg>`,
}

export function canvasStartingView(body = document.body) {
  return body.querySelector(`:scope > ${startingViewSelector}`)
}

export function isCanvasStartingView(element) {
  return element.matches(startingViewSelector) && element.parentElement === element.ownerDocument.body
}

export function createCanvasPanSurface() {
  const surface = document.createElement("div")
  surface.setAttribute("part", "canvas-pan-surface")
  surface.setAttribute("aria-hidden", "true")
  surface.hidden = true
  return surface
}

const minimapMinPadding = 64
const minimapPaddingRatio = .1
const minimapRefreshDelay = 120
const minimapExcluded = ".◆editor-only, [data-webwriter-editor-only], script, template"
const authoredClass = value => (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")

class CanvasMinimap {
  constructor(viewer, loadSnapdom) {
    this.viewer = viewer
    this.loadSnapdom = loadSnapdom
    this.bounds = null
    this.generation = 0
    this.running = null
    this.timer = null
    this.queued = false

    this.toggle = document.createElement("button")
    this.toggle.type = "button"
    this.toggle.name = "minimap-toggle"
    this.toggle.setAttribute("aria-controls", "◆canvas-minimap")
    this.toggle.setAttribute("aria-label", "Canvas minimap")
    this.toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
    this.map = document.createElement("button")
    this.map.type = "button"
    this.map.name = "minimap"
    this.map.id = "◆canvas-minimap"
    this.map.setAttribute("part", "canvas-minimap")
    this.map.setAttribute("aria-label", "Center canvas here")
    this.map.title = "Click to center the canvas"
    this.map.disabled = true
    this.map.innerHTML = '<span>Loading minimap…</span><svg aria-hidden="true"><clipPath id="◆canvas-minimap-bounds"><rect width="100%" height="100%"/></clipPath><rect width="100%" height="100%" fill="white"/><g clip-path="url(#◆canvas-minimap-bounds)"><image/><rect class="◆canvas-minimap-camera" vector-effect="non-scaling-stroke"/></g></svg>'
    this.svg = this.map.querySelector("svg")
    this.image = this.svg.querySelector("image")
    this.viewport = this.svg.querySelector(".◆canvas-minimap-camera")
    this.map.addEventListener("click", event => this.center(event))
    this.toggle.addEventListener("click", () => this.setOpen(this.map.hidden))
    this.observer = new MutationObserver(records => {
      if(records.some(record => this.contentChanged(record, records))) this.schedule()
    })
    this.resize = () => this.updateCamera()
    this.resourceLoaded = event => {
      if(event.target instanceof Element && event.target.matches('img, link[rel~="stylesheet"]')
        && !event.target.closest(minimapExcluded)) this.schedule()
    }
    window.addEventListener("resize", this.resize)
  }

  contentChanged(record, records) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement
    if(target?.closest(minimapExcluded)) return false
    if(target && isCanvasStartingView(target)) {
      return record.attributeName === "is" || record.attributeName === "class"
        && !record.oldValue?.split(/\s+/).includes("ww-canvas-starting-view")
    }
    if(record.type === "childList") {
      return [...record.addedNodes, ...record.removedNodes].some(node => {
        if(node instanceof Element) return !node.matches(minimapExcluded) && (target !== document.body || !node.matches(startingViewSelector))
        return node.nodeType === Node.TEXT_NODE && (target !== document.body && target !== document.head || node.textContent.trim())
      })
    }
    if(record.attributeName === "class") return authoredClass(record.oldValue) !== authoredClass(target.getAttribute("class"))
    if(record.attributeName === "contenteditable" && !record.oldValue && !target.getAttribute("contenteditable")
      && (target.classList.contains("◆widget-editable") || records.some(entry => entry.target === target
        && entry.attributeName === "class" && entry.oldValue?.split(/\s+/).includes("◆widget-editable")))) return false
    return true
  }

  setOpen(open) {
    this.toggle.setAttribute("aria-expanded", String(open))
    this.toggle.title = open ? "Hide minimap" : "Show minimap"
    this.map.hidden = !open
    if(open) {
      this.observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true})
      document.addEventListener("load", this.resourceLoaded, true)
      this.updateCamera()
      void this.refresh()
    }
    else {
      this.generation++
      this.observer.disconnect()
      document.removeEventListener("load", this.resourceLoaded, true)
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  schedule() {
    if(this.map.hidden) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.refresh()
    }, minimapRefreshDelay)
  }

  usedBounds() {
    const {slot, zoom} = this.viewer
    const origin = slot.getBoundingClientRect()
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for(const item of this.viewer.items()) {
      if(item.matches(minimapExcluded) || getComputedStyle(item).visibility === "hidden") continue
      const rect = item.getBoundingClientRect()
      if(!rect.width || !rect.height) continue
      left = Math.min(left, rect.left); top = Math.min(top, rect.top)
      right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom)
    }
    if(!Number.isFinite(left)) return null
    const width = (right - left) / zoom, height = (bottom - top) / zoom
    const padding = Math.max(minimapMinPadding, Math.max(width, height) * minimapPaddingRatio)
    return {x: (left - origin.left) / zoom - padding, y: (top - origin.top) / zoom - padding,
      width: width + 2 * padding, height: height + 2 * padding}
  }

  async refresh() {
    if(this.map.hidden || !this.viewer.active) return
    const generation = this.generation
    if(this.running === generation) { this.queued = true; return }
    this.running = generation
    this.queued = false
    const current = () => this.generation === generation && this.viewer.active
    let bounds = null, snapshot = null
    try {
      bounds = this.usedBounds()
      if(bounds) {
        if(!this.measurements) {
          this.measurements = document.createElement("div")
          this.measurements.setAttribute("part", "canvas-minimap-measurements")
          this.measurements.setAttribute("aria-hidden", "true")
          this.viewer.slot.getRootNode().append(this.measurements)
        }
        this.snapdom ??= Promise.resolve(this.loadSnapdom())
        const snapdom = await this.snapdom
        if(!current()) return
        const {slot} = this.viewer
        const clip = () => {
          const {zoom} = this.viewer, rect = slot.getBoundingClientRect()
          return {x: window.scrollX + rect.left + bounds.x * zoom, y: window.scrollY + rect.top + bounds.y * zoom,
            width: bounds.width * zoom, height: bounds.height * zoom}
        }
        snapshot = await snapdom(slot, {
          clip: clip(), width: Math.max(1, Math.min(540, 188 * bounds.width / bounds.height)), dpr: 1,
          exclude: element => element.matches(minimapExcluded) || isCanvasStartingView(element),
          plugins: [{
            name: "webwriter-canvas",
            beforeClone: context => { context.options.clip = clip() },
            beforeRender: context => {
              // SnapDOM flattens the slot into a fragment. Recreate its
              // containing block in the detached capture for absolute items.
              const wrapper = document.createElement("div")
              Object.assign(wrapper.style, {position: "relative", width: slot.style.width, height: slot.style.height})
              wrapper.append(context.clone)
              context.clone = wrapper
            },
          }],
        })
      }
    }
    catch {
      // A failed snapshot should not prevent canvas navigation.
    }
    finally {
      if(this.running === generation) {
        this.running = null
        if(this.queued) this.schedule()
      }
    }
    if(!current()) return
    this.bounds = bounds
    this.map.disabled = !bounds
    if(!bounds) this.map.firstElementChild.textContent = "Empty canvas"
    const meta = snapshot?.meta
    if(meta?.clip && bounds) {
      this.image.setAttribute("x", meta.clip.x - meta.contentX - bounds.x)
      this.image.setAttribute("y", meta.clip.y - meta.contentY - bounds.y)
      this.image.setAttribute("width", meta.vbW)
      this.image.setAttribute("height", meta.vbH)
      this.image.setAttribute("href", snapshot.toRaw())
    }
    else this.image.removeAttribute("href")
    if(bounds) this.svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`)
    this.updateCamera()
  }

  updateCamera() {
    if(this.map.hidden || !this.bounds) return
    const {x, y} = this.viewer.clientPoint(0, 0)
    this.viewport.setAttribute("x", x - this.bounds.x)
    this.viewport.setAttribute("y", y - this.bounds.y)
    this.viewport.setAttribute("width", window.innerWidth / this.viewer.zoom)
    this.viewport.setAttribute("height", window.innerHeight / this.viewer.zoom)
  }

  center(event) {
    if(!this.bounds || this.map.hidden) return
    const {x, y, width, height} = this.bounds
    let fx = .5, fy = .5
    if(event.detail) {
      const rect = this.svg.getBoundingClientRect(), scale = Math.min(rect.width / width, rect.height / height)
      if(!scale) return
      fx = Math.min(1, Math.max(0, .5 + (event.clientX - rect.left - rect.width / 2) / (scale * width)))
      fy = Math.min(1, Math.max(0, .5 + (event.clientY - rect.top - rect.height / 2) / (scale * height)))
    }
    this.viewer.centerOn({x: x + fx * width, y: y + fy * height})
  }

  destroy() {
    this.setOpen(false)
    window.removeEventListener("resize", this.resize)
    this.map.remove()
    this.toggle.remove()
    this.measurements?.remove()
  }
}

export class CanvasViewer {
  constructor(slot, background, controls, panSurface = null, onChange = () => {}, loadSnapdom = null) {
    slot.dispatchEvent(new Event("webwriter-canvas-viewer-dispose"))
    this.body = document.body
    this.slot = slot
    this.background = background
    this.controls = controls
    this.panSurface = panSurface
    this.onChange = onChange
    this.loadSnapdom = loadSnapdom
    this.minimap = null
    this.camera = {x: 32, y: 32, zoom: 1}
    this.panning = null
    this.wheelPanTimer = null
    this.slotStyle = slot.getAttribute("style")
    Object.assign(slot.style, {display: "block", position: "relative", width: "1280px", height: "720px", transformOrigin: "0 0"})
    this.stylesheet = new CSSStyleSheet()
    this.stylesheet.replaceSync(canvasViewportStyles)
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.stylesheet]
    document.documentElement.classList.add("◆canvas-active")
  }

  get active() { return this.slot.isConnected && document.body === this.body }
  get zoom() { return this.camera.zoom }

  items() {
    return Array.from(document.body.children).filter(el =>
      (el instanceof HTMLElement || el instanceof SVGSVGElement) && !el.matches("style, script, link, meta, template") && !isCanvasStartingView(el))
  }

  removeMarker(element, marker) {
    element.classList.remove(marker)
    if(!element.classList.length) element.removeAttribute("class")
  }

  destroy() {
    this.minimap?.destroy()
    this.stopPan()
    this.stopWheelPan()
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    if(this.slotStyle === null) this.slot.removeAttribute("style")
    else this.slot.setAttribute("style", this.slotStyle)
    this.removeMarker(document.documentElement, "◆canvas-active")
  }

  startPan(event) {
    event.preventDefault()
    event.stopImmediatePropagation()
    this.panning = {id: event.pointerId, start: {x: event.clientX, y: event.clientY}, camera: {...this.camera}}
    document.body.classList.add("◆canvas-panning")
    this.updatePanSurface()
    try { this.slot.setPointerCapture(event.pointerId) } catch {}
  }

  movePan(event) {
    const pan = this.panning
    if(!pan || event.pointerId !== pan.id) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.camera.x = pan.camera.x + event.clientX - pan.start.x
    this.camera.y = pan.camera.y + event.clientY - pan.start.y
    this.applyCamera()
  }

  endPan(event) {
    if(!this.panning || this.panning.id !== event.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.stopPan()
  }

  updatePanSurface() {
    if(!this.panSurface) return
    const hidden = !this.active || !this.panning && this.wheelPanTimer === null && !this.body.classList.contains("◆canvas-hand")
    if(this.panSurface.hidden !== hidden) this.panSurface.hidden = hidden
  }

  continuesWheelPan(event) {
    return this.wheelPanTimer !== null && !event.ctrlKey && !event.metaKey
  }

  stopWheelPan() {
    if(this.wheelPanTimer !== null) window.clearTimeout(this.wheelPanTimer)
    this.wheelPanTimer = null
    this.updatePanSurface()
  }

  wheel(event, respectScrollContainers = true) {
    const zoom = event.ctrlKey || event.metaKey
    // A fresh gesture over a scroll container belongs to that container.
    if(respectScrollContainers && !zoom && !this.continuesWheelPan(event)) {
      let element = event.target instanceof Element ? event.target : null
      while(element && element !== document.body) {
        const style = getComputedStyle(element)
        if(/auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight
          || /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth) return false
        element = element.parentElement
      }
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
    if(zoom) this.zoomAt(this.zoom * Math.exp(-event.deltaY * unit * .002), {x: event.clientX, y: event.clientY})
    else {
      // Capture listeners can stop widget handlers in this document. The
      // surface also keeps subsequent events out of embedded browsing contexts.
      if(this.wheelPanTimer !== null) window.clearTimeout(this.wheelPanTimer)
      this.wheelPanTimer = window.setTimeout(() => this.stopWheelPan(), wheelPanIdleMs)
      this.updatePanSurface()
      this.camera.x -= event.deltaX * unit; this.camera.y -= event.deltaY * unit; this.applyCamera()
    }
    return true
  }

  navigate(operation) {
    if(operation === "fit-content") this.fit()
    else if(operation === "actual-size") this.zoomAt(1)
    else if(operation === "zoom-in") this.zoomAt(this.zoom * 1.2)
    else if(operation === "zoom-out") this.zoomAt(this.zoom / 1.2)
  }

  clientPoint(x, y) {
    const rect = this.slot?.getBoundingClientRect()
    return {x: (x - (rect?.left ?? this.camera.x)) / this.zoom, y: (y - (rect?.top ?? this.camera.y)) / this.zoom}
  }

  mountMinimap() {
    if(!this.loadSnapdom) return
    const existing = this.minimap
    this.minimap ??= new CanvasMinimap(this, this.loadSnapdom)
    this.controls.append(this.minimap.toggle, this.minimap.map)
    if(!existing) this.minimap.setOpen(true)
  }

  centerOn(point) {
    const center = this.clientPoint(window.innerWidth / 2, window.innerHeight / 2)
    this.stopWheelPan()
    this.camera.x += (center.x - point.x) * this.zoom
    this.camera.y += (center.y - point.y) * this.zoom
    this.applyCamera()
  }

  zoomAt(zoom, point = {x: window.innerWidth / 2, y: window.innerHeight / 2}) {
    if(!Number.isFinite(zoom)) return
    const next = Math.max(.1, Math.min(4, zoom)), ratio = next / this.zoom
    const rect = this.slot?.getBoundingClientRect()
    this.camera.x += (point.x - (rect?.left ?? this.camera.x)) * (1 - ratio)
    this.camera.y += (point.y - (rect?.top ?? this.camera.y)) * (1 - ratio)
    this.camera.zoom = next
    this.applyCamera()
  }

  fit() {
    const rects = this.items().filter(item => getComputedStyle(item).display !== "none").map(item => item.getBoundingClientRect())
    if(!rects.length) { this.camera = {x: 32, y: 32, zoom: 1}; this.applyCamera(); return }
    const left = Math.min(...rects.map(rect => rect.left)), top = Math.min(...rects.map(rect => rect.top))
    const width = Math.max(...rects.map(rect => rect.right)) - left
    const height = Math.max(...rects.map(rect => rect.bottom)) - top
    const zoom = Math.min(1, Math.max(.1, Math.min((window.innerWidth - 96) / Math.max(1, width / this.zoom), (window.innerHeight - 128) / Math.max(1, height / this.zoom))))
    const point = this.clientPoint(left, top)
    const fittedWidth = width / this.zoom * zoom, fittedHeight = height / this.zoom * zoom
    this.camera = {x: (window.innerWidth - fittedWidth) / 2 - point.x * zoom,
      y: (window.innerHeight - fittedHeight) / 2 - point.y * zoom, zoom}
    this.applyCamera()
  }

  /** Fit the authored frame without padding or a preliminary camera change. */
  startView() {
    const frame = canvasStartingView(this.body)
    if(!frame) return false
    const rect = frame.getBoundingClientRect()
    const width = rect.width / this.zoom, height = rect.height / this.zoom
    if(!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false
    const point = this.clientPoint(rect.left, rect.top)
    const zoom = Math.min(window.innerWidth / width, window.innerHeight / height)
    if(!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(zoom) || zoom <= 0) return false
    this.camera = {x: (window.innerWidth - width * zoom) / 2 - point.x * zoom,
      y: (window.innerHeight - height * zoom) / 2 - point.y * zoom, zoom}
    this.applyCamera()
    return true
  }

  /** Reveal local editing without asking the browser to scroll a finite page. */
  reveal(rect) {
    if(!this.active || this.panning) return
    const dx = rect.left < 24 ? 24 - rect.left : rect.right > window.innerWidth - 24 ? Math.min(0, window.innerWidth - 24 - rect.right) : 0
    const dy = rect.top < 24 ? 24 - rect.top : rect.bottom > window.innerHeight - 72 ? Math.min(0, window.innerHeight - 72 - rect.bottom) : 0
    if(dx || dy) { this.camera.x += dx; this.camera.y += dy; this.applyCamera() }
  }

  panAtEdge(point) {
    if(!this.active) return false
    const delta = (position, end) => position < 32 ? Math.min(16, (32 - position) / 3)
      : position > end - 32 ? -Math.min(16, (position - end + 32) / 3) : 0
    const x = delta(point.x, window.innerWidth)
    const y = delta(point.y, window.innerHeight)
    if(!x && !y) return false
    this.camera.x += x; this.camera.y += y
    this.applyCamera()
    return true
  }

  applyCamera() {
    if(!this.slot || !this.active) return
    this.slot.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.camera.zoom})`
    if(this.background) {
      this.background.style.backgroundPosition = `${this.camera.x - canvasGridSize * this.zoom / 2}px ${this.camera.y - canvasGridSize * this.zoom / 2}px`
      const size = `${canvasGridSize * this.zoom}px ${canvasGridSize * this.zoom}px`
      const image = `radial-gradient(#ccd7e3 ${this.zoom}px, transparent ${this.zoom}px)`
      if(this.background.style.backgroundSize !== size) this.background.style.backgroundSize = size
      if(this.background.style.backgroundImage !== image) this.background.style.backgroundImage = image
    }
    const output = this.controls?.querySelector("output")
    const label = `${Math.round(this.zoom * 100)}%`
    if(output && output.textContent !== label) output.textContent = label
    this.minimap?.updateCamera()
    this.onChange()
  }

  stopPan() {
    const pan = this.panning
    this.panning = null
    try { if(pan && this.slot?.hasPointerCapture(pan.id)) this.slot.releasePointerCapture(pan.id) } catch {}
    this.removeMarker(this.body, "◆canvas-panning")
    this.updatePanSurface()
  }
}

export const canvasControlsStyles = `
      :host(.ww-canvas) > [part=canvas-pan-surface]:not([hidden]) { position: fixed; inset: 0; z-index: 999; pointer-events: auto; }
      /* Place the Hand surface above the editor's media shields and under its own toolbar. */
      :host(.◆canvas-hand) > [part=canvas-pan-surface]:not([hidden]) { z-index: 2147483643; touch-action: none; }
      :host(.◆canvas-hand) > .◆canvas-controls { z-index: 2147483643; }
      .◆canvas-controls, .◆canvas-controls * { user-select: none; -webkit-user-select: none; }
      .◆canvas-controls { position: fixed; top: 8px; right: 8px; max-width: calc(100vw - 16px); box-sizing: border-box; flex-wrap: wrap; z-index: 1000; display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid #cbd5e1; border-radius: 10px; background: white; color: #334155; box-shadow: 0 2px 10px #0001; font: 13px system-ui; }
      .◆canvas-controls[hidden] { display: none; }
      .◆canvas-controls button { font: inherit; padding: 5px 8px; border: 0; border-radius: 6px; color: inherit; background: #f1f5f9; cursor: pointer; }
      .◆canvas-controls button:hover, .◆canvas-controls button[aria-pressed=true] { background: #dbeafe; }
      .◆canvas-controls button:disabled { opacity: .5; cursor: default; }
      .◆canvas-controls button svg { display: block; width: 14px; height: 14px; }
      .◆canvas-controls output { min-width: 3em; text-align: center; }
      .◆canvas-controls button[name=minimap-toggle] { margin-inline-start: auto; }
      .◆canvas-controls button[name=minimap-toggle][aria-expanded=true] svg { transform: rotate(180deg); }
      .◆canvas-controls button[part=canvas-minimap] { flex: 0 0 100%; contain: inline-size; min-width: 0; height: 94px; padding: 0; overflow: hidden; background: #f8fafc; box-shadow: inset 0 0 0 1px #e2e8f0; cursor: crosshair; }
      .◆canvas-controls button[part=canvas-minimap][hidden] { display: none; }
      .◆canvas-controls button[part=canvas-minimap]:disabled { opacity: 1; cursor: default; color: #64748b; }
      .◆canvas-controls button[part=canvas-minimap] > svg { width: 100%; height: 100%; pointer-events: none; }
      .◆canvas-controls button[part=canvas-minimap]:disabled > svg, .◆canvas-controls button[part=canvas-minimap]:enabled > span { display: none; }
      .◆canvas-minimap-camera { fill: #3b82f620; stroke: #2563eb; stroke-width: 1.5px; }
      [part=canvas-minimap-measurements] { position: fixed; left: -100000px; top: 0; width: 0; height: 0; overflow: hidden; visibility: hidden; pointer-events: none; }

@media print { .◆canvas-controls, [part=canvas-pan-surface] { display: none; } }
`

const canvasViewportStyles = `
/* Older documents may lack this rule in their portable layout stylesheet.
 * Keep the camera bounds measurable without letting them cover content. */
body.ww-canvas > div.ww-canvas-starting-view:not([is]) { visibility: hidden; pointer-events: none; }

/* Picture is inline by default, which ignores saved dimensions in captions. */
:where(picture) { display: block; width: 100%; height: auto; }

@media screen {
/* The viewport is finite; the appendix slot supplies an unbounded camera. */
html.◆canvas-active:has(> body.ww-canvas) {
  overflow: clip;
  background: white;
  cursor: default;
}

html.◆canvas-active body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  min-height: 0 !important;
  max-width: none !important;
  overflow: visible;
  background: transparent;
  isolation: isolate;
  cursor: default;
}

/* The camera slot inherits the background cursor; authored items retain
 * native text/link cursors and any cursor supplied by their own styles. */
:where(html.◆canvas-active body > *) {
  cursor: auto;
}

body.◆canvas-hand, body.◆canvas-hand * {
  cursor: grab !important;
}

body.◆canvas-panning, body.◆canvas-panning * {
  cursor: grabbing !important;
  user-select: none !important;
}

}
`

/** Mount a disposable reader, keeping content in the body's light DOM. */
export function mountCanvasReader(loadSnapdom) {
  const body = document.body
  const template = body?.children.length === 1 ? body.firstElementChild : null
  if(!body?.classList.contains("ww-canvas") || body.classList.contains("ww-slides")
    || document.designMode === "on" || document.documentElement.classList.contains("◆canvas-active")
    || template && (template.localName.includes("-") || template.hasAttribute("is"))
      && template.getAttribute("role")?.toLowerCase().split(/\s+/).includes("document")) return null
  const appendix = body.shadowRoot ?? body.attachShadow({mode: "open"})
  let slot = Array.from(appendix.children).find(el => el.matches("slot:not([name])"))
  if(!slot) { slot = document.createElement("slot"); appendix.append(slot) }
  // Retain the default slot on teardown so the authored content stays visible.
  const background = document.createElement("div")
  background.setAttribute("part", "canvas-background")
  background.setAttribute("aria-hidden", "true")
  Object.assign(background.style, {position: "fixed", inset: "0", zIndex: "-1", pointerEvents: "none"})
  const panSurface = createCanvasPanSurface()
  const controls = document.createElement("div")
  controls.className = "◆canvas-controls"
  controls.setAttribute("part", "canvas-controls")
  controls.setAttribute("role", "toolbar")
  controls.setAttribute("aria-label", "Document canvas")
  const style = document.createElement("style")
  style.textContent = canvasControlsStyles + `
    @media print { [part=canvas-background] { display: none; } }
  `
  appendix.append(background, panSurface, controls, style)
  const viewer = new CanvasViewer(slot, background, controls, panSurface, undefined, loadSnapdom)
  let hand = false
  const button = (name, label, title = label) => {
    const el = document.createElement("button")
    el.type = "button"; el.name = name; el.textContent = label; el.title = title
    el.setAttribute("aria-label", title)
    controls.append(el)
    return el
  }
  const handButton = button("hand", "Pan", "Toggle hand tool (middle-drag also pans)")
  handButton.innerHTML = canvasIcons.hand
  handButton.setAttribute("aria-pressed", "false")
  button("zoom-out", "−", "Zoom out")
  controls.append(document.createElement("output"))
  button("zoom-in", "+", "Zoom in")
  button("actual-size", "100%", "Actual size")
  button("fit-content", "", "Fit content").innerHTML = canvasIcons.fit
  const release = () => viewer.stopPan()
  const cancelPanning = () => { release(); viewer.stopWheelPan() }
  const setHand = active => {
    hand = active
    handButton.setAttribute("aria-pressed", String(hand))
    if(hand) body.classList.add("◆canvas-hand")
    else { viewer.removeMarker(body, "◆canvas-hand"); release() }
    viewer.stopWheelPan()
  }
  const onContent = event => event.composedPath().some(target => target instanceof Element && target !== body && body.contains(target))
  const ownEvent = event => {
    const origin = event.composedPath()[0]
    if(origin === panSurface || origin === slot || origin === body || origin === document.documentElement) return true
    if(!(origin instanceof Element) || origin.getRootNode() !== document) return false
    // Widgets and interactive controls own their input, including their light DOM.
    for(let el = origin; el && el !== body; el = el.parentElement) {
      if(el.localName.includes("-") || el.hasAttribute("is")
        || el.matches("input, textarea, select, button, a, audio, video, [contenteditable]:not([contenteditable=false])")) return false
    }
    return true
  }
  const listeners = {
    pointerdown: event => {
      if(!ownEvent(event) && !(hand && event.button === 0 && onContent(event))) return
      const origin = event.composedPath()[0]
      if(event.button === 1 || event.button === 0 && (hand || origin === slot || origin === body || origin === document.documentElement)) viewer.startPan(event)
    },
    pointermove: event => viewer.movePan(event),
    pointerup: event => viewer.endPan(event),
    pointercancel: release,
    lostpointercapture: release,
    wheel: event => { if(ownEvent(event) || viewer.continuesWheelPan(event) && onContent(event)) viewer.wheel(event) },
    keydown: event => {
      if(event.key === "Escape" && (hand || ownEvent(event))) setHand(false)
    },
    focusin: event => {
      // Appendix and widget shadow focus is retargeted to their light-DOM host.
      if(event.composedPath()[0] !== event.target) return
      if(event.target instanceof Element && body.contains(event.target)) viewer.reveal(event.target.getBoundingClientRect())
    },
  }
  const click = event => {
    const target = event.target instanceof Element ? event.target.closest("button") : null
    if(!target || target.name.startsWith("minimap")) return
    if(target.name === "hand") setHand(!hand)
    else { viewer.stopWheelPan(); viewer.navigate(target.name) }
  }
  for(const [type, handler] of Object.entries(listeners)) document.addEventListener(type, handler, {capture: true, passive: false})
  controls.addEventListener("click", click)
  window.addEventListener("blur", cancelPanning)
  const revealHash = () => {
    let id
    try { id = decodeURIComponent(location.hash.slice(1)) } catch { return }
    const target = id && document.getElementById(id)
    if(target && body.contains(target)) viewer.reveal(target.getBoundingClientRect())
  }
  window.addEventListener("hashchange", revealHash)
  let destroyed = false
  const destroy = () => {
    if(destroyed) return
    destroyed = true
    observer.disconnect()
    slot.removeEventListener("webwriter-canvas-viewer-dispose", destroy)
    for(const [type, handler] of Object.entries(listeners)) document.removeEventListener(type, handler, true)
    controls.removeEventListener("click", click)
    window.removeEventListener("blur", cancelPanning)
    window.removeEventListener("hashchange", revealHash)
    viewer.destroy()
    viewer.removeMarker(body, "◆canvas-hand")
    background.remove(); panSurface.remove(); controls.remove(); style.remove()
  }
  const observer = new MutationObserver(() => {
    if(document.body !== body || !body.classList.contains("ww-canvas") || body.classList.contains("ww-slides")
      || document.designMode === "on") destroy()
  })
  slot.addEventListener("webwriter-canvas-viewer-dispose", destroy)
  observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ["class"]})
  if(!viewer.startView()) viewer.fit()
  revealHash()
  viewer.mountMinimap()
  return {viewer, destroy}
}
