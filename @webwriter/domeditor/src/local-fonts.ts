import type {Font} from "fontkitten"

export type DeviceFont = {
  family: string
  fullName: string
  postscriptName: string
  style: string
  blob(): Promise<Blob>
}

export type FontAccessWindow = Window & typeof globalThis & {
  queryLocalFonts?: () => Promise<DeviceFont[]>
}

export type EmbeddedFont = {family: string, value: string, stylesheet: string}

/** Use font metadata, rather than the file name, for matching generic fallbacks. */
function fallback(font: Font) {
  const panose = font["OS/2"]?.panose ?? []
  const familyClass = (font["OS/2"]?.sFamilyClass ?? 0) >>> 8
  const post = (font as Font & {post?: {isFixedPitch?: number}}).post
  if(post?.isFixedPitch || panose[0] === 2 && panose[3] === 9) return "monospace"
  if(panose[0] === 3 || familyClass === 10) return "cursive"
  if(panose[0] === 4 || panose[0] === 5 || familyClass === 9 || familyClass === 12) return "fantasy"
  if(panose[0] === 2 && panose[1] >= 2 && panose[1] <= 10 || familyClass >= 1 && familyClass <= 7) return "serif"
  return "sans-serif"
}

export function cssFontString(value: string) {
  return JSON.stringify(value).replaceAll("<", "\\3c ")
}

export function base64DataURL(bytes: Uint8Array, type: string) {
  let binary = ""
  for(let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:${type};base64,${btoa(binary)}`
}

export function fontCSSDataURL(css: string) {
  return base64DataURL(new TextEncoder().encode(css), "text/css")
}

/** Only the selected family is read. No local file URLs enter the document. */
export async function embedFontFiles(files: readonly Blob[], familyHint?: string): Promise<EmbeddedFont> {
  if(!files.length) throw new Error("No font files selected")
  const {create} = await import("fontkitten")
  let family = familyHint ?? "", generic = "sans-serif"
  const faces: string[] = []
  for(const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let font: ReturnType<typeof create>
    try { font = create(bytes as Parameters<typeof create>[0]) }
    catch { throw new Error("This file is not a supported font. Choose a WOFF, WOFF2, TTF or OTF file.") }
    if(font.isCollection) throw new Error("Choose an individual font file instead of a font collection.")
    if(!family) { family = font.familyName; generic = fallback(font) }
    else if(!faces.length) generic = fallback(font)
    if(!family?.trim()) throw new Error("The font has no family name")
    const weight = font.variationAxes.wght
    const width = font.variationAxes.wdth
    const widths = [100, 50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200]
    const style = font["OS/2"]?.fsSelection?.italic || font.italicAngle ? "italic" : "normal"
    const mime = font.type === "WOFF2" ? "font/woff2" : font.type === "WOFF" ? "font/woff" : "font/otf"
    faces.push(`@font-face {font-family: ${cssFontString(family)}; font-style: ${style}; font-weight: ${weight ? `${weight.min} ${weight.max}` : font["OS/2"]?.usWeightClass || 400}; font-stretch: ${width ? `${width.min}% ${width.max}%` : `${widths[font["OS/2"]?.usWidthClass] ?? 100}%`}; font-display: swap; src: url("${base64DataURL(bytes, mime)}");}`)
  }
  return {family, value: `${cssFontString(family)}, ${generic}`, stylesheet: fontCSSDataURL(faces.join("\n"))}
}

/** Embedded resources contain only font-face rules with embedded font bytes. */
export function embeddedFontRules(href: string) {
  if(!href.startsWith("data:text/css;base64,")) return null
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(new TextDecoder().decode(Uint8Array.from(atob(href.slice(href.indexOf(",") + 1)), char => char.charCodeAt(0))))
    const rules = Array.from(sheet.cssRules)
    if(!rules.length || rules.some(rule => rule.type !== 5)) return null
    const faces = rules as CSSFontFaceRule[]
    const family = faces[0].style.fontFamily
    if(!family || faces.some(rule => rule.style.fontFamily !== family
      || !/^url\(["']?data:font\/(?:woff2?|otf|ttf);base64,[a-z\d+/=]+["']?\)$/i.test(rule.style.getPropertyValue("src")))) return null
    return faces
  }
  catch { return null }
}

export function mergeEmbeddedFonts(previous: string | undefined, next: string) {
  if(previous === next) return next
  const current = previous && embeddedFontRules(previous), added = embeddedFontRules(next)
  if(!current || !added || current[0].style.fontFamily !== added[0].style.fontFamily) return next
  const faces = new Map<string, CSSFontFaceRule>()
  for(const rule of [...current, ...added]) {
    const style = rule.style
    faces.set([style.fontWeight, style.fontStyle, style.fontStretch].join("/"), rule)
  }
  return fontCSSDataURL([...faces.values()].map(rule => rule.cssText).join("\n"))
}
