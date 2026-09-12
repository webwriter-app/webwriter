import {EditorFeature} from "."
import {aiEditReviewEvent, type AIEditReviewAction} from "../editor-bridge"
import type {DOMChangePreview} from "../domdoc"
import {stripActiveContent} from "../active-content"
import {isMarkElement} from "../marks"
import {cloneRangeContents, cloneWithoutEditorMarkers, removeEditorMarker, uiMotionDisabled, atomicEditingContainer, cloneInert, getInertDocument} from "../utility"
import {aiPage, type AIReadDocumentOptions, type AIInspectOptions, type AIChangeOperation, type AIInsertPosition} from "../ai-tools"
import {htmlElementCapabilities} from "../html-element-capabilities"
import {elementStyleCategories} from "../element-styles"
import {layoutPresets} from "../layouts"

const maximumAIHTMLLength = 1_000_000
const aiOnlyAttributes = new Set(["contenteditable", "spellcheck", "data-webwriter-editor-only"])
const aiHTMLInsertion = (tag: string) => {
  const capability = htmlElementCapabilities[tag as keyof typeof htmlElementCapabilities]
  return ["dialog", "hgroup", "iframe"].includes(tag) || Boolean(capability && !capability.intentionallyRestricted
    && capability.insertion !== "none" && !["style", "link", "base", "meta", "title", "object", "embed"].includes(tag))
}

const checkedAIHTML = (html: unknown) => {
  if(typeof html !== "string") throw new TypeError("The replacement HTML must be a string")
  if(html.length > maximumAIHTMLLength) throw new RangeError("The proposed HTML is too large to apply safely")
  return html
}

const serializeFragment = (fragment: DocumentFragment) => {
  const container = fragment.ownerDocument.createElement("div")
  container.append(fragment)
  return container.innerHTML
}

/** Realm-independent state transfer used when package changes reload the
 * iframe and, with it, the custom-element registry. */
export class StateFeature extends EditorFeature {
  private readonly aiReadPrefix = crypto.randomUUID()
  private aiReadSequence = 0
  private readonly aiTargets = new Map<string, {node: Node, parent: Node | null, html: string, complete: boolean}>()
  private readonly aiRanges = new Map<string, {range: Range, html: string, identity: Set<Node>}>()
  private activeAIEditId: string | null = null
  private aiEditSequence = 0
  private readonly aiEditMarkers = new Map<string, string>()
  private readonly aiEditResults = new Map<string, {scope: "document" | "selection" | "operations", removedUnsafeItems: number}>()
  private reviewToolbar: HTMLElement | null = null
  private aiPreview: DOMChangePreview | null = null
  private htmlEditRange: Range | null = null
  private htmlEditSnapshot: string | null = null
  private htmlEditIdentity = new Set<Node>()
  private htmlEditPending = false
  private readonly htmlEditTargets = new Set<HTMLElement>()
  private readonly htmlEditLock = {}

  private aiHTML(node: Node, contents = false): string {
    const range = document.createRange()
    if(contents || node === document.body) range.selectNodeContents(node)
    else range.selectNode(node)
    return this.serializeHTMLRange(range)
  }

  private aiTarget(node: Node, complete = true) {
    const id = `${this.aiReadPrefix}/${++this.aiReadSequence}`
    this.aiTargets.set(id, {node, parent: node.parentNode, html: this.aiHTML(node), complete})
    if(this.aiTargets.size > 1000) this.aiTargets.delete(this.aiTargets.keys().next().value!)
    return id
  }

  private resolveAITarget(id: string, verify = false) {
    const target = this.aiTargets.get(id)
    if(!target || !document.body.contains(target.node) || target.node.parentNode !== target.parent
      || verify && (!target.complete || this.aiHTML(target.node) !== target.html)) {
      throw new Error("The target changed or the read was incomplete; read the current target again")
    }
    const atomic = atomicEditingContainer(target.node, this.editor.schema)
    if(atomic && atomic !== target.node) throw new Error("Widget internals are atomic; target the widget host")
    return target.node
  }

  private aiNodeInfo(node: Node, complete = false) {
    const element = node instanceof Element ? node : null
    return {
      target: this.aiTarget(node, complete),
      nodeType: node.nodeType,
      tagName: element?.localName ?? null,
      namespaceURI: element?.namespaceURI ?? null,
      text: (node.textContent ?? "").slice(0, 200),
      childCount: node.childNodes.length,
      atomic: Boolean(element && atomicEditingContainer(element, this.editor.schema) === element),
    }
  }

