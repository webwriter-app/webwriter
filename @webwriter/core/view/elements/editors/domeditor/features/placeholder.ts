import { EditorFeature } from "."

export class PlaceholderFeature extends EditorFeature {
  
  #placeholderStylesheet: CSSStyleSheet

  enable(): void {
    this.applyPlaceholderStylesheet()
    super.enable()
  }

  disable(): void {
    this.placeholderStylesheet.disabled = true
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
      const beforeStyle = placeholderStyle && this.styleMapToCssString(placeholderStyle)
      return `${sel} {& {${elStyle ?? ""}} &::before {${beforeStyle ?? ""}}}`
    })
    const styleSheet = new CSSStyleSheet()
    styleSheet.replaceSync(contentRules.join("\n"))
    return styleSheet
  }

  applyPlaceholderStylesheet() {
    if(this.#placeholderStylesheet) {
      this.disable()
    }
    else {
      document.adoptedStyleSheets.push(this.placeholderStylesheet)
    }
  }

  private styleMapToCssString(styleMap: Record<string, string>) {
    const kebabify = (str: string) => str.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? "-" : "") + $.toLowerCase())
    return Object.entries(styleMap)
      .map(([p,v])=>`${kebabify(p)}: ${v}`)
      .join(";")
  }
}