import { tableNodes as createTableNodes } from "prosemirror-tables"
import {NodeSpec, Attrs} from "prosemirror-model"
import {bulletList, orderedList, listItem} from "prosemirror-schema-list"

import { camelCaseToSpacedCase, namedNodeMapToObject } from "../../../utility"


export const styleAttrs = {
  textAlign: {default: null},
  lineHeight: {default: null},
  marginTop: {default: null},
  marginBottom: {default: null},
  marginLeft: {default: null},
  marginRight: {default: null},
  paddingTop: {default: null},
  paddingBottom: {default: null},
  paddingLeft: {default: null},
  paddingRight: {default: null},
  borderTop: {default: null},
  borderBottom: {default: null},
  borderLeft: {default: null},
  borderRight: {default: null},
  background: {default: null},
}

export function serializeStyleAttrs(attrs: Attrs) {
  return Object.keys(attrs)
    .filter(key => (key in styleAttrs) && attrs[key])
    .map(key => `${camelCaseToSpacedCase(key, false, "-")}: ${attrs[key]}`)
    .join("; ")
}

export function parseStyleAttrs(dom: HTMLElement | string) {
  console.log(typeof dom === "string"
  ? {} as Record<keyof typeof styleAttrs, string>
  : Object.fromEntries(Object.keys(styleAttrs)
    .map(k => [k, dom.style[k as keyof typeof dom.style]])
    .filter(([k, v]) => v)
  ) as Record<keyof typeof styleAttrs, string>)
  return typeof dom === "string"
    ? {} as Record<keyof typeof styleAttrs, string>
    : Object.fromEntries(Object.keys(styleAttrs)
      .map(k => [k, dom.style[k as keyof typeof dom.style]])
      .filter(([k, v]) => v)
    ) as Record<keyof typeof styleAttrs, string>
}

export type LeafNodeSpec =  NodeSpec & {group: "leaf"}


export const explorable: NodeSpec = {
  content: "container+ ((leaf | container) container+)* container*",
  attrs: {meta: {default: {}}},
  parseDOM: [{tag: "body"}]
}

export const leafNodes: Record<string, LeafNodeSpec> = {
  thematicBreak: {
    group: "leaf"
  }
}

export type InlineNodeSpec = NodeSpec & {group: "inline", inline: true}

export const inlineNodes: Record<string, InlineNodeSpec> = {
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


let tableNodes = createTableNodes({
  tableGroup: "container",
  cellContent: "inline*",
  cellAttributes: {}
})
tableNodes = {
  ...tableNodes,
  "table_row": {
    ...tableNodes["table_row"],
    content: "(table_cell | table_header)+"
  }
}

export type ContainerNodeSpec = NodeSpec & {group: "container", content: string} | typeof tableNodes

export const containerNodes: Record<string, ContainerNodeSpec> = {
  paragraph: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    whitespace: "pre",
    parseDOM: [{tag: "p", getAttrs: parseStyleAttrs}],
    toDOM: node => [
      "p",
      {
        style: serializeStyleAttrs(node.attrs)
      },
      0
    ]
  },
  
  blockquote: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    whitespace: "pre",
    parseDOM: [{tag: "blockquote", getAttrs: parseStyleAttrs}],
    toDOM: node => [
      "blockquote",
      {
        style: serializeStyleAttrs(node.attrs)
      },
      0
    ]
  },
  
  heading1: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    defining: true,
    parseDOM: [
      {tag: "h1", getAttrs: parseStyleAttrs},
    ],
    toDOM: node => ["h1", {style: serializeStyleAttrs(node.attrs)}, 0]
  },
  
  heading2: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    defining: true,
    parseDOM: [
      {tag: "h2", getAttrs: parseStyleAttrs},
    ],
    toDOM: node => ["h2", {style: serializeStyleAttrs(node.attrs)}, 0]
  },
  
  heading3: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    defining: true,
    parseDOM: [
      {tag: "h3", getAttrs: parseStyleAttrs},
    ],
    toDOM: node => ["h3", {style: serializeStyleAttrs(node.attrs)}, 0]
  },
  
  heading4: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    defining: true,
    parseDOM: [
      {tag: "h4", getAttrs: parseStyleAttrs},
    ],
    toDOM: node => ["h4", {style: serializeStyleAttrs(node.attrs)}, 0]
  },
  
  heading5: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    defining: true,
    parseDOM: [
      {tag: "h5", getAttrs: parseStyleAttrs},
    ],
    toDOM: node => ["h5", {style: serializeStyleAttrs(node.attrs)}, 0]
  },
  
  heading6: {
    group: "container",
    content: "inline*",
    attrs: {...styleAttrs},
    defining: true,
    parseDOM: [
      {tag: "h6", getAttrs: parseStyleAttrs},
    ],
    toDOM: node => ["h6", {style: serializeStyleAttrs(node.attrs)}, 0]
  },



  /*
  list: {
    group: "container",
    content: "listItem+",
    attrs: {
      isOrdered: {default: false},
      isTask: {default: false},
      order: {default: 1},
      tight: {default: false},
      ...styleAttrs
    },
    parseDOM: [{tag: "ol, ul", getAttrs: (dom: HTMLElement) => ({
      isOrdered: dom.tagName.toLowerCase() == "ol",
      order: dom.hasAttribute("start")? + dom.getAttribute("start")!: 1,
      tight: dom.hasAttribute("data-tight"),
      ...parseStyleAttrs(dom)
    })}] as any,
    toDOM: node => [node.attrs.isOrdered? "ol": "ul", {
      start: node.attrs.order == 1? null: node.attrs.order,
      "data-tight": node.attrs.tight? "true": null,
      style: serializeStyleAttrs(node.attrs)
    }, 0]
  },*/

  orderedList: {
    ...orderedList,
    group: "container",
    content: "listItem+"
  },

  unorderedList: {
    ...bulletList,
    group: "container",
    content: "listItem+"
  },
  
  drawer: {
    group: "container",
    content: "summary paragraph",
    attrs: {...styleAttrs},
    parseDOM: [{tag: "details", getAttrs: parseStyleAttrs}],
    toDOM: node => ["details", {open: true, style: serializeStyleAttrs(node.attrs)}, 0]
  },
  
  //@ts-ignore
  summary: {
    parseDOM: [{tag: "summary"}],
    content: "inline*",
    toDOM: node => ["summary", 0]
  },
  
  //@ts-ignore
  listItem: {
    ...listItem,
    content: "inline*",
  },

  ...tableNodes
}

export const unknownElement: NodeSpec = {
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