export type PackageKeywordPresentation = {
  label: string
  icon?: string
}

const standardizedKeywords: Record<string, PackageKeywordPresentation> = {
  "widget-online": {label: "Online", icon: "KeywordOnline"},
  "widget-online-edit": {label: "Online while editing", icon: "KeywordOnline"},
  "widget-online-use": {label: "Online when used", icon: "KeywordOnline"},
  "widget-presentational": {label: "Presentation", icon: "KeywordPresentation"},
  "widget-practical": {label: "Practice", icon: "KeywordPractice"},
  "widget-simulational": {label: "Simulation", icon: "KeywordSimulation"},
  "widget-conceptual": {label: "Concept", icon: "KeywordConcept"},
  "widget-informational": {label: "Information", icon: "KeywordInformation"},
  "widget-contextual": {label: "Real-world context", icon: "KeywordContext"},
}

const educationLevels: Record<string, PackageKeywordPresentation> = {
  "0": {label: "Early childhood education", icon: "EducationEarlyChildhood"},
  "1": {label: "Primary education", icon: "EducationPrimary"},
  "2": {label: "Lower secondary education", icon: "EducationSecondary"},
  "3": {label: "Upper secondary education", icon: "EducationSecondary"},
  "4": {label: "Post-secondary non-tertiary education", icon: "EducationPostSecondary"},
  "5": {label: "Short-cycle tertiary education", icon: "EducationTertiary"},
  "6": {label: "Bachelor’s or equivalent level", icon: "EducationDegree"},
  "7": {label: "Master’s or equivalent level", icon: "EducationDegree"},
  "8": {label: "Doctoral or equivalent level", icon: "EducationDegree"},
  "9": {label: "Education level not elsewhere classified", icon: "EducationOther"},
}

const educationFields: Record<string, PackageKeywordPresentation> = {
  "00": {label: "Generic programmes and qualifications", icon: "EducationFieldGeneral"},
  "01": {label: "Education", icon: "EducationFieldEducation"},
  "02": {label: "Arts and humanities", icon: "EducationFieldArts"},
  "03": {label: "Social sciences, journalism and information", icon: "EducationFieldSocialSciences"},
  "04": {label: "Business, administration and law", icon: "EducationFieldBusiness"},
  "05": {label: "Natural sciences, mathematics and statistics", icon: "EducationFieldSciences"},
  "06": {label: "Information and communication technologies", icon: "EducationFieldTechnology"},
  "07": {label: "Engineering, manufacturing and construction", icon: "EducationFieldEngineering"},
  "08": {label: "Agriculture, forestry, fisheries and veterinary", icon: "EducationFieldAgriculture"},
  "09": {label: "Health and welfare", icon: "EducationFieldHealth"},
  "10": {label: "Services", icon: "EducationFieldServices"},
}

const naturalName = (keyword: string) => keyword
  .replaceAll(/[-_]+/g, " ")
  .replace(/\b\w/g, letter => letter.toUpperCase())

function languageName(tag: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], {type: "language"}).of(tag)
  }
  catch {
    return undefined
  }
}

/** Turns npm package keywords into compact, user-facing metadata labels. */
export function packageKeywordPresentations(
  keywords: string[],
  locale = typeof navigator === "undefined" ? "en" : navigator.language || "en",
) {
  const presentations = keywords.flatMap<PackageKeywordPresentation>(keyword => {
    const normalized = keyword.toLowerCase()
    if(normalized === "webwriter-widget") return []

    const standardized = standardizedKeywords[normalized]
    if(standardized) return [standardized]

    if(normalized.startsWith("widget-lang-")) {
      const tag = keyword.slice("widget-lang-".length)
      return [{label: languageName(tag, locale) ?? naturalName(tag), icon: "KeywordLanguage"}]
    }

    const levelCode = normalized.match(/^isced2011-(\d+)$/)?.[1]
    if(levelCode && educationLevels[levelCode[0]]) return [educationLevels[levelCode[0]]]

    const fieldCode = normalized.match(/^iscedf2013-(\d+)$/)?.[1]
    if(fieldCode && educationFields[fieldCode.slice(0, 2)]) {
      return [educationFields[fieldCode.slice(0, 2)]]
    }

    return [{label: naturalName(keyword)}]
  })

  return [...new Map(presentations.map(presentation => [presentation.label, presentation])).values()]
}
