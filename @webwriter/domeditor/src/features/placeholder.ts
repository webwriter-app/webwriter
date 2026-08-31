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
    const contentRules = this.editor.schema.placeholderKeys.map(k => {
      const {emptySelector, emptyStyle, placeholderStyle} = this.editor.schema.get(k)
      const sel = emptySelector
      const elStyle = emptyStyle && this.styleMapToCssString(emptyStyle)
      const beforeStyle = placeholderStyle && `${this.styleMapToCssString(placeholderStyle)};visibility: visible`
      return `${sel} {& {${elStyle ?? ""}} &::before {${beforeStyle ?? ""}}}`
    })
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync(contentRules.join("\n"))
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
