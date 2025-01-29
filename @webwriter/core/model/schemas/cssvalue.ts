import Color from "colorjs.io"
import {parser} from "./cssvalue.grammar"
import { MediaType } from "#model"
import { CSSValueDefinition, treeLog } from "./cssvaluedefinition"


function cssFunc(name: string, args: (CSSStyleValue | string | undefined)[], separator=" ") {
  return `${name}(${args.filter(a=>a).map(a => a!.toString()).join(separator)})`
}

function parseCssFunc(text: string, separator: string | RegExp=/\s+/): {name: string, args: string[]} {
  const [name, rawArgs] = text.slice(0, -1).split("(")
  const args = rawArgs.split(separator).map(arg => arg.trim())
  return {name, args}
}

function parseLengthOrPercentage(text: string) {
  if(text.includes("%")) {
    return CSSPercentageValue.parse(text)
  }
  else {
    return CSSLengthValue.parse(text)
  }
}

function parseAngleOrPercentage(text: string) {
  if(text.includes("%")) {
    return CSSPercentageValue.parse(text)
  }
  else {
    return CSSAngleValue.parse(text)
  }
}
  
// BASIC TYPES ////////////////////////////////////////////////////////////////

export class CSSStringValue implements CSSStyleValue {
  
  value: string

  constructor(value: string) {
    this.value = value
  }

  toString() {
    return '"' + this.value + '"'
  }

  static parse(cssText: string) {
    if(/(".*")|('.*')/.test(cssText)) {
      return new CSSStringValue(cssText.slice(1, -1))
    }
    else throw Error("Quotes are missing from CSS string")
  }
}
  
export class CSSColorValue implements CSSStyleValue {

  static systemColors = ["AccentColor", "AccentColorText", "ActiveText", "ButtonBorder", "ButtonFace", "ButtonText", "Canvas", "CanvasText", "Field", "FieldText", "GrayText", "Highlight", "HighlightText", "LinkText", "Mark", "MarkText", "SelectedItem", "SelectedItemText", "VisitedText"] as const

  static deprecatedSystemColors = ["ActiveBorder", "ActiveCaption", "AppWorkspace", "Background", "ButtonHighlight", "ButtonShadow", "CaptionText", "InactiveBorder", "InactiveCaption", "InactiveCaptionText", "InfoBackground", "InfoText", "Menu", "MenuText", "Scrollbar", "ThreeDDarkShadow", "ThreeDFace", "ThreeDHighlight", "ThreeDLightShadow", "ThreeDShadow", "Window", "WindowFrame", "WindowText"] as const

  #color: Color | typeof CSSColorValue["systemColors"][number] | typeof CSSColorValue["deprecatedSystemColors"][number]

  get value() {
    return this.toString()
  }

  constructor(color: Color | typeof CSSColorValue["systemColors"][number] | typeof CSSColorValue["deprecatedSystemColors"][number]) {
    this.#color = color
  }

  toString(options?: any) {
    return (this.#color.toString as any)(options)
  }

  static parse(cssText: string) {
    if(this.systemColors.includes(cssText as any) || this.deprecatedSystemColors.includes(cssText as any)) {
      return new CSSColorValue(cssText as any)
    }
    else {
      return new CSSColorValue(new (Color as any)(cssText))
    }
    
  }
}

export class CSSCustomIdentValue implements CSSStyleValue {
  constructor(
    readonly value: string
  ) {}

  toString() {
    return this.value
  }

  static parse(cssText: string) {
    return new this(cssText)
  }
}

export class CSSDashedIdentValue implements CSSStyleValue {
  constructor(
    readonly value: string
  ) {}

  toString() {
    return `--${this.value}`
  }

  static parse(cssText: string) {
    return new this(cssText.slice(2))
  }
}

export class CSSRatioValue implements CSSStyleValue {
  constructor(
    readonly a: number,
    readonly b: number
  ) {}

  toString() {
    return `${this.a}/${this.b}`
  }

  static parse(cssText: string) {
    const [a, b] = cssText.split("/").map(part => part.trim())
    return new this(parseInt(a), parseInt(b))
  }
}

export class CSSPositionValue implements CSSStyleValue {
  constructor(
    readonly originX: "left" | "center" | "right" = "center",
    readonly offsetX: CSSPercentageValue | CSSLengthValue = new CSSPercentageValue(0),
    readonly originY: "top" | "center" | "bottom" = "center", 
    readonly offsetY: CSSPercentageValue | CSSLengthValue = new CSSPercentageValue(0)
  ) {}

  toString() {
    return `${this.originX} ${this.offsetX} ${this.originY} ${this.offsetY}`
  }

  static parse(text: string) {
    const args = text.split(/\s+/)
    if(args.length === 1 && ["left", "center", "right"].includes(args[0])) {
      return new this(args[0] as any, undefined, undefined, undefined)
    }
    else if(args.length === 1 && ["top", "center", "bottom"].includes(args[0])) {
      return new this(undefined, undefined, args[0] as any, undefined)
    }
    else if(args.length === 1) {
      return new this("left", parseLengthOrPercentage(args[0]), args[0] as any, undefined)
    }
    else if(args.length === 2) {
      const originX = ["left", "center", "right"].includes(args[0])? args[0]: undefined
      const offsetX = ["left", "center", "right"].includes(args[0])? undefined: parseLengthOrPercentage(args[0])
      const originY = ["top", "center", "bottom"].includes(args[1])? args[1]: undefined
      const offsetY = ["top", "center", "bottom"].includes(args[1])? undefined: parseLengthOrPercentage(args[1])
      return new this(originX as any, offsetX, originY as any, offsetY)
    }
    else if(args.length === 4) {
      const originX = ["left", "center", "right"].includes(args[0]) && !["left", "center", "right"].includes(args[2])? args[0]: args[2]
      const offsetX = parseLengthOrPercentage(args[1])
      const originY = ["top", "center", "bottom"].includes(args[0]) && !["top", "center", "bottom"].includes(args[2])? args[0]: args[2]
      const offsetY = parseLengthOrPercentage(args[3])
      return new this(originX as any, offsetX, originY as any, offsetY)
    }
    else throw Error(`Invalid number of arguments`)
  }
}

// NUMERIC TYPES //////////////////////////////////////////////////////////////

export class CSSMathValue extends window.CSSMathValue {
  static parse(text: string): CSSMathValue {
    return (window.CSSMathValue as any).parse(`calc(${text})`)
  } 
}

export class CSSPercentageValue extends CSSUnitValue {

  static units = ["%"] 

  constructor(value: number) {
    super(value, "percent")
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(unit === "number") {
      return new CSSPercentageValue(value * 100)
    }
    else if(unit !== "percent") {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSPercentageValue(value)
    }
  }
}

export class CSSIntegerValue extends CSSUnitValue {

  static units = []
  
  constructor(value: number) {
    super(value, "number")
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new CSSIntegerValue(0)
    }
    else if(unit !== "number") {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else if(!Number.isInteger(value)) {
      throw TypeError(`Not an integer: ${value}`)
    }
    else {
      return new CSSIntegerValue(value)
    }
  }
}

export class CSSNumberValue extends CSSUnitValue {

  static units = []
  
  constructor(value: number) {
    super(value, "number")
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new CSSNumberValue(0)
    }
    else if(unit !== "number") {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSNumberValue(value)
    }
  }
}

export class CSSFlexValue extends CSSUnitValue {

  static units = ["fr"]
  
  constructor(value: number) {
    super(value, "fr")
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new CSSFlexValue(0)
    }
    else if(unit !== "fr") {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSFlexValue(value)
    }
  }
}

export class CSSLengthValue extends CSSUnitValue {

  static units = ["px", "pt", "cm", "mm", "em", "rem", "ch", "ex", "ic", "lh", "rcap", "rch", "rex", "ric", "rlh", "vh", "vw", "vmax", "vmin", "vb", "vi", "cap", "cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax", "Q", "in", "pc", "pt"] as const
  
  constructor(value: number, unit: typeof CSSLengthValue["units"][number]) {
    super(value, unit)
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new this(0, this.units[0])
    }
    else if(!CSSLengthValue.units.includes(unit as any)) {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSLengthValue(value, unit as typeof CSSLengthValue["units"][number])
    }
  }
}

export class CSSAngleValue extends CSSUnitValue {

  static units = ["deg", "grad", "rad", "turn"] as const
  
  constructor(value: number, unit: typeof CSSAngleValue["units"][number]) {
    super(value, unit)
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new this(0, this.units[0])
    }
    else if(!CSSAngleValue.units.includes(unit as any)) {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSAngleValue(value, unit as typeof CSSAngleValue["units"][number])
    }
  }
}

export class CSSTimeValue extends CSSUnitValue {

  static units = ["s", "ms"] as const
  
