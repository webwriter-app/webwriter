import {isWidgetHost, parseWidgetEffectReference, widgetEffectDeclarations, widgetSignals} from "./widget-effects"

const svgShapeNames = new Set([
  "a", "circle", "ellipse", "foreignObject", "g", "image", "line", "path", "polygon", "polyline", "rect", "text", "use",
])
const svgNonContentNames = new Set(["defs", "marker", "clipPath", "mask", "pattern", "symbol", "title", "desc", "metadata"])
const idReferenceAttributes = new Set(["aria-activedescendant", "aria-controls", "aria-describedby", "aria-details", "aria-errormessage",
  "aria-flowto", "aria-labelledby", "aria-owns", "for", "headers", "list", "form", "popovertarget", "interestfor", "commandfor"])
const urlReferenceAttributes = new Set(["style", "clip-path", "fill", "filter", "marker", "marker-start", "marker-mid", "marker-end", "mask", "stroke"])

function rewriteReferences(element: Element, replacements: ReadonlyMap<string, string>) {
  for(const attribute of Array.from(element.attributes)) {
    const value = attribute.value
    if(attribute.localName === "id") continue
    const next = idReferenceAttributes.has(attribute.localName)
      ? value.replace(/\S+/g, id => replacements.get(id) ?? id)
      : attribute.localName === "href" && value.startsWith("#") && replacements.has(value.slice(1))
        ? `#${replacements.get(value.slice(1))}`
        : urlReferenceAttributes.has(attribute.localName)
          ? value.replace(/url\(\s*(['"]?)#([^\s'"()]+)\1\s*\)/g, (match, quote: string, id: string) =>
            replacements.has(id) ? `url(${quote}#${replacements.get(id)}${quote})` : match)
          : value
    if(next !== value) attribute.value = next
  }
}

function elementsIn(root: ParentNode): Element[] {
  const result: Element[] = []
  if((root as Node).nodeType === 1) result.push(root as Element)
  result.push(...root.querySelectorAll("*"))
  return result
}

const identityCandidates = "[id], figure, dialog, [popover], svg"

export function affectsAuthoredElementIds(record: MutationRecord) {
  if(record.type === "attributes") return record.attributeName === "id" || record.attributeName === "popover" || record.attributeName === "is"
  const parent = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement
  if(parent?.matches("figure") || record.type === "childList" && parent?.closest("svg")) return true
  return record.type === "childList" && Array.from(record.addedNodes).some(node => node.nodeType === 1
    && ((node as Element).matches(identityCandidates) || (node as Element).querySelector(identityCandidates)))
}

function isWidgetBoundary(element: Element) {
  return element.hasAttribute("is") || element.localName.includes("-")
}

function inWidget(element: Element) {
  for(let parent = element.parentElement; parent; parent = parent.parentElement) if(isWidgetBoundary(parent)) return true
  return false
}

function isSVGContentElement(element: Element) {
  if(element.namespaceURI !== "http://www.w3.org/2000/svg" || !svgShapeNames.has(element.localName)) return false
  for(let parent = element.parentElement; parent && parent.localName !== "svg"; parent = parent.parentElement) {
    if(svgNonContentNames.has(parent.localName)) return false
  }
  return true
}

function needsAuthoredId(element: Element) {
  if(element.namespaceURI === "http://www.w3.org/2000/svg") return element.localName === "svg" || isSVGContentElement(element)
  if(element.namespaceURI !== "http://www.w3.org/1999/xhtml" || isWidgetBoundary(element)) return false
  if(element.localName === "dialog" || element.hasAttribute("popover")) return true
  if(element.localName === "figure" && !element.hasAttribute("is")) {
    const children = Array.from(element.children)
    return children.filter(child => child.localName === "figcaption").length === 1
      && children.filter(child => child.localName !== "figcaption").length === 1
      && !Array.from(element.childNodes).some(node => node.nodeType === 3 && node.textContent?.trim())
  }
  return false
}

/** Rebase IDs that collide with the destination before the incoming nodes and
 * their references lose their shared fragment boundary. */
export function remapPastedAuthoredIds(fragment: DocumentFragment | Element, destination: Document, replacing?: Element,
  isWidget?: (element: Element) => boolean) {
  const elements = Array.from(fragment.querySelectorAll("[id]"))
  if((fragment as Node).nodeType === 1 && (fragment as Element).id) elements.unshift(fragment as Element)
  const counts = new Map<string, number>()
  for(const element of elements) counts.set(element.id, (counts.get(element.id) ?? 0) + 1)
  const effects: {attribute: Attr, reference: NonNullable<ReturnType<typeof parseWidgetEffectReference>>}[] = []
  const effectSources = new Set<string>()
  if(isWidget) {
    for(const element of elementsIn(fragment)) {
      if(!isWidgetHost(element) || !isWidget(element) || inWidget(element)) continue
      for(const name of widgetEffectDeclarations(element, destination.defaultView?.customElements).keys()) {
        const attribute = element.getAttributeNode(name)
        const reference = attribute && parseWidgetEffectReference(attribute.value)
        if(!attribute || !reference) continue
        effects.push({attribute, reference})
        effectSources.add(reference.id)
      }
    }
  }
  const replacements = new Map<string, string>()
  for(const element of elements) {
    const id = element.id
    const existing = id && destination.getElementById(id)
    if(!existing || counts.get(id) !== 1 || replacing?.contains(existing) || inWidget(element)) continue
    const signalSource = isWidget?.(element) && (effectSources.has(id)
      || existing.localName === element.localName && widgetSignals(existing).size > 0)
    if(!needsAuthoredId(element) && !signalSource) continue
    let replacement: string
    do { replacement = `ww-${crypto.randomUUID()}` }
    while(destination.getElementById(replacement) || counts.has(replacement))
    element.id = replacement
    counts.set(replacement, 1)
    replacements.set(id, replacement)
  }
  if(replacements.size) for(const element of elementsIn(fragment)) if(!inWidget(element)) rewriteReferences(element, replacements)
  for(const {attribute, reference} of effects) {
    const replacement = replacements.get(reference.id)
    if(replacement) attribute.value = `${attribute.value.slice(0, reference.idStart)}#${replacement}${attribute.value.slice(reference.idEnd)}`
  }
}

function stableId(element: Element, occupied: Set<string>) {
  const path: number[] = []
  for(let node: Node | null = element; node && node.parentNode; node = node.parentNode) {
    path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node))
  }
  const source = `${element.namespaceURI}:${element.localName}:${path.join(".")}`
  let hash = 2166136261
  for(let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619)
  const base = `ww-${(hash >>> 0).toString(36)}`
  let id = base, suffix = 1
  while(occupied.has(id)) id = `${base}-${suffix++}`
  return id
}

/** Assigns persistent IDs to authored targets that need stable CSS or SVG references.
 * Existing unique IDs are kept. Only the requested light-DOM subtree is considered;
 * widget hosts are treated as opaque and their descendants are skipped. */
export function ensureAuthoredElementIds(root: ParentNode) {
  const all = elementsIn(root)
  const documentRoot = (root as Node).nodeType === 9 ? (root as Document).documentElement : (root as Node).ownerDocument?.documentElement
  const candidates = all.filter(element => needsAuthoredId(element) && !inWidget(element))
  const targets = new Set(candidates)
  const occupied = new Set<string>()
  const owners = new Map<string, Element>()
  const duplicates = new Set<Element>()
  const documentIds = documentRoot ? [documentRoot, ...documentRoot.querySelectorAll("[id]")] : []
  if((root as Node).nodeType !== 9 && !documentRoot?.contains(root as Node)) documentIds.push(...all.filter(element => element.id))
  for(const element of documentIds) {
    if(!element.id) continue
    const owner = owners.get(element.id)
    if(owner && (targets.has(element) || !targets.has(owner))) duplicates.add(element)
    else {
      if(owner) duplicates.add(owner)
      owners.set(element.id, element)
    }
    occupied.add(element.id)
  }
  for(const element of candidates) {
    if(element.id && !duplicates.has(element)) continue
    const oldId = element.id
    const id = stableId(element, occupied)
    element.id = id
    occupied.add(id)
    if(oldId) {
      // Repair references contained in the same target subtree; external references
      // to a duplicated ID remain bound to the first authored occurrence.
      const replacements = new Map([[oldId, id]])
      for(const descendant of [element, ...element.querySelectorAll("*")]) rewriteReferences(descendant, replacements)
    }
  }
}
