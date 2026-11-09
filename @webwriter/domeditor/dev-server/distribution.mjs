import {defaultTreeAdapter, parse, parseFragment, serialize} from "parse5"
import {distributionInstruction, distributionTextInstruction, supportsDistribution} from "../src/distribution.js"
import {validateDistributionChange} from "../src/distribution-validation.js"

const children = node => node.content?.childNodes ?? node.childNodes ?? []

function instructions(node) {
  const nodes = children(node)
  return nodes.flatMap((child, index) => {
    if(child.nodeName === "#comment") {
      const config = distributionInstruction(child.data)
      if(config) return [{node: child, config}]
    }
    if(child.nodeName === "#text" && index === nodes.length - 1) {
      const parsed = distributionTextInstruction(node.tagName, node.namespaceURI, child.value)
      if(parsed) return [{node: child, ...parsed}]
    }
    return []
  })
}

function localInstruction(node) {
  const records = instructions(node)
  if(records.length > 1 || records.length && !supportsDistribution(node.tagName, node.namespaceURI)) {
    throw new TypeError("Invalid or duplicate distribution policy")
  }
  return records[0]
}

function snapshot(node) {
  if(node.nodeName === "#text") return {name: "#text", value: node.value}
  if(node.nodeName === "#comment") return {name: "#comment", value: node.data}
  if(!node.tagName) return null
  const original = Object.fromEntries(node.attrs.map(attribute => [attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name, attribute.value]))
  const classes = (original.class ?? "").split(/\s+/)
  if(classes.includes("◆editor-only") || Object.hasOwn(original, "data-webwriter-editor-only")) return null
  if(Object.hasOwn(original, "class")) {
    original.class = classes.filter(name => name && !name.startsWith("◆")).join(" ")
    if(!original.class) delete original.class
  }
  const policy = localInstruction(node)
  return {name: node.tagName, namespace: node.namespaceURI,
    attrs: Object.fromEntries(Object.entries(original).sort(([a], [b]) => a.localeCompare(b))),
    ...(policy ? {policy: policy.config} : {}),
    children: children(node).flatMap(child => {
      if(child === policy?.node) return policy.text ? [{name: "#text", value: policy.text}] : []
      const value = snapshot(child)
      return value ? [value] : []
    })}
}
const documentTree = html => snapshot(parse(html).childNodes.find(node => node.tagName === "html"))
const fragmentTree = html => parseFragment(html).childNodes.flatMap(node => { const value = snapshot(node); return value ? [value] : [] })

function omitPrivateElements(root, hidden) {
  const omitted = new Set()
  const visit = (node, insidePrivate = false) => {
    const privateElement = hidden.has(node)
    if(insidePrivate || privateElement) omitted.add(node)
    for(const child of [...children(node)]) visit(child, privateElement || insidePrivate)
    if(!privateElement || insidePrivate) return
    // Keep the structural HTML shell intact.
    if(node === root || node.parentNode === root && ["head", "body"].includes(node.tagName)) {
      node.attrs = []
      for(const child of [...node.childNodes]) {
        if(node === root && ["head", "body"].includes(child.tagName)) {
          child.attrs = []
          for(const content of [...child.childNodes]) defaultTreeAdapter.detachNode(content)
        }
        else defaultTreeAdapter.detachNode(child)
      }
    }
    else defaultTreeAdapter.detachNode(node)
  }
  visit(root)
  return omitted
}

/** Policies always come from the host-published document or an accepted snapshot. */
export function createDistributionValidator(baseHTML) {
  const document = parse(baseHTML)
  const root = document.childNodes.find(node => node.tagName === "html")
  const local = new Map()
  const visit = node => {
    if(!node.tagName) return
    const record = localInstruction(node)
    if(record) local.set(node, record.config)
    for(const child of children(node)) visit(child)
  }
  visit(root)
  const hidden = new Set([...local].filter(([, config]) => config.view === false).map(([node]) => node))
  const omitted = hidden.size ? omitPrivateElements(root, hidden) : new Set()
  const html = hidden.size ? serialize(document) : baseHTML
  return {
    html,
    configured: [...local.keys()].some(node => !omitted.has(node)),
    validate(beforeHTML, afterHTML) {
      if(typeof afterHTML !== "string" || afterHTML.length > 8 * 1024 * 1024) return false
      try { return validateDistributionChange(documentTree(beforeHTML ?? html), documentTree(afterHTML), fragmentTree) }
      catch { return false }
    },
  }
}
