import type {ReactiveController, ReactiveControllerHost} from "lit"
import {siteTranslations} from "./site-translations"

export const siteLanguages = {en: "English", de: "Deutsch", fr: "Français", nl: "Nederlands", es: "Español", pt: "Português", it: "Italiano"} as const
export type SiteLanguage = keyof typeof siteLanguages
export const siteLanguageKey = "webwriter-site-language"
const changeEvent = "site-language-change"

export function supportedLanguage(value: string | null | undefined): SiteLanguage | undefined {
  const base = value?.toLowerCase().split(/[-_]/)[0]
  return base && Object.hasOwn(siteLanguages, base) ? base as SiteLanguage : undefined
}

/** An explicit choice wins; otherwise use the first supported browser preference. */
export function preferredLanguage(preferences: readonly string[], saved?: string | null, query?: string | null): SiteLanguage {
  return supportedLanguage(query) ?? supportedLanguage(saved)
    ?? preferences.map(supportedLanguage).find(Boolean) ?? "en"
}

let current: SiteLanguage | undefined
export function language(): SiteLanguage {
  if(current) return current
  let saved: string | null = null
  try { saved = localStorage.getItem(siteLanguageKey) } catch { /* Storage is optional. */ }
  return current = preferredLanguage(navigator.languages ?? [navigator.language], saved, new URL(location.href).searchParams.get("lang"))
}

export function setLanguage(value: string, persist = true) {
  const next = supportedLanguage(value)
  if(!next) return
  const previous = language()
  if(persist) {
    try { localStorage.setItem(siteLanguageKey, next) } catch { /* The current page still switches. */ }
  }
  if(next === previous) return
  current = next
  const url = new URL(location.href)
  if(url.searchParams.has("lang")) {
    url.searchParams.set("lang", next)
    history.replaceState(null, "", url)
  }
  window.dispatchEvent(new Event(changeEvent))
}

export function t(source: string, values: Record<string, string | number> = {}): string {
  const translated = language() === "en" ? source : siteTranslations[language()]?.[source] ?? source
  return translated.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match)
}

/** Keep localized Lit views in sync without retaining detached components. */
export class SiteLanguageController implements ReactiveController {
  private change = () => { this.onChange?.(); this.host.requestUpdate() }
  constructor(private host: ReactiveControllerHost, private onChange?: () => void) { host.addController(this) }
  hostConnected() { window.addEventListener(changeEvent, this.change) }
  hostDisconnected() { window.removeEventListener(changeEvent, this.change) }
}

const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()

/** Translate server-rendered site copy, leaving component and authored DOM alone. */
export function translateSiteTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while(walker.nextNode()) {
    const node = walker.currentNode as Text
    if(node.parentElement?.closest("script, style, code, pre, [translate=no]")) continue
    const source = originalText.get(node) ?? node.data
    originalText.set(node, source)
    node.data = source.replace(/\S[\s\S]*\S|\S/, text => t(text))
  }
  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...(root as Document).querySelectorAll("*")]
  for(const element of elements) {
    if(element.closest("[translate=no]")) continue
    const attributes = originalAttributes.get(element) ?? new Map<string, string>()
    for(const name of ["aria-label", "title", "placeholder", ...(element.matches('meta[name="description"]') ? ["content"] : [])]) {
      const source = attributes.get(name) ?? element.getAttribute(name)
      if(source === null) continue
      attributes.set(name, source)
      element.setAttribute(name, t(source))
    }
    originalAttributes.set(element, attributes)
  }
}
