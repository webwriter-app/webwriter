// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import * as Y from "yjs"
import {Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates} from "y-protocols/awareness"
import {DOMEditor} from "../domeditor"

let editor: DOMEditor
let remoteDoc: Y.Doc | null = null
let remoteAwareness: Awareness | null = null

async function mutationsDelivered() {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

function addRemoteUser(name = "Ada", color = "#ff3366", offset = 2) {
  const text = document.querySelector("p")!.firstChild!
  const position = editor.doc.relativePositionFromDOMPoint(text, offset)!
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
})

describe("collaboration presence", () => {
  it("shows every active user as a colored dot at the document anchor", () => {
    const remoteClientId = addRemoteUser("Ada", "#ff3366")
    const users = editor.appendix.querySelector<HTMLElement>(".◆presence-users")!
    const dots = users.querySelectorAll<HTMLElement>(".◆presence-user")

    expect(dots).toHaveLength(2)
    expect(users.parentNode).toBe(document.body.shadowRoot)
    expect(document.body.classList.contains("◆presence-document-anchor")).toBe(true)
    expect(users.getAttribute("part")).toContain("presence-users")
    const remoteDot = users.querySelector<HTMLElement>(`[data-client-id="${remoteClientId}"]`)!
    expect(remoteDot.title).toBe("Ada")
    expect(remoteDot.style.getPropertyValue("--presence-color")).toBe("#ff3366")
  })

  it("renders a remote relative selection as a colored virtual caret in the shadow DOM", () => {
    const remoteClientId = addRemoteUser("Grace", "#3366ff", 3)
    const caret = editor.appendix.querySelector<HTMLElement>(`.◆presence-caret[data-client-id="${remoteClientId}"]`)!
    const paragraph = document.querySelector("p")!
    const anchorClass = Array.from(paragraph.classList).find(name => name.startsWith("◆presence-caret-anchor-"))

    expect(caret).not.toBeNull()
    expect(caret.parentNode).toBe(document.body.shadowRoot)
    expect(caret.getAttribute("part")).toContain("presence-caret")
    expect(caret.style.getPropertyValue("--presence-color")).toBe("#3366ff")
    expect(caret.style.getPropertyValue("position-anchor")).toContain("--presence-caret-")
    expect(caret.querySelector(".◆presence-caret-label")?.textContent).toBe("Grace")
    expect(anchorClass).toBeDefined()
    expect(document.adoptedStyleSheets.some(sheet =>
      Array.from(sheet.cssRules).some(rule => rule.cssText.includes(anchorClass!)),
    )).toBe(true)
  })

  it("keeps every presence element out of the editable light DOM and Yjs", () => {
    addRemoteUser()
    const paragraph = document.querySelector("p")!
    const yParagraph = editor.doc.body.firstChild as Y.XmlElement

    expect(document.querySelector(".◆presence-users")).toBeNull()
    expect(document.querySelector(".◆presence-caret")).toBeNull()
    expect(editor.appendix.querySelector(".◆presence-users")).not.toBeNull()
    expect(editor.appendix.querySelector(".◆presence-caret")).not.toBeNull()
    expect(yParagraph.getAttribute("class")).toBeUndefined()
    expect(paragraph.className).toContain("◆presence-caret-anchor-")
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

  it("removes departed users, their virtual carets, anchor classes, and dynamic rules", () => {
    const remoteClientId = addRemoteUser()
    const paragraph = document.querySelector("p")!
    const anchorClass = Array.from(paragraph.classList).find(name => name.startsWith("◆presence-caret-anchor-"))!

    removeAwarenessStates(editor.doc.awareness, [remoteClientId], "remote-disconnect")

    expect(editor.appendix.querySelectorAll(".◆presence-user")).toHaveLength(1)
    expect(editor.appendix.querySelector(".◆presence-caret")).toBeNull()
    expect(paragraph.classList.contains(anchorClass)).toBe(false)
    expect(document.adoptedStyleSheets.some(sheet =>
      Array.from(sheet.cssRules).some(rule => rule.cssText.includes(anchorClass)),
    )).toBe(false)
  })
})
