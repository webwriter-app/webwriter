import {EditorFeature, type DocumentListenerMap} from "."
import {$, clearInlinePlacement, createStylesheet, isAppendixInteraction, isFormControlInteraction, isWidgetShadowInteraction, removeEditorMarker} from "../utility"
import {getDocumentRoot} from "../document-template"
import {documentLayoutMode, resetEmptyTemplateContent, isSlide, slideLayoutRole, slidesClass, slidesStyles} from "../document-layout"

/** A CSS carousel with authored fragment links. Authoring and caret placement
 * belong to the editor; navigating and reading the saved deck need no script. */
export class SlidesFeature extends EditorFeature {
  private controls: HTMLElement | null = null
  private stylesheet: CSSStyleSheet | null = null
  private observer: MutationObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private markedNavigation: HTMLElement | null = null
  private activeLink: HTMLAnchorElement | null = null
  private frame: number | null = null
  private navigationFrame: number | null = null
  private signature = ""
  private selected: HTMLElement | null = null
  private removalTargets: Array<{slide: HTMLElement, link: HTMLAnchorElement, button: HTMLButtonElement}> = []
  get active() { return documentLayoutMode() === "slides" }
  private viewport() { return document.body.querySelector<HTMLElement>(":scope > div.ww-slides-viewport:not([is])") }
  private navigation() { return document.body.querySelector<HTMLElement>(":scope > nav.ww-slides-navigation:not([is])") }
  private slides() { return Array.from(this.viewport()?.children ?? []).filter(isSlide) }
  private content(slide: HTMLElement) {
    return Array.from(slide.childNodes).filter(node => node instanceof Text ? Boolean(node.data.trim())
      : node instanceof Element && slideLayoutRole(node) !== "navigation" && !node.matches("style,script,link,meta,template,br,wbr"))
  }

  /** Project only the carousel wrappers away, leaving authored nesting intact. */
  documentContent() {
    const viewport = this.viewport(), navigation = this.navigation()
    return Array.from(document.body.childNodes).flatMap(node => node === navigation ? []
      : node === viewport ? Array.from(viewport.childNodes).flatMap(child => isSlide(child)
        ? Array.from(child.childNodes).filter(item => !(item instanceof Element && item.matches("nav.ww-slide-directions:not([is])")))
        : [child]) : [node])
  }

  private createSlide(paragraph = document.createElement("p")) {
    const slide = document.createElement("section"), heading = document.createElement("h1")
    slide.className = "ww-slide"; slide.tabIndex = -1
    // These are authored text boxes: their placement travels with the HTML.
    for(const element of [heading, paragraph]) Object.assign(element.style, {
      position: "absolute", left: "var(--ww-page-gutter, 1.25rem)", width: "calc(100% - 2 * var(--ww-page-gutter, 1.25rem))",
    })
    Object.assign(heading.style, {top: "1.25rem", height: "20%"})
    Object.assign(paragraph.style, {top: "calc(20% + 2.5rem)", height: "calc(80% - 3.75rem)"})
    slide.append(heading, paragraph)
    return slide
  }

  /** The same minimum-content repair used for documents, without rebuilding authored content. */
  ensureContent() {
    if(!this.active) return null
    let viewport = this.viewport(), nav = this.navigation()
    if(!viewport) {
      viewport = document.createElement("div"); viewport.className = "ww-slides-viewport"
      document.body.insertBefore(viewport, nav)
    }
    let updateNavigation = !nav
    if(!nav) {
      nav = document.createElement("nav"); nav.className = "ww-slides-navigation"
      nav.contentEditable = "false"; nav.setAttribute("aria-label", "Slides")
      viewport.after(nav)
    }
    if(!this.slides().length) {
      const slide = document.createElement("section"); slide.className = "ww-slide"; slide.tabIndex = -1
      viewport.append(slide)
      updateNavigation = true
    }
    const selection = document.getSelection()
    const anchor = selection?.anchorNode, focus = selection?.focusNode
    let restored: HTMLElement | null = null
    for(const slide of this.slides()) {
      if(this.content(slide).length) continue
      const paragraph = document.createElement("p")
      slide.insertBefore(paragraph, slide.firstChild)
      if(!restored && (!anchor?.isConnected || !focus?.isConnected || anchor === slide || focus === slide
        || anchor === document.body || focus === document.body || anchor === viewport || focus === viewport)) {
        $.move(paragraph)
        restored = paragraph
      }
    }
    if(updateNavigation) this.updateNavigation()
    return restored
  }

