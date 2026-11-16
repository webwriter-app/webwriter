/**
 * Which locale answers for a language tag when the general rules would pick
 * another one: `{pt: "pt-PT", "zh-HK": "zh-Hant"}`. A key applies to its tag
 * and to every longer tag that starts with it.
 */
export type LocalePreferences = Readonly<Record<string, string>>;
/**
 * Languages that stand in for each other when a widget has nothing in the
 * language itself. `Intl.Locale` already maps deprecated codes (`iw` → `he`);
 * these are the pairs it leaves apart.
 */
export declare const LOCALE_ALIASES: LocalePreferences;
/**
 * Preferences that always hold, under the ones a caller gives. `Intl.Locale`
 * reads Montenegrin (`cnr`) as Serbian in Latin script, which would pass a
 * Montenegrin catalog by.
 */
export declare const LOCALE_PREFERENCES: LocalePreferences;
/**
 * The configured locale that fits a language tag best. In this order: the tag
 * itself; the tag without its last subtags, as long as a subtag is left; the
 * `prefer` entry for the tag or its language (over `LOCALE_PREFERENCES`:
 * `cnr` → `sr-ME`); its likely script, then its
 * likely region (`zh-HK` → `zh-Hant`, `de` → `de-DE`); the bare language; any
 * locale of that language; the same steps for the language's alias
 * (`LOCALE_ALIASES`: `no` ↔ `nb`); the source locale.
 */
export declare function matchLocale(tag: string, sourceLocale: string, targetLocales: readonly string[], prefer?: LocalePreferences): string;
