import { SchemaPlugin} from ".";
import { HTMLElementSpec, HTMLMarkSpec } from "../htmlelementspec";



export const sectionPlugin = () => ({
  nodes: {
    figure: HTMLElementSpec({
      tag: "figure",
      group: "flow palpable containerblock",
      content: `(figcaption? flow*) | (flow* figcaption?)`
    }),
    figcaption: HTMLElementSpec({
      tag: "figcaption",
      group: "containerinline",
      content: "phrasing*"
    })
  },
  marks: { // "body" belongs here but is handled especially since it is the root node for ProseMirror
    article: HTMLMarkSpec({
      tag: "article",
      group: "flow sectioning _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    aside: HTMLMarkSpec({
      tag: "aside",
      group: "flow sectioning palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    nav: HTMLMarkSpec({
      tag: "nav",
      group: "flow sectioning palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    section: HTMLMarkSpec({
      tag: "section",
      group: "flow sectioning palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    header: HTMLMarkSpec({
      tag: "header",
      group: "flow palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    footer: HTMLMarkSpec({
      tag: "footer",
      group: "flow palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    main: HTMLMarkSpec({
      tag: "main",
      group: "flow palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    search: HTMLMarkSpec({
      tag: "search",
      group: "flow palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),
    address: HTMLMarkSpec({
      tag: "address",
      group: "flow palpable _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    }),  
    blockquote: HTMLMarkSpec({
      tag: "blockquote",
      group: "flow _semanticsection",
      content: "flow*", // mixed
      excludes: ""
    })
  }
} as SchemaPlugin)