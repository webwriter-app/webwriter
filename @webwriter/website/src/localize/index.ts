export const languages = {
    "en": {"_": "🇬🇧", "en": "English", "de": "Englisch"},
    "de": {"_": "🇩🇪", "en": "German",  "de": "Deutsch" }
}
export type Lang = keyof typeof languages

export function getLocalizedURL(url: URL | string, lang: string) {
    const _url = new URL(url)
    const pathParts = _url.pathname.split("/")
    const pathWithoutLang = pathParts.slice(pathParts[1] in languages? 2: 1).join("/")
    return new URL(lang === "en"
        ? `${_url.protocol}//${_url.host}/${pathWithoutLang}`: 
        `${_url.protocol}//${_url.host}/${lang}/${pathWithoutLang}`
    )
}

export const msgResolver = (translations: Record<string, Record<string, string>>, lang: string) => (str: string) => (translations[str]?.[lang] ?? str)