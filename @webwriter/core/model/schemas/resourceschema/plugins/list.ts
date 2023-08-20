import { bulletList, listItem, orderedList } from "prosemirror-schema-list";
import { SchemaPlugin } from ".";

export const listPlugin = () => ({
  nodes: {
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
    
    listItem: {
      ...listItem,
      content: "inline*",
    },
  }
} as SchemaPlugin)