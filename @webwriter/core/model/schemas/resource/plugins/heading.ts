import { chainCommandsIf } from "#model/utility/index.js";
import { createParagraphNear } from "prosemirror-commands";
import { SchemaPlugin } from ".";
import { HTMLElementSpec } from "../htmlelementspec";
import { findParentNode } from "prosemirror-utils";

export const headingPlugin = () =>
  ({
    nodes: {
      ...Object.fromEntries(
        ["h1", "h2", "h3", "h4", "h5", "h6"].map((tag) => [
          tag,
          HTMLElementSpec({
            tag,
            group: "flow heading palpable containerinline",
            content: "phrasing*",
            defining: true,
          }),
        ])
      ),
      hgroup: HTMLElementSpec({
        tag: "hgroup",
        group: "flow heading palpable containerblock",
        content: "h1 | h2 | h3 | h4 | h5 |h6",
      }),
    },
    keymap: {
      "Enter": chainCommandsIf(
        state => {
          console.log(findParentNode(node => ["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.type.name))(state.selection))
          return Boolean(findParentNode(node => ["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.type.name))(state.selection))
        },
        (state, dispatch) => {
          dispatch && dispatch(state.tr.split(state.selection.to, undefined, [{type: state.schema.nodes["p"]}]))
          return true
        } 
      ),
    }
  } as SchemaPlugin);
