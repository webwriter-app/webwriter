import {
  Plugin,
  Command,
  EditorStateConfig,
  PluginKey,
} from "prosemirror-state";
import { NodeSpec, MarkSpec } from "prosemirror-model";
import { InputRule, inputRules } from "prosemirror-inputrules";
import { Schema, Node } from "prosemirror-model";
import { keymap } from "prosemirror-keymap";
import { gapCursor } from "prosemirror-gapcursor";
import { history } from "prosemirror-history";
import { chainCommands } from "prosemirror-commands";
import { createVirtualCursor as virtualCursor } from "prosemirror-virtual-cursor";
import { head } from "../head";

export interface SchemaPlugin<
  N extends string = string,
  M extends string = string,
  C extends string = string,
  PS = any
> {
  nodes?: { [key in N]: NodeSpec };
  marks?: { [key in M]: MarkSpec };
  topNode?: N;
  plugin?: Plugin<PS> | Plugin<PS>[];
  keymap?:
    | ((schema: Schema) => Record<string, Command>)
    | Record<string, Command>;
  inputRules?: InputRule[];
  commands?: { [key in C]: Command };
  styles?: string[];
  scripts?: string[];
}

export function chainCommandsApplyAll(...commands: Command[]): Command {
  return function (state, dispatch, view) {
    for (let i = 0; i < commands.length; i++) {
      commands[i](state, dispatch, view);
    }
    return false;
  };
}

function mergeObjects<T extends Object>(objs: T[]): T {
  return Object.fromEntries(objs.flatMap((o) => Object.entries(o))) as T;
}

function chainKeymaps(keymaps: Record<string, Command>[]) {
  const grouped = {} as Record<string, Command[]>;
  for (const km of keymaps) {
    for (const [key, cmd] of Object.entries(km)) {
      grouped[key] = grouped[key] ? [...grouped[key], cmd] : [cmd];
    }
  }
  const chained = {} as Record<string, Command>;
  for (const [key, cmds] of Object.entries(grouped)) {
    chained[key] = chainCommands(...cmds);
  }
  return chained;
}

export function configFromSchemaPlugins(
  schemaPlugins: SchemaPlugin[]
): EditorStateConfig & { schema: Schema; doc: Node } {
  const schema = new Schema({
    topNode: schemaPlugins.reverse().find((p) => p.topNode)!.topNode,
    nodes: mergeObjects(schemaPlugins.map((p) => p.nodes ?? {})),
    marks: mergeObjects(schemaPlugins.map((p) => p.marks ?? {})),
  });
  const doc = schema.nodes[schema.topNodeType.name].createAndFill()!;
  const keymaps = schemaPlugins.map((p) =>
    typeof p.keymap === "function" ? p.keymap(schema) : p.keymap ?? {}
  );
  const plugins = [
    head(
      [...schemaPlugins.flatMap((p) => p.styles ?? [])],
      schemaPlugins.flatMap((p) => p.scripts ?? [])
    ),
    ...keymaps.map((p) => keymap(p)).reverse(),
    inputRules({ rules: schemaPlugins.flatMap((p) => p.inputRules ?? []) }),
    history(),
    gapCursor(),
    // virtualCursor(),
    ...schemaPlugins.filter((p) => p.plugin).flatMap((p) => p.plugin!),
  ];
  return { schema, doc, plugins };
}

export * from "./base";
export * from "./canvas";
export * from "./deprecated";
export * from "./form";
export * from "./heading";
export * from "./list";
export * from "./math";
export * from "./media";
export * from "./modal";
export * from "./phrasing";
export * from "./section";
export * from "./style";
export * from "./svg";
export * from "./table";
export * from "./textblock";
export * from "./widget";
export * from "./grammar";
export * from "./ai";
