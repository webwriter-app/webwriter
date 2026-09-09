// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"

let editor: DOMEditor

beforeEach(() => {
  document.body.replaceChildren()
  editor = new DOMEditor()
  document.body.replaceChildren()
  $.selectDocumentStart()
})

afterEach(() => editor.destroy())

describe("declarative dialog editing", () => {
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
