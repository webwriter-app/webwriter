import {parser} from "./cssvaluedefinition.grammar"
import { CSSPropertySpecs, CSSSyntaxes } from "./cssvaluedefinition.data"
import { CSSAngleValue, CSSColorValue, CSSCompositeValue, CSSCustomIdentValue, CSSDashedIdentValue, CSSFlexValue, CSSFrequencyValue, CSSIntegerValue, CSSLengthValue, CSSNumberValue, CSSPercentageValue, CSSPositionValue, CSSRatioValue, CSSResolutionValue, CSSStringValue, CSSTimeValue, CSSUrlValue } from "./cssvalue"
import { filterObject } from "../utility"

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
})
errorEntries.length && console.error(`${errorEntries.length} errors found`)

console.log(errorEntries)*/

interface BaseExpression {
  type: string
  min: number
  max: number
  separator?: string
  required?: boolean
  raw: string
  parent?: ICSSValueDefinition
  name?: string
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
  content: ICSSValueDefinition[]
}

interface UnorderedSequence extends BaseExpression {
  type: "UnorderedSequence"
  content: ICSSValueDefinition[]
}

interface Subset extends BaseExpression {
  type: "Subset"
  content: ICSSValueDefinition[]
}

interface Alternation extends BaseExpression {
  type: "Alternation"
  content: ICSSValueDefinition[]
}

interface FunctionCall extends BaseExpression {
  type: "FunctionCall"
  name: string
  content: ICSSValueDefinition[]
}

type CSSValueSuggestion = CSSStyleValue | (typeof CSSStyleValue)

