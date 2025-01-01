import { tableNodes, tableEditing } from "prosemirror-tables";
import { SchemaPlugin } from ".";
import pmTablesCSS from "prosemirror-tables/style/tables.css?raw"
import { HTMLElementSpec } from "../htmlelementspec";

export const tablePlugin = () => ({
  nodes: {
    table: HTMLElementSpec({
      tag: "table",
      group: "flow containerblock",
      content: "caption? colgroup* thead? (tbody* | tr+) tfoot?"
    }),
    caption: HTMLElementSpec({
      tag: "caption",
      group: "containerblock",
      content: "flow*" // mixed
    }),
    col: HTMLElementSpec({
      tag: "col"
    }),
    colgroup: HTMLElementSpec({
      tag: "colgroup",
      group: "containerblock",
      content: "col*"
    }),
    tbody: HTMLElementSpec({
      tag: "tbody",
      group: "containerblock",
      content: "tr*"
    }),
    td: HTMLElementSpec({
      tag: "td",
      group: "sectioningroot containerblock",
      content: "flow*" // mixed
    }),
    tfoot: HTMLElementSpec({
      tag: "tfoot",
      group: "containerblock",
      content: "tr*"
    }),
    th: HTMLElementSpec({
      tag: "th",
      group: "containerblock",
      content: "tr*"
    }),
    thead: HTMLElementSpec({
      tag: "thead",
      group: "containerblock",
      content: "tr*"
    }),
    tr: HTMLElementSpec({
      tag: "tr",
      group: "containerblock",
      content: "(td | th | scriptsupporting)*"
    }),
  },
  plugin: tableEditing(),
  styles: [pmTablesCSS]
} as SchemaPlugin)