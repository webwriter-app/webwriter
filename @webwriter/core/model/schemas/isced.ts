import {z} from "zod"

function unionOfLiterals<T extends string | number> ( constants: readonly T[] ) {
    const literals = constants.map(
        x => z.literal( x )
    ) as unknown as readonly [ z.ZodLiteral<T>, z.ZodLiteral<T>, ...z.ZodLiteral<T>[] ]
    return z.union( literals )
  }
  

const broadFields = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "99"] as const
const narrowFields = [
  "000", "001", "002", "003", "009", "011", "018", "020", "021", "022", "023", "028", "029", "030", "031", "032", "038", "039", "040", "041", "042", "048", "049", "050", "051", "052", "053", "054", "058", "059", "061", "068", "070", "071", "072", "073", "078", "079", "080", "081", "082", "083", "084", "088", "089", "090", "091", "092", "098", "099", "100", "101", "102", "103", "104", "108", "109", "999"
] as const
const detailedFields = [
  "0000", "0011", "0021", "0031", "0099",
  "0110", "0111", "0112", "0113", "0114", "0119", "0188",
  "0200", "0210", "0211", "0212", "0213", "0214", "0215", "0219", "0220", "0221", "0222", "0223", "0229", "0230", "0231", "0232", "0239", "0288", "0299",
  "0300", "0310", "0311", "0312", "0313", "0314", "0319", "0320", "0321", "0322", "0329", "0388", "0399",
  "0400", "0410", "0411", "0412", "0413", "0414", "0415", "0416", "0417", "0419", "0421", "0488", "0499",
  "0500", "0510", "0511", "0512", "0519", "0520", "0521", "0522", "0529", "0530", "0531", "0532", "0533", "0539", "0540", "0541", "0542", "0588", "0599",
  "0610", "0611", "0612", "0613", "0619", "0688",
  "0700", "0710", "0711", "0712", "0713", "0714", "0715", "0716", "0719", "0720", "0721", "0722", "0723", "0724", "0729", "0730", "0731", "0732", "0788", "0799",
  "0800", "0810", "0811", "0812", "0819", "0821", "0831", "0841", "0888", "0899",
  "0900", "0910", "0911", "0912", "0913", "0914", "0915", "0916", "0917", "0919", "0920", "0921", "0922", "0923", "0929", "0988", "0999",
  "1000", "1010", "1011", "1012", "1013", "1014", "1015", "1019", "1020", "1021", "1022", "1029", "1030", "1031", "1032", "1039", "1041", "1088", "1099",
  "9999"
] as const


export type ISCEDF2013Code = `iscedf2013-${typeof broadFields[number] | typeof narrowFields[number] | typeof detailedFields[number]}`

export interface ISCEDF2013 extends z.infer<typeof ISCEDF2013["objectSchema"]> {}
export class ISCEDF2013 {

  static objectSchema = z.object({
    broad: unionOfLiterals(broadFields),
    narrow: unionOfLiterals(narrowFields).optional(),
    detailed: unionOfLiterals(detailedFields).optional()
  })

  static schema = (z
    .string()
    .startsWith("iscedf2013-")
    .min("iscedf2013-".length + 2)
    .max("iscedf2013-".length + 4)
    .transform(str => {
      const code = str.slice("iscedf2013-".length + 1)
      return {
        broad: code.slice(0, 2),
        narrow: code.length >= 3? code.slice(0, 3): undefined,
        detailed: code.length >= 4? code.slice(0, 4): undefined,
      }
    }))
    .pipe(ISCEDF2013.objectSchema)
    .or(ISCEDF2013.objectSchema)
    .transform(x => new ISCEDF2013(x))

  constructor(input: string | z.input<typeof ISCEDF2013["objectSchema"]> | ISCEDF2013) {
    return input instanceof ISCEDF2013
      ? Object.assign(this, input)
      : ISCEDF2013.schema.parse(input)
  }

  toString() {
    return "iscedf2013-" + (this.detailed ?? this.narrow ?? this.broad)
  }
}


const levels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const
const programmes = ["01", "02", "10", "24", "25", "34", "35", "44", "45", "54", "55", "64", "65", "66", "74", "75", "76", "84", "85", "86", "99"] as const


export type ISCED2011Code = `isced2011-${typeof levels[number] | typeof programmes[number]}`

export interface ISCED2011 extends z.infer<typeof ISCED2011["objectSchema"]> {}
export class ISCED2011 {

  static objectSchema = z.object({
    level: unionOfLiterals(levels),
    programme: unionOfLiterals(programmes).optional()
  })

  static schema = (z
    .string()
    .startsWith("isced2011-")
    .min("isced2011-".length + 1)
    .max("isced2011-".length + 2)
    .transform(str => {
      const code = str.slice("isced2011-".length + 1)
      return {
        level: code.at(0),
        programme: code.length == 2? code: undefined 
      }
    }))
    .pipe(ISCED2011.objectSchema)
    .or(ISCED2011.objectSchema)
    .transform(x => new ISCED2011(x))

  constructor(input: string | z.input<typeof ISCED2011["objectSchema"]> | ISCED2011) {
    return input instanceof ISCED2011
      ? Object.assign(this, input)
      : ISCED2011.schema.parse(input)
  }

  toString() {
    return "isced2011-" + (this.programme ?? this.level)
  }
}