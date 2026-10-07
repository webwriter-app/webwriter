import {EditorFeature} from "."
import type {FloatSide} from "../element-styles"

/** Document arrangement uses native floats on the live selected element. */
export class LayoutFeature extends EditorFeature {
  refresh() {}
  getState() { return null }

  actions = {
    setFloat: ({side}: {type: "setFloat", side: FloatSide}) => {
      const manipulation = this.editor.features.manipulation
      return manipulation.setFloat(manipulation.styleTarget, side)
    },
  }
}
