import { EditorFeature } from "."
import { SlashMenu, type SlashMenuItem } from "../components/slash-menu"
import { $, getContainer, isElement, isText, modifierKeyDown } from "../utility"

type SlashAddButton = HTMLButtonElement & {slashBlock?: Element}

/** Element insertion through a slash-triggered menu. */
export class SlashFeature extends EditorFeature {
  /** The command range starts before the slash and grows as the user types
   * the search text in the editable document. */
  private commandRange: Range | null = null
  private commandBlock: Element | null = null
  private commandStartOffset = 0
  private emptyTextBlock: Element | null = null
  private commandObserver = new MutationObserver(() => this.updateQuery())
  private emptyBlockObserver = new MutationObserver(() => this.updateEmptyTextBlockButton())
  private emptyTextBlockButton: SlashAddButton | null = null

  enable() {
    super.enable()
    this.createEmptyTextBlockButton()
    this.updateEmptyTextBlockButton()
    this.emptyBlockObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
      characterData: true,
      childList: true,
      subtree: true,
    })
  }

  disable() {
    this.emptyBlockObserver.disconnect()
    super.disable()
  }

  constructor(editor: EditorFeature["editor"]) {
    super(editor)
    this.menu.addEventListener("slash-menu-select", ev => this.insert((ev as CustomEvent<SlashMenuItem>).detail))
    this.menu.addEventListener("slash-menu-close", () => this.close())
  }

  get menu() {
    let menu = this.editor.appendix.querySelector("domeditor-slash-menu") as SlashMenu | null
    if(!menu) {
      // Construct directly as well as registering the tag: happy-dom does not
      // upgrade a custom element created through document.createElement().
      menu = new SlashMenu()
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
          this.menu.selectActive()
          return
        }
        if(ev.key === "Enter") {
          if(!this.menu.activeItem) {
            // With no matching option, dismiss the picker and let the editor
            // process Enter as it normally would.
            this.close()
            return
          }
          ev.preventDefault()
          ev.stopImmediatePropagation()
          this.close()
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
      }
      if(ev.defaultPrevented || ev.key !== "/" || ev.altKey || modifierKeyDown(ev)) return
      const selection = document.getSelection()
      if(!selection?.rangeCount || !selection.anchorNode || this.hasContentDirectlyAfterCaret()) return

      ev.preventDefault()
      this.openSlash()
    },
    input: () => this.updateQuery(),
    keyup: () => this.updateQuery(),
  }

  /** Opens the slash menu at the current caret and inserts its trigger. */
  private openSlash() {
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
    const slash = document.createTextNode("/")
    range.insertNode(slash)
    $.move(slash, 1)

    this.commandRange = document.createRange()
    this.commandRange.setStart(slash, 0)
    this.commandRange.setEnd(slash, 1)
    const rect = this.commandRange.getBoundingClientRect()
    this.menu.showAt(rect.left, rect.bottom + 6)
    this.commandObserver.observe(document.body, {characterData: true, childList: true, subtree: true})
  }

  /** Syncs the picker with the text following its slash trigger. Typing stays
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
    if(!text.startsWith("/")) {
      this.close(false)
      return
    }
    this.commandRange = range
    this.menu.query = text.slice(1)
    const rect = range.getBoundingClientRect()
    this.menu.setPosition(rect.left, rect.bottom + 6)
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
    if(block === document.body || !this.editor.schema.isBlock(block)) return false
    return !Array.from(block.childNodes).some(node => {
      if(isElement(node) && node.matches(".◆editor-only")) return false
      return !isText(node) || Boolean(node.data)
    })
  }

  /** Keeps the clickable slash affordance in sync with the selected empty block. */
  private updateEmptyTextBlockButton() {
    const selected = document.querySelector(".◆empty-selected")
    this.emptyTextBlockButton!.slashBlock = selected && this.isEmptyTextBlock(selected)? selected: undefined
  }

  private createEmptyTextBlockButton() {
    const existing = this.editor.appendix.querySelector<SlashAddButton>(".◆slash-add")
    if(existing) {
      this.emptyTextBlockButton = existing
      return
    }

    const button = document.createElement("button") as SlashAddButton
    button.classList.add("◆", "◆editor-only", "◆slash-add")
    button.type = "button"
    button.contentEditable = "false"
    button.setAttribute("aria-label", "Insert element")
    button.title = "Insert element"
    button.setAttribute("part", "slash-add")
    button.addEventListener("pointerdown", ev => {
      ev.preventDefault()
      ev.stopPropagation()
    })
    button.addEventListener("click", ev => {
      ev.preventDefault()
      ev.stopPropagation()
      const block = button.slashBlock
      if(!block || !this.isEmptyTextBlock(block)) return
      $.move(block)
      this.openSlash()
    })
    this.editor.appendix.append(button)
    this.emptyTextBlockButton = button
  }

  private insert(item: SlashMenuItem) {
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
    const replacement = this.emptyTextBlock?.isConnected && !this.emptyTextBlock.textContent && this.emptyTextBlock
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
   * text node that originally contained the slash. */
  private commandStartPoint(): [Node, number] | null {
    const block = this.commandBlock
    if(!block?.isConnected) return null
    let remaining = this.commandStartOffset
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
