import type {DistributionNode} from "./distribution-validation.js"
import {validateDistributionChange} from "./distribution-validation.js"
import {readDistributionConfigs} from "./distribution-dom"
import {editorWidgetLookup, isEditorOwnedAttribute} from "./editor-artifacts"

/** Stable, artifact-free validation projection; never stored as an editor model. */
export function distributionSnapshot(node: Node, isWidget = editorWidgetLookup(node)): DistributionNode | null {
  if(node.nodeType === 3) return {name: "#text", value: node.nodeValue ?? ""}
  if(node.nodeType === 8) return {name: "#comment", value: node.nodeValue ?? ""}
  if(node.nodeType === 7) {
    const instruction = node as ProcessingInstruction
    return {name: "#comment", value: `?${instruction.target}${instruction.data ? ` ${instruction.data}` : ""}?`}
  }
  if(node.nodeType !== 1) return null
  const element = node as Element
  if(element.classList.contains("◆editor-only") || element.hasAttribute("data-webwriter-editor-only")) return null
  const attrs: Record<string, string> = {}
  for(const attribute of Array.from(element.attributes).sort((a, b) => a.name.localeCompare(b.name))) {
    if(attribute.namespaceURI === null && isEditorOwnedAttribute(element, attribute.name, isWidget)) continue
    const value = attribute.name === "class" ? attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ") : attribute.value
    if(attribute.name !== "class" || value) attrs[attribute.name] = value
  }
  const container = element.localName === "template" && "content" in element ? (element as HTMLTemplateElement).content : element
  return {name: element.localName, namespace: element.namespaceURI ?? undefined, attrs,
    children: Array.from(container.childNodes).flatMap(child => { const value = distributionSnapshot(child, isWidget); return value ? [value] : [] })}
}

export function distributionFragment(html: string, root: Document): DistributionNode[] {
  const template = root.createElement("template")
  template.innerHTML = html
  return Array.from(template.content.childNodes).flatMap(node => { const value = distributionSnapshot(node); return value ? [value] : [] })
}

/** Validate learner snapshots against policies taken only from the host's document. */
export function createBrowserDistributionValidator(baseHTML: string) {
  const parser = new DOMParser()
  const base = parser.parseFromString(baseHTML, "text/html")
  const configs = readDistributionConfigs(base)
  const snapshot = (html: string) => distributionSnapshot(parser.parseFromString(html, "text/html").documentElement)!
  return {
    configured: configs.length > 0,
    validate(beforeHTML: string | undefined, afterHTML: string) {
      if(typeof afterHTML !== "string" || afterHTML.length > 8 * 1024 * 1024) return false
      return validateDistributionChange(snapshot(beforeHTML ?? baseHTML), snapshot(afterHTML), configs,
        html => distributionFragment(html, base))
    },
  }
}
