import type {ElementSelectionType} from "../editor-bridge"
import {readWidgetGrouping, writeWidgetGrouping} from "../widget-grouping-dom"
import type {WidgetGroupingRules, WidgetGroupingContext} from "../widget-grouping.js"
import {effectiveDistribution, ensureDistributionTarget, writeDistributionConfig} from "../distribution-dom"
import {emptyDistributionConfig, type DistributionConfig} from "../distribution.js"
import {EditorFeature} from "."
import {isEditorOnlyElementAttribute, isUnsafeElementAttributeName, isUnsafeElementAttributeValue} from "../element-attributes"
import {isWidgetDataContainer} from "../active-content"
import {$, isEditorOwnedAttribute, pathFromNode, removeEditorMarker, widgetEditableMarker} from "../utility"
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
  readonly #initializedContent = new WeakSet<Element>()
  #refreshQueued = false
  #observingReferences = false
  #pendingFileAction?: {widget: Element, cancel: () => void}
  #legacyOptions?: {widget: Element, panel: HTMLElement, popover: string | null}

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

  /** Keep the public legacy options part in its original shadow/context tree.
   * A manual popover paints it outside the widget's layout and transforms. */
  syncLegacyOptions(origin: Node | null) {
    let widget = origin instanceof Element ? origin : origin?.parentElement
    let panel: HTMLElement | null = null
    if(this.isEnabled && !this.editor.isEditingLocked && !this.editor.options.reader && origin && document.body.contains(origin)) {
      for(; widget && widget !== document.body; widget = widget.parentElement) {
        if(!this.isWidget(widget)) continue
        panel = widget.shadowRoot?.querySelector<HTMLElement>('[part~="options"]') ?? null
        if(panel) break
      }
    }
    if(!panel || !widget) {
      this.#closeLegacyOptions()
      return
    }
    if(this.#legacyOptions?.widget === widget && this.#legacyOptions.panel === panel) return
    this.#closeLegacyOptions()
    this.#legacyOptions = {widget, panel, popover: panel.getAttribute("popover")}
    widget.classList.add("◆", "◆widget-options")
    panel.setAttribute("popover", "manual")
    try { panel.showPopover?.() }
    catch { this.#closeLegacyOptions() }
  }

  #closeLegacyOptions() {
    const previous = this.#legacyOptions
    this.#legacyOptions = undefined
    if(previous) {
      try { previous.panel.hidePopover?.() }
      catch { /* A widget may replace its options part while it is open. */ }
      if(previous.popover === null) previous.panel.removeAttribute("popover")
      else previous.panel.setAttribute("popover", previous.popover)
      removeEditorMarker(previous.widget, "◆widget-options")
    }
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
  #connectWidget(element: Element, prefill = true) {
    if(!document.body.contains(element) || !this.isWidget(element) || !this.editor.allows("edit", element)) return
    const id = element.getAttribute("id")
    if((id === null || id === "") && !this.editor.options.reader) element.setAttribute("id", `ww${crypto.randomUUID()}`)
    if(!this.editor.options.reader && !this.#initializedContent.has(element)) {
      this.#initializedContent.add(element)
      try { if(prefill) this.#prefillContent(element) }
      catch { /* An unfillable schema leaves the original widget untouched. */ }
    }
    if(element.hasAttribute("contenteditable")) return
    element.classList.add("◆", widgetEditableMarker)
    element.setAttribute("contenteditable", "")
  }

  #contentNodes(element: Element) {
    return Array.from(element.childNodes).filter(node => node.nodeType !== Node.COMMENT_NODE
      && node.nodeType !== Node.PROCESSING_INSTRUCTION_NODE && !isWidgetDataContainer(node))
  }

  /** Add missing required children, preserving the identity and order of every
   * existing node. This never removes, wraps or normalizes authored content. */
  #prefillContent(element: Element, ancestors = new Set<string>(), initial = true) {
    if(element.getAttribute("contenteditable") === "false" || !this.editor.schema.get(element)?.content) return
    const original = this.#contentNodes(element)
    if((initial && original.length) || this.editor.schema.isContentValid(element, original)) return
    const key = `${element.namespaceURI}:${element.localName}`
    if(ancestors.has(key)) throw new Error("Cannot prefill recursive widget content")
    const nextAncestors = new Set([...ancestors, key])
    const content = this.editor.schema.fillByRule(element, undefined, [...original])
    if(!this.editor.schema.isContentValid(element, content)) throw new Error("Cannot prefill widget content")
    const existing = new Set<Node>(original)
    const added = content.filter(child => !existing.has(child))
    const preserved = content.filter(child => existing.has(child))
    if(preserved.length !== original.length || preserved.some((child, index) => child !== original[index])) return
    for(const child of added) if(child instanceof Element) this.#prefillContent(child, nextAncestors)
    // Constructors may deliberately mutate their owner document while filling.
    const current = this.#contentNodes(element)
    if(current.length !== original.length || current.some((child, index) => child !== original[index])) return
    const selection = document.getSelection()
    const moveSelection = selection?.isCollapsed && selection.anchorNode === element
    content.forEach((child, index) => {
      if(!existing.has(child)) element.insertBefore(child, content.slice(index + 1).find(next => existing.has(next)) ?? null)
    })
    if(document.body.contains(element)) for(const child of added) if(child instanceof Element) {
      this.#connectWidget(child, false)
      child.querySelectorAll("*").forEach(descendant => this.#connectWidget(descendant, false))
      if(!initial) this.editor.doc.markMinimumContentRepair(child)
    }
    if(moveSelection && added[0]?.isConnected) $.move(added[0])
  }

  /** Concurrent pristine repairs can be removed only if the declared minimum
   * remains satisfied; authored children and higher minimum counts survive. */
  canRemoveMinimumContentRepair(element: Element, repairs: readonly Element[] = []) {
    const parent = element.parentElement
    if(!parent || !this.isWidget(parent)) return false
    const content = this.#contentNodes(parent)
    if(this.editor.schema.isContentValid(parent, content.filter(child => child !== element))) return true
    // With an upper bound (e.g. p{2}), removing just one of four concurrent
    // repairs is still invalid. Find the minimum subsequence of pristine
    // repairs that completes the authored children without moving any node.
    const candidates = new Set<Node>(repairs)
    const authored = content.filter(child => !candidates.has(child))
    try {
      const required = this.editor.schema.fillByRule(parent, undefined, [...authored])
      const authoredSet = new Set<Node>(authored)
      const retained = new Set<Node>()
      let index = 0
      for(const child of content) {
        const expected = required[index]
        if(!candidates.has(child)) {
          if(child !== expected) return false
          index++
        }
        else if(expected instanceof Element && child instanceof Element && !authoredSet.has(expected)
          && expected.namespaceURI === child.namespaceURI && expected.localName === child.localName) {
          retained.add(child)
          index++
        }
      }
      return index === required.length && this.editor.schema.isContentValid(parent,
        content.filter(child => !candidates.has(child) || retained.has(child))) && !retained.has(element)
    }
    catch { return false }
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

  /** Instance declarations override static maps. Legacy dynamicOptions are an
   * alias, with canonical options taking precedence for duplicate names. */
  #declarations(widget: Element, kind: "options" | "actions" | "optionGroups"): Declarations {
    const isRecord = (value: unknown): value is Declarations => !!value && typeof value === "object" && !Array.isArray(value)
    const read = (name: string) => {
      try {
        const own = (widget as unknown as Record<string, unknown>)[name]
        if(isRecord(own)) return own
        const inherited = (widget.constructor as unknown as Record<string, unknown>)[name]
        return isRecord(inherited) ? inherited : {}
      }
      catch { return {} }
    }
    return kind === "options" ? {...read("dynamicOptions"), ...read(kind)} : read(kind)
  }

  /** Use Lit's property mapping when the editor option leaves its attribute unspecified. */
  #optionDeclaration(widget: Element, name: string, declaration: unknown) {
    if(!declaration || typeof declaration !== "object" || Array.isArray(declaration)) return declaration
    const option = declaration as Declarations
    if(typeof option.attribute === "string" || option.attribute === false) return declaration
    let properties: unknown
    try { properties = (widget.constructor as unknown as {elementProperties?: unknown}).elementProperties }
    catch { return declaration }
    const property = properties instanceof Map ? properties.get(name) : undefined
    if(!property || typeof property !== "object") return declaration
    const {attribute, state} = property as {attribute?: unknown, state?: unknown}
    if(typeof attribute === "string" || attribute === false) return {...option, attribute}
    if(state === true) return {...option, attribute: false}
    return declaration
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
    const options = Object.entries(this.#declarations(widget, "options")).map(([name, rawDeclaration]) => {
      const declaration = this.#optionDeclaration(widget, name, rawDeclaration)
      let value: unknown = null
      try { value = (widget as unknown as Record<string, unknown>)[name] }
      catch { /* A failing widget getter leaves the field empty. */ }
      let option = widgetOptionState(name, declaration, value, locale)
      // Legacy dynamicOptions use attribute names (e.g. detailed-feedback)
      // instead of their corresponding camel-cased property names.
      if(value === undefined && option.attribute !== null) {
        const attribute = widget.getAttribute(option.attribute)
        const parsed = option.type === "boolean" ? attribute !== null
          : option.type === "number" && attribute !== null ? Number(attribute) : attribute
        option = widgetOptionState(name, declaration, parsed, locale)
      }
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
    const declaration = this.#optionDeclaration(widget, name, declarations[name])
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

  /** Finish local initialization and minimum-content repairs before sharing
   * the DOM batch. Remote deletions and undo use the same additive repair. */
  flushMutations(prefill = true) {
    this.#connectAddedWidgets(this.#observer?.takeRecords() ?? [], prefill)
  }

  readonly #handleMutations = (records: MutationRecord[]) => this.#connectAddedWidgets(records)

  #connectAddedWidgets(records: MutationRecord[], prefill = true) {
    if(this.#pendingFileAction && !document.body.contains(this.#pendingFileAction.widget)) this.#pendingFileAction.cancel()
    if(this.#legacyOptions && !document.body.contains(this.#legacyOptions.widget)) this.#closeLegacyOptions()
    if(this.#observingReferences) this.#queueOptionsRefresh()
    for(const record of records) {
      record.addedNodes.forEach(node => {
        if(!(node instanceof Element) || !document.body.contains(node)) return
        this.#connectWidget(node, prefill)
        node.querySelectorAll("*").forEach(element => this.#connectWidget(element, prefill))
      })
    }
    if(!this.editor.options.reader && !this.editor.isEditingLocked) {
      const changedWidgets = new Set(records.filter(record => record.type === "childList" && record.removedNodes.length
        && record.target instanceof Element && document.body.contains(record.target) && this.isWidget(record.target))
        .map(record => record.target as Element))
      for(const widget of changedWidgets) {
        try { this.#prefillContent(widget, new Set(), false) }
        catch { /* Unfillable or incompatible authored content remains intact. */ }
      }
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
    this.#closeLegacyOptions()
    this.#observer?.disconnect()
    this.#observer = null
    this.#observingReferences = false
    this.#pendingFileAction?.cancel()
    document.body.querySelectorAll(`.${CSS.escape(widgetEditableMarker)}`).forEach(element => this.#unmarkEditable(element))
    super.disable()
  }
}
