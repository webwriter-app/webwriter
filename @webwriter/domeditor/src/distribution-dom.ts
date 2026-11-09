import {distributionInstruction, distributionTarget, distributionTextInstruction, encodeDistributionConfig, supportsDistribution} from "./distribution.js"
import type {DistributionConfig} from "./distribution.js"

type Instruction = {node: ChildNode; config: DistributionConfig; text?: string}

function content(element: Element) {
  return element.localName === "template" && "content" in element ? (element as HTMLTemplateElement).content : element
}

function instruction(node: ChildNode, element: Element): Instruction | null {
  if(isDistributionPI(node)) {
    const config = distributionInstruction(`?${distributionTarget} ${node.data.trim()}?`)!
    return {node, config}
  }
  if(node.nodeType === 8) {
    const config = distributionInstruction((node as Comment).data)
    if(config) return {node, config}
  }
  if(node.nodeType === 3 && node === content(element).lastChild) {
    const parsed = distributionTextInstruction(element.localName, element.namespaceURI, (node as Text).data)
    if(parsed) return {node, ...parsed}
  }
  return null
}

function instructions(element: Element) {
  return Array.from(content(element).childNodes).flatMap(node => instruction(node, element) ?? [])
}

/** Read the policy attached directly to this element, regardless of its current child order. */
export function localDistributionInstruction(element: Element): Instruction | undefined {
  const records = instructions(element)
  if(records.length > 1) throw new TypeError("Duplicate distribution instruction on an element")
  if(records.length && !supportsDistribution(element.localName, element.namespaceURI)) throw new TypeError("Distribution is unsupported on void elements")
  return records[0]
}

function visitElements(root: Node, visit: (element: Element) => void) {
  if(root.nodeType === 1) {
    visit(root as Element)
    root = content(root as Element)
  }
  for(const element of Array.from((root as ParentNode).children ?? [])) visitElements(element, visit)
}

export function hasDistributionInstructions(root: Node): boolean {
  let found = false
  visitElements(root, element => {
    found ||= Array.from(content(element).childNodes).some(isDistributionPI)
  })
  return found
}

function collect(root: Node) {
  const records = new Map<Element, Instruction>()
  visitElements(root, element => {
    const record = localDistributionInstruction(element)
    if(record) records.set(element, record)
  })
  return records
}

/** Return policies keyed by their owning DOM element. */
export function readDistributionConfigs(root: Pick<Document, "documentElement">): Map<Element, DistributionConfig> {
  return new Map(Array.from(collect(root.documentElement), ([element, {config}]) => [element, config]))
}

/** Visit authored elements and the elements readers can insert from policy data. */
export function visitSerializableElements(root: Element, configs: Iterable<DistributionConfig>, visit: (element: Element) => void) {
  visitElements(root, visit)
  for(const config of configs) {
    if(!config.permissions.includes("insert")) continue
    for(const item of config.items) {
      const template = root.ownerDocument.createElement("template")
      template.innerHTML = item.html
      visitElements(template.content, visit)
    }
  }
}

/** Remove private subtrees from a detached session copy. */
export function filterLiveSessionDocument(root: Document) {
  const hidden = [...readDistributionConfigs(root)].filter(([, config]) => config.view === false).map(([element]) => element)
  for(const element of hidden) {
    // Preserve the empty shell required by the preview renderer.
    if(element === root.documentElement) {
      const shell = root.createElement("html")
      shell.append(root.createElement("head"), root.createElement("body"))
      element.replaceWith(shell)
    }
    else if(element === root.head || element === root.body) element.replaceWith(root.createElement(element.localName))
    else element.remove()
  }
  return hidden.length > 0
}

function removeInstruction(record: Instruction) {
  if(record.text) (record.node as Text).data = record.text
  else record.node.remove()
}

export function keepDistributionInstructionLast(element: Element) {
  const owner = content(element)
  const node = Array.from(owner.childNodes).find(isDistributionPI)
  if(node && node !== owner.lastChild) owner.append(node)
}

export function isDistributionPI(node: Node | null): node is ProcessingInstruction {
  return node?.nodeType === 7 && (node as ProcessingInstruction).target === distributionTarget
}

function appendInstruction(element: Element, config: DistributionConfig) {
  content(element).append(element.ownerDocument.createProcessingInstruction(distributionTarget, encodeDistributionConfig(config)))
}

/** Restore processing instructions from HTML comment or text carriers. */
export function hydrateDistributionInstructions(root: Node): void {
  for(const [element, record] of collect(root)) {
    if(record.node.nodeType === 7) {
      keepDistributionInstructionLast(element)
      continue
    }
    removeInstruction(record)
    appendInstruction(element, record.config)
  }
}

/** Write or remove the policy as the last child of its owner. */
export function writeDistributionConfig(element: Element, config: DistributionConfig | null): void {
  if(!element.isConnected) throw new TypeError("Distribution target must be connected")
  const document = element.ownerDocument
  if(element === document.documentElement) element = document.body
  if(!supportsDistribution(element.localName, element.namespaceURI)) throw new TypeError("Distribution is unsupported on void elements")
  const local = localDistributionInstruction(element)
  if(config !== null) {
    appendInstruction(element, config)
  }
  if(local) removeInstruction(local)
}

/** Resolve the closest whole policy on the element or an ancestor. */
export function effectiveDistribution(element: Element): {config: DistributionConfig; element: Element} | null {
  if(!element.isConnected) throw new TypeError("Distribution target must be connected")
  for(let current: Element | null = element; current; current = current.parentElement) {
    const config = localDistributionInstruction(current)?.config
    if(config) return {config, element: current}
  }
  return null
}

export function getDistributionSelection(element: Element): {
  local: DistributionConfig | null
  effective: DistributionConfig | null
  hiddenByAncestor?: boolean
  error?: string
} {
  try {
    if(element === element.ownerDocument.documentElement) element = element.ownerDocument.body
    const local = localDistributionInstruction(element)?.config ?? null
    const effective = effectiveDistribution(element)
    let hiddenByAncestor = false
    for(let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if(localDistributionInstruction(ancestor)?.config.view === false) {
        hiddenByAncestor = true
        break
      }
    }
    return {local, effective: effective?.config ?? null,
      ...(hiddenByAncestor ? {hiddenByAncestor} : {}),
    }
  }
  catch(error) {
    return {local: null, effective: null, error: error instanceof Error ? error.message : String(error)}
  }
}
