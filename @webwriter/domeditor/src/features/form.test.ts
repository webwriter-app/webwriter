// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {DOMEditor} from "../domeditor"
import {formElementTypes} from "../form"
import {Schema} from "../schema"

let editor: DOMEditor
beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
})
afterEach(() => editor.destroy())

describe("unsupported form authoring", () => {
  it("does not register form authoring commands", () => {
    expect(editor.features).not.toHaveProperty("form")
  })

  it.each(formElementTypes)("excludes %s from the schema and insertion candidates", tag => {
    expect(Schema.baseSchema).not.toHaveProperty(tag)
    expect(editor.schema.findValidContentTypes("body")).not.toContain(tag)
    expect(editor.schema.isNodeValid(document.createElement(tag), {group: "flow"})).toBe(false)
  })

  it("preserves form DOM already owned by a widget", () => {
    const {fragment} = editor.parseHTMLFragment('<test-widget><form><input value="keep"></form></test-widget>', true)
    expect(fragment.firstElementChild?.innerHTML).toBe('<form><input value="keep"></form>')
  })
})
