import Color from "colorjs.io"
import {AttributeSpec} from "prosemirror-model"
import { z } from "zod"

type ArrayElement<A> = A extends readonly (infer T)[] ? T : never

export const cssGlobalValues = ["initial", "inherit", "unset", "revert", "revert-layer"]

export const CSSGlobalValue = z.string()
  .refine(x => cssGlobalValues.includes(x as any))

export const CSSNumber = z.string()
  .transform((x, ctx) => {
    const float = parseFloat(x)
    if(Number.isNaN(float)) {
      ctx.addIssue({code: z.ZodIssueCode.custom, message: `'${x}' is not a number`})
      return z.NEVER
    }
    else {
      return float
    }
  })

export const CSSInteger = z.string()
  .regex(/[+-][0-9]+/)
  .transform((x, ctx) => {
    const integer = parseInt(x)
    if(Number.isNaN(integer)) {
      ctx.addIssue({code: z.ZodIssueCode.custom, message: `'${x}' is not an integer`})
      return z.NEVER
    }
    else {
      return integer
    }
  })

export const CSSString = z.string()
  .regex(/("[^"]*")|('[^']*')/)
  .transform(x => x.slice(1, -1))

export class CSSEnumeratedValue<T extends {values: readonly string[]}> {

  static values: readonly string[]

  static get schema() {
    return z.enum(this.values as any)
      .transform(x => new this(x as any))
  }

  constructor(
    readonly value: ArrayElement<T["values"]>,
  ) {}
  
  toString() {
    return this.value
  }
}

export class CSSDimensionValue<T extends {units: readonly string[]}> {

  static units: readonly string[]

  static get schema() {
    return z.string()
      .refine(x => this.units.some(unit => x.endsWith(unit)))
      .transform((x, ctx) => {
        let value
        try {
          value = CSSNumber.parse(x)
        }
        catch(err: any) {
          ctx.addIssue(err)
          return z.NEVER
        }
        const unit = x.match(new RegExp(`(${this.units.join("|")})`))?.at(0)!
        return new this(value, unit)
      })
  }

  constructor(
    readonly value: number,
    readonly unit: ArrayElement<T["units"]>
  ) {}
  
  toString() {
    return `${this.value}${this.unit}`
  }
}

export class CSSFunctionValue<T extends {units: readonly string[]}> {

  static units: readonly string[]

  static schema = z.string()
    .refine(x => this.values.includes(x as any))
    .transform(x => new this(x as any, ))

  constructor(
    readonly value: number,
    readonly unit: ArrayElement<T["units"]>
  ) {}
  
  toString() {
    return `${this.value}${this.unit}`
  }
}

export class CSSIdent {

  static regex: RegExp = /([a-zA-Z0-9\-_]|\\.|\\[0-9a-fA-F]{1, 6})*/

  static get schema() {
    return z.string()
      .regex(this.regex)
  }

  constructor(
    readonly value: string
  ) {}
  
  toString() {
    return `${this.value}`
  }
}

export class CSSDashedIdent extends CSSIdent {
  static regex: RegExp = new RegExp("--" + CSSIdent.regex.source)
}

export class CSSPercentage extends CSSDimensionValue<typeof CSSPercentage> {
  static units: ["%"]
}

export class CSSAbsoluteSize extends CSSEnumeratedValue<typeof CSSAbsoluteSize> {
  static values = ["xx-small", "x-small", "small", "medium", "large", "x-large", "xx-large", "xxx-large"] as const
}

export const CSSAlphaValue = CSSNumber.or(CSSPercentage.schema)

export class CSSAngle extends CSSDimensionValue<typeof CSSAngle> {
  static units = ["deg", "grad", "rad", "turn"] as const
}

export const CSSAnglePercentage = CSSAngle.schema.or(CSSPercentage.schema)

// CSSBasicShape

export class CSSBlendMode extends CSSEnumeratedValue<typeof CSSBlendMode> {
  static values = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"] as const
}

export class CSSBoxEdge extends CSSEnumeratedValue<typeof CSSBoxEdge> {
  static values = ["content-box", "padding-box", "border-box", "margin-box", "fill-box", "stroke-box", "view-box"] as const
}

export class CSSCalcConstant extends CSSEnumeratedValue<typeof CSSCalcConstant> {
  static values = ["e", "pi", "infinity", "-infinity", "NaN"] as const
}

// CSSCalcProduct

// CSSCalcSum

// CSSCalcValue

// CSSColorInterpolationMethod

export class CSSColor {

  static get schema() {
    return z.string()
      .transform((x, ctx) => {
        let value
        try {
          value = new Color(x)
        }
        catch(err: any) {
          ctx.addIssue({code: z.ZodIssueCode.custom, message: String(err)})
          return z.NEVER
        }

      })
  }

  constructor(
    readonly value: Color
  ) {}
  
  toString(options?: Parameters<Color["toString"]>[0]) {
    return this.value.toString(options)
  }
}

export class CSSDisplayBox extends CSSEnumeratedValue<typeof CSSDisplayBox> {
  static values = ["contents", "none"] as const
}

export class CSSDisplayInside extends CSSEnumeratedValue<typeof CSSDisplayInside> {
  static values = ["flow", "flow-root", "table", "flex", "grid", "ruby"] as const
}

export class CSSDisplayInternal extends CSSEnumeratedValue<typeof CSSDisplayInternal> {
  static values = ["table-row-group", "table-header-group", "table-footer-group", "table-row", "table-cell", "table-column-group", "table-column", "table-caption", "ruby-base", "ruby-text", "ruby-base-container", "ruby-text-container"] as const
}

export class CSSDisplayLegacy extends CSSEnumeratedValue<typeof CSSDisplayLegacy> {
  static values = ["inline-block", "inline-table", "inline-flex", "inline-grid"] as const
}

// CSSDisplayListitem

export class CSSDisplayOutside extends CSSEnumeratedValue<typeof CSSDisplayOutside> {
  static values = ["block", "inline", "run-in"] as const
}

// CSSEasingFunction

// CSSFilterFunction

export class CSSFlex extends CSSDimensionValue<typeof CSSFlex> {
  static units: ["fr"]
}

export class CSSFrequency extends CSSDimensionValue<typeof CSSFrequency> {
  static units: ["Hz", "kHz"]
}

export const CSSFrequencyPercentage = CSSPercentage.schema.or(CSSFrequency.schema)

export class CSSGenericFamily extends CSSEnumeratedValue<typeof CSSGenericFamily> {
  static values = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math", "fangsong"] as const
}

// CSSGradient

export class CSSHexColor {

  static regex: RegExp = /#(?:(?:[\da-f]{3}){1,2}|(?:[\da-f]{4}){1,2})/i

  static get schema() {
    return z.string()
      .regex(CSSHexColor.regex)
      .transform((x, ctx) => {
        let value
        try {
          value = new Color(x)
        }
        catch(err: any) {
          ctx.addIssue({code: z.ZodIssueCode.custom, message: String(err)})
          return z.NEVER
        }

      })
  }

  constructor(
    readonly value: Color
  ) {}
  
  toString(options?: Parameters<Color["toString"]>[0]) {
    return this.value.toString(options)
  }
}

export const CSSHue = CSSNumber.or(CSSAngle.schema)

// CSSHueInterpolationMethod

// CSSImage

export class CSSLength extends CSSDimensionValue<typeof CSSLength> {
  static relativeFontUnits = ["cap", "ch", "em", "ex", "ic", "lh", "rem", "rlh"]
  static relativeViewportUnits = ["vh", "vw", "vmax", "vmin", "vb", "vi"]
  static containerQueryLengthUnits = ["cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax"]
  static absoluteLengthUnits = ["px", "cm", "mm", "Q", "in", "pc", "pt"]
  static units = [...this.relativeFontUnits, ...this.relativeViewportUnits, ...this.containerQueryLengthUnits, ...this.absoluteLengthUnits]
}

export const CSSLengthPercentage = CSSLength.schema.or(CSSPercentage.schema)

export class CSSLineStyle extends CSSEnumeratedValue<typeof CSSLineStyle> {
  static values = ["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"] as const
}

export class CSSNamedColor {
  static values = ["transparent", "currentcolor", "black", "silver", "gray", "white", "maroon", "red", "purple", "fuchsia", "green", "lime", "olive", "yellow", "navy", "blue", "teal", "aqua", "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "transparent",	"turquoise", "violet", "wheat", "white", "whitesmoke", "yellow", "yellowgreen"] as const

  static get schema() {
    return z
      .enum(this.values)
      .transform((x, ctx) => {
        let value
        try {
          value = new Color(x)
        }
        catch(err: any) {
          ctx.addIssue({code: z.ZodIssueCode.custom, message: String(err)})
          return z.NEVER
        }

      })
  }

  constructor(
    readonly value: Color
  ) {}
  
  toString(options?: Parameters<Color["toString"]>[0]) {
    return this.value.toString(options)
  }
}

export class CSSOverflow extends CSSEnumeratedValue<typeof CSSOverflow> {
  static values = ["visible", "hidden", "clip", "scroll", "auto"] as const
}

// CSSPosition

// CSSRatio

export class CSSRelativeSize extends CSSEnumeratedValue<typeof CSSRelativeSize> {
  static values = ["smaller", "larger"] as const
}

// CSSResolution

// CSSShape

// TODO: How to make this a Color object
export class CSSSystemColor extends CSSEnumeratedValue<typeof CSSSystemColor> {
  static values = ["accentcolor", "accentcolortext", "activetext", "buttonborder", "buttonface", "buttontext", "canvas", "canvastext", "field", "fieldtext", "graytext", "highlight", "highlighttext", "linktext", "mark", "marktext", "visitedtext"] as const
}


export class CSSTime extends CSSDimensionValue<typeof CSSTime> {
  static units = ["s", "ms"]
}

export const CSSTimePercentage = CSSTime.schema.or(CSSPercentage.schema)

// CSSTransformFunction


class CSSProperty {
  static propertyExpression: string
  constructor(
    readonly value: string
  ) {}
}


export let cssProperties = {
  accentColor: class CSSAccentColor extends CSSProperty {
    static propertyExpression = "auto | <color>"
  },
  alignContent: class extends CSSProperty {
    static propertyExpression = "normal | [first | last]? && baseline | space-between | space-around | space-evenly | stretch | [[unsafe | safe]? center | start | end | flex-end]"
  },
  alignItems: class extends CSSProperty {
    static propertyExpression = "normal | stretch | [first | last]? && baseline | [[unsafe | safe]? center | start | end | flex-end]"
  },
  alignSelf: class extends CSSProperty {
    static propertyExpression = "auto | normal | stretch | [first | last]? && baseline | [[unsafe | safe]? center | start | end | flex-end]"
  },
  alignTracks: class extends CSSProperty {
    static propertyExpression = "[normal | [first | last]? && baseline | space-between | space-around | space-evenly | stretch | [[unsafe | safe]? center | start | end | flex-end]]#"
  },
  all: class extends CSSProperty {
    static propertyExpression = ""
  },
  animation: class extends CSSProperty {
    static propertyExpression = "auto | <color>"
  },
  animationComposition: class extends CSSProperty {
    static propertyExpression = "[replace | add | accumulate]#"
  },
  animationDelay: class extends CSSProperty {
    static propertyExpression = "[<time> <time>]#"
  },
  animationDirection: class extends CSSProperty {
    static propertyExpression = "[normal | reverse | alternate | alternate-reverse]#"
  },
  animationDuration: class extends CSSProperty {
    static propertyExpression = "[auto | <time>]#"
  },
  animationFillMode: class extends CSSProperty {
    static propertyExpression = "[none | forwards | backwards | both]#"
  },
  animationIterationCount: class extends CSSProperty {
    static propertyExpression = "[infinite | <number>]#"
  },
  animationName: class extends CSSProperty {
    static propertyExpression = "[none | <custom-ident> | <string>]#"
  },
  animationPlayState: class extends CSSProperty {
    static propertyExpression = "[running | paused]#"
  },
  animationRangeEnd: class extends CSSProperty {
    static propertyExpression = "[normal | <length-percentage> | [<custom-ident> | <string>] | [<custom-ident> | <string>] <length-percentage>]#"
  },
  animationRangeStart: class extends CSSProperty {
    static propertyExpression = "[normal | <length-percentage> | [<custom-ident> | <string>] | [<custom-ident> | <string>] <length-percentage>]#"
  },
  animationRange: class extends CSSProperty {
    static get propertyExpression(): string {
      return `[${cssProperties.animationRangeStart.propertyExpression.slice(0, -1)} ${cssProperties.animationRangeEnd.propertyExpression.slice(0, -1)}? | [<custom-ident> | <string>]]#`
    }
  },
  animationTimeline: class extends CSSProperty {
    static propertyExpression = "[auto | none | [<custom-ident> | <string>]]#"
  },
  animationTimingFunction: class extends CSSProperty {
    static propertyExpression = `[
      linear | 
      [linear( [<number> && <percentage>{1, 2}]# )] | 
      [ease | ease-in | ease-out | ease-in-out | cubic-bezier( <number> <number> <number> <number )] |
      [step-start | step-end | steps(<integer>, [, [jump-start | jump-end | jump-none | jump-both | start | end] ]?)]
    ]#`
  },
  appearance: class extends CSSProperty {
    static propertyExpression = ``
  },
  aspectRatio: class extends CSSProperty {
    static propertyExpression = ``
  },
  backdropFilter: class extends CSSProperty {
    static propertyExpression = ``
  },
  backfaceVisibility: class extends CSSProperty {
    static propertyExpression = ``
  },
  background: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundAttacment: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundBlendMode: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundClip: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundImage: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundOrigin: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundPosition: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundPositionX: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundPositionY: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundRepeat: class extends CSSProperty {
    static propertyExpression = ``
  },
  backgroundSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  blockSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  border: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockEndColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockEndSyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockEndWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockStartColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockStartStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockStartWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBlockWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBottom: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBottomColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBottomLeftRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBottomRightRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBottomStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderBottomWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderCollapse: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderEndEndRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderEndStartRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderImage: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderImageOutset: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderImageRepeat: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderImageSlice: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderImageSource: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderImageWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineEndColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineEndStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineEndWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineStartColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineStartStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineStartWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderInlineWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderLeft: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderLeftColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderLeftStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderLeftWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderRight: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderRightColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderRightStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderRightWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderSpacing: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderStartEndRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderStartStartRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderTop: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderTopColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderTopLeftRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderTopLeftRightRadius: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderTopStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderTopWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  borderWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  bottom: class extends CSSProperty {
    static propertyExpression = ``
  },
  boxDecorationBreak: class extends CSSProperty {
    static propertyExpression = ``
  },
  boxShadow: class extends CSSProperty {
    static propertyExpression = ``
  },
  boxSizing: class extends CSSProperty {
    static propertyExpression = ``
  },
  breakAfter: class extends CSSProperty {
    static propertyExpression = ``
  },
  breakBefore: class extends CSSProperty {
    static propertyExpression = ``
  },
  breakInside: class extends CSSProperty {
    static propertyExpression = ``
  },
  captionSide: class extends CSSProperty {
    static propertyExpression = ``
  },
  caretColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  clear: class extends CSSProperty {
    static propertyExpression = ``
  },
  clip: class extends CSSProperty {
    static propertyExpression = ``
  },
  clipPath: class extends CSSProperty {
    static propertyExpression = ``
  },
  color: class extends CSSProperty {
    static propertyExpression = ``
  },
  colorScheme: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnCount: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnFill: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnGap: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnRule: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnRuleColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnRuleStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnRuleWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnSpan: class extends CSSProperty {
    static propertyExpression = ``
  },
  columnWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  columns: class extends CSSProperty {
    static propertyExpression = ``
  },
  contain: class extends CSSProperty {
    static propertyExpression = ``
  },
  containIntrinsicBlockSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  containIntrinsicHeight: class extends CSSProperty {
    static propertyExpression = ``
  },
  containIntrinsicInlineSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  containIntrinsicSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  containIntrinsicWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  container: class extends CSSProperty {
    static propertyExpression = ``
  },
  containerName: class extends CSSProperty {
    static propertyExpression = ``
  },
  containerType: class extends CSSProperty {
    static propertyExpression = ``
  },
  content: class extends CSSProperty {
    static propertyExpression = ``
  },
  contentVisibility: class extends CSSProperty {
    static propertyExpression = ``
  },
  counterIncrement: class extends CSSProperty {
    static propertyExpression = ``
  },
  counterReset: class extends CSSProperty {
    static propertyExpression = ``
  },
  counterSet: class extends CSSProperty {
    static propertyExpression = ``
  },
  cursor: class extends CSSProperty {
    static propertyExpression = ``
  },
  direction: class extends CSSProperty {
    static propertyExpression = ``
  },
  display: class extends CSSProperty {
    static propertyExpression = ``
  },
  emptyCells: class extends CSSProperty {
    static propertyExpression = ``
  },
  filter: class extends CSSProperty {
    static propertyExpression = ``
  },
  flex: class extends CSSProperty {
    static propertyExpression = ``
  },
  flexBasis: class extends CSSProperty {
    static propertyExpression = ``
  },
  flexDirection: class extends CSSProperty {
    static propertyExpression = ``
  },
  flexFlow: class extends CSSProperty {
    static propertyExpression = ``
  },
  flexGrow: class extends CSSProperty {
    static propertyExpression = ``
  },
  flexShrink: class extends CSSProperty {
    static propertyExpression = ``
  },
  flexWrap: class extends CSSProperty {
    static propertyExpression = ``
  },
  float: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontFamily: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontFeatureSettings: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontKerning: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontLanguageOverride: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontOpticalSizing: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontPalette: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontSizeAdjust: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontStretch: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontSynthesis: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontSynthesisSmallCaps: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontSynthesisStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontSynthesisWeight: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariant: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantAlternates: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantCaps: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantEastAsian: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantEmoji: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantLigatures: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantNumeric: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantPosition: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariantSettings: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontVariationSettings: class extends CSSProperty {
    static propertyExpression = ``
  },
  fontWeight: class extends CSSProperty {
    static propertyExpression = ``
  },
  forcedColorAdjust: class extends CSSProperty {
    static propertyExpression = ``
  },
  gap: class extends CSSProperty {
    static propertyExpression = ``
  },
  grid: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridArea: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridAutoColumns: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridAutoFlow: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridAutoRows: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridColumn: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridColumnEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridColumnStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridRow: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridRowEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridRowStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridRowTemplate: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridRowTemplateAreas: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridRowTemplateColumns: class extends CSSProperty {
    static propertyExpression = ``
  },
  gridRowTemplateRows: class extends CSSProperty {
    static propertyExpression = ``
  },
  hangingPunctuation: class extends CSSProperty {
    static propertyExpression = ``
  },
  height: class extends CSSProperty {
    static propertyExpression = ``
  },
  hyphenateCharacter: class extends CSSProperty {
    static propertyExpression = ``
  },
  hyphenateLimitChars: class extends CSSProperty {
    static propertyExpression = ``
  },
  hyphens: class extends CSSProperty {
    static propertyExpression = ``
  },
  imageOrientation: class extends CSSProperty {
    static propertyExpression = ``
  },
  imageRendering: class extends CSSProperty {
    static propertyExpression = ``
  },
  imageResolution: class extends CSSProperty {
    static propertyExpression = ``
  },
  initialLetter: class extends CSSProperty {
    static propertyExpression = ``
  },
  initialLetterAlign: class extends CSSProperty {
    static propertyExpression = ``
  },
  inlineSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  inset: class extends CSSProperty {
    static propertyExpression = ``
  },
  insetBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  insetBlockEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  insetBlockStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  insetInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  insetInlineEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  insetInlineStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  isolation: class extends CSSProperty {
    static propertyExpression = ``
  },
  justifyContent: class extends CSSProperty {
    static propertyExpression = ``
  },
  justifyItems: class extends CSSProperty {
    static propertyExpression = ``
  },
  justifySelf: class extends CSSProperty {
    static propertyExpression = ``
  },
  justifyTracks: class extends CSSProperty {
    static propertyExpression = ``
  },
  left: class extends CSSProperty {
    static propertyExpression = ``
  },
  letterSpacing: class extends CSSProperty {
    static propertyExpression = ``
  },
  lineBreak: class extends CSSProperty {
    static propertyExpression = ``
  },
  lineHeight: class extends CSSProperty {
    static propertyExpression = ``
  },
  lineHeightStep: class extends CSSProperty {
    static propertyExpression = ``
  },
  listStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  listStyleImage: class extends CSSProperty {
    static propertyExpression = ``
  },
  listStylePosition: class extends CSSProperty {
    static propertyExpression = ``
  },
  listStyleType: class extends CSSProperty {
    static propertyExpression = ``
  },
  margin: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginBlockEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginBlockStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginBottom: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginInlineEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginInlineStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginLeft: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginRight: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginTop: class extends CSSProperty {
    static propertyExpression = ``
  },
  marginTrim: class extends CSSProperty {
    static propertyExpression = ``
  },
  mask: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskBorder: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskBorderMode: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskBorderOutset: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskBorderRepeat: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskBorderSlice: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskBorderSource: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskBorderWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskClip: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskComposite: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskImage: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskMode: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskOrigin: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskPosition: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskRepeat: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  maskType: class extends CSSProperty {
    static propertyExpression = ``
  },
  masonryAutoFlow: class extends CSSProperty {
    static propertyExpression = ``
  },
  mathDepth: class extends CSSProperty {
    static propertyExpression = ``
  },
  mathShift: class extends CSSProperty {
    static propertyExpression = ``
  },
  mathStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  maxBlockSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  maxHeight: class extends CSSProperty {
    static propertyExpression = ``
  },
  maxInlineSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  maxWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  minBlockSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  minHeight: class extends CSSProperty {
    static propertyExpression = ``
  },
  minInlineSize: class extends CSSProperty {
    static propertyExpression = ``
  },
  minWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  mixBlendMode: class extends CSSProperty {
    static propertyExpression = ``
  },
  objectFit: class extends CSSProperty {
    static propertyExpression = ``
  },
  objectPosition: class extends CSSProperty {
    static propertyExpression = ``
  },
  offset: class extends CSSProperty {
    static propertyExpression = ``
  },
  offsetAnchor: class extends CSSProperty {
    static propertyExpression = ``
  },
  offsetDistance: class extends CSSProperty {
    static propertyExpression = ``
  },
  offsetPath: class extends CSSProperty {
    static propertyExpression = ``
  },
  offsetPosition: class extends CSSProperty {
    static propertyExpression = ``
  },
  offsetRotate: class extends CSSProperty {
    static propertyExpression = ``
  },
  opacity: class extends CSSProperty {
    static propertyExpression = ``
  },
  order: class extends CSSProperty {
    static propertyExpression = ``
  },
  orphans: class extends CSSProperty {
    static propertyExpression = ``
  },
  outline: class extends CSSProperty {
    static propertyExpression = ``
  },
  outlineColor: class extends CSSProperty {
    static propertyExpression = ``
  },
  outlineOffset: class extends CSSProperty {
    static propertyExpression = ``
  },
  outlineStyle: class extends CSSProperty {
    static propertyExpression = ``
  },
  outlineWidth: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflow: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowAnchor: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowClipMargin: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowWrap: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowX: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowY: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowBehavior: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowBehaviorBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowBehaviorInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowBehaviorX: class extends CSSProperty {
    static propertyExpression = ``
  },
  overflowBehaviorY: class extends CSSProperty {
    static propertyExpression = ``
  },
  padding: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingBlockEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingBlockStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingBottom: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingInlineEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingInlineStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingLeft: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingRight: class extends CSSProperty {
    static propertyExpression = ``
  },
  paddingTop: class extends CSSProperty {
    static propertyExpression = ``
  },
  page: class extends CSSProperty {
    static propertyExpression = ``
  },
  pageBreakAfter: class extends CSSProperty {
    static propertyExpression = ``
  },
  pageBreakBefore: class extends CSSProperty {
    static propertyExpression = ``
  },
  pageBreakInside: class extends CSSProperty {
    static propertyExpression = ``
  },
  paintOrder: class extends CSSProperty {
    static propertyExpression = ``
  },
  perspective: class extends CSSProperty {
    static propertyExpression = ``
  },
  perspectiveOrigin: class extends CSSProperty {
    static propertyExpression = ``
  },
  placeContent: class extends CSSProperty {
    static propertyExpression = ``
  },
  placeItems: class extends CSSProperty {
    static propertyExpression = ``
  },
  placeSelf: class extends CSSProperty {
    static propertyExpression = ``
  },
  pointerEvents: class extends CSSProperty {
    static propertyExpression = ``
  },
  position: class extends CSSProperty {
    static propertyExpression = ``
  },
  printColorAdjust: class extends CSSProperty {
    static propertyExpression = ``
  },
  quotes: class extends CSSProperty {
    static propertyExpression = ``
  },
  resize: class extends CSSProperty {
    static propertyExpression = ``
  },
  right: class extends CSSProperty {
    static propertyExpression = ``
  },
  rotate: class extends CSSProperty {
    static propertyExpression = ``
  },
  rowGap: class extends CSSProperty {
    static propertyExpression = ``
  },
  rubyAlign: class extends CSSProperty {
    static propertyExpression = ``
  },
  rubyPosition: class extends CSSProperty {
    static propertyExpression = ``
  },
  scale: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollBehavior: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMargin: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginBlockEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginBlockStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginBottom: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginInlineEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginInlineStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginLeft: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginRight: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollMarginTop: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPadding: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingBlock: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingBlockEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingBlockStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingBottom: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingInline: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingInlineEnd: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingInlineStart: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingLeft: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingRight: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollPaddingTop: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollSnapAlign: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollSnapStop: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollSnapType: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollTimeline: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollTimelineAxis: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollTimelineName: class extends CSSProperty {
    static propertyExpression = ``
  },
  scrollbarColor: class extends CSSProperty {
    static propertyExpression = `auto | <color>`
  },
  scrollbarGutter: class extends CSSProperty {
    static propertyExpression = `auto | stable | both-edges`
  },
  scrollbarWidth: class extends CSSProperty {
    static propertyExpression = `auto | thin | none`
  },
  shapeImageThreshold: class extends CSSProperty {
    static propertyExpression = `<alpha-value>`
  },
  shapeMargin: class extends CSSProperty {
    static propertyExpression = `<length> | <percentage>`
  },
  shapeOutside: class extends CSSProperty {
    static propertyExpression = `none | [<basic-shape> || border-box | padding-box | content-box | margin-box] | <image>`
  },
  tabSize: class extends CSSProperty {
    static propertyExpression = `<number> | <length>`
  },
  tableLayout: class extends CSSProperty {
    static propertyExpression = `auto | fixed`
  },
  textAlign: class extends CSSProperty {
    static propertyExpression = `start | end | left | right | center | justify |match-parent | justify-all`
  },
  textAlignLast: class extends CSSProperty {
    static propertyExpression = `start | end | left | right | center | justify |match-parent`
  },
  textCombineUpright: class extends CSSProperty {
    static propertyExpression = `none | all | digits <integer>?`
  },
  textDecoration: class extends CSSProperty {
    static propertyExpression = ``
  },
  textDecorationColor: class extends CSSProperty {
    static propertyExpression = `<color>`
  },
  textDecorationLine: class extends CSSProperty {
    static propertyExpression = `none | [underline || overline || line-through || blink]`
  },
  textDecorationSkip: class extends CSSProperty {
    static propertyExpression = `none | objects | spaces | leading-spaces | trailing-spaces | edges | box-decoration`
  },
  textDecorationSkipInk: class extends CSSProperty {
    static propertyExpression = `none | auto | all`
  },
  textDecorationStyle: class extends CSSProperty {
    static propertyExpression = `solid | double | dotted | dashed | wavy`
  },
  textDecorationThickness: class extends CSSProperty {
    static propertyExpression = `auto | from-font | <length> | <percentage>`
  },
  textEmphasis: class extends CSSProperty {
    static propertyExpression = ``
  },
  textEmphasisColor: class extends CSSProperty {
    static propertyExpression = `<color>`
  },
  textEmphasisPosition: class extends CSSProperty {
    static propertyExpression = `[over | under] && [right | left]?`
  },
  textEmphasisStyle: class extends CSSProperty {
    static propertyExpression = `none | [ [filled | open] || [dot circle double-circle | triangle | sesame] ] | <string>`
  },
  textIndent: class extends CSSProperty {
    static propertyExpression = `<length-percentage> && hanging? && each-line?`
  },
  textJustify: class extends CSSProperty {
    static propertyExpression = `auto | none | inter-word | inter-character`
  },
  textOrientation: class extends CSSProperty {
    static propertyExpression = `mixed | upright | sideways | sideways-right | use-glyph-orientation`
  },
  textOverflow: class extends CSSProperty {
    static propertyExpression = `clip | ellipsis | <string> | fade | fade <length-percentage>`
  },
  textRendering: class extends CSSProperty {
    static propertyExpression = `auto | optimizeSpeed | optimizeLegibility | geometricPrecision`
  },
  textShadow: class extends CSSProperty {
    static propertyExpression = `none | [<color>? && <length>{2,3} ]#`
  },
  textSizeAdjust: class extends CSSProperty {
    static propertyExpression = `auto | none | <percentage>`
  },
  textTransform: class extends CSSProperty {
    static propertyExpression = `none | [capitalize | uppercase | lowercase] || full-width || full-size-kana | math-auto | math-bold | math-italic | math-bold-italic | math-double-struck | math-bold-fraktur | math-script | math-script | math-bold-script | math-fraktur | math-sans-serif | math-bold-sans-serif | math-sans-serif-italic | math-sans-serif-bold-italic | math-monospace | math-initial | math-tailed |math-looped | math-stretched`
  },
  textUnderlineOffset: class extends CSSProperty {
    static propertyExpression = `auto | <length> | <percentage>`
  },
  textUnderlinePosition: class extends CSSProperty {
    static propertyExpression = `auto | [under || [left | right]]`
  },
  textWrap: class extends CSSProperty {
    static propertyExpression = `wrap | nowrap | balance | stable | pretty`
  },
  timelineScope: class extends CSSProperty {
    static propertyExpression = `none | <dashed-ident>`
  },
  top: class extends CSSProperty {
    static propertyExpression = `<auto> | <length-percentage>`
  },
  touchAction: class extends CSSProperty {
    static propertyExpression = `auto | none | [[pan-x | pan-left | pan-right] || [pan-y | pan-up | pan-down] || pinch-zoom] | manipulation`
  },
  transform: class extends CSSProperty {
    static propertyExpression = `none | <transform-function>+`
  },
  transformBox: class extends CSSProperty {
    static propertyExpression = `content-box | border-box | fill-box | stroke-box | view-box`
  },
  transformOrigin: class extends CSSProperty {
    static propertyExpression = `[ left | center | right | top | bottom | <length-percentage> ]  |
    [ left | center | right | <length-percentage> ] [ top | center | bottom | <length-percentage> ] <length>?  |
    [ [ center | left | right ] && [ center | top | bottom ] ] <length>?`
  },
  transformStyle: class extends CSSProperty {
    static propertyExpression = `flat | preserve-3d`
  },
  transition: class extends CSSProperty {
    static propertyExpression = ``
  },
  transitionDelay: class extends CSSProperty {
    static propertyExpression = ``
  },
  transitionProperty: class extends CSSProperty {
    static propertyExpression = ``
  },
  transitionTimingFunction: class extends CSSProperty {
    static propertyExpression = ``
  },
  translate: class extends CSSProperty {
    static propertyExpression = `none | <length-percentage> [<length-percentage> <length>?]?`
  },
  unicodeBidi: class extends CSSProperty {
    static propertyExpression = `normal | embed | isolate | bide-override | isolate-override | plaintext`
  },
  userSelect: class extends CSSProperty {
    static propertyExpression = `auto | text | none | contain | all`
  },
  verticalAlign: class extends CSSProperty {
    static propertyExpression = `[first | last] || <alignment-baseline> || <baseline-shift>`
  },
  viewTimeline: class extends CSSProperty {
    static propertyExpression = ``
  },
  viewTimelineAxis: class extends CSSProperty {
    static propertyExpression = ``
  },
  viewTimelineInset: class extends CSSProperty {
    static propertyExpression = ``
  },
  viewTimelineName: class extends CSSProperty {
    static propertyExpression = ``
  },
  viewTransitionName: class extends CSSProperty {
    static propertyExpression = ``
  },
  visibility: class extends CSSProperty {
    static propertyExpression = `visible | hidden | collapse`
  },
  whiteSpace: class extends CSSProperty {
    static propertyExpression = `normal | pre | nowrap | pre-wrap | break-spaces | pre-line`
  },
  whiteSpaceCollapse: class extends CSSProperty {
    static propertyExpression = `collapse | preserve | preserve-breaks | preserve-spaces | break-spaces`
  },
  widows: class extends CSSProperty {
    static propertyExpression = `<integer>`
  },
  width: class extends CSSProperty {
    static propertyExpression = `auto | <length-percentage> | min-content | max-content | fit-content <length-percentage>`
  },
  willChange: class extends CSSProperty {
    static propertyExpression = `auto | [scroll-position | contents | custom-ident]#`
  },
  wordBreak: class extends CSSProperty {
    static propertyExpression = `normal | keep-all | break-all | break-word`
  },
  wordSpacing: class extends CSSProperty {
    static propertyExpression = `normal | <length>`
  },
  writingMode: class extends CSSProperty {
    static propertyExpression = `horizontal-tb | vertical-rl | vertical-lr | sideways-rl | sideways-lr`
  },
  zIndex: class extends CSSProperty {
    static propertyExpression = `auto | <integer> | inherit`
  },
}


const styleSpec: AttributeSpec & Record<string, any> = {
  default: undefined,
  properties: {...cssProperties}
}
