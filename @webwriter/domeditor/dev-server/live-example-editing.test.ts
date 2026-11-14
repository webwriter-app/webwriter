// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
import {mount} from "./live-example-editing"
import {widgetLookupForTags} from "../src/editor-artifacts"
import type {DOMEditorOptions} from "../src/domeditor-core"

const {createEditor} = vi.hoisted(() => ({createEditor: vi.fn()}))
vi.mock("../src/domeditor-core", () => ({
  DOMEditor: class {
    constructor(options: DOMEditorOptions) { createEditor(options) }
    destroy() {}
  },
}))

afterEach(() => { document.body.replaceChildren(); createEditor.mockClear() })

it("limits gallery editing to widgets and their light DOM without enabling the preview root", () => {
  document.body.innerHTML = `
    <p id="outside">Outside</p>
    <article><ww-editable><p id="inside">Inside</p><p id="locked" contenteditable="false">Locked</p></ww-editable></article>
    <ww-unregistered id="unregistered"></ww-unregistered>
  `
  const controller = mount(document.body, widgetLookupForTags(["ww-editable"]))
  try {
    const options: DOMEditorOptions = createEditor.mock.calls[0][0]
    expect(document.body.hasAttribute("contenteditable")).toBe(false)
    expect(options.widgets?.map(widget => widget.tagName)).toEqual(["ww-editable"])
    for(const permission of ["edit", "select"] as const) {
      const allows = (element: Element) => options.reader?.allows(permission, element)
      expect(allows(document.body)).toBe(false)
      expect(allows(document.getElementById("outside")!)).toBe(false)
      expect(allows(document.getElementById("unregistered")!)).toBe(false)
      expect(allows(document.querySelector("ww-editable")!)).toBe(true)
      expect(allows(document.getElementById("inside")!)).toBe(true)
      expect(allows(document.getElementById("locked")!)).toBe(false)
    }
  }
  finally { controller.destroy() }
})

it("keeps the documentation preview editable when mounted without a widget scope", () => {
  document.body.innerHTML = '<main contenteditable="false"><p>Example text</p></main>'
  const preview = document.querySelector("main")!
  const controller = mount(preview)
  try {
    expect(preview.contentEditable).toBe("true")
    const options: DOMEditorOptions = createEditor.mock.calls[0][0]
    expect(options.reader?.allows("edit", preview.querySelector("p")!)).toBe(true)
  }
  finally { controller.destroy() }
  expect(preview.getAttribute("contenteditable")).toBe("false")
})