  private readAIDocument(options: AIReadDocumentOptions) {
    if(options.mode !== undefined && !["html", "outline"].includes(options.mode)) throw new TypeError("Unknown document read mode")
    if(options.includeHead !== undefined && typeof options.includeHead !== "boolean") throw new TypeError("includeHead must be boolean")
    const node = options.target === undefined ? document.body : this.resolveAITarget(options.target)
    const outline = options.mode === "outline"
    const {offset, limit} = aiPage(options, outline ? 50 : 200000)
    const html = this.aiHTML(node)
    const children = node instanceof Element && atomicEditingContainer(node, this.editor.schema) === node ? [] : Array.from(node.childNodes)
    const total = outline ? children.length : html.length
    const nextOffset = offset + limit < total ? offset + limit : undefined
    return {
      target: this.aiTarget(node, !outline && offset === 0 && nextOffset === undefined),
      ...(outline ? {nodes: children.slice(offset, offset + limit).map(child => this.aiNodeInfo(child))}
        : {html: html.slice(offset, offset + limit), text: (node.textContent ?? "").slice(offset, offset + limit)}),
      offset, total, nextOffset, truncated: offset > 0 || nextOffset !== undefined,
      ...(options.includeHead ? {head: this.editor.features.head.state(), headWritable: false} : {}),
    }
  }

  private inspectAIElements(options: AIInspectOptions) {
    const {offset, limit} = aiPage(options)
    if(options.selector !== undefined && (typeof options.selector !== "string" || options.selector.length > 1000)) throw new TypeError("Provide a bounded CSS selector")
    if(options.targets !== undefined && (!Array.isArray(options.targets) || options.targets.length > 50 || options.targets.some(id => typeof id !== "string"))) throw new TypeError("Provide up to 50 target IDs")
    const properties = options.properties ?? []
    if(!Array.isArray(properties) || properties.length > 50 || properties.some(name => typeof name !== "string" || name.length > 100)) throw new TypeError("Provide up to 50 CSS property names")
    if(!options.targets && !options.selector) throw new TypeError("Provide target IDs or a CSS selector")
    const nodes = options.targets ? options.targets.map(id => this.resolveAITarget(id)) : Array.from(document.body.querySelectorAll(options.selector!))
    const elements = nodes.filter((node): node is Element => node instanceof Element
      && (!atomicEditingContainer(node, this.editor.schema) || atomicEditingContainer(node, this.editor.schema) === node))
    return {
      elements: elements.slice(offset, offset + limit).map(element => {
        const html = this.aiHTML(element)
        const clone = cloneWithoutEditorMarkers(element, false, {inert: true})
        return {
          ...this.aiNodeInfo(element, html.length <= 10000),
          html: html.slice(0, 10000), truncated: html.length > 10000,
          attributes: Object.fromEntries(Array.from(clone.attributes, attr => [attr.name, attr.value])),
          style: this.editor.features.manipulation.getStyleState(properties, element, false),
        }
      }),
      total: elements.length, nextOffset: offset + limit < elements.length ? offset + limit : undefined,
    }
  }

  private aiInsertionRange(target: Node, position: AIInsertPosition) {
    const range = document.createRange()
    if(position === "before" || position === "after") {
      if(target === document.body) throw new Error("Cannot insert outside the document body")
      range.selectNode(target)
      range.collapse(position === "before")
    }
    else if(position === "prepend" || position === "append") {
      if(!(target instanceof Element) || atomicEditingContainer(target, this.editor.schema) === target) throw new Error("Insert beside an atomic element, not inside it")
      range.selectNodeContents(target)
      range.collapse(position === "prepend")
    }
    else throw new TypeError("Choose before, after, prepend, or append")
    return range
  }

  private aiFragment(html: string, range: Range, availableWidgets: string[]) {
    const context = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement!
    const inert = getInertDocument(context)
    const parsingContext = cloneInert(context)
    parsingContext.innerHTML = checkedAIHTML(html)
    const fragment = inert.createDocumentFragment()
    fragment.append(...Array.from(parsingContext.childNodes))
    const existing = cloneRangeContents(range)
    this.editor.clearEditingArtifacts(existing)
    const retainedElements = Array.from(existing.querySelectorAll("*"))
    if(stripActiveContent(fragment, {allowIframes: true, removeClass: name => name.startsWith("◆"), removeAttribute: attr => aiOnlyAttributes.has(attr.name.toLowerCase())})) {
      throw new Error("The proposed HTML contains unsupported active content or editor attributes; remove them and retry")
    }
    const visit = (root: ParentNode) => {
      for(const element of root.querySelectorAll("*")) {
        if(element.hasAttribute("is")) throw new Error("Customized built-in elements are not available for AI insertion")
        const existingIndex = retainedElements.findIndex(authored => authored.isEqualNode(element))
        if(existingIndex >= 0) retainedElements.splice(existingIndex, 1)
        else if(element.namespaceURI === "http://www.w3.org/1999/xhtml") {
          if(element.localName.includes("-")) {
            if(!availableWidgets.includes(element.localName) || !customElements.get(element.localName)) throw new Error(`Widget ${element.localName} is unavailable or undocumented; read list_widgets and its README, or use native HTML`)
          }
          else if(!aiHTMLInsertion(element.localName)) throw new Error(`AI insertion of <${element.localName}> is unavailable; read editor capabilities and choose a supported element`)
        }
        if(element.localName === "template") visit((element as HTMLTemplateElement).content)
      }
    }
    visit(fragment)
    return fragment
  }

