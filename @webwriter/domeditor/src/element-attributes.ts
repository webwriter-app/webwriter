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

export type ElementEditingLimitation = {
  title: string
  description: string
  guidance: string
  attributes: "editable" | "read-only"
}

/** Elements whose specialized visual authoring is intentionally outside the
 * editor. Existing DOM is preserved; the per-element policy below describes
 * which safe, generic editing remains available. */
export const deliberatelyUnsupportedElementNames = [
  "script",
  "style",
  "canvas",
  "template",
  "noscript",
  "slot",
] as const

const limitationsByElement: Readonly<Record<typeof deliberatelyUnsupportedElementNames[number], ElementEditingLimitation>> = {
  script: {
    title: "Executable code is read-only",
    description: "Scripts are preserved, but creating or editing executable code is deliberately unsupported for safety.",
    guidance: "Add behavior through a managed package or dependency.",
    attributes: "read-only",
  },
  style: {
    title: "Embedded CSS is read-only",
    description: "Style elements are preserved, but arbitrary CSS editing is deliberately unsupported.",
    guidance: "Use themes, the Style tools, or styles supplied by a managed package.",
    attributes: "read-only",
  },
  canvas: {
    title: "Canvas drawings are not editable",
    description: "This canvas, its attributes, and fallback content are preserved, but its pixels and drawing commands are not DOM content.",
    guidance: "Use an SVG graphic when the drawing needs visual editing.",
    attributes: "editable",
  },
  template: {
    title: "Template contents are not visually editable",
    description: "The inert template subtree is preserved, but scoped template source editing is deliberately unsupported.",
    guidance: "Use ordinary document content or a package-provided component.",
    attributes: "editable",
  },
  noscript: {
    title: "No-script content is not visually editable",
    description: "Body no-script behavior depends on the browser's scripting state and is deliberately not represented as ordinary editable content.",
    guidance: "Use ordinary fallback content; head metadata remains available in the Document toolbox.",
    attributes: "editable",
  },
  slot: {
    title: "Slot behavior is component-managed",
    description: "Slots are preserved, but authoring shadow-tree contracts is deliberately unsupported.",
    guidance: "Edit fallback content normally and use package controls to configure component slots.",
    attributes: "editable",
  },
}

const htmlNamespace = "http://www.w3.org/1999/xhtml"

/** Returns the user-facing policy for an intentionally limited HTML element. */
export function elementEditingLimitation(localName: string, namespaceURI: string | null = htmlNamespace) {
  if(namespaceURI !== htmlNamespace) return null
  const known = limitationsByElement[localName as keyof typeof limitationsByElement]
  if(known) return known
  return null
}

const commonAttributeOptions: readonly ElementAttributeOption[] = [
  {name: "id", label: "ID"},
  {name: "class", label: "Classes"},
  {name: "title", label: "Title"},
  {name: "lang", label: "Language", placeholder: "English"},
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
    {name: "lang", label: "Document language", placeholder: "English"},
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
    // Website-specific options are owned by the media drawer.
  ],
  td: [
    {name: "colspan", label: "Column span", kind: "number"},
    {name: "rowspan", label: "Row span", kind: "number"},
  ],
  th: [
    {name: "colspan", label: "Column span", kind: "number"},
    {name: "rowspan", label: "Row span", kind: "number"},
  ],
}

const editorOnlyAttributes = new Set(["contenteditable", "spellcheck", "data-webwriter-editor-only"])
const blockedAttributes = new Set(["srcdoc"])
const urlAttributes = new Set(["href", "src", "xlink:href", "action", "formaction", "poster", "cite", "data"])
const unsafeStyleValue = /(?:expression\s*\(|javascript\s*:|data\s*:\s*text\/html)/i

export function isUnsafeElementAttributeName(name: string) {
  const normalized = name.toLowerCase()
  return blockedAttributes.has(normalized) || normalized.startsWith("on")
}

export function elementAttributeOptions(localName: string) {
  const specific = optionsByElement[localName] ?? []
  const specificNames = new Set(specific.map(option => option.name))
  return [...specific, ...commonAttributeOptions.filter(option => !specificNames.has(option.name) && !(option.name === "role"
    && ["table", "thead", "tbody", "tfoot", "tr", "td", "th"].includes(localName)))]
}

export function isEditorOnlyElementAttribute(name: string) {
  return editorOnlyAttributes.has(name.toLowerCase())
}

export function elementAttributeEditability(name: string, localName?: string, namespaceURI?: string | null) {
  const limitation = localName ? elementEditingLimitation(localName, namespaceURI) : null
  if(limitation?.attributes === "read-only") return {editable: false, reason: "Read-only by policy"} as const
  const normalized = name.toLowerCase()
  if(localName === "details" && normalized === "name") return {editable: false, reason: "Accordion groups are unsupported"} as const
  if((localName === "td" || localName === "th") && ["headers", "scope", "abbr"].includes(normalized)
    || ["table", "thead", "tbody", "tfoot", "tr", "td", "th"].includes(localName ?? "") && normalized === "role") {
    return {editable: false, reason: "Unsupported by the table schema"} as const
  }
  if(normalized === "controls" && (localName === "audio" || localName === "video")) {
    return {editable: false, reason: "Required by the media schema"} as const
  }
  if(normalized === "style") return {editable: false, reason: "Use the Style tools"} as const
  if(isUnsafeElementAttributeName(normalized)) {
    return {editable: false, reason: "Blocked for safety"} as const
  }
  if(editorOnlyAttributes.has(normalized)) return {editable: false, reason: "Managed by the editor"} as const
  return {editable: true, reason: ""} as const
}

export function sanitizeAuthoredClass(value: string) {
  return value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
}

export function isUnsafeElementAttributeValue(name: string, value: string) {
  const normalizedName = name.toLowerCase()
  if(normalizedName === "style") return unsafeStyleValue.test(value)
  if(!urlAttributes.has(normalizedName)) return false
  const normalizedValue = value.trim().toLowerCase().replaceAll(/[\u0000-\u0020]+/g, "")
  return normalizedValue.startsWith("javascript:")
    || normalizedValue.startsWith("vbscript:")
    || normalizedValue.startsWith("data:text/html")
    || normalizedValue.startsWith("data:image/svg+xml")
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
