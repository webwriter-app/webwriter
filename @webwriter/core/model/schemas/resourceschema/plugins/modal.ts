import { SchemaPlugin } from ".";
import { HTMLElementSpec } from "../htmlelementspec";

export const modalPlugin = () => ({
  dialog: HTMLElementSpec({
    tag: "dialog",
    group: "flow sectioningroot",
    content: "flow*",
    attrs: {
      open: {default: undefined}
    }
  }),
  details: HTMLElementSpec({
    tag: "details",
    group: "flow sectioningroot interactive palpable",
    content: `summary flow*`,
    attrs: {
      open: {default: undefined}
    }
  }),
  summary: HTMLElementSpec({
    tag: "summary",
    content: "heading"
  })
} as SchemaPlugin)