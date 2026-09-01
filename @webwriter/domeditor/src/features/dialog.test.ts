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
  it("inserts an accessible script-free modal pattern and selects its dialog", () => {
    editor.features.dialog.actions.insertDialog({type: "insertDialog"})

    const opener = document.querySelector<HTMLButtonElement>('button[command="show-modal"]')!
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    const close = dialog.querySelector<HTMLButtonElement>('button[command="close"]')!
    const title = dialog.querySelector("h2")!

    expect(opener).toHaveAttribute("type", "button")
    expect(opener).toHaveAttribute("commandfor", dialog.id)
    expect(dialog).toHaveAttribute("closedby", "any")
    expect(dialog).toHaveAttribute("aria-labelledby", title.id)
    expect(close).toHaveAttribute("commandfor", dialog.id)
    expect(document.body.querySelector("script, style")).toBeNull()
    expect($.selectedElement).toBe(dialog)
    expect(dialog).toHaveClass("◆dialog-editing")
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("uses collision-free dialog and title IDs", () => {
    document.body.innerHTML = '<p id="dialog-1"></p><p id="dialog-2-title"></p>'
    $.selectDocumentStart()

    editor.features.dialog.actions.insertDialog({type: "insertDialog"})

    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    expect(dialog.id).toBe("dialog-3")
    expect(dialog.querySelector("h2")?.id).toBe("dialog-3-title")
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

  it("adds authored invoker controls without wrappers or editor attributes", () => {
    document.body.innerHTML = "<dialog><p>Notice</p></dialog>"
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    $.selectElement(dialog)
    editor.features.dialog.refresh()

    editor.features.dialog.actions.addDialogInvoker({type: "addDialogInvoker"})
    editor.features.dialog.actions.addDialogCloseButton({type: "addDialogCloseButton"})

    expect(dialog.id).toBe("dialog-1")
    expect(dialog.previousElementSibling?.matches("button[command='show-modal'][commandfor='dialog-1']")).toBe(true)
    expect(dialog.lastElementChild?.matches("button[command='close'][commandfor='dialog-1']")).toBe(true)
    expect(document.body.querySelector("[data-webwriter-editor-only], .◆editor-only")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("◆")
  })

  it("prevents authored dialog commands in editing mode", () => {
    document.body.innerHTML = `
      <button commandfor="notice" command="show-modal"><span>Open</span></button>
      <dialog id="notice"><button commandfor="notice" command="close">Close</button></dialog>`
    const opener = document.querySelector<HTMLButtonElement>("body > button")!
    const close = document.querySelector<HTMLButtonElement>("dialog button")!

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
