import { EditorFeature } from "."
import { InsertionMenu, type InsertionMenuItem } from "../components/insertion-menu"
import { $, getContainer, isElement, isText, modifierKeyDown } from "../utility"

type InsertionAddButton = HTMLButtonElement & {insertionBlock?: Element}

/** Element insertion through the editor's `++` command menu. */
export class InsertionFeature extends EditorFeature {
  /** The command range starts where `++` was typed and grows as the user
   * types the search text in the editable document. */
  private commandRange: Range | null = null
  private commandBlock: Element | null = null
  private commandStartOffset = 0
  private emptyTextBlock: Element | null = null
  private commandObserver = new MutationObserver(() => this.updateQuery())
  private emptyBlockObserver = new MutationObserver(() => this.updateEmptyTextBlockButton())
  private emptyTextBlockButton: InsertionAddButton | null = null

  enable() {
    super.enable()
    this.createEmptyTextBlockButton()
    this.updateEmptyTextBlockButton()
    queueMicrotask(() => this.updateEmptyTextBlockButton())
    const body = document.body
    if(body) {
      this.emptyBlockObserver.observe(body, {
        attributes: true,
        attributeFilter: ["class"],
        characterData: true,
        childList: true,
        subtree: true,
      })
    }
  }

  disable() {
    this.emptyBlockObserver.disconnect()
    super.disable()
  }

  constructor(editor: EditorFeature["editor"]) {
    super(editor)
    this.menu.addEventListener("insertion-menu-select", ev => this.insert((ev as CustomEvent<InsertionMenuItem>).detail))
    this.menu.addEventListener("insertion-menu-close", () => this.close())
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
    selectionchange: () => queueMicrotask(() => this.updateEmptyTextBlockButton()),
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
        if(ev.key === "Enter") {
          ev.preventDefault()
          ev.stopImmediatePropagation()
          if(this.menu.activeItem) this.menu.selectActive()
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

      if(this.consumeTypedTrigger(1)) {
        ev.preventDefault()
        ev.stopImmediatePropagation()
      }
    },
    input: () => {
      if(!this.menu.open) this.consumeTypedTrigger(2)
      this.updateQuery()
    },
    keyup: () => this.updateQuery(),
  }

  /** Opens the command menu at the current caret without inserting a visible
   * trigger. */
  private openMenu() {
    this.editor.features.manipulation.ensureTextBlock()
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode) return

    const range = selection.getRangeAt(0)
    this.commandBlock = this.closestBlock(range.startContainer)
    const blockStart = document.createRange()
    blockStart.selectNodeContents(this.commandBlock)
    blockStart.setEnd(range.startContainer, range.startOffset)
    this.commandStartOffset = blockStart.toString().length
    this.emptyTextBlock = this.findEmptyTextBlock(range.startContainer)
    range.deleteContents()
    range.collapse(true)
    $.move(range.startContainer, range.startOffset)

