// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
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
  document.body.innerHTML = "<p></p>"
  $.move(document.body.firstElementChild!)
  editor.features.insertion.menu.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))
})

describe("insertion menu", () => {
  it("shows a ++ trigger in the initial paragraph and opens it like typed ++", async () => {
    editor.features.selection.processSelection()
    await Promise.resolve()

    const button = editor.appendix.querySelector<HTMLButtonElement>(".◆insertion-add")
    expect(button).not.toBeNull()
    expect(button!.textContent).toBe("++")
    expect(document.body.firstElementChild?.classList.contains("◆empty-selected")).toBe(true)

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
    expect(Array.from(menu.shadowRoot!.querySelectorAll("h2"), heading => heading.textContent)).toEqual(["Elements", "Packages"])
    expect(menu.shadowRoot?.textContent).toContain("Paragraph")
    expect(menu.shadowRoot?.textContent).toContain("Website")
    expect(menu.shadowRoot?.textContent).not.toContain("HTML")
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

  it("smoothly scrolls to each keyboard selection, including wrapped navigation", async () => {
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    try {
      for(const key of ["ArrowUp", "ArrowDown", "ArrowDown", "ArrowUp"]) {
        document.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
        await menu.updateComplete
        expect(scroll).toHaveBeenLastCalledWith({behavior: "smooth", block: "nearest", inline: "nearest"})
        expect(scroll.mock.instances.at(-1)).toBe(menu.shadowRoot!.querySelector(".item[data-active]"))
      }
      expect(scroll).toHaveBeenCalledTimes(4)
    }
    finally { scroll.mockRestore() }
  })

  it("instantly resets scrolling and keyboard selection when the search changes", async () => {
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    const sections = menu.shadowRoot!.querySelector<HTMLElement>(".sections")!
    const scroll = vi.spyOn(sections, "scrollTo")
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowUp", bubbles: true, cancelable: true}))
      await menu.updateComplete
      sections.scrollTop = 100
      typeText("heading")
      await menu.updateComplete

      expect(scroll).toHaveBeenLastCalledWith({top: 0, behavior: "instant"})
      expect(sections.scrollTop).toBe(0)
      expect(menu.activeItem).toBeUndefined()
      expect(menu.shadowRoot!.querySelector(".item[data-active]")).toBeNull()
    }
    finally { scroll.mockRestore() }
  })

  it("offers only generic Section and omits Preformatted Text and section variants", async () => {
    typeCommand()
    const menu = editor.features.insertion.menu
    await menu.updateComplete
    const tags = menu.filteredItems.map(item => item.tag)
    expect(tags).toContain("section")
    for(const tag of ["pre", "div", "blockquote", "figure", "article", "aside", "header", "footer", "main", "nav", "search", "address"]) {
      expect(tags).not.toContain(tag)
      menu.query = tag
      await menu.updateComplete
      expect(menu.filteredItems.some(item => item.tag === tag)).toBe(false)
    }
  })

  it.each(["@example/interactive-map", "interactive-map"])("prettifies and searches package names (%s)", async packageName => {
    globalThis.DOMEDITOR_PACKAGE_ITEMS = [{
      section: "Packages", name: "Marker", packageName, kind: "widget", tag: "example-marker",
    }]
    typeCommand()
    typeText("interactive map")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    expect(menu.filteredItems).toHaveLength(1)
    expect(menu.shadowRoot!.querySelector(".item-name")?.textContent).toBe("Marker")
    expect(menu.shadowRoot!.querySelector(".item-package")?.textContent).toBe("Interactive Map")
    expect(menu.filteredItems[0].packageName).toBe(packageName)
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
    const postSelectionPath = vi.spyOn(editor, "postSelectionPath")
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
    expect(postSelectionPath).toHaveBeenLastCalledWith(true)
    postSelectionPath.mockRestore()
  })

  it("does not offer unsupported form controls", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("textarea")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")?.click()

    expect(editorHTML()).toBe("<p>++textarea</p>")
    expect(menu.shadowRoot?.querySelector(".item")).toBeNull()
  })

  it("does not offer dialog insertion", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("dialog")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")?.click()

    expect(editorHTML()).toBe("<p>++dialog</p>")
    expect(menu.shadowRoot?.querySelector(".item")).toBeNull()
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

    expect(menu.shadowRoot?.textContent).not.toContain("@webwriter/demo")
    expect(menu.shadowRoot?.querySelector(".item-package")?.textContent).toBe("Demo")
    menu.shadowRoot?.querySelector<HTMLButtonElement>('.item img[src="https://example.com/demo.svg"]')
      ?.closest<HTMLButtonElement>("button")?.click()

    expect(editorHTML()).toBe("<webwriter-demo></webwriter-demo>")
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

    expect(editorHTML()).toBe("<p>before</p><webwriter-demo></webwriter-demo>")
    expect(document.querySelector("webwriter-demo")?.parentElement).toBe(document.body)
  })

  it("enables editing for every widget inside inserted snippets", async () => {
    globalThis.DOMEDITOR_PACKAGE_ITEMS = [{
      section: "Packages",
      name: "Demo Snippet",
      packageName: "@webwriter/demo",
      kind: "snippet",
      htmlUrl: "https://example.com/demo.html",
    }]
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => '<section><webwriter-demo contenteditable="false"></webwriter-demo><webwriter-other></webwriter-other></section>',
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

  it("keeps the typed command and clears markers if snippet preparation fails", async () => {
    const parse = vi.spyOn(editor, "parseHTMLFragment").mockImplementation(() => { throw new Error("Invalid snippet") })
    try {
      typeCommand()
      typeText("paragraph")
      const menu = editor.features.insertion.menu
      await menu.updateComplete
      menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")?.click()
      await Promise.resolve()

      expect(editorHTML()).toBe("<p>++paragraph</p>")
      expect(menu.open).toBe(false)
      expect(document.body.classList.contains("◆insertion-trigger")).toBe(false)
      expect(editor.appendix.querySelector(".◆insertion-trigger")).toBeNull()
    }
    finally { parse.mockRestore() }
  })

  it("does not apply a downloaded snippet after its command was replaced", async () => {
    globalThis.DOMEDITOR_PACKAGE_ITEMS = [{
      section: "Packages",
      name: "Slow Snippet",
      packageName: "@webwriter/demo",
      kind: "snippet",
      htmlUrl: "https://example.com/slow.html",
    }]
    let resolveResponse!: (response: Response) => void
    const response = new Promise<Response>(resolve => resolveResponse = resolve)
    const fetcher = vi.spyOn(globalThis, "fetch").mockReturnValue(response)

    try {
      document.body.innerHTML = "<p></p>"
      $.move(document.querySelector("p")!)
      typeCommand()
      typeText("slow")
      const menu = editor.features.insertion.menu
      await menu.updateComplete
      menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")?.click()

      menu.dispatchEvent(new Event("insertion-menu-close", {bubbles: true, composed: true}))
      document.body.innerHTML = "<p></p>"
      $.move(document.querySelector("p")!)
      typeCommand()
      await menu.updateComplete

      resolveResponse(new Response("<section>Stale</section>"))
      await response
      await Promise.resolve()

      expect(editorHTML()).toBe("<p>++</p>")
      expect(menu.open).toBe(true)
      expect(document.querySelector("section")).toBeNull()
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

  it.each([false, true])("keeps typing searchable when mutations arrive before input (split trigger: %s)", async splitTrigger => {
    const FrameMutationObserver = document.defaultView!.MutationObserver
    let deliverMutations!: () => void
    const observerConstructor = vi.spyOn(document.defaultView!, "MutationObserver").mockImplementation(function(callback) {
      const observer = new FrameMutationObserver(callback)
      deliverMutations = () => callback([], observer)
      return observer
    })
    try {
      if(splitTrigger) {
        typeText("+")
        document.dispatchEvent(new KeyboardEvent("keydown", {key: "+", bubbles: true, cancelable: true}))
      }
      else typeCommand()
      const menu = editor.features.insertion.menu
      await menu.updateComplete

      for(const character of "table") {
        const selection = document.getSelection()!
        const text = selection.anchorNode as Text
        const offset = selection.anchorOffset
        text.insertData(offset, character)
        $.move(text, offset + 1)
        // Native editing can deliver its mutation observer before input.
        deliverMutations()
        expect(menu.open).toBe(true)
        document.dispatchEvent(new InputEvent("input", {inputType: "insertText", data: character, bubbles: true}))
        await menu.updateComplete
      }

      expect(menu.open).toBe(true)
      expect(menu.query).toBe("table")
      expect(menu.filteredItems.map(item => item.tag)).toEqual(["table"])
      expect(editorHTML()).toBe("<p>++table</p>")
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true}))
      expect(document.body.classList.contains("◆insertion-trigger")).toBe(false)
    }
    finally { observerConstructor.mockRestore() }
  })

  it("does not offer heading group insertion from the typed menu", async () => {
    document.body.innerHTML = "<p></p>"
    $.move(document.querySelector("p")!)
    typeCommand()
    typeText("heading group")
    const menu = editor.features.insertion.menu
    await menu.updateComplete

    menu.shadowRoot?.querySelector<HTMLButtonElement>(".item")?.click()

    expect(editorHTML()).toBe("<p>++heading group</p>")
    expect(menu.shadowRoot?.querySelector(".item")).toBeNull()
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
