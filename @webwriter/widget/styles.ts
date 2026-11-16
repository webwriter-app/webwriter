/** What `adoptStyles()` returns: the function that removes the sheet again, with the sheet itself on it. */
export type AdoptedStyles = (() => void) & {
  /** The adopted sheet, for a module that changes its rules later (`sheet.replaceSync()`, `insertRule()`). */
  readonly sheet: CSSStyleSheet
}

/**
 * Adds module CSS to a shadow root as a constructed style sheet, in front of
 * the widget's own sheets so that the widget can override it. Returns the
 * function that removes it again; its `sheet` property is the adopted sheet.
 * Nothing is written into the template.
 */
export function adoptStyles(root: ShadowRoot, css: string): AdoptedStyles {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  root.adoptedStyleSheets = [sheet, ...root.adoptedStyleSheets]
  const remove = () => {
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter(other => other !== sheet)
  }
  return Object.assign(remove, {sheet})
}
