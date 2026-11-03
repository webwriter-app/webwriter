import {EditorFeature, type DocumentListenerMap} from "."
import {
  isDialogClosedBy,
  type DialogSelectionState,
} from "../dialog"
import {$, atomicEditingContainer, authoredClassValue, getContainer, isAppendixInteraction, isAtomicEditingElement, isCaretAtBoundary, isElement, isWidgetShadowInteraction, removeEditorMarker, textOffsetIn, textPointAtOffset} from "../utility"
import {popupContentForToggle, popupDisplayToggle, popupElementRole} from "../element-names"

const editingMarker = "◆dialog-editing"
const popupMarker = "◆popup-visible"
const dialogCommands = new Set(["show-modal", "close", "request-close"])
const editableAttributes = new Set(["id", "open", "closedby", "aria-label", "aria-labelledby", "title"])

/** Declarative dialog authoring. Closed dialogs are exposed for editing with
 * a collaboration-filtered marker; native modal/close commands remain
 * authored but do not execute until the document is previewed. */
export class DialogFeature extends EditorFeature {
  protected handlesFormControlInteractions = true
  private markedDialog: WeakRef<HTMLDialogElement> | null = null
  private markedPopup: WeakRef<Element> | null = null
  private popupReturn: {wrapper: WeakRef<Element>, offset: number} | null = null

  enable() {
    if(this.isEnabled) return
    super.enable()
    if(!this.editor.options.reader) document.body.classList.add("◆popup-editing")
    this.refresh()
  }

  disable() {
    if(!this.isEnabled) return
    this.clearEditingMarkers()
    removeEditorMarker(document.body, "◆popup-editing")
    super.disable()
  }

  /** Remove empty Popups and orphaned content, then keep one editable flow
   * child when a remaining popup's last content node is removed. */
  ensurePopupContent() {
    const selection = document.getSelection()
    const touches = (element: Element) => Boolean(selection?.anchorNode && element.contains(selection.anchorNode)
      || selection?.focusNode && element.contains(selection.focusNode))
    const hasToggle = (content: Element) => Array.from(document.body.querySelectorAll(".ww-popup > button[popovertarget]"))
      .some(toggle => !atomicEditingContainer(toggle, this.editor.schema) && popupContentForToggle(toggle) === content)
    const hasContent = (node: Node): boolean => node instanceof Text ? Boolean(node.data.trim())
      : node instanceof Element && (Array.from(node.childNodes).some(hasContent)
        || isAtomicEditingElement(node, this.editor.schema))
    const removeContent = (content: Element) => {
      const parent = content.parentNode
      const index = parent ? Array.from(parent.childNodes).indexOf(content) : 0
      const moveSelection = touches(content)
      removeEditorMarker(content, popupMarker)
      content.remove()
      if(moveSelection && parent?.isConnected) $.move(parent, index)
    }
    for(const toggle of document.body.querySelectorAll(".ww-popup > button[popovertarget]")) {
      const wrapper = toggle.parentElement!
      const atomic = atomicEditingContainer(toggle, this.editor.schema)
      if(popupElementRole(wrapper) !== "popup" || atomic && atomic !== toggle) continue
      const content = popupContentForToggle(toggle)
      const cell = toggle.closest("td, th")
      if(cell && cell.parentElement?.localName === "tr" && content?.parentElement === cell.parentElement) cell.append(content)
      if(Array.from(toggle.childNodes).some(hasContent)) continue
      const parent = wrapper.parentNode
      const index = parent ? Array.from(parent.childNodes).indexOf(wrapper) : 0
      const moveSelection = touches(toggle) || Boolean(content && touches(content))
      toggle.remove()
      if(content && !hasToggle(content)) removeContent(content)
      if(!wrapper.querySelector(":scope > button[popovertarget]")) wrapper.replaceWith(...Array.from(wrapper.childNodes))
      if(moveSelection && parent?.isConnected) $.move(parent, index)
    }
    for(const content of document.body.querySelectorAll(".ww-popup > [popover], .ww-popup-content[popover]")) {
      if(atomicEditingContainer(content, this.editor.schema)) continue
      if(!hasToggle(content)) removeContent(content)
    }
    for(const wrapper of document.body.querySelectorAll(".ww-popup")) {
      if(popupElementRole(wrapper) !== "popup" || atomicEditingContainer(wrapper, this.editor.schema)
        || wrapper.childNodes.length) continue
      const parent = wrapper.parentNode
      const index = parent ? Array.from(parent.childNodes).indexOf(wrapper) : 0
      const moveSelection = selection?.anchorNode === wrapper || selection?.focusNode === wrapper
      wrapper.remove()
      if(moveSelection && parent?.isConnected) $.move(parent, index)
    }
    for(const content of document.body.querySelectorAll(".ww-popup > [popover], .ww-popup-content[popover]")) {
      if(popupElementRole(content) !== "content" || atomicEditingContainer(content, this.editor.schema)) continue
      if(Array.from(content.childNodes).some(node => node instanceof Element
        || node instanceof Text && Boolean(node.data.trim()))) continue
      content.append(content.ownerDocument.createElement("p"))
    }
  }

