// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, beforeAll } from "vitest"
import "happy-dom"
import '@testing-library/jest-dom/vitest'

import { DOMEditor } from "../domeditor"
import { $, htmlToFragment } from "../utility"

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
  it("inserts a node at a gap between elements", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.insert(document.createElement("hr"))
    expectBodyToBe("<p>a</p><hr><p>b</p>")
  })
  it("replaces the selected element", () => {
    document.body.innerHTML = "<p>old</p>"
    $.selectElement(document.body.firstElementChild!)
    const p = document.createElement("p")
    p.textContent = "new"
    editor.features.manipulation.insert(p)
    expectBodyToBe("<p>new</p>")
  })
  it("splits the containing block when called without a node", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild!.firstChild!, 5)
    editor.features.manipulation.insert()
    expectBodyToBe("<p>hello</p><p> world</p>")
  })
  it("splits at the start of a block, leaving an empty block", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild!.firstChild!, 0)
    editor.features.manipulation.insert()
    expectBodyToBe("<p></p><p>hello world</p>")
  })
  it("splits an inseperable element into a clone when not strict", () => {
    document.body.innerHTML = "<h1>hello</h1>"
    $.move(document.body.firstElementChild!.firstChild!, 2)
    editor.features.manipulation.insert()
    expectBodyToBe("<h1>he</h1><h1>llo</h1>")
  })
  it("splits an inseperable element into a default node when strict", () => {
    document.body.innerHTML = "<h1>hello</h1>"
    $.move(document.body.firstElementChild!.firstChild!, 2)
    editor.features.manipulation.insert(undefined, 0, true)
    expectBodyToBe("<h1>he</h1><p>llo</p>")
  })/*
  it("can laxly insert invalid content", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild?.firstChild!, 2)
    const p = document.createElement("p")
    p.textContent = "test"
    editor.features.manipulation.insert(p)
    expectBodyToBe("<p>he<p>test< /p>llo world</p>")
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
describe("delete()", () => {
  it("deletes the selected text range", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.firstElementChild!.firstChild!, 6)
    editor.features.manipulation.delete()
    expectBodyToBe("<p>world</p>")
  })
  it("deletes a selected element", () => {
    document.body.innerHTML = "<p>hello</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.delete()
    expectBodyToBe("")
  })
  it("removes an empty element and moves the caret to the previous node", () => {
    document.body.innerHTML = "<p>a</p><p></p>"
    $.move(document.body.lastElementChild!, 0)
    editor.features.manipulation.delete()
    expectBodyToBe("<p>a</p>")
  })
  it("removes a sole empty element", () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.body.firstElementChild!, 0)
    editor.features.manipulation.delete()
    expectBodyToBe("")
  })
  it("merges two blocks on backward delete at the gap between them", () => {
    document.body.innerHTML = "<p>hello</p><p>world</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>helloworld</p>")
  })
  it("merges two blocks on forward delete at the gap between them", () => {
    document.body.innerHTML = "<p>hello</p><p>world</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>helloworld</p>")
  })
  it("removes only an empty previous element on backward delete", () => {
    document.body.innerHTML = "<p>a</p><p></p><h1>b</h1>"
    $.selectGap(document.body.children[1])
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>a</p><h1>b</h1>")
  })
  it("removes only an empty next element on forward delete", () => {
    document.body.innerHTML = "<p>a</p><h1></h1><p>b</p>"
    $.selectGap(document.body.children[1], "before")
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>a</p><p>b</p>")
  })
  it("removes an empty previous element when deleting backward at the next element's start", () => {
    document.body.innerHTML = "<p>a</p><p></p><h1>b</h1>"
    $.move(document.body.lastElementChild!.firstChild!, 0)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>a</p><h1>b</h1>")
  })
  it("removes an empty next element when deleting forward at the previous element's end", () => {
    document.body.innerHTML = "<p>a</p><h1></h1><p>b</p>"
    $.move(document.body.firstElementChild!.firstChild!, 1)
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>a</p><p>b</p>")
  })
  it("deletes from block start to the caret with block granularity", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.move(document.body.firstElementChild!.firstChild!, 5)
    editor.features.manipulation.delete("backward", "block")
    expectBodyToBe("<p> world</p>")
  })
  // character/word/line granularities rely on Selection.modify(), which
  // happy-dom does not implement, so they cannot be tested in this environment.
})
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
  it("accepts a fragment as wrapper", () => {
    document.body.innerHTML = "<p>a</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.wrap(htmlToFragment("<section></section>"))
    expectBodyToBe(`<section><p>a</p></section>`)
  })
  it("wraps multiple selected blocks", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectRange(document.body, 0, document.body, 2)
    editor.features.manipulation.wrap(document.createElement("div"))
    expectBodyToBe(`<div><p>a</p><p>b</p></div>`)
  })
  it("moves the current block into the previous element when called without a wrapper", () => {
    document.body.innerHTML = "<div>x</div><p>b</p>"
    $.move(document.body.lastElementChild!.firstChild!, 0)
    editor.features.manipulation.wrap()
    expectBodyToBe(`<div>x<p>b</p></div>`)
  })
  it("does nothing without a wrapper when there is no adjacent element", () => {
    document.body.innerHTML = "<p>b</p>"
    $.move(document.body.firstElementChild!.firstChild!, 0)
    const result = editor.features.manipulation.wrap()
    expect(result).toBeUndefined()
    expectBodyToBe(`<p>b</p>`)
  })
})
describe("lift()", () => {
  it("lifts an element out of its parent", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    $.selectElement(document.querySelector("p")!)
    editor.features.manipulation.lift()
    expectBodyToBe(`<p>hello</p>`)
  })
  it("lifts the element containing the caret", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    $.move(document.querySelector("p")!.firstChild!, 2)
    editor.features.manipulation.lift()
    expectBodyToBe(`<p>hello</p>`)
  })
  it("splits the parent around a lifted element with siblings", () => {
    document.body.innerHTML = "<div><p>a</p><p>b</p><p>c</p></div>"
    $.selectElement(document.querySelectorAll("p").item(1))
    editor.features.manipulation.lift()
    expectBodyToBe(`<div><p>a</p></div><p>b</p><div><p>c</p></div>`)
  })
  it("lifts multiple levels with depth", () => {
    document.body.innerHTML = "<section><div><p>x</p></div></section>"
    $.selectElement(document.querySelector("p")!)
    editor.features.manipulation.lift(2)
    expectBodyToBe(`<p>x</p>`)
  })
  it("does nothing for an element at the body level", () => {
    document.body.innerHTML = "<p>top</p>"
    $.selectElement(document.querySelector("p")!)
    editor.features.manipulation.lift()
    expectBodyToBe(`<p>top</p>`)
  })
  it("selects the lifted element", () => {
    document.body.innerHTML = "<div><p>hello</p></div>"
    const p = document.querySelector("p")!
    $.selectElement(p)
    editor.features.manipulation.lift()
    expect($.selectedElement).toBe(p)
  })
})
describe("copy()", () => {
  it("fills the clipboard with correct HTML", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.copy()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"))
    const html = await (await item?.getType("text/html"))?.text()
    expectBodyToBe(html!)
  })
  it("leaves the document unchanged", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.copy()
    expectBodyToBe("<p>hello world</p>")
  })
  it("fills the clipboard with a plain text flavor", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.copy()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/plain"))
    const text = await (await item?.getType("text/plain"))?.text()
    expect(text).toBe("hello world")
  })
  it("copies a plain text selection", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.firstElementChild!.firstChild!, 5)
    await editor.features.manipulation.copy()
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/plain"))
    const text = await (await item?.getType("text/plain"))?.text()
    expect(text).toBe("hello")
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
  it("cuts a partial text selection", async () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.firstElementChild!.firstChild!, 5)
    await editor.features.manipulation.cut()
    expectBodyToBe("<p> world</p>")
    const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/plain"))
    const text = await (await item?.getType("text/plain"))?.text()
    expect(text).toBe("hello")
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
  it("replaces the selected element with clipboard content", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "new",
      "text/html": "<p>new</p>"
    })])
    document.body.innerHTML = "<p>old</p>"
    $.selectElement(document.body.firstElementChild!)
    await editor.features.manipulation.paste()
    expectBodyToBe("<p>new</p>")
  })
  it("does insert text node if clipboard has no html but plain text", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "test"
    })])
    $.selectDocumentStart()
    await editor.features.manipulation.paste()
    expectBodyToBe("test")
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
  it("can set and remove attributes in the same call", () => {
    document.body.innerHTML = `<p id="old">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({title: "test", id: null})
    expect(document.body.firstElementChild).toHaveAttribute("title", "test")
    expect(document.body.firstElementChild).not.toHaveAttribute("id")
  })
  it("applies attributes to every element in a cross-block selection", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectRange(document.body.firstElementChild!.firstChild!, 0, document.body.lastElementChild!.firstChild!, 1)
    editor.features.manipulation.setAttributes({title: "test"})
    expect(document.body.firstElementChild).toHaveAttribute("title", "test")
    expect(document.body.lastElementChild).toHaveAttribute("title", "test")
  })
  it("does not affect elements outside the selection", () => {
    document.body.innerHTML = "<p>a</p><p>b</p><p>c</p>"
    $.selectElement(document.body.children.item(1)!)
    editor.features.manipulation.setAttributes({title: "test"})
    expect(document.body.children.item(0)).not.toHaveAttribute("title")
    expect(document.body.children.item(1)).toHaveAttribute("title", "test")
    expect(document.body.children.item(2)).not.toHaveAttribute("title")
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
  it("can set multiple properties at once", () => {
    document.body.innerHTML = "<p>hello world</p>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: "10px", color: "red"})
    expect(document.body.firstElementChild).toHaveStyle({width: "10px", color: "red"})
  })
  it("merges with existing inline styles", () => {
    document.body.innerHTML = `<p style="color: red">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setStyle({width: "50px"})
    expect(document.body.firstElementChild).toHaveStyle({color: "red", width: "50px"})
  })
})
