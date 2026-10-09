/** Authored caption numbering configuration, stored with its portable stylesheet. */
export const captionNumberStyles = ["decimal", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"] as const
export type CaptionNumberStyle = typeof captionNumberStyles[number]
export type CaptionSeries = {
  enabled: boolean
  style: CaptionNumberStyle
  start: number
  separator: string
  labels: Record<string, string>
}
export type CaptionEnumeration = {figure: CaptionSeries, table: CaptionSeries}
export const captionEnumerationSelector = "style[data-ww-caption-enumeration]"

export const defaultCaptionEnumeration = (): CaptionEnumeration => ({
  figure: {enabled: true, style: "decimal", start: 1, separator: ": ", labels: {default: "Fig.", en: "Fig.", de: "Abb.", fr: "Fig.", es: "Fig."}},
  table: {enabled: true, style: "decimal", start: 1, separator: ": ", labels: {default: "Table", en: "Table", de: "Tab.", fr: "Tableau", es: "Tabla"}},
})

export function isCaptionEnumeration(value: unknown): value is CaptionEnumeration {
  if(!value || typeof value !== "object") return false
  return ["figure", "table"].every(kind => {
    const series = (value as Record<string, unknown>)[kind] as Partial<CaptionSeries> | undefined
    return !!series && typeof series === "object" && typeof series.enabled === "boolean"
      && captionNumberStyles.includes(series.style as CaptionNumberStyle)
      && Number.isSafeInteger(series.start) && series.start! >= 1 && series.start! <= 1000000
      && typeof series.separator === "string" && series.separator.length <= 200
      && !!series.labels && typeof series.labels === "object" && !Array.isArray(series.labels)
      && Object.hasOwn(series.labels, "default") && typeof series.labels.default === "string" && Object.keys(series.labels).length <= 100
      && Object.entries(series.labels).every(([language, label]) => {
        if(typeof label !== "string" || label.length > 200) return false
        if(language === "default") return true
        try { return Intl.getCanonicalLocales(language).length === 1 } catch { return false }
      })
  })
}

// Escape raw-text HTML delimiters as well as CSS quotes, controls and backslashes.
const cssString = (value: string) => '"' + value.replace(/["\\<>\x00-\x1f\x7f]/g,
  character => `\\${character.codePointAt(0)!.toString(16)} `) + '"'

export function captionEnumerationCSS(config: CaptionEnumeration): string {
  const rules = [`body { counter-reset: ww-figures ${config.figure.start - 1} ww-tables ${config.table.start - 1}; }`]
  for(const kind of ["figure", "table"] as const) {
    const series = config[kind]
    if(!series.enabled) continue
    const caption = kind === "figure" ? "figcaption" : "caption"
    const counter = kind === "figure" ? "ww-figures" : "ww-tables"
    // Keep the owner in the counter tree so removing it invalidates subsequent
    // captions, including counters in descendant containers.
    rules.push(`${kind}:has(> ${caption}) { counter-increment: ${counter} 0; }`)
    // Increment at the caption, keeping nested captions in document order.
    rules.push(`${kind} > ${caption} { counter-increment: ${counter}; }`)
    const prefix = `${kind} > ${caption}::before`
    const content = (label: string) => `${cssString(label)} " " counter(${counter}, ${series.style}) ${cssString(series.separator)}`
    rules.push(`${prefix} { content: ${content(series.labels.default)}; user-select: none;${kind === "figure" ? " font-weight: bold;" : ""} }`)
    // Broad language ranges first, so a regional override wins over its base.
    for(const [language, label] of Object.entries(series.labels).filter(([key]) => key !== "default")
      .sort(([a], [b]) => a.split("-").length - b.split("-").length)) {
      rules.push(`${kind} > ${caption}:lang(${language})::before { content: ${content(label)}; }`)
    }
  }
  return rules.join("\n")
}

export function captionEnumerationSource(config: CaptionEnumeration): string {
  return `/* ww-caption-enumeration:${encodeURIComponent(JSON.stringify(config))} */\n${captionEnumerationCSS(config)}`
}

export function readCaptionEnumeration(head: HTMLHeadElement): CaptionEnumeration | undefined {
  const source = head.querySelector(captionEnumerationSelector)?.textContent ?? ""
  const encoded = source.match(/^\/\* ww-caption-enumeration:([^\s]*) \*\//)?.[1]
  try {
    const config: unknown = JSON.parse(decodeURIComponent(encoded ?? ""))
    return isCaptionEnumeration(config) ? config : undefined
  }
  catch { return undefined }
}

export function writeCaptionEnumeration(head: HTMLHeadElement, config: CaptionEnumeration) {
  let style = head.querySelector<HTMLStyleElement>(captionEnumerationSelector)
  if(!style) {
    style = head.ownerDocument.createElement("style")
    style.setAttribute("data-ww-caption-enumeration", "")
    head.append(style)
  }
  style.textContent = captionEnumerationSource(config)
}
