import { EditorFeature } from "."
import {emptyElementHTML, InsertionMenu, type InsertionMenuItem} from "../components/insertion-menu"
import { $, getContainer, isElement, isText, markWidgetsEditable, modifierKeyDown } from "../utility"
import {isMediaType, mediaDefaultHTML} from "../media"
import {createTable} from "../table"
import {formDefaultHTML, isFormElementType} from "../form"
import {getDocumentRoot, isDocumentRoot} from "../document-template"
import {dialogDefaultHTML} from "../dialog"

type CustomHighlightRegistry = {
  delete(name: string): void
  set(name: string, highlight: Highlight): void
}

/** Element insertion through the editor's `++` command menu. */
export class InsertionFeature extends EditorFeature {
  /** The command range starts where `++` was typed and grows as the user
   * types the search text in the editable document. */
  private commandRange: Range | null = null
  private commandBlock: Element | null = null
  private commandStartOffset = 0
  private commandTriggerLength = 0
  private commandTrigger: Range | null = null
  private triggerBodyMarkerAdded = false
  private emptyTextBlock: Element | null = null
  private commandObserver: MutationObserver | null = null
  private commandGeneration = 0
  private readonly handleMenuSelect = (event: Event) => {
    void this.insert((event as CustomEvent<InsertionMenuItem>).detail)
  }
  private readonly handleMenuClose = () => this.close()

  enable() {
    if(this.isEnabled) return
    this.menu.addEventListener("insertion-menu-select", this.handleMenuSelect)
    this.menu.addEventListener("insertion-menu-close", this.handleMenuClose)
    super.enable()
    this.createEmptyTextBlockButton()
  }

  disable() {
    if(!this.isEnabled) return
    this.menu.removeEventListener("insertion-menu-select", this.handleMenuSelect)
    this.menu.removeEventListener("insertion-menu-close", this.handleMenuClose)
    this.close(false)
    super.disable()
  }

  constructor(editor: EditorFeature["editor"]) {
    super(editor)
  }

  get menu() {
    let menu = this.editor.appendix.querySelector("domeditor-insertion-menu") as InsertionMenu | null
    if(!menu) {
      // Construct directly as well as registering the tag: happy-dom does not
      // upgrade a custom element created through document.createElement().
      menu = new InsertionMenu()
      menu.classList.add("◆", "◆editor-only")
      this.editor.addAppendix(menu)
    }
    return menu
  }

  activeListeners = {
    keydown: (ev: KeyboardEvent) => {
      if(this.menu.open) {
        if(ev.key === "ArrowDown") {
          ev.preventDefault()
          ev.stopImmediatePropagation()
          this.menu.moveActive(1)
          return
        }
        if(ev.key === "ArrowUp") {
          ev.preventDefault()
          ev.stopImmediatePropagation()
          this.menu.moveActive(-1)
          return
        }
        if(ev.key === "Tab") {
          ev.preventDefault()
          ev.stopImmediatePropagation()
          return
        }
        if(ev.key === " " && this.commandTriggerLength > 0 && !this.menu.query) {
          this.close()
          return
        }
        if(ev.key === "Enter") {
          if(!this.menu.activeItem) {
            this.close()
            return
          }
          ev.preventDefault()
          ev.stopImmediatePropagation()
          this.menu.selectActive()
          return
        }
        if(ev.key === "Escape") {
          ev.preventDefault()
          ev.stopImmediatePropagation()
          this.close()
          return
        }
        // Backspace/Delete are handled by the editor's manipulation feature,
        // which prevents the browser input event. Sync after that handler has
        // updated the document and selection.
        if(ev.key === "Backspace" || ev.key === "Delete") {
          queueMicrotask(() => this.updateQuery())
        }
        return
      }
      if(ev.defaultPrevented || ev.key !== "+" || ev.altKey || modifierKeyDown(ev)) return
      const selection = document.getSelection()
      if(!selection?.rangeCount || !selection.anchorNode || this.hasContentDirectlyAfterCaret()) return

      if(this.openTypedTriggerFromKeydown()) {
        ev.preventDefault()
        ev.stopImmediatePropagation()
      }
    },
    input: () => {
      if(!this.menu.open) this.openTypedTrigger(2)
      this.updateQuery(true)
    },
    keyup: () => this.updateQuery(),
    selectionchange: () => queueMicrotask(() => this.updateQuery()),
  }

