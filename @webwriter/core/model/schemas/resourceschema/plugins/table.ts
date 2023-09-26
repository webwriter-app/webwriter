import { tableNodes, tableEditing } from "prosemirror-tables";
import { SchemaPlugin } from ".";
import pmTablesCSS from "prosemirror-tables/style/tables.css?raw"
import { HTMLElementSpec } from "../htmlelementspec";

export const tablePlugin = () => ({
  nodes: {
    table: HTMLElementSpec({
      tag: "table",
      group: "flow",
      content: "caption? colgroup* thead? (tbody* | tr+) tfoot?"
    }),
    caption: HTMLElementSpec({
      tag: "caption",
      content: "flow*"
    }),
    col: HTMLElementSpec({
      tag: "col"
    }),
    colgroup: HTMLElementSpec({
      tag: "colgroup",
      content: "col*"
    }),
    tbody: HTMLElementSpec({
      tag: "tbody",
      content: "tr*"
    }),
    td: HTMLElementSpec({
      tag: "td",
      group: "sectioningroot",
      content: "flow"
    }),
    tfoot: HTMLElementSpec({
      tag: "tfoot",
      content: "tr*"
    }),
    th: HTMLElementSpec({
      tag: "th",
      content: "tr*"
    }),
    thead: HTMLElementSpec({
      tag: "thead",
      content: "tr*"
    }),
    tr: HTMLElementSpec({
      tag: "tr",
      content: "(td | th | scriptsupporting)*"
    }),
  },
  plugin: tableEditing(),
  styles: [pmTablesCSS]
} as SchemaPlugin)