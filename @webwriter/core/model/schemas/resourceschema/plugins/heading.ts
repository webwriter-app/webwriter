import { SchemaPlugin } from ".";
import { HTMLElementSpec } from "../htmlelementspec";

export const headingPlugin = () =>
  ({
    nodes: {
      ...Object.fromEntries(
        ["h1", "h2", "h3", "h4", "h5", "h6"].map((tag) => [
          tag,
          HTMLElementSpec({
            tag,
            group: "flow heading palpable",
            content: "phrasing*",
            defining: true,
          }),
        ])
      ),
      hgroup: HTMLElementSpec({
        tag: "hgroup",
        group: "flow heading palpable",
        content: "h1 | h2 | h3 | h4 | h5 |h6",
      }),
    },
  } as SchemaPlugin);
