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
