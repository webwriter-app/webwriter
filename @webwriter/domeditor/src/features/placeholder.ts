import { EditorFeature } from "."
import {atomicEditingContainer, hasEmptyInlineContent} from "../utility"
import {clearPresentationState, setPresentationState, trackPresentationStyles} from "../presentation-state.js"

const headingSelector = "h1, h2, h3, h4, h5, h6"

export class PlaceholderFeature extends EditorFeature {
  
  #placeholderStylesheet: CSSStyleSheet
  #headingObserver: MutationObserver | null = null
  #emptyHeadings = new Set<Element>()
  #untrackStyles: (() => void) | null = null

  enable(): void {
    if(this.isEnabled) return
    this.applyPlaceholderStylesheet()
    this.#placeholderStylesheet.disabled = false
    this.#untrackStyles = trackPresentationStyles(document, this.#placeholderStylesheet)
    this.#refreshHeadings()
    this.#headingObserver = new MutationObserver(this.#refreshHeadings)
    this.#headingObserver.observe(document.body, {subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["is", "contenteditable"]})
    super.enable()
  }

  disable(): void {
    if(!this.isEnabled) return
    this.#headingObserver?.disconnect()
    this.#headingObserver = null
    for(const heading of this.#emptyHeadings) clearPresentationState(heading, "empty-heading")
    this.#emptyHeadings.clear()
    this.#untrackStyles?.()
    this.#untrackStyles = null
    if(this.#placeholderStylesheet) {
      this.#placeholderStylesheet.disabled = true
      document.adoptedStyleSheets = document.adoptedStyleSheets
        .filter(stylesheet => stylesheet !== this.#placeholderStylesheet)
    }
    super.disable()
  }

  #refreshHeadings = (records?: MutationRecord[]) => {
    const headings = new Set<Element>()
    const collect = (node: Node | null) => {
      if(!(node instanceof Element)) return
      const heading = node.closest(headingSelector)
      if(heading) headings.add(heading)
      node.querySelectorAll(headingSelector).forEach(element => headings.add(element))
    }
    if(records) for(const record of records) {
      collect(record.target instanceof Element ? record.target : record.target.parentElement)
      record.addedNodes.forEach(collect)
    }
    else collect(document.body)
    for(const heading of this.#emptyHeadings) {
      if(!document.body.contains(heading)) {
        clearPresentationState(heading, "empty-heading")
        this.#emptyHeadings.delete(heading)
      }
    }
    for(const heading of headings) {
      const empty = document.body.contains(heading) && !heading.hasAttribute("is")
        && !atomicEditingContainer(heading, this.editor.schema) && hasEmptyInlineContent(heading)
      if(empty) {
        this.#emptyHeadings.add(heading)
        setPresentationState(heading, "empty-heading")
      }
      else {
        clearPresentationState(heading, "empty-heading")
        this.#emptyHeadings.delete(heading)
      }
    }
  }

  get placeholderStylesheet() {
    this.#placeholderStylesheet = this.#placeholderStylesheet ?? this.generatePlaceholderStylesheet()
    return this.#placeholderStylesheet
  }

  generatePlaceholderStylesheet() {
    const contentRules = this.editor.schema.placeholderKeys.flatMap(k => {
      const {emptySelector, emptyStyle, placeholderStyle} = this.editor.schema.get(k)
      const sel = emptySelector
      const elStyle = emptyStyle && this.styleMapToCssString(emptyStyle)
      const beforeStyle = placeholderStyle && `${this.styleMapToCssString({
        ...placeholderStyle,
        ...(placeholderStyle.content ? {
          content: `var(--ww-placeholder, ${placeholderStyle.content})`,
          whiteSpace: "nowrap"
        } : {})
      })};visibility: visible`
      return [
        elStyle && `${sel} {${elStyle}}`,
        beforeStyle && `${sel}::before {${beforeStyle}}`
      ].filter((rule): rule is string => Boolean(rule))
    })
    // Widget styles may set --ww-placeholder on a shadow slot. The inherited
    // value reaches its assigned light-DOM block, where generated content can
    // display it without adding anything to the authored document. Keep the
    // schema's heading placeholders in charge of headings.
    const placeholderBlocks = `:is(address, article, aside, blockquote, dd, details, dialog, div, dt, fieldset, figure, footer, form, header, legend, li, main, nav, p, pre, search, section, summary, td, th):empty::before {content: var(--ww-placeholder, "\u200B"); display: inline-block; width: 0; overflow: visible; white-space: nowrap; color: darkgray; pointer-events: none; user-select: none;}`
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync([placeholderBlocks, ...contentRules].join("\n"))
    return styleSheet
  }

  applyPlaceholderStylesheet() {
    const stylesheet = this.placeholderStylesheet
    if(!document.adoptedStyleSheets.includes(stylesheet)) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, stylesheet]
    }
  }

  private styleMapToCssString(styleMap: Record<string, string>) {
    const kebabify = (str: string) => str.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? "-" : "") + $.toLowerCase())
    return Object.entries(styleMap)
      .map(([p,v])=>`${kebabify(p)}: ${v}`)
      .join(";")
  }
}
