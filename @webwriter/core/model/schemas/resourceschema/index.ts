import {z} from "zod"
import {Schema, Node} from "prosemirror-model"
import {EditorState, EditorStateConfig} from "prosemirror-state"
export {undo, redo} from "prosemirror-history"

import * as marshal from "../../marshal"
import { Package } from "../.."
import { basePlugin, configFromSchemaPlugins, formPlugin, phrasingPlugin, listPlugin, mathPlugin, mediaPlugin, modalPlugin, stylePlugin, svgPlugin, tablePlugin, textblockPlugin, widgetPlugin, canvasPlugin, deprecatedPlugin, headingPlugin, sectionPlugin } from "./plugins"
import { EditorStateWithHead, headSchema } from "./head"

export * from "./plugins"
export * from "./htmlelementspec"
export * from "./stylespec"
export * from "./head"
export * as themes from "./themes"

export function createEditorStateConfig(packages: Package[]) {
  return configFromSchemaPlugins([
    basePlugin(),
    textblockPlugin(),
    headingPlugin(),
    mediaPlugin(),
    phrasingPlugin(),
    sectionPlugin(),
    canvasPlugin(),
    formPlugin(),
    listPlugin(),
    modalPlugin(),
    stylePlugin(),
    tablePlugin(),
    // mathPlugin(),
    // svgPlugin(),
    // deprecatedPlugin(),
    widgetPlugin(packages)
  ])
}

export const defaultConfig = createEditorStateConfig([])

export const createEditorState = ({schema=defaultConfig.schema, doc=defaultConfig.doc, selection=defaultConfig.selection, storedMarks=defaultConfig.storedMarks, plugins=defaultConfig.plugins}: EditorStateConfig, head?: Node) => {
  const resolvedDoc = doc
  const state = EditorState.create({selection, storedMarks, plugins, doc: resolvedDoc})
  const head$ = EditorState.create({schema: headSchema, doc: head})
  return (head? Object.assign(state, {head$}): state) as EditorStateWithHead
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
    return marshal[format].serialize(resource.editorState.doc, (resource.editorState as any).head$, bundle)
  }
})