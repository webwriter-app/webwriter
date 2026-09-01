// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest"
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

beforeEach(async () => {
  vi.restoreAllMocks()
  document.body.innerHTML = ""
  document.body.removeAttribute("style")
  $.selectDocumentStart()
  await new Promise<void>(resolve => queueMicrotask(resolve))
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

  it("inserts a line break with Alt+Enter into a text block from an empty document", () => {
    const event = new KeyboardEvent("keydown", {key: "Enter", altKey: true, bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p><br></p>")
    expect($.anchor).toBe(document.body.firstElementChild)
    expect($.anchorOffset).toBe(1)
  })

  it("inserts a word-break opportunity with Alt+Shift+Enter", () => {
    const event = new KeyboardEvent("keydown", {
      key: "Enter", altKey: true, shiftKey: true, bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p><wbr></p>")
  })

  it("inserts a Word-compatible soft line break with Shift+Enter", () => {
    document.body.innerHTML = "<p>ab</p>"
    $.move(document.querySelector("p")!.firstChild!, 1)

    const event = new KeyboardEvent("keydown", {
      key: "Enter", shiftKey: true, bubbles: true, cancelable: true,
    })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>a<br>b</p>")
    expect($.anchor).toBe(document.querySelector("p"))
    expect($.anchorOffset).toBe(2)
  })

  it("handles native insertLineBreak input inside a non-empty paragraph", () => {
    document.body.innerHTML = "<p>ab</p>"
    $.move(document.querySelector("p")!.firstChild!, 1)
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertLineBreak",
    })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>a<br>b</p>")
  })

  it("does not insert a break where the schema allows only text", () => {
    document.body.innerHTML = "<select><option>ab</option></select>"
    $.move(document.querySelector("option")!.firstChild!, 1)
    const event = new KeyboardEvent("keydown", {
      key: "Enter", altKey: true, bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<select><option>ab</option></select>")
  })

  it("does not insert a word break where the schema allows only text", () => {
    document.body.innerHTML = "<select><option>ab</option></select>"
    $.move(document.querySelector("option")!.firstChild!, 1)

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", altKey: true, shiftKey: true, bubbles: true, cancelable: true,
    }))

    expectBodyToBe("<select><option>ab</option></select>")
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

    await vi.waitFor(() => {
      expect({
        dom: editor.toHTML(true),
        shared: editor.doc.body.firstChild?.toString(),
      }).toEqual({dom: "<p>a</p>", shared: "<p>a</p>"})
    }, {timeout: 5_000})
  }, 10_000)

  it("keeps replacement text in a block when the selection spans body children", () => {
    document.body.innerHTML = "<p>First</p><p>Second</p>"
    $.selectRange(document.body, 0, document.body, document.body.childNodes.length)
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "Replacement",
      inputType: "insertText",
    })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<p>Replacement</p>")
    expect(Array.from(document.body.childNodes).every(node => node instanceof Element)).toBe(true)
  })

  it("inserts HTML through its action handler", () => {
    editor.features.manipulation.actions.insert({type: "insert", html: "<p></p>"})
    expectBodyToBe("<p></p>")
  })
  it("sanitizes arbitrary HTML while preserving safe inline styles", () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: '<style>body { display: none }</style><link rel="stylesheet"><p style="color: red" onclick="evil()">Safe<script>while(true) {}</script></p>',
    })

    expectBodyToBe('<p style="color: red">Safe</p>')
    expect(document.querySelector("script, style, link[rel~='stylesheet']")).toBeNull()
  })
  it("schema-corrects arbitrary HTML before insertion", () => {
    const correct = vi.spyOn(editor.schema, "checkAndCorrect")

    editor.features.manipulation.actions.insert({type: "insert", html: "<ul><p>Item</p></ul>"})

    expect(correct).toHaveBeenCalledWith(expect.any(HTMLBodyElement), true)
    expect(document.querySelector("ul")?.firstElementChild?.localName).toBe("li")
  })
  it("marks widgets in HTML inserted through its action handler editable", () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: "<section><webwriter-demo></webwriter-demo></section>",
    })

    expect(document.querySelector("webwriter-demo")).toHaveAttribute("contenteditable", "true")
  })
  it("node-selects a directly inserted widget", () => {
    editor.features.manipulation.actions.insert({
      type: "insert",
      html: "<webwriter-demo></webwriter-demo>",
    })

    const widget = document.querySelector("webwriter-demo")!
    expect($.selectedElement).toBe(widget)
    expect(widget).toHaveClass("◆element-selected")
  })
  it.each([
    [0, '<webwriter-demo></webwriter-demo><p>before after</p>'],
    [6, '<p>before</p><webwriter-demo></webwriter-demo><p> after</p>'],
    [12, '<p>before after</p><webwriter-demo></webwriter-demo>'],
  ] as const)("places a block widget outside a paragraph at text offset %i", (offset, expected) => {
    editor.schema.extendWidgets([{tagName: "webwriter-demo"}])
    document.body.innerHTML = "<p>before after</p>"
    const text = document.querySelector("p")!.firstChild!
    $.move(text, offset)

    editor.features.manipulation.actions.insert({
      type: "insert",
      html: "<webwriter-demo></webwriter-demo>",
    })

    expectBodyToBe(expected)
    const widget = document.querySelector("webwriter-demo")!
    expect(widget.parentElement).toBe(document.body)
    expect($.selectedElement).toBe(widget)
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
  it("uses the primary modifier to split the parent", () => {
    document.body.innerHTML = "<section><p>ab</p><p>tail</p></section>"
    $.move(document.querySelector("p")!.firstChild!, 1)

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, cancelable: true,
    }))

    expectBodyToBe("<section><p>a</p></section><section><p>b</p><p>tail</p></section>")
  })
  it("falls back to splitting the element when its parent cannot be split validly", () => {
    document.body.innerHTML = "<details><summary>Heading</summary><p>ab</p></details>"
    $.move(document.querySelector("p")!.firstChild!, 1)

    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", ctrlKey: true, metaKey: true, bubbles: true, cancelable: true,
    }))

    expectBodyToBe("<details open=\"\"><summary>Heading</summary><p>a</p><p>b</p></details>")
  })
  it("does not split an element when its parent disallows another copy", () => {
    document.body.innerHTML = "<hgroup><h1>ab</h1></hgroup>"
    $.move(document.querySelector("h1")!.firstChild!, 1)
    const event = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe("<hgroup><h1>ab</h1></hgroup>")
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

describe("document template protection", () => {
  it.each(["backward", "forward"] as const)("%s deletion clears a selected template without removing it", direction => {
    document.body.innerHTML = '<demo-widget role="document"><p>Template content</p></demo-widget>'
    const template = document.body.firstElementChild!
    $.selectElement(template)
    editor.features.selection.processSelection()

    editor.features.manipulation.delete(direction)

    expect(document.body.firstElementChild).toBe(template)
    expect(template).toHaveAttribute("role", "document")
    expect(template).toBeEmptyDOMElement()
    expect($.anchor).toBe(template)
    expect($.anchorOffset).toBe(0)
  })

  it("protects an empty widget template from keyboard deletion", () => {
    document.body.innerHTML = '<demo-widget role="document"></demo-widget>'
    const template = document.body.firstElementChild!
    $.selectElement(template)
    editor.features.selection.processSelection()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete", bubbles: true, cancelable: true}))

    expect(document.body.firstElementChild).toBe(template)
    expect(document.body.children).toHaveLength(1)
  })

  it("replaces a selected template's contents without replacing its wrapper", () => {
    document.body.innerHTML = '<demo-widget role="document"><p>Old content</p></demo-widget>'
    const template = document.body.firstElementChild!
    $.selectElement(template)
    editor.features.selection.processSelection()

    document.dispatchEvent(new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "New content",
      bubbles: true,
      cancelable: true,
    }))

    expect(document.body.firstElementChild).toBe(template)
    expect(template).toHaveAttribute("role", "document")
    expect(template).toHaveTextContent("New content")
  })
})