  constructor(value: number, unit: typeof CSSTimeValue["units"][number]) {
    super(value, unit)
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new this(0, this.units[0])
    }
    else if(!CSSTimeValue.units.includes(unit as any)) {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSTimeValue(value, unit as typeof CSSTimeValue["units"][number])
    }
  }
}

export class CSSFrequencyValue extends CSSUnitValue {

  static units = ["Hz", "kHz"] as const
  
  constructor(value: number, unit: typeof CSSFrequencyValue["units"][number]) {
    super(value, unit)
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new this(0, this.units[0])
    }
    else if(!CSSFrequencyValue.units.includes(unit as any)) {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSFrequencyValue(value, unit as typeof CSSFrequencyValue["units"][number])
    }
  }
}

export class CSSResolutionValue extends CSSUnitValue {

  static units = ["dpi", "dpcm", "dppx", "x"] as const
  
  constructor(value: number, unit: typeof CSSResolutionValue["units"][number]) {
    super(value, unit)
  }

  static parse(text: string) {
    const {value, unit} = CSSNumericValue.parse(text) as CSSUnitValue
    if(value === 0 && unit === "number") {
      return new this(0, this.units[0])
    }
    else if(!CSSResolutionValue.units.includes(unit as any)) {
      throw TypeError(`Invalid unit: ${unit}`)
    }
    else {
      return new CSSResolutionValue(value, unit as typeof CSSResolutionValue["units"][number])
    }
  }
}

// FUNCTION TYPES /////////////////////////////////////////////////////////////

export class CSSTransformValue extends window.CSSTransformValue {
  static parse(a: string, b?: string) { // @ts-ignore
   return super.parse(b? a: "transform", b ?? a) as CSSTransformValue
  }
}

export class CSSColorMixValue implements CSSStyleValue {
  colorSpace: "srgb" |"srgb-linear" | "display-p3" | "a98-rgb" | "prophoto-rgb" | "rec2020" | "lab" | "oklab" | "xyz" |"xyz-d50" | "xyz-d65" | "hsl" | "hwb" | "lch" | "oklch"
  hueInterpolation?: "shorter" | "longer" | "increasing" | "decreasing"

  colorA: CSSColorValue
  amountA?: CSSUnitValue
  colorB: CSSColorValue
  amountB?: CSSUnitValue

  constructor(colorSpace: CSSColorMixValue["colorSpace"], colorA: CSSColorValue, colorB: CSSColorValue, amountA?: CSSPercentageValue, amountB?: CSSPercentageValue, hueInterpolation?: CSSColorMixValue["hueInterpolation"]) {
    this.colorSpace = colorSpace
    this.colorA = colorA
    this.colorB = colorB
    this.amountA = amountA
    this.amountB = amountB
    this.hueInterpolation = hueInterpolation
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "color-mix") throw TypeError("Invalid function name")
    const [interpolationMethod, stopA, stopB] = args
    const [_, colorSpace, hueInterpolation, __] = interpolationMethod.split(/\s+/)
    if(_ !== "in" || __ !== undefined && __ !== "hue" || !["srgb", "srgb-linear",  "display-p3",  "a98-rgb",  "prophoto-rgb",  "rec2020",  "lab",  "oklab",  "xyz", "xyz-d50",  "xyz-d65",  "hsl",  "hwb",  "lch",  "oklch"].includes(colorSpace) || hueInterpolation && !["shorter", "longer", "increasing", "decreasing"].includes(hueInterpolation)) throw TypeError("Invalid argument syntax")
    const [colorA, amountA] = (stopA ?? "").split(/\s+/)
    const [colorB, amountB] = (stopB ?? "").split(/\s+/)
    return new CSSColorMixValue(
      colorSpace as any,
      CSSColorValue.parse(colorA),
      CSSColorValue.parse(colorB),
      CSSPercentageValue.parse(amountA),
      CSSPercentageValue.parse(amountB),
      hueInterpolation as any
    )
    
  }

  toString() {
    const interpolationMethod = `in ${this.colorSpace}${this.hueInterpolation? ` ${this.hueInterpolation} hue` :""}`
    const a = `${this.colorA}${this.amountA? ` ${this.amountA}`: ""}`
    const b = `${this.colorB}${this.amountB? ` ${this.amountB}`: ""}`
    return cssFunc("color-mix", [interpolationMethod, a, b], ",")
  }
}

export class CSSLightDarkValue implements CSSStyleValue {
  constructor(readonly a: CSSColorValue, readonly b: CSSColorValue) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "light-dark") throw TypeError("Invalid function name")
    return new CSSLightDarkValue(CSSColorValue.parse(args[0]), CSSColorValue.parse(args[1]))
  }

  toString() {
    return cssFunc("light-dark", [this.a, this.b], ",")
  }
}

export class CSSDeviceCmykValue implements CSSStyleValue {
  c: CSSPercentageValue
  m: CSSPercentageValue
  y: CSSPercentageValue
  k: CSSPercentageValue
  a?: CSSPercentageValue
  fallback?: CSSColorValue

  constructor(c: CSSPercentageValue, m: CSSPercentageValue, y: CSSPercentageValue, k: CSSPercentageValue, a?: CSSPercentageValue) {
    this.c = c
    this.m = m
    this.y = y
    this.k = k
    this.a = a
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "light-dark") throw TypeError("Invalid function name")
    else if(args.length === 1 || args.length === 2) {
      const [cmyk, a] = args[0].split("/")
      const [c, m, y, k] = cmyk.split(/\s+/)
      return new CSSDeviceCmykValue(CSSPercentageValue.parse(c), CSSPercentageValue.parse(m), CSSPercentageValue.parse(y), CSSPercentageValue.parse(k), a? CSSPercentageValue.parse(a): undefined)
    }
    else if(args.length === 4) {
      return new CSSDeviceCmykValue(...args.map(arg => CSSPercentageValue.parse(arg)) as [CSSPercentageValue, CSSPercentageValue, CSSPercentageValue, CSSPercentageValue])
    }
    else throw TypeError("Invalid number of arguments")
  }

  toString() {
    return cssFunc("device-cmyk", [this.c, this.m, this.y, this.k, this.a])
  }
}

export abstract class CSSImageValue implements CSSStyleValue {
  static parse(text: string) {
    const {name} = parseCssFunc(text)
    if(["url", "src"].includes(name)) {
      return CSSUrlValue.parse(text)
    }
    else if(name === "element") {
      return CSSElementValue.parse(text)
    }
    else if(name === "image-set") {
      return CSSImageSetValue.parse(text)
    }
    else if(name === "cross-fade") {
      return CSSCrossFadeValue.parse(text)
    }
    else if(["linear-gradient", "radial-gradient", "conic-gradient"].some(s => name.endsWith(s))) {
      return CSSGradientValue.parse(text)
    }
    else throw TypeError("Invalid function name")
  }
}

export abstract class CSSGradientValue extends CSSImageValue {

  static parse(text: string): CSSLinearGradientValue | CSSRadialGradientValue | CSSConicGradientValue {
    const {name} = parseCssFunc(text)
    if(name.endsWith("linear-gradient")) {
      return CSSLinearGradientValue.parse(text)
    }
    else if(name.endsWith("radial-gradient")) {
      return CSSRadialGradientValue.parse(text)
    }
    else if(name.endsWith("conic-gradient")) {
      return CSSConicGradientValue.parse(text)
    }
    else throw TypeError("Invalid function name")
  }
}

export class CSSLinearGradientValue extends CSSGradientValue {
  constructor(
    readonly stops: ({color: CSSColorValue, a?: CSSPercentageValue | CSSLengthValue, b?: CSSPercentageValue | CSSLengthValue} | {hint: CSSPercentageValue | CSSLengthValue})[],
    readonly repeating = false,
    readonly to?: CSSAngleValue | "left" | "right" | "top" | "bottom" | "top left" | "top right" | "bottom left" | "bottom right",
    readonly colorSpace: "srgb" |"srgb-linear" | "display-p3" | "a98-rgb" | "prophoto-rgb" | "rec2020" | "lab" | "oklab" | "xyz" |"xyz-d50" | "xyz-d65" | "hsl" | "hwb" | "lch" | "oklch" = "oklab",
    readonly hueInterpolation?: "shorter" | "longer" | "increasing" | "decreasing"
  ) {super()}

  toString() {
    const firstArg = [
      this.colorSpace
        ? `in ${this.colorSpace}` + this.hueInterpolation? ` ${this.hueInterpolation} hue`: ""
        : "",
      this.to instanceof CSSAngleValue
        ? this.to
        : (this.to? "to " + this.to: ""),
    ].join(" ").trim()
    return cssFunc(this.repeating? "repeating-linear-gradient": "linear-gradient", [firstArg, ...this], ",")
  }

