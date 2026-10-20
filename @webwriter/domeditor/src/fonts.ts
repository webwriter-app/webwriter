import {fontFamilyOptions} from "./marks"

export type BunnyFont = {
  familyName: string
  category: string
  weights: number[]
  styles: string[]
}

let catalog: Promise<BunnyFont[]> | undefined

/** Fetch once on demand; a failed request can be retried by reopening the picker. */
export function bunnyFonts() {
  return catalog ??= fetch("https://fonts.bunny.net/list", {credentials: "omit"})
    .then(async response => {
      if(!response.ok) throw new Error("Could not load fonts")
      const entries = Object.values(await response.json()) as BunnyFont[]
      if(!entries.every(font => typeof font.familyName === "string" && typeof font.category === "string"
        && Array.isArray(font.weights) && font.weights.every(weight => Number.isInteger(weight))
        && Array.isArray(font.styles) && font.styles.every(style => typeof style === "string"))) throw new Error("Invalid font catalog")
      return entries.sort((a, b) => a.familyName.localeCompare(b.familyName, "en"))
    }).catch(error => { catalog = undefined; throw error })
}

export function bunnyFontValue(font: BunnyFont) {
  const fallback = ({serif: "serif", "sans-serif": "sans-serif", monospace: "monospace", handwriting: "cursive", display: "fantasy"} as Record<string, string>)[font.category] ?? "sans-serif"
  return `${JSON.stringify(font.familyName)}, ${fallback}`
}

export function bunnyFontStylesheet(font: BunnyFont) {
  const variants = font.weights.flatMap(weight => font.styles.map(style => `${weight}${style === "italic" ? "i" : ""}`))
  const url = new URL("https://fonts.bunny.net/css")
  url.searchParams.set("family", `${font.familyName}:${variants.join(",")}`)
  url.searchParams.set("display", "swap")
  return url.href
}

export function fontFamilies(value: string) {
  return (value.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,]+/g) ?? [])
    .map(family => family.trim().replace(/^(['"])(.*)\1$/, "$2").toLocaleLowerCase("en"))
}

export function fontWithFallback(value: string) {
  if(!value.trim() || /^(inherit|initial|unset|revert|revert-layer)$/i.test(value.trim())) return value
  const families = fontFamilies(value)
  const generics = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "fangsong"]
  if(families.some(family => generics.includes(family))) return value
  const standard = fontFamilyOptions.find(option => fontFamilies(option.value)[0] === families[0])
  return `${value}, ${standard ? fontFamilies(standard.value).at(-1) : "sans-serif"}`
}

/** Only individual Bunny CSS resources are managed; unrelated links stay authored. */
export function bunnyStylesheetFamily(href: string) {
  try {
    const url = new URL(href)
    const family = url.searchParams.get("family")?.split(":")[0]
    return url.origin === "https://fonts.bunny.net" && url.pathname === "/css"
      && family && !family.includes("|") ? family.toLocaleLowerCase("en") : null
  }
  catch { return null }
}

/** Resource metadata is cached for undo; all usage is read from the live DOM. */
export function syncBunnyFonts(document: Document, resources: Map<string, string>, pending = "") {
  const links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')]
    .flatMap(link => {
      const family = bunnyStylesheetFamily(link.href)
      if(!family) return []
      resources.set(family, link.href)
      return [{link, family}]
    })
  if(!resources.size) return
  const used = new Set(fontFamilies(pending))
  // Bunny also accepts catalog slugs such as open-sans in authored links.
  const isUsed = (family: string) => used.has(family) || used.has(family.replaceAll("-", " "))
  const readStyle = (style: CSSStyleDeclaration) => {
    fontFamilies(style.fontFamily).forEach(family => used.add(family))
    // A custom property can supply a family to var() in authored styles.
    for(const name of Array.from(style)) if(name.startsWith("--")) fontFamilies(style.getPropertyValue(name)).forEach(family => used.add(family))
  }
  const readRules = (rules: CSSRuleList) => {
    for(const rule of Array.from(rules)) {
      // Font-face declarations describe a resource rather than use it.
      if(rule.type === 5) continue
      if("style" in rule) readStyle((rule as CSSStyleRule).style)
      if("cssRules" in rule) readRules((rule as CSSGroupingRule).cssRules)
    }
  }
  for(const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
    try { readRules(sheet.cssRules) }
    catch { /* Cross-origin rules are reflected in computed styles below. */ }
  }
  const readDOM = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement | SVGElement>("[style], [font-family], font[face], style, template").forEach(element => {
      if(element.style) readStyle(element.style)
      fontFamilies(element.getAttribute("font-family") ?? element.getAttribute("face") ?? "").forEach(family => used.add(family))
      if(element instanceof HTMLStyleElement && element.sheet) readRules(element.sheet.cssRules)
      if(element instanceof HTMLTemplateElement) readDOM(element.content)
    })
  }
  readDOM(document.documentElement)
  if([...resources.keys()].some(family => !isUsed(family))) {
    const view = document.defaultView
    if(view) for(const element of [document.body, ...document.body.querySelectorAll("*")]) {
      fontFamilies(view.getComputedStyle(element).fontFamily).forEach(family => used.add(family))
      if([...resources.keys()].every(isUsed)) break
    }
  }
  for(const {link, family} of links) if(!isUsed(family)) link.remove()
  for(const [family, href] of resources) {
    if(!isUsed(family) || links.some(entry => entry.family.replaceAll("-", " ") === family.replaceAll("-", " ") && entry.link.isConnected)) continue
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    document.head.append(link)
    links.push({link, family})
  }
}
