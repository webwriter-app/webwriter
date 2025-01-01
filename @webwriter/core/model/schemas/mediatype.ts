import { disjunctPipe } from "#utility"
import { z } from "zod"

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
const mimePattern = /#?(?<supertype>[\w!#$%&'*.^`|~-]+)(?:\/(?<subtype>[\w!#$%&'*.^`|~-]+)(?:\+(?<suffix>[\w!#$%&'*.^`|~-]+))?(?:;(?<pkey>[\w!#$%&'*.^`|~-]+)=(?<pval>[\w!#$%&'*.^`|~-]+))?)?/

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