  private static parseStop(text: string) {
    const [colorOrHint, a, b] = text.split(/\s+/)
    let isColor = false
    try {
      CSSColorValue.parse(colorOrHint)
      isColor = true
    } catch {}
    if(isColor && !a) {
      return {color: CSSColorValue.parse(colorOrHint)}
    }
    else if(isColor && a) {
      return {
        color: CSSColorValue.parse(colorOrHint),
        a: parseLengthOrPercentage(a)
      }
    }
    else if(isColor && b) {
      return {
        color: CSSColorValue.parse(colorOrHint),
        a: parseLengthOrPercentage(a),
        b: parseLengthOrPercentage(a)
      }
    }
    else {
      return {hint: parseLengthOrPercentage(colorOrHint)}
    }
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    let repeating = name === "repeating-linear-gradient"
    let hasInterpolationArg = true
    try {
      this.parseStop(args[0])
      hasInterpolationArg = false
    } catch {}
    if(!["linear-gradient", "repeating-linear-gradient"].includes(name)) throw Error("Invalid function name")
    else if(!args.length) throw Error("Invalid arguments")
    else {
      let to, colorSpace, hueInterpolation
      if(hasInterpolationArg) {
        const parts = args[0].split(/\s+/)
        const anglePart = parts.find(part => ["deg", "grad", "rad", "turn"].some(suffix => part.endsWith(suffix)))
        const angle = anglePart? CSSAngleValue.parse(anglePart): undefined
        const sideOrCorner = parts.filter(part => ["left", "right", "top", "bottom"].includes(part)).join(" ")
        to = angle? angle: sideOrCorner as Exclude<CSSLinearGradientValue["to"], CSSAngleValue>
        if(parts.includes("in")) {
          colorSpace = parts[parts.indexOf("in") + 1] as any
        }
        if(parts.includes("hue")) {
          hueInterpolation = parts[parts.indexOf("hue") - 1] as any
        }
      }
      let stops = args.slice(hasInterpolationArg? 1: 0).map(arg => this.parseStop(arg))
      return new this(stops, repeating, to, colorSpace, hueInterpolation)
    }
  }

  *[Symbol.iterator]() {
    for(const value of this.stops) {
      yield value
    }
  }

}

export class CSSRadialGradientValue extends CSSGradientValue {
  constructor(
    readonly stops: ({color: CSSColorValue, a?: CSSPercentageValue | CSSLengthValue} | {hint: CSSPercentageValue | CSSLengthValue})[],
    readonly repeating = false,
    readonly shape?: "circle" | "ellipse",
    readonly size?: "closest-corner" | "closest-side" | "farthest-corner" | "farthest-side" | CSSLengthValue | [CSSLengthValue | CSSPercentageValue, CSSLengthValue | CSSPercentageValue],
    readonly at?: CSSPositionValue
  ) {super()}

  toString() {
    const firstArg = [
      this.shape?.toString(),
      this.size?.toString(),
      this.at? "at " + this.at: undefined,
    ].filter(arg => arg).join(" ").trim()
    return cssFunc(this.repeating? "repeating-radial-gradient": "radial-gradient", [firstArg, ...this], ",")
  }

  private static parseStop(text: string) {
    const [colorOrHint, a] = text.split(/\s+/)
    let isColor = false
    try {
      CSSColorValue.parse(colorOrHint)
      isColor = true
    } catch {}
    if(isColor && !a) {
      return {color: CSSColorValue.parse(colorOrHint)}
    }
    else if(isColor && a) {
      return {
        color: CSSColorValue.parse(colorOrHint),
        a: parseLengthOrPercentage(a)
      }
    }
    else {
      return {hint: parseLengthOrPercentage(colorOrHint)}
    }
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    let repeating = name === "repeating-radial-gradient"
    let hasInterpolationArg = true
    try {
      this.parseStop(args[0])
      hasInterpolationArg = false
    } catch {}
    if(!["radial-gradient", "repeating-radial-gradient"].includes(name)) throw Error("Invalid function name")
    else if(!args.length) throw Error("Invalid arguments")
    else {
      let shape, size, at
      if(hasInterpolationArg) {
        const parts = args[0].split(/\s+/)
        shape = parts.find(v => v === "circle" || v === "ellipse")
        if(parts.includes("at")) {
          at = CSSPositionValue.parse(parts[parts.indexOf("at") + 1])
        }
        let radialSizeParts = parts
          .slice(0, parts.indexOf("at"))
          .filter(v => v !== "circle" && v !== "ellipse")
        if(radialSizeParts.length === 2) {
          size = [
            parseLengthOrPercentage(radialSizeParts[0]),
            parseLengthOrPercentage(radialSizeParts[1])
          ] as [CSSLengthValue | CSSPercentageValue, CSSLengthValue | CSSPercentageValue]
        }
        else if(["closest-corner", "closest-side", "farthest-corner", "farthest-side"].includes(radialSizeParts[0])) {
          size = radialSizeParts[0] as "closest-corner" | "closest-side" | "farthest-corner" | "farthest-side"
        }
        else {
          size = CSSLengthValue.parse(radialSizeParts[0])
        }
      }
      let stops = args.slice(hasInterpolationArg? 1: 0).map(arg => this.parseStop(arg))
      return new this(stops, repeating, shape, size, at)
    }
  }

  *[Symbol.iterator]() {
    for(const value of this.stops) {
      yield value
    }
  }
}

export class CSSConicGradientValue extends CSSGradientValue {
  constructor(
    readonly stops: ({color: CSSColorValue, a: CSSAngleValue | CSSPercentageValue, b?: CSSAngleValue | CSSPercentageValue} | {hint: CSSPercentageValue | CSSAngleValue})[],
    readonly repeating = false,
    readonly from?: CSSAngleValue,
    readonly at?: CSSPositionValue,
    readonly colorSpace: "srgb" |"srgb-linear" | "display-p3" | "a98-rgb" | "prophoto-rgb" | "rec2020" | "lab" | "oklab" | "xyz" |"xyz-d50" | "xyz-d65" | "hsl" | "hwb" | "lch" | "oklch" = "oklab",
    readonly hueInterpolation?: "shorter" | "longer" | "increasing" | "decreasing"
  ) {super()}

  toString() {
    const firstArg = [
      this.from? "from " + this.from: "",
      this.at? "at " + this.at: "",
      this.colorSpace
        ? `in ${this.colorSpace}` + this.hueInterpolation? ` ${this.hueInterpolation} hue`: ""
        : "",
    ].join(" ").trim()
    return cssFunc(this.repeating? "repeating-conic-gradient": "conic-gradient", [firstArg, ...this], ",")
  }

  private static parseStop(text: string) {
    const [colorOrHint, a, b] = text.split(/\s+/)
    let isColor = false
    try {
      CSSColorValue.parse(colorOrHint)
      isColor = true
    } catch {}
    if(isColor && a && !b) {
      return {
        color: CSSColorValue.parse(colorOrHint),
        a: parseAngleOrPercentage(a)
      }
    }
    else if(isColor && b) {
      return {
        color: CSSColorValue.parse(colorOrHint),
        a: parseAngleOrPercentage(a),
        b: parseAngleOrPercentage(a)
      }
    }
    else {
      return {hint: parseAngleOrPercentage(colorOrHint)}
    }
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    let repeating = name === "repeating-conic-gradient"
    let hasInterpolationArg = true
    try {
      this.parseStop(args[0])
      hasInterpolationArg = false
    } catch {}
    if(!["conic-gradient", "repeating-conic-gradient"].includes(name)) throw Error("Invalid function name")
    else if(!args.length) throw Error("Invalid arguments")
    else {
      let from, at, colorSpace, hueInterpolation
      if(hasInterpolationArg) {
        const parts = args[0].split(/\s+/)
        if(parts.includes("from")) {
          CSSAngleValue.parse(parts[parts.indexOf("from") + 1])
        }
        if(parts.includes("at")) {
          CSSAngleValue.parse(parts[parts.indexOf("at") + 1])
        }
        if(parts.includes("in")) {
          colorSpace = parts[parts.indexOf("in") + 1] as any
        }
        if(parts.includes("hue")) {
          hueInterpolation = parts[parts.indexOf("hue") - 1] as any
        }
      }
      let stops = args.slice(hasInterpolationArg? 1: 0).map(arg => this.parseStop(arg))
      return new this(stops, repeating, from, at, colorSpace, hueInterpolation)
    }
  }

  *[Symbol.iterator]() {
    for(const value of this.stops) {
      yield value
    }
  }
}

export class CSSFilterValue implements CSSStyleValue {}
export class CSSBlurValue extends CSSFilterValue {
  radius?: CSSLengthValue

  constructor(radius?: CSSLengthValue) {
    super()
    this.radius = radius
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "blur") throw TypeError("Invalid function name")
    const radius = CSSLengthValue.parse(args.join(""))
    return new CSSBlurValue(radius)
  }

  toString() {
    return cssFunc("blur", [this.radius])
  }
}
export class CSSBrightnessValue extends CSSFilterValue {
  amount?: CSSPercentageValue

