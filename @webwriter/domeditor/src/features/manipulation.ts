import { DocumentListenerMap, EditorFeature } from "."
import { $, cloneWithoutEditorMarkers, focusedWidgetHost, markWidgetsEditable, modifierKeyDown, getContainer, getIndexBefore, getSelectionAnchorBlock, getSelectionFocusBlock, getSidesOfPoint, htmlToFragment, isElement, isOnApple } from "../utility"
import {isMarkElement} from "../marks"
import {
  isBlockFormatTag,
  type BlockFormatTag,
  type ElementStyleDeclaration,
  type ElementStyleMutation,
  type ElementStyleState,
  type HeadingGroupSelectionState,
} from "../editor-bridge"
import {paragraphStylePropertyNameSet} from "../element-styles"
import {isSectionElement, isSectionName, type SectionName} from "../sections"
import {getDocumentRoot, isDocumentRoot} from "../document-template"
import {
  elementAttributeEditability,
  isUnsafeElementAttributeValue,
  sanitizeAuthoredClass,
} from "../element-attributes"

/** Unit by which a collapsed selection is extended before deleting. */
type Granularity = "character" | "word" | "line" | "block"

type ValidatedStyleEntry = {
  name: string
  value: string | null
  priority: "" | "important"
}

function isCaretAtBoundary(element: Element, boundary: "start" | "end") {
  const selection = document.getSelection()
  if(!selection?.isCollapsed || !selection.anchorNode) {
    return false
  }
  let node: Node | null = selection.anchorNode
  let offset = selection.anchorOffset
  while(node && node !== element) {
    if(!element.contains(node)) {
      return false
    }
    const parent: Node | null = node.parentNode
    if(!parent) {
      return false
    }
    const siblings = Array.from(parent.childNodes) as ChildNode[]
    const index = siblings.indexOf(node as ChildNode)
    if(boundary === "start") {
      if(offset !== 0 || siblings.slice(0, index).some((sibling: ChildNode) => sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent)) {
        return false
      }
    }
    else {
      const length = node instanceof Text? node.length: node.childNodes.length
      if(offset !== length || siblings.slice(index + 1).some((sibling: ChildNode) => sibling.nodeType === Node.ELEMENT_NODE || sibling.textContent)) {
        return false
      }
    }
    node = parent
    offset = boundary === "start"? index: index + 1
  }
  return node === element && offset === (boundary === "start"? 0: element.childNodes.length)
}

/** Editing feature implementing content manipulation: inserting, deleting,
 * wrapping and lifting nodes, clipboard interaction (copy/cut/paste), and
 * setting attributes or styles on the selected elements. All operations work
 * on the current selection (see `EditingSelection`/`$`). */
export class ManipulationFeature extends EditorFeature {

  private activeHeadingGroup() {
    const selected = $.selectedElement
    const anchor = $.anchor
    const element = selected ?? (anchor ? getContainer(anchor) : null)
    if(!isElement(element) || isDocumentRoot(element)) return null
    return (element.matches("hgroup") ? element : element.closest("hgroup")) as HTMLElement | null
  }

  getHeadingGroupState(): HeadingGroupSelectionState | null {
    const group = this.activeHeadingGroup()
    if(!group) return null
    const heading = Array.from(group.children).find(child => /^h[1-6]$/.test(child.localName)) ?? null
    const children = Array.from(group.children)
    const headingIndex = heading ? children.indexOf(heading) : -1
    return {
      heading: heading?.localName as HeadingGroupSelectionState["heading"] ?? null,
      beforeCount: children.filter((child, index) => child.localName === "p" && headingIndex >= 0 && index < headingIndex).length,
      afterCount: children.filter((child, index) => child.localName === "p" && (headingIndex < 0 || index > headingIndex)).length,
    }
  }

  private directHeading(group: HTMLElement) {
    return Array.from(group.children).find(child => /^h[1-6]$/.test(child.localName)) as HTMLElement | undefined
  }

  setHeadingGroupLevel(level: HeadingGroupSelectionState["heading"]) {
    if(!level) throw new TypeError("A heading group requires a heading level")
    const group = this.activeHeadingGroup()
    if(!group) return
    const heading = this.directHeading(group)
    if(!heading) {
      const created = document.createElement(level)
      group.prepend(created)
      $.move(created)
      return
    }
    if(heading.localName === level) return
    const replacement = document.createElement(level)
    this.copyAuthoredAttributes(heading, replacement)
    replacement.append(...Array.from(heading.childNodes))
    const selection = document.getSelection()
    const anchorWasHeading = selection?.anchorNode === heading
    const focusWasHeading = selection?.focusNode === heading
    const anchorOffset = selection?.anchorOffset ?? 0
    const focusOffset = selection?.focusOffset ?? 0
    heading.replaceWith(replacement)
    if(selection && (anchorWasHeading || focusWasHeading)) {
      const anchorNode = anchorWasHeading ? replacement : selection.anchorNode
      const focusNode = focusWasHeading ? replacement : selection.focusNode
      if(anchorNode && focusNode) selection.setBaseAndExtent(
        anchorNode, Math.min(anchorOffset, anchorNode.childNodes.length),
        focusNode, Math.min(focusOffset, focusNode.childNodes.length),
      )
    }
  }

  addHeadingGroupText(position: "before" | "after") {
    const group = this.activeHeadingGroup()
    if(!group) return
    let heading = this.directHeading(group)
    if(!heading) {
      heading = document.createElement("h1")
      group.prepend(heading)
    }
    const paragraph = document.createElement("p")
    if(position === "before") heading.before(paragraph)
    else {
      const following = Array.from(group.children).filter(child => child.localName === "p" && child.compareDocumentPosition(heading!) & Node.DOCUMENT_POSITION_PRECEDING)
      const lastFollowing = following.at(-1)
      if(lastFollowing) lastFollowing.after(paragraph)
      else heading.after(paragraph)
    }
    $.move(paragraph)
  }

  /** Copies all authored attributes, excluding transient editor marker
   * classes, to a newly created replacement element. */
  private copyAuthoredAttributes(source: Element, target: Element) {
    Array.from(source.attributes).forEach(attribute => {
      if(attribute.name !== "class") {
        if(attribute.namespaceURI) target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
        else target.setAttribute(attribute.name, attribute.value)
        return
      }
      const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆"))
      if(classes.length) target.setAttribute("class", classes.join(" "))
    })
  }

  /** Resolves the structural elements to which a section command applies.
   * Section wrappers themselves remain transparent here; explicitly selected
   * wrappers are handled by the toolbox-specific commands below. */
  private selectedSectionTargets() {
    const root = getDocumentRoot()
    const selected = $.selectedElement

    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode
      || !selection.anchorNode.isConnected || !selection.focusNode.isConnected) return []
    if(selected === root || selected === document.body) return []
    const nearestSection = (node: Node) => {
      let element = node instanceof Element ? node : node.parentElement
      while(element && element !== root) {
        if(isSectionElement(element)) return element
        element = element.parentElement
      }
      return null
    }
    const activeSection = nearestSection(selection.anchorNode)
    if(selected && selected !== root && selected !== document.body && !isSectionElement(selected)) {
      if(activeSection?.contains(selected)) {
        let directChild: Element = selected
        while(directChild.parentElement && directChild.parentElement !== activeSection) {
          directChild = directChild.parentElement
        }
        if(directChild.parentElement === activeSection && !isSectionElement(directChild)) return [directChild]
      }
      return [selected]
    }
    if(activeSection && activeSection.contains(selection.focusNode)) {
      const directChild = (node: Node) => {
        let child: Node = node
        while(child.parentNode && child.parentNode !== activeSection) child = child.parentNode
        return child.parentNode === activeSection ? child : null
      }
      const anchorChild = directChild(selection.anchorNode)
      const focusChild = directChild(selection.focusNode)
      if(anchorChild && focusChild) {
        const children = Array.from(activeSection.childNodes)
        const anchorIndex = children.indexOf(anchorChild as ChildNode)
        const focusIndex = children.indexOf(focusChild as ChildNode)
        const first = Math.min(anchorIndex, focusIndex)
        const last = Math.max(anchorIndex, focusIndex)
        const targets = children.slice(first, last + 1).filter((node): node is Element => (
          node instanceof Element && !isSectionElement(node) && !isMarkElement(node)
        ))
        if(targets.length) return targets
      }
    }
    if(selection.isCollapsed || $.isTextSelection || $.isEmptySelection) {
      const container = getContainer(selection.anchorNode)
      return container && container !== root && container !== document.body ? [container] : []
    }

