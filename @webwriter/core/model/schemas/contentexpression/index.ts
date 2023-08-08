import {z} from "zod"
import {Schema} from "prosemirror-model"
//@ts-ignore
import { parse } from "./parse"

export type Expression = SimpleExpression | Sequence | Alternation | NodeExpression

export interface BaseExpression {
  type: string
  min: number
  max: number
  raw: string
}

export interface SimpleExpression extends BaseExpression {
  type: "SimpleExpression"
  content: string
}

export interface NodeExpression extends BaseExpression {
  type: "NodeExpression"
  node: string
  content?: Expression[]
}

export interface Sequence extends BaseExpression {
  type: "Sequence"
  content: Expression[]
}

export interface Alternation extends BaseExpression {
  type: "Alternation"
  content: Expression[]
}


export type ContentExpression = z.infer<typeof ContentExpression>
export const ContentExpression = Object.assign(z.string().transform<Expression>(arg => parse(arg)), {
  serialize(value: Expression) {
    return value.raw
  },
  resolve(schema: Schema, expression: ParentedExpression, parent?: ParentedExpression): ParentedExpression {
    const {content} = expression
    const representants = {} as Record<string, string>
    Object.entries(schema.nodes).reverse().forEach(([k, v]) => {
      representants[k] = k
      if(v.spec.group) {
        representants[v.spec.group] = k
      }
    })
    if(typeof content === "string" && (schema.nodes[representants[content]])) {
      const node = schema.nodes[representants[content]]
      const result = {
        ...expression,
        type: "NodeExpression",
        node: node.name,
        parent
      }
      const nodeContent = node.spec.content
        ? ContentExpression.resolve(schema, ContentExpression.parse(node.spec.content), result as any)
        : undefined
      return Object.assign(result, {content: nodeContent? [nodeContent]: undefined}) as any
    }
    else if(Array.isArray(content)) {
      const result = {
        ...expression as Exclude<Expression, SimpleExpression>,
        parent
      }
      return Object.assign(result, {content: content.map(c => ContentExpression.resolve(schema, c, result))})
    }
    else {
      return expression
    }
  },
  values(expression: ParentedExpression): ParentedExpression[] {
    const {content} = expression
    const values = !content || typeof content === "string"
      ? []
      : content.flatMap(c => ContentExpression.values(c))
    return [expression, ...values]
  }
})

export type ParentedExpression = Expression & {parent?: ParentedExpression}