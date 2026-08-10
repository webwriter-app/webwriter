// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest"
import { DOMEditor } from "../domeditor"
import { $ } from "../utility"

const editor = new DOMEditor()

const editorHTML = () => editor.toHTML(true)

function typeCommand() {
  typeText("++")
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
  editor.features.insertion.menu.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))
})

describe("insertion menu", () => {
  it("shows a ++ trigger in an empty document and opens it like typed ++", async () => {
    $.selectDocumentStart()
    editor.features.selection.processSelection()
    await Promise.resolve()

    const button = editor.appendix.querySelector<HTMLButtonElement>(".◆insertion-add")
    expect(button).not.toBeNull()
    expect(button!.textContent).toBe("++")
    expect(document.body.classList.contains("◆empty-selected")).toBe(true)

    const activation = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})
    expect(button!.dispatchEvent(activation)).toBe(false)
    await editor.features.insertion.menu.updateComplete

    expect(editor.features.insertion.menu.open).toBe(true)
    expect(editorHTML()).toBe("<p>++</p>")
    expect(document.body.classList.contains("◆insertion-trigger")).toBe(true)

    editor.features.insertion.menu.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))
  })

  it("shows a ++ trigger inside empty text blocks which opens like typed ++", async () => {
    document.body.innerHTML = "<p></p><p>Text</p>"
    const block = document.querySelector("p")!
    $.move(block)
    editor.features.selection.processSelection()
    await Promise.resolve()

    const button = editor.appendix.querySelector<HTMLButtonElement>(".◆insertion-add")
    expect(button).not.toBeNull()
    expect(editor.appendix.querySelectorAll(".◆insertion-add")).toHaveLength(1)
    expect(block.classList.contains("◆empty-selected")).toBe(true)
    expect(block.hasAttribute("style")).toBe(false)
    expect(button!.hasAttribute("style")).toBe(false)

    button!.click()
    await editor.features.insertion.menu.updateComplete

    expect(editor.features.insertion.menu.open).toBe(true)
    expect(editorHTML()).toBe("<p>++</p><p>Text</p>")
    expect(document.body.classList.contains("◆insertion-trigger")).toBe(true)
  })

  it("opens after ++ at the end of a text block and exposes every requested section", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)

    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    expect(menu.open).toBe(true)
    expect(editorHTML()).toBe("<p>++</p>")
    expect(document.body.classList.contains("◆insertion-trigger")).toBe(true)
    expect(menu.activeItem).toBeUndefined()
    expect(menu.shadowRoot?.querySelector(".item[data-active]")).toBeNull()
    expect(menu.shadowRoot?.textContent).toContain("Text")
    expect(menu.shadowRoot?.textContent).toContain("Media")
    expect(menu.shadowRoot?.textContent).toContain("Widgets")
    expect(menu.shadowRoot?.textContent).toContain("Paragraph")
    expect(menu.shadowRoot?.textContent).toContain("Website")
  })

  it("anchors the initial typed command to an empty block", async () => {
    document.body.innerHTML = "<p></p>"
    const block = document.querySelector("p")!
    Object.defineProperty(block, "getBoundingClientRect", {
      configurable: true,
      value: () => ({left: 40, bottom: 120}),
    })
    $.move(block)

    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    expect(menu.style.left).toBe("40px")
    expect(menu.style.top).toBe("126px")
  })

  it("opens when the second plus key is typed and keeps both pluses", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeText("+")

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "+", bubbles: true, cancelable: true}))
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    expect(menu.open).toBe(true)
    expect(editorHTML()).toBe("<p>++</p>")
  })

  it("opens before whitespace but not before content", () => {
    document.body.innerHTML = "<p> text</p>"
    $.move(document.querySelector("p")!.firstChild!, 0)
    typeCommand()
    expect(editor.features.insertion.menu.open).toBe(true)

    editor.features.insertion.menu.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))
    document.body.innerHTML = "<p>text</p>"
    $.move(document.querySelector("p")!.firstChild!, 0)
    typeCommand()
    expect(editor.features.insertion.menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>++text</p>")
  })

  it("filters from the text after ++, then navigates and confirms with Enter", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    typeText("heading")
    await menu.updateComplete
    expect(menu.query).toBe("heading")
    expect(menu.shadowRoot?.textContent).toContain("Heading 1")
    expect(menu.shadowRoot?.querySelector("input")).toBeNull()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, cancelable: true}))
    expect(menu.activeItem?.name).toBe("Heading 1")
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(editorHTML()).toBe("<h1></h1>")
    expect(menu.open).toBe(false)
    expect($.anchor?.nodeName).toBe("H1")
    expect($.anchorOffset).toBe(0)
  })

  it("closes when a space is inserted directly after ++", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    const space = new KeyboardEvent("keydown", {key: " ", bubbles: true, cancelable: true})
    document.dispatchEvent(space)

    expect(space.defaultPrevented).toBe(false)
    expect(menu.open).toBe(false)

    typeText(" ")

    expect(menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>++ </p>")
  })

  it("updates the filter as command text is removed", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("table")
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    expect(menu.query).toBe("table")

    const query = $.anchor as Text
    query.deleteData(query.length - 1, 1)
    $.move(query, query.length)
    await Promise.resolve()
    expect(menu.query).toBe("tabl")

    expect(editorHTML()).toBe("<p>++tabl</p>")
  })

  it("keeps the query and restores its caret when the close button is clicked", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    typeText("table")

    menu.shadowRoot?.querySelector<HTMLButtonElement>(".close")?.click()

    expect(editorHTML()).toBe("<p>++table</p>")
    expect($.anchor?.textContent).toBe("++table")
    expect($.anchorOffset).toBe(7)
  })

  it("closes on Escape", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, composed: true, cancelable: true,
    }))

    expect(menu.open).toBe(false)
    expect(document.body.classList.contains("◆insertion-trigger")).toBe(false)
    expect(editorHTML()).toBe("<p>++</p>")
  })

  it("selects elements which cannot contain text", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    typeText("table")
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, cancelable: true}))
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(editorHTML()).toBe("<table></table>")
    expect($.selectedElement?.tagName).toBe("TABLE")
  })

  it("closes on Enter and lets the editor handle it when no option is selected", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("table")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>++table</p><p></p>")
  })

  it("closes on Enter when the filter has no option", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("unknown")
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    expect(menu.activeItem).toBeUndefined()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true}))

    expect(menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>++unknown</p><p></p>")
  })

  it("closes when the selection moves out of the command area", async () => {
    document.body.innerHTML = "<p></p>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph)
    typeCommand()
    typeText("table")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    $.move(paragraph.firstChild!, 0)
    await Promise.resolve()

    expect(menu.open).toBe(false)
    expect(editorHTML()).toBe("<p>++table</p>")
  })
})
