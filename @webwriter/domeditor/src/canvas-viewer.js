/** Shared DOM canvas camera. Exports embed this source and supply SnapDOM
 * locally, without an editor dependency or a network request. */
export const canvasGridSize = 20
const wheelPanIdleMs = 150
const startingViewSelector = "div.ww-canvas-starting-view:not([is])"

// Tabler outline icons are embedded because this module is also exported standalone.
export const canvasIcons = {
  hand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11v-3.5a1.5 1.5 0 0 1 3 0v2.5"/><path d="M11 9.5v-3a1.5 1.5 0 0 1 3 0v3.5"/><path d="M14 7.5a1.5 1.5 0 0 1 3 0v2.5"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1 -6 6h-2h.208a6 6 0 0 1 -5.012 -2.7l-.196 -.3c-.312 -.479 -1.407 -2.388 -3.286 -5.728a1.5 1.5 0 0 1 .536 -2.022a1.867 1.867 0 0 1 2.28 .28l1.47 1.47"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M16 16l-2.5 -2.5"/><path d="M3 7v-2a2 2 0 0 1 2 -2h2"/><path d="M3 17v2a2 2 0 0 0 2 2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M17 21h2a2 2 0 0 0 2 -2v-2"/></svg>`,
  reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 21l-6 -6"/><path d="M3.268 12.043a7.017 7.017 0 0 0 6.634 4.957a7.012 7.012 0 0 0 7.043 -6.131a7 7 0 0 0 -5.314 -7.672a7.021 7.021 0 0 0 -8.241 4.403"/><path d="M3 4v4h4"/></svg>`,
}

export function groupCanvasZoomPresets(reset, fit) {
  reset.innerHTML = canvasIcons.reset
  fit.innerHTML = canvasIcons.fit
  const group = document.createElement("div")
  group.className = "◆canvas-button-group"
  group.setAttribute("role", "group")
  group.setAttribute("aria-label", "Zoom presets")
  group.append(reset, fit)
  return group
}

export function updateCanvasZoomControls(controls, zoom) {
  const output = controls?.querySelector("output")
  const label = `${Math.round(zoom * 100)}%`
  if(output && output.textContent !== label) output.textContent = label
  const reset = controls?.querySelector('button[name="actual-size"]')
  if(reset && reset.disabled !== (zoom === 1)) reset.disabled = zoom === 1
}

const startingViewIcons = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>',
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
const minimapGestureIdleDelay = 400
const cancelMinimapCapture = Symbol("cancel stale minimap capture")
const minimapExcluded = ".◆editor-only, [data-webwriter-editor-only], script, template"
const viewportAspectRatio = () => Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight)
const centerOf = ({x, y, width, height}) => ({x: x + width / 2, y: y + height / 2})
const authoredClass = value => (value ?? "").split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")

