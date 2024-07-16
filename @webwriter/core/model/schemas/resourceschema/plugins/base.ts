import { Command, EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { SchemaPlugin } from ".";
import { Node, Attrs } from "prosemirror-model";
import { baseKeymap, chainCommands, createParagraphNear, deleteSelection, exitCode, joinBackward, joinForward, joinUp, liftEmptyBlock, macBaseKeymap, newlineInCode, selectAll, selectNodeBackward, selectNodeForward, splitBlock } from "prosemirror-commands";
import { namedNodeMapToObject } from "../../../../utility";
import pmGapcursorCSS from "prosemirror-gapcursor/style/gapcursor.css?raw"
import pmCSS from "prosemirror-view/style/prosemirror.css?raw"
import editingCSS from "../editingstyles.css?raw"
import shoelaceCSS from "@shoelace-style/shoelace/dist/themes/light.css?raw"
import virtualCursorCSS from "prosemirror-view/style/prosemirror.css?raw"
import { HTMLElementSpec } from "../htmlelementspec";
import { CustomElementName } from "../../packageschema";

import { Step, StepResult } from "prosemirror-transform"

export const selectParentNode: Command = (state, dispatch, view) => {
  const {selection, doc} = state
  const {empty, $from} = selection
  if($from.parent.type.name === state.schema.topNodeType.name) {
    return false
  }
  const pos = $from.before($from.depth)
  const $pos = doc.resolve(pos)
  const newSelection = new NodeSelection($pos)
  const tr = state.tr.setSelection(newSelection)
  dispatch && dispatch(tr)
  return true
}

export const selectFirstChildNode: Command = (state, dispatch, view) => {
  const {selection, doc} = state
  const {empty, $from} = selection
  if(!(selection instanceof NodeSelection)) {
    return false
  }
  const pos = $from.posAtIndex(0, $from.depth + 1)
  const $pos = doc.resolve(pos)
  const newSelection = $pos.node().isTextblock
    ? new TextSelection($pos)
    : new NodeSelection($pos)
  const tr = state.tr.setSelection(newSelection)
  dispatch && dispatch(tr)
  return true
}

export const splitParent: Command = (state, dispatch, view) => {
  const {$from} = state.selection;
  (dispatch ?? (() => null))(state.tr
    .deleteSelection()
    .split($from.pos, Math.min(2, $from.depth))
  )
  return true
}

export class SetDocAttrsStep extends Step {

  prevAttrs: Attrs

  constructor (readonly attrs: Attrs) {
    super()
  }

  get stepType () { return 'setDocAttrs' }

  apply(doc: Node) {
    this.prevAttrs = doc.attrs // @ts-ignore
    doc.attrs = {...doc.attrs, ...this.attrs}
    return StepResult.ok(doc)
  }

  invert () {
    return new SetDocAttrsStep(this.prevAttrs)
  }

  map () { return this }

  toJSON () {
    return {
      stepType: this.stepType,
      attrs: this.attrs
    }
  }

  static fromJSON (schema: any, json: any) {
    return new SetDocAttrsStep(json.attrs)
  }

  static register () {
    try {
      Step.jsonID('setDocAttrs', SetDocAttrsStep)
    } catch (err: any) {
      if (err.message !== `JSON ID ${'setDocAttrs'} already in use`) throw err
    }
    return true
  }
}

export function getDocAttribute(state: EditorState, key: string, asArray=true): string {
  const attr = state.doc.attrs.meta[key]
  return attr == null || Array.isArray(attr) || !asArray? attr: [attr]
}

export function setDocAttributes(attrs: Record<string, any>): Command {
  return (state, dispatch, view) => {
    dispatch && dispatch(state.tr.step(new SetDocAttrsStep(attrs)))
    return true
  }
}

export const basePlugin = () => ({
  nodes: {
    explorable: HTMLElementSpec({
      tag: "body",
      content: `(p | flow)+`,
      phrasingContent: true,
      attrs: {
        onafterprint: {default: undefined},
        onbeforeprint: {default: undefined},
        onbeforeunload: {default: undefined},
        onblur: {default: undefined},
        onerror: {default: undefined},
        onfocus: {default: undefined},
        onhashchange: {default: undefined},
        onlanguagechange: {default: undefined},
        onload: {default: undefined},
        onmessage: {default: undefined},
        onoffline: {default: undefined},
        ononline: {default: undefined},
        onpopstate: {default: undefined},
        onredo: {default: undefined},
        onresize: {default: undefined},
        onstorage: {default: undefined},
        onundo: {default: undefined},
        onunload: {default: undefined}
      }
    }),
    p: HTMLElementSpec({
      tag: "p",
      group: "flow palpable",
      content: "text | phrasing*",
      whitespace: "pre"
    }),
    div: HTMLElementSpec({
      tag: "div:not(.ww-nodeview)",
      group: "flow palpable",
      content: "flow*"
    }),
    pre: HTMLElementSpec({
      tag: "pre",
      group: "flow palpable",
      content: "text | phrasing*",
      whitespace: "pre"
    }),
    /*unknownElement: {
      attrs: {
        tagName: {},
        otherAttrs: {default: {}}
      },
      parseDOM: [{
        tag: "*",
        getAttrs: dom => {
          if(typeof dom === "string") {
            return false
          }
          const tagName = dom.tagName.toLowerCase()
          const unknownBuiltin = dom.constructor.name === "HTMLUnknownElement"
          const unknownCustom = !window.customElements.get(tagName)
          const knownDashed = ["annotation-xml"].includes(tagName)
          if((unknownBuiltin || unknownCustom) && !knownDashed) {
            return {tagName, otherAttrs: namedNodeMapToObject(dom.attributes)}
          }
          else return false
        },
        priority: 0
      }],
      toDOM: node => [node.attrs.tagName, {
        ...node.attrs.otherAttrs,
        "data-ww-editing": CustomElementName.safeParse(node.attrs.tagName).success? "unknowncustom": "unknownbuiltin",
        "data-ww-tagname": node.attrs.tagName
      }]
    },*/
  },
  topNode: "explorable",
  keymap: {
    "Enter": chainCommands(
      newlineInCode,
      createParagraphNear,
      liftEmptyBlock,
      splitBlock
    ),
    "Mod-Enter": chainCommands(
      splitParent,
      exitCode
    ),
    "Backspace": chainCommands(
      deleteSelection,
      joinBackward,
      selectNodeBackward
    ),
    "Mod-Backspace": chainCommands(
      joinUp,
      deleteSelection,
      joinBackward,
      selectNodeBackward
    ),
    "Delete": chainCommands(
      deleteSelection,
      joinForward,
      selectNodeForward
    ),
    "Mod-Delete": chainCommands(
      joinUp,
      deleteSelection,
      joinForward,
      selectNodeForward
    ),
    "Mod-a": selectAll,
    "Mod-Alt-ArrowLeft": selectParentNode,
    "Mod-Alt-ArrowRight": selectFirstChildNode
        /*
    "Backspace": (state, dispatch, view) => {
      const {selection, doc, tr} = state
      const $pos = selection.$from
      const k = $pos.parentOffset
      const indices = [...range(0, $pos.depth).map(d => $pos.index(d)), k]
      const isAtStartOfFirstBranch = indices.every(i => i === 0)
      const isEmptyFirstP = $pos.node().type.name === "p" && $pos.depth === 1
      if(isAtStartOfFirstBranch && selection.empty && !isEmptyFirstP) {
        return wrapSelection("p")(state, dispatch, view)
      }
      else {
        return false
      }
    },*/
  },
  styles: [pmCSS, pmGapcursorCSS, shoelaceCSS, editingCSS]
} as SchemaPlugin)


