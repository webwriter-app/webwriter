import {clearPresentationState, setPresentationState} from "../presentation-state.js"
import type {ElementSelectionType, WidgetConversionState} from "../editor-bridge"
import {readWidgetGrouping, writeWidgetGrouping} from "../widget-grouping-dom"
import type {WidgetGroupingRules, WidgetGroupingContext} from "../widget-grouping.js"
import {effectiveDistribution, readDistributionConfigs, visitSerializableElements, writeDistributionConfig} from "../distribution-dom"
import {emptyDistributionConfig, type DistributionConfig} from "../distribution.js"
import {EditorFeature} from "."
import {elementAttributeTargetId, isEditorOnlyElementAttribute, isUnsafeElementAttributeName, isUnsafeElementAttributeValue} from "../element-attributes"
import {isWidgetDataContainer} from "../active-content"
import {getDocumentRoot} from "../document-template"
import {boardLayoutRole, slideLayoutRole} from "../document-layout"
import {captionedFigureContent} from "../figure-layout.js"
import {getElementPresentation} from "../element-names"
import {$, atomicEditingContainer, clearEditorArtifacts, cloneInert, getInertDocument, pathFromNode, removeEditorMarker} from "../utility"
import type {Schema} from "../schema"
import type {OfflineImportRule, OfflineImportSelection} from "../offline-module-bundler"
import {inspectWidgetEffects, mountWidgetEffects, parseWidgetEffectReference, validateWidgetEffect, widgetEffectDeclarations, widgetEffectReference} from "../widget-effects"
import {
  isWidgetFileFormat,
  isRecord as isDeclarationMap,
  matchesWidgetFileFormat,
  widgetActionState,
  widgetOptionAttributeValue,
  widgetOptionState,
  widgetOptionGroupState,
  widgetDeclarations,
  widgetConversionMethod,
  widgetOptionDeclaration,
  readWidgetOption,
  validWidgetOptionValue,
  widgetReferenceOption,
  type WidgetOptionsState,
  type WidgetPermissionState,
  type WidgetOptionState,
  type WidgetActionState,
  type WidgetOptionValue,
} from "../widget-options"

type Declarations = Record<string, unknown>
const htmlNamespace = "http://www.w3.org/1999/xhtml"
const effectOptionPrefix = "effect:"

/** Global attributes whose properties base classes write back themselves. */
const globalAttributeProperties = new Set(["lang", "dir", "title", "hidden", "id", "slot", "contentEditable"])

/** Time limit for asynchronous widget actions and file conversion preparation. */
const widgetOperationTimeout = 10_000