  private prepareAIOperations(operations: AIChangeOperation[], availableWidgets: string[]) {
    if(!Array.isArray(operations) || !operations.length || operations.length > 50) throw new TypeError("Provide between 1 and 50 focused operations")
    if(JSON.stringify(operations).length > maximumAIHTMLLength) throw new RangeError("The proposed operation batch is too large")
    if(!Array.isArray(availableWidgets) || availableWidgets.some(tag => typeof tag !== "string")) throw new TypeError("Invalid widget capabilities")
    const invalidated = new Set<Node>()
    const targets = new Set<Node>()
    const resolve = (id: string) => {
      const node = this.resolveAITarget(id, true)
      if([...invalidated].some(previous => previous === node || previous.contains(node))) throw new Error("Operations overlap a removed/replaced target; combine the changes into one operation")
      targets.add(node)
      return node
    }
    const prepared = operations.map(operation => {
      if(!operation || typeof operation !== "object") throw new TypeError("Invalid document operation")
      if(operation.type === "replace_selection") {
        const saved = this.aiRanges.get(operation.selectionId)
        if(!saved || saved.html.length > 100000 || !saved.range.startContainer.isConnected || !saved.range.endContainer.isConnected
          || [...saved.identity].some(node => !node.isConnected) || this.serializeHTMLRange(saved.range) !== saved.html) throw new Error("The saved selection changed; read the current selection again")
        const range = saved.range.cloneRange()
        for(const endpoint of [range.startContainer, range.endContainer]) {
          if(atomicEditingContainer(endpoint, this.editor.schema)) throw new Error("Select the whole atomic element before replacing it")
          if([...invalidated].some(node => node.contains(endpoint))) throw new Error("Operations overlap the saved selection")
        }
        const fragment = this.aiFragment(operation.html, range, availableWidgets)
        saved.identity.forEach(node => invalidated.add(node))
        const fallback = range.commonAncestorContainer
        targets.add(fallback)
        return () => {
          if(!range.startContainer.isConnected || !range.endContainer.isConnected
            || [...saved.identity].some(node => !node.isConnected) || this.serializeHTMLRange(range) !== saved.html) throw new Error("An earlier operation changed the saved selection; combine the overlapping changes")
          const nodes = Array.from(fragment.childNodes)
          range.deleteContents()
          range.insertNode(fragment)
          nodes.forEach(node => targets.add(node))
        }
      }
      const target = resolve(operation.target)
      if(operation.type === "set_text") {
        if(typeof operation.text !== "string" || operation.text.length > maximumAIHTMLLength) throw new TypeError("Provide bounded replacement text")
        if(target === document.body || target instanceof Element && (target.children.length || atomicEditingContainer(target, this.editor.schema))) throw new Error("set_text needs a text node or a text-only native element")
        return () => { target.textContent = operation.text }
      }
      if(operation.type === "set_attributes") {
        if(!(target instanceof Element) || !operation.attributes || typeof operation.attributes !== "object" || Array.isArray(operation.attributes)) throw new TypeError("Provide an element and authored attributes")
        const clone = cloneInert(target)
        if(target.localName.includes("-") && !availableWidgets.includes(target.localName)) throw new Error("Read this widget's README before configuring it")
        for(const [name, value] of Object.entries(operation.attributes)) {
          if(value !== null && typeof value !== "string" || name === "style") throw new TypeError("Use strings/null for attributes and set_styles for CSS")
          this.editor.features.manipulation.setAuthoredElementAttribute(clone, name, value)
        }
        return () => Object.entries(operation.attributes).forEach(([name, value]) => this.editor.features.manipulation.setAuthoredElementAttribute(target, name, value))
      }
      if(operation.type === "set_styles" || operation.type === "set_layout") {
        if(!(target instanceof Element)) throw new TypeError("Styles need an element target")
        if(target.localName.includes("-") && !availableWidgets.includes(target.localName)) throw new Error("Read this widget's README before configuring it")
        const preset = operation.type === "set_layout" ? layoutPresets.find(preset => preset.id === operation.preset) : undefined
        if(operation.type === "set_layout" && (!preset || atomicEditingContainer(target, this.editor.schema) === target)) throw new Error("Choose an available layout preset and a native container")
        const styles = operation.type === "set_styles" ? operation.styles : preset!.styles
        const entries = this.editor.features.manipulation.validateElementStyles(styles)
        const fragment = getInertDocument().createDocumentFragment()
        const probe = getInertDocument().createElement("div")
        for(const {name, value, priority} of entries) if(value !== null) probe.style.setProperty(name, value, priority)
        fragment.append(probe)
        if(stripActiveContent(fragment)) throw new Error("Unsupported active CSS in proposal")
        return () => {
          if(!document.body.contains(target)) throw new Error("The style target is unavailable")
          this.editor.features.manipulation.setElementStyles(target, styles)
          if(preset) for(const child of target.children) this.editor.features.manipulation.setElementStyles(child, preset.itemStyles)
        }
      }
      if(operation.type === "remove") {
        if(target === document.body) throw new Error("Cannot remove the document body")
        invalidated.add(target)
        targets.add(target.parentNode!)
        return () => target.parentNode!.removeChild(target)
      }
      if(operation.type === "move") {
        if(target === document.body) throw new Error("Cannot move the document body")
        const destination = resolve(operation.destination)
        if(target === destination || target.contains(destination)) throw new Error("Cannot move a node into itself")
        this.aiInsertionRange(destination, operation.position)
        invalidated.add(target)
        return () => this.aiInsertionRange(destination, operation.position).insertNode(target)
      }
      if(operation.type === "insert_widget") throw new Error("Resolve the widget package before previewing")
      if(!["insert_html", "replace_html", "replace_document", "insert_layout"].includes(operation.type)) throw new TypeError("Unsupported document operation")
      let range: Range
      let source: string
      if(operation.type === "insert_html" || operation.type === "insert_layout") {
        range = this.aiInsertionRange(target, operation.position)
        if(operation.type === "insert_layout") {
          const preset = layoutPresets.find(preset => preset.id === operation.preset)
          if(!preset) throw new Error("Choose an available layout preset")
          const section = getInertDocument().createElement("section")
          Object.entries(preset.styles).forEach(([name, value]) => section.style.setProperty(name, value))
          for(let index = 0; index < preset.items; index++) {
            const paragraph = getInertDocument().createElement("p")
            Object.entries(preset.itemStyles).forEach(([name, value]) => paragraph.style.setProperty(name, value))
            section.append(paragraph)
          }
          source = section.outerHTML
        }
        else source = operation.html
      }
      else {
        if((operation.type === "replace_document") !== (target === document.body)) throw new Error("Use replace_document only for an explicit whole-body rewrite")
        range = document.createRange()
        if(target === document.body) range.selectNodeContents(target)
        else range.selectNode(target)
        invalidated.add(target)
        source = operation.html
      }
      const fragment = this.aiFragment(source, range, availableWidgets)
      return () => {
        const nodes = Array.from(fragment.childNodes)
        const current = operation.type === "insert_html" || operation.type === "insert_layout"
          ? this.aiInsertionRange(target, operation.position) : document.createRange()
        if(operation.type === "replace_document") current.selectNodeContents(target)
        else if(operation.type === "replace_html") current.selectNode(target)
        current.deleteContents()
        current.insertNode(fragment)
        nodes.forEach(node => targets.add(node))
      }
    })
    return () => {
      prepared.forEach(apply => apply())
      return {scope: "operations" as const, removedUnsafeItems: 0, nodes: [...targets].filter(node => document.body.contains(node))}
    }
  }