  constructor(amount?: CSSPercentageValue) {
    super()
    this.amount = amount
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "brightness") throw TypeError("Invalid function name")
    const arg = args.join("")
    const amount = CSSPercentageValue.parse(arg)
    return new CSSBrightnessValue(amount)
  }

  toString() {
    return cssFunc("brightness", [this.amount])
  }
}

export class CSSContrastValue extends CSSFilterValue {
  amount?: CSSUnitValue

  constructor(amount?: CSSUnitValue) {
    super()
    this.amount = amount
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "contrast") throw TypeError("Invalid function name")
    const arg = args.join("")
    const amount = CSSPercentageValue.parse(arg)
    return new CSSContrastValue(amount)
  }

  toString() {
    return cssFunc("contrast", [this.amount])
  }
}

export class CSSDropShadowValue extends CSSFilterValue {

  constructor(
    readonly offsetX: CSSLengthValue,
    readonly offsetY: CSSLengthValue,
    readonly color?: CSSColorValue,
    readonly standardDeviation?: CSSLengthValue
  ) {super()}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "drop-shadow") throw TypeError("Invalid function name")
    let color, hasColor = false
    try {
      CSSColorValue.parse(args[0])
      hasColor = true
    } catch {}
    if(hasColor) {
       color = CSSColorValue.parse(args[0])
    }
    const [offsetX, offsetY, standardDeviation] = args
      .slice(hasColor? 1: 0)
      .map(arg => arg? CSSLengthValue.parse(arg): undefined)
      .filter(arg => arg)
    return new this(offsetX!, offsetY!, color, standardDeviation)
  }

  toString() {
    return cssFunc("drop-shadow", [this.color, this.offsetX, this.offsetY, this.standardDeviation])
  }
}

export class CSSGrayscaleValue extends CSSFilterValue {
  amount?: CSSUnitValue

  constructor(amount?: CSSUnitValue) {
    super()
    this.amount = amount
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "grayscale") throw TypeError("Invalid function name")
    const arg = args.join("")
    const amount = CSSPercentageValue.parse(arg)
    return new CSSGrayscaleValue(amount)
  }

  toString() {
    return cssFunc("grayscale", [this.amount])
  }
}

export class CSSHueRotateValue extends CSSFilterValue {
  angle?: CSSAngleValue

  constructor(angle?: CSSAngleValue) {
    super()
    this.angle = angle
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "hue-rotate") throw TypeError("Invalid function name")
    const angle = CSSAngleValue.parse(args.join(""))
    return new CSSBlurValue(angle)
  }

  toString() {
    return cssFunc("hue-rotate", [this.angle])
  }
}

export class CSSInvertValue extends CSSFilterValue {
  amount?: CSSPercentageValue

  constructor(amount?: CSSPercentageValue) {
    super()
    this.amount = amount
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "invert") throw TypeError("Invalid function name")
    const arg = args.join("")
    const amount = CSSPercentageValue.parse(arg)
    return new CSSInvertValue(amount)
  }

  toString() {
    return cssFunc("invert", [this.amount])
  }
}
export class CSSOpacityValue extends CSSFilterValue {
  amount?: CSSPercentageValue

  constructor(amount?: CSSPercentageValue) {
    super()
    this.amount = amount
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "opacity") throw TypeError("Invalid function name")
    const arg = args.join("")
    const amount = CSSPercentageValue.parse(arg)
    return new CSSOpacityValue(amount)
  }

  toString() {
    return cssFunc("opacity", [this.amount])
  }
}

export class CSSSepiaValue extends CSSFilterValue {
  amount?: CSSPercentageValue

  constructor(amount?: CSSPercentageValue) {
    super()
    this.amount = amount
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "sepia") throw TypeError("Invalid function name")
    const arg = args.join("")
    const amount = CSSPercentageValue.parse(arg)
    return new CSSSepiaValue(amount)
  }

  toString() {
    return cssFunc("sepia", [this.amount])
  }
}

export class CSSSaturateValue extends CSSFilterValue {
  amount?: CSSPercentageValue

  constructor(amount?: CSSPercentageValue) {
    super()
    this.amount = amount
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "saturate") throw TypeError("Invalid function name")
    const arg = args.join("")
    const amount = CSSPercentageValue.parse(arg)
    return new CSSSaturateValue(amount)
  }

  toString() {
    return cssFunc("saturate", [this.amount])
  }
}

type CSSSymbol = {
  type: "cyclic" | "numeric" | "alphabetic" | "symbolic" | "fixed"
}

export class CSSCounterValue implements CSSStyleValue {
  name: string
  style?: string | CSSSymbolsValue | "none" | "disc" | "circle" | "square" | "decimal" | "cjk-decimal" | "decimal-leading-zero" | "lower-roman" | "upper-roman" | "lower-greek" | "lower-alpha" | "upper-alpha" | "arabic-indic" | "armenian" | "cambodian" | "cjk-earthly-branch" | "cjk-heavenly-stem" | "cjk-ideographic" | "devanagari" | "ethiopic-numeric" | "georgian" | "gujarati" | "gurmukhi" | "hebrew" | "hiragana" | "hiragana-iroha" | "japanese-formal" | "japanese-informal" | "kannada" | "katakana" | "katakana-iroha" | "korean-hangul-formal" | "korean-hanja-informal" | "lao" | "lower-armenian" | "malayalam" | "mongolian" | "myanmar" | "oriya" | "persian" | "simp-chinese-formal" | "simp-chinese-informal" | "tamil" | "telugu" | "thai" | "tibetan" | "trad-chinese-formal" | "trad-chinese-informal" | "upper-armenian" | "disclosure-open" | "disclosure-closed"
  separator?: string

  isCounters() {
    return !!this.separator
  }

  constructor(name: string, separator?: string, style?: CSSCounterValue["style"]) {
    this.name = name
    this.separator = separator
    this.style = style
  }

  static parseCounterStyle(text: string) {
    let counterStyle: CSSCounterValue["style"]
    if(CSSSymbolsValue.is(text)) {
      counterStyle = CSSSymbolsValue.parse(text)
    }
    else if(["none", "disc", "circle", "square", "decimal", "cjk-decimal", "decimal-leading-zero", "lower-roman", "upper-roman", "lower-greek", "lower-alpha", "upper-alpha", "arabic-indic", "armenian", "cambodian", "cjk-earthly-branch", "cjk-heavenly-stem", "cjk-ideographic", "devanagari", "ethiopic-numeric", "georgian", "gujarati", "gurmukhi", "hebrew", "hiragana", "hiragana-iroha", "japanese-formal", "japanese-informal", "kannada", "katakana", "katakana-iroha", "korean-hangul-formal", "korean-hanja-informal", "lao", "lower-armenian", "malayalam", "mongolian", "myanmar", "oriya", "persian", "simp-chinese-formal", "simp-chinese-informal", "tamil", "telugu", "thai", "tibetan", "trad-chinese-formal", "trad-chinese-informal", "upper-armenian", "disclosure-open", "disclosure-closed", undefined].includes(text)) {
      counterStyle = text
    }
    return counterStyle
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "counter" && name !== "counters") throw TypeError("Invalid function name")
    else if(args.length === 1 && name === "counter") {
      return new CSSCounterValue(args[0])
    }
    else if(args.length === 2 && name === "counter") {
      return new CSSCounterValue(args[0], args[1])
    }
    else if(args.length === 2 && name === "counters") {
      const counterStyle = this.parseCounterStyle(args[1])
      return new CSSCounterValue(args[0], undefined, counterStyle)
    }
    else if(args.length === 3 && name === "counters") {
      const counterStyle = this.parseCounterStyle(args[1])
      return new CSSCounterValue(args[0], args[1], counterStyle)
    }
    else throw Error("Invalid number of arguments for counter or counters.")
  }

  toString() {
    return this.separator? cssFunc("counters", [this.name, this.separator, this.style]): cssFunc("counter", [this.name, this.style], ",")
  }
}

export class CSSSymbolsValue implements CSSStyleValue {
  type: "cyclic" | "numeric" | "alphabetic" | "symbolic" | "fixed" = "symbolic"
  #values: (CSSStringValue | CSSImageValue)[] = []

  constructor(values: CSSStyleValue[], type: CSSSymbolsValue["type"] = "symbolic") {
    if(values.length < 1) {
      throw TypeError("CSSSymbolsValue needs at least one value")
    }
    this.#values = values
    this.type = type
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "symbols") throw TypeError("Invalid function name")
    else if(["cyclic", "numeric", "alphabetic", "symbolic", "fixed"].includes(args[0])) {
      return new CSSSymbolsValue(args.slice(1), args[0] as CSSSymbolsValue["type"])
    }
    else if(args.every(arg => arg.startsWith("'") || arg.startsWith('"'))) {
      return new CSSSymbolsValue(args)
    }
    else throw Error("Invalid arguments for symbols")
  }

  static is(text: string) {
    try {
      this.parse(text)
      return true
    } catch {return false}
  }

  toString() {
    return cssFunc("symbols", [this.type, ...this])
  }

  *[Symbol.iterator]() {
    for(const value of this.#values) {
      yield value
    }
  }
}


