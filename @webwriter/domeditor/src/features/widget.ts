import type {ElementSelectionType} from "../editor-bridge"
import {readWidgetGrouping, writeWidgetGrouping} from "../widget-grouping-dom"
import type {WidgetGroupingRules, WidgetGroupingContext} from "../widget-grouping.js"
import {effectiveDistribution, ensureDistributionTarget, writeDistributionConfig} from "../distribution-dom"
import {emptyDistributionConfig, type DistributionConfig} from "../distribution.js"
import {EditorFeature} from "."
import {isEditorOnlyElementAttribute, isUnsafeElementAttributeName, isUnsafeElementAttributeValue} from "../element-attributes"
import {isEditorOwnedAttribute, pathFromNode, removeEditorMarker, widgetEditableMarker} from "../utility"
import {
  widgetActionState,
  widgetOptionAttributeValue,
  widgetOptionState,
  widgetOptionGroupState,
  type WidgetOptionsState,
  type WidgetOptionState,
  type WidgetActionState,
  type WidgetOptionValue,
} from "../widget-options"

type Declarations = Record<string, unknown>

/** Global attributes whose properties base classes write back themselves. */
const globalAttributeProperties = new Set(["lang", "dir", "title", "hidden", "id", "slot", "contentEditable"])

/** Longest time an asynchronous widget action keeps its changes in one undo step. */
const actionUndoGroupTimeout = 10_000

/** The runtime contract between the editor and installed widgets. */
export class WidgetFeature extends EditorFeature {
  #observer: MutationObserver | null = null
  readonly #runningActions = new WeakSet<Element>()
  readonly #actionErrors = new WeakMap<Element, Map<string, string>>()
  #refreshQueued = false
  #observingReferences = false
  #pendingFileAction?: {widget: Element, cancel: () => void}

  // Explicit host notifications cross the ordinary widget-interaction boundary.
  captureListeners = {
    optionschange: (event: Event) => {
      const origin = event.composedPath()[0]
      if(!(origin instanceof Element) || origin !== event.target || !document.body.contains(origin) || !this.isWidget(origin)) return
      this.#queueOptionsRefresh()
    },
  }

  #queueOptionsRefresh() {
    if(this.#refreshQueued) return
    this.#refreshQueued = true
    queueMicrotask(() => {
      this.#refreshQueued = false
      if(this.isEnabled) this.editor.postSelectionPath()
    })
  }

  /** Whether an element is an installed widget according to the schema. */
  isWidget(element: Element) {
    if(element.namespaceURI !== "http://www.w3.org/1999/xhtml" || !element.localName.includes("-")) return false
    const groups = this.editor.schema.get(element)?.group ?? []
    return groups.includes("widget") || groups.includes("widgetinline")
  }

  /** Assigns missing widget IDs and marks installed widgets as editable. Call
   * after the schema changes. */
  refresh() {
    if(!this.isEnabled) return
    document.body.querySelectorAll("*").forEach(element => {
      if(this.isWidget(element)) this.#connectWidget(element)
      else this.#unmarkEditable(element)
    })
    this.editor.doc.widgetData.sync()
  }

