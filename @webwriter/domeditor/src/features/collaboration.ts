import type {CollaborationUser} from "../domdoc"
import {isElement} from "../utility"
import {EditorFeature} from "."

type CaretLayout = {
  clientId: number
  color: string
  name: string
  initials: string
  elementSelection?: Element
  gapPlacement?: "before" | "after"
  rect: DOMRect
}

function firstInitial(value: string) {
  return Array.from(value).find(character => /[\p{L}\p{N}]/u.test(character)) ?? ""
}

/** Returns exactly two readable initials for a presence label. */
function userInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words.length > 1
    ? words.slice(0, 2).map(firstInitial).join("")
    : Array.from(words[0] ?? "").map(firstInitial).join("").slice(0, 2)
  const fallback = firstInitial(name) || "?"
  const uppercase = Array.from((initials || fallback).toLocaleUpperCase()).slice(0, 2).join("")
  const padding = Array.from(fallback.toLocaleUpperCase())[0] || "?"
  return uppercase.padEnd(2, padding).slice(0, 2)
}

/** Returns the first and last line boxes that can supply the native caret's
 * height when a collapsed range at an element boundary has no rectangle. */
function textNodes(element: Element, direction: "first" | "last") {
  const nodes: Text[] = []
  const visit = (node: Node) => {
    if(node instanceof Text) {
      if(node.length) nodes.push(node)
      return
    }
    Array.from(node.childNodes).forEach(visit)
  }
  visit(element)
  return direction === "first" ? nodes[0] : nodes.at(-1)
}

/** Awareness-backed virtual remote carets. The caret is positioned in the
 * editor appendix using the viewport rectangle returned by the same DOM Range
 * APIs the browser uses for the native caret. */
