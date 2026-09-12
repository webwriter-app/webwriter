import {EditorFeature, type DocumentListenerMap} from "."
import {$, createStylesheet, getContainer, removeEditorMarker} from "../utility"
import {getDocumentRoot} from "../document-template"
import {isSectionElement} from "../sections"
import {layoutFraction, layoutPlacement, layoutPresets, layoutStyleProperties, parseLayoutTracks, remapLayoutPlacement, type LayoutAxis, type LayoutKind, type LayoutSelectionState, type LayoutTrackState} from "../layouts"
import type {ElementStyleMutation} from "../editor-bridge"

type Geometry = {start: number, sizes: number[], gap: number, scale: number, reverse: boolean, crossStart: number, crossSize: number}
type Gesture = {
  target: HTMLElement, parent: Element | null, children: Element[], placements: string,
  axis: LayoutAxis, index: number, pointerId: number, handle: HTMLElement,
  origin: number, size: number, geometry: Geometry, tracks: string[],
  initial: string, priority: string, written: string, endUndo: () => void,
}
const propertyFor = (axis: LayoutAxis) => `grid-template-${axis === "column" ? "columns" : "rows"}`
const numeric = (value: string) => Number.parseFloat(value) || 0
const axes = ["column", "row"] as const

/** Layouts are ordinary authored sections. All state below is a disposable
 * projection of the live DOM; no cell schema or preset identity is retained. */
