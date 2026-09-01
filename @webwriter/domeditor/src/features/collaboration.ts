import type {CollaborationUser} from "../domdoc"
import type {PresenceUser} from "../editor-bridge"
import {caretRect, isElement} from "../utility"
import {userInitials} from "../user-identity"
import {EditorFeature} from "."
import {isMarkElement} from "../marks"

type CaretLayout = {
  clientId: number
  color: string
  name: string
  initials: string
  elementSelection?: Element
  gapPlacement?: "before" | "after"
  rect: DOMRect
}

/** Awareness-backed virtual remote carets. The caret is positioned in the
 * editor appendix using the viewport rectangle returned by the same DOM Range
 * APIs the browser uses for the native caret. */
export class CollaborationFeature extends EditorFeature {
  readonly #handleAwarenessChange = () => this.renderPresence(true)
  readonly #handleSharedChange = () => this.renderPresence()
  readonly #handleLayoutChange = () => this.renderPresence()

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.editor.doc.awareness.on("change", this.#handleAwarenessChange)
    this.editor.doc.doc.on("afterTransaction", this.#handleSharedChange)
    window.addEventListener("resize", this.#handleLayoutChange)
    document.addEventListener("scroll", this.#handleLayoutChange, true)
    this.renderPresence(true)
  }

  disable() {
    if(!this.isEnabled) return
    this.editor.doc.awareness.off("change", this.#handleAwarenessChange)
    this.editor.doc.doc.off("afterTransaction", this.#handleSharedChange)
    window.removeEventListener("resize", this.#handleLayoutChange)
    document.removeEventListener("scroll", this.#handleLayoutChange, true)
    this.editor.postPresence([])
    this.editor.appendix.querySelectorAll(".◆presence-caret").forEach(caret => caret.remove())
    super.disable()
  }

  renderPresence(notify = false) {
    if(!this.isEnabled) return
    const states = Array.from(this.editor.doc.awareness.getStates())
      .filter(([clientId]) => clientId !== this.editor.doc.awareness.clientID)
      .sort(([a], [b]) => a - b)
    const users = states.map(([clientId, state]) => ({
      clientId,
      ...this.#user(clientId, state.user),
    } satisfies PresenceUser))
    const usersByClientId = new Map(users.map(user => [user.clientId, user]))
    if(notify) this.editor.postPresence(users)
    const carets: CaretLayout[] = []

    this.editor.appendix.querySelectorAll(".◆presence-caret").forEach(caret => caret.remove())

    for(const [clientId, state] of states) {
      if(!state.selection) continue
      const selection = this.editor.doc.domSelectionForClient(clientId)
      if(!selection) continue
      const point = {node: selection.focusNode, offset: selection.focusOffset}
      if(!isElement(point.node) && !(point.node instanceof Text)) continue
      if(point.node !== document.body && !document.body.contains(point.node)) continue
      const user = usersByClientId.get(clientId)!
      const elementSelection = selection.anchorNode === selection.focusNode &&
        isElement(selection.anchorNode) &&
        Math.abs(selection.anchorOffset - selection.focusOffset) === 1
        ? selection.anchorNode.childNodes.item(Math.min(selection.anchorOffset, selection.focusOffset))
        : undefined
      const selectedElement = elementSelection instanceof Element && !isMarkElement(elementSelection)
        ? elementSelection
        : undefined
      const gapPlacement = !selectedElement && selection.anchorNode === selection.focusNode &&
        selection.anchorOffset === selection.focusOffset
        ? this.#gapPlacement(point.node, point.offset)
        : undefined
      carets.push({
        clientId,
        color: user.color,
        name: user.name,
        initials: user.initials,
        elementSelection: selectedElement,
        gapPlacement,
        rect: selectedElement
          ? selectedElement.getBoundingClientRect()
          : gapPlacement
          ? this.#gapRect(point.node, point.offset, gapPlacement)
          : caretRect(point.node, point.offset),
      })
    }

    carets.forEach(caret => {
      const element = document.createElement("div")
      const isElementSelection = caret.elementSelection !== undefined
      const isGapCaret = caret.gapPlacement !== undefined
      element.classList.add(
        "◆",
        "◆editor-only",
        "◆presence-caret",
        ...(isElementSelection ? ["◆presence-element-selection"] : []),
        ...(isGapCaret ? ["◆presence-gap-caret"] : []),
      )
      element.setAttribute(
        "part",
        isElementSelection
          ? "presence-element-selection"
          : isGapCaret ? "gap-caret presence-gap-caret" : "presence-caret",
      )
      element.setAttribute("aria-hidden", "true")
      element.dataset.clientId = String(caret.clientId)
      element.title = caret.name
      element.style.setProperty("--presence-color", caret.color)
      if(isElementSelection) {
        element.style.setProperty("width", `${caret.rect.width}px`)
        element.style.setProperty("height", `${caret.rect.height}px`)
      }
      else if(isGapCaret) {
        element.style.setProperty("--presence-gap-caret-size", getComputedStyle(document.body).fontSize || "16px")
        element.style.setProperty("position-anchor", "auto")
      }
      else {
        element.style.setProperty("--presence-caret-height", `${caret.rect.height}px`)
      }
      // Range rectangles are viewport coordinates, so fixed positioning keeps
      // the virtual caret exactly over the browser's native caret even when
      // the editor body has a margin, is scrolled, or is transformed.
      element.style.left = `${caret.rect.left}px`
      element.style.top = `${caret.rect.top}px`

      const label = document.createElement("span")
      label.classList.add("◆", "◆editor-only", "◆presence-caret-label")
      label.setAttribute(
        "part",
        `presence-caret-label${isElementSelection ? " presence-element-selection-label" : isGapCaret ? " presence-gap-caret-label" : ""}`,
      )
      label.textContent = caret.initials
      element.append(label)
      this.editor.addAppendix(element)
    })
  }

  #user(clientId: number, value: unknown) {
    const user = value && typeof value === "object" ? value as CollaborationUser : {}
    const color = typeof user.color === "string" ? user.color.trim() : ""
    const colorProbe = document.createElement("span")
    colorProbe.style.color = color
    const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : `User ${clientId.toString(36).toUpperCase()}`
    return {
      name,
      initials: userInitials(name),
      color: colorProbe.style.color ? color : "#64748b",
    }
  }

  #gapPlacement(node: Node, offset: number) {
    if(!isElement(node)) return undefined
    const children = Array.from(node.childNodes)
    const isEmptySelection = children.length === 0 ||
      children.length === 1 && children[0] instanceof Text && !children[0].textContent && offset === 0
    if(isEmptySelection) return undefined

    const firstBodyElement = document.body.firstElementChild
    const firstBodyElementIndex = firstBodyElement
      ? Array.from(document.body.childNodes).indexOf(firstBodyElement)
      : -1
    const isBodyBoundaryBeforeFirstElement = node === document.body &&
      firstBodyElementIndex >= 0 &&
      offset <= firstBodyElementIndex &&
      children.slice(offset, firstBodyElementIndex).every(child => child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim())
    if(!children.some(child => child instanceof Text) || isBodyBoundaryBeforeFirstElement) {
      return offset === 0 || isBodyBoundaryBeforeFirstElement ? "before" : "after"
    }
    return undefined
  }

  #gapAnchor(node: Element, offset: number, placement: "before" | "after") {
    const firstBodyElement = document.body.firstElementChild
    const firstBodyElementIndex = firstBodyElement
      ? Array.from(document.body.childNodes).indexOf(firstBodyElement)
      : -1
    const isBodyBoundaryBeforeFirstElement = node === document.body &&
      firstBodyElementIndex >= 0 &&
      offset <= firstBodyElementIndex &&
      Array.from(node.childNodes).slice(offset, firstBodyElementIndex)
        .every(child => child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim())
    if(isBodyBoundaryBeforeFirstElement) return firstBodyElement

    const children = Array.from(node.childNodes)
    const candidates = placement === "before"
      ? children.slice(offset)
      : children.slice(0, offset).reverse()
    return candidates.find(child => isElement(child)) as Element | undefined
  }

  #gapRect(node: Node, offset: number, placement: "before" | "after") {
    if(isElement(node)) {
      const anchor = this.#gapAnchor(node, offset, placement)
      if(anchor) {
        const rect = this.#nodeRect(anchor, placement === "before" ? "first" : "last")
        return new DOMRect(rect.left, placement === "before" ? rect.top : rect.bottom, 0, 0)
      }
    }
    return caretRect(node, offset)
  }

  #nodeRect(node: Node, edge: "first" | "last" = "first") {
    if(isElement(node)) {
      const rects = Array.from(node.getClientRects())
      return edge === "last" ? rects.at(-1) ?? node.getBoundingClientRect() : rects[0] ?? node.getBoundingClientRect()
    }
    const range = document.createRange()
    range.selectNode(node)
    const rects = Array.from(range.getClientRects())
    return edge === "last" ? rects.at(-1) ?? range.getBoundingClientRect() : rects[0] ?? range.getBoundingClientRect()
  }

}
