import { SchemaPlugin } from ".";
import { HTMLElementSpec, HTMLElementSpecPair } from "../htmlelementspec";

export const canvasPlugin = () => ({
  nodes: {
    ...HTMLElementSpecPair({
      canvas: {
        tag: "canvas",
        group: "flow embedded palpable",
        attrs: {
          height: {default: undefined},
          width: {default: undefined}
        }
      },
      canvas_inline: {inline: true, group: "phrasing"}
    })
  }
} as SchemaPlugin)