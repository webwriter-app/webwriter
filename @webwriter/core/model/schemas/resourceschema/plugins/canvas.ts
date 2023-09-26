import { SchemaPlugin } from ".";
import { HTMLElementSpec } from "../htmlelementspec";

export const canvasPlugin = () => ({
  nodes: {
    canvas: HTMLElementSpec({tag: "canvas", group: "flow embedded palpable", attrs: {
      height: {default: undefined},
      width: {default: undefined}
    }}),
  }
} as SchemaPlugin)