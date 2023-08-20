import {Plugin, Command, EditorStateConfig} from "prosemirror-state"
import {NodeSpec, MarkSpec} from "prosemirror-model"
import { InputRule, inputRules } from "prosemirror-inputrules"
import {Schema, Node} from "prosemirror-model"
import { keymap } from "prosemirror-keymap"
import { gapCursor } from "prosemirror-gapcursor"
import { history } from "prosemirror-history"
import { chainCommands } from "prosemirror-commands"

export interface SchemaPlugin<N extends string=string, M extends string=string, C extends string=string, PS=any> {
  nodes?: {[key in N]: NodeSpec},
  marks?: {[key in M]: MarkSpec},
  topNode?: N,
  plugin?: Plugin<PS>,
  keymap?: Record<string, Command>,
  inputRules?: InputRule[],
  commands?: {[key in C]: Command}
}

function mergeObjects<T extends Object>(objs: T[]): T {
  return Object.fromEntries(objs.flatMap(o => Object.entries(o))) as T
}

function chainKeymaps(keymaps: Record<string, Command>[]) {
  const grouped = {} as Record<string, Command[]>
  for(const km of keymaps) {
    for(const [key, cmd] of Object.entries(km)) {
      grouped[key] = grouped[key]? [...grouped[key], cmd]: [cmd]
    }
  }
  const chained = {} as Record<string, Command>
  for(const [key, cmds] of Object.entries(grouped)) {
    chained[key] = chainCommands(...cmds)
  }
  return chained
}

export function configFromSchemaPlugins(schemaPlugins: SchemaPlugin[]): EditorStateConfig & {schema: Schema, doc: Node} {

  const schema = new Schema({
    topNode: schemaPlugins.reverse().find(p => p.topNode)!.topNode,
    nodes: mergeObjects(schemaPlugins.map(p => p.nodes ?? {})),
    marks: mergeObjects(schemaPlugins.map(p => p.marks ?? {}))
  })
  const doc = schema.node(schema.topNodeType, {}, [schema.node("paragraph")])
  const plugins = [
    keymap(chainKeymaps(schemaPlugins.map(p => p.keymap ?? {}))),
    inputRules({rules: schemaPlugins.flatMap(p => p.inputRules ?? [])}),
    history(),
    gapCursor(),
    ...schemaPlugins.filter(p => p.plugin).map(p => p.plugin!)
  ]
  return {schema, doc, plugins}
}

export * from "./form"
export * from "./inlinetext"
export * from "./list"
export * from "./math"
export * from "./media"
export * from "./metadata"
export * from "./modal"
export * from "./base"
export * from "./style"
export * from "./svg"
export * from "./table"
export * from "./textblock"
export * from "./widget"