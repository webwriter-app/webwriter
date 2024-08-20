import { SchemaPlugin} from ".";
import { HTMLElementSpec } from "../htmlelementspec";



export const sectionPlugin = () => ({
  nodes: { // "body" belongs here but is handled especially since it is the root node for ProseMirror
    figure: HTMLElementSpec({
      tag: "figure",
      group: "flow palpable containerblock",
      content: `(figcaption? flow*) | (flow* figcaption?)`
    }),
    figcaption: HTMLElementSpec({
      tag: "figcaption",
      group: "containerinline",
      content: "phrasing*"
    }),
    article: HTMLElementSpec({
      tag: "article",
      group: "flow sectioning palpable containerblock",
      content: "flow*" // mixed
    }),
    aside: HTMLElementSpec({
      tag: "aside",
      group: "flow sectioning palpable containerblock",
      content: "flow*" // mixed
    }),
    nav: HTMLElementSpec({
      tag: "nav",
      group: "flow sectioning palpable containerblock",
      content: "flow*" // mixed
    }),
    section: HTMLElementSpec({
      tag: "section",
      group: "flow sectioning palpable containerblock",
      content: "flow*" // mixed
    }),
    header: HTMLElementSpec({
      tag: "header",
      group: "flow palpable containerblock",
      content: "flow*" // mixed
    }),
    footer: HTMLElementSpec({
      tag: "footer",
      group: "flow palpable containerblock",
      content: "flow*" // mixed
    }),
    main: HTMLElementSpec({
      tag: "main",
      group: "flow palpable containerblock",
      content: "flow*" // mixed
    }),
    search: HTMLElementSpec({
      tag: "search",
      group: "flow palpable containerblock",
      content: "flow*" // mixed
    }),
    address: HTMLElementSpec({
      tag: "address",
      group: "flow palpable containerblock",
      content: "(flow | embedded | interactive)*" // mixed
    }),  
    blockquote: HTMLElementSpec({
      tag: "blockquote",
      group: "flow containerblock",
      content: "flow*" // mixed
    })
  }
} as SchemaPlugin)