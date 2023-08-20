import { tableNodes, tableEditing } from "prosemirror-tables";
import { SchemaPlugin } from ".";

export const tablePlugin = () => ({
  nodes: {
    ...tableNodes
  },
  plugin: tableEditing()
} as SchemaPlugin)