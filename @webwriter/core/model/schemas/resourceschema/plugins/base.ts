import { EditorState } from "prosemirror-state";
import { SchemaPlugin } from ".";
import { baseKeymap } from "prosemirror-commands";
import { namedNodeMapToObject } from "../../../../utility";

export function getDocAttribute(state: EditorState, key: string, asArray=true): string {
  const attr = state.doc.attrs.meta[key]
  return attr == null || Array.isArray(attr) || !asArray? attr: [attr]
}

export const basePlugin = () => ({
  nodes: {
    explorable: {
      content: "container+ ((leaf | container) container+)* container*",
      parseDOM: [{tag: "body"}]
    },
    unknownElement: {
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
  },
  topNode: "explorable",
  keymap: baseKeymap
} as SchemaPlugin)