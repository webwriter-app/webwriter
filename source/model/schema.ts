import {Schema} from "prosemirror-model"
import {html, render} from "lit"

export const textSchema = new Schema({
  nodes: {
    text: {},
    paragraph: {
      content: "text*",
      toDOM: node => ["p", 0],
      parseDOM: [{tag: "p"}]

    },
    doc: {
      content: "paragraph*",
    }
  }
})