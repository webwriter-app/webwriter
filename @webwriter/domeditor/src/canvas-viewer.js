/** Shared DOM canvas camera. This module has no imports so exports can embed
 * its exact source without an editor dependency or a network request. */
export class CanvasViewer {
  constructor(slot, background, controls, onChange = () => {}) {
    slot.dispatchEvent(new Event("webwriter-canvas-viewer-dispose"))
    this.body = document.body
    this.slot = slot
    this.background = background
    this.controls = controls
    this.onChange = onChange
    this.camera = {x: 32, y: 32, zoom: 1}
    this.panning = null
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
      (el instanceof HTMLElement || el instanceof SVGSVGElement) && !el.matches("style, script, link, meta, template"))
  }

  removeMarker(element, marker) {
    element.classList.remove(marker)
    if(!element.classList.length) element.removeAttribute("class")
  }

  destroy() {
    this.stopPan()
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

  wheel(event) {
    // Leave ordinary scrolling to authored scroll containers.
    if(!event.ctrlKey && !event.metaKey) {
      let element = event.target instanceof Element ? event.target : null
      while(element && element !== document.body) {
        const style = getComputedStyle(element)
        if(/auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight
          || /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth) return
        element = element.parentElement
      }
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
    if(event.ctrlKey || event.metaKey) this.zoomAt(this.zoom * Math.exp(-event.deltaY * unit * .002), {x: event.clientX, y: event.clientY})
    else { this.camera.x -= event.deltaX * unit; this.camera.y -= event.deltaY * unit; this.applyCamera() }
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
    this.camera = {x: 48 - point.x * zoom, y: 48 - point.y * zoom, zoom}
    this.applyCamera()
  }

  /** Reveal local editing without asking the browser to scroll a finite page. */
  reveal(rect) {
    if(!this.active || this.panning) return
    const dx = rect.left < 24 ? 24 - rect.left : rect.right > window.innerWidth - 24 ? Math.min(0, window.innerWidth - 24 - rect.right) : 0
    const dy = rect.top < 24 ? 24 - rect.top : rect.bottom > window.innerHeight - 72 ? Math.min(0, window.innerHeight - 72 - rect.bottom) : 0
    if(dx || dy) { this.camera.x += dx; this.camera.y += dy; this.applyCamera() }
  }

  panAtEdge(point, rect) {
    if(!this.active) return false
    // Follow the item's visible edges, even when grabbed far from that edge.
    // For an item spanning both edges, let the pointer choose the direction.
    const edge = (position, start, end, size) =>
      start < 32 && end > size - 32 ? position : start < 32 ? Math.min(position, start) : end > size - 32 ? Math.max(position, end) : position
    const delta = (position, end) => position < 32 ? Math.min(16, (32 - position) / 3)
      : position > end - 32 ? -Math.min(16, (position - end + 32) / 3) : 0
    const x = delta(rect ? edge(point.x, rect.left, rect.right, window.innerWidth) : point.x, window.innerWidth)
    const y = delta(rect ? edge(point.y, rect.top, rect.bottom, window.innerHeight) : point.y, window.innerHeight)
    if(!x && !y) return false
    this.camera.x += x; this.camera.y += y
    this.applyCamera()
    return true
  }

  applyCamera() {
    if(!this.slot || !this.active) return
    this.slot.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.camera.zoom})`
    if(this.background) {
      this.background.style.backgroundPosition = `${this.camera.x}px ${this.camera.y}px`
      this.background.style.backgroundSize = `${20 * this.zoom}px ${20 * this.zoom}px`
      this.background.style.backgroundImage = `radial-gradient(#ccd7e3 ${this.zoom}px, transparent ${this.zoom}px)`
    }
    const output = this.controls?.querySelector("output")
    if(output) output.textContent = `${Math.round(this.zoom * 100)}%`
    this.onChange()
  }

  stopPan() {
    const pan = this.panning
    this.panning = null
    try { if(pan && this.slot?.hasPointerCapture(pan.id)) this.slot.releasePointerCapture(pan.id) } catch {}
    this.removeMarker(this.body, "◆canvas-panning")
  }
}