  /** Opens the command menu at the current caret without inserting a visible
   * trigger. */
  private openMenu(triggerLength = 0) {
    this.editor.features.manipulation.ensureTextBlock()
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode) return
    if(!triggerLength) {
      this.commandTrigger = null
      this.clearTriggerHighlight()
    }

    const range = selection.getRangeAt(0)
    this.commandBlock = this.closestBlock(range.startContainer)
    const blockStart = document.createRange()
    blockStart.selectNodeContents(this.commandBlock)
    blockStart.setEnd(range.startContainer, range.startOffset)
    this.commandStartOffset = Math.max(0, blockStart.toString().length - triggerLength)
    this.commandTriggerLength = triggerLength
    const triggerText = "+".repeat(triggerLength)
    this.emptyTextBlock = triggerLength > 0 && this.commandBlock.textContent === triggerText && this.commandStartOffset === 0
      ? this.commandBlock
      : this.findEmptyTextBlock(range.startContainer)
    range.deleteContents()
    range.collapse(true)
    $.move(range.startContainer, range.startOffset)

    this.commandRange = document.createRange()
    const commandStart = this.commandStartPoint() ?? [range.startContainer, range.startOffset] as [Node, number]
    this.commandRange.setStart(...commandStart)
    this.commandRange.setEnd(range.startContainer, range.startOffset)
    this.setTriggerHighlight(this.commandRange)
    const rect = this.commandPositionRect(this.commandRange)
    this.commandGeneration++
    this.menu.showAt(rect.left, rect.bottom + 6)
    const FrameMutationObserver = document.defaultView?.MutationObserver ?? MutationObserver
    const observer = new FrameMutationObserver(() => this.updateQuery())
    try {
      observer.observe(document.body, {characterData: true, childList: true, subtree: true})
      this.commandObserver = observer
    }
    catch {
      observer.disconnect()
    }
    return true
  }

  /** Syncs the picker with the text following its command trigger. Typing stays
   * in the document, so the regular editor caret remains visible and usable. */
  private updateQuery(allowInputExtension = false) {
    const selection = document.getSelection()
    const start = this.commandRange
    if(!this.menu.open) return
    if(!start || !selection?.isCollapsed || !selection.anchorNode) {
      this.close(false)
      return
    }
    if(!allowInputExtension) {
      try {
        if(start.comparePoint(selection.anchorNode, selection.anchorOffset) !== 0) {
          this.close(false)
          return
        }
      }
      catch {
        this.close(false)
        return
      }
    }
    const point = this.commandStartPoint()
    if(!point && !start.startContainer.isConnected) {
      this.close(false)
      return
    }
    const range = document.createRange()
    try {
      point? range.setStart(...point): range.setStart(start.startContainer, start.startOffset)
      range.setEnd(selection.anchorNode, selection.anchorOffset)
    }
    catch {
      this.close(false)
      return
    }
    const text = range.toString()
    const trigger = "+".repeat(this.commandTriggerLength)
    if(trigger && !text.startsWith(trigger)) {
      this.close(false)
      return
    }
    const query = trigger? text.slice(trigger.length): text
    if(trigger && query.startsWith(" ")) {
      this.close(false)
      return
    }
    this.commandRange = range
    this.setTriggerHighlight(this.commandRange)
    this.menu.query = query
    const rect = this.commandPositionRect(range)
    this.menu.setPosition(rect.left, rect.bottom + 6)
  }

  /** Empty blocks have no rendered caret box yet, so a collapsed range can
   * report the document origin. Anchor the initial picker to the block in
   * that case; once the user types a query, the range follows the caret. */
  private commandPositionRect(range: Range) {
    const triggerText = "+".repeat(this.commandTriggerLength)
    if(this.emptyTextBlock?.isConnected && (
      this.isEmptyTextBlock(this.emptyTextBlock) || range.toString() === triggerText
    )) {
      return this.emptyTextBlock.getBoundingClientRect()
    }
    return range.getBoundingClientRect()
  }

  /** Completes a just-typed command trigger and opens the menu. With a
   * keydown event the second `+` has not been inserted yet, so add it before
   * opening. An input event can contain both pluses at once, which also
   * supports pasted or programmatically inserted `++`. */
  private openTypedTriggerFromKeydown() {
    if(this.menu.open) return false
    const selection = document.getSelection()
    if(!selection?.isCollapsed || !selection.anchorNode || this.hasContentDirectlyAfterCaret()) return false

    const block = this.closestBlock(selection.anchorNode)
    const beforeCaret = document.createRange()
    try {
      beforeCaret.selectNodeContents(block)
      beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset)
    }
    catch {
      return false
    }
    const text = beforeCaret.toString()
    if(!text.endsWith("+")) return false

    const range = selection.getRangeAt(0)
    const plus = document.createTextNode("+")
    range.insertNode(plus)
    $.move(plus, 1)
    return this.openTypedTrigger(2)
  }

  /** Keeps the typed `++` as ordinary document text and marks its range with
   * the Custom Highlight API while the insertion menu is active. */
  private openTypedTrigger(length: 2) {
    if(this.menu.open) return false
    const selection = document.getSelection()
    if(!selection?.isCollapsed || !selection.anchorNode || this.hasContentDirectlyAfterCaret()) return false

    const block = this.closestBlock(selection.anchorNode)
    const beforeCaret = document.createRange()
    try {
      beforeCaret.selectNodeContents(block)
      beforeCaret.setEnd(selection.anchorNode, selection.anchorOffset)
    }
    catch {
      return false
    }
    const text = beforeCaret.toString()
    const triggerText = "+".repeat(length)
    if(!text.endsWith(triggerText)) return false

    const start = this.pointAtTextOffset(block, text.length - triggerText.length)
    if(!start) return false
    const triggerRange = document.createRange()
    try {
      triggerRange.setStart(...start)
      triggerRange.setEnd(selection.anchorNode, selection.anchorOffset)
    }
    catch {
      return false
    }
    this.commandTrigger = triggerRange.cloneRange()
    if(!document.body.classList.contains("◆")) {
      document.body.classList.add("◆")
      this.triggerBodyMarkerAdded = true
    }
    document.body.classList.add("◆insertion-trigger")
    if(!this.openMenu(length)) {
      this.close(false)
      return false
    }
    return true
  }

  private setTriggerHighlight(range: Range) {
    if(typeof CSS === "undefined" || typeof Highlight === "undefined" || !CSS.highlights) return
    const highlights = CSS.highlights as unknown as CustomHighlightRegistry
    highlights.delete("insertion-trigger")
    highlights.set("insertion-trigger", new Highlight(range))
  }

  private clearTriggerHighlight() {
    if(typeof CSS !== "undefined" && CSS.highlights) {
      const highlights = CSS.highlights as unknown as CustomHighlightRegistry
      highlights.delete("insertion-trigger")
    }
    document.body.classList.remove("◆insertion-trigger")
    if(this.triggerBodyMarkerAdded) {
      document.body.classList.remove("◆")
      this.triggerBodyMarkerAdded = false
    }
  }

  /** True when the next content in the current text block is non-whitespace.
   * Content in a following block is intentionally ignored: a command at the
   * end of one paragraph may still precede another paragraph. */
  private hasContentDirectlyAfterCaret() {
    const selection = document.getSelection()
    if(!selection?.isCollapsed || !selection.anchorNode) return true
    const boundary = this.closestBlock(selection.anchorNode)
    let node: Node = selection.anchorNode
    let offset = selection.anchorOffset

    while(true) {
      if(isText(node) && offset < node.length) return !/^\s/.test(node.data.slice(offset, offset + 1))
      const parent = node.parentNode
      if(!parent || node === boundary) return false
      const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
      const siblings = Array.from(parent.childNodes).slice(isText(node) ? index + 1 : offset)
      for(const sibling of siblings) {
        const next = this.firstContent(sibling)
        if(next === null) continue
        return next === "element" || !/^\s/.test(next)
      }
      node = parent
      offset = index + 1
    }
  }

  private firstContent(node: Node): string | "element" | null {
    if(isText(node)) return node.data ? node.data.slice(0, 1) : null
    if(!isElement(node)) return null
    if(!node.childNodes.length) return "element"
    for(const child of Array.from(node.childNodes)) {
      const content = this.firstContent(child)
      if(content !== null) return content
    }
    return "element"
  }

  private closestBlock(node: Node) {
    const root = getDocumentRoot()
    let element = getContainer(node)
    while(element !== root && !this.editor.schema.isBlock(element)) element = element.parentElement ?? root
    return element
  }

  private findEmptyTextBlock(node: Node) {
    const block = this.closestBlock(node)
    return this.isEmptyTextBlock(block)? block: null
  }

  private isEmptyTextBlock(block: Element) {
    if(isDocumentRoot(block)) return block.childNodes.length === 0
    if(!this.editor.schema.isBlock(block)) return false
    return !Array.from(block.childNodes).some(node => {
      if(isElement(node) && node.matches(".◆editor-only")) return false
      return !isText(node) || Boolean(node.data)
    })
  }

  private isInsertionMenuBlock(block: Element) {
    return block.matches("p") || this.isEmptyTextBlock(block) && isDocumentRoot(block)
  }

  private createEmptyTextBlockButton() {
    if(this.editor.appendix.querySelector(".◆insertion-add")) return

    const button = document.createElement("button")
    button.classList.add("◆", "◆editor-only", "◆insertion-add")
    button.type = "button"
    button.contentEditable = "false"
    button.setAttribute("aria-label", "Insert element")
    button.title = "Insert element"
    button.setAttribute("part", "insertion-add")
    button.textContent = "++"
    button.addEventListener("pointerdown", ev => {
      ev.preventDefault()
      ev.stopPropagation()
    })
    const activate = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
      const block = document.querySelector(".◆empty-selected")
      if(!block || !this.isEmptyTextBlock(block) || !this.isInsertionMenuBlock(block)) return
      $.move(block)
      const target = this.editor.features.manipulation.ensureTextBlock() ?? block
      $.move(target)
      const selection = document.getSelection()
      if(!selection?.rangeCount) return
      const range = selection.getRangeAt(0)
      const trigger = document.createTextNode("++")
      range.insertNode(trigger)
      $.move(trigger, trigger.length)
      this.openTypedTrigger(2)
    }
    button.addEventListener("keydown", ev => {
      if(ev.key === "Enter" || ev.key === " ") activate(ev)
    })
    button.addEventListener("click", activate)
    this.editor.addAppendix(button)
  }

  private async insert(item: InsertionMenuItem) {
    const generation = this.commandGeneration
    const isCurrentCommand = () => generation === this.commandGeneration && this.menu.open
    let html = item.html ?? (item.tag === "table"
      ? createTable(2, 2).outerHTML
      : item.tag === "details"
      ? "<details><summary></summary></details>"
      : item.tag === "dialog"
      ? dialogDefaultHTML(document).html
      : isMediaType(item.tag) ? mediaDefaultHTML(item.tag)
      : isFormElementType(item.tag) ? formDefaultHTML(item.tag)
      : item.tag ? emptyElementHTML(item.tag) : "")
    if(item.htmlUrl) {
      try {
        const response = await fetch(item.htmlUrl)
        if(!isCurrentCommand()) return
        if(!response.ok) throw new Error(`Snippet download failed (${response.status})`)
        html = await response.text()
        if(!isCurrentCommand()) return
      }
      catch {
        if(isCurrentCommand()) this.close()
        return
      }
    }
    if(!isCurrentCommand()) return
    if(!html) {
      this.close()
      return
    }

    let range = this.commandRange
    const selection = document.getSelection()
    const point = this.commandStartPoint()
    if(point && selection?.anchorNode) {
      range = document.createRange()
      range.setStart(...point)
      range.setEnd(selection.anchorNode, selection.anchorOffset)
      this.commandRange = range
    }
    if(!range?.startContainer.isConnected) {
      this.close()
      return
    }
    range.deleteContents()
    const fragment = this.editor.parseHTMLFragment(html).fragment
    const nodes = Array.from(fragment.childNodes)
    if(!nodes.length) {
      this.close()
      return
    }
    nodes.forEach(node => {
      if(item.kind === "widget" && isElement(node)) node.setAttribute("contenteditable", "true")
      markWidgetsEditable(node)
    })
    if(item.kind === "widget" && nodes.length === 1 && isElement(nodes[0])) {
      $.move(range.startContainer, range.startOffset)
      this.editor.features.manipulation.insert(nodes[0])
      this.close(false)
      return
    }
    const replacement = this.emptyTextBlock?.isConnected && !isDocumentRoot(this.emptyTextBlock) && !this.emptyTextBlock.textContent && this.emptyTextBlock
    if(replacement) {
      replacement.replaceWith(...nodes)
    }
    else {
      range.insertNode(fragment)
    }
    const last = nodes.at(-1)!
    if(isElement(last) && last.matches("ul, ol, dl, menu")) {
      $.move(last)
    }
    else if(isElement(last) && last.matches("details") && last.firstElementChild) {
      $.move(last.firstElementChild)
    }
    else if(isElement(last) && last.matches("dialog")) {
      $.selectElement(last)
      this.editor.features.dialog.refresh()
      this.editor.features.selection.processSelection()
    }
    else if(isElement(last) && last.matches("table")) {
      while(last.isConnected && last.parentElement && !this.editor.schema.isContentValid(last.parentElement)) {
        const parent = last.parentElement
        $.selectElement(last)
        this.editor.features.manipulation.lift()
        if(last.parentElement === parent) break
      }
      const cell = last.querySelector<HTMLTableCellElement>("td, th")
      cell ? this.editor.features.table.selectCells(cell) : $.selectElement(last)
    }
    else if(isElement(last) && this.editor.schema.findValidContentTypes(last).includes("#text")) {
      $.move(last)
    }
    else if(nodes.length === 1 && isElement(last) && last.parentElement) {
      $.selectElement(last)
    }
    else if(last.parentNode) {
      $.move(last.parentNode, Array.from(last.parentNode.childNodes).indexOf(last as ChildNode) + 1)
    }
    if(isElement(last) && last.isConnected && (last.matches("table, svg, dialog") || isFormElementType(last.localName))) {
      this.editor.postSelectionPath(true)
    }
    this.close(false)
  }

  private close(restoreSelection=true) {
    this.commandGeneration++
    this.commandObserver?.disconnect()
    this.commandObserver = null
    this.menu.open = false
    if(restoreSelection && this.commandRange?.endContainer.isConnected) {
      $.move(this.commandRange.endContainer, this.commandRange.endOffset)
    }
    this.clearTriggerHighlight()
    this.commandRange = null
    this.commandBlock = null
    this.commandStartOffset = 0
    this.commandTriggerLength = 0
    this.commandTrigger = null
    this.emptyTextBlock = null
  }

  /** Resolves the command's logical start after normalize() has merged the
   * text node that originally contained the command trigger. */
  private commandStartPoint(): [Node, number] | null {
    const block = this.commandBlock
    if(!block?.isConnected) return null
    if(this.commandTrigger?.startContainer.isConnected) {
      return [this.commandTrigger.startContainer, this.commandTrigger.startOffset]
    }
    return this.pointAtTextOffset(block, this.commandStartOffset)
  }

  private pointAtTextOffset(block: Element, offset: number): [Node, number] | null {
    let remaining = offset
    const find = (node: Node): [Node, number] | null => {
      if(isText(node)) {
        if(remaining <= node.length) return [node, remaining]
        remaining -= node.length
        return null
      }
      for(const child of Array.from(node.childNodes)) {
        const point = find(child)
        if(point) return point
      }
      return null
    }
    return find(block) ?? [block, block.childNodes.length]
  }
}
