import {z} from "zod"
import {Schema} from "prosemirror-model"
import { permute } from "../../../utility"
import Color from "colorjs.io"

import {parser} from "./index.grammar"
import {parser as valueParser} from "./cssproperty2.grammar"
import { CSSPropertySpecs, CSSSyntaxes } from "../resourceschema"

window.parseValueDefinition = (expr: string) => treeLog(parser.parse(expr), expr)

function cssFunc(name: string, args: (CSSStyleValue | undefined)[], separator=" ") {
  return `${name}(${args.filter(a=>a).map(a => a!.toString()).join(separator)})`
}

class CSSStringValue implements CSSStyleValue {

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
  }
}

export class CSSColorValue implements CSSStyleValue {

  #color: Color

  get value() {
    return this.toString()
  }

  constructor(color: Color) {
    this.#color = color
  }

  toString(options?: Parameters<Color["toString"]>[0]) {
    return this.#color.toString(options)
  }

  static parse(cssText: string) {
    return new CSSColorValue(new Color(cssText))
  }
}

export class CSSColorMixValue implements CSSStyleValue {
  colorSpace: "srgb" |"srgb-linear" | "display-p3" | "a98-rgb" | "prophoto-rgb" | "rec2020" | "lab" | "oklab" | "xyz" |"xyz-d50" | "xyz-d65" | "hsl" | "hwb" | "lch" | "oklch"
  hueInterpolation?: "shorter" | "longer" | "increasing" | "decreasing"

  colorA: CSSColorValue
  amountA?: CSSUnitValue
  colorB: CSSColorValue
  amountB?: CSSUnitValue

  constructor(colorA: CSSColorValue, colorB: CSSColorValue, amountA?: CSSUnitValue, amountB?: CSSUnitValue) {
    this.colorA = colorA
    this.colorB = colorB
    this.amountA = amountA
    this.amountB = amountB
  }

  toString() {
    const interpolationMethod = `in ${this.colorSpace}${this.hueInterpolation? ` ${this.hueInterpolation} hue` :""}`
    const a = `${this.colorA}${this.amountA? ` ${this.amountA}`: ""}`
    const b = `${this.colorB}${this.amountB? ` ${this.amountB}`: ""}`
    return `color-mix(${interpolationMethod}, ${a}, ${b})`
  }
}

export class CSSDeviceCmykValue implements CSSStyleValue {
  c: CSSUnitValue
  m: CSSUnitValue
  y: CSSUnitValue
  k: CSSUnitValue
  a?: CSSUnitValue

  constructor(c: CSSUnitValue, m: CSSUnitValue, y: CSSUnitValue, k: CSSUnitValue, a?: CSSUnitValue) {
    this.c = c
    this.m = m
    this.y = y
    this.k = k
    this.a = a
  }

  toString() {
    return cssFunc("device-cmyk", [this.c, this.m, this.y, this.k, this.a])
  }
}

export class CSSLinearGradientValue implements CSSStyleValue {
  repeating = false
  angle?: CSSUnitValue
  sideOrCorner?: "left" | "right" | "top" | "bottom" | "top left" | "top right" | "bottom left" | "bottom right"

}

export class CSSRadialGradientValue implements CSSStyleValue {
  repeating = false
}

export class CSSConicGradientValue implements CSSStyleValue {
  repeating = false
}


export class CSSLightDarkValue implements CSSStyleValue {
  colorA: CSSColorValue
  colorB: CSSColorValue

  constructor(colorA: CSSColorValue, colorB: CSSColorValue) {
    this.colorA = colorA
    this.colorB = colorB
  }

  toString() {
    return cssFunc("light-dark", [this.colorA, this.colorB], ", ")
  }
}

export class CSSFilterValue implements CSSStyleValue {}
export class CSSBlurValue extends CSSFilterValue {
  radius?: CSSUnitValue

  constructor(radius?: CSSUnitValue) {
    super()
    this.radius = radius
  }

