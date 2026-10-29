import type {DistributionNode} from "./distribution-validation.js"

/** Stable, artifact-free validation projection; never stored as an editor model. */
export function distributionSnapshot(node: Node): DistributionNode | null {
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
    if(attribute.name === "contenteditable" && attribute.value === "" && element.classList.contains("◆widget-editable")) continue
    const value = attribute.name === "class" ? attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ") : attribute.value
    if(attribute.name !== "class" || value) attrs[attribute.name] = value
  }
  const container = element.localName === "template" && "content" in element ? (element as HTMLTemplateElement).content : element
  return {name: element.localName, namespace: element.namespaceURI ?? undefined, attrs,
    children: Array.from(container.childNodes).flatMap(child => { const value = distributionSnapshot(child); return value ? [value] : [] })}
}

export function distributionFragment(html: string, root: Document): DistributionNode[] {
  const template = root.createElement("template")
  template.innerHTML = html
  return Array.from(template.content.childNodes).flatMap(node => { const value = distributionSnapshot(node); return value ? [value] : [] })
}