describe("sections", () => {
  it("wraps the current structural element in a section by default", () => {
    document.body.innerHTML = "<p>hello</p>"
    const text = document.querySelector("p")!.firstChild!
    $.move(text, 2)

    expect(editor.features.manipulation.actions.toggleSection({type: "toggleSection"})).toBe(true)

    expectBodyToBe("<section><p>hello</p></section>")
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(2)
  })

  it("changes the active section type without rebuilding its contents or attributes", () => {
    document.body.innerHTML = '<section class="authored"><p>hello</p></section>'
    const text = document.querySelector("p")!.firstChild!
    $.move(text, 2)

    expect(editor.features.manipulation.actions.setSectionType({
      type: "setSectionType",
      section: "article",
    })).toBe(true)

    expectBodyToBe('<article class="authored"><p>hello</p></article>')
    expect($.anchor).toBe(text)
  })
  it("does not copy editor marker classes when changing section type", () => {
    document.body.innerHTML = '<section class="authored ◆stale-marker"><p>hello</p></section>'
    const section = document.querySelector("section")!
    const text = section.querySelector("p")!.firstChild!
    $.move(text, 2)

    expect(editor.features.manipulation.actions.setSectionType({
      type: "setSectionType",
      section: "article",
    })).toBe(true)

    const replacement = document.querySelector("article")!
    expect(replacement).toHaveClass("authored")
    expect(replacement).not.toHaveClass("◆stale-marker")
  })

  it("splits a section when only one of its elements is toggled off", () => {
    document.body.innerHTML = "<section><p>one</p><p>two</p><p>three</p></section>"
    const middle = document.querySelectorAll("p")[1]
    $.move(middle.firstChild!, 1)

    expect(editor.features.manipulation.actions.toggleSection({type: "toggleSection"})).toBe(true)

    expectBodyToBe("<section><p>one</p></section><p>two</p><section><p>three</p></section>")
    expect($.anchor).toBe(middle.firstChild)
  })
  it("does not copy editor marker classes to split section wrappers", () => {
    document.body.innerHTML = '<section class="authored ◆stale-marker"><p>one</p><p>two</p><p>three</p></section>'
    const middle = document.querySelectorAll("p")[1]
    $.move(middle.firstChild!, 1)

    expect(editor.features.manipulation.actions.toggleSection({type: "toggleSection"})).toBe(true)

    const wrappers = document.querySelectorAll("section")
    expect(wrappers).toHaveLength(2)
    wrappers.forEach(wrapper => {
      expect(wrapper).toHaveClass("authored")
      expect(wrapper).not.toHaveClass("◆stale-marker")
    })
  })

  it("stacks a default outer section around a breadcrumb-selected section", () => {
    document.body.innerHTML = "<article><p>hello</p></article>"
    $.move(document.querySelector("p")!.firstChild!, 2)
    editor.features.selection.actions.selectSection({type: "selectSection", path: [0]})

    expect(editor.features.manipulation.actions.addSection({type: "addSection"})).toBe(true)

    expectBodyToBe("<section><article><p>hello</p></article></section>")
    expect(editor.features.selection.selectedSectionElement?.localName).toBe("article")
  })

  it("edits and removes empty or inline section wrappers selected from the breadcrumb", () => {
    document.body.innerHTML = "<section></section><article>inline</article>"
    $.selectDocumentStart()
    editor.features.selection.actions.selectSection({type: "selectSection", path: [1]})

    expect(editor.features.manipulation.actions.setSectionType({
      type: "setSectionType",
      section: "aside",
    })).toBe(true)
    expectBodyToBe("<section></section><aside>inline</aside>")

    editor.features.selection.actions.selectSection({type: "selectSection", path: [0]})
    expect(editor.features.manipulation.actions.removeSection({type: "removeSection"})).toBe(true)
    expectBodyToBe("<aside>inline</aside>")
  })
})
describe("Tab paragraph behavior", () => {
  it("indents the paragraph when Tab is pressed at its start", () => {
    document.body.innerHTML = "<p>text</p>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 0)
    const event = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(paragraph).toHaveStyle({marginInlineStart: "2em"})
  })

  it("outdents an indented paragraph with Shift+Tab", () => {
    document.body.innerHTML = '<p style="margin-inline-start: 2em">text</p>'
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {
      key: "Tab", shiftKey: true, bubbles: true, cancelable: true,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(paragraph.style.marginInlineStart).toBe("")
  })

  it("indents every paragraph in a cross-block selection", () => {
    document.body.innerHTML = "<p>one</p><p>two</p>"
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("p"))
    $.selectRange(paragraphs[0].firstChild!, 1, paragraphs[1].firstChild!, 2)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true}))

    expect(paragraphs.every(paragraph => paragraph.style.marginInlineStart === "2em")).toBe(true)
  })

  it("does not structurally wrap content when Tab is pressed mid-paragraph", () => {
    document.body.innerHTML = "<p>text</p>"
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)
    const event = new KeyboardEvent("keydown", {key: "Tab", bubbles: true, cancelable: true})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expectBodyToBe("<p>text</p>")
  })
})
describe("delete()", () => {
  it("uses Ctrl for word deletion on non-Apple platforms", () => {
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
      const deletion = vi.spyOn(editor.features.manipulation, "delete").mockImplementation(() => undefined)

      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Backspace", ctrlKey: true, bubbles: true, cancelable: true,
      }))
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Delete", ctrlKey: true, bubbles: true, cancelable: true,
      }))

      expect(deletion).toHaveBeenNthCalledWith(1, "backward", "word")
      expect(deletion).toHaveBeenNthCalledWith(2, "forward", "word")
    }
    finally {
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    }
  })

  it("uses Option for words and Command for line boundaries on Apple platforms", () => {
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "MacIntel", configurable: true})
      const deletion = vi.spyOn(editor.features.manipulation, "delete").mockImplementation(() => undefined)

      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Backspace", altKey: true, bubbles: true, cancelable: true,
      }))
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Delete", metaKey: true, bubbles: true, cancelable: true,
      }))

      expect(deletion).toHaveBeenNthCalledWith(1, "backward", "word")
      expect(deletion).toHaveBeenNthCalledWith(2, "forward", "line")
    }
    finally {
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    }
  })

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
  it("does nothing for an empty or text-only fragment wrapper", () => {
    document.body.innerHTML = "<p>a</p>"
    $.selectElement(document.body.firstElementChild!)

    expect(() => editor.features.manipulation.wrap(htmlToFragment(""))).not.toThrow()
    expectBodyToBe("<p>a</p>")
    expect(() => editor.features.manipulation.wrap(htmlToFragment("text"))).not.toThrow()
    expectBodyToBe("<p>a</p>")
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

  it("preserves block boundaries in the plain-text flavor of a native copy", () => {
    document.body.innerHTML = "<p>First</p><p>Second</p>"
    $.selectRange(document.body, 0, document.body, document.body.childNodes.length)
    const clipboardData = new DataTransfer()
    const event = new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData,
    })

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(clipboardData.getData("text/html")).toContain(">First</p>")
    expect(clipboardData.getData("text/html")).toContain(">Second</p>")
    expect(clipboardData.getData("text/plain")).toMatch(/^First\r?\n+Second$/)
  })
  it("serializes every selected sibling into the programmatic HTML flavor", async () => {
    document.body.innerHTML = "<p>First</p><p>Second</p>"
    $.selectRange(document.body, 0, document.body, 2)

    await editor.features.manipulation.copy()

    const item = (await navigator.clipboard.read()).find(candidate => candidate.types.includes("text/html"))!
    const html = await (await item.getType("text/html")).text()
    expect(html).toContain("<p>First</p>")
    expect(html).toContain("<p>Second</p>")
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"))
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
  it("does not delete content when the clipboard write fails", async () => {
    document.body.innerHTML = "<p>keep me</p>"
    $.selectElement(document.body.firstElementChild!)
    const write = navigator.clipboard.write
    try {
      Object.defineProperty(navigator.clipboard, "write", {
        value: vi.fn().mockRejectedValueOnce(new Error("Clipboard denied")),
        configurable: true,
      })

      let rejection: unknown
      try {
        await editor.features.manipulation.cut()
      }
      catch(error) {
        rejection = error
      }

      expect(rejection).toMatchObject({message: "Clipboard denied"})
      expectBodyToBe("<p>keep me</p>")
    }
    finally {
      Object.defineProperty(navigator.clipboard, "write", {value: write, configurable: true})
    }
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
  it("replaces inline text without splitting its paragraph", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "new",
      "text/html": "<b>new</b>",
    })])
    document.body.innerHTML = "<p>hello</p>"
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 1, text, 4)

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>h<b>new</b>o</p>")
  })
  it("places pasted blocks beside the split paragraph", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "Title",
      "text/html": "<h1>Title</h1>",
    })])
    document.body.innerHTML = "<p>hello</p>"
    $.move(document.querySelector("p")!.firstChild!, 2)

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>he</p><h1>Title</h1><p>llo</p>")
  })
  it("preserves a pasted custom element as an atomic block widget", async () => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": "Widget",
      "text/html": "<demo-widget>Widget</demo-widget>",
    })])
    document.body.innerHTML = "<p>hello</p>"
    $.move(document.querySelector("p")!.firstChild!, 2)

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>he</p><demo-widget>Widget</demo-widget><p>llo</p>")
    expect(document.querySelector("demo-widget")).toHaveAttribute("contenteditable", "true")
    expect($.selectedElement).toBe(document.querySelector("demo-widget"))
  })
  it("preserves plain-text line boundaries as soft breaks", async () => {
    await navigator.clipboard.write([new ClipboardItem({"text/plain": "one\ntwo"})])
    $.selectDocumentStart()

    await editor.features.manipulation.paste()

    expectBodyToBe("<p>one<br>two</p>")
  })
  it("handles native paste consistently inside an ordinary text selection", () => {
    document.body.innerHTML = "<p>hello</p>"
    const text = document.querySelector("p")!.firstChild!
    $.selectRange(text, 1, text, 4)
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/html", '<i class="◆text-selected external">new</i>')
    clipboardData.setData("text/plain", "new")
    const event = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData})

    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expectBodyToBe('<p>h<i class="external">new</i>o</p>')
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
  it("preserves an empty value for boolean authored attributes", () => {
    document.body.innerHTML = "<details><summary>More</summary></details>"
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.setAttributes({open: ""})
    expect(document.body.firstElementChild).toHaveAttribute("open", "")
  })
  it("accepts null removal through the action payload", () => {
    document.body.innerHTML = `<p title="test">hello world</p>`
    $.selectElement(document.body.firstElementChild!)
    editor.features.manipulation.actions.setAttributes({type: "setAttributes", attrs: {title: null}})
    expect(document.body.firstElementChild).not.toHaveAttribute("title")
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
describe("setBlockType()", () => {
  it("converts a block while preserving authored attributes, inline DOM, and selection", () => {
    document.body.innerHTML = '<p id="intro" class="lead"><b>hello</b></p>'
    const text = document.querySelector("b")!.firstChild!
    $.selectRange(text, 1, text, 4)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(1)
    expectBodyToBe('<h2 id="intro" class="lead"><b>hello</b></h2>')
    expect($.anchor).toBe(text)
    expect($.anchorOffset).toBe(1)
    expect($.focus).toBe(text)
    expect($.focusOffset).toBe(4)
  })
  it("does not copy editor marker classes to a replacement block", () => {
    document.body.innerHTML = '<p class="authored ◆stale-marker"><b>hello</b></p>'
    const text = document.querySelector("b")!.firstChild!
    $.selectRange(text, 1, text, 4)

    expect(editor.features.manipulation.setBlockType("h2")).toBe(1)

    const replacement = document.querySelector("h2")!
    expect(replacement).toHaveClass("authored")
    expect(replacement).not.toHaveClass("◆stale-marker")
  })

  it("preserves namespaced attributes on a replacement block", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.querySelector("p")!
    paragraph.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:lang", "de")
    $.move(paragraph.firstChild!, 1)

    expect(editor.features.manipulation.setBlockType("h2")).toBe(1)

    const language = document.querySelector("h2")!.getAttributeNode("xml:lang")
    expect(language?.namespaceURI).toBe("http://www.w3.org/XML/1998/namespace")
    expect(language?.value).toBe("de")
  })

  it("converts every selected leaf block without rebuilding their container", () => {
    document.body.innerHTML = "<section><p>one</p><h1>two</h1><pre>three</pre></section>"
    const section = document.querySelector("section")!
    const first = section.firstElementChild!.firstChild!
    const last = section.lastElementChild!.firstChild!
    $.selectRange(first, 1, last, 3)

    editor.features.manipulation.setBlockType("h3")

    expectBodyToBe("<section><h3>one</h3><h3>two</h3><h3>three</h3></section>")
    expect(document.querySelector("section")).toBe(section)
  })

  it("converts paragraphs nested in list items while preserving list structure", () => {
    document.body.innerHTML = "<ol><li><p>one</p></li><li><p>two</p></li></ol>"
    const paragraphs = document.querySelectorAll("p")
    $.selectRange(paragraphs[0].firstChild!, 0, paragraphs[1].firstChild!, 3)

    editor.features.manipulation.setBlockType("h2")

    expectBodyToBe("<ol><li><h2>one</h2></li><li><h2>two</h2></li></ol>")
  })

  it("skips a replacement that would violate the parent content model", () => {
    document.body.innerHTML = "<ul><li>item</li></ul>"
    $.move(document.querySelector("li")!.firstChild!, 2)

    const count = editor.features.manipulation.setBlockType("p")

    expect(count).toBe(0)
    expectBodyToBe("<ul><li>item</li></ul>")
  })

  it("treats a selected custom element as atomic", () => {
    document.body.innerHTML = "<demo-widget><p>inside</p></demo-widget><p>outside</p>"
    $.selectElement(document.querySelector("demo-widget")!)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(0)
    expectBodyToBe("<demo-widget><p>inside</p></demo-widget><p>outside</p>")
  })

  it("does not format light-DOM descendants of a custom element in a spanning selection", () => {
    document.body.innerHTML = "<p>before</p><demo-widget><p>inside</p></demo-widget><p>after</p>"
    $.selectRange(document.body, 0, document.body, 3)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(2)
    expectBodyToBe("<h2>before</h2><demo-widget><p>inside</p></demo-widget><h2>after</h2>")
  })

  it("retains parent selector constraints when unfamiliar siblings are present", () => {
    document.body.innerHTML = "<address><p>contact</p><demo-widget></demo-widget></address>"
    $.move(document.querySelector("p")!.firstChild!, 2)

    const count = editor.features.manipulation.setBlockType("h2")

    expect(count).toBe(0)
    expectBodyToBe("<address><p>contact</p><demo-widget></demo-widget></address>")
  })

  it("materializes and formats a block at an empty-document selection", () => {
    $.selectDocumentStart()

    editor.features.manipulation.actions.setBlockType({type: "setBlockType", tag: "h1"})

    expectBodyToBe("<h1></h1>")
    expect($.anchor).toBe(document.querySelector("h1"))
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
  it("styles the containing element for a collapsed text selection", () => {
    document.body.innerHTML = "<p>hello world</p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph.firstChild!, 4)

    editor.features.manipulation.setStyle({color: "red"})

    expect(paragraph).toHaveStyle({color: "red"})
  })
  it("styles an empty text container", () => {
    document.body.innerHTML = "<p></p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph)

    editor.features.manipulation.setStyle({"min-height": "20px"})

    expect(paragraph).toHaveStyle({minHeight: "20px"})
  })
  it("skips a section wrapper when styling the element containing a gap", () => {
    document.body.innerHTML = "<section><p>one</p><p>two</p></section>"
    const section = document.body.firstElementChild!
    $.selectGap(section.lastElementChild!, "before")

    editor.features.manipulation.setStyle({display: "grid"})

    expect(document.body).toHaveStyle({display: "grid"})
    expect(section).not.toHaveAttribute("style")
    expect(section.lastElementChild).not.toHaveAttribute("style")
  })
  it("styles the containing element for a same-node text range", () => {
    document.body.innerHTML = "<p>hello world</p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph.firstChild!, 1, paragraph.firstChild!, 5)

    editor.features.manipulation.setStyle({"line-height": "2"})

    expect(paragraph).toHaveStyle({lineHeight: "2"})
  })
  it("styles the common ancestor for a cross-node text range", () => {
    document.body.innerHTML = "<p><span>one</span><em>two</em></p>"
    const paragraph = document.body.firstElementChild!
    $.selectRange(paragraph.firstElementChild!.firstChild!, 1, paragraph.lastElementChild!.firstChild!, 2)

    editor.features.manipulation.setStyle({"text-align": "center"})

    expect(paragraph).toHaveStyle({textAlign: "center"})
    expect(paragraph.firstElementChild).not.toHaveAttribute("style")
    expect(paragraph.lastElementChild).not.toHaveAttribute("style")
  })
  it("skips a section wrapper as the structural common ancestor across blocks", () => {
    document.body.innerHTML = "<section><p>one</p><p>two</p></section>"
    const section = document.body.firstElementChild!
    $.selectRange(section.firstElementChild!.firstChild!, 0, section.lastElementChild!.firstChild!, 3)

    editor.features.manipulation.setStyle({"background-color": "gold"})

    expect(document.body).toHaveStyle({backgroundColor: "gold"})
    expect(section).not.toHaveAttribute("style")
    expect(section.firstElementChild).not.toHaveAttribute("style")
  })
  it("applies paragraph styles to every selected block instead of their common ancestor", () => {
    document.body.innerHTML = '<section><p style="color: red">one</p><p>two</p></section>'
    const section = document.querySelector("section")!
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("p"))
    $.selectRange(paragraphs[0].firstChild!, 1, paragraphs[1].firstChild!, 2)

    const count = editor.features.manipulation.setBlockStyle({"text-align": "center", "line-height": "1.5"})

    expect(count).toBe(2)
    expect(section).not.toHaveAttribute("style")
    expect(paragraphs[0]).toHaveStyle({color: "red", textAlign: "center", lineHeight: "1.5"})
    expect(paragraphs[1]).toHaveStyle({textAlign: "center", lineHeight: "1.5"})
  })
  it("materializes a paragraph when formatting an empty document", () => {
    $.selectDocumentStart()

    const count = editor.features.manipulation.setBlockStyle({"text-align": "center"})

    expect(count).toBe(1)
    expect(document.querySelector("p")).toHaveStyle({textAlign: "center"})
  })
  it("removes a paragraph style from every selected block", () => {
    document.body.innerHTML = '<p style="text-indent: 2em">one</p><p style="text-indent: 2em">two</p>'
    const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("p"))
    $.selectRange(document.body, 0, document.body, 2)

    editor.features.manipulation.actions.setBlockStyle({
      type: "setBlockStyle",
      styles: {"text-indent": ""},
    })

    expect(paragraphs.every(paragraph => paragraph.style.textIndent === "")).toBe(true)
  })
  it("projects a shared paragraph declaration from a multi-block selection", () => {
    document.body.innerHTML = '<section><p style="text-align: center">one</p><p style="text-align: center">two</p></section>'
    const paragraphs = document.querySelectorAll("p")
    $.selectRange(paragraphs[0].firstChild!, 0, paragraphs[1].firstChild!, 3)

    const state = editor.features.manipulation.getStyleState(["text-align"])

    expect(state.target?.localName).toBe("body")
    expect(state.inline["text-align"]).toEqual({value: "center", priority: ""})
  })
  it("styles a section after it is explicitly selected from the breadcrumb", () => {
    document.body.innerHTML = "<section><p>one</p></section>"
    const section = document.querySelector("section")!
    $.move(document.querySelector("p")!.firstChild!, 1)
    editor.features.selection.actions.selectSection({type: "selectSection", path: [0]})

    editor.features.manipulation.setStyle({display: "grid"})

    expect(section).toHaveStyle({display: "grid"})
    expect(document.body).not.toHaveStyle({display: "grid"})
  })
  it("reports a mixed paragraph declaration as unset", () => {
    document.body.innerHTML = '<section><p style="text-align: start">one</p><p style="text-align: end">two</p></section>'
    const paragraphs = document.querySelectorAll("p")
    $.selectRange(paragraphs[0].firstChild!, 0, paragraphs[1].firstChild!, 3)

    const state = editor.features.manipulation.getStyleState(["text-align"])

    expect(state.inline).not.toHaveProperty("text-align")
    expect(state.computed["text-align"]).toBe("")
  })
  it("uses the authored widget host while capture is active", () => {
    document.body.innerHTML = "<demo-widget></demo-widget><p>other</p>"
    const widget = document.body.firstElementChild!
    editor.features.selection.captureElement(widget)
    $.selectRange(document.body.lastElementChild!.firstChild!, 2)

    editor.features.manipulation.setStyle({opacity: "0.5"})

    expect(widget).toHaveStyle({opacity: "0.5"})
    expect(document.body.lastElementChild).not.toHaveAttribute("style")
  })
  it("styles the table for an existing multi-cell selection", () => {
    document.body.innerHTML = "<table><tbody><tr><td>one</td><td>two</td></tr></tbody></table>"
    const table = document.body.firstElementChild as HTMLTableElement
    const cells = table.querySelectorAll("td")
    editor.features.table.selectCells(cells[0], cells[1])

    editor.features.manipulation.setStyle({"border-collapse": "collapse"})

    expect(table).toHaveStyle({borderCollapse: "collapse"})
  })
  it("styles the body without a live selection", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.body.firstElementChild!
    $.selectElement(paragraph)
    editor.features.selection.disable()
    document.getSelection()?.removeAllRanges()

    editor.features.manipulation.setStyle({color: "red"})
    const target = editor.features.manipulation.styleTarget
    const state = editor.features.manipulation.getStyleState(["color"])
    editor.features.selection.enable()

    expect(target).toBe(document.body)
    expect(state.target).toMatchObject({localName: "body"})
    expect(state.inline.color).toEqual({value: "red", priority: ""})
    expect(paragraph).not.toHaveAttribute("style")
    expect(document.body).toHaveStyle({color: "red"})
  })
  it("supports custom properties and important priority", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.body.firstElementChild!
    $.selectElement(paragraph)

    editor.features.manipulation.setStyle({
      "--accent": "rebeccapurple",
      color: {value: "var(--accent)", priority: "important"},
    })

    const style = (paragraph as HTMLElement).style
    expect(style.getPropertyValue("--accent")).toBe("rebeccapurple")
    expect(style.getPropertyValue("color")).toBe("var(--accent)")
    expect(style.getPropertyPriority("color")).toBe("important")
  })
  it("returns a serializable authored and computed style projection", () => {
    document.body.innerHTML = '<p style="width: 20px; color: red !important">hello</p>'
    $.selectElement(document.body.firstElementChild!)

    const state = editor.features.manipulation.getStyleState(["width", "display"])

    expect(state.target).toMatchObject({localName: "p"})
    expect(state.inline.width).toEqual({value: "20px", priority: ""})
    expect(state.inline.color).toEqual({value: "red", priority: "important"})
    expect(state.computed.width).toBeTruthy()
    expect(state.computed).toHaveProperty("display")
  })
  it("rejects malformed property names without changing authored styles", () => {
    document.body.innerHTML = "<p>hello</p>"
    const paragraph = document.body.firstElementChild!
    $.selectElement(paragraph)

    expect(() => editor.features.manipulation.setStyle({"color; display": "none"})).toThrow(TypeError)
    expect(paragraph).not.toHaveAttribute("style")
  })
})