  toString() {
    return cssFunc("blur", [this.radius])
  }
}
export class CSSBrightnessValue extends CSSFilterValue {
  amount?: CSSUnitValue

  constructor(amount?: CSSUnitValue) {
    super()
    this.amount = amount
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

  toString() {
    return cssFunc("contrast", [this.amount])
  }
}
export class CSSDropShadowValue extends CSSFilterValue {
  color?: CSSColorValue
  offsetX: CSSNumericValue
  offsetY: CSSNumericValue
  standardDeviation?: CSSNumericValue

  constructor(offsetX: CSSNumericValue, offsetY: CSSNumericValue, color?: CSSColorValue, standardDeviation?: CSSNumericValue) {
    super()
    this.color = color
    this.offsetX = offsetX
    this.offsetY = offsetY
    this.standardDeviation = standardDeviation
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

  toString() {
    return cssFunc("grayscale", [this.amount])
  }
}
export class CSSHueRotateValue extends CSSFilterValue {
  angle?: CSSUnitValue

  constructor(angle?: CSSUnitValue) {
    super()
    this.angle = angle
  }

  toString() {
    return cssFunc("hue-rotate", [this.angle])
  }
}
export class CSSInvertValue extends CSSFilterValue {
  amount?: CSSUnitValue

  constructor(amount?: CSSUnitValue) {
    super()
    this.amount = amount
  }

  toString() {
    return cssFunc("invert", [this.amount])
  }
}
export class CSSOpacityValue extends CSSFilterValue {
  amount?: CSSUnitValue

  constructor(amount?: CSSUnitValue) {
    super()
    this.amount = amount
  }

  toString() {
    return cssFunc("opacity", [this.amount])
  }
}
export class CSSSepiaValue extends CSSFilterValue {
  amount?: CSSUnitValue

  constructor(amount?: CSSUnitValue) {
    super()
    this.amount = amount
  }

  toString() {
    return cssFunc("sepia", [this.amount])
  }
}
export class CSSSaturateValue extends CSSFilterValue {
  amount?: CSSUnitValue

  constructor(amount?: CSSUnitValue) {
    super()
    this.amount = amount
  }

  toString() {
    return cssFunc("saturate", [this.amount])
  }
}

export class CSSCounterValue implements CSSStyleValue {
  name: string
  style?: string | CSSVariableReferenceValue | CSSSymbolsValue | "none" | "disc" | "circle" | "square" | "decimal" | "cjk-decimal" | "decimal-leading-zero" | "lower-roman" | "upper-roman" | "lower-greek" | "lower-alpha" | "upper-alpha" | "arabic-indic" | "armenian" | "cambodian" | "cjk-earthly-branch" | "cjk-heavenly-stem" | "cjk-ideographic" | "devanagari" | "ethiopic-numeric" | "georgian" | "gujarati" | "gurmukhi" | "hebrew" | "hiragana" | "hiragana-iroha" | "japanese-formal" | "japanese-informal" | "kannada" | "katakana" | "katakana-iroha" | "korean-hangul-formal" | "korean-hanja-informal" | "lao" | "lower-armenian" | "malayalam" | "mongolian" | "myanmar" | "oriya" | "persian" | "simp-chinese-formal" | "simp-chinese-informal" | "tamil" | "telugu" | "thai" | "tibetan" | "trad-chinese-formal" | "trad-chinese-informal" | "upper-armenian" | "disclosure-open" | "disclosure-closed"

  constructor(name: string, style?: CSSCounterValue["style"]) {
    this.name = name
    this.style = style
  }
}

export class CSSCountersValue extends CSSCounterValue {

  separator: string

  constructor(name: string, separator: string, style?: CSSCounterValue["style"]) {
    super(name, style)
    this.separator = separator
  }
}

export class CSSSymbolsValue implements CSSStyleValue {
  type?: "cyclic" | "numeric" | "alphabetic" | "symbolic" | "fixed"
  #values: (CSSStringValue | CSSImageValue)[] = []

