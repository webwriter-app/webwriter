import {DocumentListenerMap, EditorFeature} from "."
import type {ElementSelectionType, ListSelectionState, ListType} from "../editor-bridge"
import {$, atomicEditingContainer, cloneWithoutEditorMarkers, editingFlowRoot, fixedClientX, getContainer, isAtomicEditingElement, isCaretAtBoundary, isElement, isText, modifierKeyDown, removeEditorMarker, setPart} from "../utility"
import {isDocumentRoot} from "../document-template"
import {listMarkerImageProperty} from "../element-styles"

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
    if(this.isEnabled) return
    super.enable()
    window.addEventListener("resize", this.syncVirtualMarker)
    window.addEventListener("scroll", this.syncVirtualMarker, true)
    window.addEventListener("blur", this.handleWindowBlur)
    this.syncVirtualMarker()
  }

  disable() {
    if(!this.isEnabled) return
    window.removeEventListener("resize", this.syncVirtualMarker)
    window.removeEventListener("scroll", this.syncVirtualMarker, true)
    window.removeEventListener("blur", this.handleWindowBlur)
    this.clearVirtualMarker()
    super.disable()
  }

  actions = {
    indentListItems: ({}: {type: "indentListItems"}) => this.indentItems(),
    outdentListItems: ({}: {type: "outdentListItems"}) => this.indentItems(true),
    toggleList: ({listType}: {type: "toggleList", listType: ListType}) => {
      this.toggleList(listType)
    },
    setListType: ({listType, selectionTypes}: {type: "setListType", listType: "ul" | "ol", selectionTypes: ElementSelectionType[]}) => {
      return this.setListType(listType, selectionTypes)
    },
    setListStyle: ({listType, style}: {type: "setListStyle", listType: ListType, style: string}) => {
      this.setListStyle(listType, style)
    },
    setOrderedListAttribute: ({name, value}: {
      type: "setOrderedListAttribute"
      name: "start" | "reversed" | "type"
      value: string | null
    }) => this.setOrderedListAttribute(name, value),
    setOrderedListItemValue: ({value}: {type: "setOrderedListItemValue", value: string | null}) => {
      this.setOrderedListItemValue(value)
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
    pointerdown: event => {
      if(event.button === 0 && !modifierKeyDown(event) && this.detailsToggleSummary(event)) event.preventDefault()
    },
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
    const item = this.activeItem()
    return {
      type: list && isListType(list.localName) ? list.localName : null,
      style: list?.style.listStyleType ?? "",
      ...(list?.localName === "ol" ? {ordered: {
        start: list.getAttribute("start") ?? "",
        reversed: list.hasAttribute("reversed"),
        numbering: list.getAttribute("type") ?? "",
        ...(item?.localName === "li" && item.parentElement === list
          ? {itemValue: item.getAttribute("value") ?? ""}
          : {}),
      }} : {}),
    }
  }

  private get activeList() {
    const selected = $.selectedElement
    const anchor = $.anchor
    const element = selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(element) || isDocumentRoot(element)) return null
    return (element.matches(listSelector) ? element : element.closest(listSelector)) as HTMLElement | null
  }

  /** Whether SelectionFeature should defer painting the current list point to
   * this feature rather than treating it as an ordinary gap. */
  get isVirtualSelection() {
    return Boolean(this.virtualPoint)
  }

  /** Clears virtual-list selection presentation synchronously so it cannot
   * coexist with another newly applied selection kind. */
  clearSelectionPresentation() {
    this.clearVirtualMarker()
  }

  /** Repaints the current virtual item after SelectionFeature has cleared all
   * stale selection presentation. This must be synchronous because selection
   * refreshes are not always accompanied by a native selectionchange event. */
  refreshSelectionPresentation() {
    this.syncVirtualMarker()
  }

  /** Only an empty authored list exposes a prospective first item. Every
   * point in a nonempty list is either a real item selection or a normal gap. */
  private get virtualPoint(): VirtualListPoint | null {
    const selection = document.getSelection()
    const anchor = selection?.anchorNode
    if(!selection?.isCollapsed || !isElement(anchor) || isDocumentRoot(anchor) || !anchor.matches(listSelector)) return null
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
      removeEditorMarker(element, this.markerClass, this.selectedListClass)
    })
    const marker = this.editor.appendix.querySelector<HTMLElement>(".◆virtual-list-item")
    if(marker) {
      setPart(marker, "virtual-list-item-hidden")
      ;(["ul", "ol", "dl", "menu"] as const).forEach(type => setPart(marker, `virtual-list-item-${type}`, false))
      setPart(marker, "virtual-list-item-custom-marker", false)
      setPart(marker, "virtual-list-item-image-marker", false)
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
        listMarkerImageProperty,
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
    const image = listStyle.listStyleImage === "none" ? "" : listStyle.getPropertyValue(listMarkerImageProperty).trim()
    if(image) marker.style.setProperty(listMarkerImageProperty, image)
    else marker.style.removeProperty(listMarkerImageProperty)
    setPart(marker, "virtual-list-item-image-marker", Boolean(image))
    const hasCustomContent = Boolean(content && content !== "normal")
    setPart(marker, "virtual-list-item-custom-marker", hasCustomContent || Boolean(image))
    if(hasCustomContent || image) {
      marker.style.setProperty("--virtual-list-marker-content", image ? '""' : content)
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
    if(source.matches("li") && continuation.matches("li")) continuation.removeAttribute("value")
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

    const {list} = point
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
    marker.style.left = `${fixedClientX(Math.max(0, contentLeft))}px`
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

  materializeVirtualItem(point = this.virtualPoint) {
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
    if(event.defaultPrevented) return
    const point = this.virtualPoint
    if(!point && event.inputType === "insertParagraph" && this.enterItem()) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
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
    if(event.defaultPrevented) return
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
      if(this.enterItem()) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      return
    }

    // Alt/primary-modifier Enter inserts a real break/split through ManipulationFeature,
    // so first give that command a schema-valid list item to operate on.
    if(point && event.key === "Enter") {
      this.materializeVirtualItem(point)
      return
    }

    if(event.key === "Tab" && !event.altKey && !modifierKeyDown(event) && (point || this.selectedItems().length)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if(point) {
        if(event.shiftKey) this.outdentVirtualItem(point)
      }
      else {
        this.indentItems(event.shiftKey)
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
    // On the first insertion into a design-mode document, Chromium can show
    // a caret in an empty SUMMARY but omit beforeinput for printable keys.
    // Start the authored text through the normal input handlers (including
    // stored marks); subsequent characters use native editing.
    const summary = $.anchorContainer
    if(isPrintable && !event.isComposing && $.isEmpty && $.isEmptySelection
      && summary?.isConnected && !atomicEditingContainer(summary, this.editor.schema) && summary.matches("details > summary")
      && summary.parentElement?.querySelector(":scope > summary") === summary) {
      event.preventDefault()
      const input = new InputEvent("beforeinput", {
        inputType: "insertText", data: event.key, bubbles: true, cancelable: true,
      })
      if(!summary.dispatchEvent(input)) return
      if(!summary.isConnected || $.anchorContainer !== summary || !$.isEmpty || !$.isEmptySelection) return
      const text = document.createTextNode(event.key)
      $.range.insertNode(text)
      $.move(text, text.length)
      summary.dispatchEvent(new InputEvent("input", {
        inputType: "insertText", data: event.key, bubbles: true,
      }))
    }
  }

  private activeItem() {
    const selected = $.selectedElement
    const anchor = $.anchor
    const element = selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(element) || !element.isConnected || atomicEditingContainer(element, this.editor.schema)) return null
    const item = element.matches(listItemSelector) ? element : element.closest(listItemSelector)
    return item?.parentElement?.matches(listSelector) ? item as HTMLElement : null
  }

  private enterItem() {
    const selection = document.getSelection()
    if(!selection?.rangeCount) return false
    const range = selection.getRangeAt(0)
    const start = getContainer(range.startContainer)
    const item = start?.closest<HTMLElement>(listItemSelector)
    if(!item?.isConnected || !item.parentElement?.matches(listSelector)
      || !item.parentElement.contains(range.endContainer)
      || atomicEditingContainer(range.startContainer, this.editor.schema)
      || atomicEditingContainer(range.endContainer, this.editor.schema)) return false
    const wasEmpty = selection.isCollapsed && !item.textContent?.replace(/\u200B/g, "").trim()
      && Array.from(item.querySelectorAll("*")).every(element => element.matches("br")
        || !isAtomicEditingElement(element, this.editor.schema)
          && (this.editor.schema.isPhrasing(element) || this.editor.features.manipulation.isTextBlock(element)))
    if(!selection.isCollapsed) $.delete()
    if(!item.isConnected || !item.contains($.anchor)) return true
    if(wasEmpty) this.liftOrExitEmptyItem(item)
    else if(item.parentElement?.matches("dl") || isCaretAtBoundary(item, "end")) this.insertEmptyItemAfter(item)
    else {
      this.editor.features.manipulation.splitListItem(item)
    }
    this.syncVirtualMarker()
    return true
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
      const trailingList = this.editor.features.manipulation.cloneSplitContinuation(list)
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

  /** Resolve text, node and list-container ranges against the live DOM. An
   * ancestor item is not selected merely because the range is in its sublist. */
  private selectedItems() {
    const ranges = $.ranges
    const items = Array.from(document.body.querySelectorAll<HTMLElement>(listItemSelector))
      .filter(item => item.parentElement?.matches(listSelector)
        && !atomicEditingContainer(item, this.editor.schema)
        && ($.includesNode(item) || $.selectedElements.some(element => item.contains(element))))
    const selected = items.filter(item => ranges.some(range => {
      if(!document.body.contains(range.startContainer) || !document.body.contains(range.endContainer)) return false
      if(atomicEditingContainer(range.startContainer, this.editor.schema)
        || atomicEditingContainer(range.endContainer, this.editor.schema)) return false
      if(range.collapsed) return item === this.activeItem()
      const parent = item.parentNode!
      const index = Array.from(parent.childNodes).indexOf(item)
      if(range.comparePoint(parent, index) === 0 && range.comparePoint(parent, index + 1) === 0) return true
      const start = range.cloneRange(), end = range.cloneRange()
      start.collapse(true)
      end.collapse(false)
      const intersectsContent = (node: ChildNode): boolean => {
        if(isElement(node) && node.matches(listSelector)) return false
        if(isText(node)) return start.comparePoint(node, node.length) > 0 && end.comparePoint(node, 0) < 0
        if(node.hasChildNodes() && !isAtomicEditingElement(node, this.editor.schema)) {
          return Array.from(node.childNodes).some(intersectsContent)
        }
        const parent = node.parentNode!
        const index = Array.from(parent.childNodes).indexOf(node)
        return start.comparePoint(parent, index + 1) > 0 && end.comparePoint(parent, index) < 0
      }
      return Array.from(item.childNodes).some(intersectsContent)
    }))
    return selected.filter(item => !selected.some(other => other !== item && other.contains(item)))
  }

  /** Consecutive selected siblings move together, retaining their order. */
  indentItems(outdent = false) {
    const point = this.virtualPoint
    if(point) {
      if(outdent) this.outdentVirtualItem(point)
      this.syncVirtualMarker()
      return
    }
    const items = this.selectedItems()
    if(!items.length) return
    const restore = this.captureItemSelection(items)
    const groups: HTMLElement[][] = []
    for(const item of items) {
      const previous = groups.at(-1)?.at(-1)
      const peers = this.directItems(item.parentElement!)
      if(previous?.parentElement === item.parentElement && peers[peers.indexOf(item) - 1] === previous) groups.at(-1)!.push(item)
      else groups.push([item])
    }
    let changed = false
    for(const group of groups) {
      changed = (outdent ? this.outdentItems(group) : this.nestItems(group)) || changed
    }
    if(changed) restore()
    this.syncVirtualMarker()
  }

  private nestItems(items: HTMLElement[]) {
    const list = items[0].parentElement!
    const peers = this.directItems(list)
    const owner = peers[peers.indexOf(items[0]) - 1]
    if(!owner || !isListType(list.localName)) return false
    let nested = owner.lastElementChild?.localName === list.localName ? owner.lastElementChild as HTMLElement : null
    for(const item of items) {
      // Keep descendants at their current depth. Reuse their authored list
      // containers (including attributes and comments) at the new owner's level.
      const children = Array.from(item.querySelectorAll<HTMLElement>(listSelector))
        .filter(child => child.parentElement?.closest(listItemSelector) === item
          && !atomicEditingContainer(child, this.editor.schema))
      if(!nested && children[0]?.localName === list.localName) {
        nested = children.shift()!
        owner.append(nested)
        nested.prepend(item)
      }
      else {
        if(!nested) {
          nested = this.editor.features.manipulation.cloneSplitContinuation(list) as HTMLElement
          nested.removeAttribute("start")
          owner.append(nested)
        }
        nested.append(item)
      }
      for(const child of children) {
        owner.append(child)
        nested = child.localName === list.localName ? child : null
      }
    }
    return true
  }

  private outdentItems(items: HTMLElement[]) {
    const list = items[0].parentElement!
    const owner = list.parentElement?.closest(listItemSelector)
    const outer = owner?.parentElement
    if(!owner?.matches(listItemSelector) || !outer?.matches(listSelector)) return false
    const last = items.at(-1)!
    const following = Array.from(list.childNodes).slice(Array.from(list.childNodes).indexOf(last) + 1)
    if(following.length) {
      const continuation = this.editor.features.manipulation.cloneSplitContinuation(list)
      this.prepareSplitContinuation(list, continuation, following)
      continuation.append(...following)
      last.append(continuation)
    }
    owner.after(...items)
    if(!list.childNodes.length) list.remove()
    return true
  }

  private outdentItem(item: HTMLElement) {
    const restore = this.captureItemSelection([item])
    if(this.outdentItems([item])) restore()
  }

  /** Reparenting invalidates parent-offset ranges in native selections. Keep
   * text endpoints when possible and reconstruct structural ranges by identity. */
  private captureItemSelection(items: HTMLElement[]) {
    const selection = document.getSelection()
    const selected = $.selectedElements
    const anchor = selection?.anchorNode, focus = selection?.focusNode
    const anchorOffset = selection?.anchorOffset ?? 0, focusOffset = selection?.focusOffset ?? 0
    const backward = Boolean(selection?.rangeCount && (anchor !== selection.getRangeAt(0).startContainer
      || anchorOffset !== selection.getRangeAt(0).startOffset))
    return () => {
      if(selected.length && selected.every(element => element.isConnected)) {
        selected.length === 1 ? $.selectElement(selected[0]) : $.selectElements(selected)
      }
      else if(selection && anchor?.isConnected && focus?.isConnected
        && items.some(item => item.contains(anchor)) && items.some(item => item.contains(focus))) {
        const length = (node: Node) => isText(node) ? node.length : node.childNodes.length
        selection.setBaseAndExtent(anchor, Math.min(anchorOffset, length(anchor)), focus, Math.min(focusOffset, length(focus)))
      }
      else {
        const first = items[0], last = items.at(-1)!
        if(!first.isConnected || !last.isConnected) return
        const start: [Node, number] = [first.parentNode!, Array.from(first.parentNode!.childNodes).indexOf(first)]
        const end: [Node, number] = [last.parentNode!, Array.from(last.parentNode!.childNodes).indexOf(last) + 1]
        backward ? $.selectRange(...end, ...start) : $.selectRange(...start, ...end)
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

  insertList(type: ListType) {
    if(this.editor.features.manipulation.convertInsertion(type)) {
      this.syncVirtualMarker()
      return this.activeList
    }
    const list = document.createElement(type)
    this.editor.features.manipulation.insert(list, 0, false, (this.editor.features.canvas.active || this.editor.features.slides.active) || undefined)
    if(list.isConnected) this.moveToVirtual(list, 0)
    this.syncVirtualMarker()
    return list
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
      this.insertList(type)
    }
    this.syncVirtualMarker()
  }

  setListStyle(type: ListType, style: string) {
    if(this.activeList?.localName !== type) this.toggleList(type)
    const list = this.activeList
    if(list?.localName === type) list.style.listStyleType = style
  }

  setListType(type: "ul" | "ol", selectionTypes: ElementSelectionType[]) {
    if(type !== "ul" && type !== "ol") throw new TypeError("Unsupported list type")
    const lists = [...new Set(selectionTypes.filter(scope => scope.namespaceURI === "http://www.w3.org/1999/xhtml"
      && (scope.localName === "ul" || scope.localName === "ol"))
      .flatMap(scope => this.editor.features.manipulation.selectedElementsOfType(scope)))]
    const selected = $.selectedElements
    const replacements = new Map<Element, Element>()
    for(const list of lists) {
      if(list.isConnected && list.localName !== type) replacements.set(list, this.changeListType(list as HTMLElement, type))
    }
    if(selected.length > 1 && replacements.size) {
      $.selectElements(selected.map(element => replacements.get(element) ?? element).filter(element => element.isConnected))
    }
    this.syncVirtualMarker()
    return replacements.size
  }

  setOrderedListAttribute(name: "start" | "reversed" | "type", value: string | null) {
    const list = this.activeList
    if(list?.localName !== "ol") return
    if(name === "start") {
      if(value !== null && value !== "" && !/^-?\d+$/.test(value)) throw new TypeError("List start must be an integer")
      if(value === null || value === "") list.removeAttribute("start")
      else list.setAttribute("start", value)
      return
    }
    if(name === "reversed") {
      if(value === null) list.removeAttribute("reversed")
      else list.setAttribute("reversed", "")
      return
    }
    if(value !== null && value !== "" && !["1", "a", "A", "i", "I"].includes(value)) {
      throw new TypeError("Unsupported ordered-list numbering type")
    }
    if(value === null || value === "") list.removeAttribute("type")
    else list.setAttribute("type", value)
  }

  setOrderedListItemValue(value: string | null) {
    const list = this.activeList
    const item = this.activeItem()
    if(list?.localName !== "ol" || item?.localName !== "li" || item.parentElement !== list) return
    if(value !== null && value !== "" && !/^-?\d+$/.test(value)) throw new TypeError("List item value must be an integer")
    if(value === null || value === "") item.removeAttribute("value")
    else item.setAttribute("value", value)
  }

  insertDetails() {
    if(this.editor.features.manipulation.convertInsertion("details")) return
    const details = document.createElement("details")
    const summary = document.createElement("summary")
    details.append(summary)
    if(!$.range.collapsed) {
      details.append($.slice)
      details.open = true
    }
    this.editor.features.manipulation.insert(details, 0, false, (this.editor.features.canvas.active || this.editor.features.slides.active) || undefined)
    if(details.isConnected) $.move(summary)
  }

  /** Repair disclosure summaries at local editing boundaries.
   * Widget internals own their structure. */
  ensureDetailsSummaries(roots: Iterable<Element> = [document.body]) {
    const disclosures = new Set<Element>()
    for(const root of roots) {
      const ancestor = root.closest("details:not([is])")
      if(ancestor) disclosures.add(ancestor)
      root.querySelectorAll("details:not([is])").forEach(details => disclosures.add(details))
    }
    for(const details of disclosures) {
      if(!document.body.contains(details)) continue
      if(atomicEditingContainer(details, this.editor.schema)) continue
      const summary = details.querySelector(":scope > summary") ?? document.createElement("summary")
      if(details.firstElementChild !== summary) details.prepend(summary)
    }
  }

  /** Opening follows editing intent, not just pointer activation: any
   * selection whose editing target is inside DETAILS opens it. SUMMARY is the
   * exception so its text can be edited while the disclosure remains closed. */
  private openSelectedDetails() {
    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode) return
    const selected = $.selectedElement
    if(selected?.matches("details")) return
    const target = selected ?? getContainer(selection.anchorNode)
    if(!isElement(target)) return
    const details = (target.matches("details") ? target : target.closest("details")) as HTMLDetailsElement | null
    if(!details) return
    if(target.matches("summary") && target.parentElement === details) return
    const anchorSummary = getContainer(selection.anchorNode).closest("summary")
    const focusSummary = getContainer(selection.focusNode).closest("summary")
    if(anchorSummary && anchorSummary === focusSummary && anchorSummary.parentElement === details) return
    details.open = true
    this.focusEmptyDetails(details)
  }

  private detailsSummary(event: MouseEvent) {
    if(!isElement(event.target)) return null
    const summary = event.target.closest("summary") as HTMLElement | null
    return summary?.parentElement?.localName === "details"
      && summary.parentElement.querySelector(":scope > summary") === summary ? summary : null
  }

  isDetailsToggleInteraction(event: MouseEvent) {
    return Boolean(this.detailsToggleSummary(event))
  }

  /** Resolve the disclosure hit area from the current DOM and theme for both
   * pointerdown (selection prevention) and click (activation). */
  private detailsToggleSummary(event: MouseEvent) {
    const summary = this.detailsSummary(event)
    if(!summary) return null
    // Keyboard and assistive activation has no pointer position.
    if(event.type === "click" && event.detail === 0 && event.clientX === 0 && event.clientY === 0) return summary
    const rect = summary.getBoundingClientRect()
    if(event.clientY < rect.top || event.clientY > rect.bottom) return null
    const style = getComputedStyle(summary)
    const icon = getComputedStyle(summary, "::after")
    const pixels = (value: string) => Number.parseFloat(value) || 0
    // Pico/Base draw a floated ::after chevron instead of a native marker.
    // Read its current side and size, including RTL and authored padding.
    const themedMarker = icon.display !== "none" && icon.backgroundImage
      && icon.backgroundImage !== "none" && (icon.cssFloat === "left" || icon.cssFloat === "right")
    // The native triangle occupies roughly one em. Keep this deliberately
    // narrower than the summary's text inset so clicking its first character
    // cannot be mistaken for disclosure-marker activation.
    const markerHitWidth = themedMarker ? pixels(icon.width)
      : Math.max(16, pixels(style.fontSize) * 1.125 || 18)
    const onRight = themedMarker ? icon.cssFloat === "right" : style.direction === "rtl"
    const edge = onRight
      ? rect.right - pixels(style.borderRightWidth) - pixels(style.paddingRight)
      : rect.left + pixels(style.borderLeftWidth) + pixels(style.paddingLeft)
    const inMarker = onRight
      ? event.clientX >= edge - markerHitWidth && event.clientX <= edge
      : event.clientX >= edge && event.clientX <= edge + markerHitWidth
    return inMarker ? summary : null
  }

  /** SUMMARY text remains editable. Disclosure activation is handled here so
   * it never starts text selection and an empty body gets an editing point. */
  private handleDetailsClick(event: MouseEvent) {
    if(event.defaultPrevented || event.button !== 0 || !this.detailsSummary(event)) return
    event.preventDefault()
    const summary = this.detailsToggleSummary(event)
    if(!summary) return
    const details = summary.parentElement as HTMLDetailsElement
    details.open = !details.open
    if(details.open) this.focusDetailsContent(details)
    else $.move(summary, -1)
    this.editor.features.selection.selectDropRange($.range)
  }

  private focusDetailsContent(details: HTMLDetailsElement) {
    this.focusEmptyDetails(details)
    const first = Array.from(details.childNodes).find(node => isElement(node) && !node.matches("summary")
      || isText(node) && Boolean(node.data.trim()))
    if(!first) return
    if(isText(first) || isElement(first) && !atomicEditingContainer(first, this.editor.schema)
      && (this.editor.features.manipulation.isTextBlock(first) || this.editor.schema.isPhrasing(first))) $.move(first)
    else if(isElement(first)) $.selectGap(first, "before")
  }

  private focusEmptyDetails(details: HTMLDetailsElement) {
    const summary = details.querySelector(":scope > summary")
    if(!details.isConnected || !details.open || !summary) return
    const hasContent = Array.from(details.childNodes).some(node => node !== summary
      && (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())))
    if(hasContent) return
    const paragraph = document.createElement("p")
    details.append(paragraph)
    $.move(paragraph)
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
    const flowRoot = editingFlowRoot(range.startContainer)
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
        if(!$.includesNode(element) || editingFlowRoot(element) !== flowRoot || !isTextBlock(element) || element.closest(listSelector)) return false
        try {
          return range.intersectsNode(element)
        }
        catch {
          return false
        }
      })
    return candidates.filter(candidate => !candidates.some(other => other !== candidate && candidate.contains(other))) as HTMLElement[]
  }

  /** List conversion keeps heading content as paragraphs. Widget internals
   * remain owned by the widget, including headings in its light DOM. */
  prepareItemContent(root: Element) {
    const headings = [root, ...Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))]
      .filter(element => element.matches("h1, h2, h3, h4, h5, h6"))
    let result = root
    for(const heading of headings) {
      let atomic = false
      for(let ancestor: Element | null = heading; ancestor; ancestor = ancestor.parentElement) {
        if(Boolean(isAtomicEditingElement(ancestor, this.editor.schema))) { atomic = true; break }
        if(ancestor === root) break
      }
      if(atomic) continue
      const paragraph = heading.ownerDocument.createElement("p")
      const authored = cloneWithoutEditorMarkers(heading, false) as Element
      for(const attribute of Array.from(authored.attributes)) {
        paragraph.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
      }
      paragraph.append(...Array.from(heading.childNodes))
      heading.replaceWith(paragraph)
      if(heading === root) result = paragraph
    }
    return result
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
        item.append(this.prepareItemContent(block))
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
      return replacement
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
    return replacement
  }

  private unwrapSelectedItems(list: HTMLElement) {
    const selected = this.selectedItems().filter(item => item.parentElement === list)
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
      const left = cloneWithoutEditorMarkers(list, false) as HTMLElement
      left.append(...before)
      replacement.push(left)
    }
    replacement.push(...chosen.flatMap(node => isElement(node) && node.matches(listItemSelector)
      ? this.itemToBlocks(node as HTMLElement)
      : [node]))
    if(after.length) {
      const right = this.editor.features.manipulation.cloneSplitContinuation(list)
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