export const canvasControlsStyles = `
      .◆canvas-controls { position: fixed; bottom: 20px; left: 24px; z-index: 1000; display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 10px; background: white; color: #334155; box-shadow: 0 2px 10px #0001; font: 13px system-ui; }
      .◆canvas-controls[hidden] { display: none; }
      .◆canvas-controls button { font: inherit; padding: 7px 10px; border: 0; border-radius: 6px; color: inherit; background: #f1f5f9; cursor: pointer; }
      .◆canvas-controls button:hover, .◆canvas-controls button[aria-pressed=true] { background: #dbeafe; }
      .◆canvas-controls button:disabled { opacity: .5; cursor: default; }
      .◆canvas-controls output { min-width: 3em; text-align: center; }

@media print { .◆canvas-controls { display: none; } }
`

const canvasViewportStyles = `
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
export function mountCanvasReader() {
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
  const controls = document.createElement("div")
  controls.className = "◆canvas-controls"
  controls.setAttribute("part", "canvas-controls")
  controls.setAttribute("role", "toolbar")
  controls.setAttribute("aria-label", "Document canvas")
  const style = document.createElement("style")
  style.textContent = canvasControlsStyles + `
    @media print { slot { transform: none !important; width: auto !important; height: auto !important; } [part=canvas-background] { display: none; } }
  `
  appendix.append(background, controls, style)
  const viewer = new CanvasViewer(slot, background, controls)
  let hand = false
  const button = (name, label, title = label) => {
    const el = document.createElement("button")
    el.type = "button"; el.name = name; el.textContent = label; el.title = title
    el.setAttribute("aria-label", title)
    controls.append(el)
    return el
  }
  const handButton = button("hand", "Pan", "Toggle hand tool (middle-drag also pans)")
  handButton.setAttribute("aria-pressed", "false")
  button("zoom-out", "−", "Zoom out")
  controls.append(document.createElement("output"))
  button("zoom-in", "+", "Zoom in")
  button("actual-size", "100%", "Actual size")
  button("fit-content", "Fit", "Fit content")
  const release = () => viewer.stopPan()
  const ownEvent = event => {
    const origin = event.composedPath()[0]
    if(origin === slot || origin === body || origin === document.documentElement) return true
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
      if(!ownEvent(event)) return
      const origin = event.composedPath()[0]
      if(event.button === 1 || event.button === 0 && (hand || origin === slot || origin === body || origin === document.documentElement)) viewer.startPan(event)
    },
    pointermove: event => viewer.movePan(event),
    pointerup: event => viewer.endPan(event),
    pointercancel: release,
    lostpointercapture: release,
    wheel: event => { if(ownEvent(event)) viewer.wheel(event) },
    keydown: event => {
      if(event.key !== "Escape" || !ownEvent(event)) return
      hand = false
      handButton.setAttribute("aria-pressed", "false")
      viewer.removeMarker(body, "◆canvas-hand")
      release()
    },
    focusin: event => {
      if(event.target instanceof Element && body.contains(event.target)) viewer.reveal(event.target.getBoundingClientRect())
    },
  }
  const click = event => {
    const target = event.target
    if(!(target instanceof HTMLButtonElement)) return
    if(target.name === "hand") {
      hand = !hand
      handButton.setAttribute("aria-pressed", String(hand))
      if(hand) body.classList.add("◆canvas-hand")
      else { viewer.removeMarker(body, "◆canvas-hand"); release() }
    }
    else viewer.navigate(target.name)
  }
  for(const [type, handler] of Object.entries(listeners)) document.addEventListener(type, handler, {capture: true, passive: false})
  controls.addEventListener("click", click)
  window.addEventListener("blur", release)
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
    window.removeEventListener("blur", release)
    window.removeEventListener("hashchange", revealHash)
    viewer.destroy()
    viewer.removeMarker(body, "◆canvas-hand")
    background.remove(); controls.remove(); style.remove()
  }
  const observer = new MutationObserver(() => {
    if(document.body !== body || !body.classList.contains("ww-canvas") || body.classList.contains("ww-slides")
      || document.designMode === "on") destroy()
  })
  slot.addEventListener("webwriter-canvas-viewer-dispose", destroy)
  observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ["class"]})
  viewer.fit()
  revealHash()
  return {viewer, destroy}
}
