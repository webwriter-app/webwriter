// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest"
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
  globalThis.DOMEDITOR_PACKAGE_ITEMS = []
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
    expect(menu.shadowRoot?.textContent).toContain("Packages")
    expect(menu.shadowRoot?.textContent).toContain("Paragraph")
    expect(menu.shadowRoot?.textContent).toContain("Website")
  })

  it("resets the filter and scroll position for a new insertion", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    typeText("table")
    await menu.updateComplete

    const sections = menu.shadowRoot?.querySelector<HTMLElement>(".sections")!
    sections.scrollTop = 100
    menu.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))

    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    await menu.updateComplete

    expect(menu.query).toBe("")
    expect(sections.scrollTop).toBe(0)
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

  it("opens the menu for typed ++ in non-paragraph blocks", () => {
    document.body.innerHTML = "<h1>Heading</h1>"
    const heading = document.querySelector("h1")!
    $.move(heading.firstChild!, heading.textContent!.length)

    typeCommand()

    expect(editor.features.insertion.menu.open).toBe(true)
    expect(editorHTML()).toBe("<h1>Heading++</h1>")
  })

  it("does not activate the empty-block trigger in non-paragraph blocks", async () => {
    document.body.innerHTML = "<h1></h1>"
    const heading = document.querySelector("h1")!
    $.move(heading)
    editor.features.selection.processSelection()
    await Promise.resolve()

    const button = editor.appendix.querySelector<HTMLButtonElement>(".◆insertion-add")!
    button.click()

    expect(editor.features.insertion.menu.open).toBe(false)
    expect(editorHTML()).toBe("<h1></h1>")
  })

  it("inserts the selected item when it is activated by a pointer", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("table")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    const item = menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")!
    const pointerDown = new Event("pointerdown", {bubbles: true, cancelable: true})
    item.dispatchEvent(pointerDown)
    item.click()

    expect(pointerDown.defaultPrevented).toBe(true)
    expect(editorHTML()).toBe("<table><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table>")
    expect(menu.open).toBe(false)
  })

  it("shows installed package widgets and inserts their custom elements", async () => {
    editor.schema.extendWidgets([{
      tagName: "webwriter-demo",
      editingConfig: {content: "text*"},
    }])
    globalThis.DOMEDITOR_PACKAGE_ITEMS = [{
      section: "Packages",
      name: "Demo Widget",
      packageName: "@webwriter/demo",
      kind: "widget",
      tag: "webwriter-demo",
      iconUrl: "https://example.com/demo.svg",
    }]
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("demo")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    expect(menu.shadowRoot?.textContent).toContain("@webwriter/demo")
    expect(menu.shadowRoot?.querySelector(".item-package")?.textContent).toBe("@webwriter/demo")
    menu.shadowRoot?.querySelector<HTMLButtonElement>('.item img[src="https://example.com/demo.svg"]')
      ?.closest<HTMLButtonElement>("button")?.click()

    expect(editorHTML()).toBe('<webwriter-demo contenteditable="true"></webwriter-demo>')
    const widget = document.querySelector("webwriter-demo")!
    expect(widget.getAttribute("contenteditable")).toBe("true")
    expect($.selectedElement).toBe(widget)
    expect(widget.classList.contains("◆element-selected")).toBe(true)
    expect(menu.open).toBe(false)
  })

  it("places a block widget after a paragraph instead of inside it", async () => {
    editor.schema.extendWidgets([{tagName: "webwriter-demo"}])
    globalThis.DOMEDITOR_PACKAGE_ITEMS = [{
      section: "Packages",
      name: "Demo Widget",
      packageName: "@webwriter/demo",
      kind: "widget",
      tag: "webwriter-demo",
    }]
    document.body.innerHTML = "<p>before</p>"
    $.move(document.querySelector("p")!.firstChild!, -1)
    typeCommand()
    typeText("demo")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")?.click()

    expect(editorHTML()).toBe('<p>before</p><webwriter-demo contenteditable="true"></webwriter-demo>')
    expect(document.querySelector("webwriter-demo")?.parentElement).toBe(document.body)
  })

  it("marks widgets nested inside inserted snippets editable", async () => {
    globalThis.DOMEDITOR_PACKAGE_ITEMS = [{
      section: "Packages",
      name: "Demo Snippet",
      packageName: "@webwriter/demo",
      kind: "snippet",
      htmlUrl: "https://example.com/demo.html",
    }]
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "<section><webwriter-demo></webwriter-demo><webwriter-other></webwriter-other></section>",
    } as Response)

    try {
      document.body.innerHTML = "<p></p>"
      $.move(document.querySelector("p")!)
      typeCommand()
      typeText("snippet")
      const menu = editor.features.insertion.menu
      await menu.updateComplete
      menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")?.click()

      await vi.waitFor(() => expect(document.querySelector("webwriter-demo")).toBeTruthy())
      expect(document.querySelector("webwriter-demo")?.getAttribute("contenteditable")).toBe("true")
      expect(document.querySelector("webwriter-other")?.getAttribute("contenteditable")).toBe("true")
      expect(fetcher).toHaveBeenCalledWith("https://example.com/demo.html")
    }
    finally {
      fetcher.mockRestore()
    }
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

    expect(editorHTML()).toBe("<table><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table>")
    expect(editor.features.table.selectedCells).toEqual([document.querySelector("td")])
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