  get isHTMLSelectionEditPending() {
    return this.htmlEditPending
  }

  allowsActionDuringHTMLSelectionEdit(type: string) {
    return !this.htmlEditPending || [
      "setHTMLSelectionEditPending",
      "applyHTMLSelectionEdit",
      "discardHTMLSelectionEdit",
    ].includes(type)
  }

  private elementAtPath(path: number[] | undefined) {
    if(!path) return null
    let node: Node | null = document.body
    for(const index of path) node = node?.childNodes.item(index) ?? null
    return node instanceof Element ? node : node?.parentElement ?? null
  }

  /** The nearest authored element which can serve as an HTML-editing root.
   * Mark-drawer wrappers are formatting belonging to their containing root. */
  private htmlSelectionRoot(node: Node | null) {
    let element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element | null
    while(element && isMarkElement(element)) element = element.parentElement
    return element
  }

  private selectedHTMLRange(fallbackPath?: number[]) {
    const selection = document.getSelection()
    const hasSelection = Boolean(selection?.rangeCount && selection.anchorNode
      && document.body.contains(selection.anchorNode))
    if(hasSelection) {
      const range = selection!.getRangeAt(0).cloneRange()
      if(!range.collapsed) return range
      const container = this.htmlSelectionRoot(range.startContainer)
      if(container && container !== document.body && document.body.contains(container)) {
        range.selectNode(container)
        return range
      }
    }

    const fallback = this.htmlSelectionRoot(this.elementAtPath(fallbackPath))
    const range = document.createRange()
    if(fallback && fallback !== document.body && document.body.contains(fallback)) range.selectNode(fallback)
    else range.selectNodeContents(document.body)
    return range
  }

  private serializeHTMLRange(range: Range) {
    const fragment = cloneRangeContents(range)
    this.editor.clearEditingArtifacts(fragment)
    return serializeFragment(fragment)
  }

  private captureHTMLSelectionIdentity(range: Range) {
    const identity = new Set<Node>()
    const visit = (node: Node) => {
      if(node !== document.body) {
        try {
          if(range.intersectsNode(node)) identity.add(node)
        }
        catch {
          return
        }
      }
      node.childNodes.forEach(visit)
    }
    visit(document.body)
    return identity
  }

