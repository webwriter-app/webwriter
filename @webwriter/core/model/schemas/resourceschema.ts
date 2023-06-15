import {z} from "zod"
import {Schema, Node, NodeSpec, MarkSpec, Fragment, DOMSerializer} from "prosemirror-model"
import {Command, EditorState, EditorStateConfig, NodeSelection, TextSelection, Plugin, AllSelection} from "prosemirror-state"
import { baseKeymap} from "prosemirror-commands"
import {keymap} from "prosemirror-keymap"
import {inputRules, InputRule} from "prosemirror-inputrules"
import { history, undo, redo } from "prosemirror-history"
import { chainCommands, deleteSelection, joinBackward, selectNodeBackward} from "prosemirror-commands"
import { EditorView } from "prosemirror-view"
export {undo, redo} from "prosemirror-history"
import mime from "mime/lite"

const MIME = Object.values((mime as any)._types) as string[]

import { camelCaseToSpacedCase, filterObject, namedNodeMapToObject, unscopePackageName } from "../../utility"
import * as marshal from "../marshal"
import { PackageWithOptions } from "../stores"

const leafNodeSpecs: Record<string, NodeSpec & {group: "leaf"}> = {
  thematicBreak: {group: "leaf"}
}

export function getOtherAttrsFromWidget(dom: HTMLElement) {
  return Object.fromEntries(dom
    .getAttributeNames()
    .filter(name => !["editable", "printable", "analyzable", "contenteditable"].includes(name))
    .map(name => [name, dom.getAttribute(name)]))
}

function slotContentNodeSpecName(packageName: string, slotName: string) {
  return `${unscopePackageName(packageName).replace("-", "I")}_SLOT_${slotName}`
}

function widgetSlotContent(pkg: PackageWithOptions) {
  return Object.keys(pkg.editingConfig?.content ?? {})
    .map(name => slotContentNodeSpecName(pkg.name, name))
    .join(" ")
}

function slotContentNodeSpec(pkg: PackageWithOptions, name: string, content: string): NodeSpec {
  const nodeName = slotContentNodeSpecName(pkg.name, name)
  return {
    group: "_slotContent",
    content,
    toDOM: () => ["div", {class: nodeName + " slot-content", slot: name}, 0],
    parseDOM: [{tag: `div.${nodeName}`}]
  }
}

