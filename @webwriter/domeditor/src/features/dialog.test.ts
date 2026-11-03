// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"
import * as Y from "yjs"
import {sharedDOMBody} from "../domdoc"

let editor: DOMEditor

beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
  document.body.replaceChildren()
  $.selectDocumentStart()
})

afterEach(() => editor.destroy())

describe("declarative dialog editing", () => {
  it("moves legacy popup content out of a table row and into its toggle cell", () => {
    document.body.innerHTML = '<table><tbody><tr><td><span class="ww-popup"><button popovertarget="note">Open</button></span></td><td>Other</td></tr></tbody></table>'
    const row = document.querySelector("tr")!, cell = row.cells[0]
    const content = document.createElement("div")
    content.className = "ww-popup-content"
    content.id = "note"
    content.setAttribute("popover", "auto")
    content.innerHTML = "<p>Body</p>"
    row.insertBefore(content, row.cells[1])

    editor.doc.syncFromDOM()

    expect(content.parentElement).toBe(cell)
    expect(Array.from(row.children, child => child.localName)).toEqual(["td", "td"])
    expect(editor.toHTML(true)).toContain('<td><span class="ww-popup">')
  })

  it("navigates to a linked dialog and restores an empty flow paragraph", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button></span></p><div class="ww-popup-content" id="note" role="dialog" popover="auto"><p>Body</p></div>'
    const button = document.querySelector("button")!, content = document.querySelector(".ww-popup-content")!, paragraph = content.querySelector("p")!
    $.move(button.firstChild!, 2)
    const down = new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, cancelable: true})
    document.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    expect($.anchor).toBe(paragraph.firstChild)
    expect($.anchorOffset).toBe(0)
    const up = new KeyboardEvent("keydown", {key: "ArrowUp", bubbles: true, cancelable: true})
    document.dispatchEvent(up)
    expect(up.defaultPrevented).toBe(true)
    expect($.anchor).toBe(button.firstChild)
    expect($.anchorOffset).toBe(2)
    paragraph.remove()
    editor.features.dialog.ensurePopupContent()
    expect(content.querySelector(":scope > p")).not.toBeNull()
  })
  it("restores an empty popup content paragraph while preserving authored nodes", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button><span id="note" popover="auto"><p>Body</p></span></span></p>'
    editor.doc.syncFromDOM()
    const content = document.querySelector<HTMLElement>("[popover]")!
    content.querySelector("p")!.remove()
    content.append(document.createComment("keep"))
    editor.doc.syncFromDOM()
    expect(content.innerHTML).toBe("<!--keep--><p></p>")
    expect(editor.toHTML(true)).not.toContain("Popup content")
    content.replaceChildren(document.createTextNode("Text"))
    editor.doc.syncFromDOM()
    expect(content.childNodes).toHaveLength(1)
    content.replaceChildren(document.createElement("test-widget"))
    editor.doc.syncFromDOM()
    expect(content.querySelector("p")).toBeNull()
  })

  it("removes the popup when its last toggle character is deleted and restores it on undo", async () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">X</button></span></p><div class="ww-popup-content" id="note" role="dialog" popover="auto"><p>Body</p></div>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const paragraph = document.querySelector("p")!, toggleText = document.querySelector("button")!.firstChild as Text
    $.move(toggleText, 1)
    toggleText.data = ""
    editor.doc.syncFromDOM()
    expect(document.querySelector(".ww-popup, .ww-popup-content")).toBeNull()
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
    expect(editor.toHTML(true)).toBe("<p></p>")
    editor.doc.undo()
    await Promise.resolve()
    expect(document.querySelector("button")?.textContent).toBe("X")
    expect(document.querySelector(".ww-popup-content")?.textContent).toBe("Body")
  })

  it("unwraps unrelated authored content when an empty nested popup is removed", () => {
    document.body.innerHTML = '<p>Before <span class="ww-popup"><button popovertarget="note">X</button><!--keep--><span id="note" popover="auto"><p>Body</p></span><em>Other</em></span> after</p>'
    editor.doc.syncFromDOM()
    document.querySelector("button")!.replaceChildren()
    editor.doc.syncFromDOM()
    const paragraph = document.querySelector("p")!
    expect(paragraph.querySelector(".ww-popup, [popover]")).toBeNull()
    expect(paragraph.querySelector("em")?.textContent).toBe("Other")
    expect(Array.from(paragraph.childNodes).some(node => node.nodeType === Node.COMMENT_NODE && node.textContent === "keep")).toBe(true)
    expect(paragraph.textContent).toBe("Before Other after")
  })

  it("removes orphaned popup content but preserves unrelated popovers and widget internals", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button></span></p><div class="ww-popup-content" id="note" popover="auto"><p>Body</p></div><div id="ordinary" popover="auto">Keep</div><test-widget><div class="ww-popup-content" id="widget-note" popover="auto">Widget content</div></test-widget>'
    editor.doc.syncFromDOM()
    $.move(document.querySelector(".ww-popup-content > p")!.firstChild!, 2)
    document.querySelector("button")!.remove()
    editor.doc.syncFromDOM()
    expect(document.getElementById("note")).toBeNull()
    expect(document.querySelector(".ww-popup")).toBeNull()
    expect($.anchor?.isConnected).toBe(true)
    expect($.anchor).toBe(document.body)
    expect($.anchorOffset).toBe(1)
    expect(document.getElementById("ordinary")?.textContent).toBe("Keep")
    expect(document.getElementById("widget-note")?.textContent).toBe("Widget content")
  })

  it("removes a popup dialog orphaned by a remote toggle deletion", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button></span></p><div class="ww-popup-content" id="note" popover="auto"><p>Body</p></div>'
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const paragraph = sharedDOMBody(remote).get(0) as Y.XmlElement
      const wrapper = paragraph.get(0) as Y.XmlElement
      remote.transact(() => wrapper.delete(0, 1))
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
      editor.doc.syncFromDOM()
      expect(document.querySelector(".ww-popup, .ww-popup-content")).toBeNull()
      expect(editor.toHTML(true)).toBe("<p></p>")
    }
    finally { remote.destroy() }
  })

  it("keeps a popup whose toggle contains an atomic inline element", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note"><img src="icon.png" alt="Open"></button></span></p><div class="ww-popup-content" id="note" popover="auto"><p>Body</p></div>'
    editor.doc.syncFromDOM()
    expect(document.querySelector(".ww-popup button img")).not.toBeNull()
    expect(document.getElementById("note")).not.toBeNull()
  })

  it("removes an empty popup toggle even when its dialog is already missing", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="missing"></button></span></p>'
    editor.doc.syncFromDOM()
    expect(document.querySelector(".ww-popup")).toBeNull()
    expect(editor.toHTML(true)).toBe("<p></p>")
  })

  it("undoes and redoes deletion of the last popup content element", async () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button><span id="note" popover="auto"><p>Body</p></span></span></p>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const content = document.querySelector("[popover]")!
    content.querySelector("p")!.remove()
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    expect(content.innerHTML).toBe("<p></p>")
    editor.doc.undo()
    await Promise.resolve()
    expect(content.innerHTML).toBe("<p>Body</p>")
    editor.doc.redo()
    await Promise.resolve()
    expect(content.innerHTML).toBe("<p></p>")
  })

  it("repairs remotely emptied popup content while preserving its button", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button><span id="note" popover="auto"><p>Body</p></span></span></p>'
    editor.doc.syncFromDOM()
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc))
      const paragraph = sharedDOMBody(remote).get(0) as Y.XmlElement
      const wrapper = paragraph.get(0) as Y.XmlElement
      const content = wrapper.get(1) as Y.XmlElement
      remote.transact(() => content.delete(0, 1))
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client")
      editor.doc.syncFromDOM()
      expect(editor.toHTML(true)).toContain('<span id="note" popover="auto"><p></p></span>')
      expect(document.querySelector("button")?.textContent).toBe("Open")
    }
    finally { remote.destroy() }
  })

  it("moves from an empty popup paragraph to and from its toggle", () => {
    document.body.innerHTML = '<p><span class="ww-popup"><button popovertarget="note">Open</button><span id="note" popover="auto"><p></p></span></span></p>'
    const button = document.querySelector("button")!, paragraph = document.querySelector("[popover] > p")!
    $.move(button.firstChild!, 2)
    const down = new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, cancelable: true})
    document.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    expect($.anchor).toBe(paragraph)
    expect($.anchorOffset).toBe(0)
    const up = new KeyboardEvent("keydown", {key: "ArrowUp", bubbles: true, cancelable: true})
    document.dispatchEvent(up)
    expect(up.defaultPrevented).toBe(true)
    expect($.anchor).toBe(button.firstChild)
    expect($.anchorOffset).toBe(2)
  })

  it("exposes popup content only during editing and prevents native activation", () => {
    document.body.innerHTML = '<div class="ww-popup"><button type="button" popovertarget="note">Open</button><div id="note" popover="auto"><p>Content</p></div></div><p>Outside</p>'
    const button = document.querySelector("button")!
    const popup = document.querySelector("[popover]")!
    $.move(popup.querySelector("p")!.firstChild!, 1)
    editor.features.dialog.refresh()
    expect(popup).toHaveClass("◆popup-visible")
    const click = new MouseEvent("click", {bubbles: true, cancelable: true})
    button.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(document.body).toHaveClass("◆popup-editing")
    expect(editor.toHTML(true)).not.toContain("◆")
    $.move(document.querySelector("body > p")!.firstChild!, 1)
    editor.features.dialog.refresh()
    expect(popup).not.toHaveClass("◆popup-visible")
    $.selectElement(button)
    editor.features.dialog.refresh()
    expect(popup).toHaveClass("◆popup-visible")
    editor.features.dialog.disable()
    expect(popup).not.toHaveClass("◆popup-visible")
    expect(document.body).not.toHaveClass("◆popup-editing")
    const afterDisable = new MouseEvent("click", {bubbles: true, cancelable: true})
    button.dispatchEvent(afterDisable)
    expect(afterDisable.defaultPrevented).toBe(false)
  })

  it("cleans the popup marker when its selected subtree is disconnected", () => {
    document.body.innerHTML = '<div class="ww-popup"><button popovertarget="note">Open</button><div id="note" popover="auto"><p>Content</p></div></div><p>Outside</p>'
    const popup = document.querySelector("[popover]")!
    $.move(popup.querySelector("p")!.firstChild!, 1)
    editor.features.dialog.refresh()
    popup.parentElement!.remove()
    $.move(document.querySelector("p")!.firstChild!, 1)
    editor.features.dialog.refresh()
    expect(popup).not.toHaveClass("◆popup-visible")
  })
  it("does not register dialog insertion", () => {
    expect(editor.features.dialog.actions).not.toHaveProperty("insertDialog")
  })

  it.each([false, true])("strips incoming dialog wrappers while preserving content (transfer=%s)", transfer => {
    const {fragment} = editor.parseHTMLFragment('<dialog open><p>Before</p><dialog><p>Nested</p></dialog><!-- keep --><test-widget><dialog><p>Widget</p></dialog></test-widget></dialog>', transfer)
    expect(fragment.querySelector("dialog")).toBeNull()
    expect(Array.from(fragment.children).map(element => element.localName)).toEqual(["p", "p", "test-widget"])
    expect(fragment.textContent).toBe("BeforeNestedWidget")
    expect(fragment.childNodes[2].nodeType).toBe(Node.COMMENT_NODE)
    expect(fragment.childNodes[2].textContent).toBe(" keep ")
    expect(fragment.querySelector("test-widget")?.innerHTML).toBe("<p>Widget</p>")
  })

  it("reveals a closed selected dialog without authoring open or UI nodes", () => {
    document.body.innerHTML = '<dialog id="notice"><p>Notice</p></dialog><p>After</p>'
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    $.selectElement(dialog)

    editor.features.dialog.refresh()

    expect(dialog).toHaveClass("◆dialog-editing")
    expect(dialog).not.toHaveAttribute("open")
    expect(document.body.querySelector(".◆editor-only")).toBeNull()
    expect(editor.toHTML(true)).toBe('<dialog id="notice"><p>Notice</p></dialog><p>After</p>')
  })

  it("removes the editing marker when selection leaves or the feature is disabled", async () => {
    document.body.innerHTML = "<dialog><p>Notice</p></dialog><p>After</p>"
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    const paragraph = document.querySelector<HTMLParagraphElement>("body > p")!
    $.selectElement(dialog)
    editor.features.dialog.refresh()

    $.move(paragraph.firstChild!, 1)
    document.dispatchEvent(new Event("selectionchange"))
    await Promise.resolve()
    expect(dialog).not.toHaveClass("◆dialog-editing")
    expect(dialog).not.toHaveAttribute("class")

    $.selectElement(dialog)
    editor.features.dialog.refresh()
    editor.features.dialog.disable()
    expect(dialog).not.toHaveAttribute("class")
  })

  it("derives state from irregular authored dialog content", () => {
    document.body.innerHTML = `
      <button commandfor="notice" command="show-modal">First</button>
      <button commandfor="notice" command="show-modal">Second</button>
      <dialog id="notice" open closedby="closerequest" aria-label="Notice">
        <!-- retained --><webwriter-custom></webwriter-custom>
        <form method="dialog"><button value="ok">OK</button></form>
        <button commandfor="notice" command="request-close">Cancel</button>
      </dialog>`
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    $.selectElement(dialog)

    expect(editor.features.dialog.getState()).toEqual(expect.objectContaining({
      initiallyOpen: true,
      closedBy: "closerequest",
      openerCount: 2,
      closeControlCount: 1,
      hasDialogForm: true,
      attributes: expect.objectContaining({id: "notice", open: "", "aria-label": "Notice"}),
    }))
    expect(editor.toHTML(true)).toContain("<!-- retained -->")
    expect(editor.toHTML(true)).toContain("<webwriter-custom></webwriter-custom>")
  })

  it("edits dialog attributes and preserves uniquely linked invokers", () => {
    document.body.innerHTML = `
      <button commandfor="notice" command="show-modal">Open</button>
      <dialog id="notice"><button commandfor="notice" command="close">Close</button></dialog>`
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    $.selectElement(dialog)
    editor.features.dialog.refresh()

    editor.features.dialog.actions.setDialogAttribute({type: "setDialogAttribute", name: "id", value: "renamed"})
    editor.features.dialog.actions.setDialogAttribute({type: "setDialogAttribute", name: "open", value: ""})
    editor.features.dialog.actions.setDialogAttribute({type: "setDialogAttribute", name: "closedby", value: "none"})

    expect(dialog.id).toBe("renamed")
    expect(document.querySelectorAll('[commandfor="renamed"]')).toHaveLength(2)
    expect(dialog).toHaveAttribute("open")
    expect(dialog).toHaveAttribute("closedby", "none")
  })

  it("does not rewrite ambiguous references when duplicate authored IDs exist", () => {
    document.body.innerHTML = `
      <button commandfor="duplicate" command="show-modal">Open</button>
      <dialog id="duplicate"></dialog><div id="duplicate"></div>`
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    $.selectElement(dialog)
    editor.features.dialog.refresh()

    editor.features.dialog.actions.setDialogAttribute({type: "setDialogAttribute", name: "id", value: "renamed"})

    expect(document.querySelector("button")).toHaveAttribute("commandfor", "duplicate")
  })

  it("prevents authored dialog commands in editing mode", () => {
    document.body.innerHTML = `
      <button commandfor="notice" command="show-modal"><span>Open</span></button>
      <dialog id="notice"><button commandfor="notice" command="close">Close</button></dialog>`

    const opener = document.querySelector<HTMLButtonElement>('button[command="show-modal"]')!
    const close = document.querySelector<HTMLButtonElement>('button[command="close"]')!
    const openEvent = new MouseEvent("click", {bubbles: true, cancelable: true})
    opener.querySelector("span")!.dispatchEvent(openEvent)
    const closeEvent = new MouseEvent("click", {bubbles: true, cancelable: true})
    close.dispatchEvent(closeEvent)

    expect(openEvent.defaultPrevented).toBe(true)
    expect(closeEvent.defaultPrevented).toBe(true)
    expect(document.querySelector("dialog")).not.toHaveAttribute("open")
  })

  it("cleans a marker from a disconnected dialog without touching authored classes", () => {
    document.body.innerHTML = '<dialog class="authored"></dialog><p>Replacement</p>'
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    $.selectElement(dialog)
    editor.features.dialog.refresh()
    dialog.remove()
    $.move(document.querySelector("p")!)

    editor.features.dialog.refresh()
    editor.features.dialog.disable()

    expect(dialog.className).toBe("authored")
  })
})
