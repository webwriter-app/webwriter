import { EditorFeature } from "."

export class PlaceholderFeature extends EditorFeature {
  
  #placeholderStylesheet: CSSStyleSheet

  enable(): void {
    if(this.isEnabled) return
    this.applyPlaceholderStylesheet()
    this.#placeholderStylesheet.disabled = false
    super.enable()
  }

  disable(): void {
    if(!this.isEnabled) return
    if(this.#placeholderStylesheet) {
      this.#placeholderStylesheet.disabled = true
      document.adoptedStyleSheets = document.adoptedStyleSheets
        .filter(stylesheet => stylesheet !== this.#placeholderStylesheet)
    }
    super.disable()
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
