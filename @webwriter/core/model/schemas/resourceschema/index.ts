import {z} from "zod"
import {Schema, Node} from "prosemirror-model"
import {Command, EditorState, EditorStateConfig, Plugin} from "prosemirror-state"
import { baseKeymap, chainCommands, createParagraphNear, liftEmptyBlock, newlineInCode, splitBlock} from "prosemirror-commands"
import {keymap} from "prosemirror-keymap"
import {inputRules, InputRule} from "prosemirror-inputrules"
import { history } from "prosemirror-history"
import { EditorView } from "prosemirror-view"
export {undo, redo} from "prosemirror-history"
import { gapCursor } from "prosemirror-gapcursor"
import { tableEditing, columnResizing } from "prosemirror-tables"
import { liftListItem, sinkListItem, splitListItem } from "prosemirror-schema-list"


import { unscopePackageName } from "../../../utility"
import * as marshal from "../../marshal"
import { Package } from "../.."
import {containerNodes, inlineNodes, leafNodes, explorable} from "./nodes"
import {marks} from "./marks"
import { mediaNodeSpecs } from "./media"
import { packageWidgetNodeSpec, slotContentNodeSpec, slotContentNodeSpecName } from "./widgets"
import {customArrowCommand, customBackspaceCommand, customSelectAllCommand} from "./commands"


export const createBaseSchemaSpec = () => {
  return {topNode: "explorable", nodes: {explorable, ...containerNodes, ...inlineNodes, ...leafNodes}, marks}
}

export const createSchemaSpec = (packages: Package[] = []) => {
  const widgetNodes = Object.fromEntries(packages.map(pkg => [
    unscopePackageName(pkg.name),
    packageWidgetNodeSpec(pkg)
  ]))
  const slotNodes = Object.fromEntries(packages.flatMap(pkg => {
    const content = pkg.editingConfig?.content ?? {}
    return Object.entries(content).map(([name, expr]) => [
      slotContentNodeSpecName(pkg.name, name),
      slotContentNodeSpec(pkg, name, expr.raw!)
    ])
  }))
  const baseSpec = createBaseSchemaSpec() 
  const spec = {
    ...baseSpec,
    nodes: {
      ...baseSpec.nodes,
      ...widgetNodes,
      ...slotNodes,
      ...mediaNodeSpecs,
    }
  }
  return spec
}

export const baseSchema = new Schema(createBaseSchemaSpec())

const explorableKeymap: Record<string, Command> = {
  "Backspace": customBackspaceCommand,
  "Control-ArrowUp": customArrowCommand(true),
  "Control-ArrowDown": customArrowCommand(),
  "Enter": chainCommands(splitListItem(baseSchema.nodes["listItem"]), newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock),
  "Tab": sinkListItem(baseSchema.nodes["listItem"]),
  "Shift-Tab": liftListItem(baseSchema.nodes["listItem"]),
  //"Control-a": customSelectAllCommand()
}

const rules: InputRule[] = [
//  new InputRule(/^#{1,6} $/, "heading"),
//  new InputRule(/\*\*.$/, "bold"),
//  new InputRule(/\*.$/, "italic"),
  new InputRule(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/, (state, match, start, end) => {
    const href = match[0]
    const linkMark = state.schema.mark("link", {href})
    const textNode = state.schema.text(href, [linkMark])
    return state.tr.replaceRangeWith(start, end, textNode)
  })
]

export function isEmpty(attributeKey: string = "data-empty") {
  const update = (view: EditorView) => {
    if (view.state.doc.textContent || view.state.doc.childCount > 1 || view.state.doc?.firstChild?.type?.name !== "paragraph") {
      view.dom.removeAttribute(attributeKey);
    } else {
      view.dom.setAttribute(attributeKey, "");
    }
  };

  return new Plugin({
    view(view) {
      update(view);
      return { update };
    }
  });
}

export const defaultConfig: EditorStateConfig & {schema: Schema, doc: Node} = {
  schema: baseSchema,
  doc: baseSchema.node(baseSchema.topNodeType, {}, [baseSchema.node("paragraph")]),
  plugins: [
    keymap({...baseKeymap, ...explorableKeymap}),
    inputRules({rules}),
    history(),
    isEmpty(),
    gapCursor(),
    tableEditing(),
  ]
}

export function createEditorStateConfig(packages: Package[]) {
  return {
    schema: new Schema(createSchemaSpec(packages)),
    doc: baseSchema.node(baseSchema.topNodeType, {}, [baseSchema.node("paragraph")]),
    plugins: [
      keymap({...baseKeymap, ...explorableKeymap}),
      inputRules({rules}),
      history(),
      isEmpty()
    ]
  }
}

export function createSchema(packages: Package[]) {
  return new Schema(createSchemaSpec(packages))
}

export const createEditorState = ({schema=defaultConfig.schema, doc=defaultConfig.doc, selection=defaultConfig.selection, storedMarks=defaultConfig.storedMarks, plugins=defaultConfig.plugins}: EditorStateConfig) => {
  const resolvedDoc = schema.nodeFromJSON(doc.toJSON())
  return EditorState.create({selection, storedMarks, plugins, doc: resolvedDoc})
}


type Format = keyof typeof marshal

const ResourceSchema = z.object({
  url: z.string().url({message: "Not a valid URL"}),
  editorState: z
    .instanceof(EditorState)
    .or(
      z.object({
        value: z.any(),
        schema: z.instanceof(Schema)
      })
      .transform(async ({value, schema}) => {
        for(const parse of Object.values(marshal).map(({parse}) => parse)) {
          try {
            return await parse(value, schema)
          } 
          catch(e) {
            return z.NEVER
          }
        }
        return z.NEVER
      })
    )
})

export type Resource = z.infer<typeof ResourceSchema>
export const Resource = Object.assign(ResourceSchema, {
  serialize(resource: Resource, format: Format = "html", bundle: any) {
    return marshal[format].serialize(resource.editorState.doc, bundle)
  }
})

export * from "./helpers"
export * from "./marks"
export * from "./media"
export * from "./nodes"
export * from "./widgets"
export * from "./commands"