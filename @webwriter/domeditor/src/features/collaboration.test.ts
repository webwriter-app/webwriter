// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import * as Y from "yjs"
import {Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates} from "y-protocols/awareness"
import {DOMEditor} from "../domeditor"
import {$} from "../utility"

let editor: DOMEditor
let remoteDoc: Y.Doc | null = null
let remoteAwareness: Awareness | null = null

async function mutationsDelivered() {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

function addRemoteSelection(name: string, color: string, node: Node, offset: number) {
  const position = editor.doc.relativePositionFromDOMPoint(node, offset)!
  remoteDoc = new Y.Doc()
  remoteAwareness = new Awareness(remoteDoc as any)
  remoteAwareness.setLocalState({
    user: {name, color},
    selection: {anchor: position, focus: position},
  })
  applyAwarenessUpdate(
    editor.doc.awareness,
    encodeAwarenessUpdate(remoteAwareness, [remoteAwareness.clientID]),
    "remote-awareness",
  )
  return remoteAwareness.clientID
}

function addRemoteElementSelection(name: string, color: string, parent: Element, index: number) {
  const anchor = editor.doc.relativePositionFromDOMPoint(parent, index)!
  const focus = editor.doc.relativePositionFromDOMPoint(parent, index + 1)!
  remoteDoc = new Y.Doc()
  remoteAwareness = new Awareness(remoteDoc as any)
  remoteAwareness.setLocalState({
    user: {name, color},
    selection: {anchor, focus},
  })
  applyAwarenessUpdate(
    editor.doc.awareness,
    encodeAwarenessUpdate(remoteAwareness, [remoteAwareness.clientID]),
    "remote-awareness",
  )
  return remoteAwareness.clientID
}

function addRemoteUser(name = "Ada", color = "#ff3366", offset = 2) {
  return addRemoteSelection(name, color, document.querySelector("p")!.firstChild!, offset)
}

beforeEach(() => {
  const body = document.createElement("body")
  body.innerHTML = "<p>Hello</p>"
  document.body.replaceWith(body)
  editor = new DOMEditor()
})

afterEach(() => {
  editor.destroy()
  remoteAwareness?.destroy()
  remoteDoc?.destroy()
  remoteAwareness = null
  remoteDoc = null
})

describe("DOMEditor collaboration wiring", () => {
  it("always owns a live Y document and routes direct DOM changes to history", async () => {
    expect(editor.doc.doc).toBeInstanceOf(Y.Doc)
    document.querySelector("p")!.textContent = "Changed"
    await mutationsDelivered()
    expect((editor.doc.body.firstChild as Y.XmlElement).toString()).toContain("Changed")

    editor.features.history.actions.undo({type: "undo"})
    expect(document.querySelector("p")!.textContent).toBe("Hello")
    editor.features.history.actions.redo({type: "redo"})
    expect(document.querySelector("p")!.textContent).toBe("Changed")
  })

  it("synchronizes inline style commands and includes them in undo, redo, and serialization", async () => {
    const paragraph = document.querySelector("p")!
    $.selectRange(paragraph.firstChild!, 2)

    editor.features.manipulation.actions.setStyle({
      type: "setStyle",
      styles: {color: {value: "rebeccapurple", priority: "important"}},
    })
    await mutationsDelivered()

    expect((paragraph as HTMLElement).style.getPropertyValue("color")).toBe("rebeccapurple")
    expect((paragraph as HTMLElement).style.getPropertyPriority("color")).toBe("important")
    expect((editor.doc.body.firstChild as Y.XmlElement).toString()).toContain("color: rebeccapurple !important")
    expect(editor.toHTML(true)).toContain('style="color: rebeccapurple !important;"')

    editor.features.history.actions.undo({type: "undo"})
    expect(paragraph.hasAttribute("style")).toBe(false)
    editor.features.history.actions.redo({type: "redo"})
    expect((paragraph as HTMLElement).style.getPropertyValue("color")).toBe("rebeccapurple")
  })

  it("synchronizes semantic table cells through undo, redo, and serialization", async () => {
    document.body.innerHTML = '<table><tbody><tr><td id="name"><strong>Name</strong></td></tr></tbody></table>'
    await mutationsDelivered()
    editor.doc.stopCapturing()
    editor.features.table.selectCells(document.querySelector("td")!)

    expect(editor.features.table.actions.setTableCellRole({
      type: "setTableCellRole", role: "column-header",
    })).toBe(true)
    await mutationsDelivered()

    expect(document.querySelector("th")?.getAttribute("scope")).toBe("col")
    expect(document.querySelector("th")?.innerHTML).toBe("<strong>Name</strong>")
    expect(editor.toHTML(true)).toContain('<th id="name" scope="col"><strong>Name</strong></th>')
    expect((editor.doc.body.firstChild as Y.XmlElement).toString()).toContain('scope="col"')

    editor.features.history.actions.undo({type: "undo"})
    expect(document.querySelector("td")?.innerHTML).toBe("<strong>Name</strong>")
    editor.features.history.actions.redo({type: "redo"})
    expect(document.querySelector("th")?.getAttribute("scope")).toBe("col")
  })

  it("synchronizes authored dialog state while excluding its editing marker", async () => {
    document.body.innerHTML = '<dialog id="notice"><p>Notice</p></dialog>'
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!
    $.selectElement(dialog)
    editor.features.dialog.refresh()

    editor.features.dialog.actions.setDialogAttribute({
      type: "setDialogAttribute",
      name: "closedby",
      value: "any",
    })
    await mutationsDelivered()

    expect(dialog.classList.contains("◆dialog-editing")).toBe(true)
    expect(editor.doc.body.toString()).toContain('closedby="any"')
    expect(editor.doc.body.toString()).not.toContain("◆")
    expect(editor.toHTML(true)).toBe('<dialog id="notice" closedby="any"><p>Notice</p></dialog>')

    editor.features.history.actions.undo({type: "undo"})
    expect(document.querySelector("dialog")?.hasAttribute("closedby")).toBe(false)
    editor.features.history.actions.redo({type: "redo"})
    expect(document.querySelector("dialog")?.getAttribute("closedby")).toBe("any")
  })

  it("synchronizes block-format conversion and includes it in undo and redo", async () => {
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)

    editor.features.manipulation.actions.setBlockType({type: "setBlockType", tag: "h2"})
    await mutationsDelivered()

    expect(editor.toHTML(true)).toBe("<h2>Hello</h2>")
    expect(editor.doc.body.toString()).toContain("<h2>Hello</h2>")

    editor.features.history.actions.undo({type: "undo"})
    expect(editor.toHTML(true)).toBe("<p>Hello</p>")
    editor.features.history.actions.redo({type: "redo"})
    expect(editor.toHTML(true)).toBe("<h2>Hello</h2>")
  })

  it("synchronizes ordered-list metadata and includes it in undo, redo, and serialization", async () => {
    document.body.innerHTML = "<ol><li>Hello</li></ol>"
    await mutationsDelivered()
    editor.doc.stopCapturing()
    $.move(document.querySelector("li")!.firstChild!, 2)

    editor.features.list.actions.setOrderedListAttribute({type: "setOrderedListAttribute", name: "start", value: "5"})
    editor.features.list.actions.setOrderedListAttribute({type: "setOrderedListAttribute", name: "reversed", value: ""})
    editor.features.list.actions.setOrderedListItemValue({type: "setOrderedListItemValue", value: "8"})
    await mutationsDelivered()

    expect(editor.toHTML(true)).toBe('<ol start="5" reversed=""><li value="8">Hello</li></ol>')
    expect(editor.doc.body.toString()).toContain('<ol reversed="" start="5"><li value="8">Hello</li></ol>')
    editor.features.history.actions.undo({type: "undo"})
    expect(editor.toHTML(true)).toBe("<ol><li>Hello</li></ol>")
    editor.features.history.actions.redo({type: "redo"})
    expect(editor.toHTML(true)).toBe('<ol start="5" reversed=""><li value="8">Hello</li></ol>')
  })

  it("synchronizes figure conversion and captions through undo, redo, and serialization", async () => {
    document.body.innerHTML = '<img src="diagram.png" alt="Diagram">'
    await mutationsDelivered()
    editor.doc.stopCapturing()
    const image = document.querySelector("img")!
    $.selectElement(image)
    editor.features.selection.processSelection()

    editor.features.media.actions.wrapMediaInFigure({type: "wrapMediaInFigure"})
    editor.features.manipulation.actions.addFigureCaption({type: "addFigureCaption", position: "after"})
    await mutationsDelivered()

    expect(editor.toHTML(true)).toBe('<figure><img src="diagram.png" alt="Diagram"><figcaption></figcaption></figure>')
    expect(editor.doc.body.toString()).toContain('<figure><img alt="Diagram" src="diagram.png"></img><figcaption></figcaption></figure>')
    editor.features.history.actions.undo({type: "undo"})
    expect(editor.toHTML(true)).toBe('<img src="diagram.png" alt="Diagram">')
    editor.features.history.actions.redo({type: "redo"})
    expect(editor.toHTML(true)).toBe('<figure><img src="diagram.png" alt="Diagram"><figcaption></figcaption></figure>')
  })

  it("synchronizes section wrappers and includes them in undo and redo", async () => {
    const paragraph = document.querySelector("p")!
    $.move(paragraph.firstChild!, 2)

    editor.features.manipulation.actions.toggleSection({type: "toggleSection"})
    await mutationsDelivered()

    expect(editor.toHTML(true)).toBe("<section><p>Hello</p></section>")
    expect(editor.doc.body.toString()).toContain("<section><p>Hello</p></section>")

    editor.features.history.actions.undo({type: "undo"})
    expect(editor.toHTML(true)).toBe("<p>Hello</p>")
    editor.features.history.actions.redo({type: "redo"})
    expect(editor.toHTML(true)).toBe("<section><p>Hello</p></section>")
  })

  it("synchronizes in-document comments and includes them in undo and redo", async () => {
    const paragraph = document.querySelector("p")!
    $.selectRange(paragraph.firstChild!, 0, paragraph.firstChild!, 5)
    editor.features.comment.actions.toggleComment({type: "toggleComment", text: "Collaborative note"})
    await mutationsDelivered()

    expect(editor.features.comment.getState()).toMatchObject({active: true, count: 1, text: "Collaborative note"})
    expect(editor.toHTML(true)).toContain("webwriter:comment:start:")
    expect(editor.doc.body.toString()).toContain("webwriter:comment:start:")

    editor.features.history.actions.undo({type: "undo"})
    expect(editor.features.comment.getState().count).toBe(0)
    expect(editor.toHTML(true)).toBe("<p>Hello</p>")

    editor.features.history.actions.redo({type: "redo"})
    expect(editor.features.comment.getState().count).toBe(1)
    expect(editor.toHTML(true)).toContain("Collaborative%20note")
  })
})