  /** Enter a slide through an editable text block or the gap before its first item. */
  selectStart(slide: HTMLElement) {
    if(!this.active || !slide.isConnected || !isSlide(slide) || this.editor.isEditingLocked) return false
    this.ensureContent()
    const first = this.content(slide)[0]
    if(!first) return false
    slide.focus({preventScroll: true})
    this.cancelNavigation()
    if(first instanceof Text || first instanceof Element && this.editor.features.manipulation.isTextBlock(first)
      && !first.closest('[contenteditable="false" i], [inert]')) $.move(first)
    else if(first instanceof Element) $.selectGap(first, "before")
    this.editor.features.selection.selectDropRange($.range)
    this.editor.postSelectionPath()
    return true
  }

  cancelNavigation() {
    if(this.navigationFrame !== null) cancelAnimationFrame(this.navigationFrame)
    this.navigationFrame = null
  }

  private scheduleNavigation(slide: HTMLElement) {
    if(this.navigationFrame !== null) cancelAnimationFrame(this.navigationFrame)
    this.navigationFrame = requestAnimationFrame(() => {
      this.navigationFrame = null
      if(this.isEnabled) this.selectStart(slide)
    })
  }
  private current() {
    const viewport = this.viewport(), slides = this.slides()
    if(viewport?.clientWidth) {
      const left = viewport.getBoundingClientRect().left
      return slides.reduce<HTMLElement | null>((nearest, slide) => !nearest || Math.abs(slide.getBoundingClientRect().left - left) < Math.abs(nearest.getBoundingClientRect().left - left) ? slide : nearest, null)
    }
    return this.containingSlide(document.getSelection()?.anchorNode ?? null) ?? this.containingSlide(document.activeElement) ?? slides.at(-1) ?? null
  }

  conversionReason() {
    if(getDocumentRoot() !== document.body) return "A custom document template owns this document's layout."
    if(document.body.querySelectorAll(":scope > .ww-slides-viewport").length > 1
      || this.viewport() && !this.slides().length
      || !this.viewport() && this.navigation()) return "The existing carousel structure is incomplete."
    return null
  }

