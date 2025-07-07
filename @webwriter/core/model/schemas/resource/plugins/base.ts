import { Command, EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { insertBreak, insertWordBreak, SchemaPlugin } from ".";
import { Node, Attrs, Mark, MarkSpec, NodeType } from "prosemirror-model";
import { chainCommands, createParagraphNear, deleteSelection, exitCode, joinBackward, joinForward, joinUp, liftEmptyBlock, newlineInCode, selectAll, selectNodeBackward, selectNodeForward, toggleMark } from "prosemirror-commands";
import { namedNodeMapToObject } from "#utility";
import pmGapcursorCSS from "prosemirror-gapcursor/style/gapcursor.css?raw"
import pmCSS from "prosemirror-view/style/prosemirror.css?raw"
import editingCSS from "./base.css?raw"
import shoelaceCSS from "@shoelace-style/shoelace/dist/themes/light.css?raw"
import { CustomElementName, HTMLElementSpec } from "#model";
import { commentMarkSpec } from "../comment";

import { canSplit, Step, StepResult } from "prosemirror-transform"

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

export const splitParent: (typeAfter?: string) => Command = (typeAfter?) => (state, dispatch, view) => {
  let tr = state.tr.deleteSelection()
  const pos = tr.selection.anchor
  const depth = tr.selection.$from.depth
  try {
    const node = tr.selection.$anchor.node()
    tr = tr.split(pos, Math.min(2, depth), typeAfter? [{type: state.schema.nodes[typeAfter]}, {type: node.type, attrs: node.attrs}]: undefined)
    let resolved = tr.doc.resolve(tr.doc.resolve(pos).after())
    if(resolved.node().type.spec.widget) {
      tr = tr.setNodeAttribute(resolved.pos + 1, "id", `ww-${crypto.randomUUID()}`)
    }
    dispatch && dispatch(tr)
    return true
  }
  catch {
    return false
  }
}

export const splitOrBreak: Command = (state, dispatch, view) => {
  let tr = state.tr.deleteSelection()
  const pos = tr.selection.anchor
  const $pos = tr.selection.$anchor
  if(canSplit(tr.doc, pos) && !$pos.parent.type.spec.isolating) {
    tr = tr.split(pos)
    let resolved = tr.doc.resolve(tr.doc.resolve(pos).after())
    if(resolved.nodeAfter?.type.spec.widget) {
      tr = tr.setNodeAttribute(resolved.pos + 1, "id", `ww-${crypto.randomUUID()}`)
    }
    dispatch && dispatch(tr)
    return true
  }
  else {
    return insertBreak(state, dispatch, view)
  }
}

export const joinUpIfAtStart: Command = (state, dispatch, view) => {
  const {selection} = state
  if(selection.empty && selection.$anchor.parentOffset === 0 && selection.$anchor.index(selection.$anchor.depth - 1) === 0) {
    return joinUp(state, dispatch, view)
  }
  else {
    return false
  }
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
  return attr == null || Array.isArray(attr) || !asArray? attr: [attr] as any
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
      content: `(p | flow)*`, // mixed
      draggable: false,
      selectable: false,
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
      group: "flow palpable containerinline",
      content: "text | phrasing*",
      whitespace: "pre"
    }),
    div: HTMLElementSpec({
      tag: "div",
      selector: "div:not(.ww-nodeview)",
      group: "flow palpable",
      content: "flow*", // mixed
    }),
    pre: HTMLElementSpec({
      tag: "pre",
      group: "flow palpable containerinline",
      content: "text | phrasing*",
      whitespace: "pre"
    }),
    hr: HTMLElementSpec({
      tag: "hr",
      group: "flow"
    }),
    text: {
      group: "phrasing containerinline",
      inline: true
    },
    _phrase: HTMLElementSpec({
      tag: "span",
      content: "text*",
      group: "flow",
      toDOM: () => ["span", {"data-ww-editing": "phrase"}, 0],
      parseDOM: [{tag: "span[data-ww-editing=phrase]"}]
    }),
    _inlineblock: HTMLElementSpec({
      tag: "span",
      content: "flow*",
      group: "phrasing",
      inline: true,
      toDOM: () => ["span", {"data-ww-editing": "phrase"}, 0],
      parseDOM: [{tag: "span[data-ww-editing=phrase]"}]
    }),
    br: HTMLElementSpec({
      tag: "br",
      selector: "br:not(.ProseMirror-trailingBreak)",
      group: "phrasing",
      inline: true,
      linebreakReplacement: true
    }),
    unknownElement: {
      attrs: {
        tagName: {},
        otherAttrs: {default: {}}
      },
      group: "flow",
      parseDOM: [{
        tag: "*",
        getAttrs: dom => {
          if(typeof dom === "string" || dom?.tagName === "HTML" || dom?.tagName === "HEAD") {
            return false
          }
          const tagName = dom.tagName.toLowerCase()
          const knownDashed = ["annotation-xml"].includes(tagName)
          const unknownBuiltin = dom.constructor.name === "HTMLUnknownElement"
          const unknownCustom = CustomElementName.safeParse(tagName).success && !window.customElements.get(tagName) && !knownDashed
          if((unknownBuiltin || unknownCustom) && !knownDashed) {
            return {tagName, otherAttrs: namedNodeMapToObject(dom.attributes)}
          }
          else return false
        },
        priority: 0
      }],
      toDOM: node => [node.attrs.tagName, {
        ...node.attrs.otherAttrs,
        "data-ww-editing": CustomElementName.safeParse(node.attrs.tagName).success && node.attrs.tagName !== "annotation-xml"? "unknowncustom": "unknownbuiltin",
        "data-ww-tagname": node.attrs.tagName
      }]
    },
  },
  topNode: "explorable",
  marks: {
    _comment: commentMarkSpec,
  },
  keymap: {
    "Enter": chainCommands(
      newlineInCode,
      createParagraphNear,
      liftEmptyBlock,
      splitOrBreak
    ),
    "Mod-Enter": chainCommands(
      splitParent(),
      createParagraphNear,
      exitCode
    ),
    "alt-Enter": insertBreak,
    "alt-shift-Enter": insertWordBreak,
    "Backspace": chainCommands(
      deleteSelection,
      joinBackward,
      selectNodeBackward
    ),
    "Mod-Backspace": chainCommands(
      joinUpIfAtStart,
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


