import { EditorState } from "prosemirror-state";
import { SchemaPlugin } from ".";
import { InputRule } from "prosemirror-inputrules";


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

export const inlinetextPlugin = () => ({
  nodes: {
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
  },
  marks: {
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
        href: {default: ""},
        title: {default: null}
      },
      inclusive: true,
      parseDOM: [{tag: "a[href]", getAttrs: (dom: HTMLElement) => ({
        href: dom.getAttribute("href"),
        title: dom.getAttribute("title")
      })}] as any,
      toDOM: (mark, inline) => ["a", {href: mark.attrs.href}]
    },
    textBackground: {
      attrs: {
        color: {default: "#fff000"}
      },
      parseDOM: [{tag: "span", getAttrs: (dom: HTMLElement | string) => ({
        color: (dom as HTMLElement).style.backgroundColor
      })}],
      toDOM: node => ["span", {style: `background-color: ${node.attrs.color}`}, 0],
    },
    textColor: {
      attrs: {
        value: {default: "unset"}
      },
      parseDOM: [{tag: "span", style: "color", getAttrs: (dom: string |HTMLElement) => ({
        value: (dom as HTMLElement).style.color
      })}],
      toDOM: node => ["span", {style: `color: ${node.attrs.value}`}, 0]
    },
  },
  inputRules: [
    new InputRule(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/, (state, match, start, end) => {
      const href = match[0]
      const linkMark = state.schema.mark("link", {href})
      const textNode = state.schema.text(href, [linkMark])
      return state.tr.replaceRangeWith(start, end, textNode)
    })
  ]
} as SchemaPlugin)