import {z} from "zod"

import {Schema, Node, NodeSpec, MarkSpec, Fragment, DOMSerializer} from "prosemirror-model"
import {Command, EditorState, EditorStateConfig, NodeSelection, TextSelection, Plugin} from "prosemirror-state"
import { baseKeymap, joinForward, selectNodeForward } from "prosemirror-commands"
import {keymap} from "prosemirror-keymap"
import {inputRules, InputRule} from "prosemirror-inputrules"
import { gapCursor } from "prosemirror-gapcursor"
import { history, undo, redo } from "prosemirror-history"
import { chainCommands, deleteSelection, joinBackward, selectNodeBackward} from "prosemirror-commands"
import { EditorView } from "prosemirror-view"
import { unscopePackageName } from "../../utility"
import * as marshal from "../../marshal"

const leafNodeSpecs: Record<string, NodeSpec & {group: "leaf"}> = {
  thematicBreak: {group: "leaf"}
}

export function getOtherAttrsFromWidget(dom: HTMLElement) {
  return Object.fromEntries(dom
    .getAttributeNames()
    .filter(name => !["editable", "printable", "analyzable", "contenteditable"].includes(name))
    .map(name => [name, dom.getAttribute(name)]))
}

function packageWidgetNodeSpec(tag: string, pkg: string): NodeSpec {
  return {
    group: "leaf",
    widget: true,
    package: pkg,
    selectable: true,
    preserveWhitespace: false,
    isolating: false,
    attrs: {
      id: {},
      editable: {default: false},
      printable: {default: false},
      analyzable: {default: false},
      otherAttrs: {default: {}}
    },
    parseDOM : [{tag, getAttrs: (dom: HTMLElement ) => {
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
    }}] as any,
    toDOM: (node: Node) => {
      return [node.type.name, {
        id: node.attrs.id,
        ...(node.attrs.editable? {"editable": true}: {}),
        ...(node.attrs.printable? {"printable": true}: {}),
        ...(node.attrs.analyzable? {"analyzable": true}: {}),
        ...node.attrs.otherAttrs,
        "class": "ww-widget"
      }]
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



const containerNodeSpecs: Record<string, NodeSpec & {group: "container"}> = {
  
  paragraph: {
    group: "container",
    content: "inline*",
    parseDOM: [{tag: "p"}],
    toDOM: (node: Node) => {
      const fragment = new DocumentFragment()
      const p = DOMSerializer.renderSpec(document, ["p", 0])
      p.contentDOM?.appendChild(document.createTextNode(" "))
      return p
    }
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
 
  orderedList: {
    group: "container",
    content: "listItem+",
    attrs: {order: {default: 1}, tight: {default: false}},
    parseDOM: [{tag: "ol", getAttrs: (dom: HTMLElement) => ({
      order: dom.hasAttribute("start")? +dom.getAttribute("start")!: 1,
      tight: dom.hasAttribute("data-tight")
    })}] as any,
    toDOM: node => ["ol", {
      start: node.attrs.order == 1? null: node.attrs.order,
      "data-tight": node.attrs.tight? "true": null
    }, 0]
  },
  
  bulletList: {
    group: "container",
    content: "listItem+",
    attrs: {tight: {default: false}},
    parseDOM: [{tag: "ul", getAttrs: (dom: HTMLElement) => ({
      tight: dom.hasAttribute("data-tight")
    })}] as any,
    toDOM: node => ["ul", {
      "data-tight": node.attrs.tight? "true": null
    }, 0]
  },
  
  listItem: {
    group: "container",
    content: "inline*",
    defining: true,
    parseDOM: [{tag: "li"}],
    toDOM: () => ["li", 0]
  }
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
  underline: {
    parseDOM: [
      {tag: "span", style: "text-decoration", getAttrs: (v: any) => v.includes("underline")}
    ],
    toDOM: () => ["span", {style: "text-decoration: underline"}]
  },
  link: {
    attrs: {
      href: {},
      title: {default: null}
    },
    inclusive: false,
    parseDOM: [{tag: "a[href]", getAttrs: (dom: HTMLElement) => ({
      href: dom.getAttribute("href"),
      title: dom.getAttribute("title")
    })}] as any
  }
}


export const createSchemaSpec = (packages: string[] = []) => {
  const widgetNodes = Object.fromEntries(packages.map(p => [
    unscopePackageName(p),
    packageWidgetNodeSpec(unscopePackageName(p), p)
  ]))
  return {
    topNode: "explorable",
    nodes: {
      explorable: {
        content: "paragraph+ ((leaf | container) paragraph+)* paragraph*",
        attrs: {meta: {default: {}}},
        parseDOM: [{tag: "body"}]
      } as NodeSpec,
      ...leafNodeSpecs,
      ...inlineNodeSpecs,
      ...containerNodeSpecs,
      ...widgetNodes
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
  "Control-z": undo,
  "Control-y": redo
}

const rules: InputRule[] = [
//  new InputRule(/^#{1,6} $/, "heading"),
//  new InputRule(/\*\*.$/, "bold"),
//  new InputRule(/\*.$/, "italic"),
]

function placeholder(text: string) {
  const update = (view: EditorView) => {
    if (view.state.doc.textContent || view.state.doc.childCount > 1 || view.state.doc?.firstChild?.type?.name !== "paragraph") {
      view.dom.removeAttribute('data-placeholder');
    } else {
      view.dom.setAttribute('data-placeholder', text);
    }
  };

  return new Plugin({
    view(view) {
      update(view);
      return { update };
    }
  });
}

export const defaultConfig: EditorStateConfig & {doc: Node} = {
  schema: baseSchema,
  doc: baseSchema.node(baseSchema.topNodeType, {}, [baseSchema.node("paragraph")]),
  plugins: [
    keymap({...baseKeymap, ...explorableKeymap}),
    inputRules({rules}),
    history(),
    placeholder("Enter content here...")
  ]
}

export function createSchema(packages: string[]) {
  return new Schema(createSchemaSpec(packages))
}

export const createEditorState = (
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