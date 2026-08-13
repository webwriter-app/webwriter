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
  $.selectDocumentStart()
})



describe("insert()", () => { // deletes selection => selection = caret/gap
  it("creates a real editing target before the first printable key is committed", () => {
    const event = new KeyboardEvent("keydown", {key: "a", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expectBodyToBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("creates a new paragraph before printable input is committed at a trailing gap", () => {
    document.body.innerHTML = "<p>existing</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.selection.processSelection()
    const event = new KeyboardEvent("keydown", {key: "a", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expectBodyToBe("<p>existing</p><p></p>")
    expect($.anchor).toBe(document.body.lastElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("creates a real editing target before an IME composition starts", () => {
    document.dispatchEvent(new CompositionEvent("compositionstart", {bubbles: true, data: ""}))

    expectBodyToBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
  })

  it("creates the first paragraph when Enter is pressed in an empty document", () => {
    const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("splits the initial paragraph when Enter is pressed again", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<p></p><p></p>")
    expect($.anchor).toBe(document.body.lastElementChild)
    expect($.anchorOffset).toBe(0)
  })

  it("handles insertParagraph beforeinput without a preceding key event", () => {
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertParagraph",
    })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p></p>")
  })

  it("inserts a line break into a text block from an empty document", () => {
    const event = new KeyboardEvent("keydown", {key: "Enter", shiftKey: true, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p><br></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect($.anchorOffset).toBe(1)
  })

  it("does not create content for a keyboard shortcut", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "b", ctrlKey: true, bubbles: true, cancelable: true}))

    expectBodyToBe("")
  })

  it("prepares an empty document for native text input and synchronizes the result", async () => {
    $.selectDocumentStart()

    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "a",
      inputType: "insertText",
    })
    document.body.dispatchEvent(event)

    const paragraph = document.body.firstElementChild
    expect(event.defaultPrevented).toBe(true)
    expect(paragraph?.tagName).toBe("P")
    expect(paragraph?.textContent).toBe("a")
    expect($.anchor).toBe(paragraph?.firstChild)
    expect($.anchorOffset).toBe(1)

    await new Promise(resolve => setTimeout(resolve))
    expect(editor.doc.body.firstChild?.toString()).toBe("<p>a</p>")
  })

  it("inserts HTML through its action handler", () => {
    editor.features.manipulation.actions.insert({type: "insert", html: "<p></p>"})
    expectBodyToBe("<p></p>")
  })
  it("marks widgets in HTML inserted through its action handler editable", () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: "<section><webwriter-demo></webwriter-demo></section>",
    })

    expect(document.querySelector("webwriter-demo")).toHaveAttribute("contenteditable", "true")
  })

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
  it("inserts a schema-conformant default element at a gap", () => {
    document.body.innerHTML = "<p>a</p><p>b</p>"
    $.selectGap(document.body.firstElementChild!)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<p>a</p><p></p><p>b</p>")
  })
  it("materializes a normal gap between list items on Enter", () => {
    document.body.innerHTML = "<ul><li>a</li><li>b</li></ul>"
    $.selectGap(document.querySelector("li")!)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<ul><li>a</li><li></li><li>b</li></ul>")
    expect($.anchor).toBe(document.querySelectorAll("li")[1])
    expect($.anchorOffset).toBe(0)
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
  it("splits nested marks with their containing block", () => {
    document.body.innerHTML = "<p><b><i>hello</i></b> world</p>"
    $.move(document.querySelector("i")!.firstChild!, 2)
    editor.features.manipulation.insert()
    expectBodyToBe("<p><b><i>he</i></b></p><p><b><i>llo</i></b> world</p>")
    expect($.anchor).toBe(document.querySelectorAll("i")[1].firstChild)
    expect($.anchorOffset).toBe(0)
  })
  it("does not leave empty mark wrappers when splitting at a mark boundary", () => {
    document.body.innerHTML = "<p><b>hello</b></p>"
    $.move(document.querySelector("b")!.firstChild!, 0)
    editor.features.manipulation.insert()
    expectBodyToBe("<p></p><p><b>hello</b></p>")
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
  it("moves the caret to the next element when deleting an empty first element", () => {
    document.body.innerHTML = "<p></p><p>hello</p>"
    const next = document.body.lastElementChild!
    $.move(document.body.firstElementChild!, 0)

    editor.features.manipulation.delete("forward")

    expectBodyToBe("<p>hello</p>")
    expect($.anchor).toBe(next)
    expect($.anchorOffset).toBe(0)
  })
  it("keeps Enter working after deleting an empty first element", () => {
    document.body.innerHTML = "<p></p><p>hello</p>"
    $.move(document.body.firstElementChild!, 0)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}))
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expectBodyToBe("<p></p><p>hello</p>")
  })
  it("merges two blocks on backward delete at the gap between them", () => {
    document.body.innerHTML = "<p>hello</p><p>world</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>helloworld</p>")
  })
  it("joins equivalent mark runs when merging blocks", () => {
    document.body.innerHTML = "<p><b>hello</b></p><p><b>world</b></p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p><b>helloworld</b></p>")
    expect($.anchor).toBe(document.querySelector("b")!.firstChild)
    expect($.anchorOffset).toBe(5)
  })
  it("merges two blocks on forward delete at the gap between them", () => {
    document.body.innerHTML = "<p>hello</p><p>world</p>"
    $.selectGap(document.body.firstElementChild!)
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>helloworld</p>")
  })
  it("moves to the end of the last block on backward delete at the final gap", () => {
    document.body.innerHTML = "<p>hello</p>"
    const block = document.body.firstElementChild!
    $.selectGap(block)
    editor.features.manipulation.delete("backward")
    expectBodyToBe("<p>hello</p>")
    expect($.anchor).toBe(block)
    expect($.anchorOffset).toBe(block.childNodes.length)
  })
  it("moves to the start of the first block on forward delete at the initial gap", () => {
    document.body.innerHTML = "<p>hello</p>"
    const block = document.body.firstElementChild!
    $.selectGap(block, "before")
    editor.features.manipulation.delete("forward")
    expectBodyToBe("<p>hello</p>")
    expect($.anchor).toBe(block)
    expect($.anchorOffset).toBe(0)
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
  it("lifts the block rather than a mark containing the caret", () => {
    document.body.innerHTML = "<div><p><b>hello</b></p></div>"
    $.move(document.querySelector("b")!.firstChild!, 2)
    editor.features.manipulation.lift()
    expectBodyToBe("<p><b>hello</b></p>")
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
  it("handles a native plain-text paste into an empty document", () => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", "pasted text")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>pasted text</p>")
    expect($.anchor).toBe(document.querySelector("p")?.firstChild)
    expect($.anchorOffset).toBe(11)
  })

  it("handles a native plain-text paste at a trailing gap", () => {
    document.body.innerHTML = "<p>existing</p>"
    $.selectGap(document.body.firstElementChild!)
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", "pasted")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>existing</p><p>pasted</p>")
  })

  it("keeps block HTML at the document root on native paste", () => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/html", "<h1>Heading</h1>")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<h1>Heading</h1>")
  })

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
  it("wraps plain-text clipboard content in a paragraph at an empty document", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "test"
    })])
    $.selectDocumentStart()
    await editor.features.manipulation.paste()
    expectBodyToBe("<p>test</p>")
  })

  it("does not parse markup characters from a plain-text clipboard flavor", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "<b>text</b>"
    })])
    $.selectDocumentStart()

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>&lt;b&gt;text&lt;/b&gt;</p>")
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

  it("normalizes adjacent text nodes after a command", () => {
    document.body.innerHTML = "<p>a</p>"
    const p = document.body.firstElementChild!
    const first = p.firstChild!
    p.append(document.createTextNode("b"))
    $.move(first, 1)

    editor.features.manipulation.setAttributes({title: "test"})

    expect(p.childNodes).toHaveLength(1)
    expect(p.textContent).toBe("ab")
  })
})

describe("text input normalization", () => {
  it("normalizes adjacent text nodes after text input", () => {
    document.body.innerHTML = "<p>ab</p>"
    const p = document.body.firstElementChild!
    const second = (p.firstChild as Text).splitText(1)
    $.move(second, 0)

    document.dispatchEvent(new Event("input", {bubbles: true}))

    expect(p.childNodes).toHaveLength(1)
    expect(p.textContent).toBe("ab")
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