class CanvasMinimap {
  constructor(viewer, loadSnapdom, editStartingView) {
    this.viewer = viewer
    this.loadSnapdom = loadSnapdom
    this.editStartingView = editStartingView
    this.bounds = null
    this.generation = 0
    this.running = null
    this.timer = null
    this.cameraFrame = null
    this.refreshNotBefore = 0
    this.queued = false
    this.dirty = true
    this.refreshPaused = false
    this.viewportSize = {width: window.innerWidth, height: window.innerHeight}
    this.dragPointer = null
    this.startingViewDrag = null
    this.selectedStartingView = null

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
    this.map.title = "Click or drag to move the canvas"
    this.map.disabled = true
    this.map.innerHTML = '<span>Loading minimap…</span><svg aria-hidden="true"><clipPath id="◆canvas-minimap-bounds"><rect width="100%" height="100%"/></clipPath><rect width="100%" height="100%" fill="white"/><g clip-path="url(#◆canvas-minimap-bounds)"><image/></g></svg><div class="◆canvas-minimap-frame-layer ◆canvas-minimap-camera-layer" aria-hidden="true"><canvas class="◆canvas-minimap-camera"></canvas></div>'
    this.row = document.createElement("div")
    this.row.className = "◆canvas-minimap-row"
    this.surface = document.createElement("div")
    this.surface.className = "◆canvas-minimap-surface"
    this.surface.append(this.map)
    this.row.append(this.surface)
    this.createStartingViewControls()
    this.svg = this.map.querySelector("svg")
    this.image = this.svg.querySelector("image")
    this.viewport = this.map.querySelector(".◆canvas-minimap-camera")
    this.cameraResize = new ResizeObserver(entries => {
      const entry = entries.find(entry => entry.target === this.viewport)
      if(!entry || !entry.contentRect.width || !entry.contentRect.height) return
      this.cameraSize = {width: entry.contentRect.width, height: entry.contentRect.height}
      this.resizeCamera()
      this.updateCamera()
    })
    this.cameraResize.observe(this.viewport)
    this.map.addEventListener("click", event => {
      this.selectedStartingView = null
      this.updateStartingView()
      if(event.detail) this.centerAt(event.clientX, event.clientY)
      else this.centerAt()
    })
    this.map.addEventListener("pointerdown", event => {
      if(!event.isPrimary || event.button !== 0 || !this.bounds || this.dragPointer !== null) return
      try { this.map.setPointerCapture(event.pointerId) } catch { return }
      this.dragPointer = event.pointerId
    })
    this.map.addEventListener("pointermove", event => {
      if(event.pointerId === this.dragPointer) this.centerAt(event.clientX, event.clientY)
    })
    const endDrag = event => {
      if(event.pointerId === this.dragPointer) this.dragPointer = null
    }
    this.map.addEventListener("pointerup", endDrag)
    this.map.addEventListener("pointercancel", endDrag)
    this.map.addEventListener("lostpointercapture", endDrag)
    this.toggle.addEventListener("click", () => this.setOpen(this.map.hidden))
    this.observer = new MutationObserver(records => {
      this.updateStartingView()
      if(records.some(record => this.contentChanged(record, records))) this.invalidate()
    })
    // Keep invalidation active while collapsed so an unchanged capture can be
    // reused on reopening, including edits made by widgets and remote peers.
    this.observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true})
    this.resize = () => {
      const changed = this.viewportSize.width !== window.innerWidth || this.viewportSize.height !== window.innerHeight
      this.viewportSize = {width: window.innerWidth, height: window.innerHeight}
      if(!this.map.hidden) {
        this.stopStartingViewDrag()
        this.updateViewport()
      }
      // Actual viewport changes can change authored media queries and units.
      if(changed) this.invalidate()
    }
    this.resourceLoaded = event => {
      if(event.target instanceof Element && event.target.matches('img, link[rel~="stylesheet"]')
        && !event.target.closest(minimapExcluded)) this.invalidate()
    }
    document.addEventListener("load", this.resourceLoaded, true)
    window.addEventListener("resize", this.resize)
  }

  createStartingViewControls() {
    const layer = document.createElement("div")
    layer.className = "◆canvas-minimap-frame-layer"
    layer.innerHTML = `<div part="canvas-minimap-starting-view" hidden>
      <button type="button" name="minimap-select-starting-view" aria-label="Select starting view" title="Select or drag starting view" aria-pressed="false"><span></span><span></span><span></span><span></span></button>
      <span data-corner="nw"></span><span data-corner="ne"></span><span data-corner="sw"></span><span data-corner="se"></span>
    </div>`
    this.startFrame = layer.firstElementChild
    this.selectFrame = this.startFrame.firstElementChild
    this.selectFrame.addEventListener("click", () => {
      const frame = canvasStartingView(this.viewer.body)
      if(frame && this.editStartingView?.canSelect(frame)) {
        this.selectedStartingView = frame
        this.updateStartingView()
      }
    })
    for(const handle of this.startFrame.children) {
      handle.addEventListener("pointerdown", event => this.beginStartingViewDrag(event))
      handle.addEventListener("pointermove", event => this.moveStartingViewDrag(event))
      handle.addEventListener("pointerup", event => this.endStartingViewDrag(event, true))
      handle.addEventListener("pointercancel", event => this.endStartingViewDrag(event, false))
      handle.addEventListener("lostpointercapture", event => this.endStartingViewDrag(event, false))
    }
    this.surface.append(layer)
    this.startControls = document.createElement("div")
    this.startControls.className = "◆canvas-starting-view-controls"
    this.startControls.setAttribute("role", "group")
    this.startControls.setAttribute("aria-label", "Starting view")
    this.startControls.innerHTML = '<button type="button"></button><button type="button" name="starting-view">Starting view</button>'
    this.changeFrame = this.startControls.firstElementChild
    this.showFrame = this.startControls.lastElementChild
    this.changeFrame.addEventListener("click", () => {
      const frame = canvasStartingView(this.viewer.body)
      if(frame) this.editStartingView?.remove()
      else this.editStartingView?.add()
    })
    this.showFrame.addEventListener("click", () => {
      this.viewer.stopWheelPan()
      this.viewer.startView()
    })
    this.row.append(this.startControls)
  }

  updateStartingView() {
    if(this.map.hidden) return
    const frame = canvasStartingView(this.viewer.body)
    const editing = this.editStartingView
    if(this.startingViewDrag && !this.canContinueStartingViewDrag()) this.stopStartingViewDrag()
    const label = frame ? "Delete starting view" : "Add starting view"
    this.startControls.hidden = !editing && !frame
    this.changeFrame.hidden = !editing
    this.changeFrame.disabled = !(frame ? editing?.canRemove(frame) : editing?.canAdd())
    if(this.changeFrame.title !== label) {
      this.changeFrame.name = frame ? "delete-starting-view" : "add-starting-view"
      this.changeFrame.title = label
      this.changeFrame.setAttribute("aria-label", label)
      this.changeFrame.innerHTML = frame ? startingViewIcons.remove : startingViewIcons.add
    }
    const rect = this.startingViewDrag?.rect ?? this.viewer.startingViewBounds(frame)
    const selectable = Boolean(frame && editing?.canSelect(frame))
    if(!selectable || this.selectedStartingView !== frame) this.selectedStartingView = null
    const selected = Boolean(this.selectedStartingView)
    this.showFrame.disabled = !frame
    this.selectFrame.disabled = !selectable
    this.selectFrame.setAttribute("aria-pressed", String(selected))
    this.startFrame.classList.toggle("movable", selectable && editing.canMove(frame))
    this.startFrame.classList.toggle("resizable", selected && editing.canResize(frame))
    this.startFrame.hidden = !rect || !this.bounds
    if(!rect || !this.bounds) return
    const {x, y, width, height} = this.bounds
    Object.assign(this.startFrame.style, {left: `${(rect.x - x) / width * 100}%`, top: `${(rect.y - y) / height * 100}%`,
      width: `${rect.width / width * 100}%`, height: `${rect.height / height * 100}%`})
  }

  beginStartingViewDrag(event) {
    const frame = canvasStartingView(this.viewer.body), rect = this.viewer.startingViewBounds(frame)
    const handle = event.currentTarget, corner = handle.dataset.corner
    if(event.button !== 0 || !event.isPrimary || this.startingViewDrag || !rect || !this.bounds
      || !this.editStartingView?.canSelect(frame) || (corner
        ? this.selectedStartingView !== frame || !this.editStartingView.canResize(frame)
        : !this.editStartingView.canMove(frame))) return
    const map = this.map.getBoundingClientRect()
    const scale = Math.min(map.width / this.bounds.width, map.height / this.bounds.height)
    if(!scale) return
    try { handle.setPointerCapture(event.pointerId) } catch { return }
    event.preventDefault()
    this.selectedStartingView = frame
    this.startingViewDrag = {frame, style: frame.getAttribute("style"), id: event.pointerId, handle, corner, rect, start: rect,
      scale, x: event.clientX, y: event.clientY}
    this.updateStartingView()
  }

  canContinueStartingViewDrag() {
    const {frame, style, corner} = this.startingViewDrag
    return frame === canvasStartingView(this.viewer.body) && frame.getAttribute("style") === style
      && this.editStartingView.canSelect(frame) && (corner ? this.editStartingView.canResize(frame) : this.editStartingView.canMove(frame))
  }

  moveStartingViewDrag(event) {
    const drag = this.startingViewDrag
    if(!drag || event.pointerId !== drag.id) return
    if(!this.canContinueStartingViewDrag()) { this.stopStartingViewDrag(); this.updateStartingView(); return }
    const {start, scale, corner} = drag
    let dx = (event.clientX - drag.x) / scale, dy = (event.clientY - drag.y) / scale
    const rect = {...start}
    if(corner) {
      const west = corner.endsWith("w"), north = corner.startsWith("n")
      rect.width = Math.max(Math.min(10 / scale, start.width), start.width + (west ? -dx : dx))
      rect.height = Math.max(Math.min(10 / scale, start.height), start.height + (north ? -dy : dy))
      if(west) rect.x += start.width - rect.width
      if(north) rect.y += start.height - rect.height
    }
    else {
      const {x, y, width, height} = this.bounds
      dx = Math.max(Math.min(0, x - start.x), Math.min(Math.max(0, x + width - start.x - start.width), dx))
      dy = Math.max(Math.min(0, y - start.y), Math.min(Math.max(0, y + height - start.y - start.height), dy))
      rect.x += dx
      rect.y += dy
    }
    if(["x", "y", "width", "height"].every(key => rect[key] === drag.rect[key])) return
    drag.rect = rect
    if(!corner) this.viewer.centerOn(centerOf(rect))
    this.updateStartingView()
  }

  endStartingViewDrag(event, commit) {
    if(this.startingViewDrag?.id !== event.pointerId) return
    if(commit) this.moveStartingViewDrag(event)
    const drag = this.startingViewDrag
    this.stopStartingViewDrag()
    if(commit && drag) {
      const {rect, start, frame, corner} = drag
      if(corner) {
        if(rect.width !== start.width || rect.height !== start.height) this.editStartingView.resize(frame, rect)
      }
      else if(rect.x !== start.x || rect.y !== start.y) this.editStartingView.move(frame, {x: rect.x - start.x, y: rect.y - start.y})
    }
    this.updateStartingView()
  }

  stopStartingViewDrag() {
    const drag = this.startingViewDrag
    this.startingViewDrag = null
    if(drag?.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id)
  }

  contentChanged(record, records) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement
    if(target?.closest(minimapExcluded)) return false
    if(record.type === "childList") {
      return [...record.addedNodes, ...record.removedNodes].some(node => {
        if(node instanceof Element) return !node.matches(minimapExcluded)
        return node.nodeType === Node.TEXT_NODE && (target !== document.body && target !== document.head || node.textContent.trim())
      })
    }
    if(record.attributeName === "class") return authoredClass(record.oldValue) !== authoredClass(target.getAttribute("class"))
    if(record.attributeName === "contenteditable" && !record.oldValue && !target.getAttribute("contenteditable")
      && (target.classList.contains("◆widget-editable") || records.some(entry => entry.target === target
        && entry.attributeName === "class" && entry.oldValue?.split(/\s+/).includes("◆widget-editable")))) return false
    if(record.type === "attributes" && record.oldValue === target.getAttributeNS(record.attributeNamespace, record.attributeName)) return false
    return true
  }

  setOpen(open) {
    this.toggle.setAttribute("aria-expanded", String(open))
    this.toggle.title = open ? "Hide minimap" : "Show minimap"
    this.row.hidden = this.map.hidden = !open
    if(open) {
      // A close and reopen can happen before mutation observers are delivered.
      const records = this.observer.takeRecords()
      if(records.some(record => this.contentChanged(record, records))) this.dirty = true
      this.updateViewport()
      void this.refresh()
    }
    else {
      this.stopDrag()
      this.stopStartingViewDrag()
      this.selectedStartingView = null
      this.generation++
      if(this.cameraFrame !== null) cancelAnimationFrame(this.cameraFrame)
      this.cameraFrame = null
      clearTimeout(this.timer)
      this.timer = null
      this.queued = false
      this.refreshNotBefore = 0
    }
  }

  invalidate() {
    this.dirty = true
    if(this.running) this.running.stale = true
    this.schedule()
  }

  setRefreshPaused(paused) {
    if(this.refreshPaused === paused) return
    this.refreshPaused = paused
    if(paused) {
      if(this.timer !== null) {
        clearTimeout(this.timer)
        this.timer = null
        this.queued = true
      }
      if(this.running?.generation === this.generation) {
        this.running.stale = true
        this.dirty = true
        this.queued = true
      }
    }
    else if(this.queued) {
      this.refreshNotBefore = Date.now() + minimapGestureIdleDelay
      this.schedule(minimapGestureIdleDelay)
    }
  }

  schedule(delay = minimapRefreshDelay) {
    if(this.map.hidden || !this.dirty) return
    if(this.refreshPaused) { this.queued = true; return }
    clearTimeout(this.timer)
    const due = Math.max(Date.now() + delay, this.refreshNotBefore)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.refresh()
    }, Math.max(0, due - Date.now()))
  }

  usedBounds(aspectRatio) {
    const {slot, zoom} = this.viewer
    const origin = slot.getBoundingClientRect()
    this.origin = {x: origin.left - this.viewer.camera.x, y: origin.top - this.viewer.camera.y}
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for(const item of this.viewer.items()) {
      if(item.matches(minimapExcluded) || getComputedStyle(item).visibility === "hidden") continue
      const rect = item.getBoundingClientRect()
      if(!rect.width || !rect.height) continue
      left = Math.min(left, rect.left); top = Math.min(top, rect.top)
      right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom)
    }
    const frame = canvasStartingView(this.viewer.body)
    const view = this.viewer.startingViewBounds(frame)
    if(view) {
      const x = origin.left + view.x * zoom, y = origin.top + view.y * zoom
      left = Math.min(left, x); top = Math.min(top, y)
      right = Math.max(right, x + view.width * zoom); bottom = Math.max(bottom, y + view.height * zoom)
    }
    if(!Number.isFinite(left)) return null
    const width = (right - left) / zoom, height = (bottom - top) / zoom
    const padding = Math.max(minimapMinPadding, Math.max(width, height) * minimapPaddingRatio)
    const mapWidth = Math.max(width + 2 * padding, (height + 2 * padding) * aspectRatio)
    const mapHeight = mapWidth / aspectRatio
    return {x: (left - origin.left) / zoom - (mapWidth - width) / 2,
      y: (top - origin.top) / zoom - (mapHeight - height) / 2,
      width: mapWidth, height: mapHeight}
  }

  async refresh() {
    if(this.map.hidden || !this.viewer.active || !this.dirty) return
    if(this.refreshNotBefore > Date.now()) {
      this.schedule(this.refreshNotBefore - Date.now())
      return
    }
    this.refreshNotBefore = 0
    const generation = this.generation
    if(this.refreshPaused || this.running || this.viewer.panning || this.viewer.wheelPanTimer !== null) { this.queued = true; return }
    const running = this.running = {generation, stale: false}
    this.queued = false
    const {innerWidth, innerHeight} = window
    const current = () => !running.stale && this.generation === generation && this.viewer.active
    const cancelIfStale = () => { if(!current()) throw cancelMinimapCapture }
    let bounds = null, snapshot = null, thumbnail = null
    try {
      bounds = this.usedBounds(viewportAspectRatio())
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
          fast: false,
          // SnapDOM catches exclude predicate errors, so stale captures must
          // be canceled through plugin hooks. This prunes a stale clone if its
          // traversal continues until the afterClone hook can stop it.
          exclude: element => !current() || element.matches(minimapExcluded) || isCanvasStartingView(element),
          plugins: [{
            name: "webwriter-canvas",
            beforeSnap: cancelIfStale,
            beforeClone: context => { cancelIfStale(); context.options.clip = clip() },
            afterClone: cancelIfStale,
            beforeRender: context => {
              cancelIfStale()
              // SnapDOM flattens the slot into a fragment. Recreate its
              // containing block in the detached capture for absolute items.
              const wrapper = document.createElement("div")
              Object.assign(wrapper.style, {position: "relative", width: slot.style.width, height: slot.style.height})
              wrapper.append(context.clone)
              context.clone = wrapper
            },
          }],
        })
        cancelIfStale()
        // Rasterize once so repainting the minimap only draws a bitmap.
        thumbnail = (await snapshot.toPng()).src
      }
    }
    catch(error) {
      // A failed snapshot should not prevent canvas navigation.
      if(error === cancelMinimapCapture) this.dirty = true
    }
    finally {
      if(this.running === running) {
        this.running = null
        if(this.queued) this.schedule()
      }
    }
    if(!current() || window.innerWidth !== innerWidth || window.innerHeight !== innerHeight) {
      this.dirty = true
      return
    }
    // Keep the previous image and retry later if capture or rasterization failed.
    if(bounds && !thumbnail) return
    this.dirty = false
    if(this.startingViewDrag && (!bounds || ["x", "y", "width", "height"].some(key => Math.abs(bounds[key] - this.bounds[key]) > .01))) {
      this.stopStartingViewDrag()
    }
    this.bounds = bounds
    this.map.disabled = !bounds
    if(!bounds) {
      this.stopDrag()
      this.map.firstElementChild.textContent = "Empty canvas"
    }
    const meta = snapshot?.meta
    if(meta?.clip && bounds) {
      this.image.setAttribute("x", meta.clip.x - meta.contentX - bounds.x)
      this.image.setAttribute("y", meta.clip.y - meta.contentY - bounds.y)
      this.image.setAttribute("width", meta.vbW)
      this.image.setAttribute("height", meta.vbH)
      this.image.setAttribute("href", thumbnail)
    }
    else this.image.removeAttribute("href")
    if(bounds) {
      this.svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`)
      this.surface.style.setProperty("--canvas-minimap-viewbox-ratio", bounds.width / bounds.height)
    }
    this.updateCamera()
    this.updateStartingView()
  }

  updateViewport() {
    const {left, top} = this.viewer.slot.getBoundingClientRect()
    this.origin = {x: left - this.viewer.camera.x, y: top - this.viewer.camera.y}
    this.surface.style.setProperty("--canvas-minimap-ratio", viewportAspectRatio())
    this.resizeCamera()
    this.updateCamera()
    this.updateStartingView()
  }

  resizeCamera() {
    if(!this.cameraSize) return
    const {width, height} = this.cameraSize, dpr = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.round(width * dpr)), pixelHeight = Math.max(1, Math.round(height * dpr))
    if(this.viewport.width !== pixelWidth) this.viewport.width = pixelWidth
    if(this.viewport.height !== pixelHeight) this.viewport.height = pixelHeight
    this.cameraContext ??= this.viewport.getContext("2d")
    if(!this.cameraContext) return
    this.cameraContext.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0)
    this.cameraContext.fillStyle = "#3b82f620"
    this.cameraContext.strokeStyle = "#2563eb"
    this.cameraContext.lineWidth = 1.5
  }

  updateCamera() {
    if(this.cameraFrame !== null) cancelAnimationFrame(this.cameraFrame)
    this.cameraFrame = null
    if(this.map.hidden || !this.bounds || !this.viewer.active || !this.cameraContext) return
    const {x, y, zoom} = this.viewer.camera
    const {width, height} = this.cameraSize, scaleX = width / this.bounds.width, scaleY = height / this.bounds.height
    // Keep pan updates out of DOM/style invalidation and SVG rasterization.
    const left = (-(this.origin.x + x) / zoom - this.bounds.x) * scaleX
    const top = (-(this.origin.y + y) / zoom - this.bounds.y) * scaleY
    this.cameraContext.clearRect(0, 0, width, height)
    this.cameraContext.fillRect(left, top, window.innerWidth / zoom * scaleX, window.innerHeight / zoom * scaleY)
    this.cameraContext.strokeRect(left, top, window.innerWidth / zoom * scaleX, window.innerHeight / zoom * scaleY)
  }

  cameraChanged() {
    // A yielding clone may have read geometry before this camera move. Keep
    // the previous image until a capture can complete at a stable camera.
    if(this.running) {
      this.running.stale = true
      this.dirty = true
      this.queued = true
    }
    if(!this.map.hidden && this.bounds && this.cameraFrame === null) this.cameraFrame = requestAnimationFrame(() => {
      this.cameraFrame = null
      this.updateCamera()
    })
  }

  centerAt(clientX, clientY) {
    if(!this.bounds || this.map.hidden) return
    const {x, y, width, height} = this.bounds
    let fx = .5, fy = .5
    if(clientX !== undefined && clientY !== undefined) {
      const rect = this.svg.getBoundingClientRect(), scale = Math.min(rect.width / width, rect.height / height)
      if(!scale) return
      fx = Math.min(1, Math.max(0, .5 + (clientX - rect.left - rect.width / 2) / (scale * width)))
      fy = Math.min(1, Math.max(0, .5 + (clientY - rect.top - rect.height / 2) / (scale * height)))
    }
    this.viewer.centerOn({x: x + fx * width, y: y + fy * height})
  }

  stopDrag() {
    const pointer = this.dragPointer
    this.dragPointer = null
    if(pointer !== null && this.map.hasPointerCapture(pointer)) this.map.releasePointerCapture(pointer)
  }

  destroy() {
    this.setOpen(false)
    this.observer.disconnect()
    this.cameraResize.disconnect()
    document.removeEventListener("load", this.resourceLoaded, true)
    window.removeEventListener("resize", this.resize)
    this.row.remove()
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
    this.appliedZoom = 1
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
    if(this.appliedZoom !== 1) document.dispatchEvent(new Event("webwriter-canvas-zoom"))
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
    if(this.minimap?.queued) this.minimap.schedule()
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

  mountMinimap(toolbar, editStartingView) {
    if(!this.loadSnapdom || this.minimap) return
    this.minimap = new CanvasMinimap(this, this.loadSnapdom, editStartingView)
    toolbar.append(this.minimap.toggle)
    this.controls.append(this.minimap.row)
    this.minimap.setOpen(true)
  }

  updateStartingView() { this.minimap?.updateStartingView() }

  setMinimapRefreshPaused(paused) { this.minimap?.setRefreshPaused(paused) }

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

  startingViewBounds(frame = canvasStartingView(this.body)) {
    if(!frame) return null
    const rect = frame.getBoundingClientRect()
    const width = rect.width / this.zoom, height = rect.height / this.zoom
    const {x, y} = this.clientPoint(rect.left, rect.top)
    if(![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
    return {x, y, width, height}
  }

  /** Fit the authored frame without padding or a preliminary camera change. */
  startView() {
    const bounds = this.startingViewBounds()
    if(!bounds) return false
    const {x, y, width, height} = bounds
    const zoom = Math.min(window.innerWidth / width, window.innerHeight / height)
    if(!Number.isFinite(zoom) || zoom <= 0) return false
    this.camera = {x: (window.innerWidth - width * zoom) / 2 - x * zoom,
      y: (window.innerHeight - height * zoom) / 2 - y * zoom, zoom}
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
    if(this.zoom !== this.appliedZoom) {
      const previousZoom = this.appliedZoom
      this.appliedZoom = this.zoom
      document.dispatchEvent(new CustomEvent("webwriter-canvas-zoom", {detail: {previousZoom, zoom: this.zoom}}))
    }
    if(this.background) {
      this.background.style.backgroundPosition = `${this.camera.x - canvasGridSize * this.zoom / 2}px ${this.camera.y - canvasGridSize * this.zoom / 2}px`
      const size = `${canvasGridSize * this.zoom}px ${canvasGridSize * this.zoom}px`
      const image = `radial-gradient(#ccd7e3 ${this.zoom}px, transparent ${this.zoom}px)`
      if(this.background.style.backgroundSize !== size) this.background.style.backgroundSize = size
      if(this.background.style.backgroundImage !== image) this.background.style.backgroundImage = image
    }
    updateCanvasZoomControls(this.controls, this.zoom)
    this.minimap?.cameraChanged()
    this.onChange()
  }

  stopPan() {
    const pan = this.panning
    this.panning = null
    try { if(pan && this.slot?.hasPointerCapture(pan.id)) this.slot.releasePointerCapture(pan.id) } catch {}
    this.removeMarker(this.body, "◆canvas-panning")
    if(this.minimap?.queued) this.minimap.schedule()
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
      .◆canvas-controls.◆canvas-viewer-controls:not([hidden]) { display: grid; align-items: stretch; }
      .◆canvas-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; }
      .◆canvas-controls button[name=minimap-toggle] { margin-inline-start: auto; background: transparent; }
      .◆canvas-controls button[name=minimap-toggle][aria-expanded=true] svg { transform: rotate(180deg); }
      .◆canvas-button-group, .◆canvas-starting-view-controls { display: inline-flex; border-radius: 6px; overflow: hidden; }
      .◆canvas-button-group { flex-shrink: 0; }
      .◆canvas-controls :is(.◆canvas-button-group, .◆canvas-starting-view-controls) button { border-radius: 0; }
      .◆canvas-controls :is(.◆canvas-button-group, .◆canvas-starting-view-controls) button + button { border-inline-start: 1px solid #cbd5e1; }
      .◆canvas-controls :is(.◆canvas-button-group, .◆canvas-starting-view-controls) button:focus-visible { outline-offset: -2px; }
      .◆canvas-minimap-row { position: relative; contain: inline-size; display: grid; justify-items: center; }
      @media (orientation: portrait) {
        .◆canvas-minimap-row:has(> .◆canvas-starting-view-controls:not([hidden])) { justify-items: start; }
      }
      .◆canvas-minimap-row[hidden], .◆canvas-starting-view-controls[hidden] { display: none; }
      .◆canvas-minimap-surface { position: relative; width: min(100%, calc(min(120px, 30vh) * var(--canvas-minimap-ratio, 1))); aspect-ratio: var(--canvas-minimap-ratio, 1); }
      .◆canvas-controls button[part=canvas-minimap] { box-sizing: border-box; display: block; width: 100%; height: 100%; padding: 0; overflow: hidden; background: #f8fafc; box-shadow: inset 0 0 0 1px #e2e8f0; cursor: crosshair; touch-action: none; }
      .◆canvas-controls button[part=canvas-minimap]:active { cursor: grabbing; }
      .◆canvas-controls button[part=canvas-minimap][hidden] { display: none; }
      .◆canvas-controls button[part=canvas-minimap]:disabled { opacity: 1; cursor: default; color: #64748b; }
      .◆canvas-controls button[part=canvas-minimap] > svg { width: 100%; height: 100%; pointer-events: none; }
      .◆canvas-controls button[part=canvas-minimap]:disabled > :is(svg, .◆canvas-minimap-camera-layer), .◆canvas-controls button[part=canvas-minimap]:enabled > span { display: none; }
      .◆canvas-minimap-camera { position: absolute; inset: 0; display: block; width: 100%; height: 100%; transform: translateZ(0); }
      .◆canvas-starting-view-controls { position: absolute; z-index: 1; right: 2px; bottom: 2px; border: 1px solid #cbd5e1; background: rgb(255 255 255 / .5); }
      .◆canvas-controls .◆canvas-starting-view-controls button { padding: 3px 5px; background: transparent; font-size: 11px; }
      .◆canvas-controls .◆canvas-starting-view-controls button:not(:disabled):hover { background: #dbeafe; }
      .◆canvas-controls .◆canvas-starting-view-controls button[hidden] { display: none; }
      .◆canvas-controls .◆canvas-starting-view-controls button[hidden] + button { border-inline-start: 0; }
      .◆canvas-minimap-frame-layer {
        position: absolute; inset: 0; margin: auto; pointer-events: none; overflow: clip;
        width: min(100%, calc(100% / var(--canvas-minimap-ratio, 1) * var(--canvas-minimap-viewbox-ratio, 1)));
        aspect-ratio: var(--canvas-minimap-viewbox-ratio, 1);
      }
      [part=canvas-minimap-starting-view] { position: absolute; }
      .◆canvas-controls button[name=minimap-select-starting-view] {
        position: absolute; inset: 0; box-sizing: border-box; width: 100%; height: 100%; padding: 0;
        border: 1px dashed #475569; border-radius: 0; background: transparent; pointer-events: none; touch-action: none;
      }
      .◆canvas-controls button[name=minimap-select-starting-view]:is(:hover, [aria-pressed=true]) { border-color: #1d4ed8; background: transparent; }
      .◆canvas-controls button[name=minimap-select-starting-view]:disabled { opacity: 1; }
      [name=minimap-select-starting-view] span { position: absolute; touch-action: none; }
      [name=minimap-select-starting-view]:enabled span { pointer-events: auto; }
      [name=minimap-select-starting-view] span:nth-child(1) { inset: -4px 0 auto; height: 6px; }
      [name=minimap-select-starting-view] span:nth-child(2) { inset: auto 0 -4px; height: 6px; }
      [name=minimap-select-starting-view] span:nth-child(3) { inset: 0 auto 0 -4px; width: 6px; }
      [name=minimap-select-starting-view] span:nth-child(4) { inset: 0 -4px 0 auto; width: 6px; }
      [part=canvas-minimap-starting-view].movable button span { cursor: grab; }
      [part=canvas-minimap-starting-view].movable button:active span { cursor: grabbing; }
      [part=canvas-minimap-starting-view] > [data-corner] {
        position: absolute; display: none; box-sizing: border-box; width: 8px; height: 8px;
        border: 1px solid #1d4ed8; border-radius: 2px; background: white; pointer-events: auto; touch-action: none;
      }
      [part=canvas-minimap-starting-view].resizable > [data-corner] { display: block; }
      [part=canvas-minimap-starting-view] > [data-corner=nw] { top: -4px; left: -4px; cursor: nwse-resize; }
      [part=canvas-minimap-starting-view] > [data-corner=ne] { top: -4px; right: -4px; cursor: nesw-resize; }
      [part=canvas-minimap-starting-view] > [data-corner=sw] { bottom: -4px; left: -4px; cursor: nesw-resize; }
      [part=canvas-minimap-starting-view] > [data-corner=se] { bottom: -4px; right: -4px; cursor: nwse-resize; }
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
  controls.className = "◆canvas-controls ◆canvas-viewer-controls"
  const toolbar = document.createElement("div")
  toolbar.className = "◆canvas-toolbar"
  controls.append(toolbar)
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
    toolbar.append(el)
    return el
  }
  const handButton = button("hand", "Pan", "Toggle hand tool (middle-drag also pans)")
  handButton.innerHTML = canvasIcons.hand
  handButton.setAttribute("aria-pressed", "false")
  button("zoom-out", "−", "Zoom out")
  toolbar.append(document.createElement("output"))
  button("zoom-in", "+", "Zoom in")
  toolbar.append(groupCanvasZoomPresets(button("actual-size", "", "Reset zoom to 100%"), button("fit-content", "", "Fit to view")))
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
    if(!target || !toolbar.contains(target) || target.name.startsWith("minimap")) return
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
  viewer.mountMinimap(toolbar)
  return {viewer, destroy}
}
