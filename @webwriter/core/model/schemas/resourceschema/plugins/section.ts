import { SchemaPlugin} from ".";
import { HTMLElementSpec } from "../htmlelementspec";



export const sectionPlugin = () => ({
  nodes: { // "body" belongs here but is handled especially since it is the root node for ProseMirror
    article: HTMLElementSpec({
      tag: "article",
      group: "flow sectioning palpable",
      content: "flow*"
    }),
    aside: HTMLElementSpec({
      tag: "aside",
      group: "flow sectioning palpable",
      content: "flow*"
    }),
    nav: HTMLElementSpec({
      tag: "nav",
      group: "flow sectioning palpable",
      content: "flow*"
    }),
    section: HTMLElementSpec({
      tag: "section",
      group: "flow sectioning palpable",
      content: "flow*"
    }),
    header: HTMLElementSpec({
      tag: "header",
      group: "flow palpable",
      content: "flow*"
    }),
    footer: HTMLElementSpec({
      tag: "footer",
      group: "flow palpable",
      content: "flow*",
      phrasingContent: true
    }),
    main: HTMLElementSpec({
      tag: "main",
      group: "flow palpable",
      content: "flow*"
    }),
    search: HTMLElementSpec({
      tag: "search",
      group: "flow palpable",
      content: "flow*"
    }),
    address: HTMLElementSpec({
      tag: "address",
      group: "flow palpable",
      content: "(flow | _phrase | embedded | interactive)*"
    }),  
    blockquote: HTMLElementSpec({
      tag: "blockquote",
      group: "flow",
      content: "flow*"
    })
  }
} as SchemaPlugin)