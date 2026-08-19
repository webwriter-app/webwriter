import packageManifest from "../package.json"

export const WEBWRITER_GENERATOR = `webwriter@${packageManifest.version}`

export const creativeCommonsLicenses = [
  {
    code: "CC0-1.0",
    name: "Creative Commons Zero 1.0 Universal",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    code: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0 International",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    code: "CC-BY-SA-4.0",
    name: "Creative Commons Attribution ShareAlike 4.0 International",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  {
    code: "CC-BY-NC-4.0",
    name: "Creative Commons Attribution NonCommercial 4.0 International",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  {
    code: "CC-BY-ND-4.0",
    name: "Creative Commons Attribution NoDerivatives 4.0 International",
    url: "https://creativecommons.org/licenses/by-nd/4.0/",
  },
  {
    code: "CC-BY-NC-SA-4.0",
    name: "Creative Commons Attribution NonCommercial ShareAlike 4.0 International",
    url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  },
  {
    code: "CC-BY-NC-ND-4.0",
    name: "Creative Commons Attribution NonCommercial NoDerivatives 4.0 International",
    url: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
  },
] as const

export type DocumentHeadField =
  | "title"
  | "description"
  | "keywords"
  | "author"
  | "license"
  | "language"
  | "theme"

export const documentHeadElementKinds = [
  "script",
  "stylesheet",
  "style",
  "meta",
  "link",
  "base",
  "pragma",
  "charset",
  "noscript",
  "title",
  "generator",
  "template",
] as const

export type DocumentHeadElementKind = typeof documentHeadElementKinds[number]

export type DocumentHeadAttributeState = {
  name: string
  value: string
}

export type DocumentHeadElementState = {
  id: string
  tagName: string
  label: string
  attributes: DocumentHeadAttributeState[]
  content?: string
  contentLabel?: string
  preset?: string
  canMoveUp: boolean
  canMoveDown: boolean
}

export type DocumentHeadState = {
  title: string
  description: string
  keywords: string
  author: string
  license: string
  language: string
  theme: string
  generator: string
  elements: DocumentHeadElementState[]
}

export const emptyDocumentHeadState = (): DocumentHeadState => ({
  title: "",
  description: "",
  keywords: "",
  author: "",
  license: "",
  language: "",
  theme: "",
  generator: "",
  elements: [],
})

export type DocumentHeadAction =
  | {type: "setDocumentHeadField", field: DocumentHeadField, value: string}
  | {type: "addDocumentHeadElement", kind: DocumentHeadElementKind}
  | {type: "removeDocumentHeadElement", id: string}
  | {type: "moveDocumentHeadElement", id: string, direction: "up" | "down"}
  | {type: "setDocumentHeadElementContent", id: string, value: string}
  | {
      type: "setDocumentHeadElementAttribute"
      id: string
      name: string
      value: string
      previousName?: string
    }
  | {type: "removeDocumentHeadElementAttribute", id: string, name: string}

const documentHeadFields = new Set<DocumentHeadField>([
  "title",
  "description",
  "keywords",
  "author",
  "license",
  "language",
  "theme",
])

const documentHeadKinds = new Set<DocumentHeadElementKind>(documentHeadElementKinds)

export function isDocumentHeadAction(value: unknown): value is DocumentHeadAction {
  if(!value || typeof value !== "object") return false
  const action = value as Record<string, unknown>
  if(typeof action.type !== "string") return false
  if(action.type === "setDocumentHeadField") {
    return documentHeadFields.has(action.field as DocumentHeadField) && typeof action.value === "string"
  }
  if(action.type === "addDocumentHeadElement") {
    return documentHeadKinds.has(action.kind as DocumentHeadElementKind)
  }
  if(action.type === "removeDocumentHeadElement") {
    return typeof action.id === "string"
  }
  if(action.type === "moveDocumentHeadElement") {
    return typeof action.id === "string" && (action.direction === "up" || action.direction === "down")
  }
  if(action.type === "setDocumentHeadElementContent") {
    return typeof action.id === "string" && typeof action.value === "string"
  }
  if(action.type === "setDocumentHeadElementAttribute") {
    return typeof action.id === "string" && typeof action.name === "string" &&
      typeof action.value === "string" &&
      (action.previousName === undefined || typeof action.previousName === "string")
  }
  if(action.type === "removeDocumentHeadElementAttribute") {
    return typeof action.id === "string" && typeof action.name === "string"
  }
  return false
}