function getMediaTypesOfContent(content: Record<string, string> | undefined) {
  if(content && "" in content) {
    const expr = content[""]
    const matches = [...expr.matchAll(/#\w+(?:\/[-+.\w]+)?/g)]
    return matches.map(match => match[0].slice(1))
  }
  else {
    return []
  }
}

function parseRuleOfMediaType(mediaType: string) {

}

function packageWidgetNodeSpec(pkg: PackageWithOptions): NodeSpec {
  const maybeContent = pkg.editingConfig?.content
    ? {content: widgetSlotContent(pkg)}
    : undefined
  const mediaTypes = getMediaTypesOfContent(pkg.editingConfig?.content)
  const maybeMediaParseRules = mediaTypes.length > 0? [

  ]: []

  return {
    group: "leaf",
    widget: true,
    package: pkg,
    selectable: true,
    draggable: false,
    isolating: false,
    ...maybeContent,
    attrs: {
      id: {},
      editable: {default: false},
      printable: {default: false},
      analyzable: {default: false},
      otherAttrs: {default: {}}
    },
    parseDOM : [{tag: unscopePackageName(pkg.name), getAttrs: (dom: HTMLElement ) => {
      return {
        id: dom.getAttribute("id"),
        editable: dom.getAttribute("editable") ?? false,
        printable: dom.getAttribute("printable") ?? false,
        analyzable: dom.getAttribute("analyzable") ?? false,
        otherAttrs: Object.fromEntries(dom
          .getAttributeNames()
          .filter(name => !["editable", "printable", "analyzable"].includes(name))
          .map(name => [name, dom.getAttribute(name)]))
      }
    }}, ...maybeMediaParseRules] as any,
    toDOM: (node: Node) => {
      return [node.type.name, {
        id: node.attrs.id,
        ...(node.attrs.editable? {"editable": true}: {}),
        ...(node.attrs.printable? {"printable": true}: {}),
        ...(node.attrs.analyzable? {"analyzable": true}: {}),
        ...node.attrs.otherAttrs,
        "class": "ww-widget"
      }].concat(pkg.editingConfig?.content? [0]: []) as any
    }
  }  
}

const inlineNodeSpecs: Record<string, NodeSpec & {group: "inline", inline: true}> = {
  text: {
    group: "inline",
    inline: true
  },
  lineBreak: {
    group: "inline",
    inline: true,
    parseDOM: [{"tag": "br"}],
    toDOM: () => ["br"]
  }
}

function maybeChildNodeOutputSpec(node: Node, mediaType: string) {
  const result: any[] = []
  const supertype = mediaType.split("/")[0]
  if(supertype === "image") {
    result.push(["img", {"src": node.attrs["src"], "data-type": mediaType}])
  }
  else if(supertype === "audio" || supertype === "video") {
    result.push(["source", {"src": node.attrs["src"], "type": mediaType}])
  }
  return result
}

const rootTags = {
  "application": "script",
  "audio": "audio",
  "font": "script",
  "image": "picture",
  "model": "script",
  "text": "script",
  "video": "video"
}

function detectMediaTypeFromDOM(dom: HTMLElement, rootTag: string) {
  if(rootTag === "picture") {
    return dom.querySelector("img")?.getAttribute("data-type")
  }
  else if(rootTag === "script") {
    return dom.getAttribute("type")
  }
  else {
    return dom.querySelector("source")?.getAttribute("type")
  }
}

function mediaNodeEntry(mediaType: string): [string, NodeSpec] {
  const name = mediaType.replaceAll("/", "__").replaceAll("-", "_")
  const supertype = mediaType.split("/")[0] as keyof typeof rootTags
  const subtype = mediaType.split("/")[1]
  
  const rootTag = rootTags[supertype]
  const rootAttrs = (node: Node) => rootTag === "script"? {src: node.attrs["src"], type: mediaType}: {controls: true}

  return [name, {
    group: "_" + supertype,
    attrs: {
      src: {default: undefined}
    },
    toDOM: node => [rootTag, rootAttrs(node), ...maybeChildNodeOutputSpec(node, mediaType)],
    parseDOM: [{tag: rootTag, getAttrs: (dom: HTMLElement | string) => {
      const detectedMediaType = detectMediaTypeFromDOM(dom as HTMLElement, rootTag)
      console.log(detectedMediaType)
      if(typeof dom === "string" || detectedMediaType !== mediaType) {
        return false
      }
      else if(rootTag === "picture") {
        const src = dom.querySelector("img")?.src
        return !src? false: {src}
      }
      else if(rootTag === "audio" || rootTag === "video") {
        const src = dom.querySelector("source")?.src
        return !src? false: {src}
      }
      else {
        console.log(dom)
        const src = (dom as HTMLScriptElement)?.src
        return !src? false: {src}
      }
    }}]
  }]
}



const mediaNodeSpecs = Object.fromEntries(MIME.map(mediaNodeEntry))



const containerNodeSpecs: Record<string, NodeSpec & {group: "container"}> = {
  
  paragraph: {
    group: "container",
    content: "inline*",
    attrs: {
      textAlign: {default: "left" as "left" | "center" | "right" | "justify"},
      lineHeight: {default: 1.25},
      marginTop: {default: 0},
      marginBottom: {default: "0.5rem"},
      marginLeft: {default: 0},
      marginRight: {default: 0}
    },
    whitespace: "pre",
    parseDOM: [{tag: "p"}],
    toDOM: node => [
      "p",
      {
        style: Object.keys(node.attrs)
          .map(key => `${camelCaseToSpacedCase(key, false, "-")}: ${String(node.attrs[key])}`).join("; ")
      },
      0
    ]
  },

  heading: {
    group: "container",
    content: "inline*",
    attrs: {level: {default: 1}},
    defining: true,
    parseDOM: [
      {tag: "h1", attrs: {level: 1}},
      {tag: "h2", attrs: {level: 2}},
      {tag: "h3", attrs: {level: 3}},
      {tag: "h4", attrs: {level: 4}},
      {tag: "h5", attrs: {level: 5}},
      {tag: "h6", attrs: {level: 6}},
    ],
    toDOM: node => ["h" + node.attrs.level, 0]
  },
 
  list: {
    group: "container",
    content: "listItem+",
    attrs: {
      isOrdered: {default: false},
      order: {default: 1},
      tight: {default: false}},
    parseDOM: [{tag: "ol, ul", getAttrs: (dom: HTMLElement) => ({
      isOrdered: dom.tagName.toLowerCase() == "ol",
      order: dom.hasAttribute("start")? + dom.getAttribute("start")!: 1,
      tight: dom.hasAttribute("data-tight")
    })}] as any,
    toDOM: node => [node.attrs.isOrdered? "ol": "ul", {
      start: node.attrs.order == 1? null: node.attrs.order,
      "data-tight": node.attrs.tight? "true": null
    }, 0]
  },
  
  listItem: {
    group: "container",
    content: "inline*",
    defining: true,
    parseDOM: [{tag: "li"}],
    toDOM: () => ["li", 0]
  },
}



const markSpecs: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [{tag: "strong"}, {tag: "b"}],
    toDOM: () => ["strong", 0]
  },
  italic: {
    parseDOM: [{tag: "em"}, {tag: "i"}],
    toDOM: () => ["em", 0]
  },
  strikethrough: {
    parseDOM: [{tag: "s"}],
    toDOM: () => ["s", 0]
  },
  code: {
    parseDOM: [{tag: "code"}],
    toDOM: () => ["code", 0]
  },
  underline: {
    parseDOM: [
      {tag: "span", style: "text-decoration", getAttrs: (v: any) => v.includes && v.includes("underline")}
    ],
    toDOM: () => ["span", {style: "text-decoration: underline"}, 0]
  },
  superscript: {
    parseDOM: [{tag: "sup"}],
    toDOM: () => ["sup", 0],
    excludes: "subscript"
  },
  subscript: {
    parseDOM: [{tag: "sub"}],
    toDOM: () => ["sub", 0],
    excludes: "superscript"
  },
  fontSize: {
    attrs: {
      value: {default: "12pt"}
    },
    parseDOM: [{tag: "span", style: "font-size", getAttrs: (dom: string |HTMLElement) => ({
      value: (dom as HTMLElement).style.fontSize
    })}],
    toDOM: node => ["span", {style: `font-size: ${node.attrs.value}`}, 0]
  },
  fontFamily: {
    attrs: {
      value: {default: "serif"}
    },
    parseDOM: [{tag: "span", style: "font-family", getAttrs: (dom: string |HTMLElement) => ({
      value: (dom as HTMLElement).style.fontFamily
    })}],
    toDOM: node => ["span", {style: `font-family: ${node.attrs.value}`}, 0]
  },
  link: {
    attrs: {
      href: {},
      title: {default: null}
    },
    inclusive: true,
    parseDOM: [{tag: "a[href]", getAttrs: (dom: HTMLElement) => ({
      href: dom.getAttribute("href"),
      title: dom.getAttribute("title")
    })}] as any,
    toDOM: (mark, inline) => ["a", {href: mark.attrs.href}]
  },
}

