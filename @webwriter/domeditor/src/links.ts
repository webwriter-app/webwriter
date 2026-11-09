import {isMarkAttributeName} from "./marks"
import {isRelativeURLInput, normalizeURLInput} from "./url-input.js"

export const linkKinds = ["link", "cross-reference", "citation", "attachment", "popup"] as const
export type LinkKind = typeof linkKinds[number]
export type InputLinkKind = Exclude<LinkKind, "attachment" | "popup">

export const linkKindOptions = {
  link: {label: "Link", icon: "MarkLink", action: "mark:a"},
  "cross-reference": {label: "Cross Reference", icon: "Hash", action: "mark:cross-reference"},
  citation: {label: "Citation", icon: "Quote", action: "mark:citation"},
  attachment: {label: "Attachment", icon: "Attachment", action: "mark:attachment"},
  popup: {label: "Popup", icon: "Popup", action: "toggle-popup"},
} as const

export function isLinkKind(value: unknown): value is LinkKind {
  return linkKinds.some(kind => kind === value)
}

function isInputLinkKind(value: unknown): value is InputLinkKind {
  return isLinkKind(value) && value !== "attachment" && value !== "popup"
}

export function linkKindFromAttributes(attributes: Record<string, string>, href = attributes.href ?? ""): InputLinkKind {
  if(attributes["data-reference"]) return "citation"
  return href.startsWith("#") ? "cross-reference" : "link"
}

/** Interpret web addresses independently of the editor frame's URL. */
export function normalizeLinkHref(input: string): string | null {
  const href = normalizeURLInput(input)
  if(!href || href === "#") return null
  if(isRelativeURLInput(href)) return /[\u0000-\u001f\\]/.test(href) ? null : href
  try {
    const url = new URL(href)
    if(!["http:", "https:", "mailto:", "tel:", "ftp:", "file:"].includes(url.protocol)) return null
    // Keep valid address spelling; use the platform to encode spaces in paths.
    return /\s/.test(href) ? url.href : href
  }
  catch { return null }
}

/** A disposable view of the current DOM selection for the link keyboard. */
export type LinkSelectionState = {
  active: boolean
  kind?: InputLinkKind
  identity: string
  href: string
  attributes: Record<string, string>
  text: string
  targets: Array<{href: string, label: string}>
  references?: Array<{href: string, label: string, data: string}>
  referenceAllowed?: boolean
}

export type LinkEdit = {
  identity: string
  kind?: InputLinkKind
  href: string
  attributes: Record<string, string | null>
}

export type AttachmentSelectionState = {
  identity: string
  media: Array<{id: string, label: string}>
}

export type AttachmentSource = {file: File} | {mediaId: string}

export const attachmentWarningBytes = 5_000_000

export function isAttachmentSelectionState(value: unknown): value is AttachmentSelectionState {
  if(!value || typeof value !== "object" || Array.isArray(value)) return false
  const state = value as AttachmentSelectionState
  return typeof state.identity === "string" && !!state.identity && Array.isArray(state.media)
    && state.media.every(item => !!item && typeof item === "object" && typeof item.id === "string" && typeof item.label === "string")
}

export function isLinkSelectionState(value: unknown): value is LinkSelectionState {
  if(!value || typeof value !== "object" || Array.isArray(value)) return false
  const state = value as LinkSelectionState
  return typeof state.active === "boolean" && typeof state.identity === "string" && !!state.identity
    && (state.kind === undefined || isInputLinkKind(state.kind))
    && typeof state.href === "string" && typeof state.text === "string"
    && (state.referenceAllowed === undefined || typeof state.referenceAllowed === "boolean")
    && !!state.attributes && typeof state.attributes === "object" && !Array.isArray(state.attributes)
    && Object.entries(state.attributes).every(([name, value]) => isMarkAttributeName("a", name) && typeof value === "string")
    && Array.isArray(state.targets) && state.targets.every(target => !!target && typeof target === "object"
      && typeof target.href === "string" && typeof target.label === "string")
    && (state.references === undefined || Array.isArray(state.references) && state.references.every(reference =>
      !!reference && typeof reference === "object" && typeof reference.href === "string"
      && typeof reference.label === "string" && typeof reference.data === "string"))
}

export function isLinkEdit(value: unknown): value is LinkEdit {
  if(!value || typeof value !== "object" || Array.isArray(value)) return false
  const edit = value as LinkEdit
  return typeof edit.identity === "string" && !!edit.identity && typeof edit.href === "string"
    && (edit.kind === undefined || isInputLinkKind(edit.kind))
    && !!edit.attributes && typeof edit.attributes === "object" && !Array.isArray(edit.attributes)
    && Object.entries(edit.attributes).every(([name, value]) => name !== "href" && isMarkAttributeName("a", name)
      && (value === null || typeof value === "string"))
}