export type ICSSValueDefinition = Literal | DataType | OrderedSequence | UnorderedSequence | Subset | Alternation | FunctionCall
export const CSSValueDefinition = class CSSValueDefinition {

  static parseQuantifier(node: any, str: string): {min: number, max?: number, separator?: string} {
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
      return {min: 1, max: Infinity, separator: ",", ...(["ZeroOrMore", "OneOrMore", "ZeroOrOne", "Some"].includes(node.lastChild?.name)? this.parseQuantifier(node.lastChild!, str): undefined)}
    }
    else {
      return {min: 1, max: 1}
    }
  }
  
  static parse(str: string, cache?: Record<string, ICSSValueDefinition>, name?: string) {
    const tree = parser.parse(str)
    // treeLog(tree, str)
    let root = undefined as ICSSValueDefinition | undefined
    let parent = undefined as ICSSValueDefinition["parent"]
    let groupQuantification: undefined | {min: number, max: number, separator?: string, required?: boolean}
    tree.iterate({
      enter: node => {
        const raw = str.slice(node.from, node.to)
        let expr: ICSSValueDefinition | null = null
        if(["Literal", "String"].includes(node.name)) {
          const qNode = node.node.getChild("Quantifier")!
          const cNode = node.name !== "String"? node.node.getChild("Identifier")!: null
          expr = {type: node.name, ...this.parseQuantifier(qNode, str), raw, content: node.name !== "String"? str.slice(cNode!.from, cNode!.to): raw} as any
          if(parent && Array.isArray(parent.content)) {
            parent.content.push(expr!)
          }
          if(!root) {
            root = expr!;
            (root as any).name = name
            if(cache && name) {
              cache[name] = Object.assign(cache[name] ?? {}, expr)
            }
          }
        }
        else if(["DataType", "PropertyReference"].includes(node.name)) {
          const cNode = node.node.getChild("Identifier")!
          const qNode = node.node.getChild("Quantifier")!
          const id = str.slice(cNode.from, cNode.to)
          if(cache && id in cache) {
            expr = cache[id]
          }
          else if(node.name === "PropertyReference" && cache && !(id in cache)) {
            expr = cache[id] = {} as any
          }
          else {
            expr = {type: node.name, name: id, content: id, ...this.parseQuantifier(qNode, str), raw} as any
          }
          if(parent && Array.isArray(parent.content)) {
            parent.content.push(expr!)
          }
          if(!root) {
            root = expr!;
            (root as any).name = name
            if(cache && name && expr) {
              cache[name] = Object.assign(cache[name] ?? {}, expr)
            }
          }
        }
        else if(["OrderedSequence", "UnorderedSequence", "Subset", "Alternation", "FunctionCall"].includes(node.name)) {
          expr = {type: node.name, raw, content: [], min: 1, max : 1, ...groupQuantification} as any
          groupQuantification = undefined
          if(node.name === "FunctionCall") {
            const nameNode = node.node.firstChild!
            const name = str.slice(nameNode.from, nameNode.to);
            (expr as any).name = name
          }
          if(parent && Array.isArray(parent.content)) {
            parent.content.push(expr!)
          }
          parent = expr!
          if(!root) {
            root = expr!;
            (root as any).name = name
            if(cache && name) {
              cache[name] = Object.assign(cache[name] ?? {}, expr)
            }
          }
        }
        else if(node.name === "Group") {
          const qNode = node.node.getChild("Quantifier")
          groupQuantification = this.parseQuantifier(qNode, str) as any
        }
        if(["String", "Literal", "DataType", "PropertyReference"].includes(node.name)) {
          return false
        }
      }
    })
    return root
  }
  
  static styleValueFitsDefinition(def: ICSSValueDefinition, val: CSSStyleValue): boolean {
    const isComplex = ["OrderedSequence", "UnorderedSequence", "Subset", "Alternation"].includes(def.type)
    const fitsLiteral = def.type === "Literal" && (val instanceof CSSKeywordValue) && def.content === val.value
    const fitsType = ["DataType", "FunctionCall"].includes(def.type) && (def.name ?? "") in CSSCompositeValue.valueClasses && val instanceof CSSCompositeValue.valueClasses[(def.name as keyof typeof CSSCompositeValue.valueClasses)]
    return !isComplex && (fitsLiteral || fitsType)
  }
  
  private static decrementValueDefinition(def: ICSSValueDefinition): ICSSValueDefinition | null {
    let min = Math.max(0, def.min - 1)
    let max = def.max - 1
    if(max <= 0) {
      return null
    }
    else return {...def, min, max}
  }
  
  static reduceValueDefinition(def: ICSSValueDefinition, value: CSSStyleValue): ICSSValueDefinition | null {
    if(def.type === "OrderedSequence") {
      const head: ICSSValueDefinition = {
        type: "OrderedSequence",
        raw: "",
        min: 1,
        max: 1,
        content: [this.reduceValueDefinition(def.content[0], value), ...def.content.slice(1)].filter(v => v !== null)
      }
      const tail = this.decrementValueDefinition(def)
      if(!head.content.length && !tail) {
        return null
      }
      return tail? {
        type: "OrderedSequence",
        content: [...head.content, tail],
        min: 1,
        max: 1,
        raw: ""
      }: head
    }
    else if(def.type === "Alternation") {
      for(const c of def.content as ICSSValueDefinition[]) {
        const reduced = this.reduceValueDefinition(c, value)
        if(reduced) {
          return this.decrementValueDefinition({...def, content: [...def.content]})
        }
      }
      return null
    }
    else if(def.type === "UnorderedSequence") { // a && b
      for(const [i, c] of (def.content as ICSSValueDefinition[]).entries()) {
        const reduced = this.reduceValueDefinition(c, value)
        if(reduced) {
          const head: ICSSValueDefinition = {
            type: "UnorderedSequence",
            raw: "",
            min: 1,
            max: 1,
            content: [
              ...def.content.slice(0, i),
              reduced,
              ...def.content.slice(i + 1)
            ].filter(v => v !== null)
          }
          const tail = this.decrementValueDefinition(def)
          if(!head.content.length && !tail) {
            return null
          }
          return tail? {
            type: "OrderedSequence",
            content: [head, tail],
            min: 1,
            max: 1,
            raw: ""
          }: head
        }
      }
      return null
    }
    else if(def.type === "Subset") { // a || b
      for(const [i, c] of (def.content as ICSSValueDefinition[]).entries()) {
        const reduced = this.reduceValueDefinition(c, value)
        if(reduced) {
          const head: ICSSValueDefinition = {
            type: "Subset",
            raw: "",
            min: 1,
            max: 1,
            content: [
              ...def.content.slice(0, i),
              reduced,
              ...def.content.slice(i + 1)
            ].filter(v => v !== null)
          }
          const tail = this.decrementValueDefinition(def)
          if(!head.content.length && !tail) {
            return null
          }
          return tail? {
            type: "OrderedSequence",
            content: [head, tail],
            min: 1,
            max: 1,
            raw: ""
          }: head
        }
      }
      return null
    }
    else if(def.type === "FunctionCall" || def.type === "DataType") {
      const applies = value instanceof (CSSCompositeValue.valueClasses as any)[def.name ?? ""]
      return applies? this.decrementValueDefinition(def): null
    }
    else { // def.type === "Literal"
      const applies = (def.content as string) === value.toString()
      return applies? this.decrementValueDefinition(def): null
    }
  }
  
  static getSuggestions(def: ICSSValueDefinition): CSSValueSuggestion[] {
    if(def.type === "Alternation" || def.type === "UnorderedSequence") {
      return Array.from(new Set(def.content.flatMap(v => this.getSuggestions(v))))
    }
    else if(def.type === "OrderedSequence") {
      return Array.from(new Set(this.getSuggestions(def.content[0])))
    }
    else if(def.type === "Subset") {
      return Array.from(new Set(def.content.flatMap(v => this.getSuggestions(v))))
    }
    else if(def.type === "DataType" || def.type === "FunctionCall") {
      const name = def.type === "FunctionCall"
        ? def.name?.replace("()", "") ?? ""
        : def.content?.replace("()", "") ?? ""
      const cls = (CSSCompositeValue.valueClasses as any)[name] as CSSStyleValue
      if(!cls) {
        throw TypeError(`Unknown data type '${name}' in expression '${def.raw}'`)
      }
      return [cls]
    }
    else { // def.type === "Literal"
      return [new CSSKeywordValue(def.content)]
    }
  }
  
  /*static *suggestionsGenerator(def: ICSSValueDefinition): Generator<StyleValueSuggestion[], null, CSSStyleValue> {
    let currentDef = def
    while(currentDef) {
      const value = yield this.getSuggestions(def)
      currentDef = this.reduceValueDefinition(def, value)
    }
  }*/
  
  static suggestionsAt(def: ICSSValueDefinition, val: CSSCompositeValue) {
    const currentDef = Array.from(val)
      .reduce((acc: ICSSValueDefinition, cur) => {
        const reduced = this.reduceValueDefinition(acc, cur)
        return reduced? reduced: acc
      }, def)
    return this.getSuggestions(currentDef)
  }
  
  static parseCSSPropertySpecs(specs: CSSPropertySpecs, syntaxes?: CSSSyntaxes) {
    const cache = {}
    /*Object.keys(syntaxes ?? {}).forEach(k => {
      (cache as any)[k] = this.parse((syntaxes as any)[k].syntax, cache, k)
    })*/
    const all = Object.fromEntries(Object.entries({...syntaxes, ...specs}).map(([name, spec]) => {
      return [
        name,
        {...spec, syntaxTree: this.parse(spec.syntax, cache, name)}
      ]
    }))
    return filterObject(all, k => Object.keys(specs).includes(k))
  }
  static CSSPropertySpecs = this.parseCSSPropertySpecs(CSSPropertySpecs, CSSSyntaxes as any)
}

// @ts-ignore
window.CSSValueDefinition = CSSValueDefinition