export class CSSCircleValue implements CSSStyleValue {
  r?: CSSLengthValue | CSSPercentageValue | "closest" | "farthest"
  position?: CSSPositionValue

  constructor(r?: CSSLengthValue | "closest" | "farthest", position?: CSSPositionValue) {
    this.r = r
    this.position = position
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, "at")
    if(name !== "circle") throw TypeError("Invalid function name")
    else if(args.length === 2) {
      return new this(
        ["closest", "farthest"].includes(args[0])
          ? args[0] as "closest" | "farthest"
          : parseLengthOrPercentage(args[0]),
        CSSPositionValue.parse(args[1])
      )
    }
    else if(args.length === 1 && text.includes("at ")) {
      return new this(undefined, CSSPositionValue.parse(args[1]))
    }
    else if(args.length === 1) {
      return new this(["closest", "farthest"].includes(args[0])? args[0] as "closest" | "farthest": CSSLengthValue.parse(args[0]))
    }
    else {
      throw TypeError("Invalid arguments")
    }
  }

  toString() {
    const r = this.r? `${this.r}`: ""
    const position = this.position? `at ${this.position}`: ""
    return cssFunc("circle", [r, position])
  }
}

export class CSSEllipseValue implements CSSStyleValue {
  r1?: CSSLengthValue | CSSPercentageValue | "closest-corner" | "closest-side" | "farthest-corner" | "farthest-side"
  r2?: CSSLengthValue | CSSPercentageValue | "closest-corner" | "closest-side" | "farthest-corner" | "farthest-side"
  position?: CSSPositionValue

  constructor(r1?: CSSEllipseValue["r1"], r2?: CSSEllipseValue["r2"], position?: CSSPositionValue) {
    this.r1 = r1
    this.r2 = r2
    this.position = position
  }

  static parseRadialExtent(text: string) {
    if(["closest-corner", "closest-side", "farthest-corner", "farthest-side"].includes(text)) {
      return text as "closest-corner" | "closest-side" | "farthest-corner" | "farthest-side"
    }
    else {
      return parseLengthOrPercentage(text)
    }
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, "at")
    if(name !== "circle") throw TypeError("Invalid function name")
    else if(args.length === 2) {
      const [r1, r2] = args[0].split(/\s+/).map(r => r? this.parseRadialExtent(r): undefined)
      return new this(r1, r2 ?? r1, CSSPositionValue.parse(args[1]))
    }
    else if(args.length === 1 && text.includes("at ")) {
      return new this(undefined, undefined, CSSPositionValue.parse(args[1]))
    }
    else if(args.length === 1) {
      const [r1, r2] = args[0].split(/\s+/).map(r => r? this.parseRadialExtent(r): undefined)
      return new this(r1, r2 ?? r1)
    }
    else {
      throw TypeError("Invalid arguments")
    }
  }

  toString() {
    const position = this.position? `at ${this.position}`: undefined
    return cssFunc("circle", [this.r1, this.r2, position])
  }
}

export class CSSRectValue implements CSSStyleValue {
  constructor(
    readonly shape: {top: CSSLengthValue | CSSPercentageValue, right: CSSLengthValue | CSSPercentageValue, bottom: CSSLengthValue | CSSPercentageValue, left: CSSLengthValue | CSSPercentageValue} | {x: CSSLengthValue | CSSPercentageValue, y: CSSLengthValue | CSSPercentageValue, w: CSSLengthValue | CSSPercentageValue, h: CSSLengthValue | CSSPercentageValue},
    readonly borderRadiusTopLeftR1?: CSSLengthValue | CSSPercentageValue,
    readonly borderRadiusTopLeftR2?: CSSLengthValue | CSSPercentageValue,
    readonly borderRadiusTopRightR1?: CSSLengthValue | CSSPercentageValue,
    readonly borderRadiusTopRightR2?: CSSLengthValue | CSSPercentageValue,
    readonly borderRadiusBottomRightR1?: CSSLengthValue | CSSPercentageValue,
    readonly borderRadiusBottomRightR2?: CSSLengthValue | CSSPercentageValue,
    readonly borderRadiusBottomLeftR1?: CSSLengthValue | CSSPercentageValue,
    readonly borderRadiusBottomLeftR2?: CSSLengthValue | CSSPercentageValue,
    readonly inset = false
  ) {}

  get borderRadiusString() {
    const r1 = [this.borderRadiusTopLeftR1, this.borderRadiusTopRightR1, this.borderRadiusBottomRightR1, this.borderRadiusBottomLeftR1].filter(el => el)
    const r2 = [this.borderRadiusTopLeftR2, this.borderRadiusTopRightR2, this.borderRadiusBottomRightR2, this.borderRadiusBottomLeftR2].filter(el => el)
    return [...r1, ...r2].length
      ? undefined
      : `${r1.join(" ")}` + r2.length? "/ " + r2.join(" "): ""
  }

  get shapeString() {
    return "x" in this.shape
      ? `${this.shape.x} ${this.shape.y} ${this.shape.w} ${this.shape.h}`
      : `${this.shape.top} ${this.shape.right} ${this.shape.bottom} ${this.shape.left}`
  }

  static parseBorderRadius(text: string) {
    const [r1, r2] = text.split(/\s+\/\s+/)
    const [a1, b1, c1, d1] = r1.split(/\s+/).map(r => r? parseLengthOrPercentage(r): undefined)
    const [a2, b2, c2, d2] = r2.split(/\s+/).map(r => r? parseLengthOrPercentage(r): undefined)
    return [
      a1,
      a2,
      b1 ?? a1,
      b2 ?? a2,
      c1 ?? a1,
      c2 ?? a2,
      d1 ?? b1 ?? a1,
      d2 ?? b2 ?? a2,
    ]
  }

  static parseShape(text: string, type:"rect" | "inset" | "xywh") {
    const [a, b, c, d] = text.split(/\s+/).map(r => r? parseLengthOrPercentage(r): undefined)
    return type === "xywh"
      ? {x: a!, y: b!, w: c!, h: d!}
      : {top: a!, right: b ?? a!, bottom: c ?? a!, left: d ?? b ?? a!}
  }

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(!["rect", "inset", "xywh"].includes(name)) throw TypeError("Invalid function name")
    const shape = args.slice(0, args.indexOf("round")).join(" ")
    const rs = args.slice(args.indexOf("round") + 1).join(" ")
    const [a1, a2, b1, b2, c1, c2, d1, d2] = this.parseBorderRadius(rs)
    return new this(this.parseShape(shape, name as "rect" | "inset" | "xywh"), a1, a2, b1, b2, c1, c2, d1, d2, name === "inset")
  }

  toString() {
    return cssFunc("x" in this.shape? "xywh": (this.inset? "inset": "rect"), [this.shapeString? this.shapeString: undefined, this.borderRadiusString? "round " + this.borderRadiusString: undefined])
  }
}

export class CSSPolygonValue implements CSSStyleValue {

  constructor(
    readonly vertices: [CSSLengthValue | CSSPercentageValue, CSSLengthValue | CSSPercentageValue][],
    readonly rounding?: CSSLengthValue,
    readonly fillRule?: "nonzero" | "evenodd"
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "polygon") throw TypeError("Invalid function name")
    const prefix = ["nonzero", "evenodd", "round "].some(s => args[0].includes(s))? args[0]: undefined
    let rounding, fillRule
    if(prefix?.includes("round ")) {
      const [_, r] = prefix.split("round ")
      rounding = CSSLengthValue.parse(r)
    }
    if(prefix?.includes("nonzero")) {
      fillRule = "nonzero"
    }
    else if(prefix?.includes("evenodd")) {
      fillRule = "evenodd"
    }
    const vertices = args.slice(prefix? 1: 0).map(vstr => vstr.split(/\s+/)).map(([v1, v2]) => [parseLengthOrPercentage(v1), parseLengthOrPercentage(v2)] as const)
    return new this(vertices as any, rounding, fillRule as any)
  }

  toString() {
    const prefix = this.fillRule? `${this.fillRule}` + (this.rounding? `round ${this.rounding}`: ""): ""
    return cssFunc("polygon", [prefix, ...this.vertices.map(([x, y]) => `${x} ${y}`)], ", ")
  }
}

export class CSSPathValue implements CSSStyleValue {

  constructor(readonly path: string, readonly fillRule?: "nonzero" | "evenodd") {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "path") throw TypeError("Invalid function name")
    let fillRule: "nonzero" | "evenodd" | undefined
    if(args[0]?.includes("nonzero")) {
      fillRule = "nonzero"
    }
    else if(args[0]?.includes("evenodd")) {
      fillRule = "evenodd"
    }
    const path = args[fillRule? 1: 0].slice(1, -1)
    return new this(path, fillRule)
  }

  toString() {
    return cssFunc("path", [this.fillRule, `"${this.path}"`], ", ")
  }
}

