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

/** Built-in choices remain separate from the user's browser-local themes. */
export const defaultDocumentThemes: SavedDocumentTheme[] = [
  {name: "Standard", styles: {}},
  {name: "Ocean", styles: themeColors("#f7fbff", "#243746", "#176b91", ["#397da2", "#2a9d8f", "#e9a23b", "#df775b", "#7c6ba5", "#6a9c68", "#d55d70"])},
  {name: "Forest", styles: themeColors("#f8faf4", "#303c30", "#39734b", ["#4f875e", "#73a592", "#bf9748", "#c4754e", "#8b75a4", "#6d8791", "#b96777"])},
  {name: "Sunset", styles: themeColors("#fff9f5", "#49352f", "#a74c3d", ["#c6614d", "#db9364", "#d6a73f", "#a86b84", "#806fa1", "#638e91", "#83a16a"])},
]

function themeColors(background: string, text: string, link: string, accents: string[]): SavedDocumentTheme["styles"] {
  return Object.fromEntries(Object.entries({"background-color": background, "--ww-text-color": text, "--ww-link-color": link,
    ...Object.fromEntries(themeAccentProperties.map((property, index) => [property, accents[index]])),
  }).map(([property, value]) => [property, {value, priority: ""}]))
}

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
