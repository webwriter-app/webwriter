import { documentLanguages } from "./document-languages.js";
const englishNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const comparable = (value) => value.toLocaleLowerCase("en").replaceAll(/[^\p{L}\p{N}]+/gu, "");
function baseLanguage(code) {
  try {
    return new Intl.Locale(code).language;
  } catch {
    return "";
  }
}
function nativeLanguageName(code) {
  const names = new Intl.DisplayNames([code], { type: "language", fallback: "none" });
  return names.resolvedOptions().locale.split("-")[0] === code.split("-")[0] ? names.of(code) : void 0;
}
const alphabetical = [...documentLanguages].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })).map(({ code: value, name }) => {
  const native = nativeLanguageName(value);
  const label = native && comparable(native) !== comparable(name) && !value.startsWith("en-") ? `${name} (${native})` : name;
  return { value, label, description: value };
});
const languageFamilies = new Map(alphabetical.map((option) => [option.value, baseLanguage(option.value)]));
function orderedLanguageOptions(preferred = globalThis.navigator?.languages ?? []) {
  const families = new Set(preferred.map(baseLanguage));
  const promoted = [];
  const remaining = [];
  for (const option of alphabetical) {
    const list = families.has(languageFamilies.get(option.value)) ? promoted : remaining;
    list.push(option);
  }
  if (!promoted.length || !remaining.length) return alphabetical;
  return [...promoted, { ...remaining[0], dividerBefore: true }, ...remaining.slice(1)];
}
function documentLanguageName(value) {
  const option = alphabetical.find((option2) => option2.value.toLowerCase() === value.toLowerCase());
  if (option) return option.label;
  try {
    return englishNames.of(value) ?? value;
  } catch {
    return value;
  }
}
export {
  documentLanguageName,
  orderedLanguageOptions
};