export class CSSAttrValue implements CSSStyleValue {
  constructor(
    readonly name: string,
    readonly type?: "string" | "ident" | "color" | "number" | "percentage" | "length" | "angle" | "time" | "frequency" | "url" | "flex" | "em" | "ex" | "px" | "rem" | "vw" | "vh" | "vmin" | "vmax" | "mm" | "cm" | "in" | "pt" | "pc" | "deg" | "grad" | "rad" | "time" | "s" | "ms" | "Hz" | "kHz" | "%",
    readonly fallback?: CSSStyleValue  
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "attr") throw TypeError("Invalid function name")
    const [attrName, type] = args[0].split(/\s+/)
    const fallback = args[1]? [...CSSCompositeValue.parse(args[1])][0]: undefined
    return new this(attrName!, type as CSSAttrValue["type"], fallback)
  }

  toString() {
    const namePart = [this.name, ...(this.type ? [this.type]: [])].map(v => v.toString()).join(" ")
    return cssFunc("attr", [namePart, this.fallback], ", ")
  }
}

export class CSSEnvValue implements CSSStyleValue {
  constructor(
    readonly name: string,
    readonly dimensions?: CSSIntegerValue[],
    readonly fallback?: CSSStyleValue  
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "attr") throw TypeError("Invalid function name")
    const [varName, ...dimensionParts] = args[0].split(/\s+/)
    const dimensions = dimensionParts.map(part => CSSIntegerValue.parse(part))
    const fallback = args[1]? [...CSSCompositeValue.parse(args[1])][0]: undefined
    return new this(varName!, dimensions, fallback)
  }

  toString() {
    const namePart = [this.name, ...(this.dimensions ?? [])].map(v => v.toString()).join(" ")
    return cssFunc("env", [namePart, this.fallback], ", ")
  }
}

export class CSSUrlValue implements CSSStyleValue {
  constructor(
    readonly value: string,
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "url") throw TypeError("Invalid function name")
    return new this(args[0].slice(args[0].startsWith('"')? 1: 0, args[0].endsWith('"')? -1: undefined))
  }

  toString() {
    return cssFunc("url", [this.value])
  }
}

export class CSSVarValue implements CSSStyleValue {
  constructor(
    readonly value: string,
    readonly fallback?: CSSStyleValue
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "var") throw TypeError("Invalid function name")
    const attrName = args[0]
    const fallback = args[1]? [...CSSCompositeValue.parse(args[1])][0]: undefined
    return new this(attrName, fallback)
  }

  toString() {
    return cssFunc("var", [this.value, this.fallback], ", ")
  }
}

export class CSSFitContentValue implements CSSStyleValue {
  constructor(readonly value: CSSLengthValue | CSSPercentageValue) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "fit-content") throw TypeError("Invalid function name")
    return new this(parseLengthOrPercentage(args.join(" ")))
  }

  toString() {
    return cssFunc("fit-content", [this.value])
  }
}

export class CSSMinMaxValue implements CSSStyleValue {
  constructor(
    readonly min: CSSLengthValue | CSSPercentageValue | CSSFlexValue | "min-content" | "max-content" | "auto",
    readonly max: CSSLengthValue | CSSPercentageValue | CSSFlexValue | "min-content" | "max-content" | "auto",
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "minmax") throw TypeError("Invalid function name")
    const [min, max] = args.map(arg => {
      if(["min-content", "max-content", "auto"].includes(arg)) {
        return arg as "min-content" | "max-content" | "auto"
      }
      else if(arg.endsWith("fr")) {
        return CSSFlexValue.parse(arg)
      }
      else {
        return parseLengthOrPercentage(arg)
      }
    })
    return new this(min, max)
  }

  toString() {
    return cssFunc("minmax", [this.min, this.max], ", ")
  }
}

export class CSSRepeatValue implements CSSStyleValue {
  constructor(
    readonly count: CSSIntegerValue | "auto-fill" | "auto-fit",
    readonly tracks: {
      names?: string[],
      size: CSSLengthValue | CSSPercentageValue | CSSFlexValue | CSSMinMaxValue | CSSFitContentValue | "min-content" | "max-content"
    }[]
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "repeat") throw TypeError("Invalid function name")
    const count = ["auto-fill", "auto-fit"].includes(args[0])? args[0] as "auto-fill" | "auto-fit": CSSIntegerValue.parse(args[0])
    const tracks: CSSRepeatValue["tracks"] = []
    for(const token of args[1].split(/\s+/)) {
      if(token.startsWith("[") && tracks.length) {
        tracks.at(-1)!.names = token.slice(1, -1).split(/\s+/)
      }
      else {
        let size: CSSRepeatValue["tracks"][number]["size"]
        if(["min-content", "max-content"].includes(token)) {
          size = token as "min-content" | "max-content"
        }
        else if(token.endsWith("fr")) {
          size = CSSFlexValue.parse(token)
        } 
        else if(token.startsWith("min-max(")) {
          size = CSSMinMaxValue.parse(token)
        }
        else if(token.startsWith("fit-content(")) {
          size = CSSFitContentValue.parse(token)
        }
        else {
          size = parseLengthOrPercentage(token)
        }
        tracks.push({size})
      }
    }
    return new this(count, tracks)
  }

  toString() {
    const tracks = this.tracks.map(track => `${track.size}` + (track.names?.length? ` [${track.names.join(" ")}]`: "")).join(" ")
    return cssFunc("repeat", [this.count, tracks], ", ")
  }
}

export class CSSLinearValue implements CSSStyleValue {
  constructor(
    readonly stops: {point: CSSNumberValue, start?: CSSPercentageValue, end?: CSSPercentageValue}[]
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "linear") throw TypeError("Invalid function name")
    const stops = args.map(arg => {
      const parts = arg.split(/\s+/)
      let point = CSSNumberValue.parse(parts.find(part => !part.endsWith("%"))!)
      let start = CSSPercentageValue.parse(parts.find(part => part.endsWith("%"))!)
      let end = CSSPercentageValue.parse(parts.reverse().find(part => part.endsWith("%"))!)
      return {point, start, end}
    })
    return new this(stops)
  }

  toString() {
    return cssFunc("linear", this.stops.map(stop => `${stop.point} ${stop.start} ${stop.end}`), ", ")
  }
}

export class CSSCubicBezierValue implements CSSStyleValue {
  constructor(
    readonly x1: CSSNumberValue,
    readonly y1: CSSNumberValue,
    readonly x2: CSSNumberValue,
    readonly y2: CSSNumberValue
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "cubic-bezier") throw TypeError("Invalid function name")
    const [x1, y1, x2, y2] = args.map(a => CSSNumberValue.parse(a))
    return new this(x1, y1, x2, y2)
  }

  toString() {
    return cssFunc("cubic-bezier", [this.x1, this.y1, this.x2, this.y2], ", ")
  }
}

export class CSSStepsValue implements CSSStyleValue {
  constructor(
    readonly amount: CSSNumberValue,
    readonly stepPosition?: "jump-start" | "start" | "jump-end" | "end" | "jump-none" | "jump-both"
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "steps") throw TypeError("Invalid function name")
    const amount = CSSNumberValue.parse(args[0])
    let stepPosition
    if(args[1]) {
      stepPosition = args[1] as CSSStepsValue["stepPosition"]
    }
    return new this(amount, stepPosition)
  }

  toString() {
    return cssFunc("steps", [this.amount, this.stepPosition], ", ")
  }
}

export class CSSElementValue implements CSSStyleValue {
  constructor(readonly id: string) {}

  static parse(text: string): CSSElementValue {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "element") throw TypeError("Invalid function name")
    return new this(args.join(""))
  }

  toString() {
    return cssFunc("element", [this.id])
  }
}

export class CSSImageSetValue implements CSSStyleValue {
  constructor(
    readonly values: {image: CSSImageValue, resolution?: CSSResolutionValue, type?: MediaType}[]
  ) {}

  static parse(text: string): CSSImageSetValue {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "image-set") throw TypeError("Invalid function name")
    const values = args.map(arg => {
      const parts = arg.split(/\s+/)
      const image = CSSImageValue.parse(parts[0])
      const resolutionPart = parts.find(part => !part.startsWith("type("))
      const resolution = resolutionPart? CSSResolutionValue.parse(resolutionPart): undefined
      const typePart = parts.find(part => !part.startsWith("type("))?.slice('type("'.length, '")'.length)
      const type = typePart? new MediaType(typePart): undefined
      return {image, resolution, type}
    })
    return new this(values)
  }

  toString() {
    const values = this.values.map(v => {
      const parts = [v.image, v.resolution, v.type].filter(p => p)
      return parts.join(" ")
    })
    return cssFunc("image-set", values, ", ")
  }
}

