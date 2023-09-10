import { Command, EditorState } from "prosemirror-state";
import { SchemaPlugin } from ".";
import { Node, Attrs } from "prosemirror-model";
import { baseKeymap } from "prosemirror-commands";
import { namedNodeMapToObject } from "../../../../utility";
import pmGapcursorCSS from "prosemirror-gapcursor/style/gapcursor.css?raw"
import pmCSS from "prosemirror-view/style/prosemirror.css?raw"
import editingCSS from "../editingstyles.css?raw"
import shoelaceCSS from "@shoelace-style/shoelace/dist/themes/light.css?raw"
import { HTMLElementSpec } from "../htmlelementspec";
import { CustomElementName } from "../../packageschema";

import { Step, StepResult } from "prosemirror-transform"

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
      content: "container+ ((leaf | container) container+)* container*"
    }),
    unknownElement: {
      group: "leaf",
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
          if(unknownBuiltin || unknownCustom) {
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
    }
  },
  topNode: "explorable",
  keymap: baseKeymap,
  styles: [pmCSS, pmGapcursorCSS, shoelaceCSS, editingCSS]
} as SchemaPlugin)