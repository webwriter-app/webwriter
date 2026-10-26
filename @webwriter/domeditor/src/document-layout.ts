import {getDocumentRoot} from "./document-template"
import {boardPrintContentStyles} from "./document-layout-print.js"

export type DocumentLayoutMode = "document" | "canvas" | "slides" | "board"
export type DocumentLayoutState = {
  mode: DocumentLayoutMode, canConvert: boolean, zoom: number
  conversions?: Partial<Record<DocumentLayoutMode, string | null>>
}

/** Conversion availability shared by the layout picker surfaces. */
export function documentLayoutConversionReason(state: DocumentLayoutState, mode: DocumentLayoutMode) {
  if(mode === state.mode) return null
  if(typeof state.conversions?.[mode] === "string") return state.conversions[mode]
  if(state.conversions?.[mode] === null) return null
  return state.canConvert ? null : "This document’s structure cannot be converted automatically."
}

/** Reset only empty native text placeholders; textless widgets, media,
 * comments and authored attributes still count as document content. */
export function resetEmptyLayoutContent(body: HTMLElement = document.body) {
  const empty = Array.from(body.childNodes).every(node => node instanceof Text ? !node.data.trim()
    : node instanceof HTMLElement && node.matches("p, h1, h2, h3, h4, h5, h6")
      && Array.from(node.attributes).every(attribute => attribute.name === "style" && !node.style.length
        || attribute.name === "class" && Array.from(node.classList).every(name => name.startsWith("◆")))
      && Array.from(node.childNodes).every(child => child instanceof Text ? !child.data.trim()
        : child instanceof HTMLBRElement && Array.from(child.attributes).every(attribute => attribute.name === "class"
          && Array.from(child.classList).every(name => name.startsWith("◆")))))
  if(!empty) return null
  const paragraph = body.ownerDocument.createElement("p")
  body.replaceChildren(paragraph)
  return paragraph
}

export function documentLayoutMode(body: HTMLElement = document.body): DocumentLayoutMode {
  if(getDocumentRoot(body) !== body) return "document"
  // An ambiguous externally authored mode stays readable; never normalize it.
  if([canvasClass, slidesClass, boardClass].filter(name => body.classList.contains(name)).length > 1) return "document"
  return body.classList.contains(boardClass) ? "board" : body.classList.contains(slidesClass) ? "slides" : body.classList.contains(canvasClass) ? "canvas" : "document"
}

/** Board structure and styles are authored content, usable without an editor. */
export const boardClass = "ww-board"
export const boardStyles = `
html:has(> body.ww-board) { height: 100%; overflow: auto; background: #eaf0f6; }
body.ww-board {
  box-sizing: border-box; display: flex; flex-direction: row; flex-wrap: nowrap; align-items: stretch; gap: 1rem;
  width: max-content; min-width: 100%; max-width: none; min-height: 100%; margin: 0; padding: 1.25rem 9rem 1.25rem 1.25rem;
}
body.ww-board > section.ww-board-column:not([is]) {
  box-sizing: border-box; flex: 0 0 min(450px, calc(100vw - 2.5rem)); width: min(450px, calc(100vw - 2.5rem)); min-width: 0;
  display: flex; flex-direction: column; align-self: flex-start; gap: .75rem; min-height: 10rem;
  margin: 0; padding: 1rem 1rem 3.5rem; border: 1px solid #d4deea; border-radius: .75rem; background: #f4f7fa;
}
body.ww-board > section.ww-board-column:not([is]) > h2:not([is]) {
  margin: 0; padding: 0 3.5rem 0 0; min-height: 1.5rem; font-size: 1rem; line-height: 1.5; overflow-wrap: anywhere;
}
body.ww-board > section.ww-board-column:not([is]) > article.ww-board-card:not([is]) {
  box-sizing: border-box; flex: 0 0 auto; min-width: 0; width: 100%; margin: 0; padding: .75rem;
  border: 1px solid #dbe3ec; border-radius: .5rem; background: white; box-shadow: 0 2px 4px #26374a0a; overflow-wrap: anywhere; overflow: auto;

  /* A definite card height constrains native media without rewriting its
   * authored dimensions. Text, captions and atomic widgets keep their space. */
  &:not([hidden]):has(> :is(picture, img, video, iframe, embed, object, svg):not([is]), > figure:not([is]) > :is(picture, img, video, iframe, embed, object, svg):not([is])) {
    display: flex; flex-direction: column;
    > * { flex-shrink: 0; }
    > :is(picture, img, video, iframe, embed, object, svg):not([is]),
    > figure:not([is]):has(> :is(picture, img, video, iframe, embed, object, svg):not([is])) {
      flex-shrink: 1; min-width: 0; min-height: 0; max-width: 100%; object-fit: contain;
    }
    > picture:not([is], [hidden]), > figure:not([is], [hidden]):has(> :is(picture, img, video, iframe, embed, object, svg):not([is])) {
      display: flex; flex-direction: column;
      > * { flex-shrink: 0; }
      > :is(picture, img, video, iframe, embed, object, svg):not([is]) {
        flex-shrink: 1; min-width: 0; min-height: 0; max-width: 100%; object-fit: contain;
      }
      > picture:not([is], [hidden]) {
        display: flex; flex-direction: column;
        > img:not([is]) { flex-shrink: 1; min-width: 0; min-height: 0; max-width: 100%; object-fit: contain; }
      }
    }
  }
}
body.ww-board > section.ww-board-column:not([is]) > article.ww-board-card:not([is]) > :first-child { margin-top: 0; }
body.ww-board > section.ww-board-column:not([is]) > article.ww-board-card:not([is]) > :last-child { margin-bottom: 0; }
@media print {
  @page ww-board { size: portrait; margin: 10mm; }
  html:has(> body.ww-board) { height: auto; overflow: visible; background: none; }
  body.ww-board { page: ww-board; caret-color: transparent; }
  ${boardPrintContentStyles}
}
`

