import {distributionTarget, encodeDistributionConfig, validateDistributionConfig} from "./distribution.js"
import type {DistributionConfig} from "./distribution.js"

const carrierPrefix = `?${distributionTarget} `

function isDistributionInstruction(node: Node): node is ProcessingInstruction {
  return node.nodeType === 7 && (node as ProcessingInstruction).target === distributionTarget
}

function decodeInstruction(data: string): DistributionConfig {
  try {
    return validateDistributionConfig(JSON.parse(decodeURIComponent(data))) as DistributionConfig
  }
  catch {
    throw new TypeError("Invalid distribution instruction")
  }
}

function carrierConfig(comment: Comment): DistributionConfig | null {
  const data = comment.data
  if(!data.startsWith(`?${distributionTarget}`)) return null
  if(!data.startsWith(carrierPrefix) || !data.endsWith("?")) throw new TypeError("Invalid distribution instruction")
  const encoded = data.slice(carrierPrefix.length, -1)
  if(!encoded) throw new TypeError("Invalid distribution instruction")
  return decodeInstruction(encoded)
}

function visit(root: Node, callback: (node: Node) => void) {
  const walkChildren = (node: Node) => {
    for(const child of Array.from(node.childNodes)) walk(child)
  }
  const walk = (node: Node) => {
    callback(node)
    if(node.nodeType === 1 && (node as Element).localName === "template" && "content" in node) {
      walkChildren((node as HTMLTemplateElement).content)
    }
    walkChildren(node)
  }
  walk(root)
}

function headInstructions(root: Document): {target: string; config: DistributionConfig}[] {
  const head = root.head
  if(!head) return []
  const result: {target: string; config: DistributionConfig}[] = []
  for(const node of Array.from(head.childNodes)) {
    let config: DistributionConfig | null = null
    if(isDistributionInstruction(node)) config = decodeInstruction(node.data.trim())
    else if(node.nodeType === 8) config = carrierConfig(node as Comment)
    if(config) result.push({target: config.target, config})
  }
  const targets = new Set<string>()
  for(const {target} of result) {
    if(targets.has(target)) throw new TypeError(`Duplicate distribution instruction for ${target}`)
    targets.add(target)
  }
  return result
}

function elementsWithId(root: Document, id: string): Element[] {
  return Array.from(root.querySelectorAll("[id]")).filter(element => element.id === id)
}

function assertUniqueReferencedIds(root: Document, instructions: {target: string}[]) {
  for(const {target} of instructions) {
    if(elementsWithId(root, target).length > 1) throw new TypeError(`Duplicate DOM id referenced by distribution: ${target}`)
  }
}

/** Read canonical distribution instructions from document.head. */
export function readDistributionConfigs(root: Document): DistributionConfig[] {
  const instructions = headInstructions(root)
  assertUniqueReferencedIds(root, instructions)
  return instructions.map(({config}) => config)
}

/** Convert validated HTML comment carriers back into their DOM processing instructions. */
export function hydrateDistributionInstructions(root: Node): void {
  const carriers: {comment: Comment; config: DistributionConfig}[] = []
  visit(root, node => {
    if(node.nodeType !== 8) return
    const comment = node as Comment
    const config = carrierConfig(comment)
    if(config) carriers.push({comment, config})
  })
  const targets = new Set<string>()
  for(const {config} of carriers) {
    if(targets.has(config.target)) throw new TypeError(`Duplicate distribution instruction for ${config.target}`)
    targets.add(config.target)
  }
  for(const {comment, config} of carriers) {
    comment.parentNode?.replaceChild(comment.ownerDocument!.createProcessingInstruction(distributionTarget, encodeDistributionConfig(config)), comment)
  }
}

function connectedDocument(element: Element): Document {
  if(!element.isConnected || !element.ownerDocument) throw new TypeError("Distribution target must be connected")
  return element.ownerDocument
}

function assertUniqueElementId(element: Element, id: string) {
  const matches = elementsWithId(element.ownerDocument!, id)
  if(matches.length !== 1 || matches[0] !== element) throw new TypeError(`Distribution target id must be unique: ${id}`)
}

/** Assign a stable target id for an explicit distribution write action. */
export function ensureDistributionTarget(element: Element): string {
  const document = connectedDocument(element)
  if(!element.id) {
    if(!globalThis.crypto?.randomUUID) throw new TypeError("Cannot create a distribution target id")
    let id: string
    do { id = `ww${globalThis.crypto.randomUUID()}` } while(elementsWithId(document, id).length)
    element.id = id
  }
  assertUniqueElementId(element, element.id)
  return element.id
}

/** Write or remove the local distribution instruction for an element in document.head. */
export function writeDistributionConfig(element: Element, config: DistributionConfig | null): void {
  const document = connectedDocument(element)
  if(!document.head) throw new TypeError("Distribution document has no head")
  let target: string
  let encoded: string | null = null
  if(config !== null) {
    if(config.target && element.id !== config.target) throw new TypeError("Distribution config target does not match element id")
    target = ensureDistributionTarget(element)
    encoded = encodeDistributionConfig({...config, target})
  }
  else {
    target = element.id
    if(target) assertUniqueElementId(element, target)
  }
  for(const node of Array.from(document.head.childNodes)) {
    if(!isDistributionInstruction(node)) continue
    let existing: DistributionConfig
    try { existing = decodeInstruction(node.data.trim()) }
    catch { throw new TypeError("Malformed distribution instruction in document.head") }
    if(existing.target === target) node.remove()
  }
  if(encoded !== null) document.head.append(document.createProcessingInstruction(distributionTarget, encoded))
}

function configsByTarget(root: Document): Map<string, DistributionConfig> {
  const instructions = headInstructions(root)
  assertUniqueReferencedIds(root, instructions)
  return new Map(instructions.map(({target, config}) => [target, config]))
}

/** Resolve the closest whole distribution config on the element or an ancestor. */
export function effectiveDistribution(element: Element): {config: DistributionConfig; element: Element} | null {
  const document = connectedDocument(element)
  const configs = configsByTarget(document)
  for(let current: Element | null = element; current; current = current.parentElement) {
    if(!current.id) continue
    const config = configs.get(current.id)
    if(config) {
      assertUniqueElementId(current, current.id)
      return {config, element: current}
    }
  }
  return null
}

export function getDistributionSelection(element: Element): {
  target: string
  local: DistributionConfig | null
  effective: DistributionConfig | null
  inheritedFrom: string | null
  error?: string
} {
  try {
    const document = connectedDocument(element)
    const configs = configsByTarget(document)
    if(element.id) assertUniqueElementId(element, element.id)
    const local = element.id ? configs.get(element.id) ?? null : null
    const effective = effectiveDistribution(element)
    return {
      target: element.id,
      local,
      effective: effective?.config ?? null,
      inheritedFrom: effective && effective.element !== element ? effective.element.id : null,
    }
  }
  catch(error) {
    return {target: element.id, local: null, effective: null, inheritedFrom: null, error: error instanceof Error ? error.message : String(error)}
  }
}
