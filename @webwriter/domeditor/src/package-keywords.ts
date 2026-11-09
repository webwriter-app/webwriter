export type PackageKeywordPresentation = {
  kind: "type" | "language" | "field" | "online" | "level" | "custom"
  label: string
  icon?: string
  additionalLanguages?: string[]
}

const onlineLabels = {
  "widget-online": "Online only",
  "widget-online-edit": "Online when editing",
  "widget-online-use": "Online when using",
}

type Badge = {label: string, icon: string}

const widgetTypes: Record<string, Badge> = {
  "widget-presentational": {label: "Presentation", icon: "KeywordPresentation"},
  "widget-practical": {label: "Practice", icon: "KeywordPractice"},
  "widget-simulational": {label: "Simulation", icon: "KeywordSimulation"},
  "widget-conceptual": {label: "Concept", icon: "KeywordConcept"},
  "widget-informational": {label: "Information", icon: "KeywordInformation"},
  "widget-contextual": {label: "Context", icon: "KeywordContext"},
}

const educationLevels: Record<string, Badge> = {
  "0": {label: "Preschool", icon: "EducationEarlyChildhood"},
  "1": {label: "Primary school", icon: "EducationSchool"},
  "2": {label: "Middle school", icon: "EducationSchool"},
  "3": {label: "High school", icon: "EducationSchool"},
  "4": {label: "Vocational cert.", icon: "EducationSchool"},
  "5": {label: "Associate deg.", icon: "EducationHigher"},
  "6": {label: "Bachelor's", icon: "EducationHigher"},
  "7": {label: "Master's", icon: "EducationHigher"},
  "8": {label: "Doctorate", icon: "EducationHigher"},
  "9": {label: "Misc. ed.", icon: "EducationOther"},
  "2-4": {label: "Secondary ed.", icon: "EducationSchool"},
  "5-8": {label: "Higher ed.", icon: "EducationHigher"},
}

const educationFields: Record<string, Badge> = {
  "00": {label: "Generic programmes and qualifications", icon: "EducationFieldGeneral"},
  "01": {label: "Education", icon: "EducationFieldEducation"},
  "02": {label: "Humanities", icon: "EducationFieldArts"},
  "03": {label: "Social sciences", icon: "EducationFieldSocialSciences"},
  "04": {label: "Business", icon: "EducationFieldBusiness"},
  "05": {label: "Natural sciences", icon: "EducationFieldSciences"},
  "06": {label: "ICT", icon: "EducationFieldTechnology"},
  "07": {label: "Engineering", icon: "EducationFieldEngineering"},
  "08": {label: "Food production", icon: "EducationFieldAgriculture"},
  "09": {label: "Health", icon: "EducationFieldHealth"},
  "10": {label: "Services", icon: "EducationFieldServices"},
  "99": {label: "Other fields", icon: "EducationFieldOther"},
  "all": {label: "All fields", icon: "EducationFieldGeneral"},
}

const coreFields = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]
const higherLevels = ["5", "6", "7", "8"]
const languagePrefix = "widget-lang-"
const baseLanguage = (tag: string) => tag.toLowerCase().split("-")[0]

const naturalName = (keyword: string) => keyword
  .replaceAll(/[-_]+/g, " ")
  .replace(/\b\w/g, letter => letter.toUpperCase())

type LanguageNameCache = {
  displayNames: Intl.DisplayNames
  labels: Map<string, string | undefined>
}

const languageNameCaches = new Map<string, LanguageNameCache>()
const maxCachedLocales = 16
const maxCachedTagsPerLocale = 256

function languageName(tag: string, locale: string) {
  if(typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return undefined

  let cache = languageNameCaches.get(locale)
  if(cache) {
    languageNameCaches.delete(locale)
    languageNameCaches.set(locale, cache)
  }
  else {
    try {
      cache = {displayNames: new Intl.DisplayNames([locale], {type: "language"}), labels: new Map()}
      languageNameCaches.set(locale, cache)
      if(languageNameCaches.size > maxCachedLocales) {
        languageNameCaches.delete(languageNameCaches.keys().next().value!)
      }
    }
    catch {
      return undefined
    }
  }

  if(cache.labels.has(tag)) {
    const label = cache.labels.get(tag)
    cache.labels.delete(tag)
    cache.labels.set(tag, label)
    return label
  }

  try {
    const label = cache.displayNames.of(tag)
    cache.labels.set(tag, label)
    if(cache.labels.size > maxCachedTagsPerLocale) {
      cache.labels.delete(cache.labels.keys().next().value!)
    }
    return label
  }
  catch {
    return undefined
  }
}

/** Groups npm package keywords in the order used by the original package palette. */
export function packageKeywordPresentations(
  keywords: string[],
  locale = typeof navigator === "undefined" ? "en" : navigator.language || "en",
  preferredLocales: readonly string[] = [],
): PackageKeywordPresentation[] {
  const normalizedKeywords = new Set<string>()
  const types: PackageKeywordPresentation[] = []
  const languages: string[] = []
  const additionalLanguages: string[] = []
  const seenLanguages = new Set<string>()
  const preferredLanguages = new Set([locale, ...preferredLocales].map(baseLanguage))
  const fields = new Set<string>()
  const levels = new Set<string>()
  const custom: PackageKeywordPresentation[] = []

  for(const keyword of keywords) {
    const normalized = keyword.toLowerCase()
    if(normalizedKeywords.has(normalized)) continue
    normalizedKeywords.add(normalized)
    if(normalized === "webwriter-widget" || Object.hasOwn(onlineLabels, normalized)) continue

    if(Object.hasOwn(widgetTypes, normalized)) {
      types.push({kind: "type", ...widgetTypes[normalized]})
      continue
    }

    if(normalized.startsWith(languagePrefix) && normalized.length > languagePrefix.length) {
      const language = baseLanguage(normalized.slice(languagePrefix.length))
      if(!language || seenLanguages.has(language)) continue
      seenLanguages.add(language)
      const label = languageName(language, locale) ?? naturalName(language)
      const group = preferredLanguages.has(language) ? languages : additionalLanguages
      group.push(label)
      continue
    }

    const level = normalized.match(/^isced2011-(\d)\d*$/)?.[1]
    if(level) {
      levels.add(level)
      continue
    }

    const field = normalized.match(/^iscedf2013-(\d{2})\d*$/)?.[1]
    if(field && educationFields[field]) {
      fields.add(field)
      continue
    }

    if(keyword.trim()) custom.push({kind: "custom", label: keyword})
  }

  // The desktop palette treats levels 2 and 3 together as secondary education.
  if(levels.has("2") && levels.has("3")) {
    for(const level of ["2", "3", "4"]) levels.delete(level)
    levels.add("2-4")
  }
  if(higherLevels.every(level => levels.has(level))) {
    for(const level of higherLevels) levels.delete(level)
    levels.add("5-8")
  }

  const fieldCodes = coreFields.every(field => fields.has(field)) ? ["all"] : [...fields].sort()
  const online = (Object.keys(onlineLabels) as (keyof typeof onlineLabels)[])
    .find(keyword => normalizedKeywords.has(keyword))
  const badges = [...types]
  if(languages.length || additionalLanguages.length) {
    badges.push({kind: "language", label: languages.join(", "), icon: "KeywordLanguage", additionalLanguages})
  }
  for(const code of fieldCodes) badges.push({kind: "field", ...educationFields[code]})
  if(online) badges.push({kind: "online", label: onlineLabels[online], icon: "KeywordOnline"})
  for(const level of [...levels].sort()) badges.push({kind: "level", ...educationLevels[level]})
  return badges.concat(custom)
}
