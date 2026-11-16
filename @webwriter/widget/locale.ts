// Matching a language tag to the locales a widget or a module has. Used by Localization and by module text.

/**
 * Which locale answers for a language tag when the general rules would pick
 * another one: `{pt: "pt-PT", "zh-HK": "zh-Hant"}`. A key applies to its tag
 * and to every longer tag that starts with it.
 */
export type LocalePreferences = Readonly<Record<string, string>>

/**
 * Languages that stand in for each other when a widget has nothing in the
 * language itself. `Intl.Locale` already maps deprecated codes (`iw` → `he`);
 * these are the pairs it leaves apart.
 */
export const LOCALE_ALIASES: LocalePreferences = {no: "nb", nb: "no"}

/**
 * Preferences that always hold, under the ones a caller gives. `Intl.Locale`
 * reads Montenegrin (`cnr`) as Serbian in Latin script, which would pass a
 * Montenegrin catalog by.
 */
export const LOCALE_PREFERENCES: LocalePreferences = {cnr: "sr-ME"}

const clean = (tag: string) => tag.trim().replace(/_/g, "-").toLowerCase()

/** The steps of `matchLocale()` for one tag, without aliases and without the source fallback. */
function find(wanted: string, known: ReadonlyMap<string, string>, prefer: ReadonlyMap<string, string> | null): string | undefined {
  if(!wanted) return undefined
  // The tag itself, then the tag without its last subtags: de-latn-at, de-latn, de.
  const prefixes: string[] = []
  for(let rest = wanted; rest; rest = rest.includes("-") ? rest.slice(0, rest.lastIndexOf("-")) : "") prefixes.push(rest)
  const language = prefixes[prefixes.length - 1]
  for(const prefix of prefixes) {
    if(prefix !== language || prefix === wanted) {
      const locale = known.get(prefix)
      if(locale) return locale
    }
  }
  for(const prefix of prefixes) {
    const preferred = prefer?.get(prefix)
    const locale = preferred && find(clean(preferred), known, null)
    if(locale) return locale
  }
  const languages = [language]
  try {
    const likely = new Intl.Locale(wanted).maximize()
    // Nastaliq is a style of the Arabic script, and catalogs name the script.
    const script = likely.script === "Aran" ? "Arab" : likely.script
    const locale = known.get(`${likely.language}-${script}`.toLowerCase()) ?? known.get(`${likely.language}-${likely.region}`.toLowerCase())
    if(locale) return locale
    // A deprecated code has another language here: iw → he.
    if(likely.language !== language) languages.push(likely.language)
  } catch {
    // A malformed tag has no likely subtags.
  }
  for(const each of languages) {
    const locale = known.get(each)
    if(locale) return locale
  }
  for(const each of languages) {
    for(const [tag, locale] of known) if(tag.startsWith(`${each}-`)) return locale
  }
  return undefined
}

/**
 * The configured locale that fits a language tag best. In this order: the tag
 * itself; the tag without its last subtags, as long as a subtag is left; the
 * `prefer` entry for the tag or its language (over `LOCALE_PREFERENCES`:
 * `cnr` → `sr-ME`); its likely script, then its
 * likely region (`zh-HK` → `zh-Hant`, `de` → `de-DE`); the bare language; any
 * locale of that language; the same steps for the language's alias
 * (`LOCALE_ALIASES`: `no` ↔ `nb`); the source locale.
 */
export function matchLocale(tag: string, sourceLocale: string, targetLocales: readonly string[], prefer: LocalePreferences = {}): string {
  const known = new Map([sourceLocale, ...targetLocales].map(locale => [locale.toLowerCase(), locale]))
  const preferences = new Map(Object.entries({...LOCALE_PREFERENCES, ...prefer}).map(([from, to]) => [clean(from), to]))
  const wanted = clean(tag)
  const locale = find(wanted, known, preferences)
  if(locale) return locale
  const [language, ...rest] = wanted.split("-")
  const alias = LOCALE_ALIASES[language]
  return (alias && find([alias, ...rest].join("-"), known, preferences)) || sourceLocale
}
