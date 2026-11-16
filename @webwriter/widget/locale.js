const LOCALE_ALIASES = { no: "nb", nb: "no" };
const LOCALE_PREFERENCES = { cnr: "sr-ME" };
const clean = (tag) => tag.trim().replace(/_/g, "-").toLowerCase();
function find(wanted, known, prefer) {
  if (!wanted) return void 0;
  const prefixes = [];
  for (let rest = wanted; rest; rest = rest.includes("-") ? rest.slice(0, rest.lastIndexOf("-")) : "") prefixes.push(rest);
  const language = prefixes[prefixes.length - 1];
  for (const prefix of prefixes) {
    if (prefix !== language || prefix === wanted) {
      const locale = known.get(prefix);
      if (locale) return locale;
    }
  }
  for (const prefix of prefixes) {
    const preferred = prefer?.get(prefix);
    const locale = preferred && find(clean(preferred), known, null);
    if (locale) return locale;
  }
  const languages = [language];
  try {
    const likely = new Intl.Locale(wanted).maximize();
    const script = likely.script === "Aran" ? "Arab" : likely.script;
    const locale = known.get(`${likely.language}-${script}`.toLowerCase()) ?? known.get(`${likely.language}-${likely.region}`.toLowerCase());
    if (locale) return locale;
    if (likely.language !== language) languages.push(likely.language);
  } catch {
  }
  for (const each of languages) {
    const locale = known.get(each);
    if (locale) return locale;
  }
  for (const each of languages) {
    for (const [tag, locale] of known) if (tag.startsWith(`${each}-`)) return locale;
  }
  return void 0;
}
function matchLocale(tag, sourceLocale, targetLocales, prefer = {}) {
  const known = new Map([sourceLocale, ...targetLocales].map((locale2) => [locale2.toLowerCase(), locale2]));
  const preferences = new Map(Object.entries({ ...LOCALE_PREFERENCES, ...prefer }).map(([from, to]) => [clean(from), to]));
  const wanted = clean(tag);
  const locale = find(wanted, known, preferences);
  if (locale) return locale;
  const [language, ...rest] = wanted.split("-");
  const alias = LOCALE_ALIASES[language];
  return alias && find([alias, ...rest].join("-"), known, preferences) || sourceLocale;
}
export {
  LOCALE_ALIASES,
  LOCALE_PREFERENCES,
  matchLocale
};