  /** IDs are authored state and survive removal and reconnection.
   * Widgets observe `contenteditable` (or `isContentEditable`) to switch
   * into their editing presentation. An authored value is left untouched. */
  #connectWidget(element: Element) {
    if(!document.body.contains(element) || !this.isWidget(element)) return
    if(!element.id) element.id = `ww${crypto.randomUUID()}`
    if(element.hasAttribute("contenteditable")) return
    element.classList.add("◆", widgetEditableMarker)
    element.setAttribute("contenteditable", "")
  }

  #unmarkEditable(element: Element) {
    if(!element.classList.contains(widgetEditableMarker)) return
    if(isEditorOwnedAttribute(element, "contenteditable")) element.removeAttribute("contenteditable")
    removeEditorMarker(element, widgetEditableMarker)
  }

  actions = {
    runSelectedWidgetAction: ({selectionType, name, confirmed}: {
      type: "runSelectedWidgetAction", selectionType: ElementSelectionType, name: string, confirmed?: boolean,
    }) => {
      const widgets = this.editor.features.manipulation.selectedElementsOfType(selectionType).filter(element => this.isWidget(element))
      if(widgets.length !== 1) return false
      return this.runAction(widgets[0], name, confirmed)
    },
    setSelectedWidgetOption: ({selectionType, name, value}: {
      type: "setSelectedWidgetOption", selectionType: ElementSelectionType, name: string, value: WidgetOptionValue,
    }) => {
      if(this.editor.isEditingLocked) return false
      const elements = this.editor.features.manipulation.selectedElementsOfType(selectionType).filter(element => this.isWidget(element))
      if(!elements.length) return false
      if(!elements.every(element => {
        const declaration = this.#declarations(element, "options")[name]
        if(declaration === undefined) return false
        const option = this.#referenceOption(element, widgetOptionState(name, declaration, value, this.#locale()))
        return !option.hidden && !option.disabled && !option.readOnly && this.#validOptionValue(option, value, element)
      })) return false
      const end = this.editor.doc.beginUndoGroup()
      try {
        for(const element of elements) {
          if(this.editor.features.manipulation.selectedElementsOfType(selectionType).includes(element)) this.setOption(element, name, value, false)
        }
      }
      finally { end() }
      return true
    },
    setWidgetOption: ({path, localName, name, value}: {
      type: "setWidgetOption"
      path: number[]
      localName: string
      name: string
      value: WidgetOptionValue
    }) => this.setOption(this.#widgetAt(path, localName), name, value),
    runWidgetAction: ({path, localName, name, confirmed}: {
      type: "runWidgetAction"
      path: number[]
      localName: string
      name: string
      confirmed?: boolean
    }) => this.runAction(this.#widgetAt(path, localName), name, confirmed),
    setWidgetSharing: ({path, localName, widgetId, enabled}: {
      type: "setWidgetSharing", path: number[], localName: string, widgetId: string, enabled: boolean,
    }) => this.setSharing(this.#sharingWidget(path, localName, widgetId), enabled),
    setWidgetGrouping: ({path, localName, widgetId, grouping}: {
      type: "setWidgetGrouping", path: number[], localName: string, widgetId: string, grouping: WidgetGroupingRules | null,
    }) => this.setGrouping(this.#sharingWidget(path, localName, widgetId), grouping),
    readWidgetGroupingContext: ({path, localName, widgetId}: {
      type: "readWidgetGroupingContext", path: number[], localName: string, widgetId: string,
    }) => this.readGroupingContext(this.#sharingWidget(path, localName, widgetId)),
    inspectWidgets: ({tagNames}: {type: "inspectWidgets", tagNames: string[]}) => (
      tagNames.filter(tagName => typeof tagName === "string").map(tagName => this.inspect(tagName))
    ),
  }

  /** Reports whether a widget tag is defined and which of its Lit properties
   * read an attribute without reflecting changes back to it; such changes
   * are not saved with the document. */
  inspect(tagName: string) {
    const constructor = customElements.get(tagName)
    if(!constructor) return {tagName, defined: false, unreflected: [] as string[]}
    let properties: unknown
    try { properties = (constructor as unknown as {elementProperties?: unknown}).elementProperties }
    catch { properties = undefined }
    const unreflected = properties instanceof Map
      ? [...properties].flatMap(([name, options]) => {
          const declaration = (options ?? {}) as {attribute?: unknown, reflect?: unknown, state?: unknown}
          return typeof name === "string" && !globalAttributeProperties.has(name)
            && !declaration.state && declaration.attribute !== false && !declaration.reflect ? [name] : []
        })
      : []
    return {tagName, defined: true, unreflected}
  }

  #locale() {
    return document.documentElement.lang || navigator.language || "en"
  }

  /** A widget's option or action declarations: a `LitElementWw` instance
   * getter when present, otherwise the static class declarations. */
  #declarations(widget: Element, kind: "options" | "actions" | "optionGroups"): Declarations {
    const isRecord = (value: unknown): value is Declarations => !!value && typeof value === "object" && !Array.isArray(value)
    try {
      const own = (widget as unknown as Record<string, unknown>)[kind]
      if(isRecord(own)) return own
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
    const widget = [...path].reverse().find(element => document.body.contains(element) && this.isWidget(element))
    if(!widget) return null
    const locale = this.#locale()
    const options = Object.entries(this.#declarations(widget, "options")).map(([name, declaration]) => {
      let value: unknown = null
      try { value = (widget as unknown as Record<string, unknown>)[name] }
      catch { /* A failing widget getter leaves the field empty. */ }
      const option = widgetOptionState(name, declaration, value, locale)
      if(option.type === "reference" && !this.#observingReferences) {
        this.#observingReferences = true
        this.#observer?.observe(document.body, {childList: true, subtree: true, attributes: true, characterData: true})
      }
      return this.#referenceOption(widget, option)
    })
    const actions = Object.entries(this.#declarations(widget, "actions"))
      .filter(([name]) => typeof (widget as unknown as Record<string, unknown>)[name] === "function")
      .map(([name, declaration]) => ({...widgetActionState(name, declaration, locale),
        ...(this.#runningActions.has(widget) ? {busy: true} : {}),
        ...(this.#actionErrors.get(widget)?.has(name) ? {error: this.#actionErrors.get(widget)!.get(name)} : {}),
      }))
    const groups = Object.entries(this.#declarations(widget, "optionGroups"))
      .map(([name, declaration]) => widgetOptionGroupState(name, declaration, locale))
    const supported = this.editor.schema.get(widget)?.sharedData === true
    let grouping: WidgetGroupingRules | null = null, error: string | undefined
    if(supported) {
      try { grouping = readWidgetGrouping(widget) }
      catch(reason) { error = reason instanceof Error ? reason.message : String(reason) }
    }
    let mode: "individual" | "group" | "all" = "individual"
    try {
      const policy = effectiveDistribution(widget)
      mode = policy?.config.scope ?? (!widget.hasAttribute("shared") ? "individual" : widget.getAttribute("shared") === "group" ? "group" : "all")
    }
    catch(reason) { error = reason instanceof Error ? reason.message : String(reason) }
    const data = supported ? Array.from(widget.children).find(child => child.localName === "script"
      && child.getAttribute("slot") === "data" && !child.hasAttribute("src")
      && ["application/json", "application/xml"].includes(child.getAttribute("type") ?? "")) : undefined
    return {path: pathFromNode(document.body, widget) ?? [], localName: widget.localName, options, actions,
      ...(groups.length ? {groups} : {}),
      ...(data ? {data: {type: data.getAttribute("type") as "application/json" | "application/xml", value: data.textContent ?? ""}} : {}),
      ...(supported ? {sharing: {widgetId: widget.id, mode, grouping, ...(error ? {error} : {})}} : {})}
  }

  /** Reference choices are projections of the current authored DOM, never an ID allocator. */
  #referenceOption(widget: Element, option: WidgetOptionState): WidgetOptionState {
    if(option.type !== "reference") return option
    const ids = new Map<string, number>()
    document.querySelectorAll("[id]").forEach(element => {
      if(element.id) ids.set(element.id, (ids.get(element.id) ?? 0) + 1)
    })
    try {
      const choices = Array.from(document.body.querySelectorAll(option.selector ?? "*")).flatMap(element => {
        if(!this.isWidget(element) || !element.id || ids.get(element.id) !== 1 || option.excludeSelf !== false && element === widget) return []
        const title = element.getAttribute("aria-label") || element.getAttribute("title") || element.localName
        return [{value: element.id, label: `${title} #${element.id}`}]
      })
      return {...option, choices, ...(typeof option.value === "string" && option.value && !choices.some(choice => choice.value === option.value)
        ? {referenceMissing: true} : {})}
    }
    catch {
      return {...option, choices: [], disabled: true, disabledReason: "Invalid reference selector"}
    }
  }

  #sharingWidget(path: number[], localName: string, widgetId: string) {
    const widget = this.#widgetAt(path, localName)
    if(widget.id !== widgetId || !this.editor.schema.get(widget)?.sharedData) throw new Error("The shared widget changed before the change could be applied")
    return widget
  }

  setSharing(widget: Element, enabled: boolean) {
    if(this.editor.isEditingLocked) return false
    const effective = effectiveDistribution(widget)?.config
    const scope = enabled ? (readWidgetGrouping(widget) ? "group" : "all") : "individual"
    const current = effective ?? emptyDistributionConfig(widget.id || "pending")
    const target = ensureDistributionTarget(widget)
    const config: DistributionConfig = {...current, target, scope}
    writeDistributionConfig(widget, config)
    widget.removeAttribute("shared")
    this.editor.doc.syncFromDOM()
    this.editor.postSelectionPath()
    return true
  }

  setGrouping(widget: Element, grouping: WidgetGroupingRules | null) {
    if(this.editor.isEditingLocked) return false
    const end = this.editor.doc.beginUndoGroup()
    try {
      const effective = effectiveDistribution(widget)
      const legacyShared = !effective && widget.hasAttribute("shared")
      let updated: DistributionConfig | undefined
      if((effective && effective.config.scope !== "individual") || legacyShared) {
        const current = effective?.config ?? emptyDistributionConfig(widget.id || "pending")
        updated = {...current, target: ensureDistributionTarget(widget), scope: grouping ? "group" : "all"}
      }
      writeWidgetGrouping(widget, grouping)
      if(updated) {
        writeDistributionConfig(widget, updated)
        widget.removeAttribute("shared")
      }
      this.editor.doc.syncFromDOM()
    }
    finally { end() }
    this.editor.postSelectionPath()
    return true
  }

  async readGroupingContext(widget: Element): Promise<WidgetGroupingContext> {
    const data = this.editor.doc.widgetData
    if(!data.serverUrl) throw new Error("Offline: connect the document to load its participant roster")
    const endpoint = new URL("/api/widget-grouping/context", data.serverUrl.replace(/^ws/, "http"))
    endpoint.searchParams.set("document", data.documentId)
    endpoint.searchParams.set("widget", widget.id)
    if(data.sessionId) endpoint.searchParams.set("room", data.sessionId)
    const response = await fetch(endpoint, {credentials: "include"})
    if(response.status === 403) return {canManage: false, participants: [], groups: [], groupings: []}
    if(!response.ok) throw new Error(`Could not load the participant roster (${response.status})`)
    return await response.json() as WidgetGroupingContext
  }

  /** Writes an option to the widget's reflected attribute, so the change is
   * authored DOM. Property-only options are set on the instance. */
  setOption(widget: Element, name: string, value: WidgetOptionValue, notify = true) {
    if(this.editor.isEditingLocked || !document.body.contains(widget) || !this.isWidget(widget)) return false
    const declarations = this.#declarations(widget, "options")
    const declaration = declarations[name]
    if(!Object.hasOwn(declarations, name)) throw new TypeError(`The widget has no option '${name}'`)
    const option = this.#referenceOption(widget, widgetOptionState(name, declaration, value, this.#locale()))
    if(option.hidden || option.disabled || option.readOnly || !this.#validOptionValue(option, value, widget)) return false
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
    if(notify) this.editor.postSelectionPath()
    return true
  }

  #validOptionValue(option: WidgetOptionState, value: WidgetOptionValue, widget: Element): boolean {
    if(value === null || value === "") return true
    if(option.type === "boolean") return typeof value === "boolean"
    if(option.type === "number") return typeof value === "number" && Number.isFinite(value)
      && (option.control !== "duration" || value >= 0)
      && (option.min === undefined || value >= option.min) && (option.max === undefined || value <= option.max)
      && (!option.steps?.length || option.steps.includes(value))
      && (option.control !== "duration" || !option.step || option.step <= 0
        || Math.abs((value - (option.min ?? 0)) / option.step - Math.round((value - (option.min ?? 0)) / option.step)) < 1e-7)
    if(option.type === "reference") return typeof value === "string" && Boolean(option.choices?.some(choice => choice.value === value))
    if(option.type === "select") {
      let retained: unknown = null
      if(option.control === "tree") {
        try { retained = (widget as unknown as Record<string, unknown>)[option.name] }
        catch { return false }
      }
      const valid = (item: unknown) => typeof item === "string" && (option.control === "tree"
        ? Boolean(option.choices?.some(choice => choice.value === item)) || Array.isArray(retained) && retained.includes(item)
        : !option.choices?.length || option.choices.some(choice => choice.value === item))
      return option.multiple ? Array.isArray(value) && value.every(valid) : valid(value)
    }
    return true
  }

  /** Runs a declared widget action as one undo step. Asynchronous actions
   * keep the step open until they settle or time out. */
  async runAction(widget: Element, name: string, confirmed = false, files?: File[]) {
    if(this.editor.isEditingLocked || !document.body.contains(widget) || !this.isWidget(widget)) return false
    const declarations = this.#declarations(widget, "actions")
    const declaration = declarations[name]
    if(!Object.hasOwn(declarations, name)) throw new TypeError(`The widget has no action '${name}'`)
    const method = (widget as unknown as Record<string, unknown>)[name]
    if(typeof method !== "function") throw new TypeError(`The widget action '${name}' is not a method`)
    const action = widgetActionState(name, declaration, this.#locale())
    if(action.hidden || action.disabled || action.confirm && confirmed !== true || this.#runningActions.has(widget)) return false
    if(files === undefined) this.#pendingFileAction?.cancel()
    if(action.input) {
      if(!this.isEnabled) return false
      if(files === undefined) return this.#pickActionFiles(widget, name, action, method, confirmed)
      if(!files.length || !action.input.multiple && files.length !== 1 || !files.every(file => file instanceof File)) return false
    }
    else if(files !== undefined) return false
    this.#runningActions.add(widget)
    this.#actionErrors.get(widget)?.delete(name)
    this.editor.postSelectionPath()
    const end = this.editor.doc.beginUndoGroup()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = action.input ? method.call(widget, files) : method.call(widget)
      if(result && typeof (result as PromiseLike<unknown>).then === "function") {
        await Promise.race([
          Promise.resolve(result),
          new Promise(resolve => { timer = setTimeout(resolve, actionUndoGroupTimeout) }),
        ])
      }
      return true
    }
    catch(error) {
      let errors = this.#actionErrors.get(widget)
      if(!errors) this.#actionErrors.set(widget, errors = new Map())
      errors.set(name, error instanceof Error ? error.message : String(error))
      throw error
    }
    finally {
      clearTimeout(timer)
      this.#runningActions.delete(widget)
      end()
      this.editor.postSelectionPath()
    }
  }

  #pickActionFiles(widget: Element, name: string, action: WidgetActionState, method: unknown, confirmed: boolean) {
    const picker = document.createElement("input")
    picker.type = "file"
    picker.hidden = true
    picker.accept = action.input?.accept ?? ""
    picker.multiple = action.input?.multiple === true
    const id = widget.id
    const cancel = () => {
      picker.removeEventListener("change", change)
      picker.removeEventListener("cancel", cancel)
      picker.remove()
      if(this.#pendingFileAction === pending) this.#pendingFileAction = undefined
    }
    const pending = {widget, cancel}
    const change = () => {
      const files = Array.from(picker.files ?? [])
      const current = widgetActionState(name, this.#declarations(widget, "actions")[name], this.#locale())
      const valid = this.#pendingFileAction === pending && this.isEnabled && document.body.contains(widget)
        && widget.id === id && (widget as unknown as Record<string, unknown>)[name] === method
        && JSON.stringify(current.input) === JSON.stringify(action.input) && current.confirm === action.confirm
      cancel()
      if(valid && files.length) void this.runAction(widget, name, confirmed, files).catch(() => { /* runAction reports the error in inspector state. */ })
    }
    picker.addEventListener("change", change)
    picker.addEventListener("cancel", cancel)
    this.#pendingFileAction = pending
    this.editor.addAppendix(picker)
    try { picker.click() }
    catch(error) { cancel(); throw error }
    return true
  }

  readonly #handleMutations = (records: MutationRecord[]) => {
    if(this.#pendingFileAction && !document.body.contains(this.#pendingFileAction.widget)) this.#pendingFileAction.cancel()
    if(this.#observingReferences) this.#queueOptionsRefresh()
    for(const record of records) {
      record.addedNodes.forEach(node => {
        if(!(node instanceof Element) || !document.body.contains(node)) return
        this.#connectWidget(node)
        node.querySelectorAll("*").forEach(element => this.#connectWidget(element))
      })
    }
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
    const Observer = document.defaultView?.MutationObserver ?? MutationObserver
    this.#observer = new Observer(this.#handleMutations)
    this.#observer.observe(document.body, {childList: true, subtree: true, ...(this.#observingReferences ? {attributes: true, characterData: true} : {})})
    this.refresh()
  }

  disable() {
    if(!this.isEnabled) return
    this.#observer?.disconnect()
    this.#observer = null
    this.#observingReferences = false
    this.#pendingFileAction?.cancel()
    document.body.querySelectorAll(`.${CSS.escape(widgetEditableMarker)}`).forEach(element => this.#unmarkEditable(element))
    super.disable()
  }
}
