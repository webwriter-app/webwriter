import { filterObject } from '#utility'
import ISO6391 from 'iso-639-1'
import { z } from 'zod'

export const bcp47Pattern = /^((?<grandfathered>(en-GB-oed|i-ami|i-bnn|i-default|i-enochian|i-hak|i-klingon|i-lux|i-mingo|i-navajo|i-pwn|i-tao|i-tay|i-tsu|sgn-BE-FR|sgn-BE-NL|sgn-CH-DE)|(art-lojban|cel-gaulish|no-bok|no-nyn|zh-guoyu|zh-hakka|zh-min|zh-min-nan|zh-xiang))|((?<language>([A-Za-z]{2,3}(-(?<extlang>[A-Za-z]{3}(-[A-Za-z]{3}){0,2}))?)|[A-Za-z]{4}|[A-Za-z]{5,8})(-(?<script>[A-Za-z]{4}))?(-(?<region>[A-Za-z]{2}|[0-9]{3}))?(-(?<variant>[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*(-(?<extension>[0-9A-WY-Za-wy-z](-[A-Za-z0-9]{2,8})+))*(-(?<privateUse>x(-[A-Za-z0-9]{1,8})+))?)|(?<privateUse1>x(-[A-Za-z0-9]{1,8})+))$/

export interface Locale extends z.infer<typeof Locale["objectSchema"]> {}
export class Locale {

  static objectSchema = z.object({
    grandfathered: z.string().optional(),
    language: z.string(),
    extlang: z.string().optional(),
    script: z.string().optional(),
    region: z.string().optional(),
    variant: z.string().optional(),
    extension: z.string().optional(),
    privateUse: z.string().optional()
  })

  static schema = (z
    .string()
    .transform((x, ctx) => {
      const groups = bcp47Pattern.exec(x)?.groups ?? {}
      const privateUse = (groups.privateUse ?? "") + (groups.privateUse1 ?? "")
      return {
        ...filterObject(groups, key => key !== "privateUse1"),
        privateUse: privateUse !== ""? privateUse: undefined
      }
    })
    .pipe(Locale.objectSchema))
    .or(Locale.objectSchema)
    .transform(x => new Locale(x))

  static keys = ["language", "extlang", "script", "region", "variant", "extension", "privateUse"] as const

  static get languageCodes() {
    return ISO6391.getAllCodes()
  }

  static getLanguageInfo(localeOrLang: Locale | string) {
    const lang = localeOrLang instanceof Locale? localeOrLang.language: localeOrLang
    return ISO6391.getLanguages([lang])[0]
  }

  static get preferredLanguageCodes() {
    return Array.from(new Set([document.documentElement.lang, ...navigator.languages.map(locale => locale.split("-")[0])]))
  }

  static get languageInfos() {
    return this.languageCodes.map(this.getLanguageInfo)
  }

  constructor(locale: string | z.input<typeof Locale["objectSchema"]> | Locale) {
    return locale instanceof Locale
      ? Object.assign(this, locale)
      : Locale.schema.parse(locale)
  }

  toString() {
    return this.grandfathered ?? Locale.keys.map(k => this[k]).filter(v => v).join("-")
  }
}