const UnknownElementSpec: NodeSpec = {
  attrs: {
    tagName: {},
    otherAttrs: {default: {}}
  },
  parseDOM: [{
    tag: "*",
    getAttrs: node => {
      if(typeof node === "string" || !node.tagName.includes("-")) {
        return false
      }
      else  {
        const tagName = node.tagName.toLowerCase()
        return {tagName, otherAttrs: namedNodeMapToObject(node.attributes)}
      }
    },
    priority: 0
  }],
  toDOM: node => [node.attrs.tagName, node.attrs.otherAttrs]
}


export const createSchemaSpec = (packages: PackageWithOptions[] = []) => {
  const widgetNodes = Object.fromEntries(packages.map(pkg => [
    unscopePackageName(pkg.name),
    packageWidgetNodeSpec(pkg)
  ]))
  const slotNodes = Object.fromEntries(packages.flatMap(pkg => {
    const content = pkg.editingConfig?.content ?? {}
    return Object.entries(content).map(([name, expr]) => [
      slotContentNodeSpecName(pkg.name, name),
      slotContentNodeSpec(pkg, name, expr)
    ])
  }))
  return {
    topNode: "explorable",
    nodes: {
      explorable: {
        content: "paragraph+ ((leaf | container | _image | _audio | _video | _text | _application | _model) paragraph+)* paragraph*",
        attrs: {meta: {default: {}}},
        parseDOM: [{tag: "body"}]
      } as NodeSpec,
      ...leafNodeSpecs,
      ...inlineNodeSpecs,
      ...containerNodeSpecs,
      ...widgetNodes,
      ...slotNodes,
      ...mediaNodeSpecs,
      unknownElement: UnknownElementSpec,
    },
    marks: markSpecs
  }
}

