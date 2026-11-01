import {CanvasViewer, canvasControlsStyles, canvasIcons, canvasStartingView, isCanvasStartingView} from "../canvas-viewer.js"
import {EditorFeature, type DocumentListenerMap} from "."
import {$, clearInlinePlacement, createAnchorPositioner, createStylesheet, isAppendixInteraction, isFormControlInteraction, isWidgetShadowInteraction, removeEditorMarker} from "../utility"
import {getDocumentRoot} from "../document-template"
import {canvasClass, canvasStyles, documentLayoutMode, resetEmptyLayoutContent, slideLayoutRole, type DocumentLayoutMode, type DocumentLayoutState} from "../document-layout"
import trashIcon from "@tabler/icons/outline/trash.svg?raw"

type Item = HTMLElement | SVGSVGElement
type Point = {x: number, y: number}

/** The DOM owns item placement. This feature owns only a disposable camera
 * and appendix controls; remote changes are never normalized into a schema. */
export class CanvasFeature extends EditorFeature {
  readonly readerPermission = "view" as const
  protected handlesAppendixInteractions = true
  private viewer: CanvasViewer | null = null
  private slot: HTMLSlotElement | null = null
  private controls: HTMLElement | null = null
  private background: HTMLElement | null = null
  private startingViewOutline: HTMLElement | null = null
  private anchors = createAnchorPositioner()
  private stylesheet: CSSStyleSheet | null = null
  private layoutStylesheet: CSSStyleSheet | null = null
  private observer: MutationObserver | null = null
  private frame: number | null = null
  private cameraFrame: number | null = null
  private cameraZoom = 1
  private signature = ""
  private hand = false
  private spaceHand = false
  private placing = false
  private focusedParagraph: HTMLParagraphElement | null = null
  private readonly schedule = () => {
    if(this.isEnabled && this.frame === null) this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.refresh()
    })
  }
  private readonly release = () => { this.spaceHand = false; this.stopPan(); this.schedule() }

  get active() { return documentLayoutMode() === "canvas" }
  get zoom() { return this.active ? this.viewer?.zoom ?? 1 : 1 }

  /** Canvas editing uses BODY; finite slide editing uses the visible slide. */
  get editingRoot() {
    return this.active ? document.body : this.editor.features.slides.active ? this.editor.features.slides.current() : null
  }

  items(root: HTMLElement | null = this.editingRoot ?? document.body, limit = Infinity): Item[] {
    const items: Item[] = []
    if(limit <= 0) return items
    for(const el of root?.children ?? []) {
      if((el instanceof HTMLElement || el instanceof SVGSVGElement) && !el.matches("style, script, link, meta, template") && !slideLayoutRole(el)) {
        items.push(el)
        if(items.length >= limit) break
      }
    }
    return items
  }

  itemAtPoint(x: number, y: number): Item | null {
    return this.items().find(item => {
      if(isCanvasStartingView(item)) return false
      const rect = item.getBoundingClientRect()
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
    }) ?? null
  }

  canConvertContent(nodes: Iterable<Node>) {
    for(const node of nodes) {
      if(node instanceof Text && Boolean(node.textContent?.trim())
        || node instanceof Element && !(node instanceof HTMLElement || node instanceof SVGSVGElement)
          && !node.matches("style, script, link, meta, template")) return false
    }
    return true
  }

  getState(): DocumentLayoutState {
    return {mode: this.active ? "canvas" : "document", zoom: Math.round(this.zoom * 100),
      canConvert: getDocumentRoot() === document.body && (this.active || this.canConvertContent(document.body.childNodes))}
  }

  private isEmptyParagraph(element: Element): element is HTMLParagraphElement {
    return element instanceof HTMLParagraphElement && !element.hasAttribute("is")
      && Array.from(element.childNodes).every(node => node instanceof Text && !node.data.trim()
        || node instanceof HTMLBRElement && !node.hasAttribute("is"))
      && element.children.length <= 1
  }

  emptyParagraph() {
    if(documentLayoutMode() !== "document") return null
    const items = this.items(undefined, 2)
    if(items.length !== 1 || !this.getState().canConvert) return null
    const paragraph = items[0]
    return this.isEmptyParagraph(paragraph) ? paragraph : null
  }

  /** In an editable body, the selection owns paragraph focus. Track only the
   * item being edited; unrelated and remotely inserted empty items stay put. */
  syncSelection(item: Element | null) {
    if(!this.isEnabled || !this.active) { this.focusedParagraph = null; return }
    const previous = this.focusedParagraph
    const next = item instanceof HTMLParagraphElement && item.parentElement === document.body && !item.hasAttribute("is") ? item : null
    if(previous === next) return
    const selection = document.getSelection()
    if(previous?.parentElement === document.body && selection) {
      for(let i = 0; i < selection.rangeCount; i++) {
        if(selection.getRangeAt(i).intersectsNode(previous)) return
      }
    }
    this.focusedParagraph = next
    if(!previous || previous.parentElement !== document.body || this.editor.isEditingLocked || !this.isEmptyParagraph(previous)) return
    previous.remove()
  }

  actions = {
    setDocumentLayout: ({mode, expectedMode}: {type: "setDocumentLayout", mode: DocumentLayoutMode, expectedMode: DocumentLayoutMode}) => {
      if(!this.editor.allows("edit", document.body)) return false
      return this.editor.setDocumentLayout(mode, expectedMode)
    },
    startCanvas: ({}: {type: "startCanvas"}) => Boolean(this.emptyParagraph()) && this.convert("canvas"),
    navigateCanvas: ({operation}: {type: "navigateCanvas", operation: "zoom-in" | "zoom-out" | "actual-size" | "fit-content"}) => {
      if(!this.active) return
      this.viewer?.navigate(operation)
    },
    saveCanvasStartingView: ({}: {type: "saveCanvasStartingView"}) => this.saveStartingView(),
    showCanvasStartingView: ({}: {type: "showCanvasStartingView"}) => this.showStartingView(),
    deleteCanvasStartingView: ({}: {type: "deleteCanvasStartingView"}) => this.deleteStartingView(),
  }

  private saveStartingView() {
    const existing = canvasStartingView()
    if(!this.active || !this.viewer || this.editor.isEditingLocked
      || !this.editor.allows(existing ? "style" : "insert", existing ?? document.body)) return false
    const origin = this.clientPoint(0, 0)
    const frame = canvasStartingView() ?? document.createElement("div")
    const end = this.editor.doc.beginUndoGroup()
    try {
      frame.classList.add("ww-canvas-starting-view")
      frame.setAttribute("aria-label", "Starting view")
      clearInlinePlacement(frame)
      Object.assign(frame.style, {position: "absolute", left: `${origin.x}px`, top: `${origin.y}px`,
        width: `${window.innerWidth / this.zoom}px`, height: `${window.innerHeight / this.zoom}px`,
        right: "auto", bottom: "auto", minWidth: "0", minHeight: "0", maxWidth: "none", maxHeight: "none",
        boxSizing: "border-box", margin: "0", padding: "0", border: "0", transform: "none", rotate: "none", scale: "none", translate: "none"})
      if(!frame.parentElement) document.body.append(frame)
      this.editor.features.selection.withoutSelectionScroll(() => this.editor.features.selection.selectElement(frame))
    }
    finally { end() }
    this.refresh()
    return true
  }

  private showStartingView() {
    if(!this.active || !this.viewer) return false
    const frame = canvasStartingView()
    if(!frame) return this.saveStartingView()
    this.viewer.startView()
    this.editor.features.selection.withoutSelectionScroll(() => this.editor.features.selection.selectElement(frame))
    return true
  }

  private deleteStartingView() {
    const frame = this.active && !this.editor.isEditingLocked ? canvasStartingView() : null
    if(!frame || !this.editor.allows("delete", frame)) return false
    const selected = $.selectedElements.includes(frame)
    const end = this.editor.doc.beginUndoGroup()
    try {
      frame.remove()
      if(selected) $.selectDocumentStart()
      this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    }
    finally { end() }
    this.refresh()
    return true
  }

  private updateStartingViewOutline() {
    const outline = this.startingViewOutline
    if(!outline) return
    const frame = this.active ? canvasStartingView() : null
    if(outline.hidden !== !frame) outline.hidden = !frame
    if(!frame) { this.anchors.release(outline); return }
    if(this.editor.features.transformation.boxTransformed(frame)) {
      this.anchors.release(outline)
      const rect = frame.getBoundingClientRect()
      Object.assign(outline.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
    }
    else {
      for(const property of ["left", "top", "width", "height"]) outline.style.removeProperty(property)
      this.anchors.bind(outline, frame)
    }
    this.anchors.refresh()
    outline.querySelector<HTMLElement>("[part=canvas-starting-view-label]")!.classList.toggle("inside", frame.getBoundingClientRect().top < 24)
  }

  convert(mode: "canvas" | "document", captureUndo = true) {
    if(this.editor.isEditingLocked || !this.editor.allows("edit", document.body) || !this.getState().canConvert || this.getState().mode === mode) return false
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
    const end = captureUndo ? this.editor.doc.beginUndoGroup() : () => {}
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
          if(width > 0 && !item.matches("p:not([is])")) item.style.width = `${width}px`
        }
        // Transforms, borders and margin collapse can offset the measured
        // border box from left/top. Correct against the new containing block.
        const origin = document.body.getBoundingClientRect()
        for(const {item, rect} of geometry) {
          if(item.parentElement !== document.body) continue
          const current = item.getBoundingClientRect()
          item.style.left = `${parseFloat(item.style.left) + rect.left - bodyRect.left - (current.left - origin.left)}px`
          item.style.top = `${parseFloat(item.style.top) + rect.top - bodyRect.top - (current.top - origin.top)}px`
          if(item === empty) Object.assign(item.style, {left: "0px", top: "0px"})
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
        const paragraph = resetEmptyLayoutContent()
        if(paragraph) {
          $.move(paragraph)
          this.editor.features.selection.selectDropRange($.range, {scrollIntoView: false})
        }
      }
    }
    finally { end() }
    this.refresh()
    if(this.active) this.fit()
    if(this.active && empty?.parentElement === document.body) {
      $.move(empty)
      this.editor.features.selection.selectDropRange($.range, {scrollIntoView: false})
    }
    else this.editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    this.editor.postSelectionPath()
    return true
  }

  clientPoint(x: number, y: number): Point {
    return this.viewer?.clientPoint(x, y) ?? {x, y}
  }

  /** Click insertion owns a new root item, independent of the old selection. */
  insertCentered<T>(command: () => T): T {
    if((!this.active && !this.editor.features.slides.active) || this.placing || this.editor.isEditingLocked) return command()
    const root = this.active ? document.body : this.editor.features.slides.insertionSlide()
    if(!root || !this.editor.allows("insert", root)) return undefined as T
    const end = this.editor.doc.beginUndoGroup()
    try {
      return this.editor.features.selection.withoutSelectionScroll(() => {
        const range = document.createRange()
        range.selectNodeContents(root); range.collapse(false)
        this.editor.features.selection.selectDropRange(range, {scrollIntoView: false})
        return this.preservePlacement(command, true)
      })
    }
    finally { end() }
  }

  /** Apply placement only to items created by this local command. Never run
   * this from a MutationObserver: widgets and remote edits own their changes. */
  preservePlacement<T>(command: () => T, centered = false): T {
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
    const zoom = this.active ? this.zoom : this.editor.features.slides.zoom
    const center = this.active ? {x: window.innerWidth / 2, y: window.innerHeight / 2}
      : {x: bodyRect.left + bodyRect.width / 2, y: bodyRect.top + bodyRect.height / 2}
    const origin = this.active
      ? centered ? this.clientPoint(center.x, center.y) : rect ? this.clientPoint(rect.left, rect.top) : this.clientPoint(window.innerWidth / 2 - 160, window.innerHeight / 2)
      : centered ? this.editor.features.slides.clientPoint(body, center.x, center.y)
        : rect ? this.editor.features.slides.clientPoint(body, rect.left, rect.top) : {x: 20, y: 20}
    const height = rect ? rect.height / zoom : 0
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
        const sharedHeight = !this.active && anchor?.style.height && anchor.parentElement === body && added.length && height > 48
          ? Math.max(1, (height - 24 * added.length) / (added.length + 1)) : null
        if(sharedHeight !== null) { anchor!.style.height = `${sharedHeight}px`; anchor!.style.bottom = "auto"; offset = sharedHeight + 24 }
        for(const item of added) {
          if(item.parentElement !== body) continue
          item.style.position = "absolute"
          item.style.left = `${origin.x}px`
          item.style.top = `${origin.y + offset}px`
          item.style.right = item.style.bottom = "auto"
          if(!item.style.width && anchor?.style.width) item.style.width = anchor.style.width
          if(!item.matches("p:not([is])")) {
            if(!item.style.width) item.style.width = "320px"
            if(!this.active && rect) item.style.width = `${rect.width / zoom}px`
          }
          if(sharedHeight !== null) item.style.height = `${sharedHeight}px`
          offset += item.getBoundingClientRect().height / zoom + 24
        }
        if(centered && added.length) {
          // Measure the final border boxes: margins, authored transforms and
          // intrinsic widget sizes all affect their visual center.
          const rects = added.map(item => item.getBoundingClientRect())
          const x = (Math.min(...rects.map(rect => rect.left)) + Math.max(...rects.map(rect => rect.right))) / 2
          const y = (Math.min(...rects.map(rect => rect.top)) + Math.max(...rects.map(rect => rect.bottom))) / 2
          for(const item of added) {
            item.style.left = `${parseFloat(item.style.left) + (center.x - x) / zoom}px`
            item.style.top = `${parseFloat(item.style.top) + (center.y - y) / zoom}px`
          }
        }
      }
      this.placing = false
    }
  }

  private fit() { this.viewer?.fit() }

  reveal(rect: {left: number, top: number, right: number, bottom: number}) {
    if(this.active) this.viewer?.reveal(rect)
  }

  panAtEdge(point: Point) {
    return this.isEnabled && this.active ? this.viewer?.panAtEdge(point) ?? false : false
  }

  private cameraChanged = () => {
    const zoom = this.viewer?.zoom ?? 1
    const zoomChanged = zoom !== this.cameraZoom
    this.cameraZoom = zoom
    if(zoomChanged) {
      if(this.cameraFrame !== null) cancelAnimationFrame(this.cameraFrame)
      this.cameraFrame = null
      this.updateStartingViewOutline()
      this.editor.features.transformation.updateInfo()
      this.editor.features.layout.refresh()
      this.editor.features.graphic.refresh()
      this.editor.postSelectionPath()
    }
    else if(this.cameraFrame === null) this.cameraFrame = requestAnimationFrame(() => {
      this.cameraFrame = null
      if(!this.active || !this.isEnabled) return
      this.updateStartingViewOutline()
      this.editor.features.transformation.updateInfo()
      this.editor.features.layout.refresh()
      this.editor.features.graphic.refresh()
    })
    document.dispatchEvent(new Event("scroll"))
  }

  private stopPan() { this.viewer?.stopPan() }

  private ownEvent(event: Event) {
    return (!isAppendixInteraction(event) || event.composedPath()[0] === this.slot)
      && !isFormControlInteraction(event) && !isWidgetShadowInteraction(event, this.editor.schema)
  }

  private backgroundInteraction(event: MouseEvent, withinSlide = false) {
    const target = event.composedPath()[0]
    const root = this.editingRoot
    if(!root) return false
    if(this.active) {
      if(target !== document.body && target !== document.documentElement && target !== this.slot) return false
    }
    else if(target !== root) {
      // BODY pointer capture can retarget the final click/double click. Grey
      // margins also clear selection, but text insertion stays on the slide.
      if(target !== document.body && target !== document.documentElement && target !== root.parentElement) return false
      if(withinSlide) {
        const rect = root.getBoundingClientRect()
        if(event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) return false
      }
    }
    return !this.itemAtPoint(event.clientX, event.clientY)
  }

  private readonly preventBackgroundSelection = (event: MouseEvent) => {
    if(event.button !== 0 || !this.backgroundInteraction(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  captureListeners: DocumentListenerMap = {
    pointerdown: event => {
      const origin = event.composedPath()[0]
      if(event.button === 0 && origin instanceof Node && this.startingViewOutline?.contains(origin)) {
        const frame = this.active && !this.editor.isEditingLocked ? canvasStartingView() : null
        if(!frame) return
        event.preventDefault()
        event.stopImmediatePropagation()
        this.editor.features.selection.withoutSelectionScroll(() => this.editor.features.selection.selectElement(frame))
        return
      }
      if(!this.editingRoot || !this.ownEvent(event)) return
      if(!this.active && event.button === 0) this.editor.features.slides.cancelNavigation()
      if(event.button === 0 && !this.hand && !this.spaceHand && this.backgroundInteraction(event)) {
        this.editor.features.selection.beginBoxSelection(event)
        event.stopImmediatePropagation()
        return
      }
      if(!this.active || event.button !== 1 && !(event.button === 0 && (this.hand || this.spaceHand))) return
      this.viewer?.startPan(event)
    },
    mousedown: this.preventBackgroundSelection,
    click: this.preventBackgroundSelection,
    pointermove: event => this.viewer?.movePan(event),
    pointerup: event => this.viewer?.endPan(event),
    pointercancel: () => this.stopPan(),
    lostpointercapture: () => this.stopPan(),
    wheel: event => {
      if(this.active && this.ownEvent(event)) this.viewer?.wheel(event)
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
      const origin = event.composedPath()[0]
      const target = origin instanceof Element ? origin.closest("button") : null
      if(!(target instanceof HTMLButtonElement) || !this.controls?.contains(target)) return
      if(target.name === "hand") { this.hand = !this.hand; this.schedule() }
      else if(target.name === "starting-view") this.actions.showCanvasStartingView({type: "showCanvasStartingView"})
      else if(target.name === "delete-starting-view") this.actions.deleteCanvasStartingView({type: "deleteCanvasStartingView"})
      else this.actions.navigateCanvas({type: "navigateCanvas", operation: target.name as "zoom-in" | "zoom-out" | "actual-size" | "fit-content"})
    },
    dblclick: event => {
      if(this.editor.isEditingLocked || !this.backgroundInteraction(event, true)) return
      event.preventDefault()
      this.insertText({x: event.clientX, y: event.clientY})
    },
  }

  private insertText(point: Point) {
    const root = this.editingRoot
    if(!root || this.editor.isEditingLocked || !this.editor.allows("insert", root)) return
    const world = this.active ? this.clientPoint(point.x, point.y) : this.editor.features.slides.clientPoint(root, point.x, point.y)
    const end = this.editor.doc.beginUndoGroup()
    try {
      const paragraph = document.createElement("p")
      Object.assign(paragraph.style, {position: "absolute", left: `${world.x}px`, top: `${world.y}px`})
      root.append(paragraph)
      $.move(paragraph)
      this.editor.features.selection.selectDropRange($.range)
    }
    finally { end() }
  }

  refresh() {
    if(!this.isEnabled) return
    if(this.background) this.background.hidden = !this.active
    if(this.active && !this.slot) {
      this.slot = this.editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")!
      this.viewer = new CanvasViewer(this.slot, this.background!, this.controls!, this.cameraChanged)
      if(!this.viewer.startView()) this.viewer.applyCamera()
    }
    else if(!this.active && this.slot) this.restoreSlot()
    if(this.active && (this.hand || this.spaceHand)) {
      if(!document.body.classList.contains("◆canvas-hand")) document.body.classList.add("◆canvas-hand")
    }
    else if(document.body.classList.contains("◆canvas-hand")) removeEditorMarker(document.body, "◆canvas-hand")
    this.updateStartingViewOutline()
    const startingView = canvasStartingView()
    const canInsert = this.editor.allows("insert", document.body)
    const canDeleteStartingView = startingView ? this.editor.allows("delete", startingView) : false
    const signature = JSON.stringify([this.getState(), Boolean(this.emptyParagraph()), this.editor.isEditingLocked, this.hand, Boolean(startingView), canInsert, canDeleteStartingView])
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
      const hand = button("hand", "", "Toggle hand tool (middle-drag also pans)")
      hand.innerHTML = canvasIcons.hand
      hand.setAttribute("aria-pressed", String(this.hand))
      button("zoom-out", "−", "Zoom out")
      const output = document.createElement("output"); output.textContent = `${Math.round(this.zoom * 100)}%`; this.controls!.append(output)
      button("zoom-in", "+", "Zoom in")
      button("actual-size", "100%", "Actual size")
      button("fit-content", "", "Fit content").innerHTML = canvasIcons.fit
      const group = document.createElement("div")
      group.className = "◆canvas-starting-view-controls"
      group.setAttribute("role", "group")
      group.setAttribute("aria-label", "Starting view")
      const show = button("starting-view", "Starting view", startingView ? "Show and select the starting view" : "Add starting view")
      show.hidden = !startingView && !canInsert
      const remove = button("delete-starting-view", "", "Delete starting view")
      remove.innerHTML = trashIcon
      remove.hidden = !canDeleteStartingView
      group.append(show, remove)
      this.controls!.append(group)
    }
    this.controls!.hidden = !this.controls!.childElementCount
    this.editor.postSelectionPath()
  }

  private restoreSlot() {
    this.focusedParagraph = null
    this.stopPan()
    this.hand = this.spaceHand = false
    removeEditorMarker(document.body, "◆canvas-hand")
    this.viewer?.destroy()
    this.viewer = null
    this.slot = null
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    // Keep the layout working when CSP blocks its portable <style> element.
    this.layoutStylesheet = createStylesheet(canvasStyles)
    document.adoptedStyleSheets = [this.layoutStylesheet, ...document.adoptedStyleSheets]
    this.background = document.createElement("div")
    this.background.setAttribute("part", "canvas-background")
    this.background.setAttribute("aria-hidden", "true")
    Object.assign(this.background.style, {position: "fixed", inset: "0", zIndex: "-1", pointerEvents: "none"})
    this.editor.addAppendix(this.background)
    this.controls = document.createElement("div")
    this.controls.className = "◆canvas-controls"
    this.controls.setAttribute("part", "canvas-controls")
    this.controls.contentEditable = "false"
    this.controls.setAttribute("role", "toolbar")
    this.controls.setAttribute("aria-label", "Document canvas")
    this.editor.addAppendix(this.controls)
    this.startingViewOutline = document.createElement("div")
    this.startingViewOutline.setAttribute("part", "canvas-starting-view")
    this.startingViewOutline.setAttribute("aria-hidden", "true")
    for(const edge of ["top", "right", "bottom", "left"]) {
      const handle = document.createElement("div")
      handle.className = edge
      this.startingViewOutline.append(handle)
    }
    const label = document.createElement("span")
    label.setAttribute("part", "canvas-starting-view-label")
    label.textContent = "STARTING VIEW"
    this.startingViewOutline.append(label)
    this.editor.addAppendix(this.startingViewOutline)
    this.stylesheet = createStylesheet(canvasControlsStyles + `
      .◆canvas-starting-view-controls { display: inline-flex; }
      .◆canvas-starting-view-controls button:first-child { border-radius: 6px 0 0 6px; }
      .◆canvas-starting-view-controls button:last-child { display: grid; place-items: center; border-left: 1px solid #cbd5e1; border-radius: 0 6px 6px 0; padding: 5px 8px; }
      .◆canvas-starting-view-controls button[hidden] { display: none; }
      .◆canvas-starting-view-controls svg { width: 14px; height: 14px; }
      [part=canvas-starting-view] { position: fixed; box-sizing: border-box; border: 2px dotted #9ca3af; pointer-events: none; z-index: 0; }
      [part=canvas-starting-view][hidden] { display: none; }
      [part=canvas-starting-view] > div { position: absolute; pointer-events: auto; cursor: pointer; }
      [part=canvas-starting-view] > :is(.top, .bottom) { left: -4px; right: -4px; height: 8px; }
      [part=canvas-starting-view] > :is(.left, .right) { top: -4px; bottom: -4px; width: 8px; }
      [part=canvas-starting-view] > .top { top: -5px; }
      [part=canvas-starting-view] > .bottom { bottom: -5px; }
      [part=canvas-starting-view] > .left { left: -5px; }
      [part=canvas-starting-view] > .right { right: -5px; }
      [part=canvas-starting-view-label] { display: none; position: absolute; left: 0; top: -6px; transform: translateY(-100%); color: var(--sl-color-primary-400); font: 600 11px/16px system-ui; letter-spacing: .06em; white-space: nowrap; }
      [part=canvas-starting-view-label].inside { left: 6px; top: 6px; transform: none; }
      @media print { [part=canvas-starting-view] { display: none; } }
    `)
    this.editor.appendix.adoptedStyleSheets = [...this.editor.appendix.adoptedStyleSheets, this.stylesheet]
    this.observer = new MutationObserver(this.schedule)
    this.observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, characterData: true})
    window.addEventListener("blur", this.release)
    window.addEventListener("resize", this.schedule)
    this.refresh()
  }

  disable() {
    super.disable()
    if(this.layoutStylesheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== this.layoutStylesheet)
    this.layoutStylesheet = null
    this.observer?.disconnect(); this.observer = null
    if(this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    if(this.cameraFrame !== null) cancelAnimationFrame(this.cameraFrame)
    this.cameraFrame = null; this.cameraZoom = 1
    window.removeEventListener("blur", this.release)
    window.removeEventListener("resize", this.schedule)
    this.restoreSlot()
    this.background?.remove(); this.background = null
    this.controls?.remove(); this.controls = null
    this.startingViewOutline?.remove(); this.startingViewOutline = null
    this.anchors.destroy()
    this.anchors = createAnchorPositioner()
    if(this.stylesheet && document.body.shadowRoot) document.body.shadowRoot.adoptedStyleSheets = document.body.shadowRoot.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    this.stylesheet = null
    this.signature = ""
  }
}