  private updateNavigation() {
    const nav = this.navigation()
    if(!nav) return
    const slides = this.slides()
    for(const slide of slides) if(!slide.id) {
      do { slide.id = `slide-${crypto.randomUUID()}` } while(document.getElementById(slide.id) !== slide)
    }
    const hrefs = new Set(slides.map(slide => `#${encodeURIComponent(slide.id)}`))
    for(const link of Array.from(nav.children)) {
      if(link.matches('a[aria-label^="Slide "]') && !hrefs.has(link.getAttribute("href") ?? "")) link.remove()
    }
    slides.forEach((slide, i) => {
      const href = `#${encodeURIComponent(slide.id)}`
      let link = Array.from(nav.children).find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement && node.getAttribute("href") === href)
      if(!link) { link = document.createElement("a"); link.href = href; link.textContent = String(i + 1) }
      else if(/^\d+$/.test(link.textContent ?? "")) link.textContent = String(i + 1)
      link.setAttribute("aria-label", `Slide ${i + 1}`)
      link.setAttribute("draggable", "false")
      nav.append(link)
      let directions = slide.querySelector<HTMLElement>(":scope > nav.ww-slide-directions")
      if(!directions) {
        directions = document.createElement("nav"); directions.className = "ww-slide-directions"
        directions.contentEditable = "false"; directions.setAttribute("aria-label", "Slide navigation")
        slide.append(directions)
      }
      for(const [name, label, symbol, neighbor] of [["previous", "Previous slide", "‹", slides[i - 1]], ["next", "Next slide", "›", slides[i + 1]]] as const) {
        let arrow = directions.querySelector<HTMLAnchorElement>(`a.ww-slide-${name}`)
        if(!arrow) { arrow = document.createElement("a"); arrow.className = `ww-slide-${name}`; arrow.textContent = symbol; directions.append(arrow) }
        arrow.setAttribute("aria-label", label)
        arrow.setAttribute("draggable", "false")
        if(neighbor) { arrow.href = `#${encodeURIComponent(neighbor.id)}`; arrow.removeAttribute("aria-disabled") }
        else { arrow.removeAttribute("href"); arrow.setAttribute("aria-disabled", "true") }
      }
    })
  }

  private ensureStyles() {
    // Measure older flow-based decks before enabling absolute positioning.
    // This happens only when opening/converting a deck, never during remote edits.
    const geometry = this.slides().flatMap(slide => {
      const origin = slide.getBoundingClientRect()
      return this.content(slide).flatMap(item => (item instanceof HTMLElement || item instanceof SVGSVGElement)
        && getComputedStyle(item).position !== "absolute" ? [{item, slide, origin, rect: item.getBoundingClientRect()}] : [])
    })
    if(!Array.from(document.head.querySelectorAll("style")).some(style => style.textContent === slidesStyles)) {
      const style = document.createElement("style"); style.textContent = slidesStyles; document.head.append(style)
    }
    for(const {item, slide, origin, rect} of geometry) {
      if(item.parentElement !== slide) continue
      Object.assign(item.style, {position: "absolute", left: `${rect.left - origin.left + slide.scrollLeft}px`, top: `${rect.top - origin.top + slide.scrollTop}px`, right: "auto", bottom: "auto"})
      if(rect.width > 0) item.style.width = `${rect.width}px`
    }
  }

  convert(mode: "slides" | "document", captureUndo = true) {
    if(this.editor.isEditingLocked || mode === "slides" && (documentLayoutMode() !== "document" || this.conversionReason()) || mode === "document" && !this.active) return false
    const end = captureUndo ? this.editor.doc.beginUndoGroup() : () => {}
    try {
      if(mode === "slides") {
        const empty = this.editor.features.canvas.emptyParagraph()
        const bodyRect = document.body.getBoundingClientRect()
        const geometry = !this.viewport() && !empty ? Array.from(document.body.children)
          .filter((item): item is HTMLElement | SVGSVGElement => (item instanceof HTMLElement || item instanceof SVGSVGElement) && !item.matches("style,script,link,meta,template"))
          .map(item => ({item, rect: item.getBoundingClientRect()})) : []
        this.ensureStyles()
        if(!this.viewport()) {
          const content = Array.from(document.body.childNodes).filter(node => !(node instanceof Element && node.matches("style,script,link,meta,template")))
          const viewport = document.createElement("div"), nav = document.createElement("nav")
          viewport.className = "ww-slides-viewport"
          nav.className = "ww-slides-navigation"; nav.setAttribute("aria-label", "Slides"); nav.contentEditable = "false"
          document.body.insertBefore(viewport, content[0] ?? null)
          const slide = empty ? this.createSlide(empty as HTMLParagraphElement) : document.createElement("section")
          slide.className = "ww-slide"; slide.tabIndex = -1
          viewport.append(slide)
          for(const node of content) if(node.parentNode === document.body) slide.append(node)
          if(!slide.childNodes.length) slide.append(document.createElement("p"))
          viewport.after(nav)
        }
        for(const container of [this.viewport(), this.navigation()]) if(container) clearInlinePlacement(container)
        document.body.classList.add(slidesClass)
        for(const {item, rect} of geometry) {
          if(!isSlide(item.parentNode)) continue
          Object.assign(item.style, {position: "absolute", left: `${rect.left - bodyRect.left}px`, top: `${rect.top - bodyRect.top + 20}px`, right: "auto", bottom: "auto"})
          if(rect.width > 0) item.style.width = `${rect.width}px`
        }
        this.ensureContent()
        this.updateNavigation()
      }
      else {
        document.body.classList.remove(slidesClass)
        if(!document.body.classList.length) document.body.removeAttribute("class")
        this.navigation()?.remove()
        for(const slide of this.slides()) {
          for(const directions of slide.querySelectorAll(":scope > nav.ww-slide-directions:not([is])")) directions.remove()
          for(const item of this.content(slide)) if(item instanceof Element) clearInlinePlacement(item)
          slide.replaceWith(...slide.childNodes)
        }
        const viewport = this.viewport()
        if(viewport) viewport.replaceWith(...viewport.childNodes)
        const paragraph = resetEmptyTemplateContent()
        if(paragraph) {
          $.move(paragraph)
          this.editor.features.selection.selectDropRange($.range, {scrollIntoView: false})
        }
      }
    }
    finally { end() }
    if(this.active) { const slide = this.slides()[0]; if(slide) this.selectStart(slide) }
    this.refresh()
    this.editor.postSelectionPath()
    return true
  }

  containingSlide(node: Node | null): HTMLElement | null {
    while(node && node !== document.body) { if(isSlide(node)) return node; node = node.parentNode }
    return null
  }

  allowsSelection(range = document.getSelection()?.rangeCount ? $.range : null) {
    if(!this.active) return true
    if(!range || !range.startContainer.isConnected || !range.endContainer.isConnected) return false
    const start = this.containingSlide(range.startContainer), end = this.containingSlide(range.endContainer)
    if(start || end) return Boolean(start && start === end)
    return range.startContainer !== document.body && range.endContainer !== document.body
      && range.startContainer !== this.viewport() && range.endContainer !== this.viewport()
      && !this.slides().some(slide => range.intersectsNode(slide))
  }

  private edit(operation: "add" | "remove" | "earlier" | "later", current = this.current()) {
    const viewport = this.viewport(), nav = this.navigation(), slides = this.slides(), visible = this.current(), index = slides.indexOf(current!)
    if(!this.active || this.editor.isEditingLocked || !viewport || !nav || current && index < 0 || operation !== "add" && !current
      || operation === "earlier" && index <= 0 || operation === "later" && index >= slides.length - 1) return false
    let selected = current
    const end = this.editor.doc.beginUndoGroup()
    try {
      if(operation === "add") {
        selected = this.createSlide()
        if(current) current.after(selected)
        else viewport.append(selected)
      }
      else if(operation === "remove") {
        for(const link of Array.from(nav.children)) if(link.getAttribute("href") === `#${encodeURIComponent(current!.id)}`) link.remove()
        current!.remove(); selected = visible !== current && visible?.isConnected ? visible : slides[index + 1] ?? slides[index - 1] ?? null
      }
      else if(operation === "earlier") slides[index - 1].before(current!)
      else slides[index + 1].after(current!)
      this.ensureContent()
      this.updateNavigation()
    }
    finally { end() }
    selected = selected?.isConnected ? selected : this.slides()[0]
    if(selected) {
      this.selectStart(selected)
      selected.scrollIntoView?.({block: "nearest", inline: "start", behavior: "instant"})
    }
    this.refresh()
    this.editor.postSelectionPath()
    return true
  }

  actions = {
    startSlides: ({}: {type: "startSlides"}) => Boolean(this.editor.features.canvas.emptyParagraph()) && this.convert("slides"),
    addSlide: ({}: {type: "addSlide"}) => this.edit("add"),
    removeSlide: ({}: {type: "removeSlide"}) => this.edit("remove"),
    moveSlide: ({direction}: {type: "moveSlide", direction: "earlier" | "later"}) => ["earlier", "later"].includes(direction) && this.edit(direction),
  }

  private navigationEvent(event: Event) {
    const origin = event.composedPath()[0]
    const directions = origin instanceof Element ? origin.closest("nav.ww-slide-directions") : null
    return this.active && origin instanceof Element && Boolean(this.navigation()?.contains(origin) || directions && isSlide(directions.parentNode))
  }
  private boundaryInput(event: Event) {
    if(!this.active || this.navigationEvent(event) || isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event)) return
    if(!this.allowsSelection()) { event.preventDefault(); event.stopImmediatePropagation() }
  }
  private controlEvent(event: Event) {
    const origin = event.composedPath()[0]
    return this.navigationEvent(event) || origin instanceof Node && Boolean(this.controls?.contains(origin))
  }
  private preventControlDrag(event: DragEvent) {
    if(!this.controlEvent(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if(event.dataTransfer) event.dataTransfer.dropEffect = "none"
  }
  captureListeners: DocumentListenerMap = {
    scroll: () => this.schedule(),
    pointerover: event => { if(this.controlEvent(event)) this.schedule() },
    pointerout: event => { if(this.controlEvent(event)) this.schedule() },
    dragstart: event => this.preventControlDrag(event),
    dragover: event => this.preventControlDrag(event),
    drop: event => this.preventControlDrag(event),
    scrollend: event => {
      if(event.target !== this.viewport() || !this.active) return
      const slide = this.current()
      if(slide && $.selectedElement !== slide && this.containingSlide(document.getSelection()?.anchorNode ?? null) !== slide) this.selectStart(slide)
    },
    // Preserve native link activation; only caret placement belongs to the editor.
    // The same fragment links and CSS work with the editor completely absent.
    pointerdown: event => { if(this.navigationEvent(event)) event.stopImmediatePropagation() },
    click: event => {
      if(!this.navigationEvent(event)) return
      event.stopImmediatePropagation()
      const link = (event.composedPath()[0] as Element).closest("a")
      const href = link?.getAttribute("href")
      // srcdoc inherits the parent's base URL. Keep fragment activation in
      // this iframe; the browser still performs the anchor navigation.
      if(document.URL.startsWith("about:srcdoc") && href?.startsWith("#")) {
        event.preventDefault()
        window.location.assign(`about:srcdoc${href}`)
      }
      if(href?.startsWith("#")) {
        try {
          const slide = document.getElementById(decodeURIComponent(href.slice(1)))
          if(isSlide(slide)) this.scheduleNavigation(slide)
        }
        catch { /* An externally authored malformed fragment has no slide target. */ }
      }
    },
    keydown: event => { if(this.navigationEvent(event)) event.stopImmediatePropagation(); else if(["Enter", "Backspace", "Delete"].includes(event.key)) this.boundaryInput(event) },
    beforeinput: event => {
      this.boundaryInput(event)
      if(!this.active || event.defaultPrevented || this.navigationEvent(event) || isAppendixInteraction(event) || isWidgetShadowInteraction(event, this.editor.schema) || isFormControlInteraction(event)) return
      if(event.inputType === "insertParagraph" || event.inputType.startsWith("delete")) {
        event.preventDefault(); event.stopImmediatePropagation()
        if(event.inputType === "insertParagraph") this.editor.features.manipulation.insert()
        else this.editor.features.manipulation.delete(event.inputType.toLowerCase().includes("backward") ? "backward" : "forward")
      }
    },
    paste: event => this.boundaryInput(event),
    cut: event => this.boundaryInput(event),
  }
  passiveListeners: DocumentListenerMap = {
    selectionchange: () => this.schedule(),
    focusin: event => {
      this.schedule()
      if(this.active && isSlide(event.target as Node | null) && $.selectedElement !== event.target) this.scheduleNavigation(event.target as HTMLElement)
    },
  }
  private schedule = () => {
    if(this.isEnabled && this.frame === null) this.frame = requestAnimationFrame(() => { this.frame = null; this.refresh() })
  }
  private refresh() {
    if(!this.controls) return
    // Also cover layout/class changes, which the document content observer does not watch.
    this.ensureContent()
    const nav = this.active ? this.navigation() : null
    if(nav !== this.markedNavigation) {
      if(this.markedNavigation) removeEditorMarker(this.markedNavigation, "◆slide-navigation-editing")
      this.resizeObserver?.disconnect()
      this.markedNavigation = nav
      if(nav) { nav.classList.add("◆slide-navigation-editing"); this.resizeObserver?.observe(nav) }
    }
    this.controls.hidden = !nav
    const selected = this.current(), slides = this.slides()
    const targets = nav ? slides.flatMap(slide => {
      const link = Array.from(nav.querySelectorAll<HTMLAnchorElement>(":scope > a")).find(link => link.getAttribute("href") === `#${encodeURIComponent(slide.id)}`)
      return link ? [{slide, link}] : []
    }) : []
    const activeLink = targets.find(target => target.slide === selected)?.link ?? null
    if(this.activeLink !== activeLink) {
      if(this.activeLink) removeEditorMarker(this.activeLink, "◆slide-current")
      this.activeLink = activeLink
      activeLink?.classList.add("◆slide-current")
    }
    const signature = JSON.stringify([this.active, this.editor.isEditingLocked, slides.length])
    if(signature !== this.signature || selected !== this.selected || targets.length !== this.removalTargets.length
      || targets.some((target, i) => target.slide !== this.removalTargets[i].slide || target.link !== this.removalTargets[i].link)) {
      this.signature = signature; this.selected = selected
      this.controls.replaceChildren()
      const button = (name: string, label: string, text: string, run: () => void) => {
        const button = document.createElement("button")
        button.type = "button"; button.name = name; button.textContent = text; button.setAttribute("draggable", "false")
        button.title = label; button.setAttribute("aria-label", label); button.disabled = this.editor.isEditingLocked
        button.addEventListener("pointerdown", event => event.preventDefault())
        button.addEventListener("click", run)
        this.controls!.append(button)
        return button
      }
      button("add", "Add slide", "+", () => this.actions.addSlide({type: "addSlide"}))
      this.removalTargets = targets.map(({slide, link}, i) => ({slide, link,
        button: button("remove", `Remove slide ${i + 1}`, "×", () => this.edit("remove", slide))}))
    }
    if(nav) {
      const rect = nav.getBoundingClientRect(), add = this.controls.querySelector<HTMLElement>('[name="add"]')!
      add.style.left = `${rect.right + 8}px`; add.style.top = `${rect.top + (rect.height - add.offsetHeight) / 2}px`
      for(const {slide, link, button} of this.removalTargets) {
        const bubble = link.getBoundingClientRect()
        button.classList.toggle("shown", slide === selected || link.matches(":hover, :focus-visible") || button.matches(":hover, :focus-visible"))
        button.hidden = bubble.left < rect.left || bubble.right > rect.right
        button.style.left = `${bubble.right - button.offsetWidth / 2 - 4}px`; button.style.top = `${bubble.top - button.offsetHeight / 2 + 4}px`
      }
    }
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    if(this.active) { this.ensureStyles(); this.updateNavigation() }
    this.controls = document.createElement("div"); this.controls.setAttribute("part", "slide-navigation-actions"); this.controls.contentEditable = "false"
    this.controls.setAttribute("role", "toolbar"); this.controls.setAttribute("aria-label", "Slide actions")
    this.editor.addAppendix(this.controls)
    this.stylesheet = createStylesheet(`
      [part=slide-navigation-actions] {position:fixed;inset:0;z-index:2;pointer-events:none}
      [part=slide-navigation-actions][hidden] {display:none}
      [part=slide-navigation-actions] button {position:fixed;pointer-events:auto;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0;padding:0;border:1px solid currentColor;border-radius:50%;background:#fff;color:#2f3742;font:20px/1 system-ui;cursor:pointer;user-select:none;-webkit-user-drag:none}
      [part=slide-navigation-actions] button[name=add] {font-size:0}
      [part=slide-navigation-actions] button[name=add]::before,
      [part=slide-navigation-actions] button[name=add]::after {content:"";position:absolute;left:50%;top:50%;width:12px;height:2px;background:currentColor;transform:translate(-50%,-50%)}
      [part=slide-navigation-actions] button[name=add]::after {width:2px;height:12px}
      [part=slide-navigation-actions] button[name=remove] {width:16px;height:16px;font:12px/1 system-ui;visibility:hidden;pointer-events:none}
      [part=slide-navigation-actions] button[name=remove].shown {visibility:visible;pointer-events:auto}
      [part=slide-navigation-actions] button[hidden] {display:none}
      [part=slide-navigation-actions] button:not(:disabled):hover {background:#f2f2f2}
      [part=slide-navigation-actions] button:not(:disabled):active {background:#d8dee6}
      [part=slide-navigation-actions] button:focus-visible {outline:2px solid currentColor;outline-offset:2px}
      [part=slide-navigation-actions] button:disabled {opacity:.4;cursor:not-allowed}
      @media print {[part=slide-navigation-actions] {display:none}}
    `)
    this.editor.appendix.adoptedStyleSheets = [...this.editor.appendix.adoptedStyleSheets, this.stylesheet]
    this.resizeObserver = new ResizeObserver(this.schedule)
    window.addEventListener("resize", this.schedule)
    this.observer = new MutationObserver(this.schedule); this.observer.observe(document.body, {subtree: true, childList: true, attributes: true})
    this.refresh()
  }
  disable() {
    super.disable(); this.observer?.disconnect(); this.observer = null
    this.resizeObserver?.disconnect(); this.resizeObserver = null
    window.removeEventListener("resize", this.schedule)
    if(this.markedNavigation) removeEditorMarker(this.markedNavigation, "◆slide-navigation-editing")
    if(this.activeLink) removeEditorMarker(this.activeLink, "◆slide-current")
    this.activeLink = null
    this.markedNavigation = null
    if(this.frame !== null) cancelAnimationFrame(this.frame)
    this.cancelNavigation()
    this.frame = null; this.controls?.remove(); this.controls = null
    if(this.stylesheet && document.body.shadowRoot) document.body.shadowRoot.adoptedStyleSheets = document.body.shadowRoot.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    this.stylesheet = null; this.signature = ""; this.selected = null; this.removalTargets = []
  }
}