export class LayoutFeature extends EditorFeature {
  protected handlesAppendixInteractions = true
  private overlay: HTMLElement | null = null
  private marked: HTMLElement | null = null
  private stylesheet: CSSStyleSheet | null = null
  private selectedTrack: {axis: LayoutAxis, index: number} | null = null
  private frame: number | null = null
  private observer: MutationObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private gesture: Gesture | null = null
  private signature = ""
  private stateSignature = "null"
  private editingItem = false
  private readonly schedule = () => {
    if(this.isEnabled && this.frame === null) this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.update()
    })
  }

  private kind(element: Element | null): LayoutKind | null {
    if(!(element instanceof HTMLElement) || !isSectionElement(element) || element.hasAttribute("is")
      || !getDocumentRoot().contains(element) || element === getDocumentRoot()) return null
    const display = getComputedStyle(element).display
    return /(?:^|\s|-)grid$/.test(display) ? "grid" : /(?:^|\s|-)flex$/.test(display) ? "flex" : null
  }

  private context() {
    const selected = this.editor.features.selection.selectedSectionElement
      ?? this.editor.features.selection.captureSelectedElement ?? $.selectedElement
    if(!selected?.isConnected || !getDocumentRoot().contains(selected)) return null
    const ownKind = this.kind(selected)
    if(ownKind) return {target: selected as HTMLElement, kind: ownKind, item: null}
    const kind = this.kind(selected.parentElement)
    return kind && selected instanceof HTMLElement ? {target: selected.parentElement!, kind, item: selected} : null
  }

  /** Keep the selected item's layout declarations on the blocks produced by
   * an editor command. This is scoped to that synchronous edit, never a DOM
   * normalizer: widget, remote and direct DOM changes remain authoritative. */
  preserveItemLayout<T>(command: () => T): T {
    if(this.editingItem || this.editor.isEditingLocked || !document.getSelection()?.rangeCount) return command()
    const range = $.range
    let item = $.selectedElement ?? getContainer(range.commonAncestorContainer)
    while(item && item !== getDocumentRoot() && !this.kind(item.parentElement)) item = item.parentElement!
    if(!(item instanceof HTMLElement)) return command()
    const target = item.parentElement
    const kind = this.kind(target)
    if(!target || !kind) return command()
    const original = item
    const children = Array.from(target.children)
    const index = children.indexOf(original)
    const before = children.slice(0, index), after = children.slice(index + 1)
    const containerStyle = target.getAttribute("style")
    const signatures = new Map(children.map(child => [child, this.itemPlacementSignature(child)]))
    const declarations = new Map<string, ElementStyleMutation>()
    const properties = ["min-inline-size", "order", "align-self", "justify-self",
      ...(kind === "flex" ? ["flex-grow", "flex-shrink", "flex-basis"]
        : ["grid-row-start", "grid-row-end", "grid-column-start", "grid-column-end"])]
    for(const name of properties) {
      const axis = /^grid-(row|column)-(start|end)$/.exec(name)
      const shorthand = axis ? original.style.getPropertyValue(`grid-${axis[1]}`) : ""
      const value = original.style.getPropertyValue(name) || (shorthand ? shorthand.split("/")[axis![2] === "start" ? 0 : 1]?.trim() || "auto" : "")
      if(value) declarations.set(name, {value, priority: original.style.getPropertyPriority(name) === "important"
        || axis && original.style.getPropertyPriority(`grid-${axis[1]}`) === "important" ? "important" : ""})
    }
    const rows = kind === "grid" ? this.trackState(target, "row") : null
    const columns = kind === "grid" ? this.trackState(target, "column") : null
    const rowPlacements = rows?.tracks && !rows.reason ? this.placements(target, "row", rows.tracks.length) : null
    const columnPlacements = columns?.tracks && !columns.reason ? this.placements(target, "column", columns.tracks.length) : null
    const row = rowPlacements?.find(entry => entry.element === original)?.placement
    const column = columnPlacements?.find(entry => entry.element === original)?.placement
    this.editingItem = true
    try {
      const result = command()
      // Revalidate the live parent and unaffected siblings before assigning
      // positions. A widget may have changed them during the command.
      if(this.kind(target) !== kind || target.getAttribute("style") !== containerStyle) return result
      const current = Array.from(target.children)
      if(before.some((child, i) => current[i] !== child)
        || after.some((child, i) => current[current.length - after.length + i] !== child)) return result
      const replacements = current.slice(before.length, current.length - after.length)
      if(!replacements.length || replacements.length === 1 && replacements[0] === original
        || replacements.some(element => !(element instanceof HTMLElement) || children.includes(element) && element !== original)) return result
      // Unchanged siblings must also retain their authored placement. Ignore
      // the original item, whose replacement/split is the intended edit.
      if([...before, ...after].some(child => this.itemPlacementSignature(child) !== signatures.get(child))) return result
      const blocks = replacements as HTMLElement[]
      for(const block of blocks) {
        if(block === original) continue
        const styles = Object.fromEntries([...declarations].filter(([name]) => !block.style.getPropertyValue(name)))
        this.editor.features.manipulation.setElementStyles(block, styles)
      }
      if(kind !== "grid" || blocks.length === 1) return result
      if(!rows?.tracks || !rowPlacements || !columnPlacements || !row || row === "auto" || !column || column === "auto"
        || rows.tracks.length + blocks.length - 1 > 100) {
        // Complex and auto-placed grids keep native flow. Do not duplicate a
        // cloned explicit row on every continuation and make blocks overlap.
        for(const block of blocks.slice(1)) {
          const inheritedRow = ["grid-row-start", "grid-row-end"].every(name => {
            const declaration = declarations.get(name)
            return block.style.getPropertyValue(name) === (typeof declaration === "object" ? declaration?.value : "")
          })
          if(inheritedRow || block.style.gridRow && block.style.gridRow === original.style.gridRow) {
            this.setPlacement(block, "row", "auto")
          }
        }
        return result
      }
      const extra = blocks.length - 1, boundary = row[1]
      const tracks = [...rows.tracks]
      tracks.splice(boundary - 1, 0, ...Array(extra).fill("auto"))
      this.editor.features.manipulation.setElementStyles(target, {[propertyFor("row")]: {
        value: tracks.join(" "), priority: target.style.getPropertyPriority(propertyFor("row")) === "important" ? "important" : "",
      }})
      for(const {element, placement} of rowPlacements) {
        if(element === original || placement === "auto" || element.parentElement !== target) continue
        const [start, end] = placement
        // Neighboring columns span the new continuation rows; lower panels
        // move down together. The content elements themselves remain intact.
        if(end >= boundary) this.setPlacement(element, "row", [start >= boundary ? start + extra : start, end + extra])
      }
      blocks.forEach((block, i) => {
        this.setPlacement(block, "column", column)
        this.setPlacement(block, "row", i === 0 ? row : [boundary + i - 1, boundary + i])
      })
      return result
    }
    finally { this.editingItem = false }
  }

  private setPlacement(element: HTMLElement, axis: LayoutAxis, placement: [number, number] | "auto") {
    const styles: Record<string, ElementStyleMutation> = {}
    for(const [offset, edge] of ["start", "end"].entries()) {
      const name = `grid-${axis}-${edge}`
      styles[name] = {value: placement === "auto" ? "auto" : String(placement[offset]), priority: element.style.getPropertyPriority(name) === "important" || element.style.getPropertyPriority(`grid-${axis}`) === "important" ? "important" : ""}
    }
    this.editor.features.manipulation.setElementStyles(element, styles)
  }

  private placements(target: HTMLElement, axis: LayoutAxis, count: number) {
    if(Array.from(target.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return null
    const result: Array<{element: HTMLElement, placement: [number, number] | "auto"}> = []
    for(const child of Array.from(target.children)) {
      const style = getComputedStyle(child)
      if(style.display === "none" || style.position === "absolute" || style.position === "fixed") continue
      if(style.display === "contents" || !(child instanceof HTMLElement)) return null
      const shorthand = child.style.getPropertyValue(`grid-${axis}`).split("/").map(part => part.trim())
      const start = style.getPropertyValue(`grid-${axis}-start`) || child.style.getPropertyValue(`grid-${axis}-start`) || shorthand[0] || "auto"
      const end = style.getPropertyValue(`grid-${axis}-end`) || child.style.getPropertyValue(`grid-${axis}-end`) || shorthand[1] || "auto"
      const placement = layoutPlacement(start, end, count)
      if(placement === null) return null
      result.push({element: child, placement})
    }
    return result
  }

  private trackState(target: HTMLElement, axis: LayoutAxis): LayoutTrackState {
    const style = getComputedStyle(target)
    const authored = target.style.getPropertyValue(propertyFor(axis))
    const tracks = parseLayoutTracks(authored)
    const resolved = parseLayoutTracks(style.getPropertyValue(propertyFor(axis)))
    let reason: string | null = !tracks ? "Enter a finite explicit track list to edit individual tracks." : null
    if(tracks && style.gridTemplateAreas && style.gridTemplateAreas !== "none") reason = "Edit named areas in Advanced layout before adding or removing tracks."
    if(tracks && !this.placements(target, axis, tracks.length)) reason = "This layout has complex item placement. Edit its CSS before adding or removing tracks."
    return {tracks, automatic: Math.max(0, (resolved?.length ?? 0) - (tracks?.length ?? 0)), reason}
  }

  getState(): LayoutSelectionState | null {
    const context = this.context()
    if(!context) return null
    const {target, kind, item} = context
    const manipulation = this.editor.features.manipulation
    return {
      kind, item: Boolean(item),
      columns: this.trackState(target, "column"), rows: this.trackState(target, "row"),
      style: manipulation.getStyleState([...layoutStyleProperties], target),
      ...(item ? {itemStyle: manipulation.getStyleState([...layoutStyleProperties], item)} : {}),
    }
  }

  private insert(presetId: string) {
    if(this.editor.isEditingLocked) return false
    const preset = layoutPresets.find(item => item.id === presetId)
    if(!preset) throw new TypeError("Unknown layout preset")
    const selection = document.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const selectedSection = this.editor.features.selection.selectedSectionElement
    if(!selectedSection && (!range || !getDocumentRoot().contains(range.startContainer) || !getDocumentRoot().contains(range.endContainer))) return false
    let targets: Element[] | null = null
    if(selectedSection) targets = [selectedSection]
    else if(range && !range.collapsed) {
      if(range.startContainer !== range.endContainer || !(range.startContainer instanceof Element)) {
        throw new TypeError("Select complete sibling blocks to wrap them in a layout.")
      }
      const nodes = Array.from(range.startContainer.childNodes).slice(range.startOffset, range.endOffset)
      if(nodes.some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) throw new TypeError("Select complete blocks to wrap them in a layout.")
      targets = nodes.filter((node): node is Element => node instanceof Element)
      if(!targets.length || targets.some(node => this.editor.schema.isPhrasing(node))) throw new TypeError("Select complete blocks to wrap them in a layout.")
    }
    const end = this.editor.doc.beginUndoGroup()
    try {
      let section: HTMLElement | null
      if(targets) {
        if(selectedSection) $.selectElement(selectedSection)
        section = this.editor.features.manipulation.wrapTargetsInSection(targets, "section")
      }
      else {
        section = document.createElement("section")
        Object.entries(preset.styles).forEach(([name, value]) => section!.style.setProperty(name, value))
        for(let index = 0; index < preset.items; index++) {
          section.append(document.createElement("p"))
        }
        this.editor.features.manipulation.insert(section)
      }
      if(!section?.isConnected) return false
      this.editor.features.manipulation.setElementStyles(section, preset.styles)
      const columns = preset.kind === "grid" ? parseLayoutTracks(preset.styles["grid-template-columns"])!.length : 0
      if(columns) {
        const rows = parseLayoutTracks(preset.styles["grid-template-rows"])!
        while(rows.length < Math.ceil(section.children.length / columns)) rows.push("auto")
        this.editor.features.manipulation.setElementStyles(section, {"grid-template-rows": rows.join(" ")})
      }
      Array.from(section.children).forEach((child, index) => {
        this.editor.features.manipulation.setElementStyles(child, {
          ...preset.itemStyles,
          ...(columns ? {"grid-column": `${index % columns + 1} / ${index % columns + 2}`, "grid-row": `${Math.floor(index / columns) + 1} / ${Math.floor(index / columns) + 2}`} : {}),
        })
      })
      $.selectElement(section)
      this.editor.features.selection.selectSectionElement(section)
      this.editor.postSelectionPath(true)
      this.refresh()
      return true
    }
    finally { end() }
  }

  private setStyles(styles: Record<string, ElementStyleMutation>, item = false) {
    if(this.editor.isEditingLocked) return false
    const context = this.context()
    const target = item ? context?.item : context?.target
    if(!target) return false
    if(Object.keys(styles).some(name => !layoutStyleProperties.includes(name as typeof layoutStyleProperties[number]))) throw new TypeError("Unsupported layout property")
    const end = this.editor.doc.beginUndoGroup()
    try { return this.editor.features.manipulation.setElementStyles(target, styles) }
    finally { end(); this.refresh() }
  }

  private editTrack(axis: LayoutAxis, index: number, operation: "insert" | "remove" | "size", value?: string) {
    if(this.editor.isEditingLocked) return false
    if(!axes.includes(axis) || !Number.isSafeInteger(index)) throw new TypeError("Invalid grid track")
    const context = this.context()
    if(!context || context.kind !== "grid") return false
    const {target} = context
    const state = this.trackState(target, axis)
    if(!state.tracks || operation !== "size" && state.reason) return false
    const tracks = [...state.tracks]
    if(index < 0 || index >= tracks.length + (operation === "insert" ? 1 : 0)) return false
    if(operation === "remove" && tracks.length === 1 || operation === "insert" && tracks.length >= 100) return false
    const placements = operation === "size" ? [] : this.placements(target, axis, tracks.length)
    if(!placements) return false
    if(operation === "size") {
      const parsed = typeof value === "string" ? parseLayoutTracks(value) : null
      if(!parsed || parsed.length !== 1) throw new TypeError("Enter one valid track size")
      tracks[index] = value!
    }
    else if(operation === "insert") tracks.splice(index, 0, axis === "column" ? "minmax(0, 1fr)" : "auto")
    else tracks.splice(index, 1)
    const end = this.editor.doc.beginUndoGroup()
    try {
      this.editor.features.manipulation.setElementStyles(target, {[propertyFor(axis)]: {value: tracks.join(" "), priority: target.style.getPropertyPriority(propertyFor(axis)) === "important" ? "important" : ""}})
      for(const {element, placement} of placements) {
        if(placement === "auto") continue
        const mapped = remapLayoutPlacement(placement, index, operation === "remove")
        if(mapped !== "auto" && mapped[0] === placement[0] && mapped[1] === placement[1]) continue
        this.setPlacement(element, axis, mapped)
      }
      return true
    }
    finally { end(); this.refresh() }
  }

  actions = {
    insertLayoutRegion: ({row, column}: {type: "insertLayoutRegion", row: number, column: number}) => this.insertRegion(row, column),
    insertLayout: ({preset}: {type: "insertLayout", preset: string}) => this.insert(preset),
    setLayoutStyles: ({styles, target}: {type: "setLayoutStyles", styles: Record<string, ElementStyleMutation>, target?: "container" | "item"}) => this.setStyles(styles, target === "item"),
    insertLayoutTrack: ({axis, index}: {type: "insertLayoutTrack", axis: LayoutAxis, index: number}) => this.editTrack(axis, index, "insert"),
    removeLayoutTrack: ({axis, index}: {type: "removeLayoutTrack", axis: LayoutAxis, index: number}) => this.editTrack(axis, index, "remove"),
    setLayoutTrackSize: ({axis, index, value}: {type: "setLayoutTrackSize", axis: LayoutAxis, index: number, value: string}) => this.editTrack(axis, index, "size", value),
  } as const

  refresh() { this.schedule() }

  private createOverlay() {
    const overlay = document.createElement("div")
    overlay.className = "◆layout-overlay"
    this.stylesheet = createStylesheet(`
      .◆layout-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 10001; font: 12px system-ui; color: #176db8; }
      .◆layout-overlay button { font: inherit; color: inherit; background: #fff; border: 1px solid #176db8; border-radius: 3px; padding: 2px 5px; pointer-events: auto; cursor: pointer; position: absolute; }
      .◆layout-outline { position: absolute; border: 1px solid #176db8; pointer-events: none; }
      .◆layout-overlay .◆layout-separator { background: transparent; border: 0; padding: 0; touch-action: none; }
      .◆layout-separator::after { content: ''; position: absolute; background: #176db8; opacity: .55; }
      .◆layout-separator[data-axis=column] { width: 12px; cursor: col-resize; }
      .◆layout-separator[data-axis=column]::after { width: 1px; height: 100%; left: 6px; top: 0; }
      .◆layout-separator[data-axis=row] { height: 12px; cursor: row-resize; }
      .◆layout-separator[data-axis=row]::after { height: 1px; width: 100%; top: 6px; left: 0; }
      .◆layout-overlay .◆layout-label { display: flex; gap: 2px; position: absolute; pointer-events: auto; }
      .◆layout-label button { position: static; font-size: 11px; }
      @media (pointer: coarse) { .◆layout-label button { min-width: 36px; min-height: 36px; } }
    `)
    this.editor.appendix.adoptedStyleSheets = [...this.editor.appendix.adoptedStyleSheets, this.stylesheet]
    this.editor.addAppendix(overlay)
    this.overlay = overlay
    return overlay
  }

  private geometry(target: HTMLElement, axis: LayoutAxis): Geometry | null {
    const style = getComputedStyle(target)
    if(style.writingMode && style.writingMode !== "horizontal-tb") return null
    for(let ancestor: Element | null = target; ancestor; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor)
      if(css.transform && css.transform !== "none" || css.rotate && css.rotate !== "none" && css.rotate !== "0deg"
        || css.perspective && css.perspective !== "none" || css.scale && css.scale !== "none" && css.scale !== "1") return null
    }
    const rect = target.getBoundingClientRect()
    const horizontal = axis === "column"
    const scale = (horizontal ? rect.width / target.offsetWidth : rect.height / target.offsetHeight) || 1
    const raw = parseLayoutTracks(style.getPropertyValue(propertyFor(axis)))
    if(!raw || raw.some(value => !/^\d+(?:\.\d+)?px$/.test(value))) return null
    const sizes = raw.map(value => numeric(value) * scale)
    const before = numeric(horizontal ? style.paddingLeft : style.paddingTop) * scale
    const after = numeric(horizontal ? style.paddingRight : style.paddingBottom) * scale
    const content = (horizontal ? target.clientWidth : target.clientHeight) * scale - before - after
    let gap = numeric(horizontal ? style.columnGap : style.rowGap) * scale
    if((horizontal ? style.columnGap : style.rowGap).endsWith("%")) gap = content * gap / scale / 100
    const extra = Math.max(0, content - sizes.reduce((sum, n) => sum + n, 0) - gap * (sizes.length - 1))
    const align = horizontal ? style.justifyContent : style.alignContent
    let offset = /(?:^|\s)(?:end|flex-end)$/.test(align) ? extra : align.endsWith("center") ? extra / 2 : 0
    if(align === "space-between" && sizes.length > 1) gap += extra / (sizes.length - 1)
    if(align === "space-around") { gap += extra / sizes.length; offset = extra / sizes.length / 2 }
    if(align === "space-evenly") { gap += extra / (sizes.length + 1); offset = extra / (sizes.length + 1) }
    const reverse = horizontal && style.direction === "rtl"
    return {sizes, gap, scale, reverse,
      start: (horizontal ? reverse ? rect.right - numeric(style.borderRightWidth) * scale - after : rect.left + numeric(style.borderLeftWidth) * scale + before : rect.top + numeric(style.borderTopWidth) * scale + before) + (reverse ? -offset : offset) - (horizontal ? target.scrollLeft : target.scrollTop) * scale,
      crossStart: horizontal ? rect.top : rect.left, crossSize: horizontal ? rect.height : rect.width,
    }
  }

  private canResize(tracks: string[], index: number, axis: LayoutAxis) {
    return Boolean(layoutFraction(tracks[index]) && layoutFraction(tracks[index + 1] ?? ""))
      || /^\d+(?:\.\d+)?px$/.test(tracks[index])
      || axis === "row" && (tracks[index] === "auto" || /^minmax\(\s*[\d.]+px,\s*auto\)$/.test(tracks[index]))
  }

  private button(label: string, text: string, axis?: LayoutAxis, index?: number, operation?: string) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = text
    button.setAttribute("aria-label", label)
    button.title = label
    if(axis) button.dataset.axis = axis
    if(index !== undefined) button.dataset.index = String(index)
    if(operation) button.dataset.operation = operation
    return button
  }

  private update() {
    if(!this.isEnabled) return
    if(this.gesture && !this.validGesture()) this.finish(true)
    const context = this.context()
    const target = context && !context.item ? context.target : null
    if(this.marked !== target) {
      if(this.marked) removeEditorMarker(this.marked, "◆layout-selected")
      this.marked = target
      this.selectedTrack = null
      this.resizeObserver?.disconnect()
      if(target) {
        // Changes above the wrapper can move it without changing its own size.
        for(let ancestor: Element | null = target; ancestor; ancestor = ancestor.parentElement) this.resizeObserver?.observe(ancestor)
      }
      target?.classList.add("◆layout-selected")
      this.signature = ""
    }
    const state = this.getState()
    const stateSignature = JSON.stringify(state)
    if(this.stateSignature !== stateSignature) {
      this.stateSignature = stateSignature
      this.editor.postSelectionPath()
    }
    if(!target || this.editor.isEditingLocked) {
      if(this.overlay) this.overlay.hidden = true
      return
    }
    if(this.gesture) this.schedule()
    const rect = target.getBoundingClientRect()
    const geometries = context!.kind === "grid" ? axes.map(axis => this.geometry(target, axis)) : []
    const signature = JSON.stringify([state, this.selectedTrack, rect.x, rect.y, rect.width, rect.height, geometries])
    if(this.gesture) {
      this.positionSeparators(geometries, rect)
      return
    }
    if(signature === this.signature) return
    this.signature = signature
    const overlay = this.overlay ?? this.createOverlay()
    overlay.hidden = false
    const focused = overlay.getRootNode() instanceof ShadowRoot ? (overlay.getRootNode() as ShadowRoot).activeElement as HTMLElement | null : null
    const focusKey = focused && overlay.contains(focused) ? [focused.dataset.axis, focused.dataset.index, focused.dataset.operation].join(":") : null
    overlay.replaceChildren()
    const outline = document.createElement("div")
    outline.className = "◆layout-outline"
    Object.assign(outline.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
    overlay.append(outline)
    const title = this.button(`${context!.kind === "grid" ? "Grid" : "Flex"} layout`, context!.kind === "grid" ? "Grid" : "Flex", undefined, undefined, "select")
    Object.assign(title.style, {left: `${Math.max(0, rect.left)}px`, top: `${Math.max(0, rect.top - 48)}px`})
    overlay.append(title)
    if(context!.kind !== "grid") return
    axes.forEach((axis, axisIndex) => {
      const geometry = geometries[axisIndex]
      const trackState = axis === "column" ? state!.columns : state!.rows
      if(!geometry || !trackState.tracks) return
      const {tracks, reason} = trackState
      let position = geometry.start
      tracks.forEach((track, index) => {
        const size = geometry.sizes[index] ?? 0
        const direction = geometry.reverse ? -1 : 1
        const center = position + direction * size / 2
        const end = position + direction * size
        const labels = document.createElement("div")
        labels.className = "◆layout-label"
        Object.assign(labels.style, axis === "column" ? {left: `${Math.max(0, center - 42)}px`, top: `${Math.max(0, rect.top - 24)}px`} : {left: `${Math.max(0, rect.left - 98)}px`, top: `${Math.max(0, center - 10)}px`})
        const name = this.button(`${axis} ${index + 1}: ${track}`, `${axis === "column" ? "C" : "R"}${index + 1}`, axis, index, "select")
        const before = this.button(`Add ${axis} before ${index + 1}`, "+", axis, index, "insert")
        const after = this.button(`Add ${axis} after ${index + 1}`, "+", axis, index + 1, "insert")
        const remove = this.button(`Remove ${axis} ${index + 1} and keep content`, "−", axis, index, "remove")
        before.disabled = after.disabled = Boolean(reason) || tracks.length >= 100
        remove.disabled = Boolean(reason) || tracks.length <= 1
        const selected = this.selectedTrack?.axis === axis && this.selectedTrack.index === index
        name.setAttribute("aria-pressed", String(selected))
        if(selected) {
          const strip = document.createElement("div")
          Object.assign(strip.style, {position: "absolute", background: "#176db81a", ...(axis === "column" ? {left: `${Math.min(position, end)}px`, top: `${rect.top}px`, width: `${size}px`, height: `${rect.height}px`} : {top: `${position}px`, left: `${rect.left}px`, height: `${size}px`, width: `${rect.width}px`})})
          overlay.append(strip)
        }
        labels.append(before, name, after, remove)
        overlay.append(labels)
        if(this.canResize(tracks, index, axis)) {
          const handle = this.button(`Resize ${axis} ${index + 1}`, "", axis, index, "resize")
          handle.className = "◆layout-separator"
          Object.assign(handle.style, axis === "column" ? {left: `${end + direction * geometry.gap / 2 - 6}px`, top: `${rect.top}px`, height: `${rect.height}px`} : {top: `${end + geometry.gap / 2 - 6}px`, left: `${rect.left}px`, width: `${rect.width}px`})
          overlay.append(handle)
        }
        position = end + direction * geometry.gap
      })
    })
    for(const cell of this.emptyCells(target)) {
      const button = this.button(`Add content in row ${cell.row + 1}, column ${cell.column + 1}`, "+ content", undefined, undefined, "region")
      button.dataset.row = String(cell.row)
      button.dataset.column = String(cell.column)
      Object.assign(button.style, {left: `${Math.max(0, cell.x - 30)}px`, top: `${Math.max(0, cell.y - 10)}px`})
      overlay.append(button)
    }
    if(focusKey) Array.from(overlay.querySelectorAll<HTMLButtonElement>("button")).find(button => [button.dataset.axis, button.dataset.index, button.dataset.operation].join(":") === focusKey)?.focus({preventScroll: true})
  }

  private positionSeparators(geometries: Array<Geometry | null>, rect: DOMRect) {
    for(const handle of this.overlay?.querySelectorAll<HTMLElement>(".◆layout-separator") ?? []) {
      const axis = handle.dataset.axis as LayoutAxis
      const geometry = geometries[axes.indexOf(axis)]
      if(!geometry) continue
      const index = Number(handle.dataset.index)
      const end = geometry.start + (geometry.reverse ? -1 : 1) * (geometry.sizes.slice(0, index + 1).reduce((sum, size) => sum + size, 0) + geometry.gap * index)
      Object.assign(handle.style, axis === "column" ? {left: `${end + (geometry.reverse ? -1 : 1) * geometry.gap / 2 - 6}px`, top: `${rect.top}px`, height: `${rect.height}px`} : {top: `${end + geometry.gap / 2 - 6}px`, left: `${rect.left}px`, width: `${rect.width}px`})
    }
  }

  private emptyCells(target: HTMLElement) {
    const columns = this.trackState(target, "column"), rows = this.trackState(target, "row")
    const x = this.geometry(target, "column"), y = this.geometry(target, "row")
    if(!columns.tracks || !rows.tracks || columns.reason || rows.reason || !x || !y || columns.tracks.length * rows.tracks.length > 100) return []
    const occupied = Array.from(target.children).filter(child => {
      const css = getComputedStyle(child)
      return css.display !== "none" && css.position !== "absolute" && css.position !== "fixed"
    }).map(child => child.getBoundingClientRect())
    const result: Array<{row: number, column: number, x: number, y: number}> = []
    let top = y.start
    rows.tracks.forEach((_, row) => {
      let start = x.start
      columns.tracks!.forEach((_, column) => {
        const end = start + (x.reverse ? -1 : 1) * x.sizes[column]
        const left = Math.min(start, end), right = Math.max(start, end), bottom = top + y.sizes[row]
        // Ask the rendered DOM where items are; do not implement grid placement.
        if(!occupied.some(rect => rect.right > left + .5 && rect.left < right - .5 && rect.bottom > top + .5 && rect.top < bottom - .5)) result.push({row, column, x: (left + right) / 2, y: (top + bottom) / 2})
        start = end + (x.reverse ? -1 : 1) * x.gap
      })
      top += y.sizes[row] + y.gap
    })
    return result
  }

  private insertRegion(row: number, column: number) {
    if(this.editor.isEditingLocked || !Number.isSafeInteger(row) || !Number.isSafeInteger(column)) return false
    const context = this.context()
    if(!context || context.item || context.kind !== "grid" || !this.emptyCells(context.target).some(cell => cell.row === row && cell.column === column)) return false
    const end = this.editor.doc.beginUndoGroup()
    try {
      const paragraph = document.createElement("p")
      paragraph.style.cssText = `grid-row: ${row + 1} / ${row + 2}; grid-column: ${column + 1} / ${column + 2}; min-inline-size: 0;`
      context.target.append(paragraph)
      this.editor.features.selection.clearSelectedSection()
      $.move(paragraph, 0)
      this.editor.features.selection.processSelection()
      return true
    }
    finally { end(); this.refresh() }
  }

  private placementSignature(target: HTMLElement) {
    return Array.from(target.children).map(child => this.itemPlacementSignature(child)).join("|")
  }

  private itemPlacementSignature(child: Element) {
    const style = getComputedStyle(child)
    return [style.display, style.position, style.gridArea, style.gridRow, style.gridColumn].join(";")
  }

  private begin(handle: HTMLElement, event: PointerEvent) {
    if(this.gesture) this.finish(true)
    const context = this.context()
    const axis = handle.dataset.axis as LayoutAxis
    const index = Number(handle.dataset.index)
    if(!context || context.item || context.kind !== "grid" || this.editor.isEditingLocked) return
    const tracks = this.trackState(context.target, axis).tracks
    const geometry = this.geometry(context.target, axis)
    if(!tracks || !geometry || !this.canResize(tracks, index, axis)) return
    const target = context.target
    const initial = target.style.getPropertyValue(propertyFor(axis))
    this.gesture = {target, parent: target.parentElement, children: Array.from(target.children), placements: this.placementSignature(target), axis, index, pointerId: event.pointerId, handle, origin: axis === "column" ? event.clientX : event.clientY, size: geometry.sizes[index] / geometry.scale, geometry, tracks, initial, written: initial, priority: target.style.getPropertyPriority(propertyFor(axis)), endUndo: this.editor.doc.beginUndoGroup()}
    try { if(event.pointerId >= 0) handle.setPointerCapture?.(event.pointerId) }
    catch { this.finish(true) }
    this.schedule()
  }

  private validGesture() {
    const gesture = this.gesture
    if(!gesture) return false
    return !this.editor.isEditingLocked && this.context()?.kind === "grid" && !this.context()?.item && gesture.target === this.context()?.target
      && Boolean(this.geometry(gesture.target, gesture.axis))
      && gesture.target.parentElement === gesture.parent && gesture.target.isConnected
      && Array.from(gesture.target.children).length === gesture.children.length
      && gesture.children.every((child, i) => gesture.target.children[i] === child)
      && this.placementSignature(gesture.target) === gesture.placements
      && gesture.target.style.getPropertyValue(propertyFor(gesture.axis)) === gesture.written
      && gesture.target.style.getPropertyPriority(propertyFor(gesture.axis)) === gesture.priority
  }

  private resizeBy(delta: number) {
    const gesture = this.gesture
    if(!gesture || !this.validGesture()) { this.finish(true); return }
    const {tracks, axis, index, geometry} = gesture
    const next = [...tracks]
    const left = layoutFraction(tracks[index]), right = layoutFraction(tracks[index + 1] ?? "")
    if(left && right) {
      const sum = left.value + right.value
      if(sum < 1) return
      const width = (geometry.sizes[index] + geometry.sizes[index + 1]) / geometry.scale
      const fraction = Math.max(.01, Math.min(sum - .01, left.value + delta / width * sum))
      next[index] = left.format(fraction)
      next[index + 1] = right.format(sum - fraction)
    }
    else {
      const size = Math.max(0, Math.round(gesture.size + delta))
      next[index] = tracks[index] === "auto" || tracks[index].startsWith("minmax(") ? `minmax(${size}px, auto)` : `${size}px`
    }
    gesture.target.style.setProperty(propertyFor(axis), next.join(" "), gesture.priority)
    gesture.written = gesture.target.style.getPropertyValue(propertyFor(axis))
  }

  private finish(cancel: boolean) {
    const gesture = this.gesture
    if(!gesture) return
    this.gesture = null
    if(cancel && gesture.target.style.getPropertyValue(propertyFor(gesture.axis)) === gesture.written
      && gesture.target.style.getPropertyPriority(propertyFor(gesture.axis)) === gesture.priority) {
      gesture.target.style.setProperty(propertyFor(gesture.axis), gesture.initial, gesture.priority)
    }
    if(gesture.pointerId >= 0 && gesture.handle.hasPointerCapture?.(gesture.pointerId)) gesture.handle.releasePointerCapture(gesture.pointerId)
    gesture.endUndo()
    this.signature = ""
    this.schedule()
  }

  captureListeners: DocumentListenerMap = {scroll: this.schedule}

  activeListeners: DocumentListenerMap = {
    pointerdown: event => {
      const handle = event.composedPath()[0]
      if(!(handle instanceof HTMLElement) || !this.overlay?.contains(handle)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if(handle.dataset.operation === "resize") this.begin(handle, event)
    },
    pointermove: event => {
      const gesture = this.gesture
      if(!gesture || gesture.pointerId !== event.pointerId) return
      event.preventDefault()
      this.resizeBy(((gesture.axis === "column" ? event.clientX : event.clientY) - gesture.origin) / gesture.geometry.scale * (gesture.geometry.reverse ? -1 : 1))
    },
    pointerup: event => { if(this.gesture?.pointerId === event.pointerId) this.finish(!this.validGesture()) },
    pointercancel: event => { if(this.gesture?.pointerId === event.pointerId) this.finish(true) },
    lostpointercapture: event => { if(this.gesture?.pointerId === event.pointerId) this.finish(true) },
    click: event => {
      const button = event.composedPath()[0]
      if(!(button instanceof HTMLButtonElement) || !this.overlay?.contains(button) || button.disabled) return
      event.preventDefault()
      const {axis, index, operation} = button.dataset
      if(operation === "insert" || operation === "remove") this.editTrack(axis as LayoutAxis, Number(index), operation)
      if(operation === "region") this.insertRegion(Number(button.dataset.row), Number(button.dataset.column))
      if(operation === "select" && this.marked) {
        this.editor.features.selection.selectSectionElement(this.marked)
        if(axis) this.selectedTrack = {axis: axis as LayoutAxis, index: Number(index)}
        this.refresh()
      }
    },
    keydown: event => {
      if(event.key === "Escape" && this.gesture) { event.preventDefault(); this.finish(true); return }
      const handle = event.composedPath()[0]
      if(!(handle instanceof HTMLElement) || !this.overlay?.contains(handle) || handle.dataset.operation !== "resize") return
      if(!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
      event.preventDefault()
      this.begin(handle, {pointerId: -1, clientX: 0, clientY: 0} as PointerEvent)
      this.resizeBy((["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) * (event.shiftKey ? 10 : 1) * (this.gesture?.geometry.reverse ? -1 : 1))
      this.finish(false)
    },
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.resizeObserver = new ResizeObserver(this.schedule)
    window.addEventListener("resize", this.schedule)
    this.observer = new MutationObserver(this.schedule)
    this.observer.observe(document.documentElement, {subtree: true, attributes: true, childList: true, characterData: true})
    this.schedule()
  }

  disable() {
    this.finish(true)
    super.disable()
    this.observer?.disconnect()
    this.observer = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    window.removeEventListener("resize", this.schedule)
    if(this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    if(this.marked) removeEditorMarker(this.marked, "◆layout-selected")
    this.marked = null
    this.overlay?.remove()
    this.overlay = null
    if(this.stylesheet) this.editor.appendix.adoptedStyleSheets = this.editor.appendix.adoptedStyleSheets.filter(sheet => sheet !== this.stylesheet)
    this.stylesheet = null
    this.selectedTrack = null
    this.signature = ""
    this.stateSignature = "null"
  }
}
