// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest"
import { DOMEditor } from "../domeditor"
import { $ } from "../utility"

const editor = new DOMEditor()

const editorHTML = () => editor.toHTML(true)

function typeSlash() {
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "/", bubbles: true, cancelable: true}))
}

function typeText(text: string) {
  const selection = document.getSelection()!
  const range = selection.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  $.move(node, text.length)
  document.dispatchEvent(new Event("input", {bubbles: true}))
}

beforeEach(() => {
  document.body.innerHTML = ""
  editor.features.slash.menu.open = false
})

describe("slash menu", () => {
  it("opens after a slash at the end of a text block and exposes every requested section", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)

    typeSlash()
    const menu = editor.features.slash.menu
    await menu.updateComplete

    expect(menu.open).toBe(true)
    expect(editorHTML()).toBe("<p>/</p>")
    expect(menu.shadowRoot?.textContent).toContain("Text")
    expect(menu.shadowRoot?.textContent).toContain("Media")
    expect(menu.shadowRoot?.textContent).toContain("Widgets")
    expect(menu.shadowRoot?.textContent).toContain("Paragraph")
    expect(menu.shadowRoot?.textContent).toContain("Website")
  })

  it("opens before whitespace but not before content", () => {
    document.body.innerHTML = "<p> text</p>"
    $.move(document.querySelector("p")!.firstChild!, 0)
    typeSlash()
    expect(editor.features.slash.menu.open).toBe(true)

    editor.features.slash.menu.dispatchEvent(new Event("slash-menu-close", {bubbles: true, composed: true}))
    document.body.innerHTML = "<p>text</p>"
    $.move(document.querySelector("p")!.firstChild!, 0)
    typeSlash()
    expect(editor.features.slash.menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>text</p>")
  })

  it("filters from the text after the slash, then navigates and confirms with Tab", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeSlash()
    const menu = editor.features.slash.menu
    await menu.updateComplete
    typeText("heading")
    await menu.updateComplete
    expect(menu.query).toBe("heading")
    expect(menu.shadowRoot?.textContent).toContain("Heading 1")
    expect(menu.shadowRoot?.querySelector("input")).toBeNull()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, cancelable: true}))
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}))

    expect(editorHTML()).toBe("<h2></h2>")
    expect(menu.open).toBe(false)
    expect($.anchor?.nodeName).toBe("H2")
    expect($.anchorOffset).toBe(0)
  })

  it("updates the filter as command text is removed and closes when the slash is removed", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeSlash()
    typeText("table")
    const menu = editor.features.slash.menu
    await menu.updateComplete
    expect(menu.query).toBe("table")

    const query = $.anchor as Text
    query.deleteData(query.length - 1, 1)
    $.move(query, query.length)
    await Promise.resolve()
    expect(menu.query).toBe("tabl")

    const slash = document.querySelector("p")!.firstChild as Text
    slash.remove()
    $.move(document.querySelector("p")!, 0)
    await Promise.resolve()
    expect(menu.open).toBe(false)
  })

  it("keeps the slash and restores its caret when the close button is clicked", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeSlash()
    const menu = editor.features.slash.menu
    await menu.updateComplete

    menu.shadowRoot?.querySelector<HTMLButtonElement>(".close")?.click()

    expect(editorHTML()).toBe("<p>/</p>")
    expect($.anchor?.textContent).toBe("/")
    expect($.anchorOffset).toBe(1)
  })

  it("closes on Escape", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeSlash()
    const menu = editor.features.slash.menu
    await menu.updateComplete

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, composed: true, cancelable: true,
    }))

    expect(menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>/</p>")
  })

  it("selects elements which cannot contain text", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeSlash()
    const menu = editor.features.slash.menu
    await menu.updateComplete
    typeText("table")
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}))

    expect(editorHTML()).toBe("<table></table>")
    expect($.selectedElement?.tagName).toBe("TABLE")
  })

  it("closes on Enter without inserting an element when an option is active", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeSlash()
    typeText("table")
    const menu = editor.features.slash.menu
    await menu.updateComplete

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>/table</p>")
  })

  it("closes and lets Enter behave normally when the filter has no option", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeSlash()
    typeText("unknown")
    const menu = editor.features.slash.menu
    await menu.updateComplete
    expect(menu.activeItem).toBeUndefined()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(menu.open).toBe(false)
    expect(editorHTML()).toContain("<p>/unknown</p><p></p>")
  })
})
