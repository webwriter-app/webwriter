import widgetKeywords from "./widget-keywords.json"

export type PackageKeywordPresentation = {
  kind: "type" | "language" | "field" | "online" | "level" | "custom" | "editing" | "input"
    | "content" | "conversion" | "display" | "state" | "participation" | "dependency" | "development" | "discovery" | "widget"
  label: string
  icon?: string
  additionalLanguages?: string[]
}

type Badge = {label: string, icon: string}
const widgetBadges = widgetKeywords.badges as Record<string, Badge & {kind: PackageKeywordPresentation["kind"]}>
const onlineKeywords = ["widget-online", "widget-online-edit", "widget-online-use"]
const migrationPrefix = "widget-migrates-from-"
const conversionPrefixes = ["widget-convertible-to-", "widget-convertible-from-"]
const elementName = /^[a-z][a-z0-9_.-]*$/
const mediaType = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/
const semver = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function widgetBadge(keyword: string, normalized: string): PackageKeywordPresentation | undefined {
  const prefix = conversionPrefixes.find(prefix => normalized.startsWith(prefix))
  let key = normalized, value = ""
  if(prefix) {
    key = prefix
    value = normalized.slice(prefix.length)
    if(!elementName.test(value) && !mediaType.test(value)) return
  }
  else if(normalized.startsWith(migrationPrefix)) {
    key = migrationPrefix
    value = keyword.slice(migrationPrefix.length)
    const version = semver.exec(value)
    if(!version || version[1]?.split(".").some(part => /^0\d+$/.test(part))) return
  }
  if(!Object.hasOwn(widgetBadges, key)) return
  const {kind, label, icon} = widgetBadges[key]
  return {kind, label: value ? `${label} ${value}` : label, icon}
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
  const features: PackageKeywordPresentation[] = []
  const languages: string[] = []
  const additionalLanguages: string[] = []
  const seenLanguages = new Set<string>()
  const preferredLanguages = new Set([locale, ...preferredLocales].map(baseLanguage))
  const fields = new Set<string>()
  const levels = new Set<string>()
  const custom: PackageKeywordPresentation[] = []

  for(const keyword of keywords) {
    const normalized = keyword.toLowerCase()
    const identity = normalized.startsWith(migrationPrefix) ? migrationPrefix + keyword.slice(migrationPrefix.length) : normalized
    if(normalizedKeywords.has(identity)) continue
    normalizedKeywords.add(identity)
    if(onlineKeywords.includes(normalized)) continue

    if(normalized.startsWith(languagePrefix) && normalized.length > languagePrefix.length) {
      const language = baseLanguage(normalized.slice(languagePrefix.length))
      if(!language || seenLanguages.has(language)) continue
      seenLanguages.add(language)
      const label = languageName(language, locale) ?? naturalName(language)
      const group = preferredLanguages.has(language) ? languages : additionalLanguages
      group.push(label)
      continue
    }

    const badge = widgetBadge(keyword, normalized)
    if(badge && normalized !== languagePrefix) {
      (badge.kind === "type" ? types : features).push(badge)
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
  const online = onlineKeywords.find(keyword => normalizedKeywords.has(keyword))
  const badges = [...types]
  if(languages.length || additionalLanguages.length) {
    badges.push({kind: "language", label: languages.join(", "), icon: widgetBadges[languagePrefix].icon, additionalLanguages})
  }
  for(const code of fieldCodes) badges.push({kind: "field", ...educationFields[code]})
  if(online) badges.push(widgetBadge(online, online)!)
  for(const level of [...levels].sort()) badges.push({kind: "level", ...educationLevels[level]})
  return badges.concat(features, custom)
}
