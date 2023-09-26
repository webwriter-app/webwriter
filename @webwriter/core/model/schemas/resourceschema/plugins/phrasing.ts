import { EditorState } from "prosemirror-state";
import { SchemaPlugin } from ".";
import { InputRule } from "prosemirror-inputrules";
import { HTMLElementSpec, HTMLMarkSpec } from "../htmlelementspec";


export function getActiveMarks(state: EditorState, includeStored=true) {
  const stored = state.storedMarks ?? []
  const marks = new Set(includeStored? stored: [])
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
    node.marks.forEach(mark => marks.add(mark))
  })
	return Array.from(marks)
}

export function toggleOrUpdateMark(mark: string, attrs: any = {}) {
  return (state: EditorState, dispatch: any) => {
    const {from, to} = state.selection
    const markType = state.schema.marks[mark]
    const newMark = markType.create(attrs)
    const correspondingMark = getActiveMarks(state).find(m => m.type.name === mark)
    if(!correspondingMark || !correspondingMark?.eq(newMark)) {
      return dispatch(state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, newMark)
      )
    }
    else {
      return dispatch(state.tr.removeMark(from, to, markType))
    }
  }
}

export const phrasingPlugin = () => ({
  nodes: {
    text: {
      group: "phrasing",
      inline: true
    },
    br: HTMLElementSpec({
      tag: "br",
      group: "phrasing",
      inline: true
    }),
    wbr: HTMLElementSpec({
      tag: "wbr",
      group: "phrasing",
      inline: true
    }),
    _phrase: HTMLElementSpec({
      tag: "span",
      group: "flow",
      content: "phrasing*",
      toDOM: () => ["span", {"data-ww-editing": "phrase"}, 0],
      parseDOM: [{tag: "span[data-ww-editing=phrase]"}]
    })
  },
  marks: {
    a: HTMLMarkSpec({
      tag: "a",
      group: "phrasing"
    }),
    abbr: HTMLMarkSpec({
      tag: "abbr",
      group: "phrasing"
    }),
    b: HTMLMarkSpec({
      tag: "b",
      group: "phrasing"
    }),
    bdi: HTMLMarkSpec({
      tag: "bdi",
      group: "phrasing",
      attrs: {
        dir: {default: undefined as undefined | "ltr" | "rtl"}
      }
    }),
    bdo: HTMLMarkSpec({
      tag: "bdo",
      group: "phrasing",
      attrs: {
        dir: {default: undefined as undefined | "ltr" | "rtl"}
      }
    }),
    cite: HTMLMarkSpec({
      tag: "cite",
      group: "phrasing"
    }),
    code: HTMLMarkSpec({
      tag: "code",
      group: "phrasing"
    }),
    data: HTMLMarkSpec({
      tag: "data",
      group: "phrasing",
      attrs: {
        value: {default: undefined}
      }
    }),
    del: HTMLMarkSpec({
      tag: "del",
      group: "phrasing",
      attrs: {
        cite: {default: undefined as undefined | "string"},
        datetime: {default: undefined as undefined | "string"}
      }
    }),
    dfn: HTMLMarkSpec({
      tag: "dfn",
      group: "phrasing"
    }),
    em: HTMLMarkSpec({
      tag: "em",
      group: "phrasing"
    }),
    i: HTMLMarkSpec({
      tag: "i",
      group: "phrasing"
    }),
    ins: HTMLMarkSpec({
      tag: "ins",
      group: "phrasing",
      attrs: {
        cite: {default: undefined as undefined | "string"},
        datetime: {default: undefined as undefined | "string"}
      }
    }),
    kbd: HTMLMarkSpec({
      tag: "kbd",
      group: "phrasing"
    }),
    q: HTMLMarkSpec({
      tag: "q",
      group: "phrasing",
      attrs: {
        cite: {default: undefined as undefined | "string"}
      }
    }),
    ruby: HTMLMarkSpec({
      tag: "ruby",
      group: "phrasing"
    }),
    s: HTMLMarkSpec({
      tag: "s",
      group: "phrasing"
    }),
    samp: HTMLMarkSpec({
      tag: "samp",
      group: "phrasing"
    }),
    small: HTMLMarkSpec({
      tag: "small",
      group: "phrasing"
    }),
    span: HTMLMarkSpec({
      tag: "span",
      group: "phrasing",
      parseDOM: [{tag: "span:not([data-ww-editing=phrase])"}]
    }),
    strong: HTMLMarkSpec({
      tag: "strong",
      group: "phrasing"
    }),
    sub: HTMLMarkSpec({
      tag: "sub",
      group: "phrasing"
    }),
    sup: HTMLMarkSpec({
      tag: "sup",
      group: "phrasing"
    }),
    time: HTMLMarkSpec({
      tag: "time",
      group: "phrasing",
      attrs: {
        datetime: {default: undefined as undefined | "string"}
      }
    }),
    u: HTMLMarkSpec({
      tag: "u",
      group: "phrasing"
    }),
    var: HTMLMarkSpec({
      tag: "var",
      group: "phrasing"
    })
  },
  inputRules: [
    new InputRule(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/, (state, match, start, end) => {
      const href = match[0]
      const aMark = state.schema.mark("a", {href})
      const textNode = state.schema.text(href, [aMark])
      return state.tr.replaceRangeWith(start, end, textNode)
    })
  ],
  keymap: {
    "alt-Enter": (state, dispatch=()=>{}) => {
      dispatch(state.tr.replaceSelectionWith(state.schema.node("br")))
      return true
    },
    "alt-shift-Enter": (state, dispatch=()=>{}) => {
      dispatch(state.tr.replaceSelectionWith(state.schema.node("wbr")))
      return true
    }
  }
} as SchemaPlugin)