    this.commandRange = document.createRange()
    this.commandRange.setStart(range.startContainer, range.startOffset)
    this.commandRange.collapse(true)
    const rect = this.commandPositionRect(this.commandRange)
    this.menu.showAt(rect.left, rect.bottom + 6)
    this.commandObserver.observe(document.body, {characterData: true, childList: true, subtree: true})
  }

  /** Syncs the picker with the text following its command trigger. Typing stays
   * in the document, so the regular editor caret remains visible and usable. */
  private updateQuery() {
    const selection = document.getSelection()
    const start = this.commandRange
    if(!this.menu.open || !start || !selection?.isCollapsed || !selection.anchorNode) return
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
    this.commandRange = range
    this.menu.query = text
    const rect = this.commandPositionRect(range)
    this.menu.setPosition(rect.left, rect.bottom + 6)
  }

  /** Empty blocks have no rendered caret box yet, so a collapsed range can
   * report the document origin. Anchor the initial picker to the block in
   * that case; once the user types a query, the range follows the caret. */
  private commandPositionRect(range: Range) {
    if(this.emptyTextBlock?.isConnected && this.isEmptyTextBlock(this.emptyTextBlock)) {
      return this.emptyTextBlock.getBoundingClientRect()
    }
    return range.getBoundingClientRect()
  }

  /** Consumes a just-typed command trigger and opens the menu. With a keydown
   * event the second `+` has not been inserted yet, so only the preceding
   * plus is consumed. An input event can consume both pluses at once, which
   * also supports pasted or programmatically inserted `++`. */
  private consumeTypedTrigger(length: 1 | 2) {
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
    const trigger = "+".repeat(length)
    if(!text.endsWith(trigger)) return false

    const start = this.pointAtTextOffset(block, text.length - length)
    if(!start) return false
    const triggerRange = document.createRange()
    try {
      triggerRange.setStart(...start)
      triggerRange.setEnd(selection.anchorNode, selection.anchorOffset)
    }
    catch {
      return false
    }
    triggerRange.deleteContents()
    $.move(triggerRange.startContainer, triggerRange.startOffset)
    this.openMenu()
    return true
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
    let element = getContainer(node)
    while(element !== document.body && !this.editor.schema.isBlock(element)) element = element.parentElement ?? document.body
    return element
  }

  private findEmptyTextBlock(node: Node) {
    const block = this.closestBlock(node)
    return this.isEmptyTextBlock(block)? block: null
  }

  private isEmptyTextBlock(block: Element) {
    if(block === document.body) return block.childNodes.length === 0
    if(!this.editor.schema.isBlock(block)) return false
    return !Array.from(block.childNodes).some(node => {
      if(isElement(node) && node.matches(".◆editor-only")) return false
      return !isText(node) || Boolean(node.data)
    })
  }

  /** Keeps the clickable insertion affordance in sync with the selected empty block. */
  private updateEmptyTextBlockButton() {
    const selected = document.querySelector(".◆empty-selected")
    this.emptyTextBlockButton!.insertionBlock = selected && this.isEmptyTextBlock(selected)? selected: undefined
  }

  private createEmptyTextBlockButton() {
    const existing = this.editor.appendix.querySelector<InsertionAddButton>(".◆insertion-add")
    if(existing) {
      this.emptyTextBlockButton = existing
      return
    }

    const button = document.createElement("button") as InsertionAddButton
    button.classList.add("◆", "◆editor-only", "◆insertion-add")
    button.type = "button"
    button.contentEditable = "false"
    button.setAttribute("aria-label", "Insert element")
    button.title = "Insert element"
    button.setAttribute("part", "insertion-add")
    button.addEventListener("pointerdown", ev => {
      ev.preventDefault()
      ev.stopPropagation()
    })
    button.addEventListener("click", ev => {
      ev.preventDefault()
      ev.stopPropagation()
      const block = button.insertionBlock
      if(!block || !this.isEmptyTextBlock(block)) return
      $.move(block)
      this.openMenu()
    })
    this.editor.appendix.append(button)
    this.emptyTextBlockButton = button
  }

  private insert(item: InsertionMenuItem) {
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
    const element = this.editor.schema.create(item.tag) as Element
    const replacement = this.emptyTextBlock?.isConnected && this.emptyTextBlock !== document.body && !this.emptyTextBlock.textContent && this.emptyTextBlock
    if(replacement) {
      replacement.replaceWith(element)
    }
    else {
      range.insertNode(element)
    }
    if(this.editor.schema.findValidContentTypes(element).includes("#text")) {
      $.move(element)
    }
    else if(element.parentElement) {
      $.selectElement(element)
    }
    this.close(false)
  }

  private close(restoreSelection=true) {
    this.commandObserver.disconnect()
    this.menu.open = false
    if(restoreSelection && this.commandRange?.endContainer.isConnected) {
      $.move(this.commandRange.endContainer, this.commandRange.endOffset)
    }
    this.commandRange = null
    this.commandBlock = null
    this.commandStartOffset = 0
    this.emptyTextBlock = null
  }

  /** Resolves the command's logical start after normalize() has merged the
   * text node that originally contained the command trigger. */
  private commandStartPoint(): [Node, number] | null {
    const block = this.commandBlock
    if(!block?.isConnected) return null
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
