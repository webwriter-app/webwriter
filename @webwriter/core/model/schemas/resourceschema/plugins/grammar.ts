import { SchemaPlugin } from ".";
import { HTMLElementSpec } from "../htmlelementspec";
import { Mark, MarkSpec } from "prosemirror-model";

export const grammarPlugin = () =>
  ({
    marks: {
      grammar: {
        parseDOM: [{ tag: "gr" }],
        toDOM: () => [
          "gr",
          {
            class: "grammar-mark",
          },
          0,
        ],
        inclusive: false,
      } as MarkSpec,
    },
  } as SchemaPlugin);