export class CSSCrossFadeValue implements CSSStyleValue {
  constructor(
    readonly stops: {value: CSSColorValue | CSSImageValue, opacity?: CSSPercentageValue}[]
  ) {}

  static parse(text: string): CSSCrossFadeValue {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "cross-fade") throw TypeError("Invalid function name")
    const stops = args.map(arg => {
      const [valuePart, opacityPart] = arg.split(/\s+/)
      let value
      try {
        value = CSSColorValue.parse(valuePart)
      }
      catch {
        value = CSSImageValue.parse(valuePart)
      }
      let opacity
      if(opacityPart) {
        opacity = CSSPercentageValue.parse(opacityPart)
      }
      return {value, opacity}
    })
    return new this(stops)
  }

  toString() {
    return cssFunc("cross-fade", this.stops.map(stop => `${stop.value}${stop.opacity? " " + stop.opacity: ""}`), ", ")
  }
}

export class CSSPaintValue implements CSSStyleValue {
  constructor(
    readonly name: string,
    readonly values: CSSStyleValue[] = []
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "paint") throw TypeError("Invalid function name")
    const paintName = args[1]
    const values = args.slice(1).map(arg => [...CSSCompositeValue.parse(arg)][0])
    return new this(paintName, values)
  }

  toString() {
    return cssFunc("paint", [this.name, ...this.values], ", ")
  }
}

export class CSSLeaderValue implements CSSStyleValue {
  constructor(
    readonly type: "dotted" | "solid" | "space" | CSSStringValue
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "leader") throw TypeError("Invalid function name")
    const type = args[1]
    return new this(type as any)
  }

  toString() {
    return cssFunc("leader", [this.type])
  }
}

export class CSSAddValue implements CSSStyleValue {
  constructor(
    readonly depth: CSSIntegerValue
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "add") throw TypeError("Invalid function name")
    const depth = CSSIntegerValue.parse(args[1])
    return new this(depth)
  }

  toString() {
    return cssFunc("add", [this.depth])
  }
}

export class CSSAnchorSizeValue implements CSSStyleValue {
  constructor(
    readonly name?: string,
    readonly size?: "width" | "height" | "block" | "inline" | "self-block" | "self-inline",
    readonly fallback?: CSSLengthValue | CSSPercentageValue,
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "anchor-size") throw TypeError("Invalid function name")
    const [anchorName, size] = args[0].split(/\w+/)
    let fallback
    if(args[1]) {
      fallback = parseLengthOrPercentage(args[1])
    }
    return new this(anchorName, size as any, fallback)
  }

  toString() {
    const prefix = [this.name, this.size].filter(v => v).join(" ")
    return cssFunc("anchor-size", [prefix, this.fallback], ", ")
  }
}

export class CSSAlternativeGlyphValue implements CSSStyleValue {
  constructor(
    readonly type: "stylistic" | "styleset" | "character-variant" | "swash" | "ornament" | "annotation",
    readonly names: string[]
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(!["stylistic", "styleset", "character-variant", "swash", "ornament", "annotation"].includes(name)) throw TypeError("Invalid function name")
    return new this(name as any, args)
  }

  toString() {
    return cssFunc(this.type, this.names, ", ")
  }
}

export class CSSViewValue implements CSSStyleValue {
  constructor(
    readonly axis?: "block" | "inline" | "x" | "y",
    readonly insets?: ["auto" | CSSLengthValue | CSSPercentageValue, "auto" | CSSLengthValue | CSSPercentageValue | undefined][]
  ) {}

  static parse(text: string) {
    let {name, args} = parseCssFunc(text, ",")
    if(name !== "view") throw TypeError("Invalid function name")
    let axis
    if(args[0].startsWith("block") || args[0].startsWith("inline") || args[0].startsWith("x") || args[0].startsWith("y")) {
      axis = args[0].split(/\s+/)[0]
      args = [args[0].split(/\s+/).slice(1).join(), ...args]
    }
    else if(args.at(-1)!.endsWith("block") || args.at(-1)!.endsWith("inline") || args.at(-1)!.endsWith("x") || args.at(-1)!.endsWith("y")) {
      axis = args.at(-1)!.split(/\s+/).at(-1)!
      args = [args.at(-1)!.split(/\s+/).slice(0, -1).join(), ...args]
    }
    const insets = args.map(arg => arg.split(/\s+/).map(v => v && (v === "auto"? "auto": parseLengthOrPercentage(v))))
    return new this(axis as any, insets as any)
  }

  toString() {
    const insets = this.insets?.map(([a, b]) => `${a}${b? " "+b: ""}`).join(", ")
    return cssFunc("view", [this.axis, insets])
  }
}

export class CSSScrollValue implements CSSStyleValue {
  constructor(
    readonly scroller: "root" | "nearest" | "self",
    readonly axis: "block" | "inline" | "x" | "y"
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text)
    if(name !== "scroll") throw TypeError("Invalid function name")
    const scroller = args.find(arg => ["root", "nearest", "self"].includes(arg))
    const axis = args.find(arg => ["block", "inline", "x", "y"].includes(arg))
    return new this(scroller as any, axis as any)
  }

  toString() {
    return cssFunc("scroll", [this.scroller, this.axis])
  }
}

export class CSSTargetCounterValue implements CSSStyleValue {
  constructor(
    readonly type: "target-counter" | "target-counters",
    readonly url: CSSUrlValue,
    readonly name: string,
    readonly separator?: string,
    readonly counterStyle?: CSSCounterValue["style"]
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "target-counter" && name !== "target-counters") throw TypeError("Invalid function name")
    const url = CSSUrlValue.parse(args[0])
    const counterName = args[1]
    let separator, counterStyle
    if(name === "target-counters") {
      separator = args[2]
      if(args[3]) {
        counterStyle = CSSCounterValue.parseCounterStyle(args[3])
      }
    }
    else if(name === "target-counter" && args[2]) {
      counterStyle = CSSCounterValue.parseCounterStyle(args[2])
    }
    return name === "target-counter"
      ? new this(name, url, counterName, undefined, counterStyle)
      : new this(name, url, counterName, separator, counterStyle)
  }

  toString() {
    return cssFunc(this.type, [this.url, this.name, this.counterStyle], ", ")
  }
}

export class CSSTargetTextValue implements CSSStyleValue {
  constructor(
    readonly url: CSSUrlValue,
    readonly retrieve?: "content" | "before" | "after" | "first-letter"
  ) {}

  static parse(text: string) {
    const {name, args} = parseCssFunc(text, ",")
    if(name !== "target-text") throw TypeError("Invalid function name")
    const url = CSSUrlValue.parse(args[0])
    return new this(url, args[1] as any)
  }

  toString() {
    return cssFunc("target-text", [this.url, this.retrieve], ", ")
  }
}

// COMPOSITE TYPES ////////////////////////////////////////////////////////////

export class CSSCompositeValue implements CSSStyleValue {

  #values = [] as CSSStyleValue[]

  constructor(values: CSSStyleValue[]) {
    this.#values = values
  }

  // CSSTransformValue
  static transformFunctionNames = ["translate", "translateX", "translateY", "translateZ", "translate3d", "rotate", "rotateX", "rotateY", "rotateZ", "rotate3d", "scale", "scaleX", "scaleY", "scaleZ", "scale3d", "skew", "skewX", "skewY", "matrix", "matrix3d", "perspective"] as const

  // CSSMathValue, TODO: CSSCalcSizeValue, CSSAnchorValue, CSSAnchorSizeValue
  static mathFunctionNames = ["calc", "min", "max", "clamp", "round", "mod", "rem", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "pow", "sqrt", "hypot", "log", "exp", "abs", "sign", "calc-size", "anchor", "anchor-size"] as const

  // TODO: CSSBlurValue, CSSBrightnessValue, CSSContrastValue, CSSDropShadowValue, CSSGrayscaleValue, CSSHueRotateValue, CSSInvertValue, CSSOpacityValue, CSSSaturateValue, CSSSepiaValue
  static filterFunctionNames = ["blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia"] as const

  // CSSColorValue, TODO: CSSColorMixValue, CSSColorContrastValue, CSSDeviceCmykValue, CSSLightDarkValue
  static colorFunctionNames = ["rgb", "rgba", "hsl", "hsla", "hwb", "lch", "oklch", "oklab", "color", "color-mix", "color-contrast", "device-cmyk", "light-dark"] as const

  // CSSImageValue, TODO: CSSLinearGradientValue, CSSRadialGradientValue, CSSConicGradientValue, CSSCrossFadeValue, CSSElementValue, CSSPaintValue
  static imageFunctionNames = ["linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient", "image", "image-set", "cross-fade", "element", "paint"] as const

  // CSSCountersValue, CSSSymbolsValue
  static counterFunctionNames = ["counter", "counters", "symbols"] as const

