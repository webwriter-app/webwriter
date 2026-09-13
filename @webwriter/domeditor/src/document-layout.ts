import {getDocumentRoot} from "./document-template"

export type DocumentLayoutMode = "document" | "canvas" | "slides"
export type DocumentLayoutState = {
  mode: DocumentLayoutMode, canConvert: boolean, zoom: number
  conversions?: Partial<Record<DocumentLayoutMode, string | null>>
}

export function documentLayoutMode(body: HTMLElement = document.body): DocumentLayoutMode {
  if(getDocumentRoot(body) !== body) return "document"
  // An ambiguous externally authored mode stays readable; never normalize it.
  if(body.classList.contains(canvasClass) && body.classList.contains(slidesClass)) return "document"
  return body.classList.contains(slidesClass) ? "slides" : body.classList.contains(canvasClass) ? "canvas" : "document"
}

/** Authored layout, retained in shared and exported HTML. Navigation is local. */
export const canvasClass = "ww-canvas"
export const canvasStyles = `
body.ww-canvas { position: relative; width: 1280px; min-height: 720px; }
body.ww-canvas > :not(style, script, link, meta, template) { position: absolute; }
`

export const slidesClass = "ww-slides"
export const slideClass = "ww-slide"
export const slidesStyles = `
@media screen {
  html:has(> body.ww-slides) { height: 100%; overflow: hidden; }
  html > body.ww-slides { box-sizing: border-box; position: relative; display: grid; place-items: center; margin: 0; padding: 0; width: 100%; max-width: none; height: 100vh; height: 100dvh; min-height: 0; background: #f2f2f2; }
}
body.ww-slides > .ww-slides-viewport {
  position: relative; display: flex; width: 100%; max-width: none; height: 100%; min-height: 0;
  margin: auto; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; scroll-snap-type: x mandatory; scroll-behavior: smooth;
}
body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) {
  box-sizing: border-box; flex: 0 0 auto; width: min(100vw, 177.7777778dvh); min-width: 0; height: min(100dvh, 56.25vw); overflow: clip;
  margin: auto max(0px, calc((100vw - 177.7777778dvh) / 2)); padding: 1.25rem var(--ww-page-gutter, 1.25rem); position: relative; scroll-snap-align: center; background: #fff;
}
body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) > :not(style, script, link, meta, template, .ww-slide-directions) {
  position: absolute; box-sizing: border-box; margin: 0; max-width: none; max-inline-size: none;
}
body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]):focus { outline: none; }
body.ww-slides > nav.ww-slides-navigation {
  box-sizing: border-box; position: absolute; bottom: 1rem; left: 1rem;
  display: flex; gap: .375rem; width: max-content; max-width: calc(100% - 2rem); overflow-x: auto;
  margin: 0; padding: .375rem; z-index: 1; background: #fff; color: #2f3742; border-radius: 2rem; scroll-target-group: auto;
}
body.ww-slides > nav.ww-slides-navigation > a {
  box-sizing: border-box; flex: 0 0 2rem; display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem;
  margin: 0; padding: 0; cursor: pointer; font: 14px/1 system-ui;
  border: 1px solid currentColor; border-radius: 50%; background: #fff; color: #2f3742; text-decoration: none;
}
body.ww-slides > nav.ww-slides-navigation > a,
body.ww-slides .ww-slide-directions > a { user-select: none; -webkit-user-drag: none; }
body.ww-slides > nav.ww-slides-navigation > a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
body.ww-slides > .ww-slides-viewport > section.ww-slide > nav.ww-slide-directions {
  position: absolute; inset: 0; margin: 0; padding: 0; pointer-events: none;
}
body.ww-slides .ww-slide-directions > a {
  box-sizing: border-box; position: absolute; top: 50%; transform: translateY(-50%);
  display: flex; align-items: center; justify-content: center; width: 2rem; height: 2rem;
  border-radius: 50%; background: #fff; color: #2f3742; border: 1px solid currentColor;
  margin: 0; padding: 0; font-size: 0; text-decoration: none; pointer-events: auto; cursor: pointer;
}
body.ww-slides .ww-slide-directions > a::before {
  content: ""; width: .5rem; height: .8rem; background: currentColor;
  clip-path: polygon(0 0, 25% 0, 100% 50%, 25% 100%, 0 100%, 75% 50%);
}
body.ww-slides .ww-slide-previous::before { rotate: 180deg; }
body.ww-slides .ww-slide-previous { left: .75rem; }
body.ww-slides .ww-slide-next { right: .75rem; }
body.ww-slides > nav.ww-slides-navigation > a:hover,
body.ww-slides .ww-slide-directions > a:not([aria-disabled=true]):hover { background: #f2f2f2; }
body.ww-slides > nav.ww-slides-navigation > a:active,
body.ww-slides .ww-slide-directions > a:not([aria-disabled=true]):active { background: #d8dee6; }
body.ww-slides > nav.ww-slides-navigation > a:target-current { background: #e2e5e9; box-shadow: inset 0 0 0 1px currentColor; }
body.ww-slides .ww-slide-directions > a[aria-disabled=true] { opacity: .35; cursor: not-allowed; }
body.ww-slides .ww-slide-directions > a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  body.ww-slides > .ww-slides-viewport { scroll-behavior: auto; }
}
@media print {
  body.ww-slides > .ww-slides-viewport { position: static; display: block; width: 100%; height: auto; min-height: 0; overflow: visible; }
  body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) { width: 100%; height: auto; margin: 0; aspect-ratio: 16 / 9; overflow: hidden; break-after: page; }
  body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]):last-child { break-after: auto; }
  body.ww-slides > nav.ww-slides-navigation, body.ww-slides .ww-slide-directions { display: none; }
}
`

export function isSlide(node: Node | null): node is HTMLElement {
  const element = node as Element | null
  return element?.nodeType === 1 && element.namespaceURI === "http://www.w3.org/1999/xhtml" && element.matches("section.ww-slide:not([is])")
    && Boolean(element.parentElement?.matches("div.ww-slides-viewport:not([is])"))
    && element.parentElement?.parentElement === element.ownerDocument.body
}

/** Recognize only the active carousel's structure, including across the editor iframe. */
export function slideLayoutRole(element: Element): "root" | "viewport" | "slide" | "navigation" | null {
  if(element.nodeType !== 1 || element.namespaceURI !== "http://www.w3.org/1999/xhtml") return null
  const body = element.ownerDocument.body
  if(!body || documentLayoutMode(body) !== "slides") return null
  if(element === body) return "root"
  if(isSlide(element)) return "slide"
  if(element.parentElement === body && element.matches("div.ww-slides-viewport:not([is])")) return "viewport"
  if(element.matches("nav.ww-slides-navigation:not([is])") && element.parentElement === body
    || element.matches("nav.ww-slide-directions:not([is])") && isSlide(element.parentElement)) return "navigation"
  return null
}
