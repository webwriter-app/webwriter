import { Command, EditorState } from "prosemirror-state";
import { SchemaPlugin } from ".";
import { InputRule } from "prosemirror-inputrules";
import { HTMLElementSpec, HTMLMarkSpec } from "../htmlelementspec";
import {Mark, Node, MarkType} from "prosemirror-model"
import { chainCommands } from "prosemirror-commands";


export function getActiveMarks(state: EditorState, includeStored=true) {
  const stored = state.storedMarks ?? []
  const marks = new Set(includeStored? stored: [])
  if(state.selection.empty) {
    state.selection.$from.marks().forEach(mark => marks.add(mark))
  }
  else {
    state.doc.nodesBetween(state.selection.from, state.selection.to, node => {
      node.marks.forEach(mark => marks.add(mark))
    })
  }
	return Array.from(marks)
}

export function findMark(doc: Node, predicate: (mark: Mark, index: number, all: readonly Mark[]) => boolean) {
  let markPos = { start: -1, end: -1 };
  let mark: Mark
  doc.descendants((node, pos, parent, index) => {
        // stop recursing if result is found
    if (markPos.start > -1) {
      return false;
    }
    const markMatch = node.marks.find(predicate)
    if (markPos.start === -1 && markMatch) {
      markPos = {
        start: pos,
        end: pos + Math.max(node.textContent.length, 1),
      };
      mark = markMatch
    }
  })
  return {mark: mark!, ...markPos}
}

export const findMarkPosition = (mark: Mark | MarkType, doc: Node) => {
  let markPos = { start: -1, end: -1 };
  doc.descendants((node, pos) => {
    // stop recursing if result is found
    if (markPos.start > -1) {
      return false;
    }
    if (markPos.start === -1 && node.marks.some(m => mark instanceof Mark? mark.eq(m): m.type.name === mark.name)) {
      markPos = {
        start: pos,
        end: pos + Math.max(node.textContent.length, 1),
      };
    }
  });

  return markPos;
}

export const insertBreak: Command = (state, dispatch=()=>{}, view) => {
  dispatch(state.tr.replaceSelectionWith(state.schema.node("br")))
  return true
}

export const insertWordBreak: Command = (state, dispatch=()=>{}, view) => {
  dispatch(state.tr.replaceSelectionWith(state.schema.node("wbr")))
  return true
}

export function updateMark(mark: Mark, attrs: any = {}, from?: number, to?: number) {
  return (state: EditorState, dispatch: any) => {
    from = from ?? state.selection.from
    to = to ?? state.selection.to
    const newMark = mark.type.create(attrs)
    return dispatch(state.tr
      .removeMark(from, to, mark)
      .addMark(from, to, newMark)
    )
  }
}

export function toggleOrUpdateMark(mark: string, attrs: any = {}, forceUpdate=false, from?: number, to?: number) {
  return (state: EditorState, dispatch: any) => {
    const {empty} = state.selection
    from = from ?? state.selection.from
    to = to ?? state.selection.to
    const markType = mark in state.schema.marks? state.schema.marks[mark]: state.schema.marks["span"]
    const newMark = markType.create(attrs)
    const correspondingMark = getActiveMarks(state, true).find(m => m.type.name === mark)
    if(!empty && (forceUpdate || !correspondingMark || !correspondingMark?.eq(newMark))) {
      return dispatch(state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, newMark)
      )
    }
    if((forceUpdate || !correspondingMark) && empty) {
      return dispatch(state.tr.addStoredMark(newMark))
    }
    else if(correspondingMark && empty) {
      let cFrom, cTo; cFrom = cTo = from
      while(state.doc.resolve(cFrom).marks().includes(correspondingMark)) {
        cFrom--
      }
      while(state.doc.resolve(cTo+1).marks().includes(correspondingMark)) {
        cTo++
      }
      return dispatch(state.tr
        .removeMark(cFrom, cTo, correspondingMark)
        .removeStoredMark(correspondingMark)
      )
    }
    else {
      return dispatch(state.tr.removeMark(from, to, markType))
    }
  }
}

export function removeMark(mark: string) {
  return (state: EditorState, dispatch: any) => {
    const markType = state.schema.marks[mark]
    const {start, end} = findMarkPosition(markType, state.doc)
    return dispatch(state.tr.removeMark(start, end, markType))
  }
}

export const phrasingPlugin = () => ({
  nodes: {
    wbr: HTMLElementSpec({
      tag: "wbr",
      group: "phrasing",
      inline: true
    }),
  },
  marks: {
    a: HTMLMarkSpec({
      tag: "a",
      group: "phrasing",
      attrs: {
        download: {default: undefined},
        href: {default: undefined},
        ping: {default: undefined},
        hreflang: {default: undefined},
        referrerpolicy: {default: undefined},
        rel: {default: undefined},
        target: {default: undefined},
        type: {default: undefined}
      }
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
    }),
    _fontsize: HTMLMarkSpec({
      tag: "span",
      group: "phrasing",
      attrs: {value: {default: undefined}},
      toDOM: node => ["span", {style: `font-size: ${node.attrs.value}`}, 0],
      parseDOM: [
        {tag: "span", getAttrs: dom => {
          if(typeof dom === "string") {
            return false
          }
          return dom.style.length === 1 && dom.style.fontSize? {value: dom.style.fontSize}: false
        }}
      ]
    }),
    _fontfamily: HTMLMarkSpec({
      tag: "span",
      group: "phrasing",
      attrs: {value: {default: undefined}},
      toDOM: node => ["span", {style: `font-family: ${node.attrs.value}`}, 0],
      parseDOM: [
        {tag: "span", getAttrs: dom => {
          if(typeof dom === "string") {
            return false
          }
          return dom.style.length === 1 && dom.style.fontFamily? {value: dom.style.fontFamily}: false
        }}
      ]
    }),
    _color: HTMLMarkSpec({
      tag: "span",
      group: "phrasing",
      attrs: {value: {default: undefined}},
      toDOM: node => ["span", {style: `color: ${node.attrs.value}`}, 0],
      parseDOM: [
        {tag: "span", getAttrs: dom => {
          if(typeof dom === "string") {
            return false
          }
          return dom.style.length === 1 && dom.style.color? {value: dom.style.color}: false
        }}
      ]
    }),
    _background: HTMLMarkSpec({
      tag: "span",
      group: "phrasing",
      attrs: {value: {default: undefined}},
      toDOM: node => ["span", {style: `background: ${node.attrs.value}`}, 0],
      parseDOM: [
        {tag: "span", getAttrs: dom => {
          if(typeof dom === "string") {
            return false
          }
          return dom.style.length === 1 && dom.style.background? {value: dom.style.background}: false
        }}
      ]
    }),
    span: HTMLMarkSpec({
      tag: "span",
      group: "phrasing",
      parseDOM: [{tag: "span:not([data-ww-editing=phrase])"}],
      excludes: ""
    }),
  },
  inputRules: [
    new InputRule(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/, (state, match, start, end) => {
      const href = match[0]
      const aMark = state.schema.mark("a", {href})
      const textNode = state.schema.text(href, [aMark])
      return state.tr.replaceRangeWith(start, end, textNode)
    })
  ]
} as SchemaPlugin)