import {DocumentListenerMap, EditorFeature} from "."
import type {ListSelectionState, ListType} from "../editor-bridge"
import {$, getContainer, isElement, modifierKeyDown, setPart} from "../utility"

const listSelector = "ul, ol, dl, menu"
const listItemSelector = "li, dt, dd"

const isListType = (value: string): value is ListType =>
  value === "ul" || value === "ol" || value === "dl" || value === "menu"

type VirtualListPoint = {
  list: HTMLElement
  offset: number
}

/** Semantic list editing. Only a list with no authored items uses a virtual
 * first item in BODY's shadow root. Once materialized, every editing position
 * is represented by a real LI/DT/DD. */
export class ListFeature extends EditorFeature {
  private readonly markerClass = "◆virtual-list-anchor"
  private readonly selectedListClass = "◆virtual-list-selected"

  enable() {
    super.enable()
    window.addEventListener("resize", this.syncVirtualMarker)
    window.addEventListener("scroll", this.syncVirtualMarker, true)
    window.addEventListener("blur", this.handleWindowBlur)
    this.syncVirtualMarker()
  }

  disable() {
    window.removeEventListener("resize", this.syncVirtualMarker)
    window.removeEventListener("scroll", this.syncVirtualMarker, true)
    window.removeEventListener("blur", this.handleWindowBlur)
    this.clearVirtualMarker()
    super.disable()
  }

  actions = {
    toggleList: ({listType}: {type: "toggleList", listType: ListType}) => {
      this.toggleList(listType)
    },
    setListStyle: ({listType, style}: {type: "setListStyle", listType: ListType, style: string}) => {
      this.setListStyle(listType, style)
    },
    insertDetails: ({}: {type: "insertDetails"}) => {
      this.insertDetails()
    },
  } as const

  activeListeners: DocumentListenerMap = {
    selectionchange: () => queueMicrotask(() => {
      this.openSelectedDetails()
      this.syncVirtualMarker()
    }),
    click: event => this.handleDetailsClick(event),
    beforeinput: event => this.handleBeforeInput(event),
    compositionstart: () => {
      if(this.virtualPoint) this.materializeVirtualItem()
    },
    paste: () => {
      if(this.virtualPoint) this.materializeVirtualItem()
    },
    input: event => {
      const point = this.virtualPoint
      if(point) {
        const data = event instanceof InputEvent ? event.data : null
        const item = this.materializeVirtualItem(point)
        if(data && item) {
          const text = document.createTextNode(data)
          item.append(text)
          $.move(text, text.length)
        }
      }
      else if(event instanceof InputEvent && event.inputType.startsWith("delete")) {
        this.activeItem()?.normalize()
      }
      queueMicrotask(this.syncVirtualMarker)
    },
    keydown: event => this.handleKeydown(event),
  }

  /** State mirrored to the host ribbon with each selection update. */
  getState(): ListSelectionState {
    const list = this.activeList
    return {
      type: list && isListType(list.localName) ? list.localName : null,
      style: list?.style.listStyleType ?? "",
    }
  }

