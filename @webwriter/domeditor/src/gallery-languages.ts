import {documentLanguages} from "./document-languages"

const languageCodes = `
  en en-US en-GB en-CA en-AU en-IN ar bg zh zh-Hans zh-Hant hr cs da nl et fi fr de el hu ga it lv lt mt
  pl pt pt-PT pt-BR ro ru sk sl es sv fa hi ja ko no nb nn tr uk sr sr-Cyrl sr-Latn sr-ijekavsk cnr sq mk is bs ca
  ca-ES-valencia eu gl cy lb bn pa gu mr te ur kn or ne si ta ml ps jv id ms tl my th lo vi km kk ky mn uz tg ka hy he
  az tk dv be la tpi am om so ti sw ha yue-Hans yue-Hant kmr kmr-Latn kmr-Arab ckb ckb-Arab af-ZA af-NA
`.trim().split(/\s+/)

const documentNames = new Map<string, string>(documentLanguages.map(({code, name}) => [code, name]))
const englishNames = new Intl.DisplayNames(["en"], {type: "language", fallback: "none", languageDisplay: "standard"})
// Keep names distinct when Intl aliases a tag or omits its variant.
const specificNames: Record<string, string> = {
  "ca-ES-valencia": "Catalan (Valencian)",
  "sr-ijekavsk": "Serbian (Ijekavian)",
  cnr: "Montenegrin",
  tl: "Tagalog",
  kmr: "Northern Kurdish",
  "kmr-Latn": "Northern Kurdish (Latin)",
  "kmr-Arab": "Northern Kurdish (Arabic)",
}

let cachedLocale: string | undefined
let cachedOptions: {code: string, label: string}[]

export function galleryLanguageOptions(locale: string) {
  if(cachedLocale === locale) return cachedOptions
  const names = new Intl.DisplayNames([locale], {type: "language", fallback: "none", languageDisplay: "standard"})
  cachedOptions = languageCodes.map(code => {
    const label = specificNames[code] ?? (locale === "en" ? documentNames.get(code) : names.of(code))
      ?? documentNames.get(code) ?? englishNames.of(code) ?? code
    return {code, label}
  }).sort((a, b) => a.label.localeCompare(b.label, locale))
  cachedLocale = locale
  return cachedOptions
}
