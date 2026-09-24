import {EditorFeature} from "."
import {isEditorOnlyElementAttribute, isUnsafeElementAttributeName, isUnsafeElementAttributeValue} from "../element-attributes"
import {isEditorOwnedAttribute, pathFromNode, removeEditorMarker, widgetEditableMarker} from "../utility"
import {
  widgetActionState,
  widgetOptionAttributeValue,
  widgetOptionState,
  type WidgetOptionsState,
  type WidgetOptionValue,
} from "../widget-options"

type Declarations = Record<string, unknown>

/** Longest time an asynchronous widget action keeps its changes in one undo step. */
const actionUndoGroupTimeout = 10_000

/** The runtime contract between the editor and installed widgets. */
export class WidgetFeature extends EditorFeature {
  #observer: MutationObserver | null = null
  readonly #runningActions = new WeakSet<Element>()

  /** Whether an element is an installed widget according to the schema. */
  isWidget(element: Element) {
    if(element.namespaceURI !== "http://www.w3.org/1999/xhtml" || !element.localName.includes("-")) return false
    const groups = this.editor.schema.get(element)?.group ?? []
    return groups.includes("widget") || groups.includes("widgetinline")
  }

  /** Marks every installed widget in the authored body as editable. Call
   * after the schema changes. */
  refresh() {
    if(!this.isEnabled) return
    document.body.querySelectorAll("*").forEach(element => {
      if(this.isWidget(element)) this.#markEditable(element)
      else this.#unmarkEditable(element)
    })
  }