  actions = {
    setDialogAttribute: ({name, value}: {
      type: "setDialogAttribute"
      name: string
      value: string | null
    }) => this.setDialogAttribute(name, value),
  } as const

  captureListeners: DocumentListenerMap = {
    keydown: event => {
      if(!["ArrowDown", "ArrowUp"].includes(event.key) || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
        || this.editor.options.reader || this.editor.isEditingLocked || isAppendixInteraction(event)
        || isWidgetShadowInteraction(event, this.editor.schema)) return
      const selection = document.getSelection()
      if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode) return
      const selected = this.editor.features.selection.captureSelectedElement ?? $.selectedElement
      const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement
      const content = (selected ?? anchor)?.closest("[popover]")
      if(event.key === "ArrowUp") {
        if(!content || popupElementRole(content) !== "content" || !content.isConnected
          || !document.body.contains(content)) return
        const first = content.firstElementChild ?? content
        const firstIndex = Array.from(content.childNodes).indexOf(first)
        const topGap = selection.isCollapsed && selection.anchorNode === content && firstIndex >= 0
          && selection.anchorOffset <= firstIndex && $.isGapSelection
        if(selected !== first && !topGap && (!selection.isCollapsed || !first.contains(selection.anchorNode)
          || !isCaretAtBoundary(first, "start"))) return
        const toggle = popupDisplayToggle(content)
        const wrapper = toggle?.closest(".ww-popup")
        if(!toggle || !wrapper || document.getElementById(content.id) !== content) return
        event.preventDefault()
        event.stopImmediatePropagation()
        const offset = this.popupReturn?.wrapper.deref() === wrapper ? this.popupReturn.offset : 0
        const point = textPointAtOffset(toggle, offset, [toggle, 0], "forward")
        const range = document.createRange()
        range.setStart(point[0], point[1])
        range.collapse(true)
        this.editor.features.selection.selectDropRange(range)
        this.popupReturn = null
        this.refresh()
        this.editor.postSelectionPath()
        return
      }
      if(content && popupElementRole(content) === "content" && content.isConnected && document.body.contains(content)) {
        const last = content.lastElementChild
        if(last && (selected === last || selection.isCollapsed && last.contains(selection.anchorNode)
          && isCaretAtBoundary(last, "end"))) {
          event.preventDefault()
          event.stopImmediatePropagation()
          $.selectGap(last)
          this.editor.features.selection.processSelection()
          this.refresh()
          this.editor.postSelectionPath()
          return
        }
      }
      const current = selected ?? anchor
      if(!current?.isConnected || !document.body.contains(current)) return
      const wrapper = popupElementRole(current) === "popup" ? current : current.closest(".ww-popup")
      if(!wrapper || popupElementRole(wrapper) !== "popup" || (!wrapper.contains(selection.focusNode)
        && selected !== wrapper) || current.closest("[popover]")) return
      const toggle = popupElementRole(current) === "toggle" ? current : current.closest("button[popovertarget]")
      const toggles = toggle ? [toggle] : Array.from(wrapper.querySelectorAll("button[popovertarget]"))
        .filter(button => popupElementRole(button) === "toggle")
      if(toggles.length !== 1 || popupElementRole(toggles[0]) !== "toggle") return
      const popup = popupContentForToggle(toggles[0])
      if(!popup?.isConnected || popupElementRole(popup) !== "content") return
      const offset = toggles[0].contains(selection.anchorNode)
        ? textOffsetIn(toggles[0], selection.anchorNode, selection.anchorOffset) ?? 0 : 0
      const firstText = (node: Node): Text | null => {
        if(node instanceof Text) return node
        if(node instanceof Element && node !== popup && (node.matches("[contenteditable='false'], [hidden], [inert]")
          || isAtomicEditingElement(node, this.editor.schema))) return null
        for(const child of Array.from(node.childNodes)) {
          const text = firstText(child)
          if(text) return text
        }
        return null
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      popup.classList.add(popupMarker)
      const first = popup.firstElementChild
      const text = firstText(first ?? popup)
      this.popupReturn = {wrapper: new WeakRef(wrapper), offset}
      if(first && !text && (first.matches("[contenteditable='false'], [hidden], [inert]")
        || isAtomicEditingElement(first, this.editor.schema))) this.editor.features.selection.selectElement(first)
      else {
        const range = document.createRange()
        range.setStart(text ?? first ?? popup, 0)
        range.collapse(true)
        this.editor.features.selection.selectDropRange(range)
      }
      this.refresh()
      this.editor.postSelectionPath()
    },
  }