  private isCurrentHTMLSelection(range: Range) {
    if(!range.startContainer.isConnected || !range.endContainer.isConnected) return false
    for(const node of this.htmlEditIdentity) if(!node.isConnected) return false
    return this.htmlEditSnapshot === this.serializeHTMLRange(range)
  }

  private pendingHTMLTargets(range: Range) {
    const exactChild = range.startContainer === range.endContainer
      && range.startContainer instanceof Element
      && range.endOffset === range.startOffset + 1
      ? range.startContainer.childNodes.item(range.startOffset)
      : null
    if(exactChild instanceof HTMLElement) return [exactChild]
    const common = range.commonAncestorContainer instanceof HTMLElement
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
    if(common && common !== document.body) return [common]
    const children = Array.from(document.body.children).filter(element => {
      try {
        return range.intersectsNode(element)
      }
      catch {
        return false
      }
    }) as HTMLElement[]
    return children.length ? children : [document.body]
  }

  private markHTMLSelectionPending() {
    const range = this.htmlEditRange
    if(!range) throw new Error("HTML selection editing has not started")
    this.pendingHTMLTargets(range).forEach(target => {
      target.classList.add("◆", "◆html-source-pending")
      this.htmlEditTargets.add(target)
    })
    document.documentElement.classList.add("◆html-source-review-active")
    this.editor.lockEditing(this.htmlEditLock)
    this.htmlEditPending = true
  }

  private clearHTMLSelectionPending() {
    this.htmlEditTargets.forEach(target => {
      removeEditorMarker(target, "◆html-source-pending")
    })
    this.htmlEditTargets.clear()
    document.documentElement.classList.remove("◆html-source-review-active")
    this.editor.unlockEditing(this.htmlEditLock)
    this.htmlEditPending = false
  }

  private restoreHTMLRange() {
    const range = this.htmlEditRange
    if(!range?.startContainer.isConnected || !range.endContainer.isConnected) return false
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return true
  }

  private discardHTMLSelectionEdit() {
    this.clearHTMLSelectionPending()
    this.restoreHTMLRange()
    this.htmlEditRange = null
    this.htmlEditSnapshot = null
    this.htmlEditIdentity.clear()
    return {status: "discarded" as const}
  }

  private applyHTMLSelectionEdit(html: string) {
    if(!this.htmlEditPending || !this.htmlEditRange) {
      throw new Error("There is no pending HTML selection change to apply")
    }
    const range = this.htmlEditRange
    if(!this.isCurrentHTMLSelection(range)) {
      throw new Error("The selected content changed before the HTML could be applied")
    }
    const {fragment, removedUnsafeItems} = this.editor.parseHTMLFragment(checkedAIHTML(html))
    const nodes = Array.from(fragment.childNodes)
    this.clearHTMLSelectionPending()
    try {
      range.deleteContents()
      range.insertNode(fragment)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      const applied = document.createRange()
      if(nodes.length && nodes[0].parentNode && nodes.at(-1)?.parentNode) {
        applied.setStartBefore(nodes[0])
        applied.setEndAfter(nodes.at(-1)!)
      }
      else {
        applied.setStart(range.startContainer, Math.min(range.startOffset, range.startContainer.childNodes.length))
        applied.collapse(true)
      }
      selection?.addRange(applied)
      this.editor.normalizeSurroundingElements(range.startContainer, ...nodes)
      this.editor.doc.syncFromDOM()
      this.htmlEditRange = null
      this.htmlEditSnapshot = null
      this.htmlEditIdentity.clear()
      return {status: "applied" as const, removedUnsafeItems}
    }
    catch(error) {
      this.htmlEditRange = range
      this.markHTMLSelectionPending()
      throw error
    }
  }

  private replaceDocument(html: string) {
    const parsed = new DOMParser().parseFromString(checkedAIHTML(html), "text/html")
    const incoming = document.createDocumentFragment()
    incoming.append(...Array.from(parsed.body.childNodes, node => document.importNode(node, true)))
    const {fragment, removedUnsafeItems} = this.editor.prepareHTMLFragment(incoming)
    const nodes = Array.from(fragment.childNodes)
    document.body.replaceChildren(...nodes)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(document.body)
    range.collapse(false)
    selection?.addRange(range)
    return {scope: "document" as const, removedUnsafeItems, nodes}
  }

