import {ZodSchema, z} from "zod"
import SPDX_LICENSE_MAP from "spdx-license-list"
import {
  SemVer as NodeSemVer,
  Range as NodeSemVerRange,

} from "semver"
import ISO6391 from 'iso-639-1'
import { disjunctPipe, filterObject } from "../../utility"

const SPDX_LICENSES = Object.keys(SPDX_LICENSE_MAP)
const MIME_NAME_ENCODING = {
  "~": "_".repeat(16),
  "|": "_".repeat(15),
  "`": "_".repeat(14),
  "^": "_".repeat(13),
  "*": "_".repeat(12),
  "'": "_".repeat(11),
  "&": "_".repeat(10),
  "%": "_".repeat(9),
  "$": "_".repeat(8),
  "#": "_".repeat(7),
  "!": "_".repeat(6),
  ";": "_".repeat(5),
  "/": "_".repeat(4),
  ".": "_".repeat(3),
  "+": "_".repeat(2),
  "-": "_".repeat(1),
}


const npmPersonPattern = /^\s*(?<name>.*?)(?:<(?<email>.+)>)?\s*(?:\((?<url>.+)\))?\s*$/
const mimePattern = /#?(?<supertype>[\w!#$%&'*.^`|~-]+)(?:\/(?<subtype>[\w!#$%&'*.^`|~-]+)(?:\+(?<suffix>[\w!#$%&'*.^`|~-]+))?(?:;(?<pkey>[\w!#$%&'*.^`|~-]+)=(?<pval>[\w!#$%&'*.^`|~-]+))?)?/
const semverPattern = /(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z\-][0-9a-zA-Z\-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z\-][0-9a-zA-Z\-]*))*))?(?:\+(?<buildmetadata>[0-9a-zA-Z\-]+(?:\.[0-9a-zA-Z\-]+)*))?/
const npmNamePattern = /^(@(?<organization>[a-z0-9\-~][a-z0-9\-._~]*)\/)?(?<name>[a-z0-9\-~][a-z0-9\-._~]*)$/
const spdxLicensePattern = new RegExp(`^(${SPDX_LICENSES.map(x => x.replaceAll(".", "\.")).join("|")})$`)

export interface Person extends z.infer<typeof Person["objectSchema"]> {}
export class Person {

  static objectSchema = z.object({
    name: z.string(),
    email: z.string().optional(),
    url: z.string().optional()
  })

  static schema = z.string()
    .regex(npmPersonPattern)
    .transform(str => {
      const groups = npmPersonPattern.exec(str)?.groups ?? {}
      const {name, email, url} = groups
      const person = {name, ...(email && {email}), ...(url && {url})} as z.infer<typeof Person.objectSchema>
      return new Person(person)
    })
    .or(Person.objectSchema.transform(x => new Person(x))
      
    )

  constructor(person: string | z.infer<typeof Person.objectSchema>) {
    return typeof person === "string"
      ? Person.schema.parse(person)
      : Object.assign(this, person)
  }


  toString() {
    const email = this.email != null? ` <${this.email}>`: ""
    const url = this.url != null? ` (${this.url})`: ""
    return `${this.name}${email}${url}`
  }

  toJSON() {
    return this.toString()
  }

  extend(extraProperties: Partial<Person>) {
    return new Person({...this, ...extraProperties})
  }
}

export class SemVer extends NodeSemVer {

  static pattern = semverPattern

  constructor(ver: string | SemVer | NodeSemVer, optionsOrLoose?: ConstructorParameters<typeof NodeSemVer>[1]) {
    super(ver, optionsOrLoose)
  }
  
  static schema = z.string().transform((x, ctx) => {
    try {
      return new this(x)
    }
    catch(err: any) {
      ctx.addIssue({code: z.ZodIssueCode.custom, message: err.message})
      return z.NEVER
    }
  }).or(z.instanceof(this))

  gt(other: string | SemVer | NodeSemVer) {
    return this.compare(other) === 1
  }
  
  lt(other: string | SemVer | NodeSemVer) {
    return this.compare(other) === -1
  }
  
  eq(other: string | SemVer | NodeSemVer) {
    return this.compare(other) === 0
  } 
  
  toString = () => this.raw; toJSON = () => this.toString()
}

export class SemVerRange extends NodeSemVerRange {

  constructor(range: string | SemVerRange | NodeSemVerRange, optionsOrLoose?: ConstructorParameters<typeof NodeSemVerRange>[1]) {
    super(range, optionsOrLoose)
  }
  
  static schema = z.string().transform((x, ctx) => {
    try {
      return new this(x)
    }
    catch(err: any) {
      ctx.addIssue({code: z.ZodIssueCode.custom, message: err.message})
      return z.NEVER
    }
  }).or(z.instanceof(this))
  
  toString = () => this.raw; toJSON = () => this.toString()
}

export class License {

  static schema = z.string().transform(x => new this(x)).or(z.instanceof(this))

  static spdxLicenseKeys = Object.keys(SPDX_LICENSE_MAP)
  
  key: string
  
  constructor(key: string | {key: string}) {
    this.key = typeof key === "string"? key: key.key
  }

  get name() {
    return SPDX_LICENSE_MAP[this.key]?.name
  }

  get url() {
    return SPDX_LICENSE_MAP[this.key]?.url
  }

  get osiApproved() {
    return SPDX_LICENSE_MAP[this.key]?.osiApproved
  }

  toString() {
    return this.key
  }

  toJSON() {
    return this.toString()
  }

}

export interface MediaType extends z.infer<typeof MediaType["objectSchema"]> {}
export class MediaType {

  static objectSchema = disjunctPipe(
    z.string().transform((arg, ctx) => {
      if(!arg.startsWith("_") && !arg.startsWith("#")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `MediaType must start with '#' or '_'`
        })
        return z.NEVER
      }
      const value = arg.startsWith("_")
        ? Object.entries(MIME_NAME_ENCODING).reduce((acc, [k, v]) => acc.replaceAll(v, k), arg)
        : arg
      const match = value.match(mimePattern)
      if(match) {
        const {supertype, subtype, suffix, pkey, pvalue} = match.groups ?? {}
        return {supertype, subtype, suffix, ...(pkey? {[pkey]: pvalue}: null)}
      }
      else {
        return z.NEVER
      }
    }),
    z.object({
      supertype: z.string(),
      subtype: z.string(),
      suffix: z.string().optional(),
      pkey: z.string().optional(),
      pvalue: z.string().optional()
    })
  )

  static schema = this.objectSchema.transform(x => Object.assign(Object.create(this.prototype), x))

  constructor(mediaType: MediaType | z.input<typeof MediaType.objectSchema>) {
    return mediaType instanceof MediaType
      ? mediaType
      : MediaType.schema.parse(mediaType)
  }

  toString(format: "expr" | "node" = "expr") {
    if(format === "expr") {
      const [paramKey, paramValue] = Object.entries(this).find(([k]) => k !== "supertype" && k !== "subtype" && k !== "suffix") ?? []
      const paramStr = paramKey? `;${paramKey}=${paramValue}`: ""
      return `#${this?.supertype}/${this?.subtype}` + paramStr
    }
    else {
      return `_${this?.supertype}____${this.subtype.replaceAll("-", "_")}`
    }
  }

  toJSON() {
    return this.toString()
  }
}

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
    return navigator.languages.filter(code => !code.includes("-"))
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