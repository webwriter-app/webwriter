import {DOMEditor} from "../src/domeditor-core"
import type {WidgetSchemaDefinition} from "../src/schema"
import {hasStandardMarkShortcut, primaryMarkOptions} from "../src/marks"
import {isFormControlInteraction, modifierKeyDown} from "../src/utility"
import type {WidgetLookup} from "../src/editor-artifacts"

// The editor uses UUIDs for in-document commands. Opaque preview frames can
// generate random bytes even when their origin does not expose randomUUID.
if(typeof crypto.randomUUID !== "function") {
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}

/** The live preview uses the same in-frame editing engine as distributable documents. */
export function mount(preview: HTMLElement, widgetScope?: WidgetLookup) {
  const document = preview.ownerDocument
  const originalEditable = preview.getAttribute("contenteditable")
  const bodyMinHeight = document.body.style.minHeight
  if(!widgetScope) preview.contentEditable = "true"
  // Unlike the main editor frame, a preview reports its intrinsic height.
  document.body.style.minHeight = "0"

  // A preview can discover the light DOM rendered through an open widget slot.
  // Package-specific content expressions stay in the package manifest.
  const widgets = new Map<string, WidgetSchemaDefinition>()
  const allowsEdit = (element: Element) => {
    if(!preview.contains(element) || element.closest('script, style, template, [contenteditable="false"]')) return false
    if(!widgetScope) return true
    for(let ancestor: Element | null = element; ancestor && ancestor !== preview; ancestor = ancestor.parentElement) {
      if(widgetScope(ancestor)) return true
    }
    return false
  }

  function discoverWidgets() {
    let changed = false
    for(const widget of preview.querySelectorAll("*")) {
      if(widgetScope ? !widgetScope(widget) : widget.namespaceURI !== "http://www.w3.org/1999/xhtml" || !widget.localName.includes("-")) continue
      const tagName = widget.localName
      const content = widget.shadowRoot?.querySelector("slot")
        || Array.from(widget.childNodes).some(node => node.nodeType === Node.TEXT_NODE
          ? Boolean(node.textContent?.trim())
          : node instanceof Element && !node.matches("script, style, template")) ? "flow*" : undefined
      if(widgets.has(tagName) && (!content || widgets.get(tagName)?.editingConfig?.content)) continue
      widgets.set(tagName, {tagName, editingConfig: {content}})
      changed = true
    }
    return changed
  }
  discoverWidgets()

  const restoreEditable = () => {
    document.body.style.minHeight = bodyMinHeight
    if(!widgetScope) {
      if(originalEditable === null) preview.removeAttribute("contenteditable")
      else preview.setAttribute("contenteditable", originalEditable)
    }
  }
  let editor: DOMEditor
  try {
    // Authored examples can provide their own effect wiring in Reading mode.
    // Yield before the real widget feature starts, and resume after it stops.
    document.dispatchEvent(new CustomEvent("live-example-editing", {detail: true}))
    editor = new DOMEditor({
      widgets: [...widgets.values()],
      reader: {allows: (permission, element) => (permission === "edit" || permission === "select")
        && allowsEdit(element)},
    })
  }
  catch(error) {
    restoreEditable()
    document.dispatchEvent(new CustomEvent("live-example-editing", {detail: false}))
    throw error
  }

  const lifetime = new AbortController()
  const {signal} = lifetime
  const capture = {signal, capture: true}
  const isEditableNode = (node: Node) => {
    const element = node instanceof Element ? node : node.parentElement
    return element !== null && allowsEdit(element)
  }
  const isPreviewEdit = (event: Event) => {
    const origin = event.composedPath()[0]
    if(!(origin instanceof Node) || isFormControlInteraction(event)) return false
    if(isEditableNode(origin)) return true
    // The core can leave a light-DOM caret active while browser focus falls
    // back to BODY. Its own selection-driven key handlers still see the caret.
    const anchor = document.getSelection()?.anchorNode
    return origin === document.body && !!anchor && isEditableNode(anchor)
  }
  const selectionRange = () => {
    const selection = document.getSelection()
    return selection?.rangeCount ? selection.getRangeAt(0) : null
  }
  // Allow native text edits but keep changes to element structure in the HTML pane.
  const isTextRange = (range: AbstractRange | null) => Boolean(range
    && isEditableNode(range.startContainer) && range.startContainer === range.endContainer
    && (range.startContainer instanceof Text
      || range.collapsed && range.startContainer instanceof HTMLElement && !range.startContainer.firstElementChild))
  const block = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  // Run before core capture handlers can split or reshape a selection.
  window.addEventListener("keydown", event => {
    if(!isPreviewEdit(event) || event.isComposing || event.keyCode === 229) return
    const key = event.key.toLowerCase()
    const letter = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : key
    const mark = primaryMarkOptions.find(option => option.shortcutKey === letter)
    const formatting = mark && (modifierKeyDown(event) && !event.altKey && !event.shiftKey && hasStandardMarkShortcut(mark)
      || event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey)
    if(key === "enter" || formatting) block(event)
    else if(["tab", "backspace", "delete"].includes(key)) event.stopImmediatePropagation()
    else if(modifierKeyDown(event) && !event.altKey && (key === "z" || key === "y")) {
      block(event)
      if(key === "y" || event.shiftKey) editor.doc.redo()
      else editor.doc.undo()
    }
  }, capture)
  window.addEventListener("beforeinput", event => {
    if(!isPreviewEdit(event)) return
    const type = event.inputType
    if(type === "historyUndo" || type === "historyRedo") {
      block(event)
      if(type === "historyUndo") editor.doc.undo()
      else editor.doc.redo()
      return
    }
    if(event.isComposing) return
    const range = event.getTargetRanges()[0] ?? selectionRange()
    const isText = ["insertText", "insertReplacementText", "insertCompositionText"].includes(type)
      || type.startsWith("delete") && type !== "deleteByDrag"
    if(!isText || !isTextRange(range)) block(event)
    else event.stopImmediatePropagation()
  }, capture)
  window.addEventListener("paste", event => {
    if(!isPreviewEdit(event)) return
    block(event)
    const range = selectionRange()
    const text = event.clipboardData?.getData("text/plain").replace(/\r\n?|\n/g, " ")
    if(!range || !isTextRange(range) || !text) return
    const node = document.createTextNode(text)
    range.deleteContents()
    range.insertNode(node)
    document.getSelection()?.collapse(node, node.length)
  }, capture)
  window.addEventListener("cut", event => {
    if(!isPreviewEdit(event)) return
    if(isTextRange(selectionRange())) event.stopImmediatePropagation()
    else block(event)
  }, capture)
  for(const type of ["dragstart", "drop"]) {
    preview.addEventListener(type, event => { if(isPreviewEdit(event)) block(event) }, capture)
  }

  return {
    refresh(restoreEditing = false) {
      const changed = discoverWidgets()
      if(changed) editor.schema.extendWidgets(widgets.values())
      if(changed || restoreEditing) editor.features.widget.refresh()
    },
    destroy() {
      lifetime.abort()
      // WidgetFeature clears runtime attributes while destroying the editor.
      // Restore the enclosing editing mode first so widget callbacks observe it.
      restoreEditable()
      try { editor.destroy() }
      finally {
        document.dispatchEvent(new CustomEvent("live-example-editing", {detail: false}))
      }
    },
  }
}
