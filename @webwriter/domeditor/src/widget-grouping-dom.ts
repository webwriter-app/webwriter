import {groupingTarget, validateGroupingRules} from "./widget-grouping.js"
import type {WidgetGroupingRules} from "./widget-grouping.js"

const carrierPrefix = `?${groupingTarget} `

function decodeGrouping(data: string): WidgetGroupingRules | null {
  try {
    const value = JSON.parse(decodeURIComponent(data))
    return validateGroupingRules(value) as WidgetGroupingRules
  }
  catch {
    return null
  }
}

function encodeGrouping(rules: WidgetGroupingRules) {
  return encodeURIComponent(JSON.stringify(validateGroupingRules(rules)))
}

function isGroupingCarrier(comment: Comment) {
  const data = comment.data
  if(!data.startsWith(carrierPrefix) || !data.endsWith("?")) return null
  const encoded = data.slice(carrierPrefix.length, -1)
  return encoded && decodeGrouping(encoded) ? encoded : null
}

function visit(root: Node, callback: (node: Node) => void) {
  const walk = (node: Node) => {
    callback(node)
    if(node.nodeType === 1 && (node as Element).localName === "template") {
      walkChildren((node as HTMLTemplateElement).content)
    }
    walkChildren(node)
  }
  const walkChildren = (node: Node) => {
    for(const child of Array.from(node.childNodes)) walk(child)
  }
  walk(root)
}

export function readWidgetGrouping(widget: Element): WidgetGroupingRules | null {
  const instructions = Array.from(widget.childNodes).filter((node): node is ProcessingInstruction =>
    node.nodeType === 7 && (node as ProcessingInstruction).target === groupingTarget)
  if(instructions.length > 1) throw new TypeError("Duplicate widget grouping instructions")
  if(!instructions.length) return null
  const decoded = decodeGrouping(instructions[0].data)
  if(!decoded) throw new TypeError("Invalid widget grouping instruction")
  return decoded
}

export function writeWidgetGrouping(widget: Element, rules: WidgetGroupingRules | null) {
  const encoded = rules === null ? null : encodeGrouping(rules)
  for(const child of Array.from(widget.childNodes)) {
    if(child.nodeType === 7 && (child as ProcessingInstruction).target === groupingTarget) child.remove()
  }
  if(encoded !== null) widget.append(widget.ownerDocument.createProcessingInstruction(groupingTarget, encoded))
}

export function widgetGroupingRevision(widget: Element): string | undefined {
  const instruction = Array.from(widget.childNodes).find((node): node is ProcessingInstruction =>
    node.nodeType === 7 && (node as ProcessingInstruction).target === groupingTarget)
  return instruction?.data
}

export function hydrateWidgetGroupings(root: Node) {
  visit(root, node => {
    if(node.nodeType !== 8) return
    const comment = node as Comment
    const encoded = isGroupingCarrier(comment)
    if(encoded === null) return
    try { comment.parentNode?.replaceChild(comment.ownerDocument!.createProcessingInstruction(groupingTarget, encoded), comment) }
    catch { /* Leave carriers untouched when the owner document rejects the PI. */ }
  })
}

export function prepareWidgetGroupingsForSerialization(root: Node) {
  const nonce = `ww-grouping-pi-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  const markers: {marker: string; target: string; data: string}[] = []
  visit(root, node => {
    if(node.nodeType !== 7) return
    const instruction = node as ProcessingInstruction
    const target = instruction.target || instruction.nodeName
    if(target === groupingTarget && !decodeGrouping(instruction.data)) return
    const marker = `${nonce}-${markers.length}`
    markers.push({marker, target, data: instruction.data})
    instruction.parentNode?.replaceChild(instruction.ownerDocument!.createComment(marker), instruction)
  })
  return (html: string) => markers.reduce((serialized, {marker, target, data}) =>
    serialized.replace(`<!--${marker}-->`, `<?${target}${data ? ` ${data}` : ""}?>`), html)
}

/** Restore PI children omitted by DOM implementations that clone only HTML node kinds. */
export function restoreWidgetGroupingClones(source: Node, clone: Node) {
  const restore = (sourceParent: Node, cloneParent: Node) => {
    const sourceContent = sourceParent.nodeType === 1 && (sourceParent as Element).localName === "template"
      ? (sourceParent as HTMLTemplateElement).content : sourceParent
    const cloneContent = cloneParent.nodeType === 1 && (cloneParent as Element).localName === "template"
      ? (cloneParent as HTMLTemplateElement).content : cloneParent
    const sourceContentChildren = Array.from(sourceContent.childNodes)
    for(const child of Array.from(cloneContent.childNodes)) if(child.nodeType === 7) child.remove()
    const cloneContentChildren = Array.from(cloneContent.childNodes)
    const sourceNonPIs = sourceContentChildren.filter(child => child.nodeType !== 7)
    const cloneNonPIs = cloneContentChildren.filter(child => child.nodeType !== 7)
    const mapped = new Map(sourceNonPIs.map((child, index) => [child, cloneNonPIs[index]]))
    for(let index = 0; index < sourceContentChildren.length; index++) {
      const sourceChild = sourceContentChildren[index]
      if(sourceChild.nodeType !== 7) continue
      const instruction = sourceChild as ProcessingInstruction
      const nextNonPI = sourceContentChildren.slice(index + 1).find(child => child.nodeType !== 7)
      const before = nextNonPI ? mapped.get(nextNonPI) : null
      const owner = cloneContent.nodeType === 9 ? cloneContent as Document : cloneContent.ownerDocument!
      cloneContent.insertBefore(owner.createProcessingInstruction(instruction.target, instruction.data), before ?? null)
    }
    sourceNonPIs.forEach((sourceChild, index) => {
      const cloneChild = cloneNonPIs[index]
      if(cloneChild) restore(sourceChild, cloneChild)
    })
  }
  restore(source, clone)
  return clone
}
