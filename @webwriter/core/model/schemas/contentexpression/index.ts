import {z} from "zod"
import {Schema} from "prosemirror-model"

import {parser} from "./index.grammar"

function treeLog(tree: any, expr?: string) {
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

const expr = "(a* | b  c)+"

function parse(expr: string) {
  const tree = parser.parse(expr)
  let root: any = undefined
  let parent: any = undefined
  tree.cursor().iterate(
    (cur: any) => {
      if(["Alternation", "Sequence", "SimpleExpression"].includes(cur.name)) {
        const value = {type: cur.name, min: 1, max: 1, content: [], parent, raw: expr.slice(cur.from, cur.to)}

        if(parent) {
          Object.assign(parent, {content: [...parent?.content, value]})
          parent = value
        }
        else {
          root = parent = value
        }
      }
      else if(cur.name === "Identifier") {
        Object.assign(parent, {content: expr.slice(cur.from, cur.to)})
      }
      else if(cur.name === "ZeroOrOne") {
        Object.assign(parent, {min: 0, max: 1})
      }
      else if(cur.name === "ZeroOrMore") {
        Object.assign(parent, {min: 0, max: Infinity})
      }
      else if(cur.name === "OneOrMore") {
        Object.assign(parent, {min: 1, max: Infinity})
      }
      else if(cur.name === "Min") {
        Object.assign(parent, {min: parseInt(expr.slice(cur.from, cur.to))})
      }
      else if(cur.name === "Max") {
        Object.assign(parent, {max: parseInt(expr.slice(cur.from, cur.to))})
      }
    },
    (cur: any) => {
      const isComplex = ["Alternation", "Sequence", "SimpleExpression"].includes(cur.name)
      const isInGroup = cur.node.parent?.name === "Group"
      const isGroup = cur.name === "Group"
      if(isComplex && !isInGroup) {
        parent = parent?.parent
      }
      else if(isGroup) {
        parent = parent?.parent
      }
    }
  )
  return root
}

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
  resolve(schema: Schema, expression: ParentedExpression, parent?: ParentedExpression, seen=new Map()): ParentedExpression {
    console.log(expression.raw)
    const {content} = expression
    const representants = {} as Record<string, string>
    schema.spec.nodes.forEach((k, v) => {
      representants[k] = k
      if(v.group) {
        const groups = v.group.trim().split(" ")
        for(const group of groups) {
          representants[group] = k
        }
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
      seen.set(expression.raw, result)
      const nodeContent = node.spec.content
        ? seen.get(node.spec.content) ?? ContentExpression.resolve(schema, ContentExpression.parse(node.spec.content), result as any, seen)
        : undefined
      return Object.assign(result, {content: nodeContent? [nodeContent]: undefined}) as any
    }
    else if(Array.isArray(content)) {
      const result = {
        ...expression as Exclude<Expression, SimpleExpression>,
        parent
      }
      seen.set(expression.raw, result)
      return seen.get(expression.raw) ?? Object.assign(result, {content: content.map(c => ContentExpression.resolve(schema, c, result, seen))})
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