  activeListeners: DocumentListenerMap = {
    selectionchange: () => queueMicrotask(() => this.refresh()),
    click: event => this.preventDialogCommand(event),
    cancel: event => {
      if(isElement(event.target) && event.target.matches("dialog")) event.preventDefault()
    },
  }

  /** Re-resolves the active dialog from the live DOM. No retained selection
   * endpoint or previously selected dialog is assumed to remain connected. */
  get activeDialog(): HTMLDialogElement | null {
    const captured = this.editor.features.selection.captureSelectedElement
    const selected = $.selectedElement
    const anchor = $.anchor
    const target = captured ?? selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(target) || !target.isConnected || !document.body.contains(target)) return null
    return (target.matches("dialog") ? target : target.closest("dialog")) as HTMLDialogElement | null
  }

  refresh() {
    this.refreshPopup()
    const active = this.activeDialog
    const previous = this.markedDialog?.deref()
    if(previous && previous !== active) this.removeEditingMarker(previous)
    document.querySelectorAll<HTMLDialogElement>(`dialog.${editingMarker}`).forEach(dialog => {
      if(dialog !== active) this.removeEditingMarker(dialog)
    })
    if(active) {
      active.classList.add("◆", editingMarker)
      this.markedDialog = new WeakRef(active)
    }
    else this.markedDialog = null
    return active
  }

  private refreshPopup() {
    if(this.editor.options.reader) return
    const anchor = $.anchor
    const target = this.editor.features.selection.captureSelectedElement ?? $.selectedElement
      ?? (anchor instanceof Element ? anchor : anchor?.parentElement)
    let popup: Element | null = null
    if(isElement(target) && target.isConnected && document.body.contains(target)) {
      popup = target.closest("[popover]")
      if(!popup && target.matches(".ww-popup")) {
        const toggle = popupDisplayToggle(target)
        popup = toggle && popupContentForToggle(toggle)
      }
      if(!popup) {
        const invoker = target.closest("button[popovertarget], input[popovertarget]")
        const candidate = invoker && popupContentForToggle(invoker)
        if(candidate?.hasAttribute("popover") && document.body.contains(candidate)) popup = candidate
      }
    }
    const previous = this.markedPopup?.deref()
    if(!popup || this.popupReturn && popupDisplayToggle(popup)?.closest(".ww-popup") !== this.popupReturn.wrapper.deref()) this.popupReturn = null
    if(previous && previous !== popup) removeEditorMarker(previous, popupMarker)
    document.querySelectorAll(`.${popupMarker}`).forEach(element => {
      if(element !== popup) removeEditorMarker(element, popupMarker)
    })
    if(popup) popup.classList.add(popupMarker)
    this.markedPopup = popup ? new WeakRef(popup) : null
  }

  getState(): DialogSelectionState | undefined {
    const dialog = this.refresh()
    if(!dialog) return
    const attributes = Object.fromEntries(Array.from(dialog.attributes).flatMap(attribute => {
      if(attribute.name !== "class") return [[attribute.name, attribute.value]]
      const authored = authoredClassValue(attribute.value)
      return authored ? [["class", authored]] : []
    }))
    const id = dialog.id
    const invokers = id ? Array.from(document.querySelectorAll<HTMLButtonElement>("button[commandfor]"))
      .filter(button => button.getAttribute("commandfor") === id) : []
    const closedBy = dialog.getAttribute("closedby")
    return {
      attributes,
      initiallyOpen: dialog.hasAttribute("open"),
      closedBy: isDialogClosedBy(closedBy) ? closedBy : "",
      openerCount: invokers.filter(button => button.getAttribute("command") === "show-modal").length,
      closeControlCount: invokers.filter(button => ["close", "request-close"].includes(button.getAttribute("command") ?? "")).length,
      hasDialogForm: Boolean(dialog.querySelector('form[method="dialog"]')),
    }
  }

  private setDialogAttribute(name: string, value: string | null) {
    const dialog = this.activeDialog
    if(!dialog || !editableAttributes.has(name)) {
      throw new TypeError(`Attribute '${name}' is not editable for the selected dialog`)
    }
    if(name === "open" && value !== null && value !== "") {
      throw new TypeError("The dialog open attribute is boolean")
    }
    if(name === "closedby" && value !== null && !isDialogClosedBy(value)) {
      throw new TypeError(`Unsupported dialog close behavior '${value}'`)
    }
    if(name === "id" && value !== null && (!value || /\s/.test(value))) {
      throw new TypeError("A dialog ID must be non-empty and contain no whitespace")
    }

    const oldId = dialog.id
    const oldIdIsUnique = Boolean(oldId) && Array.from(document.querySelectorAll("[id]"))
      .filter(element => element.id === oldId).length === 1
    value === null ? dialog.removeAttribute(name) : dialog.setAttribute(name, value)
    if(name === "id" && oldIdIsUnique) {
      document.querySelectorAll<HTMLButtonElement>("button[commandfor]").forEach(button => {
        if(button.getAttribute("commandfor") === oldId) {
          value === null ? button.removeAttribute("commandfor") : button.setAttribute("commandfor", value)
        }
      })
    }
    this.refresh()
    this.editor.postSelectionPath()
    return true
  }

  private preventDialogCommand(event: MouseEvent) {
    const invoker = isElement(event.target) ? event.target.closest("button[popovertarget], input[popovertarget]") : null
    const popupId = invoker?.getAttribute("popovertarget")
    const popup = popupId ? document.getElementById(popupId) : null
    if(!this.editor.options.reader && popup?.hasAttribute("popover") && document.body.contains(invoker)) event.preventDefault()
    if(!isElement(event.target)) return
    const button = event.target.closest<HTMLButtonElement>("button[commandfor][command]")
    const command = button?.getAttribute("command") ?? ""
    const targetId = button?.getAttribute("commandfor") ?? ""
    if(!button || !dialogCommands.has(command) || !targetId) return
    const target = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[id]"))
      .find(dialog => dialog.id === targetId)
    if(target) event.preventDefault()
  }

  private clearEditingMarkers() {
    this.popupReturn = null
    const popup = this.markedPopup?.deref()
    if(popup) removeEditorMarker(popup, popupMarker)
    this.markedPopup = null
    document.querySelectorAll(`.${popupMarker}`).forEach(element => removeEditorMarker(element, popupMarker))
    const marked = this.markedDialog?.deref()
    if(marked) this.removeEditingMarker(marked)
    this.markedDialog = null
    document.querySelectorAll<HTMLDialogElement>(`dialog.${editingMarker}`).forEach(dialog => {
      this.removeEditingMarker(dialog)
    })
  }

  private removeEditingMarker(dialog: HTMLDialogElement) {
    removeEditorMarker(dialog, editingMarker)
  }
}