  constructor(values: CSSStyleValue[], type?: CSSSymbolsValue["type"]) {
    if(values.length < 1) {
      throw TypeError("CSSSymbolsValue needs at least one value")
    }
    this.#values = values
    this.type = type
  }

  *[Symbol.iterator]() {
    for(const value of this.#values) {
      yield value
    }
  }
}

export class CSSShapeValue implements CSSStyleValue {}

export class CSSCircleValue extends CSSShapeValue {
  r?: CSSUnitValue | "closest" | "farthest"
  position?: CSSPositionValue

  constructor(r?: CSSUnitValue | "closest" | "farthest", position?: CSSPositionValue) {
    super()
    this.r = r
    this.position = position
  }

  toString() {
    const r = this.r? `${this.r}`: ""
    const position = this.position? `at ${this.position}`: ""
    return cssFunc("circle", [r, position])
  }
}

export class CSSEllipseValue extends CSSShapeValue {
  r1?: CSSUnitValue | "closest" | "farthest"
  r2?: CSSUnitValue | "closest" | "farthest"
  position?: CSSPositionValue

  constructor(r1?: CSSUnitValue | "closest" | "farthest", r2?: CSSUnitValue | "closest" | "farthest", position?: CSSPositionValue) {
    super()
    this.r1 = r1
    this.r2 = r2
    this.position = position
  }

  toString() {
    const position = this.position? `at ${this.position}`: undefined
    return cssFunc("circle", [this.r1, this.r2, position])
  }
}

export class CSSInsetValue extends CSSShapeValue {}

export class CSSRectValue extends CSSShapeValue {}

export class CSSXywhValue extends CSSShapeValue {
  x: CSSUnitValue
  y: CSSUnitValue
  w: CSSUnitValue
  h: CSSUnitValue
}

export class CSSPolygonValue extends CSSShapeValue {
  fillRule: "nonzero" | "evenodd"

  vertices: [CSSUnitValue, CSSUnitValue][] = []

  constructor(vertices: [CSSUnitValue, CSSUnitValue][], fillRule?: "nonzero" | "evenodd") {
    super()
    this.vertices = vertices
    this.fillRule = fillRule ?? this.fillRule
  }

  toString() {
    const fillRule = this.fillRule? `${this.fillRule}`: ""
    return cssFunc("polygon", [fillRule, ...this.vertices.map(([x, y]) => `${x} ${y}`)], ", ")
  }
}

export class CSSPathValue extends CSSShapeValue {
  fillRule: "nonzero" | "evenodd"
  pathString: string

  constructor(pathString: string, fillRule?: "nonzero" | "evenodd") {
    super()
    this.pathString = pathString
    this.fillRule = fillRule ?? this.fillRule
  }

  toString() {
    const fillRule = this.fillRule? `${this.fillRule}`: ""
    return cssFunc("path", [fillRule, this.pathString], ", ")
  }
}

export class CSSAttrValue implements CSSStyleValue {
  constructor(
    readonly name: CSSKeywordValue,
    readonly type?: "string" | "ident" | "color" | "number" | "percentage" | "length" | "angle" | "time" | "frequency" | "flex" | "em" | "ex" | "px" | "rem" | "vw" | "vh" | "vmin" | "vmax" | "mm" | "cm" | "in" | "pt" | "pc" | "deg" | "grad" | "rad" | "time" | "s" | "ms" | "Hz" | "kHz" | "%",
    readonly fallback?: CSSStyleValue  
  ) {}

  toString() {
    const namePart = [this.name, ...(this.type ? [this.type]: [])].map(v => v.toString()).join(" ")
    return cssFunc("env", [namePart, this.fallback], ", ")
  }
}

export class CSSEnvValue implements CSSStyleValue {
  constructor(
    readonly name: CSSKeywordValue,
    readonly dimensions?: CSSNumericValue[],
    readonly fallback?: CSSStyleValue  
  ) {}