  private replaceSelection(html: string) {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !document.body.contains(selection.anchorNode)) {
      throw new Error("There is no document selection to replace")
    }
    const template = document.createElement("template")
    template.innerHTML = checkedAIHTML(html)
    const {fragment, removedUnsafeItems} = this.editor.prepareHTMLFragment(template.content)
    const range = selection.getRangeAt(0)
    const nodes = Array.from(fragment.childNodes)
    const last = fragment.lastChild
    const fallbackTarget = range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement
    range.deleteContents()
    range.insertNode(fragment)
    selection.removeAllRanges()
    const caret = document.createRange()
    if(last?.parentNode) caret.setStartAfter(last)
    else caret.setStart(range.startContainer, Math.min(range.startOffset, range.startContainer.childNodes.length))
    caret.collapse(true)
    selection.addRange(caret)
    return {scope: "selection" as const, removedUnsafeItems, nodes, fallbackTarget}
  }

  private markAIEdit(editId: string, nodes: Node[], fallbackTarget?: Element | null) {
    const marker = `◆ai-edit-${++this.aiEditSequence}`
    const targets = nodes.flatMap(node => node instanceof Element
      ? [node]
      : node.parentElement ? [node.parentElement] : [])
    if(!targets.length && fallbackTarget) targets.push(fallbackTarget)
    if(!targets.length) targets.push(document.body)
    new Set(targets).forEach(target => target.classList.add(marker, "◆ai-preview-change"))
    this.aiEditMarkers.set(editId, marker)
  }

  private targetsForAIEdit(editId: string) {
    const marker = this.aiEditMarkers.get(editId)
    return marker ? Array.from(document.getElementsByClassName(marker)) as HTMLElement[] : []
  }

  private targetPath(target: Element) {
    const path: number[] = []
    let node: Node | null = target
    while(node && node !== document.body) {
      const parent: ParentNode | null = node.parentNode
      if(!parent) return null
      path.unshift(Array.from(parent.childNodes).indexOf(node as ChildNode))
      node = parent as Node
    }
    return node === document.body ? path : null
  }

  private targetAtPath(path: number[]) {
    let node: Node | null = document.body
    for(const index of path) node = node?.childNodes.item(index) ?? null
    return node instanceof Element ? node : node?.parentElement ?? null
  }

  private clearAIEditMarkers(editId: string, keepTarget = false) {
    const marker = this.aiEditMarkers.get(editId)
    this.targetsForAIEdit(editId).forEach(target => {
      target.classList.remove("◆ai-preview-change", "◆ai-preview-pulse")
      if(!keepTarget && marker) target.classList.remove(marker)
    })
    if(!keepTarget) this.aiEditMarkers.delete(editId)
  }

  private postReviewChoice(editId: string, action: AIEditReviewAction) {
    const detail = {editId, action}
    const handled = !window.dispatchEvent(new CustomEvent(aiEditReviewEvent, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    }))
    if(handled) return
    this.editor.postHostMessage({type: aiEditReviewEvent, detail})
  }

  private lockForAIReview(editId: string, summary: string) {
    this.activeAIEditId = editId
    document.documentElement.classList.add("◆ai-review-active")
    this.editor.lockEditing(this)

    this.reviewToolbar?.remove()
    const toolbar = document.createElement("aside")
    toolbar.className = "◆editor-only ◆ai-review-toolbar"
    toolbar.setAttribute("role", "dialog")
    toolbar.setAttribute("aria-label", "Review AI document change")
    toolbar.addEventListener("keydown", event => event.stopPropagation())
    const copy = document.createElement("div")
    copy.className = "◆ai-review-copy"
    const label = document.createElement("strong")
    label.textContent = "AI change preview"
    const description = document.createElement("span")
    description.textContent = summary
    copy.append(label, description)
    const actions = document.createElement("div")
    actions.className = "◆ai-review-actions"
    for(const [action, text] of [["reject", "Reject"], ["accept", "Accept"]] as const) {
      const button = document.createElement("button")
      button.type = "button"
      button.dataset.action = action
      button.textContent = text
      button.addEventListener("click", () => this.postReviewChoice(editId, action))
      actions.append(button)
    }
    toolbar.append(copy, actions)
    this.editor.addAppendix(toolbar)
    this.reviewToolbar = toolbar
  }

  private unlockAfterAIReview(editId: string) {
    if(this.activeAIEditId !== editId) return
    this.activeAIEditId = null
    this.reviewToolbar?.remove()
    this.reviewToolbar = null
    document.documentElement.classList.remove("◆ai-review-active")
    this.editor.unlockEditing(this)
  }

  private previewAIEdit(editId: string, summary: string, scope: "document" | "selection", html: string) {
    return this.previewAIChange(editId, summary, () => scope === "document" ? this.replaceDocument(html) : this.replaceSelection(html))
  }

  private previewAIChange(editId: string, summary: string, apply: () => {scope: "document" | "selection" | "operations", removedUnsafeItems: number, nodes: Node[]}) {
    if(this.activeAIEditId) throw new Error("Another AI document change is already awaiting review")
    if(this.editor.isEditingLocked) throw new Error("The editor is currently locked")
    const before = this.editor.toHTML(true)
    const preview = this.editor.doc.beginDOMPreview()
    try {
      const replacement = apply()
      if(this.editor.toHTML(true) === before) throw new Error("The proposal does not change the document")
      this.markAIEdit(editId, replacement.nodes, document.body)
      this.aiPreview = preview
      this.aiEditResults.set(editId, {scope: replacement.scope, removedUnsafeItems: replacement.removedUnsafeItems})
      this.lockForAIReview(editId, summary)
      this.gotoAIEdit(editId)
      return {status: "previewing", scope: replacement.scope, removedUnsafeItems: replacement.removedUnsafeItems}
    }
    catch(error) {
      preview.reject()
      this.aiPreview = null
      this.clearAIEditMarkers(editId)
      this.aiEditResults.delete(editId)
      this.unlockAfterAIReview(editId)
      throw error
    }
  }

  private gotoAIEdit(editId: string) {
    const target = this.targetsForAIEdit(editId)[0]
    if(!target) return {status: "unavailable", message: "The changed content is no longer in the document"}
    target.scrollIntoView?.({block: "center", behavior: uiMotionDisabled(target) ? "instant" : "smooth"})
    target.classList.remove("◆ai-preview-pulse")
    // Restart the animation when Go to is used repeatedly.
    void target.offsetWidth
    target.classList.add("◆ai-preview-pulse")
    setTimeout(() => target.classList.remove("◆ai-preview-pulse"), 1200)
    return {status: "located"}
  }
  actions = {
    previewAIOperations: ({editId, summary, operations, availableWidgets = []}: {type: "previewAIOperations", editId: string, summary: string, operations: AIChangeOperation[], availableWidgets?: string[]}) => {
      const apply = this.prepareAIOperations(operations, availableWidgets)
      return this.previewAIChange(editId, summary, apply)
    },
    snapshotState: ({}: {type: "snapshotState"}) => this.editor.doc.snapshot(),
    serializeDocument: ({offline = false}: {type: "serializeDocument", offline?: boolean}) =>
      this.editor.serializeHTML(offline),
    readAIDocument: (options: {type: "readAIDocument"} & AIReadDocumentOptions) => this.readAIDocument(options),
    inspectAIElements: (options: {type: "inspectAIElements"} & AIInspectOptions) => this.inspectAIElements(options),
    readAIEditorCapabilities: ({topic = "overview"}: {type: "readAIEditorCapabilities", topic?: string}) => {
      if(!["overview", "elements", "styles", "layouts"].includes(topic)) throw new TypeError("Unknown capability topic")
      return {
        documentModel: "The live authored DOM is authoritative. Preserve unfamiliar valid content and custom elements.",
        ...(topic === "overview" ? {
          topics: ["elements", "styles", "layouts"],
          proposalTool: "queue_document_change",
          restrictions: ["Read complete current targets before editing", "Widget internals are atomic; read README before configuring hosts", "Head writes are unavailable", "Do not add unsupported active content"],
        } : {}),
        ...(topic === "elements" ? {elements: Object.fromEntries(Object.entries(htmlElementCapabilities).map(([tag, capability]) => [tag, {
          ...capability,
          aiInsertion: aiHTMLInsertion(tag),
          ...(["dialog", "hgroup"].includes(tag) ? {aiNote: "The AI proposal path preserves this element without transfer/schema unwrapping"} : {}),
        }]))} : {}),
        ...(topic === "styles" ? {categories: elementStyleCategories, writes: "Use set_styles on an exact target; computed CSS and document head are read-only"} : {}),
        ...(topic === "layouts" ? {presets: layoutPresets, guidance: "Use an existing layout container when possible; sections are only necessary for grouping layout items"} : {}),
      }
    },
    readAISelection: ({}: {type: "readAISelection"}) => {
      const selection = document.getSelection()
      if(!selection?.rangeCount || !selection.anchorNode || !document.body.contains(selection.anchorNode)) {
        return {html: "", text: "", collapsed: true, kind: "none"}
      }
      const range = selection.getRangeAt(0)
      const fragment = cloneRangeContents(range)
      this.editor.clearEditingArtifacts(fragment)
      const html = serializeFragment(fragment)
      const selectionId = `${this.aiReadPrefix}/selection/${++this.aiReadSequence}`
      this.aiRanges.set(selectionId, {range: range.cloneRange(), html, identity: this.captureHTMLSelectionIdentity(range)})
      if(this.aiRanges.size > 32) this.aiRanges.delete(this.aiRanges.keys().next().value!)
      const container = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
      return {
        html: html.slice(0, 100_000),
        text: range.toString().slice(0, 100_000),
        collapsed: range.collapsed,
        selectionId,
        kind: this.editor.features.selection.isCaptureSelection ? "capture" : range.collapsed ? "caret"
          : range.startContainer === range.endContainer && range.endOffset === range.startOffset + 1 && range.startContainer.childNodes[range.startOffset] instanceof Element ? "element" : "range",
        context: container ? this.aiNodeInfo(container) : null,
        truncated: html.length > 100_000,
      }
    },
    beginHTMLSelectionEdit: ({path}: {type: "beginHTMLSelectionEdit", path?: number[]}) => {
      if(this.activeAIEditId) throw new Error("Finish reviewing the AI change before editing HTML")
      if(this.htmlEditPending) throw new Error("Apply or discard the pending HTML change first")
      if(path !== undefined && (!Array.isArray(path) || path.some(index => !Number.isInteger(index) || index < 0))) {
        throw new TypeError("The HTML selection path must contain non-negative integer indexes")
      }
      const range = this.selectedHTMLRange(path)
      this.htmlEditRange = range
      this.htmlEditSnapshot = this.serializeHTMLRange(range)
      this.htmlEditIdentity = this.captureHTMLSelectionIdentity(range)
      return {html: this.htmlEditSnapshot}
    },
    setHTMLSelectionEditPending: ({pending}: {type: "setHTMLSelectionEditPending", pending: boolean}) => {
      if(typeof pending !== "boolean") throw new TypeError("The pending state must be a boolean")
      if(!this.htmlEditRange) throw new Error("HTML selection editing has not started")
      if(pending === this.htmlEditPending) return {pending}
      if(pending) this.markHTMLSelectionPending()
      else this.clearHTMLSelectionPending()
      return {pending}
    },
    applyHTMLSelectionEdit: ({html}: {type: "applyHTMLSelectionEdit", html: string}) =>
      this.applyHTMLSelectionEdit(html),
    discardHTMLSelectionEdit: ({}: {type: "discardHTMLSelectionEdit"}) =>
      this.discardHTMLSelectionEdit(),
    replaceAIDocument: ({html}: {type: "replaceAIDocument", html: string}) => {
      const result = this.replaceDocument(html)
      this.editor.doc.syncFromDOM()
      return {status: "applied", scope: result.scope, removedUnsafeItems: result.removedUnsafeItems}
    },
    replaceAISelection: ({html}: {type: "replaceAISelection", html: string}) => {
      const result = this.replaceSelection(html)
      this.editor.doc.syncFromDOM()
      return {status: "applied", scope: result.scope, removedUnsafeItems: result.removedUnsafeItems}
    },
    previewAIDocument: ({editId, summary, html}: {type: "previewAIDocument", editId: string, summary: string, html: string}) =>
      this.previewAIEdit(editId, summary, "document", html),
    previewAISelection: ({editId, summary, html}: {type: "previewAISelection", editId: string, summary: string, html: string}) =>
      this.previewAIEdit(editId, summary, "selection", html),
    acceptAIEdit: ({editId}: {type: "acceptAIEdit", editId: string}) => {
      const preview = this.aiPreview
      if(this.activeAIEditId !== editId || !preview?.active) {
        throw new Error("This AI change is no longer awaiting review")
      }
      const marker = this.aiEditMarkers.get(editId)
      const targetPaths = this.targetsForAIEdit(editId).flatMap(target => {
        const path = this.targetPath(target)
        return path ? [path] : []
      })
      this.clearAIEditMarkers(editId, true)
      this.aiPreview = null
      try {
        const accepted = preview.accept(editId)
        if(accepted && marker) {
          const targets = targetPaths.flatMap(path => {
            const target = this.targetAtPath(path)
            return target ? [target] : []
          })
          new Set(targets.length ? targets : [document.body]).forEach(target => target.classList.add(marker))
        }
        const result = this.aiEditResults.get(editId)
        return {status: accepted ? "applied" : "unavailable", ...result}
      }
      catch(error) {
        if(preview.active) preview.reject()
        this.aiEditMarkers.delete(editId)
        this.aiEditResults.delete(editId)
        throw error
      }
      finally {
        this.unlockAfterAIReview(editId)
      }
    },
    rejectAIEdit: ({editId}: {type: "rejectAIEdit", editId: string}) => {
      const preview = this.aiPreview
      if(this.activeAIEditId !== editId || !preview?.active) throw new Error("This AI change is no longer awaiting review")
      this.clearAIEditMarkers(editId)
      this.aiPreview = null
      const rejected = preview.reject()
      this.aiEditResults.delete(editId)
      this.unlockAfterAIReview(editId)
      return {status: rejected ? "rejected" : "unavailable"}
    },
    gotoAIEdit: ({editId}: {type: "gotoAIEdit", editId: string}) => this.gotoAIEdit(editId),
    undoAIEdit: ({editId}: {type: "undoAIEdit", editId: string}) => {
      if(this.activeAIEditId) throw new Error("Finish reviewing the pending AI change first")
      this.clearAIEditMarkers(editId)
      const undone = this.editor.doc.undoCapturedChange(editId)
      this.aiEditResults.delete(editId)
      return {status: undone ? "undone" : "unavailable"}
    },
  } as const

  disable() {
    if(!this.isEnabled) return
    this.aiPreview?.reject()
    this.aiPreview = null
    for(const editId of this.aiEditMarkers.keys()) this.clearAIEditMarkers(editId)
    this.aiEditResults.clear()
    this.aiTargets.clear()
    this.aiRanges.clear()
    this.activeAIEditId = null
    this.reviewToolbar?.remove()
    this.reviewToolbar = null
    document.documentElement.classList.remove("◆ai-review-active")
    this.clearHTMLSelectionPending()
    this.htmlEditRange = null
    this.htmlEditSnapshot = null
    this.htmlEditIdentity.clear()
    this.editor.unlockEditing(this)
    super.disable()
  }
}