describe("collaboration history shortcuts", () => {
  const originalPlatform = navigator.platform

  afterEach(() => {
    Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
  })

  it("undoes and redoes with Apple shortcuts, including uppercase Shift+Cmd+Z", async () => {
    Object.defineProperty(navigator, "platform", {value: "MacIntel", configurable: true})
    document.querySelector("p")!.textContent = "Changed"
    await mutationsDelivered()

    const undo = new KeyboardEvent("keydown", {key: "z", metaKey: true, bubbles: true, cancelable: true})
    document.dispatchEvent(undo)
    expect(undo.defaultPrevented).toBe(true)
    expect(document.querySelector("p")!.textContent).toBe("Hello")

    const redo = new KeyboardEvent("keydown", {key: "Z", metaKey: true, shiftKey: true, bubbles: true, cancelable: true})
    document.dispatchEvent(redo)
    expect(redo.defaultPrevented).toBe(true)
    expect(document.querySelector("p")!.textContent).toBe("Changed")
  })

  it("undoes and redoes with non-Apple shortcuts", async () => {
    Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
    document.querySelector("p")!.textContent = "Changed"
    await mutationsDelivered()

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "z", ctrlKey: true, bubbles: true, cancelable: true}))
    expect(document.querySelector("p")!.textContent).toBe("Hello")

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "y", ctrlKey: true, bubbles: true, cancelable: true}))
    expect(document.querySelector("p")!.textContent).toBe("Changed")
  })
})

