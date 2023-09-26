import {z} from "zod"
import {Schema} from "prosemirror-model"
//@ts-ignore
import { parse } from "./parse"
import { permute } from "../../../utility"

export type Expression = SimpleExpression | Sequence | Alternation | Subset | Conjunction

export interface BaseExpression {
  type: string
  min: number
  max: number
  raw: string
  separator?: string
}

export interface SimpleExpression extends Omit<BaseExpression, "separator"> {
  type: "SimpleExpression"
  content: string
}

export interface Sequence extends BaseExpression {
  type: "Sequence"
  content: Expression[]
}

export interface Alternation extends BaseExpression {
  type: "Alternation"
  content: Expression[]
}

export interface Subset extends BaseExpression {
  type: "Subset"
  content: Expression[]
}

export interface Conjunction extends BaseExpression {
  type: "Conjunction"
  content: Expression[]
}




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