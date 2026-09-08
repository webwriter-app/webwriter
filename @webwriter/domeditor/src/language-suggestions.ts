import {documentLanguages} from "./document-languages"
import data from "./language-suggestions-data.json"

// Membership: https://www.un.org/en/our-work/official-languages
const worldLanguages = "ar zh en fr ru es".split(" ")
// Membership: https://european-union.europa.eu/principles-countries-history/languages_en
const europeanLanguages = "bg hr cs da nl en et fi fr de el hu ga it lv lt mt pl pt ro sk sl es sv".split(" ")

/** Grouped suggestions; free text remains valid even when absent from this list.
 * Counts are approximate worldwide L1 + L2 populations from Unicode CLDR 48.
 * Each country contributes at most its three largest national official (or
 * de facto official) languages, before deduplication and UN/EU promotion.
 * See scripts/update-language-suggestions.py for provenance and regeneration.
 */
export function groupedLanguageOptions() {
  const names = new Map<string, string>(documentLanguages.map(({code, name}) => [code, name]))
  names.set("nzs", "New Zealand Sign Language")
  names.set("ffm", "Maasina Fulfulde")
  names.set("snk", "Soninke")
  const displayNames = new Intl.DisplayNames(["en"], {type: "language"})
  const speakers: Record<string, number> = data.speakers
  const seen = new Set<string>()
  return [
    {group: "World languages", codes: worldLanguages},
    {group: "European languages", codes: europeanLanguages},
    {group: "Other languages", codes: Object.values(data.countries).flat()},
  ].flatMap(({group, codes}) => [...new Set(codes)]
    .filter(code => !seen.has(code))
    .sort((a, b) => speakers[b] - speakers[a] || a.localeCompare(b))
    .map(value => {
      seen.add(value)
      return {value, label: names.get(value) ?? displayNames.of(value) ?? value, description: value, group}
    }))
}
