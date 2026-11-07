import {documentLanguages} from "./document-languages"

type LanguageOption = {value: string, label: string, description: string, dividerBefore?: boolean}

const englishNames = new Intl.DisplayNames(["en"], {type: "language", fallback: "none"})
const comparable = (value: string) => value.toLocaleLowerCase("en").replaceAll(/[^\p{L}\p{N}]+/gu, "")

function baseLanguage(code: string) {
  try {
    return new Intl.Locale(code).language
  }
  catch {
    return ""
  }
}

function nativeLanguageName(code: string) {
  const names = new Intl.DisplayNames([code], {type: "language", fallback: "none"})
  // Skip fallback locales and language aliases such as cnr → sr-ME and tl → fil.
  return names.resolvedOptions().locale.split("-")[0] === code.split("-")[0] ? names.of(code) : undefined
}

const alphabetical: readonly LanguageOption[] = [...documentLanguages]
  .sort((a, b) => a.name.localeCompare(b.name, "en", {sensitivity: "base"}))
  .map(({code: value, name}) => {
    const native = nativeLanguageName(value)
    const label = native && comparable(native) !== comparable(name) && !value.startsWith("en-")
      ? `${name} (${native})` : name
    return {value, label, description: value}
  })

const languageFamilies = new Map(alphabetical.map(option => [option.value, baseLanguage(option.value)]))

/** Alphabetize both sections, with the browser's languages above the divider. */
export function orderedLanguageOptions(preferred = globalThis.navigator?.languages ?? []): readonly LanguageOption[] {
  const families = new Set(preferred.map(baseLanguage))
  const promoted: LanguageOption[] = []
  const remaining: LanguageOption[] = []
  for(const option of alphabetical) {
    const list = families.has(languageFamilies.get(option.value)!) ? promoted : remaining
    list.push(option)
  }
  if(!promoted.length || !remaining.length) return alphabetical
  return [...promoted, {...remaining[0], dividerBefore: true}, ...remaining.slice(1)]
}

export function documentLanguageName(value: string) {
  const option = alphabetical.find(option => option.value.toLowerCase() === value.toLowerCase())
  if(option) return option.label
  try {
    return englishNames.of(value) ?? value
  }
  catch {
    return value
  }
}