  toString() {
    const namePart = [this.name, ...(this.dimensions ?? [])].map(v => v.toString()).join(" ")
    return cssFunc("env", [namePart, this.fallback], ", ")
  }
}

export class CSSUrlValue implements CSSStyleValue {
  constructor(
    readonly value: CSSStringValue,
  ) {}

  toString() {
    return cssFunc("env", [this.value])
  }
}

export class CSSVarValue implements CSSStyleValue {
  constructor(
    readonly value: CSSStringValue,
    readonly fallback?: CSSStyleValue
  ) {}

  toString() {
    return cssFunc("var", [this.value, this.fallback], ", ")
  }
}

export class CSSCompositeValue implements CSSStyleValue {

  #values = [] as CSSStyleValue[]

  constructor(values: CSSStyleValue[]) {
    this.#values = values
  }

  static transformFunctionNames = ["translate", "translateX", "translateY", "translateZ", "translate3d", "rotate", "rotateX", "rotateY", "rotateZ", "rotate3d", "scale", "scaleX", "scaleY", "scaleZ", "scale3d", "skew", "skewX", "skewY", "matrix", "matrix3d", "perspective"]

  static mathFunctionNames = ["calc", "min", "max", "max", "clamp", "round", "mod", "rem", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "pow", "sqrt", "hypot", "log", "exp", "abs", "sign"]

  static filterFunctionNames = ["blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia"]

  static colorFunctionNames = ["rgb", "rgba", "hsl", "hsla", "hwb", "lch", "oklch", "oklab", "color", "color-mix", "color-contrast", "device-cmyk", "light-dark"]

  static imageFunctionNames = ["linear-gradient", "radial-gradient", "conic-gradient", "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient", "image", "image-set", "cross-fade", "element", "paint"]

  static counterFunctionNames = ["counter", "counters", "symbols"]

  static shapeFunctionNames = [ "circle", "ellipse", "inset", "rect", "xywh", "polygon", "path"]

  static referenceFunctionNames = ["attr", "env", "url", "var"]

  static gridFunctionNames = ["fit-content", "minmax", "repeat"]

  static fontFunctionNames = ["stylistic", "styleset", "character-variant", "swash", "ornaments", "annotations"]

  static easingFunctionNames = ["linear", "cubic-bezier", "steps"]

  static animationFunctions = ["scroll", "view"]

