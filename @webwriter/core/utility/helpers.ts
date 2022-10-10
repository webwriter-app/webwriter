import { Action, ActionCreator, createAction } from "@reduxjs/toolkit"

export const isOverflownX = (el: Element) => el.scrollWidth > el.clientWidth
export const isOverflownY = (el: Element) => el.scrollHeight > el.clientHeight
export const isOverflown = (el: Element) => isOverflownX(el) || isOverflownY(el)
export const escapeHTML = (unsafe: string) => unsafe
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;")

export const getFileExtension = (path: string) => path.slice((path.lastIndexOf(".") - 1 >>> 0) + 2)

export function hashCode(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
      let chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function camelCaseToSpacedCase(str: string, capitalizeFirstLetter=true) {
  const spacedStr = str.replace(/([A-Z][a-z]|[0-9])+/g, " $&")
  return capitalizeFirstLetter? spacedStr.replace(/^[a-z]/g, match => match.toUpperCase()): spacedStr
}

export function prettifyPackageName(name: string, capitalizeFirstLetter=true) {
  const coreName = name.split("-").pop()
  return capitalizeFirstLetter? coreName.charAt(0).toUpperCase() + coreName.slice(1): coreName
}

export function createElementWithAttributes(doc: Document, tagName: string, options: ElementCreationOptions, attributes: Record<string, string> = {}, properties: Record<string, any> = {}) {
  const el = doc.createElement(tagName, options)
  Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value))
  Object.entries(properties).forEach(([key, value]) => el[key] = value)
  return el
}

export function namedNodeMapToObject(nodeMap: NamedNodeMap) {
  return Object.fromEntries(Array.from(nodeMap).map(x => [x.name, x.value]))
}

export function createRequestedActionEntry<T extends string, H extends (action?: Action<`${T}_REQUESTED`>) => any>(actionType: T, handler: H) {
  type RequestedType = `${T}_REQUESTED`
  type HA = Parameters<H>[0]
  const requestedAction = createAction(`${actionType}_REQUESTED`) as ActionCreator<HA>

  return {
    [`${actionType}_REQUESTED`]: requestedAction,
  } as Record<RequestedType, typeof requestedAction>
}

export class WWURL extends URL {
  constructor(url: string, base?: string) {
    super(url, base)
    const protocol = this.protocol.slice(0, -1)
    const format = this.wwformat
  }

  get wwformat() {
    return this.pathname.slice((this.pathname.lastIndexOf(".") - 1 >>> 0) + 2)
  }

  set wwformat(value: string) {
    const i = this.pathname.lastIndexOf(this.wwformat)
    this.pathname = this.pathname.slice(0, i) + (i > -1? ".": "") + value
  }
}

export function detectEnvironment() {
	if((window as any)?.__TAURI__ ) {
		return "tauri"
	}
	else if(window && (globalThis === window)) {
		return "node"
	}
	else {
		return "unknown"
	}
}

export function unscopePackageName(name: string) {
  return name.split(/\@.*\//).pop()
}