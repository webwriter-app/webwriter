import { tableNodes, tableEditing } from "prosemirror-tables";
import { SchemaPlugin } from ".";
import pmTablesCSS from "prosemirror-tables/style/tables.css?raw"

export const tablePlugin = () => ({
  nodes: {
    ...tableNodes
  },
  plugin: tableEditing(),
  styles: [pmTablesCSS]
} as SchemaPlugin)