  private get activeList() {
    const selected = $.selectedElement
    const anchor = $.anchor
    const element = selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(element)) return null
    return (element.matches(listSelector) ? element : element.closest(listSelector)) as HTMLElement | null
  }

  /** Whether SelectionFeature should defer painting the current list point to
   * this feature rather than treating it as an ordinary gap. */
  get isVirtualSelection() {
    return Boolean(this.virtualPoint)
  }

  /** Clears virtual-list selection presentation synchronously so it cannot
   * coexist with another newly applied selection kind. The list feature's
   * existing deferred refresh repaints it when the canonical kind is virtual. */
  clearSelectionPresentation() {
    this.clearVirtualMarker()
  }

  /** Only an empty authored list exposes a prospective first item. Every
   * point in a nonempty list is either a real item selection or a normal gap. */
  private get virtualPoint(): VirtualListPoint | null {
    const selection = document.getSelection()
    const anchor = selection?.anchorNode
    if(!selection?.isCollapsed || !isElement(anchor) || !anchor.matches(listSelector)) return null
    const point = {
      list: anchor as HTMLElement,
      offset: Math.max(0, Math.min(selection.anchorOffset, anchor.childNodes.length)),
    }
    return !this.directItems(anchor).length ? point : null
  }

  private moveToVirtual(list: HTMLElement, offset: number) {
    $.move(list, Math.max(0, Math.min(offset, list.childNodes.length)))
  }

  private readonly handleWindowBlur = () => {
    this.clearVirtualMarker()
  }

  private get marker() {
    let marker = this.editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")
    if(marker && marker.localName !== "li") {
      marker.remove()
      marker = null
    }
    if(!marker) {
      marker = document.createElement("li")
      marker.classList.add("◆", "◆editor-only", "◆virtual-list-item")
      marker.setAttribute("part", "virtual-list-item virtual-list-item-hidden")
      marker.setAttribute("aria-hidden", "true")
      marker.contentEditable = "false"
      const placeholder = document.createElement("span")
      placeholder.classList.add("◆virtual-list-placeholder")
      placeholder.setAttribute("part", "virtual-list-placeholder virtual-list-placeholder-hidden")
      const secondary = document.createElement("span")
      secondary.classList.add("◆virtual-list-placeholder-secondary")
      secondary.setAttribute("part", "virtual-list-placeholder virtual-list-placeholder-secondary virtual-list-placeholder-hidden")
      const caret = document.createElement("span")
      caret.classList.add("◆virtual-list-caret")
      caret.setAttribute("part", "virtual-list-caret")
      marker.append(placeholder, secondary, caret)
      this.editor.addAppendix(marker)
    }
    return marker
  }

  private clearVirtualMarker() {
    document.querySelectorAll(`.${this.markerClass}, .${this.selectedListClass}`).forEach(element => {
      element.classList.remove(this.markerClass, this.selectedListClass)
      if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
        element.classList.remove("◆")
      }
      if(!element.classList.length) element.removeAttribute("class")
    })
    const marker = this.editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")
    if(marker) {
      setPart(marker, "virtual-list-item-hidden")
      ;(["ul", "ol", "dl", "menu"] as const).forEach(type => setPart(marker, `virtual-list-item-${type}`, false))
      setPart(marker, "virtual-list-item-custom-marker", false)
      setPart(marker.querySelector(".◆virtual-list-caret")!, "virtual-list-caret-hidden")
      marker.style.listStyleType = "none"
      marker.style.listStyleImage = "none"
      ;[
        "font-family",
        "font-size",
        "font-stretch",
        "font-style",
        "font-variant",
        "font-weight",
        "letter-spacing",
        "--virtual-list-marker-content",
        "--virtual-list-marker-font-family",
        "--virtual-list-marker-font-size",
        "--virtual-list-marker-font-style",
        "--virtual-list-marker-font-weight",
      ].forEach(property => marker.style.removeProperty(property))
      marker.removeAttribute("value")
    }
  }

  /** Makes the shadow-DOM preview use the same computed marker as the real
   * item beside it. This includes author CSS on LI/::marker, not just the
   * inline list-style-type authored by the ribbon. */
  private syncVirtualMarkerAppearance(
    marker: HTMLElement,
    point: VirtualListPoint,
    previous: HTMLElement | undefined,
  ) {
    const {list, offset} = point
    if(!list.matches("ul, ol, menu")) return
    const next = Array.from(list.childNodes).slice(offset)
      .find((node): node is HTMLElement => isElement(node) && node.matches("li"))
    const source = previous ?? next ?? list
    const sourceStyle = getComputedStyle(source)
    const listStyle = source === list ? sourceStyle : getComputedStyle(list)
    marker.style.listStyleType = sourceStyle.listStyleType
      || listStyle.listStyleType
      || (list.matches("ol") ? "decimal" : "disc")
    marker.style.listStyleImage = sourceStyle.listStyleImage || listStyle.listStyleImage || "none"

    ;[
      "font-family",
      "font-size",
      "font-stretch",
      "font-style",
      "font-variant",
      "font-weight",
      "letter-spacing",
    ].forEach(property => {
      const value = sourceStyle.getPropertyValue(property)
      if(value) marker.style.setProperty(property, value)
    })

    // Native markers are completely described by list-style-* above. When
    // ::marker supplies content, copy that token stream so strings, symbols,
    // and counter(list-item) expressions render identically as well.
    const markerStyle = getComputedStyle(source, "::marker")
    const content = markerStyle.content
    const hasCustomContent = Boolean(content && content !== "normal")
    setPart(marker, "virtual-list-item-custom-marker", hasCustomContent)
    if(hasCustomContent) {
      marker.style.setProperty("--virtual-list-marker-content", content)
      ;(["font-family", "font-size", "font-style", "font-weight"] as const).forEach(property => {
        const value = markerStyle.getPropertyValue(property)
        if(value) marker.style.setProperty(`--virtual-list-marker-${property}`, value)
      })
    }

    if(list.matches("ol")) {
      marker.setAttribute("value", String(this.orderedValueAt(list as HTMLOListElement)))
    }
  }

  /** An empty OL's prospective first item uses its explicit start or one.
   * (For reversed lists the prospective item makes the effective count one.) */
  private orderedValueAt(list: HTMLOListElement) {
    return list.hasAttribute("start") ? list.start : 1
  }

  /** Value currently rendered for an authored LI, including reversed lists
   * and value overrides. Used to preserve numbering when a list is split. */
  private orderedValueOf(list: HTMLOListElement, target: HTMLLIElement) {
    const items = this.directItems(list).filter(item => item.matches("li")) as HTMLLIElement[]
    const step = list.reversed ? -1 : 1
    let value = list.hasAttribute("start") ? list.start : list.reversed ? items.length : 1
    for(const item of items) {
      if(item.hasAttribute("value")) value = item.value
      if(item === target) return value
      value += step
    }
    return value
  }

  /** Removes identity/editor-only state from a cloned list continuation and
   * preserves the rendered value of its first ordered item. Called by generic
   * parent splitting as well as list-specific exit behavior. */
  prepareSplitContinuation(source: Element, continuation: Element, movedContent: Node[]) {
    if(!source.matches(listSelector) || !continuation.matches(listSelector)) return
    continuation.removeAttribute("id")
    Array.from(continuation.classList)
      .filter(name => name === "◆" || name.startsWith("◆"))
      .forEach(name => continuation.classList.remove(name))
    if(!continuation.classList.length) continuation.removeAttribute("class")
    const firstMovedItem = movedContent.find((node): node is HTMLLIElement =>
      isElement(node) && node.matches("li"))
    if(source.matches("ol") && firstMovedItem) {
      continuation.setAttribute("start", String(this.orderedValueOf(source as HTMLOListElement, firstMovedItem)))
    }
  }

  private readonly syncVirtualMarker = () => {
    this.clearVirtualMarker()
    const point = this.virtualPoint
    if(!point) {
      return
    }

    const {list, offset} = point
    const previous = this.itemsBefore(point).at(-1)
    const anchor = previous ?? list
    anchor.classList.add("◆", this.markerClass)
    list.classList.add("◆", this.selectedListClass)

    const marker = this.marker
    const nextType = this.itemTypeAt(point)
    const placeholder = marker.querySelector<HTMLElement>(".◆virtual-list-placeholder")!
    const secondary = marker.querySelector<HTMLElement>(".◆virtual-list-placeholder-secondary")!
    placeholder.textContent = list.matches("dl")
      ? nextType === "dd" ? "Description" : "Term"
      : ""
    secondary.textContent = list.matches("dl") && nextType === "dt" ? "Description" : ""
    setPart(placeholder, "virtual-list-placeholder-hidden", !list.matches("dl"))
    setPart(secondary, "virtual-list-placeholder-hidden", !secondary.textContent)
    marker.dataset.kind = list.localName
    marker.dataset.empty = String(!previous)
    ;(["ul", "ol", "dl", "menu"] as const).forEach(type => setPart(marker, `virtual-list-item-${type}`, list.localName === type))
    setPart(marker, "virtual-list-item-hidden", false)
    setPart(marker.querySelector(".◆virtual-list-caret")!, "virtual-list-caret-hidden", false)
    marker.style.listStyleType = "none"
    marker.style.listStyleImage = "none"
    this.syncVirtualMarkerAppearance(marker, point, previous)

    const anchorRect = anchor.getBoundingClientRect()
    const listRect = list.getBoundingClientRect()
    const lineHeight = Number.parseFloat(getComputedStyle(anchor).lineHeight) || 20
    const listStyle = getComputedStyle(list)
    const listPadding = Number.parseFloat(listStyle.paddingInlineStart || listStyle.paddingLeft) || 40
    const laidOutPrevious = previous && (anchorRect.width || anchorRect.height)
    const contentLeft = list.matches("dl")
      ? listRect.left + (nextType === "dd" ? 40 : 0)
      : laidOutPrevious ? anchorRect.left : listRect.left + listPadding
    marker.style.left = `${Math.max(0, contentLeft)}px`
    marker.style.top = `${Math.max(0, previous ? anchorRect.bottom : listRect.top)}px`
    marker.style.minHeight = `${lineHeight}px`
    marker.style.setProperty("--virtual-list-line-height", `${lineHeight}px`)
  }

  private directItems(list: Element) {
    return Array.from(list.children).filter(element => element.matches(listItemSelector)) as HTMLElement[]
  }

  private itemsBefore({list, offset}: VirtualListPoint) {
    return Array.from(list.childNodes)
      .slice(0, offset)
      .filter((node): node is HTMLElement => isElement(node) && node.matches(listItemSelector))
  }

  private itemTypeAt({list, offset}: VirtualListPoint): "li" | "dt" | "dd" {
    if(!list.matches("dl")) return "li"
    const previous = this.itemsBefore({list, offset}).reverse()
      .find(element => element.matches("dt, dd"))
    return previous?.matches("dt") ? "dd" : "dt"
  }

  private materializeVirtualItem(point = this.virtualPoint) {
    if(!point?.list.isConnected) return null
    const item = document.createElement(this.itemTypeAt(point))
    const reference = point.list.childNodes.item(point.offset)
    point.list.insertBefore(item, reference)
    if(point.list.matches("dl") && item.matches("dt")) {
      const description = document.createElement("dd")
      item.after(description)
    }
    $.move(item)
    this.syncVirtualMarker()
    return item
  }

  private handleBeforeInput(event: InputEvent) {
    const point = this.virtualPoint
    if(!point) return

    if(event.inputType === "insertParagraph") {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.advanceVirtualItem(point, true)
      return
    }
    if(event.inputType === "insertText" || event.inputType === "insertReplacementText") {
      const item = this.materializeVirtualItem(point)
      if(!item) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if(event.data) {
        const text = document.createTextNode(event.data)
        item.append(text)
        $.move(text, text.length)
      }
      return
    }
    if(event.inputType.startsWith("insert")) this.materializeVirtualItem(point)
  }

  private handleKeydown(event: KeyboardEvent) {
    if(event.defaultPrevented || this.editor.features.transformation.target) return
    const point = this.virtualPoint

    if(event.key === "Enter" && !event.altKey && !event.shiftKey && !modifierKeyDown(event)) {
      if(this.liftTrailingDetailsBlock()) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if(point) {
        event.preventDefault()
        event.stopImmediatePropagation()
        this.advanceVirtualItem(point, true)
        return
      }
      const item = this.activeItem()
      if(item) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const selectionWasCollapsed = Boolean(document.getSelection()?.isCollapsed)
        const itemWasEmpty = selectionWasCollapsed && this.isEmptyTextBlock(item)
        if(!selectionWasCollapsed) $.delete()
        itemWasEmpty ? this.liftOrExitEmptyItem(item) : this.insertEmptyItemAfter(item)
      }
      return
    }

    // Alt/primary-modifier Enter inserts a real break/split through ManipulationFeature,
    // so first give that command a schema-valid list item to operate on.
    if(point && event.key === "Enter") {
      this.materializeVirtualItem(point)
      return
    }

    if(event.key === "Tab" && (point || this.activeItem())) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if(point) {
        if(event.shiftKey) this.outdentVirtualItem(point)
      }
      else {
        const item = this.activeItem()!
        event.shiftKey ? this.outdentItem(item) : this.nestItem(item)
      }
      this.syncVirtualMarker()
      return
    }

    if(point && event.key === "Backspace") {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.moveBackwardFromVirtual(point)
      return
    }
    if(point && event.key === "Delete") {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.moveForwardFromVirtual(point)
      return
    }

    const isAltGraph = event.getModifierState("AltGraph")
    const isPrintable = event.key.length === 1 && !event.metaKey && (!event.ctrlKey || isAltGraph)
    if(point && isPrintable) this.materializeVirtualItem(point)
  }

  private activeItem() {
    const selected = $.selectedElement
    const anchor = $.anchor
    const element = selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(element)) return null
    const item = element.matches(listItemSelector) ? element : element.closest(listItemSelector)
    return item?.parentElement?.matches(listSelector) ? item as HTMLElement : null
  }

  /** Enter on the virtual first item exits an empty top-level list. For an
   * empty nested list, it creates a real empty item one level higher. */
  private advanceVirtualItem(point: VirtualListPoint, createParagraph = false) {
    const {list} = point
    const owner = list.parentElement?.closest(listItemSelector) as HTMLElement | null
    const outer = owner?.parentElement?.matches(listSelector) ? owner.parentElement as HTMLElement : null
    if(outer && owner) {
      const item = document.createElement(this.itemTypeAfter(owner))
      owner.after(item)
      if(!this.directItems(list).length) list.remove()
      $.move(item)
    }
    else {
      const parent = list.parentElement
      if(!parent) return
      const offset = Array.from(parent.childNodes).indexOf(list)
      if(!this.directItems(list).length) {
        if(createParagraph) {
          const paragraph = document.createElement("p")
          list.replaceWith(paragraph)
          $.move(paragraph)
        }
        else {
          list.remove()
          $.move(parent, offset)
        }
      }
      else {
        if(createParagraph) {
          const paragraph = document.createElement("p")
          list.after(paragraph)
          $.move(paragraph)
        }
        else {
          $.move(parent, offset + 1)
        }
      }
    }
    this.syncVirtualMarker()
  }

  private outdentVirtualItem(point: VirtualListPoint) {
    const owner = point.list.parentElement?.closest(listItemSelector) as HTMLElement | null
    const outer = owner?.parentElement?.matches(listSelector) ? owner.parentElement as HTMLElement : null
    if(!owner || !outer) return
    const item = document.createElement(this.itemTypeAfter(owner))
    owner.after(item)
    if(!this.directItems(point.list).length) point.list.remove()
    $.move(item)
  }

  private itemTypeAfter(item: HTMLElement): "li" | "dt" | "dd" {
    return item.parentElement?.matches("dl")
      ? item.matches("dt") ? "dd" : "dt"
      : "li"
  }

  /** Inserts the real empty editing item following a nonempty item. DL keeps
   * a real DT/DD pair so both empty placeholders can remain CSS-only. */
  private insertEmptyItemAfter(item: HTMLElement) {
    const list = item.parentElement!
    if(list.matches("dl") && item.matches("dt")) {
      const description = item.nextElementSibling
      if(description?.matches("dd")) {
        $.move(description)
      }
      else {
        const next = document.createElement("dd")
        item.after(next)
        $.move(next)
      }
    }
    else if(list.matches("dl")) {
      const term = document.createElement("dt")
      const description = document.createElement("dd")
      item.after(term, description)
      $.move(term)
    }
    else {
      const next = document.createElement("li")
      item.after(next)
      $.move(next)
    }
    this.syncVirtualMarker()
  }

  /** A real empty item follows the old virtual item's promotion rules:
   * outdent one level when nested, otherwise remove it and exit at its list
   * position. */
  private liftOrExitEmptyItem(item: HTMLElement) {
    const list = item.parentElement as HTMLElement
    const owner = list.parentElement?.closest(listItemSelector) as HTMLElement | null
    const outer = owner?.parentElement?.matches(listSelector) ? owner.parentElement as HTMLElement : null
    if(owner && outer) {
      this.outdentItem(item)
    }
    else {
      this.exitTopLevelListAt(item)
    }
    this.syncVirtualMarker()
  }

  private exitTopLevelListAt(item: HTMLElement) {
    const list = item.parentElement as HTMLElement
    const parent = list.parentElement
    if(!parent) return
    const removals = [item]
    const pairedDescription = list.matches("dl") && item.matches("dt")
      && item.nextElementSibling?.matches("dd")
      && this.isEmptyTextBlock(item.nextElementSibling)
      ? item.nextElementSibling as HTMLElement
      : null
    if(pairedDescription) removals.push(pairedDescription)
    const lastRemoval = removals.at(-1)!
    const following = Array.from(list.childNodes).slice(Array.from(list.childNodes).indexOf(lastRemoval) + 1)
    const firstTrailingItem = following.find((node): node is HTMLElement =>
      isElement(node) && node.matches(listItemSelector))
    const paragraph = document.createElement("p")

    if(firstTrailingItem) {
      const trailingList = list.cloneNode(false) as HTMLElement
      this.prepareSplitContinuation(list, trailingList, following)
      following.forEach(node => trailingList.append(node))
      list.after(paragraph, trailingList)
      removals.forEach(node => node.remove())
      if(!this.directItems(list).length) list.remove()
    }
    else {
      removals.forEach(node => node.remove())
      if(!this.directItems(list).length) {
        list.replaceWith(paragraph)
      }
      else {
        list.after(paragraph)
      }
    }
    $.move(paragraph)
  }

  private nestedList(owner: HTMLElement, type: ListType) {
    const existing = Array.from(owner.children).reverse()
      .find(element => element.localName === type) as HTMLElement | undefined
    if(existing) return existing
    const nested = document.createElement(type)
    owner.append(nested)
    return nested
  }

  private nestItem(item: HTMLElement) {
    const list = item.parentElement as HTMLElement
    const items = this.directItems(list)
    const index = items.indexOf(item)
    if(index <= 0) return
    const restoreSelection = this.captureItemSelection(item)
    const nested = this.nestedList(items[index - 1], list.localName as ListType)
    nested.append(item)
    restoreSelection()
  }

  private outdentItem(item: HTMLElement) {
    const list = item.parentElement as HTMLElement
    const owner = list.parentElement?.closest(listItemSelector) as HTMLElement | null
    const outer = owner?.parentElement?.matches(listSelector) ? owner.parentElement as HTMLElement : null
    if(!owner || !outer) return
    const restoreSelection = this.captureItemSelection(item)
    owner.after(item)
    if(!this.directItems(list).length) list.remove()
    restoreSelection()
  }

  /** Moving an LI/DT/DD can cause browsers to collapse a selection whose
   * boundary was represented through the old parent. Restore element and
   * text selections explicitly after the move. */
  private captureItemSelection(item: HTMLElement) {
    const selection = document.getSelection()
    const selectedItem = $.selectedElement === item
    const anchor = selection?.anchorNode
    const focus = selection?.focusNode
    const anchorOffset = selection?.anchorOffset ?? 0
    const focusOffset = selection?.focusOffset ?? 0
    return () => {
      if(selectedItem) {
        $.selectElement(item)
      }
      else if(selection && anchor?.isConnected && focus?.isConnected
        && (anchor === item || item.contains(anchor))
        && (focus === item || item.contains(focus))) {
        selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset)
      }
      else {
        $.move(item)
      }
    }
  }

  private moveBackwardFromVirtual(point: VirtualListPoint) {
    const before = this.itemsBefore(point).at(-1)
    if(before) {
      $.move(before, -1)
    }
    else if(!this.directItems(point.list).length) {
      this.advanceVirtualItem(point)
    }
  }

  private moveForwardFromVirtual(point: VirtualListPoint) {
    const after = Array.from(point.list.childNodes)
      .slice(point.offset)
      .find(node => isElement(node) && node.matches(listItemSelector))
    if(after) $.move(after)
  }

  toggleList(type: ListType) {
    const list = this.activeList
    if(list) {
      const point = this.virtualPoint
      if(list.localName === type && point?.list === list) this.advanceVirtualItem(point)
      else if(list.localName === type) this.unwrapSelectedItems(list)
      else this.changeListType(list, type)
      this.syncVirtualMarker()
      return
    }

    const blocks = this.selectedTextBlocks()
    if(blocks.length) {
      if(blocks.length === 1 && this.isEmptyTextBlock(blocks[0])) {
        const list = document.createElement(type)
        blocks[0].replaceWith(list)
        this.moveToVirtual(list, 0)
      }
      else {
        this.wrapTextBlocks(blocks, type)
      }
    }
    else {
      const list = document.createElement(type)
      this.editor.features.manipulation.insert(list)
      this.moveToVirtual(list, 0)
    }
    this.syncVirtualMarker()
  }

  setListStyle(type: ListType, style: string) {
    if(this.activeList?.localName !== type) this.toggleList(type)
    const list = this.activeList
    if(list?.localName === type) list.style.listStyleType = style
  }

  insertDetails() {
    const details = document.createElement("details")
    const summary = document.createElement("summary")
    details.append(summary)
    this.editor.features.manipulation.insert(details)
    $.move(summary)
  }

  /** Opening follows editing intent, not just pointer activation: any
   * selection whose editing target is inside DETAILS opens it. SUMMARY is the
   * exception so its text can be edited while the disclosure remains closed. */
  private openSelectedDetails() {
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    const selected = $.selectedElement
    const target = selected ?? getContainer(selection.anchorNode)
    if(!isElement(target)) return
    const details = (target.matches("details") ? target : target.closest("details")) as HTMLDetailsElement | null
    if(!details) return
    if(target.matches("summary") && target.parentElement === details) return
    const anchorSummary = getContainer(selection.anchorNode).closest("summary")
    const focusSummary = getContainer(selection.focusNode).closest("summary")
    if(anchorSummary && anchorSummary === focusSummary && anchorSummary.parentElement === details) return
    details.open = true
  }

  /** Native SUMMARY activation toggles from anywhere on its text. In an
   * editor that makes placing a caret unexpectedly open/close the element, so
   * retain the native action only in the disclosure-marker hit area. */
  private handleDetailsClick(event: MouseEvent) {
    if(!isElement(event.target)) return
    const summary = event.target.closest("summary") as HTMLElement | null
    if(!summary || summary.parentElement?.localName !== "details") return
    const rect = summary.getBoundingClientRect()
    // The native triangle occupies roughly one em. Keep this deliberately
    // narrower than the summary's text inset so clicking its first character
    // cannot be mistaken for disclosure-marker activation.
    const markerHitWidth = Math.max(16, Number.parseFloat(getComputedStyle(summary).fontSize) * 1.125 || 18)
    const isRtl = getComputedStyle(summary).direction === "rtl"
    const inMarker = isRtl
      ? event.clientX >= rect.right - markerHitWidth
      : event.clientX <= rect.left + markerHitWidth
    if(!inMarker) event.preventDefault()
  }

  private isEmptyTextBlock(block: Element) {
    return !block.textContent?.replace(/\u200B/g, "").trim()
      && Array.from(block.children).every(child => child.matches("br"))
  }

  /** Enter on the final empty flow block leaves DETAILS, matching the editor's
   * list-exit behavior while preserving that same block and editing point. */
  private liftTrailingDetailsBlock() {
    const selection = document.getSelection()
    if(!selection?.isCollapsed || !selection.anchorNode) return false
    let block: Element | null = getContainer(selection.anchorNode)
    while(block && block.parentElement && block.parentElement !== document.body) {
      if(block.parentElement.matches("details")) break
      block = block.parentElement
    }
    const details = block?.parentElement
    if(!block || !details?.matches("details") || block.matches("summary") || !this.editor.schema.isBlock(block)) return false
    if(details.lastElementChild !== block || !this.isEmptyTextBlock(block)) return false
    details.after(block)
    $.move(block)
    return true
  }

  private selectedTextBlocks() {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode) return []
    const range = selection.getRangeAt(0)
    const isTextBlock = (element: Element) => element !== document.body
      && !element.matches(`${listSelector}, ${listItemSelector}, details`)
      && this.editor.schema.isBlock(element)

    if(selection.isCollapsed) {
      let element: Element | null = getContainer(selection.anchorNode)
      if(!isElement(element)) return []
      while(element && element !== document.body) {
        if(isTextBlock(element)) return [element as HTMLElement]
        element = element.parentElement
      }
      return []
    }

    const candidates = Array.from(document.body.querySelectorAll("*"))
      .filter(element => {
        if(!isTextBlock(element) || element.closest(listSelector)) return false
        try {
          return range.intersectsNode(element)
        }
        catch {
          return false
        }
      })
    return candidates.filter(candidate => !candidates.some(other => other !== candidate && candidate.contains(other))) as HTMLElement[]
  }

  private wrapTextBlocks(blocks: HTMLElement[], type: ListType) {
    const runs: HTMLElement[][] = []
    blocks.forEach(block => {
      const run = runs.at(-1)
      const previous = run?.at(-1)
      if(previous?.parentElement === block.parentElement && previous.nextElementSibling === block) run!.push(block)
      else runs.push([block])
    })
    const lists = runs.map(run => {
      const list = document.createElement(type)
      run[0].before(list)
      run.forEach((block, index) => {
        const item = document.createElement(type === "dl" ? index % 2 ? "dd" : "dt" : "li")
        list.append(item)
        item.append(block)
      })
      return list
    })
    const first = lists[0]?.firstElementChild
    const lastList = lists.at(-1)
    if(first && lastList) {
      if(lists.length === 1) $.selectRange(lastList, 0, lastList, lastList.childNodes.length)
      else $.selectElement(first)
    }
  }

  private changeListType(list: HTMLElement, type: ListType) {
    const replacement = document.createElement(type)
    const selection = document.getSelection()
    const selectedElement = $.selectedElement
    const anchor = selection?.anchorNode ?? null
    const focus = selection?.focusNode ?? null
    const anchorOffset = selection?.anchorOffset ?? 0
    const focusOffset = selection?.focusOffset ?? 0
    const replacements = new Map<Node, Node>([[list, replacement]])
    Array.from(list.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value))
    replacement.style.removeProperty("list-style-type")
    if(!replacement.getAttribute("style")) replacement.removeAttribute("style")

    let descriptionIndex = 0
    for(const child of Array.from(list.childNodes)) {
      if(isElement(child) && child.matches(listItemSelector)) {
        const targetTag = type === "dl" ? descriptionIndex++ % 2 ? "dd" : "dt" : "li"
        if(child.localName !== targetTag) {
          const item = document.createElement(targetTag)
          Array.from(child.attributes).forEach(attribute => item.setAttribute(attribute.name, attribute.value))
          item.append(...Array.from(child.childNodes))
          replacements.set(child, item)
          child.replaceWith(item)
          replacement.append(item)
        }
        else {
          replacement.append(child)
        }
      }
      else {
        replacement.append(child)
      }
    }
    list.replaceWith(replacement)
    const mappedSelected = selectedElement ? replacements.get(selectedElement) : null
    if(isElement(mappedSelected)) {
      $.selectElement(mappedSelected)
      return
    }
    const mappedAnchor = anchor?.isConnected ? anchor : anchor ? replacements.get(anchor) : null
    const mappedFocus = focus?.isConnected ? focus : focus ? replacements.get(focus) : null
    if(selection && mappedAnchor && mappedFocus) {
      const clamp = (node: Node, offset: number) => Math.min(
        offset,
        node instanceof Text ? node.length : node.childNodes.length,
      )
      selection.setBaseAndExtent(
        mappedAnchor, clamp(mappedAnchor, anchorOffset),
        mappedFocus, clamp(mappedFocus, focusOffset),
      )
    }
    else {
      $.move(replacement)
    }
  }

  private selectedDirectItems(list: HTMLElement) {
    const items = this.directItems(list)
    const selected = $.selectedElement
    if(selected === list) return items
    const current = this.activeItem()
    const selection = document.getSelection()
    if(selection?.isCollapsed) return current?.parentElement === list ? [current] : []
    if(!selection?.rangeCount) return []
    const range = selection.getRangeAt(0)
    return items.filter(item => {
      try {
        return range.intersectsNode(item)
      }
      catch {
        return false
      }
    })
  }

  private unwrapSelectedItems(list: HTMLElement) {
    const selected = this.selectedDirectItems(list)
    if(!selected.length) return
    const children = Array.from(list.childNodes)
    const indexes = selected.map(item => children.indexOf(item))
    const firstIndex = Math.min(...indexes)
    const lastIndex = Math.max(...indexes)
    const before = children.slice(0, firstIndex)
    const chosen = children.slice(firstIndex, lastIndex + 1)
    const after = children.slice(lastIndex + 1)
    const replacement: Node[] = []
    if(before.length) {
      const left = list.cloneNode(false) as HTMLElement
      left.append(...before)
      replacement.push(left)
    }
    replacement.push(...chosen.flatMap(node => isElement(node) && node.matches(listItemSelector)
      ? this.itemToBlocks(node as HTMLElement)
      : [node]))
    if(after.length) {
      const right = list.cloneNode(false) as HTMLElement
      right.append(...after)
      replacement.push(right)
    }
    list.replaceWith(...replacement)
    if(!$.anchor?.isConnected) {
      const target = replacement.find(isElement)
      if(target) $.selectElement(target)
    }
  }

  private itemToBlocks(item: HTMLElement) {
    const result: Node[] = []
    let paragraph: HTMLParagraphElement | null = null
    const appendInline = (node: Node) => {
      paragraph ??= document.createElement("p")
      paragraph.append(node)
      if(!result.includes(paragraph)) result.push(paragraph)
    }
    for(const child of Array.from(item.childNodes)) {
      if(isElement(child) && !this.editor.schema.isPhrasing(child)) {
        paragraph = null
        result.push(child)
      }
      else {
        appendInline(child)
      }
    }
    if(!result.length) result.push(document.createElement("p"))
    item.remove()
    return result
  }
}