/** The runtime contract between the editor and installed widgets. */
export class WidgetFeature extends EditorFeature {
  #observer: MutationObserver | null = null
  readonly #runningActions = new WeakSet<Element>()
  readonly #actionErrors = new WeakMap<Element, Map<string, string>>()
  readonly #initializedContent = new WeakSet<Element>()
  readonly #defaultImports = new WeakMap<CustomElementConstructor, string[]>()
  #fileConversions = new AbortController()
  #refreshQueued = false
  #observingReferences = false
  #effects?: ReturnType<typeof mountWidgetEffects>
  #observingEffects = false
  readonly #rejectedEffects = new WeakMap<Element, Map<string, string>>()
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
  readonly isWidget = (element: Element, schema = this.editor.schema) => {
    if(element.namespaceURI !== "http://www.w3.org/1999/xhtml" || !element.localName.includes("-")) return false
    const groups = schema.get(element.localName)?.group ?? []
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
    setPresentationState(widget, "widget-options")
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
      clearPresentationState(previous.widget, "widget-options")
    }
  }

  /** Assigns missing widget IDs and marks installed widgets as editable. Call
   * after the schema changes. */
  refresh(previousSchema: Schema = this.editor.schema) {
    if(!this.isEnabled) return
    document.body.querySelectorAll("*").forEach(element => {
      if(this.isWidget(element)) this.#connectWidget(element)
      else this.#clearEditable(element, previousSchema)
    })
    this.editor.doc.widgetData.sync()
    this.#effects?.refresh()
  }

  /** IDs are authored state and survive removal and reconnection.
   * Widgets observe `contenteditable` (or `isContentEditable`) to switch
   * into their editing presentation. Explicit authored values are left untouched. */
  #connectWidget(element: Element, prefill = true) {
    if(!document.body.contains(element) || !this.isWidget(element)) return
    if(!this.editor.allows("edit", element)) {
      this.#clearEditable(element)
      return
    }
    const id = element.getAttribute("id")
    if((id === null || id === "") && !this.editor.options.reader) element.setAttribute("id", `ww${crypto.randomUUID()}`)
    if(!this.editor.options.reader && !this.#initializedContent.has(element)) {
      this.#initializedContent.add(element)
      try { if(prefill) this.#prefillContent(element) }
      catch { /* An unfillable schema leaves the original widget untouched. */ }
    }
    if(!element.hasAttributeNS(null, "contenteditable")) element.setAttributeNS(null, "contenteditable", "")
  }

  #clearEditable(element: Element, schema = this.editor.schema) {
    if(element.getAttributeNS(null, "contenteditable") === "" && this.isWidget(element, schema)) {
      element.removeAttributeNS(null, "contenteditable")
    }
  }

  #contentNodes(element: Element) {
    return Array.from(element.childNodes).filter(node => node.nodeType !== Node.COMMENT_NODE
      && node.nodeType !== Node.PROCESSING_INSTRUCTION_NODE && !isWidgetDataContainer(node))
  }

  /** Add missing required children, preserving the identity and order of every
   * existing node. This never removes, wraps or normalizes authored content. */
  #prefillContent(element: Element, ancestors = new Set<string>(), initial = true) {
    if(element.getAttributeNS(null, "contenteditable") === "false" || !this.editor.schema.get(element)?.content) return
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

  actions = {
    convertWidgetElement: ({sourceId, target}: {type: "convertWidgetElement", sourceId: string, target: string}) => this.convertElement(sourceId, target),
    importWidgetFile: ({sourceId, format, file}: {type: "importWidgetFile", sourceId: string, format: string, file: File}) =>
      this.convertFile(sourceId, "convertFrom", format, file),
    exportWidgetFile: ({sourceId, format}: {type: "exportWidgetFile", sourceId: string, format: string}) =>
      this.convertFile(sourceId, "convertTo", format),
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
      if(name.startsWith(effectOptionPrefix) && !Object.hasOwn(widgetDeclarations(elements[0], "options"), name)) {
        return elements.length === 1 && this.setOption(elements[0], name, value)
      }
      if(!elements.every(element => {
        const declaration = widgetDeclarations(element, "options")[name]
        if(declaration === undefined) return false
        const option = this.#referenceOption(element, widgetOptionState(name, declaration, value, this.#locale()))
        return !option.hidden && !option.disabled && !option.readOnly && validWidgetOptionValue(option, value, element)
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

  /** Collect optional import rules from the installed classes using the saved DOM. */
  offlineImports(root: Pick<Document, "head" | "documentElement">, widgetEntries: ReadonlyMap<string, string>): OfflineImportSelection {
    type OfflineWidget = CustomElementConstructor & {offlineImports?: (element: Element) => readonly OfflineImportRule[]}
    const hooks = new Map<string, {entry: string, select: NonNullable<OfflineWidget["offlineImports"]>}>()
    for(const [tag, entry] of widgetEntries) {
      const widget = customElements.get(tag) as OfflineWidget | undefined
      if(typeof widget?.offlineImports === "function") hooks.set(tag, {entry, select: widget.offlineImports.bind(widget)})
    }
    const selections = new Map<string, Set<string> | "*">()
    if(!hooks.size) return selections
    visitSerializableElements(root.documentElement, readDistributionConfigs(root).values(), element => {
      if(element.namespaceURI !== htmlNamespace) return
      const hook = hooks.get(element.localName)
      if(!hook) return
      const rules = hook.select(element)
      const invalid = () => new TypeError(`Invalid offlineImports rule from ${element.localName}`)
      if(!Array.isArray(rules)) throw invalid()
      for(const rule of rules) {
        if(typeof rule?.importer !== "string" || !rule.importer.trim() || rule.keep !== "*"
          && (!Array.isArray(rule.keep) || rule.keep.some((path: unknown) => typeof path !== "string" || !path.trim()))) throw invalid()
        const importer = new URL(rule.importer, hook.entry)
        if(importer.protocol !== "https:" && importer.protocol !== "http:") throw invalid()
        const previous = selections.get(importer.href)
        if(previous === "*") continue
        if(rule.keep === "*") selections.set(importer.href, "*")
        else {
          const keep = previous ?? new Set<string>()
          for(const path of rule.keep) keep.add(path)
          selections.set(importer.href, keep)
        }
      }
    })
    return selections
  }

  #locale() {
    return document.documentElement.lang || navigator.language || "en"
  }

  #baseTag(name: string) {
    const entry = this.editor.schema.get(name)
    return /^[a-z][a-z0-9]*$/.test(name) && entry && !entry.headOnly && !entry.contentNamespace
      && name !== "html" && name !== "body"
  }

  #conversionKeys(widget: Element, kind: "convertFrom" | "convertTo") {
    return Object.entries(widgetDeclarations(widget, kind)).flatMap(([key, method]) =>
      widgetConversionMethod(widget, method) ? [key] : [])
  }

  #importTags(widgetTag: string, constructor: CustomElementConstructor) {
    try {
      // A static map lets packages advertise imports without creating an instance.
      const declaration = (constructor as unknown as Declarations).convertFrom
      if(isDeclarationMap(declaration)) return Object.keys(declaration).filter(name =>
        typeof declaration[name] === "function" || typeof declaration[name] === "string")
      let tags = this.#defaultImports.get(constructor)
      if(!tags) {
        const probe = document.createElement(widgetTag)
        tags = this.#conversionKeys(probe, "convertFrom")
        this.#defaultImports.set(constructor, tags)
      }
      return tags
    }
    catch { return [] }
  }

  #canConvert(source: Element, parent: Element) {
    const root = getDocumentRoot()
    return this.isEnabled && !this.editor.isEditingLocked && source.parentElement === parent && source !== root
      && root.contains(source) && !boardLayoutRole(source) && !slideLayoutRole(source)
      && this.editor.allows("edit", source) && this.editor.allows("delete", source) && this.editor.allows("insert", parent)
  }

  #canConvertFile(widget: Element) {
    return this.isEnabled && !this.editor.isEditingLocked && getDocumentRoot().contains(widget)
      && this.isWidget(widget) && !widget.hasAttribute("is") && this.editor.allows("edit", widget)
  }

  #selectedConversion() {
    const selection = this.editor.features.selection
    if(!this.isEnabled || this.editor.isEditingLocked || selection.isInDragSelection
      || $.isMultiElementSelection || this.editor.features.table.hasCellSelection) return null
    const widgetTags = [...new Set([...this.editor.schema.getGroupMembers("widget"), ...this.editor.schema.getGroupMembers("widgetinline")])]
    if(!widgetTags.length) return null
    const root = getDocumentRoot()
    const selected = selection.captureSelectedElement ?? selection.selectedSectionElement ?? $.selectedElement ?? this.editor.features.manipulation.styleTarget
    const atomic = atomicEditingContainer(selected, this.editor.schema)
    const source = atomic ?? selected
    const figureContent = captionedFigureContent(source)
      ?? (source.matches("figure:not([is])") && source.childElementCount === 1 ? source.firstElementChild : null)
    const candidates = figureContent ? [source, figureContent] : [source]
    // The caret inside a list item can address its list, but never cross a
    // widget host to reinterpret content outside that widget.
    for(let ancestor = source; ancestor !== root && !ancestor.localName.includes("-") && !ancestor.hasAttribute("is");) {
      const parent = ancestor.parentElement
      if(!parent || parent === root) break
      candidates.push(parent)
      ancestor = parent
    }
    for(const element of candidates) {
      const parent = element.parentElement
      if(!parent || element.namespaceURI !== htmlNamespace || element.hasAttribute("is")) continue
      const widget = this.isWidget(element)
      const canTransfer = widget && this.#canConvertFile(element)
      const canReplace = this.#canConvert(element, parent)
      const outputFormats = widget && (canTransfer || canReplace) ? this.#conversionKeys(element, "convertTo") : []
      const imports = canTransfer ? this.#conversionKeys(element, "convertFrom").filter(isWidgetFileFormat) : []
      const exports = canTransfer ? outputFormats.filter(isWidgetFileFormat) : []
      let targets: string[] = []
      if(canReplace) {
        if(widget) targets = outputFormats.filter(tag => this.#baseTag(tag))
        else if(this.#baseTag(element.localName)) targets = widgetTags.filter(tag => {
          const constructor = customElements.get(tag)
          return constructor && this.#importTags(tag, constructor).includes(element.localName)
            && this.editor.schema.canReplace(element, this.editor.schema.create(tag, getInertDocument(element)))
        })
      }
      if(targets.length || imports.length || exports.length) return {element, parent, widget, targets, imports, exports}
    }
    return null
  }

  getConversionState(): WidgetConversionState | null {
    const selected = this.#selectedConversion()
    if(!selected) return null
    const {element, targets, imports, exports} = selected
    return {sourceId: elementAttributeTargetId(element), targets: targets.map(tag => ({tag, ...getElementPresentation(tag)})),
      ...(imports.length ? {imports} : {}), ...(exports.length ? {exports} : {})}
  }

  /** File imports prepare asynchronously and commit synchronously to the same widget. */
  async convertFile(sourceId: string, direction: "convertFrom" | "convertTo", format: string, file?: File) {
    const selected = this.#selectedConversion()
    const importing = direction === "convertFrom"
    if(!selected?.widget || elementAttributeTargetId(selected.element) !== sourceId
      || !(importing ? selected.imports : selected.exports).includes(format)) return false
    const {element: widget} = selected
    if(this.#runningActions.has(widget)) return false
    if(importing && (!(file instanceof File) || !matchesWidgetFileFormat(file, format))) {
      throw new TypeError(`Choose a ${format} file to import.`)
    }
    const method = widgetConversionMethod(widget, widgetDeclarations(widget, direction)[format])
    if(!method) return false
    const snapshot = importing ? clearEditorArtifacts(cloneInert(widget, true), [], this.isWidget) : null
    const current = () => this.#canConvertFile(widget)
      && widgetConversionMethod(widget, widgetDeclarations(widget, direction)[format])
      && (!snapshot || snapshot.isEqualNode(clearEditorArtifacts(cloneInert(widget, true), [], this.isWidget)))
    const signal = this.#fileConversions.signal
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancel: (() => void) | undefined
    this.#runningActions.add(widget)
    try {
      const deadline = new Promise<null>((resolve, reject) => {
        cancel = () => resolve(null)
        signal.addEventListener("abort", cancel, {once: true})
        timer = setTimeout(() => reject(new Error("The widget file conversion timed out.")), widgetOperationTimeout)
      })
      const result: unknown = await Promise.race([deadline, importing ? method.call(widget, file) : method.call(widget)])
      if(signal.aborted || result === null || result === false) return false
      if(!current()) throw new Error("The widget changed before the file conversion finished.")
      if(!importing) {
        if(!(result instanceof File) || !result.name || !matchesWidgetFileFormat(result, format)) {
          throw new TypeError(`The widget must return a ${format} file.`)
        }
        return result
      }
      if(typeof result !== "function") throw new TypeError("A file importer must return a function that applies the imported content.")
      const end = this.editor.doc.beginUndoGroup()
      try {
        if(!current()) throw new Error("The widget changed before the import could be applied.")
        result.call(widget)
      }
      finally { end() }
      return true
    }
    finally {
      if(cancel) signal.removeEventListener("abort", cancel)
      clearTimeout(timer)
      this.#runningActions.delete(widget)
      if(this.isEnabled) this.editor.postSelectionPath()
    }
  }

  /** Prepare the replacement off document, then commit it as one DOM edit. */
  convertElement(sourceId: string, target: string) {
    const selected = this.#selectedConversion()
    if(!selected || elementAttributeTargetId(selected.element) !== sourceId || !selected.targets.includes(target)) return false
    const {element, parent, widget} = selected
    let detached: Element | DocumentFragment
    if(widget) {
      const method = widgetConversionMethod(element, widgetDeclarations(element, "convertTo")[target])
      const output: unknown = method?.call(element)
      if(!(output instanceof Element || output instanceof DocumentFragment) || output instanceof ShadowRoot
        || output.isConnected || output.parentNode) return false
      detached = output
    }
    else {
      const replacement = document.createElement(target)
      const method = widgetConversionMethod(replacement, widgetDeclarations(replacement, "convertFrom")[element.localName])
      if(!method || !this.isWidget(replacement)) return false
      const copy = clearEditorArtifacts(cloneInert(element, true), [], this.isWidget)
      const fragment = copy.ownerDocument!.createDocumentFragment()
      fragment.append(copy)
      const result = method.call(replacement, fragment)
      if((result !== undefined && result !== true) || replacement.isConnected || replacement.parentNode) return false
      detached = replacement
    }
    const nodes = detached instanceof Element ? [detached] : Array.from(detached.childNodes)
    const elements = nodes.filter((node): node is Element => node instanceof Element)
    if(!elements.length || nodes.some(node => node instanceof Element
      ? node.namespaceURI !== htmlNamespace || node.localName !== target || node.hasAttribute("is")
        || node.matches(".◆editor-only, [data-webwriter-editor-only]")
      : node.nodeType !== Node.COMMENT_NODE && !(node instanceof Text && !node.data.trim()))) return false
    clearEditorArtifacts(detached, [], this.isWidget)
    const fits = () => this.#canConvert(element, parent) && this.editor.schema.isContentValid(parent,
      Array.from(parent.childNodes).flatMap(node => node === element ? nodes : [node]))
    if(!fits()) return false
    const end = this.editor.doc.beginUndoGroup()
    try {
      if(!fits()) return false
      element.replaceWith(...nodes)
      if(widget) this.#clearEditable(element)
      if(elements.length === 1) {
        if(this.isWidget(elements[0])) this.editor.features.selection.captureElement(elements[0])
        else this.editor.features.selection.selectElement(elements[0])
      }
      else if(elements.every(node => node.parentElement === parent)) {
        const selection = this.editor.features.selection
        const range = document.createRange()
        range.setStartBefore(elements[0])
        range.setEndAfter(elements[elements.length - 1])
        selection.selectDropRange(range, {scrollIntoView: false})
        $.selectRange(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
        selection.processSelection()
      }
    }
    finally { end() }
    this.editor.postSelectionPath()
    return true
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
    const options = Object.entries(widgetDeclarations(widget, "options")).map(([name, rawDeclaration]) => {
      const option = readWidgetOption(widget, name, rawDeclaration, locale)
      if(option.type === "reference" && !this.#observingReferences) {
        this.#observingReferences = true
        this.#observer?.observe(document.body, {childList: true, subtree: true, attributes: true, attributeOldValue: true, characterData: true})
      }
      return this.#referenceOption(widget, option)
    })
    const effects = widgetEffectDeclarations(widget)
    const effectState = effects.size ? inspectWidgetEffects(document.body, widget, this.isWidget) : undefined
    if(effectState) {
      this.#observingEffects = true
      const {choices, statuses} = effectState
      for(const [attribute, effect] of effects) {
        if(!this.#editableEffectAttribute(attribute)) continue
        const raw = widget.getAttribute(attribute)
        const reference = raw && parseWidgetEffectReference(raw)
        const value = reference ? widgetEffectReference(reference.id, reference.name) : raw
        const status = statuses?.get(attribute)
        const previous = this.#rejectedEffects.get(widget)?.get(attribute)
        const problem = previous && validateWidgetEffect(document.body, widget, attribute, previous, this.isWidget)
        if(previous && !problem) this.#rejectedEffects.get(widget)?.delete(attribute)
        const description = problem || status?.message
        options.push({
          ...widgetOptionState(attribute, {...effect, type: "select", control: "select", placeholder: "Disconnected"}, value, locale),
          name: `${effectOptionPrefix}${attribute}`, attribute, choices,
          ...(description ? {description} : {}),
        })
      }
    }
    const actions = Object.entries(widgetDeclarations(widget, "actions"))
      .filter(([name]) => typeof (widget as unknown as Record<string, unknown>)[name] === "function")
      .map(([name, declaration]) => ({...widgetActionState(name, declaration, locale),
        ...(this.#runningActions.has(widget) ? {busy: true} : {}),
        ...(this.#actionErrors.get(widget)?.has(name) ? {error: this.#actionErrors.get(widget)!.get(name)} : {}),
      }))
    const groups = Object.entries(widgetDeclarations(widget, "optionGroups"))
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
    return widgetReferenceOption(widget, option, document.body, this.isWidget, document)
  }

  #permissionOption(widget: Element, name: string, raw: unknown) {
    if(!isDeclarationMap(raw)) return null
    const declaration = widgetOptionDeclaration(widget, name, {...raw, type: Boolean})
    const option = widgetOptionState(name, declaration, false, this.#locale())
    const attribute = option.attribute
    if(option.hidden || !attribute || !/^[a-z_][a-z0-9_.-]*$/i.test(attribute)
      || isUnsafeElementAttributeName(attribute) || isEditorOnlyElementAttribute(attribute)
      || ["style", "class", "is", "id", "contenteditable"].includes(attribute.toLowerCase())) return null
    return {...option, attribute, value: widget.hasAttribute(attribute)}
  }

  getPermissions(widget: Element): WidgetPermissionState[] {
    if(!this.isWidget(widget) || !document.body.contains(widget)) return []
    return Object.entries(widgetDeclarations(widget, "permissions")).flatMap(([name, raw]) => {
      const option = this.#permissionOption(widget, name, raw)
      if(!option) return []
      const {label, description, disabled, disabledReason, readOnly, value} = option
      return [{name, label, description, disabled, disabledReason, readOnly, value}]
    })
  }

  setPermission(widget: Element, name: string, value: boolean) {
    if(this.editor.isEditingLocked || this.editor.options.reader || !this.isWidget(widget)
      || !document.body.contains(widget) || typeof value !== "boolean") return false
    const declarations = widgetDeclarations(widget, "permissions")
    const option = Object.hasOwn(declarations, name) ? this.#permissionOption(widget, name, declarations[name]) : null
    if(!option || option.disabled || option.readOnly) return false
    if(option.value !== value) {
      const end = this.editor.doc.beginUndoGroup()
      try { widget.toggleAttribute(option.attribute, value) }
      finally { end() }
    }
    this.editor.postSelectionPath()
    return true
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
    const current = effective ?? emptyDistributionConfig()
    const config: DistributionConfig = {...current, scope}
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
        const current = effective?.config ?? emptyDistributionConfig()
        updated = {...current, scope: grouping ? "group" : "all"}
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
    const declarations = widgetDeclarations(widget, "options")
    if(!Object.hasOwn(declarations, name) && name.startsWith(effectOptionPrefix)) {
      return this.#setEffect(widget, name.slice(effectOptionPrefix.length), value, notify)
    }
    const declaration = widgetOptionDeclaration(widget, name, declarations[name])
    if(!Object.hasOwn(declarations, name)) throw new TypeError(`The widget has no option '${name}'`)
    const option = this.#referenceOption(widget, widgetOptionState(name, declaration, value, this.#locale()))
    if(option.hidden || option.disabled || option.readOnly || !validWidgetOptionValue(option, value, widget)) return false
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

  #editableEffectAttribute(attribute: string) {
    return !isUnsafeElementAttributeName(attribute) && !isEditorOnlyElementAttribute(attribute)
      && !["style", "class", "is", "id", "contenteditable"].includes(attribute)
  }

  #setEffect(widget: Element, attribute: string, value: WidgetOptionValue, notify: boolean) {
    if(this.editor.options.reader || !this.editor.allows("edit", widget) || !this.#editableEffectAttribute(attribute)
      || !widgetEffectDeclarations(widget).has(attribute) || value !== null && typeof value !== "string") return false
    if(value) {
      const problem = validateWidgetEffect(document.body, widget, attribute, value, this.isWidget)
      if(problem) {
        let rejected = this.#rejectedEffects.get(widget)
        if(!rejected) this.#rejectedEffects.set(widget, rejected = new Map())
        rejected.set(attribute, value)
        this.editor.postSelectionPath()
        return false
      }
    }
    this.#rejectedEffects.get(widget)?.delete(attribute)
    if((value || null) !== widget.getAttribute(attribute)) {
      const end = this.editor.doc.beginUndoGroup()
      try {
        if(value) widget.setAttribute(attribute, value)
        else widget.removeAttribute(attribute)
      }
      finally { end() }
    }
    if(notify) this.editor.postSelectionPath()
    return true
  }

  /** Runs a declared widget action as one undo step. Asynchronous actions
   * keep the step open until they settle or time out. */
  async runAction(widget: Element, name: string, confirmed = false, files?: File[]) {
    if(this.editor.isEditingLocked || !document.body.contains(widget) || !this.isWidget(widget)) return false
    const declarations = widgetDeclarations(widget, "actions")
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
          new Promise(resolve => { timer = setTimeout(resolve, widgetOperationTimeout) }),
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
      const current = widgetActionState(name, widgetDeclarations(widget, "actions")[name], this.#locale())
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
      if(record.attributeName === "contenteditable" && record.attributeNamespace === null && record.target instanceof Element) {
        const widget = record.target
        if(!document.body.contains(widget) || !this.isWidget(widget)) continue
        if(!this.editor.allows("edit", widget)) this.#clearEditable(widget)
        else if(record.oldValue && !widget.hasAttributeNS(null, "contenteditable")) widget.setAttributeNS(null, "contenteditable", "")
        continue
      }
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
    if(this.#fileConversions.signal.aborted) this.#fileConversions = new AbortController()
    super.enable()
    const Observer = document.defaultView?.MutationObserver ?? MutationObserver
    this.#observer = new Observer(this.#handleMutations)
    this.#observer.observe(document.body, {childList: true, subtree: true, attributeOldValue: true, attributeFilter: ["contenteditable"]})
    this.refresh()
    this.#effects = mountWidgetEffects(document.body, {
      supports: this.isWidget,
      onChange: () => { if(this.#observingEffects) this.#queueOptionsRefresh() },
    })
  }

  disable() {
    if(!this.isEnabled) return
    this.#fileConversions.abort()
    this.#closeLegacyOptions()
    this.#observer?.disconnect()
    this.#observer = null
    this.#observingReferences = false
    this.#observingEffects = false
    this.#effects?.destroy()
    this.#effects = undefined
    this.#pendingFileAction?.cancel()
    document.body.querySelectorAll('[contenteditable=""]').forEach(element => this.#clearEditable(element))
    super.disable()
  }
}
