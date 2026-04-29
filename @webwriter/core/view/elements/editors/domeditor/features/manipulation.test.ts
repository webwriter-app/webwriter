// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, beforeAll } from "vitest"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "../domeditor"
import { $ } from "../utility"

var editor = new DOMEditor()

/*
Selection: caret, gap, node, text, span (reversed)
Context nodes: text, comment, element
Parameters: Per function 
*/

function expectBodyToBe(html: string) {
  return expect(editor.toHTML(true)).toEqual(html)
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("insert()", () => { // deletes selection => selection = caret/gap
  it("can insert <p> at document start", () => {
    const p = document.createElement("p")
    editor.features.manipulation.insert(p)
    expect(document.body.firstElementChild).toBe(p)
  })
  it("can laxly insert invalid content", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild?.firstChild!, 2)
    const p = document.createElement("p")
    p.textContent = "test"
    editor.features.manipulation.insert(p)
    expectBodyToBe("<p>he<p>test</p>llo world</p>")
  })/*
  it("can insert conformantly with split+insert", () => {
    editor.replaceContent("<p>hello world</p>")
    $.move(document.body.firstElementChild?.firstChild!, 2)
    const p = document.createElement("p")
    p.textContent = "test"
    editor.features.manipulation.insert(p, true)
    expectBodyToBe("<p>he</p><p>test</p><p>llo world</p>")
  })*/
})
describe("delete()")
describe("split()")
describe("join()")
describe("wrap()", () => {
  it("wraps a <p> in a <div>", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.wrap(document.createElement("div"))
    expectBodyToBe(`<div><p>hello world</p></div>`)
  })
  it("wraps text in a <b>", async () => {
    document.body.innerHTML = "hello world"
    $.selectRange(document.body.firstChild!, 0, document.body.firstChild!, 5)
    editor.features.manipulation.wrap(document.createElement("b"))
    expectBodyToBe(`<b>hello</b> world`)
  })
})
describe("lift()")
describe("copy()", () => {
  it("fills the clipboard with correct HTML", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.copy()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expectBodyToBe(html!)
  })
})
describe("cut()", () => {
  it("fills the clipboard with correct HTML", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.cut()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expect(html).toBe("<p>hello world</p>")
  })
  it("removes content from the DOM", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.cut()
    expectBodyToBe("")
  })
})
describe("paste()", () => {
  it("fills the DOM with correct HTML clipboard content", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "test",
      "text/html": "<p>hello world</p>"
    })])
    $.selectDocumentStart()
    await editor.features.manipulation.paste()
    expectBodyToBe("<p>hello world</p>")
  })
})
describe("setAttributes()", () => {
  it("can set a title attribute", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({title: "test"})
    expect((document.body.firstElementChild as HTMLElement).title).toEqual("test")
  })
  it("can remove an attribute by passing null", () => {
    document.body.innerHTML = `<p title="test">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({title: null})
    expect((document.body.firstElementChild as HTMLElement)).not.toHaveAttribute("title")
  })
})
describe("setStyle()", () => {
  it("can set a style property", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: "50px"})
    expect(document.body.firstElementChild).toHaveStyle({width: "50px"})
  })
  it("can remove a property by passing the empty string", () => {
    document.body.innerHTML = `<p style="width: 50px">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: ""})
    expect(document.body.firstElementChild).not.toHaveStyle({width: "50px"})
  })
})