    const range = selection.getRangeAt(0)
    let container = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
    while(container && isMarkElement(container)) container = container.parentElement
    if(!container || container === root && !range.intersectsNode(root)) return []
    if(!isSectionElement(container) && container !== root && container !== document.body) return [container]

    const targets = Array.from(container.childNodes).flatMap(node => {
      if(!(node instanceof Element)) return []
      const flatten = (element: Element): Element[] => isMarkElement(element) || isSectionElement(element)
        ? Array.from(element.children).flatMap(flatten)
        : [element]
      try {
        return range.intersectsNode(node) ? flatten(node) : []
      }
      catch {
        return []
      }
    })
    const parent = targets[0]?.parentElement
    return parent && targets.every(target => target.parentElement === parent) ? targets : []
  }

  canSectionSelection() {
    return this.editor.features.selection.selectedSectionElement !== null
      || this.selectedSectionTargets().length > 0
  }

  private assertSectionName(section: string): asserts section is SectionName {
    if(!isSectionName(section)) throw new TypeError(`Unsupported section type '${section}'`)
  }

  private sectionNodes(targets: Element[]) {
    const parent = targets[0]?.parentElement
    if(!parent || !targets.length || !targets.every(target => target.parentElement === parent)) return null
    const children = Array.from(parent.childNodes)
    const indexes = targets.map(target => children.indexOf(target)).sort((first, second) => first - second)
    if(indexes.some(index => index < 0)) return null
    const first = indexes[0]
    const last = indexes.at(-1)!
    if(targets.some(target => {
      const index = children.indexOf(target)
      return index < first || index > last
    })) return null
    return {parent, nodes: children.slice(first, last + 1), first, last}
  }

  private canReplaceWithSection(parent: Element, first: number, last: number, section: Element) {
    const children = Array.from(parent.childNodes)
    const proposed = [...children]
    proposed.splice(first, last - first + 1, section)
    return this.editor.schema.isContentValid(section)
      && this.editor.schema.isContentValid(parent, proposed)
  }

  private wrapTargetsInSection(targets: Element[], type: SectionName) {
    const context = this.sectionNodes(targets)
    if(!context) return null
    const section = document.createElement(type)
    context.nodes.forEach(node => section.append(cloneWithoutEditorMarkers(node, true)))
    if(!this.canReplaceWithSection(context.parent, context.first, context.last, section)) return null

    const liveSection = document.createElement(type)
    context.nodes[0].before(liveSection)
    liveSection.append(...context.nodes)
    return liveSection
  }

  private replaceSectionType(section: Element, type: SectionName) {
    if(section.localName === type) return section
    const parent = section.parentElement
    if(!parent) return null
    const replacement = document.createElement(type)
    this.copyAuthoredAttributes(section, replacement)
    Array.from(section.childNodes).forEach(node => replacement.append(cloneWithoutEditorMarkers(node, true)))
    const index = Array.from(parent.childNodes).indexOf(section)
    if(index < 0 || !this.canReplaceWithSection(parent, index, index, replacement)) return null

    const liveReplacement = document.createElement(type)
    this.copyAuthoredAttributes(section, liveReplacement)
    liveReplacement.append(...Array.from(section.childNodes))
    section.replaceWith(liveReplacement)
    this.editor.features.selection.replaceSelectedSection(section, liveReplacement)
    return liveReplacement
  }

  private canUnwrapSection(section: Element) {
    const parent = section.parentElement
    if(!parent) return false
    const children = Array.from(parent.childNodes)
    const index = children.indexOf(section)
    if(index < 0) return false
    const proposed = [...children]
    proposed.splice(index, 1, ...Array.from(section.childNodes))
    return this.editor.schema.isContentValid(parent, proposed)
  }

  private unwrapSection(section: Element) {
    if(!isSectionElement(section) || !this.canUnwrapSection(section)) return false
    const wasSelected = this.editor.features.selection.selectedSectionElement === section
    this.editor.features.selection.clearSelectedSection(section)
    section.replaceWith(...Array.from(section.childNodes))
    if(wasSelected) {
      this.editor.features.selection.processSelection()
      this.editor.postMarkState()
    }
    return true
  }

  private directSectionForTargets(targets: Element[]) {
    const parent = targets[0]?.parentElement
    return parent && isSectionElement(parent) && targets.every(target => target.parentElement === parent)
      ? parent
      : null
  }

  /** Toggles the nearest section wrapper around the selected structural
   * elements. Adding defaults to SECTION; removing splits an existing wrapper
   * when only some of its direct children are targeted. */
  toggleSection(type: SectionName = "section") {
    this.assertSectionName(type)
    const explicitlySelected = this.editor.features.selection.selectedSectionElement
    if(explicitlySelected) return this.unwrapSection(explicitlySelected)
    const targets = this.selectedSectionTargets()
    if(!targets.length) return false
    const active = this.directSectionForTargets(targets)
    if(!active) return Boolean(this.wrapTargetsInSection(targets, type))

    const context = this.sectionNodes(targets)
    if(!context) return false
    const sectionChildren = Array.from(active.childNodes)
    const first = sectionChildren.indexOf(context.nodes[0])
    const last = sectionChildren.indexOf(context.nodes.at(-1)!)
    if(first < 0 || last < first) return false
    if(first === 0 && last === sectionChildren.length - 1) return this.unwrapSection(active)

    const parent = active.parentElement
    if(!parent) return false
    const replacements: ChildNode[] = []
    const left = sectionChildren.slice(0, first)
    const middle = sectionChildren.slice(first, last + 1)
    const right = sectionChildren.slice(last + 1)
    if(left.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false) as Element
      wrapper.append(...left.map(node => cloneWithoutEditorMarkers(node, true)))
      replacements.push(wrapper)
    }
    replacements.push(...middle.map(node => cloneWithoutEditorMarkers(node, true) as ChildNode))
    if(right.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false) as Element
      wrapper.append(...right.map(node => cloneWithoutEditorMarkers(node, true)))
      replacements.push(wrapper)
    }
    const siblings = Array.from(parent.childNodes)
    const activeIndex = siblings.indexOf(active)
    const proposed = [...siblings]
    proposed.splice(activeIndex, 1, ...replacements)
    if(!this.editor.schema.isContentValid(parent, proposed)) return false

    const liveReplacements: ChildNode[] = []
    if(left.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false) as Element
      wrapper.append(...left)
      liveReplacements.push(wrapper)
    }
    liveReplacements.push(...middle)
    if(right.length) {
      const wrapper = cloneWithoutEditorMarkers(active, false) as Element
      wrapper.append(...right)
      liveReplacements.push(wrapper)
    }
    active.replaceWith(...liveReplacements)
    return true
  }

  /** Applies a chosen type, converting the nearest active wrapper or adding a
   * new wrapper when the target is not sectioned yet. */
  setSectionType(type: SectionName) {
    this.assertSectionName(type)
    const explicitlySelected = this.editor.features.selection.selectedSectionElement
    if(explicitlySelected) return Boolean(this.replaceSectionType(explicitlySelected, type))
    const targets = this.selectedSectionTargets()
    if(!targets.length) return false
    const active = this.directSectionForTargets(targets)
    return active
      ? Boolean(this.replaceSectionType(active, type))
      : Boolean(this.wrapTargetsInSection(targets, type))
  }

  /** Adds another layer even when the target already has a section wrapper. */
  addSection(type: SectionName = "section") {
    this.assertSectionName(type)
    const selected = this.editor.features.selection.selectedSectionElement
    return Boolean(this.wrapTargetsInSection(selected ? [selected] : this.selectedSectionTargets(), type))
  }

  removeSection() {
    const selected = this.editor.features.selection.selectedSectionElement
      ?? this.directSectionForTargets(this.selectedSectionTargets())
    return selected ? this.unwrapSection(selected) : false
  }

  /** The single connected authored element targeted by element-style commands.
   * Resolve this immediately before every read or mutation: retained selection
   * endpoints may have been replaced by native, widget, or remote DOM edits.
   * With no authored selection, BODY is the document-wide styling target. */
  get styleTarget(): Element {
    const body = document.body
    const root = getDocumentRoot(body)
    const inAuthoredBody = (element: Element | null | undefined): element is Element => Boolean(
      element?.isConnected && (element === body || body.contains(element)),
    )

    const selectedTable = this.editor.features.table.hasCellSelection
      ? this.editor.features.table.selectedTable
      : null
    if(inAuthoredBody(selectedTable)) return selectedTable

    const captured = this.editor.features.selection.captureSelectedElement
    if(inAuthoredBody(captured)) return captured

    const selectedSection = this.editor.features.selection.selectedSectionElement
    if(inAuthoredBody(selectedSection)) return selectedSection

    const focusedWidget = focusedWidgetHost()
    if(inAuthoredBody(focusedWidget)) return focusedWidget

    const selection = document.getSelection()
    if(!selection?.anchorNode || !selection.focusNode || selection.rangeCount === 0) return root
    const selectedElement = $.selectedElement
    if(inAuthoredBody(selectedElement)) return selectedElement
    const inBody = (node: Node) => node === body || body.contains(node)
    const range = selection.getRangeAt(0)
    if(!inBody(selection.anchorNode) || !inBody(selection.focusNode)) {
      // A live selection outside authored content is equivalent to having no
      // document selection for element styling.
      return root
    }

    const common = range.commonAncestorContainer
    if(common === document || common === document.documentElement || common === body) return root
    const container = getContainer(common)
    return inAuthoredBody(container)? container: body
  }

  private inlineStyleOf(element: Element | null): CSSStyleDeclaration | null {
    const style = (element as (Element & {style?: CSSStyleDeclaration}) | null)?.style
    return style && typeof style.setProperty === "function"? style: null
  }

  /** Whether an element is an authored, text-bearing editing block. Custom
   * elements and registered widgets stay atomic unless their own public
   * editing contract handles paragraph formatting. */
  private isTextBlock(element: Element): element is HTMLElement {
    const root = getDocumentRoot()
    if(element === root || element === document.body || isSectionElement(element)) return false
    for(let ancestor: Element | null = element; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
      if(ancestor.localName.includes("-") || ancestor.hasAttribute("is")
        || this.editor.schema.get(ancestor).group?.includes("widget")) return false
    }
    return this.editor.schema.isBlock(element)
  }

  /** Resolves the deepest text blocks covered by the live selection. A
   * collapsed caret uses its nearest block; a structural range returns every
   * leaf block it intersects, never their common section/list container. */
  private selectedTextBlocks() {
    const selection = document.getSelection()
    if(!selection?.rangeCount || !selection.anchorNode || !selection.focusNode) return []

    const selected = $.selectedElement
    if(selected) return this.isTextBlock(selected) ? [selected] : []

    if(selection.isCollapsed) {
      const root = getDocumentRoot()
      let element: Element | null = getContainer(selection.anchorNode)
      while(element && element !== root) {
        if(this.isTextBlock(element)) return [element]
        element = element.parentElement
      }
      return []
    }

    const range = selection.getRangeAt(0)
    const candidates = Array.from(document.body.querySelectorAll("*"))
      .filter((element): element is HTMLElement => {
        if(!this.isTextBlock(element)) return false
        try {
          return range.intersectsNode(element)
        }
        catch {
          return false
        }
      })
    return candidates.filter(candidate => !candidates.some(
      other => other !== candidate && candidate.contains(other),
    ))
  }

  /** Changes only the selected text blocks' element type, moving their live
   * children and retaining all authored attributes. Invalid replacements are
   * skipped independently so irregular surrounding DOM is never rebuilt. */
  private canReplaceTextBlock(block: Element, candidate: Element) {
    if(this.editor.schema.canReplace(block, candidate)) return true
    const parent = block.parentElement
    if(!parent) return false
    // An unfamiliar but valid sibling can make the whole parent unverifiable
    // to the installed schema. Neutralize only those unknown sibling types,
    // then require both the existing and proposed local content shapes to be
    // valid. This retains ordered/selector constraints such as UL and ADDRESS.
    const unknown = this.editor.schema.get("#unknownelement")
    const children = Array.from(parent.childNodes).map(node => (
      isElement(node) && this.editor.schema.get(node) === unknown
        ? document.createElement("span")
        : node
    ))
    const index = Array.from(parent.childNodes).indexOf(block)
    if(index < 0 || !this.editor.schema.isContentValid(parent, children)) return false
    const proposed = [...children]
    proposed[index] = candidate
    return this.editor.schema.isContentValid(parent, proposed)
  }

  setBlockType(tag: BlockFormatTag) {
    if(!isBlockFormatTag(tag)) throw new TypeError(`Unsupported block format '${tag}'`)
    this.ensureTextBlock()
    const blocks = this.selectedTextBlocks()
    const selection = document.getSelection()
    const saved = selection?.anchorNode && selection.focusNode ? {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    } : null
    const replacements = new Map<Node, Element>()

    const count = this.withNormalization(() => blocks.reduce((converted, block) => {
      if(block.localName === tag || !block.isConnected) return converted
      const candidate = document.createElement(tag)
      this.copyAuthoredAttributes(block, candidate)
      if(!this.editor.schema.isContentValid(candidate, Array.from(block.childNodes))
        || !this.canReplaceTextBlock(block, candidate)) {
        return converted
      }

      const replacement = document.createElement(tag)
      this.copyAuthoredAttributes(block, replacement)
      replacement.append(...Array.from(block.childNodes))
      block.replaceWith(replacement)
      replacements.set(block, replacement)
      return converted + 1
    }, 0))

    if(saved && selection) {
      const anchorNode = replacements.get(saved.anchorNode) ?? saved.anchorNode
      const focusNode = replacements.get(saved.focusNode) ?? saved.focusNode
      if(anchorNode.isConnected && focusNode.isConnected) {
        const maximumOffset = (node: Node) => node.nodeType === Node.TEXT_NODE
          ? (node as Text).length
          : node.childNodes.length
        selection.setBaseAndExtent(
          anchorNode, Math.min(saved.anchorOffset, maximumOffset(anchorNode)),
          focusNode, Math.min(saved.focusOffset, maximumOffset(focusNode)),
        )
      }
    }
    return count
  }

  /** Returns authored declarations and the requested computed values without
   * retaining or exposing a live CSSStyleDeclaration across the editor bridge. */
  getStyleState(properties: string[] = []): ElementStyleState {
    const target = this.styleTarget
    const style = this.inlineStyleOf(target)
    if(!target || !style) {
      return {
        target: null,
        inline: {},
        computed: {},
        context: {display: "", parentDisplay: ""},
      }
    }

    const inline: Record<string, ElementStyleDeclaration> = {}
    for(let index = 0; index < style.length; index++) {
      const name = style.item(index)
      inline[name] = {
        value: style.getPropertyValue(name),
        priority: style.getPropertyPriority(name) === "important"? "important": "",
      }
    }
    const requested = Array.from(new Set(properties.filter(name => typeof name === "string" && name.trim())))
    const computedStyle = getComputedStyle(target)
    const computed = Object.fromEntries(requested.map(name => [name, computedStyle.getPropertyValue(name)]))
    const paragraphProperties = requested.filter(name => paragraphStylePropertyNameSet.has(name))
    const blocks = paragraphProperties.length ? this.selectedTextBlocks() : []
    paragraphProperties.forEach(name => {
      if(!blocks.length) return
      delete inline[name]
      const declarations = blocks.map(block => {
        const blockStyle = this.inlineStyleOf(block)
        return {
          value: blockStyle?.getPropertyValue(name) ?? "",
          priority: blockStyle?.getPropertyPriority(name) === "important" ? "important" as const : "" as const,
        }
      })
      const firstDeclaration = declarations[0]
      if(firstDeclaration.value && declarations.every(declaration => (
        declaration.value === firstDeclaration.value && declaration.priority === firstDeclaration.priority
      ))) inline[name] = firstDeclaration

      const values = blocks.map(block => getComputedStyle(block).getPropertyValue(name))
      computed[name] = values.every(value => value === values[0]) ? values[0] : ""
    })
    const parentDisplay = target.parentElement? getComputedStyle(target.parentElement).display: ""
    return {
      target: {localName: target.localName, namespaceURI: target.namespaceURI},
      inline,
      computed,
      context: {display: computedStyle.display, parentDisplay},
    }
  }

  /** Materializes the virtual insertion point used for an empty document or
   * an element gap as a real schema-conformant text block. Returns the block
   * when one was created and null for an ordinary editing selection. */
  ensureTextBlock() {
    return $.isGapSelection || $.isEmptyDocumentSelection
      ? this.insertTextBlockAtSelection() ?? null
      : null
  }

  /** Runs a command and normalizes both the command's original surroundings
   * and the surroundings of the resulting selection. */
  private withNormalization<T>(command: () => T) {
    const selection = document.getSelection()
    const originalNodes = [selection?.anchorNode, selection?.focusNode]
    try {
      return command()
    }
    finally {
      this.editor.normalizeSurroundingElements(...originalNodes)
    }
  }

  /** Inserts a new element at an empty-document or gap selection, choosing
   * the default node when allowed and otherwise the first schema-conformant
   * element. */
  private insertTextBlockAtSelection() {
    const container = getContainer($.range.startContainer)
    const index = Math.max(0, getIndexBefore($.range) + 1)
    const validTypes = this.editor.schema.findValidTypesToInsert()
    const candidateTypes = [
      this.editor.schema.defaultNodeKey,
      ...validTypes.filter(type => type !== this.editor.schema.defaultNodeKey),
    ].filter(type => !type.startsWith("#") && validTypes.includes(type))
    const type = candidateTypes.find(type => {
      const element = this.editor.schema.create(type)
      return this.editor.schema.canInsert(container, element, index)
    })
    if(!type) {
      return
    }
    const element = this.editor.schema.create(type)
    return this.withNormalization(() => {
      $.replace(element)
      $.move(element)
      return element
    })
  }

  /** Replaces the current selection with nodes and leaves the caret at the
   * end of the inserted content without splitting its containing block. */
  private insertAtSelection(...nodes: Node[]) {
    if(!nodes.length) return
    return this.withNormalization(() => {
      $.replace(...nodes)
      this.moveAfterInsertedNode(nodes.at(-1)!)
    })
  }

  private moveAfterInsertedNode(node: Node) {
    if(node.nodeType === Node.TEXT_NODE
      || isElement(node) && this.editor.schema.findValidContentTypes(node).includes("#text")) {
      $.move(node, -1)
    }
    else if(node.parentNode) {
      $.move(node.parentNode, Array.from(node.parentNode.childNodes).indexOf(node as ChildNode) + 1)
    }
  }

  private isInlineClipboardNode(node: Node) {
    return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE
      || isElement(node) && this.editor.schema.isPhrasing(node)
  }

  /** Groups top-level inline runs beside block clipboard content into normal
   * text blocks. Formatting whitespace between source blocks is discarded. */
  private normalizeClipboardTopLevel(nodes: ChildNode[]): ChildNode[] {
    if(nodes.every(node => this.isInlineClipboardNode(node))) return nodes
    const normalized: ChildNode[] = []
    let textBlock: Element | null = null
    nodes.forEach(node => {
      if(this.isInlineClipboardNode(node)) {
        if(node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return
        if(!textBlock) textBlock = this.editor.schema.create() as Element
        const activeTextBlock = textBlock
        activeTextBlock.append(node)
        if(!normalized.includes(activeTextBlock)) normalized.push(activeTextBlock)
      }
      else {
        textBlock = null
        normalized.push(node)
      }
    })
    return normalized
  }

  /** Inserts top-level block clipboard nodes beside the current text block,
   * retaining left and right block halves. If the surrounding content model
   * cannot accept that shape (for example a direct LI selection), paste falls
   * back to the source text rather than creating invalid DOM. */
  private insertClipboardBlocks(nodes: ChildNode[]) {
    return this.withNormalization(() => {
      $.delete()
      const block = getContainer($.range.startContainer)
      if(isDocumentRoot(block)) {
        $.replace(...nodes)
        this.moveAfterInsertedNode(nodes.at(-1)!)
        return
      }
      const parent = block.parentElement
      if(!parent) return
      const blockIndex = Array.from(parent.childNodes).indexOf(block)
      const proposed = Array.from(parent.childNodes)
      proposed.splice(blockIndex + 1, 0, ...nodes, cloneWithoutEditorMarkers(block, false) as ChildNode)
      const containsWidget = nodes.some(node => Boolean(this.insertedWidget(node)))
      if(!containsWidget && !this.editor.schema.isContentValid(parent, proposed)) {
        const fallback = this.plainTextClipboardFragment(nodes.map(node => node.textContent ?? "").join("\n"))
        this.insertAtSelection(...Array.from(fallback.childNodes))
        return
      }

      const offset = this.splitTextLikePoint(block, $.range)
      const right = cloneWithoutEditorMarkers(block, false) as Element
      right.append(...Array.from(block.childNodes).slice(offset))
      block.normalize()
      right.normalize()

      if(block.childNodes.length) block.after(...nodes)
      else block.replaceWith(...nodes)
      const last = nodes.at(-1)!
      if(right.childNodes.length) {
        last.after(right)
        this.moveToStart(right)
      }
      else {
        this.moveAfterInsertedNode(last)
      }
    })
  }

  /** Inserts clipboard content at a virtual body/gap position. Inline-only
   * content is placed in a text block; block content remains at the gap. */
  private insertClipboardFragment(fragment: DocumentFragment) {
    const nodes = this.normalizeClipboardTopLevel(Array.from(fragment.childNodes))
    if(!nodes.length) return
    const isVirtualSelection = $.isGapSelection || $.isEmptyDocumentSelection
    const isInlineContent = nodes.every(node => this.isInlineClipboardNode(node))
    const widget = nodes.length === 1 ? this.insertedWidget(nodes[0]) : null
    if(widget && !this.editor.schema.isPhrasing(widget)) {
      this.withNormalization(() => this.insertBlockWidget(widget))
      return
    }
    if(isVirtualSelection && isInlineContent && !this.ensureTextBlock()) return
    if(isVirtualSelection || isInlineContent) this.insertAtSelection(...nodes)
    else this.insertClipboardBlocks(nodes)
  }

  private firstTextDescendant(node: Node): Text | null {
    if(node instanceof Text) return node
    for(const child of Array.from(node.childNodes)) {
      const text = this.firstTextDescendant(child)
      if(text) return text
    }
    return null
  }

  /** Places the caret at a node's logical text start, descending through mark
   * wrappers so typing retains the formatting at a split or join boundary. */
  private moveToStart(node: Node) {
    const text = this.firstTextDescendant(node)
    $.move(text ?? node, 0)
  }

  /** Promotes a DOM point through nested mark wrappers to an offset in the
   * containing non-mark element, splitting text and marks only when the point
   * is actually inside them. */
  private splitTextLikePoint(container: Element, range = $.range) {
    let pointNode: Node = range.startContainer
    let pointOffset = range.startOffset

    if(pointNode instanceof Text) {
      const parent = pointNode.parentElement
      if(!parent) throw new TypeError("Cannot split a detached text selection")
      const index = Array.from(parent.childNodes).indexOf(pointNode)
      if(pointOffset === 0) {
        pointOffset = index
      }
      else if(pointOffset === pointNode.length) {
        pointOffset = index + 1
      }
      else {
        const right = pointNode.splitText(pointOffset)
        pointOffset = Array.from(parent.childNodes).indexOf(right)
      }
      pointNode = parent
    }

    while(pointNode !== container) {
      if(!isElement(pointNode) || !isMarkElement(pointNode)) {
        throw new TypeError("A text-like split may only cross mark elements")
      }
      const parent = pointNode.parentElement
      if(!parent) throw new TypeError("Cannot split a detached mark selection")
      const index = Array.from(parent.childNodes).indexOf(pointNode)
      if(pointOffset === 0) {
        pointOffset = index
      }
      else if(pointOffset === pointNode.childNodes.length) {
        pointOffset = index + 1
      }
      else {
        const right = cloneWithoutEditorMarkers(pointNode, false) as Element
        right.append(...Array.from(pointNode.childNodes).slice(pointOffset))
        pointNode.after(right)
        pointOffset = Array.from(parent.childNodes).indexOf(right)
      }
      pointNode = parent
    }
    return pointOffset
  }

  /** Clones a root and maps a range into the clone so schema-sensitive
   * commands can be tried without changing the authored document. */
  private cloneRangeIn(root: Element, range: Range) {
    const pathFromRoot = (node: Node) => {
      const path: number[] = []
      while(node !== root) {
        const parent = node.parentNode
        if(!parent) return null
        const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
        if(index < 0) return null
        path.push(index)
        node = parent
      }
      return path.reverse()
    }
    const startPath = pathFromRoot(range.startContainer)
    const endPath = pathFromRoot(range.endContainer)
    if(!startPath || !endPath) return null

    const clonedRoot = cloneWithoutEditorMarkers(root, true) as Element
    const resolve = (path: number[]) => path.reduce<Node | null>(
      (node, index) => node?.childNodes.item(index) ?? null,
      clonedRoot,
    )
    const start = resolve(startPath)
    const end = resolve(endPath)
    if(!start || !end) return null

    const clonedRange = document.createRange()
    try {
      clonedRange.setStart(start, range.startOffset)
      clonedRange.setEnd(end, range.endOffset)
    }
    catch {
      return null
    }
    return {root: clonedRoot, range: clonedRange}
  }

  /** Applies the structural part of a split to any range, returning every
   * element whose content model may have changed. */
  private splitRange(range: Range, splitDepth: number, strict: boolean) {
    let container = getContainer(range.startContainer)
    let offset = this.splitTextLikePoint(container, range)
    let target: Element | null = null
    const affected = new Set<Element>()
    const splittingSummary = container.matches("summary")
    if(splittingSummary) splitDepth = 0

    for(let depth = 0; depth <= splitDepth; depth++) {
      if(isDocumentRoot(container) || container.nodeName === "HTML") break
      const parent = container.parentElement
      if(!parent) break
      const schema = this.editor.schema.get(container)
      const next = (splittingSummary || strict && schema.inseperable
        ? this.editor.schema.create()
        : cloneWithoutEditorMarkers(container, false)) as Element
      container.after(next)
      const moving = Array.from(container.childNodes).slice(offset)
      this.editor.features.list.prepareSplitContinuation(container, next, moving)
      next.append(...moving)
      affected.add(container)
      affected.add(next)
      affected.add(parent)
      target ??= next

      offset = Array.from(parent.childNodes).indexOf(next)
      container = parent
    }

    return {affected, target}
  }

  /** Checks both split halves and their changed parents against the schema by
   * executing the exact operation on a detached clone. */
  private canSplitAtSelection(splitDepth: number, strict: boolean) {
    const simulation = this.cloneRangeIn(getDocumentRoot(), $.range)
    if(!simulation) return false
    try {
      simulation.range.deleteContents()
      const {affected, target} = this.splitRange(simulation.range, splitDepth, strict)
      return Boolean(target)
        && Array.from(affected).every(element => this.editor.schema.isContentValid(element))
    }
    catch {
      return false
    }
  }

  /** Returns the requested schema-valid split depth. A parent split falls
   * back to splitting only the current element. */
  private allowedSplitDepth(splitDepth: number, strict: boolean) {
    if(this.canSplitAtSelection(splitDepth, strict)) return splitDepth
    if(splitDepth > 0 && this.canSplitAtSelection(0, strict)) return 0
    return null
  }

  /** Whether replacing the current selection with a node leaves its immediate
   * content model valid. Transparent mark content resolves through its parent. */
  private canInsertAtSelection(node: Node) {
    const container = getContainer($.range.startContainer)
    const simulation = this.cloneRangeIn(container, $.range)
    if(!simulation) return false
    try {
      simulation.range.deleteContents()
      const inserted = cloneWithoutEditorMarkers(node, true)
      simulation.range.insertNode(inserted)
      return Boolean(inserted.parentElement)
        && this.editor.schema.isContentValid(inserted.parentElement!)
    }
    catch {
      return false
    }
  }

  /** Inserts a break only when it is valid at the current selection. */
  private insertBreak(type: "br" | "wbr") {
    this.ensureTextBlock()
    const element = document.createElement(type)
    if(this.canInsertAtSelection(element)) this.insertAtSelection(element)
  }

  /** Splits the logical block at the current caret and, for a deeper split,
   * promotes the split through its ancestors. The first right-hand block is
   * retained as the editing target. */
  private splitAtSelection(splitDepth: number, strict: boolean) {
    const {target} = this.splitRange($.range, splitDepth, strict)

    if(target) {
      this.moveToStart(target)
      const details = target.closest("details") as HTMLDetailsElement | null
      if(details && !target.matches("summary")) details.open = true
    }
  }

  /** Action handlers, addressable by action type through the editor. */
  actions = {
    insert: ({html, strict}: {type: "insert", html: string, strict?: boolean}) => this.insertHTML(html, strict),
    delete: ({direction}: {type: "delete", direction?: "forward" | "backward"}) => {
      this.delete(direction)
    },
    wrap: ({wrapper}: {type: "wrap", wrapper: string}) => {
      this.wrap(this.editor.parseHTMLFragment(wrapper).fragment)
    },
    lift: ({}: {type: "lift"}) => {
      this.lift()
    },
    copy: ({}: {type: "copy"}) => {
      return this.copy()
    },
    cut: ({}: {type: "cut"}) => {
      return this.cut()
    },
    paste: ({}: {type: "paste"}) => {
      return this.paste()
    },
    setAttributes: ({attrs}: {type: "setAttributes", attrs: Record<string, string | null>}) => {
      this.setAttributes(attrs)
    },
    setElementAttribute: ({
      path,
      localName,
      namespaceURI,
      name,
      previousName,
      value,
    }: {
      type: "setElementAttribute"
      path: number[] | null
      localName: string
      namespaceURI: string | null
      name: string
      previousName?: string
      value: string | null
    }) => this.setElementAttribute(path, localName, namespaceURI, name, value, previousName),
    getStyleState: ({properties}: {type: "getStyleState", properties?: string[]}) => {
      if(properties !== undefined && (!Array.isArray(properties) || properties.some(name => typeof name !== "string"))) {
        throw new TypeError("Style-state property names must be strings")
      }
      return this.getStyleState(properties)
    },
    setStyle: ({styles}: {type: "setStyle", styles: Record<string, ElementStyleMutation>}) => {
      this.setStyle(styles)
    },
    setBlockStyle: ({styles}: {type: "setBlockStyle", styles: Record<string, ElementStyleMutation>}) => {
      this.setBlockStyle(styles)
    },
    setBlockType: ({tag}: {type: "setBlockType", tag: BlockFormatTag}) => {
      this.setBlockType(tag)
    },
    setHeadingGroupLevel: ({level}: {type: "setHeadingGroupLevel", level: HeadingGroupSelectionState["heading"]}) => {
      this.setHeadingGroupLevel(level)
    },
    addHeadingGroupText: ({position}: {type: "addHeadingGroupText", position: "before" | "after"}) => {
      if(position !== "before" && position !== "after") throw new TypeError("Unsupported heading-group text position")
      this.addHeadingGroupText(position)
    },
    toggleSection: ({section = "section"}: {type: "toggleSection", section?: SectionName}) => {
      return this.toggleSection(section)
    },
    setSectionType: ({section}: {type: "setSectionType", section: SectionName}) => {
      return this.setSectionType(section)
    },
    addSection: ({section = "section"}: {type: "addSection", section?: SectionName}) => {
      return this.addSection(section)
    },
    removeSection: ({}: {type: "removeSection"}) => {
      return this.removeSection()
    },

  } as const

  /** Browser text replacement may otherwise insert a bare text node between
   * BODY children. Handle selections that cross editing blocks ourselves so
   * a root-level insertion point is materialized as a text block. */
  private replacesStructureWithText() {
    if($.isEmpty) return false
    const selected = $.selectedElement
    if(selected === getDocumentRoot() || selected === document.body) return true
    const common = getContainer($.range.commonAncestorContainer)
    return isDocumentRoot(common)
      || getSelectionAnchorBlock(this.editor.schema) !== getSelectionFocusBlock(this.editor.schema)
  }

  private replaceStructuredSelectionWithText(text: string) {
    return this.withNormalization(() => {
      $.delete()
      this.ensureTextBlock()
      if(text) this.insertAtSelection(document.createTextNode(text))
    })
  }

  /** Word/platform deletion conventions: Option deletes a word and Command
   * deletes to the line boundary on Apple platforms; Ctrl deletes a word on
   * other platforms. Block deletion remains available as an explicit action. */
  private deletionGranularity(event: KeyboardEvent): Granularity {
    if(isOnApple()) {
      if(event.metaKey) return "line"
      if(event.altKey) return "word"
    }
    else if(event.ctrlKey) return "word"
    return "character"
  }

  /** Applies a conservative two-em paragraph indent at a block boundary or
   * across a block selection. Existing non-em author values are left alone
   * rather than rewritten into editor-specific metadata. */
  private adjustSelectedBlockIndent(direction: -1 | 1) {
    const selection = document.getSelection()
    const blocks = this.selectedTextBlocks()
    if(!selection || !blocks.length) return false
    if(selection.isCollapsed && direction > 0 && !isCaretAtBoundary(blocks[0], "start")) return false

    let changed = false
    this.withNormalization(() => blocks.forEach(block => {
      const style = this.inlineStyleOf(block)
      if(!style) return
      const authored = style.getPropertyValue("margin-inline-start").trim()
      const zero = !authored || /^[-+]?0(?:[a-z%]+)?$/i.test(authored)
      const match = authored.match(/^([-+]?(?:\d+(?:\.\d+)?|\.\d+))em$/i)
      if(!zero && !match) return
      const current = zero ? 0 : Number.parseFloat(match![1])
      const next = Math.max(0, current + direction * 2)
      if(next === current) return
      if(next === 0) style.removeProperty("margin-inline-start")
      else style.setProperty("margin-inline-start", `${next}em`)
      changed = true
    }))
    return changed
  }

  /** Keyboard and input behavior: Enter splits the containing block
   * (Shift/Alt: <br>, Alt+Shift: <wbr>, modifier: split the parent), deletion
   * follows platform word/line modifiers, and Tab adjusts paragraph indent
   * only where list/table handlers have not already supplied semantics. */
  activeListeners: DocumentListenerMap = {
    "beforeinput": ev => {
      const selected = $.selectedElement
      if(ev.inputType.startsWith("delete") && (selected === getDocumentRoot() || selected === document.body)) {
        ev.preventDefault()
        this.delete(ev.inputType.toLowerCase().includes("backward") ? "backward" : "forward")
        return
      }
      const summary = $.anchorContainer?.closest("summary")
      if(ev.inputType === "insertParagraph" && summary?.parentElement?.matches("details")) {
        ev.preventDefault()
        this.insert()
        return
      }
      if(ev.inputType === "insertLineBreak") {
        ev.preventDefault()
        this.insertBreak("br")
        return
      }

      if(["insertText", "insertReplacementText"].includes(ev.inputType)
        && ev.data !== null && this.replacesStructureWithText()) {
        ev.preventDefault()
        this.replaceStructuredSelectionWithText(ev.data)
        return
      }

      const isVirtualSelection = $.isGapSelection || $.isEmptyDocumentSelection
      if(!isVirtualSelection) return

      if(ev.inputType === "insertParagraph") {
        ev.preventDefault()
        this.insert()
      }
      else if(["insertText", "insertReplacementText"].includes(ev.inputType) && ev.data !== null) {
        const target = this.ensureTextBlock()
        if(target) {
          ev.preventDefault()
          this.insertAtSelection(document.createTextNode(ev.data))
        }
      }
      else if(["insertFromPaste", "insertFromDrop"].includes(ev.inputType)) {
        const fragment = this.#dataTransferToFragment(ev.dataTransfer)
        if(fragment) {
          ev.preventDefault()
          this.insertClipboardFragment(fragment)
        }
        else {
          this.ensureTextBlock()
        }
      }
      else if(ev.inputType.startsWith("insert")) {
        this.ensureTextBlock()
      }
    },
    "compositionstart": () => {
      this.ensureTextBlock()
    },
    "paste": ev => {
      if(ev.defaultPrevented || this.editor.features.transformation.target) return
      const fragment = this.#dataTransferToFragment(ev.clipboardData)
      if(fragment) {
        ev.preventDefault()
        this.insertClipboardFragment(fragment)
      }
      else if($.isGapSelection || $.isEmptyDocumentSelection) {
        this.ensureTextBlock()
      }
    },
    "cut": ev => {
      const selected = $.selectedElement
      if(selected !== getDocumentRoot() && selected !== document.body || !ev.clipboardData) return
      ev.preventDefault()
      const {html, text} = this.editor.serializeClipboardFragment($.copy())
      ev.clipboardData.setData("text/html", html)
      ev.clipboardData.setData("text/plain", text)
      $.delete()
    },
    "keydown": ev => {
      if(this.editor.features.transformation.target) {
        return
      }
      const isAltGraph = ev.getModifierState("AltGraph")
      const isPrintable = ev.key.length === 1 && !ev.metaKey && (!ev.ctrlKey || isAltGraph)
      if(!ev.defaultPrevented && isPrintable) {
        this.ensureTextBlock()
      }
      if(ev.key === "Enter") {
        ev.preventDefault()
        if(ev.altKey && ev.shiftKey) {
          this.insertBreak("wbr")
        }
        else if(ev.altKey) {
          this.insertBreak("br")
        }
        else if(ev.shiftKey && !modifierKeyDown(ev)) {
          this.insertBreak("br")
        }
        else if(modifierKeyDown(ev)) {
          this.insert(undefined, 1)
        }
        else {
          this.insert(undefined, 0)
        }
      }

      else if(ev.key === "Backspace") {
        ev.preventDefault()
        this.delete("backward", this.deletionGranularity(ev))
      }

      else if(ev.key === "Delete") {
        ev.preventDefault()
        this.delete("forward", this.deletionGranularity(ev))
      }

      else if(ev.key === "Tab") {
        if(this.adjustSelectedBlockIndent(ev.shiftKey ? -1 : 1)) ev.preventDefault()
      }
    }
  }

  /** Inserts `node` at the selection, replacing the selected content. Without
   * `node`, splits the containing block at the caret (Enter behavior).
   * `splitDepth` is the number of additional ancestor levels to split (0 means
   * one split); <body> and <html> are never split. Splitting continues the
   * container as a clone — with `strict`, inseperable containers (e.g.
   * headings) continue as a new default node (<p>) instead. */
  insert(node?: Node, splitDepth=0, strict=false) {
    if(!node && this.ensureTextBlock()) {
      return
    }
    if(!node) {
      const allowedDepth = this.allowedSplitDepth(splitDepth, strict)
      if(allowedDepth === null) return
      return this.withNormalization(() => {
        $.delete()
        this.splitAtSelection(allowedDepth, strict)
      })
    }
    const insertedWidget = this.insertedWidget(node)
    if(node) markWidgetsEditable(node)
    if(insertedWidget && !this.editor.schema.isPhrasing(insertedWidget)
      && !this.canInsertAtSelection(insertedWidget)) {
      return this.withNormalization(() => this.insertBlockWidget(insertedWidget))
    }
    return this.withNormalization(() => {
      $.replace(node)
      let locus = $.commonAncestor
      for(let i = 0; i <= splitDepth; i++) {
        $.start instanceof Text && $.start.splitText($.startOffset)
        let container = getContainer(locus)
        if(isDocumentRoot(container) || container.nodeName === "HTML") {continue}
        const [,right] = getSidesOfPoint($.range)
        const schema = this.editor.schema.get(container)
        const next = (strict && schema.inseperable
          ? this.editor.schema.create()
          : cloneWithoutEditorMarkers(container, false)) as Element
        container.after(next)
        next.append(...right)
        node? $.move(node, -1): $.move(next, 0)
      }
      if(insertedWidget?.isConnected) {
        $.selectElement(insertedWidget)
        this.editor.features.selection.processSelection()
        this.editor.postSelectionPath(true)
      }
    })
  }

  /** Deletes content at the selection. A selection in an empty container
   * removes that container (the caret moves to the previous node). A collapsed
   * selection is first extended by `granularity` in `direction` ("block"
   * extends to the container start; the others use `Selection.modify`). A
   * caret in the gap between two elements merges them: backward moves the
   * following element's content into the preceding element, forward the
   * reverse. At the document boundaries, Backspace/Delete move the caret to
   * the end/start of the adjacent block. */
  delete(direction?: "forward" | "backward", granularity:Granularity="character", strict=false) {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.deleteSelection()
    return this.withNormalization(() => {
      if($.isGapSelection && direction === "backward" && !$.elementAfter && $.elementBefore) {
        $.move($.elementBefore, -1)
        return
      }
      if($.isGapSelection && direction === "forward" && !$.elementBefore && $.elementAfter) {
        $.move($.elementAfter)
        return
      }
      const container = $.anchorContainer
      if(direction === "backward" && container?.textContent && isCaretAtBoundary(container, "start") && container.previousElementSibling && !container.previousElementSibling.textContent) {
        container.previousElementSibling.remove()
        return
      }
      if(direction === "forward" && container?.textContent && isCaretAtBoundary(container, "end") && container.nextElementSibling && !container.nextElementSibling.textContent) {
        container.nextElementSibling.remove()
        return
      }
      const commonContainer = getContainer($.commonAncestor)
      if(!commonContainer.textContent && commonContainer !== document.body
        && !isDocumentRoot(commonContainer) && commonContainer.nodeName !== "HTML") {
        const emptyContainer = commonContainer
        const previous = emptyContainer.previousSibling
        const next = emptyContainer.nextSibling
        $.delete()
        emptyContainer.remove()
        if(direction === "forward" && next) {
          $.move(next)
        }
        else if(previous) {
          $.move(previous, -1)
        }
        else if(next) {
          $.move(next)
        }
        else {
          $.move(getDocumentRoot())
        }
        return
      }
      else if($.isEmpty && !$.isGapSelection) {
        granularity === "block"? $.extend($.anchorContainer!, 0): $.extendBy(granularity, direction)
        $.delete()
      }
      else {
        $.delete()
      }
      if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "backward") {
        const {elementBefore, elementAfter} = $
        if(!elementBefore.textContent) {
          elementBefore.remove()
          $.selectGap(elementAfter, "before")
        }
        else {
          const joinTarget = elementAfter.firstChild
          elementBefore.append(...elementAfter.childNodes)
          if(joinTarget) this.moveToStart(joinTarget)
          elementBefore.normalize()
          elementAfter.remove()
        }
      }
      else if($.isGapSelection && $.elementBefore && $.elementAfter && direction === "forward") {
        const {elementBefore, elementAfter} = $
        if(!elementAfter.textContent) {
          elementAfter.remove()
          $.selectGap(elementBefore)
        }
        else {
          const joinTarget = elementAfter.firstChild
          elementAfter.prepend(...elementBefore.childNodes)
          if(joinTarget) this.moveToStart(joinTarget)
          elementAfter.normalize()
          elementBefore.remove()
        }
      }
    })
  }

  /** Wraps the selection. Given a `wrapping` element (or a fragment, whose
   * first element is used), it wraps a copy of the selected content, replaces
   * the selection and is returned. Without an argument (Tab behavior), the
   * anchor's container element is moved into the adjacent element (preferring
   * the previous one), which is returned — or undefined if there is none.
   * No schema validation is performed. */
  wrap(wrapping?: DocumentFragment | Element, strict=false) {
    return this.withNormalization(() => {
      if(wrapping) {
        const wrapper = wrapping instanceof DocumentFragment? wrapping.firstElementChild: wrapping
        if(!wrapper) return
        wrapper.append($.slice)
        $.replace(wrapper)
        return wrapper
      }
      else {
        const wrapper = $.elementBefore ?? $.elementAfter
        if(!wrapper) {
          return
        }
        if($.anchorContainer) wrapper.append($.anchorContainer)
        return wrapper
      }
    })
  }

  /** Lifts the selected element (or the element containing the caret) out of
   * its container, `depth` levels up, splitting the container around it when
   * it has siblings. Schema-validated: does nothing when no valid lift target
   * exists (see Schema.getLiftTarget). */
  lift(depth=1, strict=false) {
    return this.withNormalization(() => {
      const node = $.selectedElement ?? $.anchorContainer
      if(!node) {
        return
      }
      for(let i = 0; i < depth; i++) {
        const target = this.editor.schema.getLiftTarget(node)
        if(!target) {
          return
        }
        const [liftDepth, replacement] = target
        let toReplace = node.parentElement!
        for(let j = 1; j < liftDepth && toReplace.parentElement; j++) {
          toReplace = toReplace.parentElement
        }
        toReplace.replaceWith(...replacement)
      }
      $.selectElement(node)
    })
  }

  /** Writes the complete selected fragment as text/html and text/plain.
   * Missing capabilities return false; permission and runtime failures reject
   * so the action bridge can report them to its caller. */
  async copy() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.copy()
    if(typeof ClipboardItem !== "function" || !navigator.clipboard?.write) return false
    const item = this.#fragmentToClipboardItem($.copy())
    await navigator.clipboard.write([item])
    return true
  }

  /** Writes a stable clone first and removes its captured live Range only
   * after the clipboard accepts it. A failed write never destroys content. */
  async cut() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.cut()
    if(typeof ClipboardItem !== "function" || !navigator.clipboard?.write) return false
    const selection = document.getSelection()
    if(!selection?.rangeCount || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return false
    const captured = {
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset,
    }
    const item = this.#fragmentToClipboardItem(selection.getRangeAt(0).cloneContents())
    await navigator.clipboard.write([item])
    if(selection.anchorNode !== captured.anchorNode || selection.anchorOffset !== captured.anchorOffset
      || selection.focusNode !== captured.focusNode || selection.focusOffset !== captured.focusOffset) return false
    return this.withNormalization(() => {
      $.delete()
      return true
    })
  }

  /** Inserts the clipboard's HTML or plain-text content at the selection.
   * Inline content at an empty document or gap is wrapped in a text block.
   * Missing capabilities return false; supported API failures reject. */
  async paste() {
    if(this.editor.features.table.hasCellSelection) return this.editor.features.table.paste()
    if(!navigator.clipboard?.read) return false
    const fragment = await this.#clipboardToFragment()
    this.insertClipboardFragment(fragment)
    return true
  }

  /** Sets the given attributes on every element in the selection (see
   * `EditingSelection.nodesBetween`); a null value removes the attribute. */
  setAttributes(attrs: Record<string, string | null>) {
    return this.withNormalization(() => {
      $.nodesBetween.filter(isElement).forEach(n => Object.keys(attrs).forEach(k => (
        attrs[k] === null ? n.removeAttribute(k) : n.setAttribute(k, attrs[k]!)
      )))
    })
  }

  /** Sets one attribute on the live element addressed by the selection bridge.
   * The expected identity prevents a delayed UI event from mutating a node
   * that concurrently replaced the selected element. */
  private setElementAttribute(
    path: number[] | null,
    localName: string,
    namespaceURI: string | null,
    name: string,
    value: string | null,
    previousName?: string,
  ) {
    let node: Node = path === null ? document.documentElement : document.body
    for(const index of path ?? []) {
      const child = node.childNodes.item(index)
      if(!child) throw new RangeError(`Cannot edit a missing element at path [${path?.join(", ")}]`)
      node = child
    }
    if(!(node instanceof Element) || node.localName !== localName || node.namespaceURI !== namespaceURI) {
      throw new Error("The selected element changed before its attribute could be edited")
    }
    if(!name || name !== name.trim()) throw new TypeError("An attribute name cannot be empty or padded")
    if(!elementAttributeEditability(name).editable) throw new TypeError(`The ${name} attribute is not editable here`)
    if(previousName && !elementAttributeEditability(previousName).editable) {
      throw new TypeError(`The ${previousName} attribute is not editable here`)
    }
    if(value !== null && isUnsafeElementAttributeValue(name, value)) {
      throw new TypeError(`The ${name} attribute contains an unsafe URL`)
    }

    const setClass = (nextValue: string | null) => {
      const markers = Array.from(node.classList).filter(className => className.startsWith("◆"))
      const authored = nextValue === null ? [] : sanitizeAuthoredClass(nextValue).split(/\s+/).filter(Boolean)
      const classes = [...new Set([...authored, ...markers])]
      if(classes.length) node.setAttribute("class", classes.join(" "))
      else node.removeAttribute("class")
    }
    const set = (attributeName: string, nextValue: string | null) => {
      if(attributeName.toLowerCase() === "class") setClass(nextValue)
      else if(nextValue === null) node.removeAttribute(attributeName)
      else node.setAttribute(attributeName, nextValue)
    }

    // Set the new name before removing the old one so an invalid XML name
    // cannot turn a failed rename into data loss.
    set(name, value)
    if(previousName && previousName !== name) set(previousName, null)
  }

  private validatedStyleEntries(styles: Record<string, ElementStyleMutation>) {
    return Object.entries(styles).map(([name, mutation]) => {
      if(!name || name !== name.trim() || name.includes(";")) {
        throw new TypeError(`Invalid CSS property name '${name}'`)
      }
      if(mutation === null || mutation === "") {
        return {name, value: null, priority: "" as const}
      }
      const declaration = typeof mutation === "string"
        ? {value: mutation, priority: "" as const}
        : mutation
      if(!declaration || typeof declaration.value !== "string"
        || declaration.priority !== "" && declaration.priority !== "important") {
        throw new TypeError(`Invalid CSS declaration for '${name}'`)
      }
      return {name, value: declaration.value, priority: declaration.priority}
    })
  }

  private applyStyleEntries(
    target: Element,
    entries: ValidatedStyleEntry[],
  ) {
    const style = this.inlineStyleOf(target)
    if(!style) return false
    entries.forEach(({name, value, priority}) => {
      if(value === null) style.removeProperty(name)
      else style.setProperty(name, value, priority)
    })
    return true
  }

  /** Assigns inline style properties on the single live style target, merging
   * with existing declarations. Null or an empty string clears a property. */
  setStyle(styles: Record<string, ElementStyleMutation>) {
    const entries = this.validatedStyleEntries(styles)
    return this.withNormalization(() => this.applyStyleEntries(this.styleTarget, entries))
  }

  /** Applies paragraph declarations independently to every selected text
   * block instead of styling their structural common ancestor. */
  setBlockStyle(styles: Record<string, ElementStyleMutation>) {
    const entries = this.validatedStyleEntries(styles)
    this.ensureTextBlock()
    const blocks = this.selectedTextBlocks()
    return this.withNormalization(() => blocks.reduce(
      (count, block) => count + (this.applyStyleEntries(block, entries) ? 1 : 0),
      0,
    ))
  }

  /** Converts every selected sibling into one shared pair of clipboard
   * flavors after removing transient editing artifacts. */
  #fragmentToClipboardItem(fragment: DocumentFragment) {
    const {html, text} = this.editor.serializeClipboardFragment(fragment)
    return new ClipboardItem({
      "text/plain": text,
      "text/html": html || text,
    })
  }

  private plainTextClipboardFragment(text: string) {
    const fragment = document.createDocumentFragment()
    const lines = text.replace(/\r\n?/g, "\n").split("\n")
    lines.forEach((line, index) => {
      if(index) fragment.append(document.createElement("br"))
      if(line) fragment.append(document.createTextNode(line))
    })
    return fragment
  }

  /** Parses HTML preferentially and otherwise preserves clipboard text as a
   * text node, so text containing markup characters is never interpreted as
   * HTML. */
  #clipboardContentToFragment(html: string, text: string) {
    const fragment = html
      ? this.editor.parseHTMLFragment(html).fragment
      : this.plainTextClipboardFragment(text)
    markWidgetsEditable(fragment)
    return fragment
  }

  /** Sanitizes, schema-corrects, and inserts arbitrary HTML through the same
   * structural placement path as HTML clipboard content. */
  insertHTML(html: string, strict=false) {
    const {fragment} = this.editor.parseHTMLFragment(html)
    markWidgetsEditable(fragment)
    if(strict) this.insert(fragment, 0, true)
    else this.insertClipboardFragment(fragment)
  }

  /** Reads clipboard data available synchronously on paste/beforeinput. */
  #dataTransferToFragment(data: DataTransfer | null) {
    if(!data) return null
    const html = data.getData("text/html")
    const text = data.getData("text/plain")
    return html || text? this.#clipboardContentToFragment(html, text): null
  }

  /** Reads the first available HTML or plain-text item from the async
   * clipboard API. */
  async #clipboardToFragment() {
    const items = await navigator.clipboard.read()
    const htmlItem = items.find(item => item.types.includes("text/html"))
    const textItem = items.find(item => item.types.includes("text/plain"))
    const html = htmlItem? await (await htmlItem.getType("text/html")).text(): ""
    const text = !html && textItem? await (await textItem.getType("text/plain")).text(): ""
    return this.#clipboardContentToFragment(html, text)
  }

  private insertedWidget(node: Node) {
    const element = node instanceof DocumentFragment && node.childNodes.length === 1
      ? node.firstChild
      : node
    if(!isElement(element)) return null
    const schemaGroups = this.editor.schema.get(element).group ?? []
    return element.localName.includes("-") || element.hasAttribute("is") || schemaGroups.includes("widget")
      ? element
      : null
  }

  /** Inserts a block widget beside the surrounding text block. A native range
   * insertion would otherwise put it inside e.g. a paragraph, whose content
   * model only permits phrasing content. */
  private insertBlockWidget(widget: Element) {
    $.delete()
    const block = getContainer($.range.startContainer)
    if(isDocumentRoot(block) || this.editor.schema.isPhrasing(widget)
      || this.canInsertAtSelection(widget)) {
      $.replace(widget)
    }
    else {
      const parent = block.parentElement
      if(!parent) return
      const offset = this.splitTextLikePoint(block, $.range)
      const right = cloneWithoutEditorMarkers(block, false) as Element
      right.append(...Array.from(block.childNodes).slice(offset))
      block.normalize()
      right.normalize()

      if(block.childNodes.length) block.after(widget)
      else block.replaceWith(widget)
      if(right.childNodes.length) widget.after(right)
    }
    $.selectElement(widget)
    this.editor.features.selection.processSelection()
    this.editor.postSelectionPath(true)
  }
}
