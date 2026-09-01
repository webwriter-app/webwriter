import {getElementPresentation} from "./element-names"

export type ElementAttributeState = {
  /** BODY-relative child-node path. Null addresses the document element. */
  path: number[] | null
  localName: string
  namespaceURI: string | null
  name: string
  icon?: string
  attributes: Record<string, string>
}

export type ElementAttributeOption = {
  name: string
  label: string
  kind?: "text" | "number" | "url" | "boolean" | "select"
  placeholder?: string
  options?: readonly {label: string, value: string}[]
}

const commonAttributeOptions: readonly ElementAttributeOption[] = [
  {name: "id", label: "ID"},
  {name: "class", label: "Classes"},
  {name: "title", label: "Title"},
  {name: "lang", label: "Language", placeholder: "en"},
  {name: "dir", label: "Direction", kind: "select", options: [
    {label: "Not set", value: ""},
    {label: "Left to right", value: "ltr"},
    {label: "Right to left", value: "rtl"},
    {label: "Automatic", value: "auto"},
  ]},
  {name: "hidden", label: "Hidden", kind: "boolean"},
]

const optionsByElement: Readonly<Record<string, readonly ElementAttributeOption[]>> = {
  html: [
    {name: "lang", label: "Document language", placeholder: "en"},
    {name: "dir", label: "Text direction", kind: "select", options: commonAttributeOptions[4].options},
  ],
  bdo: [
    {name: "dir", label: "Text direction", kind: "select", options: [
      {label: "Left to right", value: "ltr"},
      {label: "Right to left", value: "rtl"},
    ]},
  ],
  blockquote: [{name: "cite", label: "Source URL", kind: "url", placeholder: "https://…"}],
  q: [{name: "cite", label: "Source URL", kind: "url", placeholder: "https://…"}],
  details: [
    {name: "name", label: "Accordion group"},
    {name: "open", label: "Initially open", kind: "boolean"},
  ],
  ol: [
    {name: "start", label: "Start at", kind: "number"},
    {name: "reversed", label: "Reverse numbering", kind: "boolean"},
    {name: "type", label: "Numbering", kind: "select", options: [
      {label: "Default", value: ""},
      {label: "1, 2, 3", value: "1"},
      {label: "a, b, c", value: "a"},
      {label: "A, B, C", value: "A"},
      {label: "i, ii, iii", value: "i"},
      {label: "I, II, III", value: "I"},
    ]},
  ],
  li: [{name: "value", label: "Item number", kind: "number"}],
  img: [
    {name: "usemap", label: "Image map", placeholder: "#map-name"},
    {name: "ismap", label: "Server-side map", kind: "boolean"},
    {name: "fetchpriority", label: "Fetch priority", kind: "select", options: [
      {label: "Automatic", value: ""},
      {label: "High", value: "high"},
      {label: "Low", value: "low"},
    ]},
  ],
  iframe: [
    {name: "name", label: "Browsing context name"},
    {name: "loading", label: "Loading", kind: "select", options: [
      {label: "Default", value: ""},
      {label: "Lazy", value: "lazy"},
      {label: "Eager", value: "eager"},
    ]},
    {name: "referrerpolicy", label: "Referrer policy"},
  ],
  td: [
    {name: "colspan", label: "Column span", kind: "number"},
    {name: "rowspan", label: "Row span", kind: "number"},
    {name: "headers", label: "Header cell IDs"},
  ],
  th: [
    {name: "colspan", label: "Column span", kind: "number"},
    {name: "rowspan", label: "Row span", kind: "number"},
    {name: "headers", label: "Header cell IDs"},
    {name: "scope", label: "Scope", kind: "select", options: [
      {label: "Automatic", value: ""},
      {label: "Column", value: "col"},
      {label: "Row", value: "row"},
      {label: "Column group", value: "colgroup"},
      {label: "Row group", value: "rowgroup"},
    ]},
    {name: "abbr", label: "Abbreviation"},
  ],
}

const editorOnlyAttributes = new Set(["contenteditable", "spellcheck", "data-webwriter-editor-only"])
const blockedAttributes = new Set(["srcdoc"])
const urlAttributes = new Set(["href", "src", "xlink:href", "action", "formaction", "poster", "cite", "data"])

export function elementAttributeOptions(localName: string) {
  const specific = optionsByElement[localName] ?? []
  const specificNames = new Set(specific.map(option => option.name))
  return [...specific, ...commonAttributeOptions.filter(option => !specificNames.has(option.name))]
}

export function isEditorOnlyElementAttribute(name: string) {
  return editorOnlyAttributes.has(name.toLowerCase())
}

export function elementAttributeEditability(name: string) {
  const normalized = name.toLowerCase()
  if(normalized === "style") return {editable: false, reason: "Use the Style tools"} as const
  if(blockedAttributes.has(normalized) || normalized.startsWith("on")) {
    return {editable: false, reason: "Blocked for safety"} as const
  }
  if(editorOnlyAttributes.has(normalized)) return {editable: false, reason: "Managed by the editor"} as const
  return {editable: true, reason: ""} as const
}

export function sanitizeAuthoredClass(value: string) {
  return value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
}

export function isUnsafeElementAttributeValue(name: string, value: string) {
  if(!urlAttributes.has(name.toLowerCase())) return false
  const normalized = value.trim().toLowerCase().replaceAll(/[\u0000-\u0020]+/g, "")
  return normalized.startsWith("javascript:")
    || normalized.startsWith("vbscript:")
    || normalized.startsWith("data:text/html")
    || normalized.startsWith("data:image/svg+xml")
}

export function elementAttributeState(element: Element, path: number[] | null): ElementAttributeState {
  const attributes = Object.fromEntries(Array.from(element.attributes).flatMap(attribute => {
    if(isEditorOnlyElementAttribute(attribute.name)) return []
    if(attribute.name === "class") {
      const value = sanitizeAuthoredClass(attribute.value)
      return value ? [[attribute.name, value]] : []
    }
    return [[attribute.name, attribute.value]]
  }))
  const presentation = getElementPresentation(element)
  return {
    path: path ? [...path] : null,
    localName: element.localName,
    namespaceURI: element.namespaceURI,
    name: presentation.name,
    ...(presentation.icon ? {icon: presentation.icon} : {}),
    attributes,
  }
}