  /** Widgets observe `contenteditable` (or `isContentEditable`) to switch
   * into their editing presentation. An authored value is left untouched. */
  #markEditable(element: Element) {
    if(!this.isWidget(element) || element.hasAttribute("contenteditable")) return
    element.classList.add("◆", widgetEditableMarker)
    element.setAttribute("contenteditable", "")
  }

  #unmarkEditable(element: Element) {
    if(!element.classList.contains(widgetEditableMarker)) return
    if(isEditorOwnedAttribute(element, "contenteditable")) element.removeAttribute("contenteditable")
    removeEditorMarker(element, widgetEditableMarker)
  }

  actions = {
    setWidgetOption: ({path, localName, name, value}: {
      type: "setWidgetOption"
      path: number[]
      localName: string
      name: string
      value: WidgetOptionValue
    }) => this.setOption(this.#widgetAt(path, localName), name, value),
    runWidgetAction: ({path, localName, name}: {
      type: "runWidgetAction"
      path: number[]
      localName: string
      name: string
    }) => this.runAction(this.#widgetAt(path, localName), name),
  }

  #locale() {
    return document.documentElement.lang || navigator.language || "en"
  }

  /** A widget's option or action declarations: a `LitElementWw` instance
   * getter when present, otherwise the static class declarations. */
  #declarations(widget: Element, kind: "options" | "actions"): Declarations {
    const isRecord = (value: unknown): value is Declarations => !!value && typeof value === "object" && !Array.isArray(value)
    try {
      const own = (widget as unknown as Record<string, unknown>)[kind]
      if(isRecord(own) && Object.keys(own).length) return own
      const inherited = (widget.constructor as unknown as Record<string, unknown>)[kind]
      return isRecord(inherited) ? inherited : {}
    }
    catch {
      return {}
    }
  }

  #widgetAt(path: number[], localName: string) {
    let node: Node = document.body
    for(const index of path) {
      const child = node.childNodes.item(index)
      if(!child) throw new RangeError(`Cannot find a widget at path [${path.join(", ")}]`)
      node = child
    }
    if(!(node instanceof Element) || node.localName !== localName || !this.isWidget(node)) {
      throw new Error("The selected widget changed before the change could be applied")
    }
    return node
  }

  /** Options and actions of the innermost installed widget in `path`. */
  getOptionsState(path: Element[]): WidgetOptionsState | null {
    const widget = [...path].reverse().find(element => this.isWidget(element))
    if(!widget) return null
    const locale = this.#locale()
    const options = Object.entries(this.#declarations(widget, "options")).map(([name, declaration]) => {
      let value: unknown = null
      try { value = (widget as unknown as Record<string, unknown>)[name] }
      catch { /* A failing widget getter leaves the field empty. */ }
      return widgetOptionState(name, declaration, value, locale)
    })
    const actions = Object.entries(this.#declarations(widget, "actions"))
      .filter(([name]) => typeof (widget as unknown as Record<string, unknown>)[name] === "function")
      .map(([name, declaration]) => widgetActionState(name, declaration, locale))
    if(!options.length && !actions.length) return null
    return {path: pathFromNode(document.body, widget) ?? [], localName: widget.localName, options, actions}
  }

  /** Writes an option to the widget's reflected attribute, so the change is
   * authored DOM. Property-only options are set on the instance. */
  setOption(widget: Element, name: string, value: WidgetOptionValue) {
    if(this.editor.isEditingLocked) return false
    const declaration = this.#declarations(widget, "options")[name]
    if(declaration === undefined) throw new TypeError(`The widget has no option '${name}'`)
    const option = widgetOptionState(name, declaration, value, this.#locale())
    if(option.attribute === null) {
      (widget as unknown as Record<string, unknown>)[name] = value
    }
    else {
      const attribute = option.attribute
      if(isUnsafeElementAttributeName(attribute) || isEditorOnlyElementAttribute(attribute)
        || ["style", "class", "is"].includes(attribute.toLowerCase())) {
        throw new TypeError(`The ${attribute} attribute cannot be set as an option`)
      }
      const attributeValue = widgetOptionAttributeValue(option.type, value, option.multiple)
      if(attributeValue !== null && isUnsafeElementAttributeValue(attribute, attributeValue)) {
        throw new TypeError(`The ${attribute} option contains an unsafe URL`)
      }
      if(attributeValue === null) widget.removeAttribute(attribute)
      else widget.setAttribute(attribute, attributeValue)
    }
    this.editor.postSelectionPath()
    return true
  }

  /** Runs a declared widget action as one undo step. Asynchronous actions
   * keep the step open until they settle or time out. */
  async runAction(widget: Element, name: string) {
    if(this.editor.isEditingLocked) return false
    if(this.#declarations(widget, "actions")[name] === undefined) throw new TypeError(`The widget has no action '${name}'`)
    const method = (widget as unknown as Record<string, unknown>)[name]
    if(typeof method !== "function") throw new TypeError(`The widget action '${name}' is not a method`)
    if(this.#runningActions.has(widget)) return false
    this.#runningActions.add(widget)
    const end = this.editor.doc.beginUndoGroup()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = method.call(widget)
      if(result && typeof (result as PromiseLike<unknown>).then === "function") {
        await Promise.race([
          Promise.resolve(result),
          new Promise(resolve => { timer = setTimeout(resolve, actionUndoGroupTimeout) }),
        ])
      }
      return true
    }
    finally {
      clearTimeout(timer)
      this.#runningActions.delete(widget)
      end()
      this.editor.postSelectionPath()
    }
  }

  readonly #handleMutations = (records: MutationRecord[]) => {
    for(const record of records) {
      record.addedNodes.forEach(node => {
        if(!(node instanceof Element) || !document.body.contains(node)) return
        this.#markEditable(node)
        node.querySelectorAll("*").forEach(element => this.#markEditable(element))
      })
    }
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    const Observer = document.defaultView?.MutationObserver ?? MutationObserver
    this.#observer = new Observer(this.#handleMutations)
    this.#observer.observe(document.body, {childList: true, subtree: true})
    this.refresh()
  }

  disable() {
    if(!this.isEnabled) return
    this.#observer?.disconnect()
    this.#observer = null
    document.body.querySelectorAll(`.${CSS.escape(widgetEditableMarker)}`).forEach(element => this.#unmarkEditable(element))
    super.disable()
  }
}