describe("collaboration presence", () => {
  it("shows a remote user's two initials only at their caret", () => {
    const remoteClientId = addRemoteUser("Ada", "#ff3366")
    const caret = editor.appendix.querySelector<HTMLElement>(`.◆presence-caret[data-client-id="${remoteClientId}"]`)!

    expect(editor.appendix.querySelector(".◆presence-users")).toBeNull()
    expect(document.body.classList.contains("◆presence-document-anchor")).toBe(false)
    expect(caret.title).toBe("Ada")
    expect(caret.querySelector(".◆presence-caret-label")?.textContent).toBe("AD")
    expect(caret.style.getPropertyValue("--presence-color")).toBe("#ff3366")
    expect(caret.style.opacity).toBe("")
  })

  it("renders a remote relative selection as a colored virtual caret in the shadow DOM", () => {
    const remoteClientId = addRemoteUser("Grace", "#3366ff", 3)
    const caret = editor.appendix.querySelector<HTMLElement>(`.◆presence-caret[data-client-id="${remoteClientId}"]`)!

    expect(caret).not.toBeNull()
    expect(caret.parentNode).toBe(document.body.shadowRoot)
    expect(caret.getAttribute("part")).toContain("presence-caret")
    expect(caret.style.getPropertyValue("--presence-color")).toBe("#3366ff")
    expect(caret.style.getPropertyValue("position-anchor")).toBe("")
    expect(caret.querySelector(".◆presence-caret-label")?.textContent).toBe("GR")
    expect(caret.style.left).toBe("0px")
    expect(caret.style.top).toBe("0px")
  })

  it("uses the native caret rectangle without translating or stretching it", () => {
    const nativeRect = Range.prototype.getBoundingClientRect
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(42, 24, 0, 13),
    })

    try {
      const remoteClientId = addRemoteUser("Grace Hopper", "#3366ff", 3)
      const caret = editor.appendix.querySelector<HTMLElement>(`.◆presence-caret[data-client-id="${remoteClientId}"]`)!

      expect(caret.style.left).toBe("42px")
      expect(caret.style.top).toBe("24px")
      expect(caret.style.getPropertyValue("--presence-caret-height")).toBe("13px")
      expect(caret.querySelector(".◆presence-caret-label")?.textContent).toBe("GH")
    }
    finally {
      Object.defineProperty(Range.prototype, "getBoundingClientRect", {configurable: true, value: nativeRect})
    }
  })

  it("uses the existing colored gap caret with initials and remote styling", () => {
    const secondParagraph = document.createElement("p")
    secondParagraph.textContent = "World"
    document.body.append(secondParagraph)
    editor.doc.syncFromDOM()

    const gapOffset = Array.from(document.body.childNodes).indexOf(secondParagraph)
    const remoteClientId = addRemoteSelection("Ada Lovelace", "#ff3366", document.body, gapOffset)
    const caret = editor.appendix.querySelector<HTMLElement>(`.◆presence-caret[data-client-id="${remoteClientId}"]`)!

    expect(caret.classList.contains("◆presence-gap-caret")).toBe(true)
    const parts = caret.getAttribute("part")?.split(/\s+/) ?? []
    expect(parts).toContain("gap-caret")
    expect(parts).toContain("presence-gap-caret")
    expect(parts).not.toContain("presence-caret")
    expect(caret.querySelector(".◆presence-caret-label")?.textContent).toBe("AL")
    expect(caret.style.color).toBe("")
    expect(caret.style.opacity).toBe("")
    expect(caret.style.getPropertyValue("--presence-gap-caret-size")).toBe("16px")
    expect(caret.style.getPropertyValue("position-anchor")).toBe("auto")
    const labelParts = caret.querySelector(".◆presence-caret-label")?.getAttribute("part")?.split(/\s+/) ?? []
    expect(labelParts).toContain("presence-gap-caret-label")
  })

  it("renders remote element selections with the native selection outline and top-right initials", () => {
    const remoteClientId = addRemoteElementSelection("Grace Hopper", "#3366ff", document.body, 0)
    const selection = editor.appendix.querySelector<HTMLElement>(`.◆presence-element-selection[data-client-id="${remoteClientId}"]`)
    const label = selection?.querySelector<HTMLElement>(".◆presence-caret-label")

    expect(selection).not.toBeNull()
    expect(selection?.classList.contains("◆presence-caret")).toBe(true)
    expect(selection?.getAttribute("part")).toContain("presence-element-selection")
    expect(selection?.style.getPropertyValue("--presence-color")).toBe("#3366ff")
    expect(selection?.style.opacity).toBe("")
    expect(label?.textContent).toBe("GH")
    expect(label?.getAttribute("part")).toContain("presence-element-selection-label")
    expect(document.querySelector(".◆element-selected")).toBeNull()
    expect(editor.toHTML()).not.toContain("◆presence")
  })

  it("keeps every presence element out of the editable light DOM and Yjs", () => {
    addRemoteUser()
    const paragraph = document.querySelector("p")!
    const yParagraph = editor.doc.body.firstChild as Y.XmlElement

    expect(document.querySelector(".◆presence-users")).toBeNull()
    expect(document.querySelector(".◆presence-caret")).toBeNull()
    expect(editor.appendix.querySelector(".◆presence-users")).toBeNull()
    expect(editor.appendix.querySelector(".◆presence-caret")).not.toBeNull()
    expect(yParagraph.getAttribute("class")).toBeUndefined()
    expect(paragraph.className).not.toContain("◆presence-caret-anchor-")
    expect(editor.toHTML()).not.toContain("◆presence")
  })

  it("moves a virtual caret with its Yjs relative position after local text insertion", async () => {
    const remoteClientId = addRemoteUser("Lin", "#008877", 3)
    const text = document.querySelector("p")!.firstChild as Text
    text.data = `X${text.data}`
    await mutationsDelivered()

    const selection = editor.doc.domSelectionForClient(remoteClientId)!
    expect(selection.focusNode).toBe(text)
    expect(selection.focusOffset).toBe(4)
    expect(editor.appendix.querySelector(`.◆presence-caret[data-client-id="${remoteClientId}"]`)).not.toBeNull()
  })

  it("removes departed users and their virtual carets", () => {
    const remoteClientId = addRemoteUser()
    const paragraph = document.querySelector("p")!

    removeAwarenessStates(editor.doc.awareness, [remoteClientId], "remote-disconnect")

    expect(editor.appendix.querySelectorAll(".◆presence-user")).toHaveLength(0)
    expect(editor.appendix.querySelector(".◆presence-caret")).toBeNull()
    expect(paragraph.className).not.toContain("◆presence-caret-anchor-")
  })
})