  static parse(cssText: string) {
    const values = [] as CSSStyleValue[]
    const tree = valueParser.parse(cssText)
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
          const funcName = str.slice(funcNameNode.from, funcNameNode.to)
          if(CSSCompositeValue.transformFunctionNames.includes(funcName)) {
            // @ts-ignore: Wait for spec to be updated
            value = CSSTransformValue.parse("transform", str)
          }
          else if(CSSCompositeValue.mathFunctionNames.includes(funcName)) {
            // @ts-ignore: Wait for spec to be updated
            value = CSSMathValue.parse(str)
          }
          // Filter
          // Color
          // Image
          // Counter
          // Shape
          // Reference
          // Grid
          // Font
          // Easing
          // Animation
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

// @ts-ignore: Testing
window.CSSCompositeValue = CSSCompositeValue


export function treeLog(tree: any, expr?: string) {
  let depth = -1
  tree.cursor().iterate(
    (node: any) => {
      depth++
      console.group(`${node.name}[${node.from}:${node.to}|${depth}]`, expr?.slice(node.from, node.to))
    },
    () => {
      depth--
      console.groupEnd()
    }
  )
}

const errorEntries = Object.entries(CSSPropertySpecs)
  .map(([name, spec]) => [name, spec, parser.parse(spec.syntax)] as const)
  .filter(([name, spec, tree]) => {
    let isError = false
    tree.iterate({
      enter: (node: any) => {isError = node.type.isError}  
    })
    return isError
  })

/*
errorEntries.forEach(([name, spec, tree]) => {
  console.error(name, spec.syntax)
  treeLog(tree)
})*/
errorEntries.length && console.error(`${errorEntries.length} errors found`)

export type ValueDefinition = Literal | DataType | OrderedSequence | UnorderedSequence | Subset | Alternation

interface BaseExpression {
  type: string
  min: number
  max: number
  separator?: string
  required?: boolean
  raw: string
  parent?: ValueDefinition
}

interface Literal extends BaseExpression {
  type: "Literal"
  content: string
  options?: string[]
}

interface DataType extends BaseExpression {
  type: "DataType"
  content: string
}

interface OrderedSequence extends BaseExpression {
  type: "OrderedSequence"
  content: ValueDefinition[]
}

interface UnorderedSequence extends BaseExpression {
  type: "UnorderedSequence"
  content: ValueDefinition[]
}

interface Subset extends BaseExpression {
  type: "Subset"
  content: ValueDefinition[]
}

interface Alternation extends BaseExpression {
  type: "Alternation"
  content: ValueDefinition[]
}

function parseQuantifier(node: any, str: string) {
  if(node?.name === "ZeroOrMore") {
    return {min: 0, max: Infinity}
  }
  else if(node?.name === "OneOrMore") {
    return {min: 1, max: Infinity}
  }
  else if(node?.name === "ZeroOrOne") {
    return {min: 0, max: 1}
  }
  else if(node?.name === "Some") {
    const minNode = node.node.getChild("Min")
    const min = parseInt(str.slice(minNode.from, minNode.to))
    const maxNode = node.node.getChild("Max")
    const max = maxNode? parseInt(str.slice(maxNode.from, maxNode.to)): undefined
    return {min, max}
  }
  else if (node?.name === "OneOrMoreCommaSeparated") {
    return {min: 1, max: Infinity, separator: ","}
  }
  else {
    return {min: 1, max: 1}
  }
}

function parseCSSPropertySpecs(specs: CSSPropertySpecs, syntaxes?: CSSSyntaxes) {
  const cache = {}
  Object.keys(syntaxes ?? {}).forEach(k => 
    [k, parseValueDefinition((syntaxes as any)[k].syntax, cache, k)]
  )
  return Object.fromEntries(Object.entries(specs).map(([name, spec]) => {
    return [
      name,
      {...spec, syntaxTree: parseValueDefinition(spec.syntax, cache, name)}
    ]
  }))
}

export function parseValueDefinition(str: string, cache?: Record<string, ValueDefinition>, name?: string) {
  const tree = parser.parse(str)
  let root = undefined as ValueDefinition | undefined
  let parent = undefined as ValueDefinition["parent"]
  let groupQuantification: undefined | {min: number, max: number, separator?: string, required?: boolean}
  tree.iterate({
    enter: node => {
      const raw = str.slice(node.from, node.to)
      let expr: ValueDefinition | null = null
      if(["Literal", "DataType", "String"].includes(node.name)) {
        const qNode = node.node.getChild("Quantifier")!
        const cNode = node.name !== "String"? node.node.getChild("Identifier")!: null
        expr = {type: node.name, ...parseQuantifier(qNode, str), raw, content: node.name !== "String"? str.slice(cNode!.from, cNode!.to): raw} as any
        if(parent && Array.isArray(parent.content)) {
          parent.content.push(expr!)
        }
        if(!root) {
          root = expr!
        }
      }
      else if(node.name === "PropertyReference") {
        const cNode = node.node.getChild("Identifier")!
        const id = str.slice(cNode.from, cNode.to)
        if(cache && id in cache) {
          expr = cache[id]
        }
        else if(cache && !(id in cache)) {
          expr = cache[id] = {} as any
        }
        else {
          expr = {} as any
        }
        if(parent && Array.isArray(parent.content)) {
          parent.content.push(expr!)
        }
      }
      else if(["OrderedSequence", "UnorderedSequence", "Subset", "Alternation"].includes(node.name)) {
        expr = {type: node.name, raw, content: [], min: 1, max : 1} as any
        if(parent && Array.isArray(parent.content)) {
          parent.content.push(expr!)
        }
        parent = expr!
        if(!root) {
          root = parent
        }
      }
      else if(node.name === "Group") {
        const qNode = node.node.getChild("Quantifier")
        groupQuantification = {...groupQuantification, ...parseQuantifier(qNode, str)} as any
      }
      if(groupQuantification) {
        expr = {...expr!, ...groupQuantification}
        groupQuantification = undefined
      }
      if(cache && name) {
        cache[name] = {...cache[name], ...expr}
      }
      if(["String", "Literal", "DataType", "PropertyReference"].includes(node.name)) {
        return false
      }
    }
  })
  return root
}

const propertyDefinitions = parseCSSPropertySpecs(CSSPropertySpecs, CSSSyntaxes)


// Apply the values in comp to the value definition, reducing it to 
function cssReduceValueDefinition(def: ValueDefinition, comp: CSSCompositeValue): ValueDefinition | undefined {
  for(const [i, value] of [...comp].entries()) {
    if(def.type === "Alternation") {
      
    }
    else if(def.type === "OrderedSequence") {
      
    }
    else if(def.type === "UnorderedSequence") {
       
    }
    else if(def.type === "Subset") {
      
    }
    else {
    }
  }
}

export function cssPropertyOptions(def: ValueDefinition, value?: string | CSSCompositeValue): (Literal | DataType)[] {

  const comp = value
    ? (value instanceof CSSCompositeValue? value: CSSCompositeValue.parse(value))
    : new CSSCompositeValue([])
  
  const pos = def


  if(pos.type === "Alternation") {
    return pos.content.flatMap(subdef => cssPropertyOptions(subdef))
  }
  else if(pos.type === "OrderedSequence") {
    // return 
  }
  else if(pos.type === "UnorderedSequence") {
    // return 
  }
  else if(pos.type === "Subset") {
    // return 
  }
  else {
    return [pos]
  }
}

export function* cssPropertyOptions2(def: ValueDefinition) {
  let pos = def
  let partial = [] as CSSStyleValue[]
  while(true) {
    let input: string | undefined = yield
    // cssPropertyOptions.next("#aaa")
    // cssPropertyOptions.next() --> [OPT1, OPT2]
    if(input) {
      const composite = CSSCompositeValue.parse(input)
    }

    if(pos.type === "Literal" || pos.type === "DataType") {
      yield [pos]
    }
    else if(pos.type === "Alternation") {
      yield [...pos.content]
    }
    else if(pos.type === "OrderedSequence") {
      // return 
    }
    else if(pos.type === "UnorderedSequence") {
      // return 
    }
    else if(pos.type === "Subset") {
      // return 
    }
  }
}

const borderGenerator = cssPropertyOptions(propertyDefinitions["border"].syntaxTree!)

/*
export type ValueDefinition = z.infer<typeof ValueDefinition>
export const ValueDefinition = Object.assign(z.string().transform<Expression>(arg => parse(arg)), {
  serialize(value: Expression) {
    return value.raw
  },

  toRegexString(value: Expression): string {
    if(value.type === "SimpleExpression") {
      return value.raw
    }
    else {
      const parts = value.content.map(this.toRegexString)
      
      const quantifier = `{${value.min},${value.max}}`

      let list: string = ""
      if(value.type === "Sequence") {
        list = parts.join("")
      }
      else if(value.type === "Alternation") {
        list = parts.join("|")
      }
      else if(value.type === "Conjunction") {
        list = permute(parts)
          .map(p => `(${p.join("")})`)
          .join("|")
      }
      else if(value.type === "Subset") {
        list = permute(parts)
          .map(p => `(${p[0]}(${p.slice(1).join("|")}))`)
          .join("|")
      }
      return value.separator
        ? `(${list})(${value.separator}${list})*`
        : `(${list})${quantifier}`
    }
  },

  toRegex(value: Expression, flags="g"): RegExp {
    return new RegExp(ValueDefinition.toRegexString(value), flags)
  }

})

// [a b]# -> /ab(,ab)*/