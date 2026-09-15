import {CanvasViewer, canvasControlsStyles} from "../canvas-viewer.js"
import {EditorFeature, type DocumentListenerMap} from "."
import {$, clearInlinePlacement, createStylesheet, isAppendixInteraction, isFormControlInteraction, isWidgetShadowInteraction, removeEditorMarker} from "../utility"
import {getDocumentRoot} from "../document-template"
import {canvasClass, canvasStyles, documentLayoutMode, resetEmptyTemplateContent, slideLayoutRole, type DocumentLayoutMode, type DocumentLayoutState} from "../document-layout"

type Item = HTMLElement | SVGSVGElement
type Point = {x: number, y: number}

/** The DOM owns item placement. This feature owns only a disposable camera
 * and appendix controls; remote changes are never normalized into a schema. */
export class CanvasFeature extends EditorFeature {
  protected handlesAppendixInteractions = true
  private viewer: CanvasViewer | null = null
  private slot: HTMLSlotElement | null = null
  private controls: HTMLElement | null = null
  private background: HTMLElement | null = null
  private stylesheet: CSSStyleSheet | null = null
  private observer: MutationObserver | null = null
  private frame: number | null = null
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

  private items(): Item[] {
    return Array.from(document.body.children).filter((el): el is Item =>
      (el instanceof HTMLElement || el instanceof SVGSVGElement) && !el.matches("style, script, link, meta, template"))
  }

  canConvertContent(nodes: Iterable<Node>) {
    return !Array.from(nodes).some(node => node instanceof Text && Boolean(node.textContent?.trim())
      || node instanceof Element && !(node instanceof HTMLElement || node instanceof SVGSVGElement)
        && !node.matches("style, script, link, meta, template"))
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
    if(documentLayoutMode() !== "document" || !this.getState().canConvert || document.body.children.length !== 1) return null
    const paragraph = document.body.firstElementChild!
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
      return this.editor.setDocumentLayout(mode, expectedMode)
    },
    startCanvas: ({}: {type: "startCanvas"}) => Boolean(this.emptyParagraph()) && this.convert("canvas"),
    navigateCanvas: ({operation}: {type: "navigateCanvas", operation: "zoom-in" | "zoom-out" | "actual-size" | "fit-content"}) => {
      if(!this.active) return
      this.viewer?.navigate(operation)
    },
  }

  convert(mode: "canvas" | "document", captureUndo = true) {
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
        const paragraph = resetEmptyTemplateContent()
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

  private fit() { this.viewer?.fit() }

  reveal(rect: {left: number, top: number, right: number, bottom: number}) {
    if(this.active) this.viewer?.reveal(rect)
  }

  panAtEdge(point: Point, rect?: {left: number, top: number, right: number, bottom: number}) {
    return this.isEnabled && this.active ? this.viewer?.panAtEdge(point, rect) ?? false : false
  }

  private cameraChanged = () => {
    this.editor.features.transformation.updateInfo()
    this.editor.features.layout.refresh()
    this.editor.features.graphic.refresh()
    document.dispatchEvent(new Event("scroll"))
    this.editor.postSelectionPath()
  }

  private stopPan() { this.viewer?.stopPan() }

  private ownEvent(event: Event) {
    return (!isAppendixInteraction(event) || event.composedPath()[0] === this.slot)
      && !isFormControlInteraction(event) && !isWidgetShadowInteraction(event, this.editor.schema)
  }

  private backgroundInteraction(event: Event) {
    const target = event.composedPath()[0]
    return target === document.body || target === document.documentElement || target === this.slot
  }

  private readonly preventBackgroundSelection = (event: MouseEvent) => {
    if(!this.active || event.button !== 0 || !this.backgroundInteraction(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  captureListeners: DocumentListenerMap = {
    pointerdown: event => {
      if(!this.active || !this.ownEvent(event)) return
      if(event.button === 0 && !this.hand && !this.spaceHand && this.backgroundInteraction(event)) {
        // Native caret lookup snaps blank space to nearby text. Only authored
        // element hits should enter that path; the camera slot is background.
        event.preventDefault()
        event.stopImmediatePropagation()
        const range = document.createRange()
        range.setStart(document.body, 0)
        range.collapse(true)
        this.editor.features.selection.selectDropRange(range, {scrollIntoView: false})
        return
      }
      if(event.button !== 1 && !(event.button === 0 && (this.hand || this.spaceHand))) return
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
      const target = event.composedPath()[0]
      if(!(target instanceof HTMLButtonElement) || !this.controls?.contains(target)) return
      if(target.name === "hand") { this.hand = !this.hand; this.schedule() }
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
    if(this.background) this.background.hidden = !this.active
    if(this.active && !this.slot) {
      this.slot = this.editor.appendix.querySelector<HTMLSlotElement>("slot:not([name])")!
      this.viewer = new CanvasViewer(this.slot, this.background!, this.controls!, this.cameraChanged)
      this.viewer.applyCamera()
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
    this.stylesheet = createStylesheet(canvasControlsStyles)
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
    this.background?.remove(); this.background = null
    this.controls?.remove(); this.controls = null
    if(this.stylesheet && document.body.shadowRoot) document.body.shadowRoot.adoptedStyleSheets = document.body.shadowRoot.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    this.stylesheet = null
    this.signature = ""
  }
}
