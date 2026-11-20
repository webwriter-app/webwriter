import type {ReadableElement, ReadableNode} from "./dom-readers"

/** Empty text containers do not prevent a lone item from owning the viewport.
 * Widgets and native media remain content even without light-DOM text. */
function hasDocumentContent(node: ReadableNode): boolean {
  if(node.nodeType === 3) return Boolean(node.textContent?.trim())
  if(node.nodeType !== 1) return false
  const element = node as ReadableElement
  if(isViewportDocument(element)) return true
  if(element.localName.includes("-") || element.hasAttribute("is")) return true
  if(["script", "style", "link", "meta", "template"].includes(element.localName)) return false
  if(["img", "video", "audio", "iframe", "embed", "object", "canvas", "svg", "math", "hr", "input", "select", "textarea", "button", "meter", "progress", "details"].includes(element.localName)) return true
  return Array.from(element.childNodes).some(hasDocumentContent)
}

export function isSoleDocumentContent(element: ReadableElement) {
  const body = element.ownerDocument.body
  return element.parentElement === body && Array.from(body.childNodes).every(node => node === element || !hasDocumentContent(node))
}

export function isViewportDocument(element: ReadableElement) {
  return element.parentElement === element.ownerDocument.body
    && Boolean(element.getAttribute("role")?.toLowerCase().split(/\s+/).includes("document"))
}

export function viewportStyleDisabled(name: string) {
  return /^(?:border(?:-|$)|margin(?:-|$)|(?:min-|max-)?(?:width|height|inline-size|block-size)$|box-shadow$)/.test(name)
}

/** Authored CSS travels with role=document through collaboration and export. */
export const viewportDocumentStyles = `
@media screen {
  body:not(.ww-canvas, .ww-slides, .ww-board):has(> [role~="document"]) {
    box-sizing: border-box; display: flow-root; position: relative;
    width: 100% !important; inline-size: 100% !important; max-width: none !important; max-inline-size: none !important; min-height: 100dvh;
    margin: 0 !important; padding: 0 !important;
  }
  body:not(.ww-canvas, .ww-slides, .ww-board) > [role~="document"] {
    box-sizing: border-box; display: block; position: absolute !important; inset: 0 !important; float: none !important; overflow: auto;
    width: 100% !important; inline-size: 100% !important; min-width: 0 !important; min-inline-size: 0 !important; max-width: none !important; max-inline-size: none !important;
    height: 100dvh !important; block-size: 100dvh !important; min-height: 100dvh !important; min-block-size: 100dvh !important; max-height: none !important; max-block-size: none !important;
    margin: 0 !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
  }
}
`

/** Empty native containers, formatting whitespace and comments beside the
 * document widget do not create another item of document content. */
export function getDocumentTemplate(body?: HTMLElement): Element | null
export function getDocumentTemplate<T extends ReadableElement>(body: T): T | null
export function getDocumentTemplate(body: ReadableElement = document.body): ReadableElement | null {
  const candidate = Array.from(body.children).find(element => isViewportDocument(element) && isSoleDocumentContent(element))
  const isWidget = candidate?.localName.includes("-") || candidate?.hasAttribute("is")
  return candidate && isWidget ? candidate : null
}

/** The authored element that behaves as the editing root. */
export function getDocumentRoot(body?: HTMLElement): Element
export function getDocumentRoot<T extends ReadableElement>(body: T): T
export function getDocumentRoot(body: ReadableElement = document.body): ReadableElement {
  return getDocumentTemplate(body) ?? body
}

/** Whether an element is the current body-equivalent editing root. */
export function isDocumentRoot(element: Element | null | undefined): boolean {
  if(!element?.isConnected) return false
  const body = element.ownerDocument.body
  return Boolean(body) && element === getDocumentRoot(body)
}
