import {parse, parseFragment} from "parse5"
import {decodeDistributionConfig, distributionTarget} from "../src/distribution.js"
import {validateDistributionChange} from "../src/distribution-validation.js"

function snapshot(node) {
  if(node.nodeName === "#text") return {name: "#text", value: node.value}
  if(node.nodeName === "#comment") return {name: "#comment", value: node.data}
  if(!node.tagName) return null
  const original = Object.fromEntries(node.attrs.map(attribute => [attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name, attribute.value]))
  const classes = (original.class ?? "").split(/\s+/)
  if(classes.includes("◆editor-only") || Object.hasOwn(original, "data-webwriter-editor-only")) return null
  if(original.contenteditable === "" && classes.includes("◆widget-editable")) delete original.contenteditable
  if(Object.hasOwn(original, "class")) {
    original.class = classes.filter(name => name && !name.startsWith("◆")).join(" ")
    if(!original.class) delete original.class
  }
  return {name: node.tagName, namespace: node.namespaceURI,
    attrs: Object.fromEntries(Object.entries(original).sort(([a], [b]) => a.localeCompare(b))),
    children: (node.content?.childNodes ?? node.childNodes ?? []).flatMap(child => { const value = snapshot(child); return value ? [value] : [] })}
}
const documentTree = html => snapshot(parse(html).childNodes.find(node => node.tagName === "html"))
const fragmentTree = html => parseFragment(html).childNodes.flatMap(node => { const value = snapshot(node); return value ? [value] : [] })

/** Policies always come from the host-published document, never a reader payload. */
export function createDistributionValidator(baseHTML) {
  const base = documentTree(baseHTML)
  const configs = []
  const targets = new Set()
  for(const node of base.children.find(node => node.name === "head")?.children ?? []) {
    if(node.name !== "#comment" || !node.value.startsWith(`?${distributionTarget}`)) continue
    const prefix = `?${distributionTarget} `
    const config = node.value.startsWith(prefix) && node.value.endsWith("?")
      ? decodeDistributionConfig(node.value.slice(prefix.length, -1)) : null
    if(!config || targets.has(config.target)) throw new TypeError("Invalid or duplicate distribution policy")
    targets.add(config.target)
    configs.push(config)
  }
  return {
    configured: configs.length > 0,
    validate(beforeHTML, afterHTML) {
      if(typeof afterHTML !== "string" || afterHTML.length > 8 * 1024 * 1024) return false
      return validateDistributionChange(documentTree(beforeHTML ?? baseHTML), documentTree(afterHTML), configs, fragmentTree)
    },
  }
}
