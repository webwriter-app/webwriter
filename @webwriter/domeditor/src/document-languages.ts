/** Languages officially supported by the editor's document language pickers. */
export const documentLanguages = [
  {code: "en-US", name: "English (US)"},
  {code: "en-GB", name: "English (UK)"},
  {code: "en-CA", name: "English (Canada)"},
  {code: "en-AU", name: "English (Australia)"},
  {code: "en-IN", name: "English (India)"},
  {code: "ar", name: "Arabic"},
  {code: "bg", name: "Bulgarian"},
  {code: "cs", name: "Czech"},
  {code: "da", name: "Danish"},
  {code: "nl", name: "Dutch"},
  {code: "et", name: "Estonian"},
  {code: "fi", name: "Finnish"},
  {code: "el", name: "Greek"},
  {code: "hu", name: "Hungarian"},
  {code: "ga", name: "Irish"},
  {code: "it", name: "Italian"},
  {code: "lv", name: "Latvian"},
  {code: "lt", name: "Lithuanian"},
  {code: "mt", name: "Maltese"},
  {code: "pl", name: "Polish"},
  {code: "ro", name: "Romanian"},
  {code: "ru", name: "Russian"},
  {code: "sk", name: "Slovak"},
  {code: "sl", name: "Slovenian"},
  {code: "sv", name: "Swedish"},
  {code: "tr", name: "Turkish"},
  {code: "uk", name: "Ukrainian"},
  {code: "sq", name: "Albanian"},
  {code: "mk", name: "Macedonian"},
  {code: "is", name: "Icelandic"},
  {code: "eu", name: "Basque"},
  {code: "gl", name: "Galician"},
  {code: "cy", name: "Welsh"},
  {code: "lb", name: "Luxembourgish"},
  {code: "he", name: "Hebrew"},
  {code: "be", name: "Belarusian"},
  {code: "la", name: "Latin"},
  {code: "hr", name: "Croatian"},
  {code: "sr-Cyrl", name: "Serbian (Cyrillic)"},
  {code: "sr-Latn", name: "Serbian (Latin)"},
  {code: "bs", name: "Bosnian"},
  {code: "cnr", name: "Montenegrin"},
  {code: "nb", name: "Norwegian Bokmål"},
  {code: "nn", name: "Norwegian Nynorsk"},
  {code: "ca", name: "Catalan"},
  {code: "pt-PT", name: "Portuguese (Portugal)"},
  {code: "pt-BR", name: "Portuguese (Brazil)"},
  {code: "de-DE", name: "German (Germany)"},
  {code: "de-AT", name: "German (Austria)"},
  {code: "de-CH", name: "German (Switzerland)"},
  {code: "fr-FR", name: "French (France)"},
  {code: "fr-CA", name: "French (Canada)"},
  {code: "fr-BE", name: "French (Belgium)"},
  {code: "fr-CH", name: "French (Switzerland)"},
  {code: "es-ES", name: "Spanish (Spain)"},
  {code: "es-419", name: "Spanish (Latin America)"},
  {code: "zh-Hans", name: "Chinese (Simplified)"},
  {code: "zh-Hant", name: "Chinese (Traditional)"},
  {code: "ko", name: "Korean"},
  {code: "ja", name: "Japanese"},
  {code: "fa-IR", name: "Persian (Iran)"},
  {code: "fa-AF", name: "Dari"},
  {code: "ps", name: "Pashto"},
  {code: "hi", name: "Hindi"},
  {code: "id", name: "Indonesian"},
  {code: "ms", name: "Malay"},
  {code: "jv", name: "Javanese"},
  {code: "tl", name: "Tagalog"},
  {code: "mn", name: "Mongolian"},
  {code: "bn-BD", name: "Bangla (Bangladesh)"},
  {code: "bn-IN", name: "Bangla (India)"},
  {code: "pa-Guru", name: "Punjabi (Gurmukhi)"},
  {code: "pa-Arab", name: "Punjabi (Arabic)"},
  {code: "gu", name: "Gujarati"},
  {code: "mr", name: "Marathi"},
  {code: "te", name: "Telugu"},
  {code: "ur", name: "Urdu"},
  {code: "kn", name: "Kannada"},
  {code: "or", name: "Odia"},
  {code: "ne", name: "Nepali"},
  {code: "si", name: "Sinhala"},
  {code: "ta", name: "Tamil"},
  {code: "ml", name: "Malayalam"},
  {code: "my", name: "Burmese"},
  {code: "th", name: "Thai"},
  {code: "lo", name: "Lao"},
  {code: "vi", name: "Vietnamese"},
  {code: "km", name: "Khmer"},
  {code: "kk-Cyrl", name: "Kazakh (Cyrillic)"},
  {code: "kk-Latn", name: "Kazakh (Latin)"},
  {code: "ky", name: "Kyrgyz"},
  {code: "uz-Latn", name: "Uzbek (Latin)"},
  {code: "uz-Cyrl", name: "Uzbek (Cyrillic)"},
  {code: "tg", name: "Tajik"},
  {code: "tk", name: "Turkmen"},
  {code: "dv", name: "Divehi"},
  {code: "ka", name: "Georgian"},
  {code: "hy", name: "Armenian"},
  {code: "hyw", name: "Western Armenian"},
  {code: "az-Latn", name: "Azerbaijani (Latin)"},
  {code: "tpi", name: "Tok Pisin"},
] as const

const documentLocales = documentLanguages.map(({code}) => ({code, locale: new Intl.Locale(code)}))

/** Match browser preferences to the catalogue while returning the authored tag as listed. */
export function preferredDocumentLanguage(preferences: readonly string[]) {
  for(const preference of preferences) {
    let locale: Intl.Locale
    try {
      locale = new Intl.Locale(preference.replaceAll("_", "-"))
    }
    catch {
      continue
    }
    const exact = documentLocales.find(option => option.locale.baseName === locale.baseName)
    if(exact) return exact.code
    const {language, script, region} = locale.maximize()
    const variants = documentLocales.filter(option => option.locale.language === language)
    const match = variants.find(option => option.locale.region === region)
      ?? variants.find(option => option.locale.script === script)
      ?? variants[0]
    if(match) return match.code
  }
  return "en-US"
}