export function isBoardColumn(node: Node | null): node is HTMLElement {
  const element = node as Element | null
  return element?.nodeType === 1 && element.namespaceURI === "http://www.w3.org/1999/xhtml"
    && element.matches("section.ww-board-column:not([is])") && element.parentElement?.matches("body.ww-board") === true
    && documentLayoutMode(element.parentElement as HTMLElement) === "board"
}

export function isBoardCard(node: Node | null): node is HTMLElement {
  const element = node as Element | null
  return element?.nodeType === 1 && element.namespaceURI === "http://www.w3.org/1999/xhtml"
    && element.matches("article.ww-board-card:not([is])") && isBoardColumn(element.parentElement)
}

export function boardLayoutRole(node: Node | null): "column" | "card" | null {
  return isBoardColumn(node) ? "column" : isBoardCard(node) ? "card" : null
}

/** Authored layout, retained in shared and exported HTML. Navigation is local. */
export const canvasClass = "ww-canvas"
export const canvasStyles = `
html:has(> body.ww-canvas) {
  min-height: 100%; overflow: auto;
  background-image: radial-gradient(#ccd7e3 1px, transparent 1px); background-size: 20px 20px; background-repeat: repeat;
}
body.ww-canvas {
  position: relative; box-sizing: border-box; width: auto; inline-size: auto;
  max-width: none; max-inline-size: none; min-height: 100vh; margin: 0; padding: 0; background: transparent;
}
body.ww-canvas > :not(style, script, link, meta, template) { position: absolute; }
body.ww-canvas > p:not([is]) { inline-size: max-content; min-inline-size: 25px; max-inline-size: none; }
body.ww-canvas details:not([is]) { background-color: white; }
@media print {
  @page ww-canvas { margin: 10mm; }
  html:has(> body.ww-canvas) { min-height: 0; overflow: clip; background: none; }
  body.ww-canvas { page: ww-canvas; width: 100vw; height: 100vh; min-height: 0; overflow: clip; caret-color: transparent; }
}
`

export const slidesClass = "ww-slides"
export const slideClass = "ww-slide"
export const slideWidth = 1280
export const slideHeight = 720
export const slidesStyles = `
@media screen {
  html:has(> body.ww-slides) { height: 100%; overflow: hidden; }
  html > body.ww-slides { box-sizing: border-box; position: relative; display: grid; grid-template-rows: minmax(0, 1fr); place-items: center; margin: 0; padding: 0; width: 100%; max-width: none; height: 100vh; height: 100dvh; min-height: 0; background: #f2f2f2; }
}
body.ww-slides > .ww-slides-viewport {
  position: relative; display: flex; width: 100%; max-width: none; height: 100%; min-height: 0;
  margin: auto; overflow-x: auto; overflow-y: auto; scrollbar-width: none; scroll-snap-type: x mandatory; scroll-behavior: smooth;
}
body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) {
  box-sizing: border-box; display: block; flex: 0 0 auto; width: ${slideWidth}px; min-width: ${slideWidth}px; height: ${slideHeight}px; min-height: ${slideHeight}px; aspect-ratio: 16 / 9; overflow: clip;
  margin: auto max(0px, calc((100vw - ${slideWidth}px) / 2)); padding: 1.25rem var(--ww-page-gutter, 1.25rem); position: relative; scroll-snap-align: center; background: #fff;
}
@media screen {
  body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) {
    --ww-slide-scale: min(1, calc(100vw / ${slideWidth}px), calc(100dvh / ${slideHeight}px));
    zoom: var(--ww-slide-scale);
    margin-inline: max(0px, calc((100vw / var(--ww-slide-scale) - ${slideWidth}px) / 2));
  }
}
body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) > :not(style, script, link, meta, template, .ww-slide-directions) {
  position: absolute; box-sizing: border-box; margin: 0; max-width: none; max-inline-size: none;
}
body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) > p:not([is]) { inline-size: max-content; min-inline-size: 25px; }
body.ww-slides details:not([is]) { background-color: white; }
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
  @page ww-slides { size: landscape; margin: 10mm; }
  html:has(> body.ww-slides) { height: auto; overflow: visible; background: none; }
  body.ww-slides { page: ww-slides; display: block; width: auto; max-width: none; height: auto; min-height: 0; margin: 0; padding: 0; background: none; caret-color: transparent; }
  body.ww-slides > .ww-slides-viewport { position: static; display: block; width: 100%; height: auto; min-height: 0; overflow: visible; }
  body.ww-slides > .ww-slides-viewport > section.ww-slide:not([is]) {
    width: ${slideWidth}px; height: ${slideHeight}px; margin: 0; aspect-ratio: 16 / 9; overflow: hidden;
    zoom: min(calc(100vw / ${slideWidth}px), calc(100vh / ${slideHeight}px)); break-inside: avoid; break-after: page;
  }
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