  // TODO: CSSShapeValue, CSSCircleValue, CSSEllipseValue, CSSInsetValue, CSSRectValue, CSSXywhValue, CSSPolygonValue, CSSPathValue
  static shapeFunctionNames = ["shape", "circle", "ellipse", "inset", "rect", "xywh", "polygon", "path"] as const

  // TODO: CSSAttrValue, CSSEnvValue, CSSUrlValue, CSSVarValue
  static referenceFunctionNames = ["attr", "env", "url", "var"] as const

  // TODO: CSSFitContentValue, CSSMinMaxValue, CSSRepeatValue
  static gridFunctionNames = ["fit-content", "minmax", "repeat"] as const

  // TODO: CSSLinearValue, CSSCubicBezierValue, CSSStepsValue
  static easingFunctionNames = ["linear", "cubic-bezier", "steps"] as const

  // TODO: CSSScrollValue, CSSViewValue
  static animationFunctionNames = ["scroll", "view"] as const

  static functionNames = [...this.transformFunctionNames, ...this.mathFunctionNames, ...this.filterFunctionNames, ...this.colorFunctionNames, ...this.imageFunctionNames, ...this.counterFunctionNames, ...this.shapeFunctionNames, ...this.referenceFunctionNames, ...this.gridFunctionNames, ...this.easingFunctionNames, ...this.animationFunctionNames]

  static valueClasses = {
    "color": CSSColorValue,
    "hex-color": CSSColorValue,
    "named-color": CSSColorValue,
    "system-color": CSSColorValue,
    "deprecated-system-color": CSSColorValue,
    "declaration-value": CSSCompositeValue,

    "custom-ident": CSSCustomIdentValue,
    "dashed-ident": CSSDashedIdentValue,
    "string": CSSStringValue,
    "integer": CSSIntegerValue,
    "number": CSSNumberValue,
    "percentage": CSSPercentageValue,
    "flex": CSSFlexValue,
    "ratio": CSSRatioValue,
    "length": CSSLengthValue,
    "angle": CSSAngleValue,
    "time": CSSTimeValue,
    "frequency": CSSFrequencyValue,
    "resolution": CSSResolutionValue,
    "position": CSSPositionValue,
    "image": CSSImageValue,
    "element": CSSImageValue,

    "translate": CSSTransformValue,
    "translateX": CSSTransformValue,
    "translateY": CSSTransformValue,
    "translateZ": CSSTransformValue,
    "translate3d": CSSTransformValue,
    "rotate": CSSTransformValue,
    "rotateX": CSSTransformValue,
    "rotateY": CSSTransformValue,
    "rotateZ": CSSTransformValue,
    "rotate3d": CSSTransformValue,
    "scale": CSSTransformValue,
    "scaleX": CSSTransformValue,
    "scaleY": CSSTransformValue,
    "scaleZ": CSSTransformValue,
    "scale3d": CSSTransformValue,
    "skew": CSSTransformValue,
    "skewX": CSSTransformValue,
    "skewY": CSSTransformValue,
    "matrix": CSSTransformValue,
    "matrix3d": CSSTransformValue,
    "perspective": CSSTransformValue,

    "calc": CSSMathValue,
    "min": CSSMathValue,
    "max": CSSMathValue,
    "clamp": CSSMathValue,
    "round": CSSMathValue,
    "mod": CSSMathValue,
    "rem": CSSMathValue,
    "sin": CSSMathValue,
    "cos": CSSMathValue,
    "tan": CSSMathValue,
    "asin": CSSMathValue,
    "acos": CSSMathValue,
    "atan": CSSMathValue,
    "atan2": CSSMathValue,
    "pow": CSSMathValue,
    "sqrt": CSSMathValue,
    "hypot": CSSMathValue,
    "log": CSSMathValue,
    "exp": CSSMathValue,
    "abs": CSSMathValue,
    "sign": CSSMathValue, 
    "anchor-size": CSSAnchorSizeValue,
    "add": CSSAddValue,
    /* Experimental
    "calc-size": CSSMathValue,
    "anchor": CSSMathValue*/

    "rgb": CSSColorValue,
    "rgba": CSSColorValue,
    "hsl": CSSColorValue,
    "hsla": CSSColorValue,
    "hwb": CSSColorValue,
    "lab": CSSColorValue,
    "lch": CSSColorValue,
    "oklch": CSSColorValue,
    "oklab": CSSColorValue,
    "color-mix": CSSColorMixValue,
    "device-cmyk": CSSDeviceCmykValue,
    "light-dark": CSSLightDarkValue,

    "blur": CSSBlurValue,
    "brightness": CSSBrightnessValue,
    "contrast": CSSContrastValue,
    "drop-shadow": CSSDropShadowValue,
    "grayscale": CSSGrayscaleValue,
    "hue-rotate": CSSHueRotateValue,
    "invert": CSSInvertValue,
    "opacity": CSSOpacityValue,
    "saturate": CSSSaturateValue,
    "sepia": CSSSepiaValue,

    "linear-gradient": CSSLinearGradientValue,
    "radial-gradient": CSSRadialGradientValue,
    "conic-gradient": CSSConicGradientValue,
    "repeating-linear-gradient": CSSLinearGradientValue,
    "repeating-radial-gradient": CSSRadialGradientValue,
    "repeating-conic-gradient": CSSConicGradientValue,
    "image-set": CSSImageSetValue,
    "cross-fade": CSSCrossFadeValue,
    "paint": CSSPaintValue,/* Experimental
    "image": CSSImageValue,
    "element": CSSImageValue,*/ 

    "counter": CSSCounterValue,
    "counters": CSSCounterValue,
    "symbols": CSSSymbolsValue,
    
    /* Experimental
    "shape": CSSShapeValue,*/
    "circle": CSSCircleValue,
    "ellipse": CSSEllipseValue,
    "inset": CSSRectValue,
    "rect": CSSRectValue,
    "xywh": CSSRectValue,
    "polygon": CSSPolygonValue,
    "path": CSSPathValue,
    
    "attr": CSSAttrValue,
    "env": CSSEnvValue,
    "url": CSSUrlValue,
    "var": CSSVarValue,
    
    "fit-content": CSSFitContentValue,
    "minmax": CSSMinMaxValue,
    "repeat": CSSRepeatValue,
    
    "linear": CSSLinearValue,
    "cubic-bezier": CSSCubicBezierValue,
    "steps": CSSStepsValue,

    "leader": CSSLeaderValue,

    "stylistic":  CSSAlternativeGlyphValue,
    "styleset":  CSSAlternativeGlyphValue,
    "character-variant":  CSSAlternativeGlyphValue,
    "swash":  CSSAlternativeGlyphValue,
    "ornament":  CSSAlternativeGlyphValue,
    "annotation":  CSSAlternativeGlyphValue,

    "target-counter": CSSTargetCounterValue,
    "target-counters": CSSTargetCounterValue,
    "target-text": CSSTargetTextValue,

    "view": CSSViewValue,
    "scroll": CSSScrollValue,/* Experimental
    "palette-mix": CSSPaletteMixValue*/
  }

  static parse(cssText: string) {
    const values = [] as CSSStyleValue[]
    const tree = parser.parse(cssText)
    treeLog(tree, cssText)
    tree.iterate({
      enter: node => {
        let str = cssText.slice(node.from, node.to)
        let value: CSSStyleValue | undefined = undefined
        if(["Dimension", "Number", "Percentage"].includes(node.name)) {
          value = CSSNumericValue.parse(str)
        }
        else if(["Ident", "Initial", "Inherit", "Revert", "Unset"].includes(node.name)) {
          value = new CSSKeywordValue(str)
        }
        else if(node.name === "String") {
          value = new CSSStringValue(str)
        }
        else if(node.name === "DashedIdent") {
          value = new CSSVariableReferenceValue(str)
        }
        else if(node.name === "Color") {
          value = CSSColorValue.parse(str)
        }
        else if(node.name === "FunctionCall") {
          const funcNameNode = node.node.firstChild!
          const funcName: keyof (typeof CSSCompositeValue)["valueClasses"] = str.slice(funcNameNode.from, funcNameNode.to) as any
          if(!this.functionNames.includes(funcName as any)) {
            throw Error(`Unknown CSS function '${funcName}'`)
          }
          else {
            values.push(this.valueClasses[funcName].parse(str))
            return false
          }
        }
        value && values.push(value)
      }
    }) 
    return new CSSCompositeValue(values)  
  }
  *[Symbol.iterator]() {
    for(const value of this.#values) {
      yield value
    }
  }
}

// @ts-ignore
window.CSSCompositeValue = CSSCompositeValue


let errorCount = 0
for(const [name, value] of Object.entries(CSSValueDefinition.CSSPropertySpecs)) {
  try {
    CSSValueDefinition.getSuggestions(value.syntaxTree!)
  } catch(err) {
    errorCount++
    console.error(name, value.syntaxTree, err)
  }
}
errorCount && console.error(`${errorCount} ERRORS`)