export const baseSchema = new Schema(createSchemaSpec())


const customBackspaceCommand = chainCommands(
  deleteSelection,
  (state, dispatch, view) => {
    const nodeBefore = state.doc.resolve(state.selection.$from.before(1)).nodeBefore
    if(!nodeBefore || !nodeBefore.type.spec["widget"]) {
      return joinBackward(state, dispatch, view)
    }
    return false
  },
  (state, dispatch, view) => {
    const nodeBefore = state.doc.resolve(state.selection.$from.before(1)).nodeBefore
    if(!nodeBefore || !nodeBefore.type.spec["widget"]) {
      return selectNodeBackward(state, dispatch, view)
    }
    return false
  }
)

const customArrowCommand = (up=false) => chainCommands(
  (state, dispatch, view) => {
    const isWidgetNode = state.selection instanceof NodeSelection && state.selection.node.type.spec["widget"] as boolean
    const hasParagraph = up
      ? state.selection.$from.nodeBefore?.type.name === "paragraph"
      : state.selection.$from.nodeAfter?.type.name === "paragraph"
    if(isWidgetNode && !hasParagraph) {
      const paragraph = state.schema.nodes.paragraph.create()
      
      const insertPos = up? state.selection.$from.pos: state.selection.$to.pos
      let tr = state.tr.insert(insertPos, paragraph)
      
      const selectPos = up? tr.selection.$from.pos - 1: tr.selection.$to.pos + 1
      const selection = new TextSelection(tr.doc.resolve(selectPos))
      tr = tr.setSelection(selection)
      dispatch? dispatch(tr): null
      return true
    }
    else if(isWidgetNode && hasParagraph) {
      const selectPos = up? state.selection.$from.pos - 1: state.selection.$to.pos + 1
      const selection = new TextSelection(state.doc.resolve(selectPos))
      const tr = state.tr.setSelection(selection)
      dispatch? dispatch(tr): null
      return true
    }
    else {
      return false
    }

  },
)

const customSelectAllCommand = () => chainCommands(
  (state, dispatch, view) => {
    let selection = new TextSelection(TextSelection.atStart(state.doc).$from, TextSelection.atEnd(state.doc).$to)
    const tr = state.tr.setSelection(selection)
    dispatch? dispatch(tr): null
    return false
  }
)

/*
const customDeleteCommand = chainCommands(
  (state, dispatch, view) => {
    if(state.selection instanceof NodeSelection && state.selection.node.type.spec["widget"]) {
      return state.tr.
    }
  },
  (state, dispatch, view) => {
    return joinForward(state, dispatch, view)
  },
  (state, dispatch, view) => {
    return selectNodeForward(state, dispatch, view)
  },
)
*/

const explorableKeymap: Record<string, Command> = {
  "Backspace": customBackspaceCommand,
  "Control-ArrowUp": customArrowCommand(true),
  "Control-ArrowDown": customArrowCommand(),
  "Control-a": customSelectAllCommand()
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
  ]
}

export function createEditorStateConfig(packages: PackageWithOptions[]) {
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

export function createSchema(packages: PackageWithOptions[]) {
  return new Schema(createSchemaSpec(packages))
}

/*
export const createEditorState2 = (
  {packages = [], baseConfig = defaultConfig, schema, doc}
  : {packages?: string[], baseConfig?: EditorStateConfig, schema?: Schema, doc?: Node}) => {
  const activeSchema = schema? schema: new Schema(createSchemaSpec(packages))
  const resolvedDoc = doc ?? activeSchema.node(
    defaultConfig.doc.type.name,
    defaultConfig.doc.attrs,
    Fragment.fromJSON(activeSchema, defaultConfig.doc.content.toJSON()),
    defaultConfig.doc.marks
  ) ?? baseConfig.doc
  return EditorState.create({
    doc: resolvedDoc,
    selection: baseConfig.selection,
    storedMarks: baseConfig.storedMarks,
    plugins: baseConfig.plugins,
  })
}
*/

export const createEditorState = ({schema=defaultConfig.schema, doc=defaultConfig.doc, selection=defaultConfig.selection, storedMarks=defaultConfig.storedMarks, plugins=defaultConfig.plugins}: EditorStateConfig) => {
  const resolvedDoc = schema.nodeFromJSON(doc.toJSON())
  return EditorState.create({schema, selection, storedMarks, plugins, doc: resolvedDoc})
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