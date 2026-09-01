import {getElementPresentation} from "./element-names"

/** Semantic container types exposed by the Section control. They are
 * transparent to ordinary document selection, much like inline marks. */
export const sectionNames = [
  "section",
  "div",
  "blockquote",
  "figure",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "nav",
  "search",
  "address",
] as const

export type SectionName = typeof sectionNames[number]
export type SectionElement = Element & {readonly localName: SectionName}

export type SectionOption = {
  label: string
  value: SectionName
  icon: string
}

export const sectionOptions: readonly SectionOption[] = sectionNames.map(value => {
  const presentation = getElementPresentation(value)
  return {
    label: value === "div" ? "Division" : presentation.name,
    value,
    icon: presentation.icon,
  }
})

export function isSectionName(value: unknown): value is SectionName {
  return typeof value === "string" && sectionNames.includes(value as SectionName)
}

export function getSectionOption(value: SectionName) {
  return sectionOptions.find(option => option.value === value)!
}

export function isSectionElement(node: unknown): node is SectionElement {
  if(!node || typeof node !== "object") return false
  const element = node as Partial<Element>
  return element.nodeType === 1
    && element.namespaceURI === "http://www.w3.org/1999/xhtml"
    && isSectionName(element.localName)
}
