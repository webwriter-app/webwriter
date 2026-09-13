import {EditorFeature, type DocumentListenerMap} from "."
import {$, clearInlinePlacement, createStylesheet, isAppendixInteraction, isFormControlInteraction, isWidgetShadowInteraction, removeEditorMarker} from "../utility"
import {getDocumentRoot} from "../document-template"
import {canvasClass, canvasStyles, documentLayoutMode, slideLayoutRole, type DocumentLayoutMode, type DocumentLayoutState} from "../document-layout"

type Item = HTMLElement | SVGSVGElement
type Point = {x: number, y: number}

/** The DOM owns item placement. This feature owns only a disposable camera
 * and appendix controls; remote changes are never normalized into a schema. */
export class CanvasFeature extends EditorFeature {
  protected handlesAppendixInteractions = true
  private camera = {x: 32, y: 32, zoom: 1}
  private slot: HTMLSlotElement | null = null
  private slotStyle: string | null = null
  private controls: HTMLElement | null = null
  private stylesheet: CSSStyleSheet | null = null
  private observer: MutationObserver | null = null
  private frame: number | null = null
  private signature = ""
  private panning: {id: number, start: Point, camera: Point} | null = null
  private hand = false
  private spaceHand = false
  private placing = false
  private readonly schedule = () => {
    if(this.isEnabled && this.frame === null) this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.refresh()
    })
  }
  private readonly release = () => { this.spaceHand = false; this.stopPan(); this.schedule() }

  get active() { return documentLayoutMode() === "canvas" }
  get zoom() { return this.active ? this.camera.zoom : 1 }

  private items(): Item[] {
    return Array.from(document.body.children).filter((el): el is Item =>
      (el instanceof HTMLElement || el instanceof SVGSVGElement) && !el.matches("style, script, link, meta, template"))
  }

  getState(): DocumentLayoutState {
    const items = this.items()
    return {mode: this.active ? "canvas" : "document", zoom: Math.round(this.zoom * 100),
      canConvert: getDocumentRoot() === document.body && (this.active || !Array.from(document.body.childNodes).some(node =>
        node instanceof Text && Boolean(node.textContent?.trim())
        || node instanceof Element && !items.includes(node as Item) && !node.matches("style, script, link, meta, template")))}
  }

  emptyParagraph() {
    if(documentLayoutMode() !== "document" || !this.getState().canConvert || document.body.children.length !== 1) return null
    const paragraph = document.body.firstElementChild!
    return paragraph.localName === "p" && !paragraph.hasAttribute("is")
      && !paragraph.textContent?.trim() && Array.from(paragraph.children).every(el => el.localName === "br")
      && paragraph.children.length <= 1 ? paragraph : null
  }

  actions = {
    setDocumentLayout: ({mode, expectedMode}: {type: "setDocumentLayout", mode: DocumentLayoutMode, expectedMode: DocumentLayoutMode}) => {
      return this.editor.setDocumentLayout(mode, expectedMode)
    },
    startCanvas: ({}: {type: "startCanvas"}) => Boolean(this.emptyParagraph()) && this.convert("canvas"),
    navigateCanvas: ({operation}: {type: "navigateCanvas", operation: "zoom-in" | "zoom-out" | "actual-size" | "fit-content"}) => {
      if(!this.active) return
      if(operation === "fit-content") this.fit()
      else if(operation === "actual-size") this.zoomAt(1)
      else if(operation === "zoom-in") this.zoomAt(this.zoom * 1.2)
      else if(operation === "zoom-out") this.zoomAt(this.zoom / 1.2)
    },
  }

  convert(mode: "canvas" | "document") {
    if(this.editor.isEditingLocked || !this.getState().canConvert || this.getState().mode === mode) return false
    const items = this.items()
    const empty = this.emptyParagraph()
    const bodyRect = document.body.getBoundingClientRect()
    // Read all geometry before writing styles, so conversion cannot reflow
    // later items before their original placement has been measured.
    const geometry = items.map(item => {
      const rect = item.getBoundingClientRect(), style = getComputedStyle(item)
      const width = parseFloat(style.width)
      return {item, rect, width: Number.isFinite(width) ? width : rect.width,
        marginLeft: parseFloat(style.marginLeft) || 0, marginTop: parseFloat(style.marginTop) || 0}
    })
    const end = this.editor.doc.beginUndoGroup()
    try {
      if(mode === "canvas") {
        if(!Array.from(document.head.querySelectorAll("style")).some(style => style.textContent === canvasStyles)) {
          const style = document.createElement("style")
          style.textContent = canvasStyles
          document.head.append(style)
        }
        document.body.classList.add(canvasClass)
        for(const {item, rect, width, marginLeft, marginTop} of geometry) {
          if(item.parentElement !== document.body) continue
          // Keep authored transforms and dimensions; only placement changes.
          for(const name of ["inset", "inset-inline", "inset-block", "inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end", "right", "bottom"]) item.style.removeProperty(name)
          item.style.position = "absolute"
          item.style.left = `${rect.left - bodyRect.left - marginLeft}px`
          item.style.top = `${rect.top - bodyRect.top - marginTop}px`
          if(width > 0) item.style.width = `${width}px`
        }
        // Transforms, borders and margin collapse can offset the measured
        // border box from left/top. Correct against the new containing block.
        const origin = document.body.getBoundingClientRect()
        for(const {item, rect} of geometry) {
          if(item.parentElement !== document.body) continue
          const current = item.getBoundingClientRect()
          item.style.left = `${parseFloat(item.style.left) + rect.left - bodyRect.left - (current.left - origin.left)}px`
          item.style.top = `${parseFloat(item.style.top) + rect.top - bodyRect.top - (current.top - origin.top)}px`
          if(item === empty) Object.assign(item.style, {left: "0px", top: "0px", width: "320px"})
        }
      }
      else {
        document.body.classList.remove(canvasClass)
        if(!document.body.classList.length) document.body.removeAttribute("class")
        // Keep the scoped authored stylesheet: it may predate this session
        // and is harmless without the layout class.
        for(const item of items) {
          if(item.parentElement !== document.body) continue
          clearInlinePlacement(item)
          if(["absolute", "fixed"].includes(getComputedStyle(item).position)) item.style.position = "static"
        }
      }
    }
    finally { end() }
    this.refresh()
    if(this.active) this.fit()
    this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    this.editor.postSelectionPath()
    return true
  }

  clientPoint(x: number, y: number): Point {
    const rect = this.slot?.getBoundingClientRect()
    return {x: (x - (rect?.left ?? this.camera.x)) / this.zoom, y: (y - (rect?.top ?? this.camera.y)) / this.zoom}
  }

  /** Apply placement only to items created by this local command. Never run
   * this from a MutationObserver: widgets and remote edits own their changes. */
  preservePlacement<T>(command: () => T): T {
    if((!this.active && !this.editor.features.slides.active) || this.placing) return command()
    const selection = document.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const body = this.active ? document.body : this.editor.features.slides.containingSlide(range?.startContainer ?? null)
    if(!body) return command()
    const nodes = Array.from(body.childNodes)
    if(!range || !body.contains(range.startContainer) || !body.contains(range.endContainer)) return command()
    const items = () => Array.from(body.children).filter((item): item is Item =>
      (item instanceof HTMLElement || item instanceof SVGSVGElement) && !item.matches("style,script,link,meta,template") && slideLayoutRole(item) !== "navigation")
    const itemIndex = (node: Node) => {
      while(node.parentNode && node.parentNode !== body) node = node.parentNode
      return nodes.indexOf(node as ChildNode)
    }
    const start = range.startContainer === body ? range.startOffset : itemIndex(range.startContainer)
    const end = range.endContainer === body ? range.endOffset : itemIndex(range.endContainer) + 1
    if(start < 0 || end < start) return command()
    const prefix = nodes.slice(0, start), suffix = nodes.slice(end)
    const before = items()
    const selected = document.getSelection()?.anchorNode
    const anchor = before.find(item => selected && (item === selected || item.contains(selected)))
    const rect = anchor?.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const origin = this.active
      ? rect ? this.clientPoint(rect.left, rect.top) : this.clientPoint(window.innerWidth / 2 - 160, window.innerHeight / 2)
      : rect ? {x: rect.left - bodyRect.left + body.scrollLeft, y: rect.top - bodyRect.top + body.scrollTop} : {x: 20, y: 20}
    const height = rect ? rect.height / this.zoom : 0
    this.placing = true
    let completed = false
    try { const result = command(); completed = true; return result }
    finally {
      const current = Array.from(body.childNodes)
      const valid = completed && body.isConnected && (this.active && document.body === body || this.editor.features.slides.active && slideLayoutRole(body) === "slide") && current.length >= prefix.length + suffix.length
        && prefix.every((node, i) => current[i] === node)
        && suffix.every((node, i) => current[current.length - suffix.length + i] === node)
      if(valid) {
        let offset = anchor?.parentElement === body ? height + 24 : 0
        const added = items().filter(item => !before.includes(item))
        // A split of a slide text box shares its available space with its
        // continuations, so the new caret stays on the finite slide.
        const sharedHeight = !this.active && anchor?.parentElement === body && added.length && height > 48
          ? Math.max(1, (height - 24 * added.length) / (added.length + 1)) : null
        if(sharedHeight !== null) { anchor!.style.height = `${sharedHeight}px`; anchor!.style.bottom = "auto"; offset = sharedHeight + 24 }
        for(const item of added) {
          if(item.parentElement !== body) continue
          item.style.position = "absolute"
          item.style.left = `${origin.x}px`
          item.style.top = `${origin.y + offset}px`
          item.style.right = item.style.bottom = "auto"
          if(!item.style.width) item.style.width = anchor?.style.width || "320px"
          if(!this.active && rect) item.style.width = `${rect.width}px`
          if(sharedHeight !== null) item.style.height = `${sharedHeight}px`
          offset += item.getBoundingClientRect().height / this.zoom + 24
        }
      }
      this.placing = false
    }
  }

  private zoomAt(zoom: number, point = {x: window.innerWidth / 2, y: window.innerHeight / 2}) {
    if(!Number.isFinite(zoom)) return
    const next = Math.max(.1, Math.min(4, zoom)), ratio = next / this.zoom
    const rect = this.slot?.getBoundingClientRect()
    this.camera.x += (point.x - (rect?.left ?? this.camera.x)) * (1 - ratio)
    this.camera.y += (point.y - (rect?.top ?? this.camera.y)) * (1 - ratio)
    this.camera.zoom = next
    this.applyCamera()
  }

  private fit() {
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
  reveal(rect: {left: number, top: number, right: number, bottom: number}) {
    if(!this.active || this.panning) return
    const dx = rect.left < 24 ? 24 - rect.left : rect.right > window.innerWidth - 24 ? Math.min(0, window.innerWidth - 24 - rect.right) : 0
    const dy = rect.top < 24 ? 24 - rect.top : rect.bottom > window.innerHeight - 72 ? Math.min(0, window.innerHeight - 72 - rect.bottom) : 0
    if(dx || dy) { this.camera.x += dx; this.camera.y += dy; this.applyCamera() }
  }

  panAtEdge(point: Point) {
    if(!this.active) return false
    const delta = (position: number, end: number) => position < 32 ? Math.min(16, (32 - position) / 3)
      : position > end - 32 ? -Math.min(16, (position - end + 32) / 3) : 0
    const x = delta(point.x, window.innerWidth), y = delta(point.y, window.innerHeight)
    if(!x && !y) return false
    this.camera.x += x; this.camera.y += y
    this.applyCamera()
    return true
  }

  private applyCamera() {
    if(!this.slot || !this.active) return
    this.slot.style.transform = `translate(${this.camera.x}px, ${this.camera.y}px) scale(${this.camera.zoom})`
    const output = this.controls?.querySelector("output")
    if(output) output.textContent = `${Math.round(this.zoom * 100)}%`
    this.editor.features.transformation.updateInfo()
    this.editor.features.layout.refresh()
    this.editor.features.graphic.refresh()
    document.dispatchEvent(new Event("scroll"))
    this.editor.postSelectionPath()
  }

  private stopPan() {
    const pan = this.panning
    this.panning = null
    try { if(pan && this.slot?.hasPointerCapture(pan.id)) this.slot.releasePointerCapture(pan.id) } catch {}
    removeEditorMarker(document.body, "◆canvas-panning")
  }

  private ownEvent(event: Event) {
    return (!isAppendixInteraction(event) || event.composedPath()[0] === this.slot)
      && !isFormControlInteraction(event) && !isWidgetShadowInteraction(event, this.editor.schema)
  }

  captureListeners: DocumentListenerMap = {
    pointerdown: event => {
      if(!this.active || !this.ownEvent(event) || event.button !== 1 && !(event.button === 0 && (this.hand || this.spaceHand))) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.panning = {id: event.pointerId, start: {x: event.clientX, y: event.clientY}, camera: {...this.camera}}
      document.body.classList.add("◆canvas-panning")
      try { this.slot?.setPointerCapture(event.pointerId) } catch {}
    },
    pointermove: event => {
      const pan = this.panning
      if(!pan || event.pointerId !== pan.id) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.camera.x = pan.camera.x + event.clientX - pan.start.x
      this.camera.y = pan.camera.y + event.clientY - pan.start.y
      this.applyCamera()
    },
    pointerup: event => { if(this.panning && this.panning.id === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); this.stopPan() } },
    pointercancel: () => this.stopPan(),
    lostpointercapture: () => this.stopPan(),
    wheel: event => {
      if(!this.active || !this.ownEvent(event)) return
      // Scrollable widgets/containers keep their own ordinary wheel gestures.
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
    },
    keydown: event => {
      if(!this.active || !this.ownEvent(event)) return
      if(event.key === "Escape") { this.hand = this.spaceHand = false; this.stopPan(); this.schedule() }
      // Space stays ordinary text input inside an active text selection.
      if(event.code === "Space" && ($.isElementSelection || getSelection()?.anchorNode === document.body)) {
        event.preventDefault(); event.stopImmediatePropagation()
        this.spaceHand = true; this.schedule()
      }
    },
    keyup: event => { if(event.code === "Space" && this.spaceHand) { this.spaceHand = false; this.stopPan(); this.schedule() } },
  }

  activeListeners: DocumentListenerMap = {
    pointerdown: event => {
      const target = event.composedPath()[0]
      if(target instanceof Node && this.controls?.contains(target)) event.preventDefault()
    },
    click: event => {
      const target = event.composedPath()[0]
      if(!(target instanceof HTMLButtonElement) || !this.controls?.contains(target)) return
      if(target.name === "start-slides") this.editor.features.slides.actions.startSlides({type: "startSlides"})
      else if(target.name === "start") this.actions.startCanvas({type: "startCanvas"})
      else if(target.name === "hand") { this.hand = !this.hand; this.schedule() }
      else if(target.name === "text") this.insertText({x: window.innerWidth / 2 - 160 * this.zoom, y: window.innerHeight / 2})
      else this.actions.navigateCanvas({type: "navigateCanvas", operation: target.name as "zoom-in" | "zoom-out" | "actual-size" | "fit-content"})
    },
    dblclick: event => {
      if(this.active && !this.editor.isEditingLocked && (event.target === document.body || event.target === document.documentElement)
        && (!isAppendixInteraction(event) || event.composedPath()[0] === this.slot)) {
        event.preventDefault()
        this.insertText({x: event.clientX, y: event.clientY})
      }
    },
  }

  private insertText(point: Point) {
    if(!this.active || this.editor.isEditingLocked) return
    const world = this.clientPoint(point.x, point.y)
    const end = this.editor.doc.beginUndoGroup()
    try {
      const paragraph = document.createElement("p")
      Object.assign(paragraph.style, {position: "absolute", left: `${world.x}px`, top: `${world.y}px`, width: "320px"})
      document.body.append(paragraph)
      $.move(paragraph)
      this.editor.features.selection.processSelection()
    }
    finally { end() }
  }

  refresh() {
    if(!this.isEnabled) return
    if(this.active && !this.slot) {
      this.slot = this.editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")!
      this.slotStyle = this.slot.getAttribute("style")
      Object.assign(this.slot.style, {display: "block", position: "relative", width: "1280px", height: "720px", transformOrigin: "0 0"})
      document.documentElement.classList.add("◆canvas-active")
      this.applyCamera()
    }
    else if(!this.active && this.slot) this.restoreSlot()
    if(this.active && (this.hand || this.spaceHand)) {
      if(!document.body.classList.contains("◆canvas-hand")) document.body.classList.add("◆canvas-hand")
    }
    else if(document.body.classList.contains("◆canvas-hand")) removeEditorMarker(document.body, "◆canvas-hand")
    const signature = JSON.stringify([this.getState(), Boolean(this.emptyParagraph()), this.editor.isEditingLocked, this.hand])
    if(signature === this.signature) return
    this.signature = signature
    this.controls!.replaceChildren()
    const button = (name: string, label: string, title = label) => {
      const button = document.createElement("button")
      button.type = "button"; button.name = name; button.textContent = label; button.title = title
      button.setAttribute("aria-label", title)
      this.controls!.append(button)
      return button
    }
    if(this.active) {
      button("hand", "Pan", "Toggle hand tool (middle-drag also pans)").setAttribute("aria-pressed", String(this.hand))
      button("text", "Add text").disabled = this.editor.isEditingLocked
      button("zoom-out", "−", "Zoom out")
      const output = document.createElement("output"); output.textContent = `${Math.round(this.zoom * 100)}%`; this.controls!.append(output)
      button("zoom-in", "+", "Zoom in")
      button("actual-size", "100%", "Actual size")
      button("fit-content", "Fit", "Fit content")
    }
    else if(this.emptyParagraph() && !this.editor.isEditingLocked) {
      button("start", "Use canvas layout")
      button("start-slides", "Use slides layout")
    }
    this.controls!.hidden = !this.controls!.childElementCount
    this.editor.postSelectionPath()
  }

  private restoreSlot() {
    this.stopPan()
    this.hand = this.spaceHand = false
    removeEditorMarker(document.body, "◆canvas-hand")
    if(this.slot) {
      if(this.slotStyle === null) this.slot.removeAttribute("style")
      else this.slot.setAttribute("style", this.slotStyle)
    }
    this.slot = null
    this.camera = {x: 32, y: 32, zoom: 1}
    removeEditorMarker(document.documentElement, "◆canvas-active")
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.controls = document.createElement("div")
    this.controls.className = "◆canvas-controls"
    this.controls.setAttribute("part", "canvas-controls")
    this.controls.contentEditable = "false"
    this.controls.setAttribute("role", "toolbar")
    this.controls.setAttribute("aria-label", "Document canvas")
    this.editor.addAppendix(this.controls)
    this.stylesheet = createStylesheet(`
      .◆canvas-controls { position: fixed; bottom: 20px; left: 24px; z-index: 1000; display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 10px; background: white; color: #334155; box-shadow: 0 2px 10px #0001; font: 13px system-ui; }
      .◆canvas-controls[hidden] { display: none; }
      .◆canvas-controls button { font: inherit; padding: 7px 10px; border: 0; border-radius: 6px; color: inherit; background: #f1f5f9; cursor: pointer; }
      .◆canvas-controls button:hover, .◆canvas-controls button[aria-pressed=true] { background: #dbeafe; }
      .◆canvas-controls button:disabled { opacity: .5; cursor: default; }
      .◆canvas-controls output { min-width: 3em; text-align: center; }
    `)
    this.editor.appendix.adoptedStyleSheets = [...this.editor.appendix.adoptedStyleSheets, this.stylesheet]
    this.observer = new MutationObserver(this.schedule)
    this.observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, characterData: true})
    window.addEventListener("blur", this.release)
    this.refresh()
  }

  disable() {
    super.disable()
    this.observer?.disconnect(); this.observer = null
    if(this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    window.removeEventListener("blur", this.release)
    this.restoreSlot()
    this.controls?.remove(); this.controls = null
    if(this.stylesheet && document.body.shadowRoot) document.body.shadowRoot.adoptedStyleSheets = document.body.shadowRoot.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    this.stylesheet = null
    this.signature = ""
  }
}
