import {themeAccentProperties} from "./css-color"

/** Document-wide overrides understood by the bundled layout styles. */
export const documentThemeOptions = [
  {name: "--ww-font-family", label: "Font family", property: "font-family", placeholder: "Default"},
  {name: "--ww-font-size", label: "Font size", property: "font-size", placeholder: "Default"},
  {name: "--ww-text-color", label: "Text color", property: "color", placeholder: "Default"},
  {name: "--ww-link-color", label: "Link color", property: "color", placeholder: "Default"},
  {name: "--ww-prose-max", label: "Text width", property: "width", placeholder: "Default"},
  {name: "--ww-page-max", label: "Page width", property: "width", placeholder: "Default"},
  {name: "--ww-page-gutter", label: "Page gutter", property: "width", placeholder: "Default"},
  {name: "--ww-block-spacing", label: "Block spacing", property: "width", placeholder: "Default"},
] as const

export const documentThemeProperties = ["background-color", ...documentThemeOptions.map(option => option.name), ...themeAccentProperties]
export const documentThemeStorageKey = "webwriter-document-themes"
export const documentTypographyProperties: readonly string[] = documentThemeOptions.slice(0, 4).map(option => option.name)

// A separate layer permits revert-layer to restore each bundled theme's own
// declarations when an option is unset. Authored unlayered styles still win.
export const documentTypographyCSS = `@layer webwriter-theme-options {
  :where(body, h1, h2, h3, h4, h5, h6) { font-family: var(--ww-font-family, revert-layer); }
  :where(body) { font-size: var(--ww-font-size, revert-layer); }
  :where(body, p, h1, h2, h3, h4, h5, h6, address, blockquote, dl, ol, ul, table) { color: var(--ww-text-color, revert-layer); }
  :where(a:any-link) { color: var(--ww-link-color, revert-layer); }
}`
export type SavedDocumentTheme = {name: string, styles: Record<string, {value: string, priority: "" | "important"}>}

export function loadDocumentThemes(): SavedDocumentTheme[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(documentThemeStorageKey) ?? "[]")
    if(!Array.isArray(value)) return []
    return value.flatMap(item => {
      if(!item || typeof item.name !== "string" || !item.name.trim() || !item.styles || typeof item.styles !== "object" || Array.isArray(item.styles)) return []
      const styles: SavedDocumentTheme["styles"] = {}
      for(const name of documentThemeProperties) {
        const declaration = item.styles[name]
        if(!declaration || typeof declaration.value !== "string" || !["", "important"].includes(declaration.priority)) continue
        if(themeAccentProperties.includes(name) && !/^#[0-9a-f]{6}$/i.test(declaration.value)) continue
        const property = documentThemeOptions.find(option => option.name === name)?.property ?? name
        if(typeof CSS?.supports === "function" && !CSS.supports(property, declaration.value)) continue
        styles[name] = {value: declaration.value, priority: declaration.priority}
      }
      return [{name: item.name, styles}]
    })
  }
  catch { return [] }
}