export class CollaborationFeature extends EditorFeature {
  readonly #handleAwarenessChange = () => this.renderPresence()
  readonly #handleSharedChange = () => this.renderPresence()
  readonly #handleLayoutChange = () => this.renderPresence()

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.editor.doc.awareness.on("change", this.#handleAwarenessChange)
    this.editor.doc.doc.on("afterTransaction", this.#handleSharedChange)
    window.addEventListener("resize", this.#handleLayoutChange)
    document.addEventListener("scroll", this.#handleLayoutChange, true)
    this.renderPresence()
  }

  disable() {
    if(!this.isEnabled) return
    this.editor.doc.awareness.off("change", this.#handleAwarenessChange)
    this.editor.doc.doc.off("afterTransaction", this.#handleSharedChange)
    window.removeEventListener("resize", this.#handleLayoutChange)
    document.removeEventListener("scroll", this.#handleLayoutChange, true)
    this.editor.appendix.querySelectorAll(".◆presence-caret").forEach(caret => caret.remove())
    super.disable()
  }

  renderPresence() {
    if(!this.isEnabled) return
    const states = Array.from(this.editor.doc.awareness.getStates())
      .filter(([clientId]) => clientId !== this.editor.doc.awareness.clientID)
      .sort(([a], [b]) => a - b)
    const carets: CaretLayout[] = []

    this.editor.appendix.querySelectorAll(".◆presence-caret").forEach(caret => caret.remove())

    for(const [clientId, state] of states) {
      if(!state.selection) continue
      const selection = this.editor.doc.domSelectionForClient(clientId)
      if(!selection) continue
      const point = {node: selection.focusNode, offset: selection.focusOffset}
      if(!isElement(point.node) && !(point.node instanceof Text)) continue
      if(point.node !== document.body && !document.body.contains(point.node)) continue
      const user = this.#user(clientId, state.user)
      const elementSelection = selection.anchorNode === selection.focusNode &&
        isElement(selection.anchorNode) &&
        Math.abs(selection.anchorOffset - selection.focusOffset) === 1
        ? selection.anchorNode.childNodes.item(Math.min(selection.anchorOffset, selection.focusOffset))
        : undefined
      const selectedElement = elementSelection instanceof Element ? elementSelection : undefined
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
          : this.#caretRect(point.node, point.offset),
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
      element.style.setProperty("opacity", "0.8")
      if(isElementSelection) {
        element.style.setProperty("width", `${caret.rect.width}px`)
        element.style.setProperty("height", `${caret.rect.height}px`)
      }
      else if(isGapCaret) {
        element.style.setProperty("color", caret.color)
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
    return this.#caretRect(node, offset)
  }

  #caretRect(node: Node, offset: number) {
    const maxOffset = node instanceof Text ? node.length : node.childNodes.length
    const clampedOffset = Math.max(0, Math.min(offset, maxOffset))
    const range = document.createRange()
    range.setStart(node, clampedOffset)
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    if(rect.height > 0) return rect

    if(node instanceof Text && node.length) {
      const character = document.createRange()
      const start = clampedOffset === node.length ? Math.max(0, clampedOffset - 1) : clampedOffset
      const end = Math.min(node.length, start + 1)
      character.setStart(node, start)
      character.setEnd(node, end)
      const characterRect = character.getBoundingClientRect()
      if(characterRect.height > 0) {
        const direction = getComputedStyle(node.parentElement ?? document.body).direction
        const left = clampedOffset === node.length
          ? direction === "rtl" ? characterRect.left : characterRect.right
          : direction === "rtl" ? characterRect.right : characterRect.left
        return new DOMRect(left, characterRect.top, 0, characterRect.height)
      }
    }

    if(isElement(node)) {
      return this.#elementBoundaryCaret(node, clampedOffset)
    }

    const target = node.parentElement ?? document.body
    const targetRect = target.getBoundingClientRect()
    return new DOMRect(targetRect.left, targetRect.top, 0, this.#lineHeight(target))
  }

  #elementBoundaryCaret(container: Element, offset: number) {
    const children = Array.from(container.childNodes)
    const next = children.slice(offset).find(child => this.#hasRect(child))
    const previous = children.slice(0, offset).reverse().find(child => this.#hasRect(child))
    const adjacent = next ?? previous

    if(adjacent) {
      const useNext = Boolean(next)
      const rect = this.#nodeRect(adjacent, useNext ? "first" : "last")
      const isBlock = adjacent instanceof Element && this.#isBlockLike(adjacent)
      const left = isBlock ? rect.left : useNext ? rect.left : rect.right
      const top = isBlock ? useNext ? rect.top : rect.bottom : rect.top
      const height = this.#lineHeight(
        adjacent instanceof Element ? adjacent : container,
        useNext ? "first" : "last",
      )
      return new DOMRect(left, top, 0, height)
    }

    const rect = container.getBoundingClientRect()
    const computed = getComputedStyle(container)
    const left = rect.left + parseFloat(computed.borderLeftWidth || "0") + parseFloat(computed.paddingLeft || "0")
    const top = rect.top + parseFloat(computed.borderTopWidth || "0") + parseFloat(computed.paddingTop || "0")
    return new DOMRect(left, top, 0, this.#lineHeight(container))
  }

  #hasRect(node: Node) {
    if(node instanceof Text && !node.textContent?.trim()) return false
    const rect = this.#nodeRect(node)
    return rect.width > 0 || rect.height > 0
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

  #isBlockLike(element: Element) {
    const display = getComputedStyle(element).display
    return display === "block" || display === "flow-root" || display === "list-item" ||
      display === "table" || display === "table-row" || display === "table-row-group" ||
      display === "flex" || display === "grid"
  }

  #lineHeight(element: Element, direction: "first" | "last" = "first") {
    const text = textNodes(element, direction)
    if(text) {
      const range = document.createRange()
      const offset = direction === "first" ? 0 : text.length
      range.setStart(text, offset)
      range.collapse(true)
      const rect = range.getBoundingClientRect()
      if(rect.height > 0) return rect.height
    }

    const rect = element.getBoundingClientRect()
    const computed = getComputedStyle(element)
    const lineHeight = parseFloat(computed.lineHeight)
    if(Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight
    const fontSize = parseFloat(computed.fontSize)
    return Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : Math.max(rect.height, 1)
  }
}
