import type {CollaborationUser} from "../domdoc"
import {isElement} from "../utility"
import {EditorFeature} from "."

let collaborationFeatureSequence = 0

type CaretLayout = {
  clientId: number
  color: string
  name: string
  target: Element
  rect: DOMRect
}

function removeInternalClass(element: Element, className: string) {
  element.classList.remove(className)
  if(!Array.from(element.classList).some(name => name !== "◆" && name.startsWith("◆"))) {
    element.classList.remove("◆")
  }
  if(!element.classList.length) element.removeAttribute("class")
}

/** Awareness-backed active-user dots and virtual remote carets. */
export class CollaborationFeature extends EditorFeature {
  readonly #instanceId = ++collaborationFeatureSequence
  readonly #anchorClasses: {element: Element, className: string}[] = []
  readonly #removeAnchorRules: (() => void)[] = []

  readonly #handleAwarenessChange = () => this.renderPresence()
  readonly #handleSharedChange = () => this.renderPresence()
  readonly #handleLayoutChange = () => this.renderPresence()

  enable() {
    if(this.isEnabled) return
    super.enable()
    document.body.classList.add("◆", "◆presence-document-anchor")
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
    this.#clearCaretAnchors()
    this.editor.appendix.querySelector(".◆presence-users")?.remove()
    this.editor.appendix.querySelectorAll(".◆presence-caret").forEach(caret => caret.remove())
    removeInternalClass(document.body, "◆presence-document-anchor")
    super.disable()
  }

  get usersElement() {
    let users = this.editor.appendix.querySelector<HTMLElement>(".◆presence-users")
    if(!users) {
      users = document.createElement("div")
      users.classList.add("◆", "◆editor-only", "◆presence-users")
      users.setAttribute("part", "presence-users")
      users.setAttribute("aria-label", "Active collaborators")
      this.editor.addAppendix(users)
    }
    return users
  }

  renderPresence() {
    if(!this.isEnabled) return
    const states = Array.from(this.editor.doc.awareness.getStates())
      .filter(([clientId]) => clientId !== this.editor.doc.awareness.clientID)
      .sort(([a], [b]) => a - b)
    const users = this.usersElement
    const carets: CaretLayout[] = []

    users.replaceChildren(...states.map(([clientId, state]) => {
      const user = this.#user(clientId, state.user)
      const dot = document.createElement("span")
      dot.classList.add("◆", "◆editor-only", "◆presence-user")
      dot.setAttribute("part", "presence-user")
      dot.dataset.clientId = String(clientId)
      dot.title = user.name
      dot.style.setProperty("--presence-color", user.color)
      return dot
    }))

    this.editor.appendix.querySelectorAll(".◆presence-caret").forEach(caret => caret.remove())
    this.#clearCaretAnchors()

    for(const [clientId, state] of states) {
      if(clientId === this.editor.doc.awareness.clientID || !state.selection) continue
      const selection = this.editor.doc.domSelectionForClient(clientId)
      if(!selection) continue
      const point = {node: selection.focusNode, offset: selection.focusOffset}
      const target = isElement(point.node) ? point.node : point.node.parentElement
      if(!target || (target !== document.body && !document.body.contains(target))) continue
      const user = this.#user(clientId, state.user)
      carets.push({
        clientId,
        color: user.color,
        name: user.name,
        target,
        rect: this.#caretRect(point.node, point.offset, target),
      })
    }

    const grouped = new Map<Element, CaretLayout[]>()
    carets.forEach(caret => grouped.set(caret.target, [...grouped.get(caret.target) ?? [], caret]))
    Array.from(grouped).forEach(([target, targetCarets], groupIndex) => {
      const className = `◆presence-caret-anchor-${this.#instanceId}-${groupIndex}`
      const anchorNames = targetCarets.map(caret => `--presence-caret-${this.#instanceId}-${caret.clientId}`)
      target.classList.add("◆", className)
      this.#anchorClasses.push({element: target, className})
      this.#removeAnchorRules.push(this.editor.addMainDOMStyleRule(
        `.${className} { anchor-name: ${anchorNames.join(", ")}; }`,
      ))

      targetCarets.forEach((caret, caretIndex) => {
        const targetRect = target.getBoundingClientRect()
        const anchorName = anchorNames[caretIndex]
        const element = document.createElement("div")
        element.classList.add("◆", "◆editor-only", "◆presence-caret")
        element.setAttribute("part", "presence-caret")
        element.setAttribute("aria-hidden", "true")
        element.dataset.clientId = String(caret.clientId)
        element.title = caret.name
        element.style.setProperty("--presence-color", caret.color)
        element.style.setProperty("--presence-caret-x", `${caret.rect.left - targetRect.left}px`)
        element.style.setProperty("--presence-caret-y", `${caret.rect.top - targetRect.top}px`)
        element.style.setProperty("--presence-caret-height", `${Math.max(caret.rect.height, 16)}px`)
        element.style.setProperty("position-anchor", anchorName)
        // Fixed coordinates are a fallback for browsers without CSS anchor
        // positioning; the stylesheet overrides them when anchors are usable.
        element.style.left = `${caret.rect.left}px`
        element.style.top = `${caret.rect.top}px`

        const label = document.createElement("span")
        label.classList.add("◆", "◆editor-only", "◆presence-caret-label")
        label.setAttribute("part", "presence-caret-label")
        label.textContent = caret.name
        element.append(label)
        this.editor.addAppendix(element)
      })
    })
  }

  #clearCaretAnchors() {
    this.#anchorClasses.splice(0).forEach(({element, className}) => removeInternalClass(element, className))
    this.#removeAnchorRules.splice(0).forEach(removeRule => removeRule())
  }

  #user(clientId: number, value: unknown) {
    const user = value && typeof value === "object" ? value as CollaborationUser : {}
    const color = typeof user.color === "string" ? user.color.trim() : ""
    const colorProbe = document.createElement("span")
    colorProbe.style.color = color
    return {
      name: typeof user.name === "string" && user.name.trim() ? user.name : `User ${clientId.toString(36).toUpperCase()}`,
      color: colorProbe.style.color ? color : "#64748b",
    }
  }

  #caretRect(node: Node, offset: number, target: Element) {
    const range = document.createRange()
    const maxOffset = node instanceof Text ? node.length : node.childNodes.length
    const clampedOffset = Math.max(0, Math.min(offset, maxOffset))
    range.setStart(node, clampedOffset)
    range.collapse(true)
    let rect = range.getBoundingClientRect()
    if(rect.height || rect.width) return rect

    if(node instanceof Text && node.length) {
      const character = document.createRange()
      const start = clampedOffset === node.length ? Math.max(0, clampedOffset - 1) : clampedOffset
      const end = Math.min(node.length, start + 1)
      character.setStart(node, start)
      character.setEnd(node, end)
      const characterRect = character.getBoundingClientRect()
      const left = clampedOffset === node.length ? characterRect.right : characterRect.left
      rect = new DOMRect(left, characterRect.top, 0, characterRect.height)
      if(rect.height) return rect
    }

    const targetRect = target.getBoundingClientRect()
    return new DOMRect(targetRect.left, targetRect.top, 0, targetRect.height || 16)
  }
}
