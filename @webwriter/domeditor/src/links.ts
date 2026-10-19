import {isMarkAttributeName} from "./marks"

/** Interpret web addresses independently of the editor frame's URL. */
export function normalizeLinkHref(input: string): string | null {
  let href = input.trim()
  if(!href) return null
  if(href.startsWith("#")) return href.length > 1 ? href : null
  const scheme = /^[a-z][a-z\d+.-]*:/i.exec(href)?.[0].toLowerCase()
  if(scheme === "http:" || scheme === "https:") href = href.replace(/^https?:\/*/i, `${scheme}//`)
  else if(scheme && !/^[^/?#:\s]+:\d+(?:[/?#]|$)/.test(href)) {
    if(!["mailto:", "tel:", "ftp:", "file:"].includes(scheme)) return null
  }
  else {
    href = href.replace(/^\/\//, "")
    if(/^[./?]/.test(href)) return null
    href = `https://${href}`
  }
  try {
    const url = new URL(href)
    if(url.protocol === "https:" && !url.hostname) return null
    // Keep valid address spelling; use the platform to encode spaces in paths.
    return /\s/.test(href) ? url.href : href
  }
  catch { return null }
}

/** A disposable view of the current DOM selection for the link keyboard. */
export type LinkSelectionState = {
  active: boolean
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
  href: string
  attributes: Record<string, string | null>
}

export function isLinkSelectionState(value: unknown): value is LinkSelectionState {
  if(!value || typeof value !== "object" || Array.isArray(value)) return false
  const state = value as LinkSelectionState
  return typeof state.active === "boolean" && typeof state.identity === "string" && !!state.identity
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
    && !!edit.attributes && typeof edit.attributes === "object" && !Array.isArray(edit.attributes)
    && Object.entries(edit.attributes).every(([name, value]) => name !== "href" && isMarkAttributeName("a", name)
      && (value === null || typeof value === "string"))
}
