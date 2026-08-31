// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {DOMEditor} from "./domeditor"

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute("contenteditable")
  document.body.removeAttribute("spellcheck")
  document.body.inert = false
  document.designMode = "off"
})

describe("DOMEditor lifecycle", () => {
  it("keeps the default slot when it had to create the body's shadow root", () => {
    expect(document.body.shadowRoot).toBeNull()
    const authored = document.createElement("p")
    authored.textContent = "Authored"
    document.body.append(authored)
    const editor = new DOMEditor()
    const appendix = editor.appendix
    const slot = Array.from(appendix.children).find(element => (
      element.localName === "slot" && !element.hasAttribute("name")
    ))!

    editor.destroy()

    expect(slot.isConnected).toBe(true)
    expect(document.body.contains(authored)).toBe(true)
  })

  it("restores host document state and removes owned appendix elements exactly once", () => {
    document.designMode = "off"
    document.body.contentEditable = "false"
    document.body.spellcheck = true
    document.body.inert = true
    const appendix = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
    Array.from(appendix.children)
      .filter(element => element.localName === "slot" && !element.hasAttribute("name"))
      .forEach(element => element.remove())
    const existing = document.createElement("output")
    appendix.append(existing)
    const initialAppendixStylesheets = [...appendix.adoptedStyleSheets]
    const initialDocumentStylesheets = [...document.adoptedStyleSheets]
    const editor = new DOMEditor()
    const lockOwner = {}
    editor.features.transformation.anchor
    editor.features.placeholder.enable()
    const placeholderStylesheet = editor.features.placeholder.placeholderStylesheet
    editor.lockEditing(lockOwner)

    expect(appendix.querySelector("#◆transform-overlay-anchor")).not.toBeNull()
    expect(document.adoptedStyleSheets).toContain(placeholderStylesheet)

    editor.destroy()
    expect(() => editor.destroy()).not.toThrow()

    expect(document.designMode).toBe("off")
    expect(document.body.contentEditable).toBe("false")
    expect(document.body.spellcheck).toBe(true)
    expect(document.body.inert).toBe(true)
    expect(existing.isConnected).toBe(true)
    expect(appendix.querySelector("#◆transform-overlay-anchor")).toBeNull()
    expect(appendix.querySelector("domeditor-insertion-menu")).toBeNull()
    expect(appendix.adoptedStyleSheets).toEqual(initialAppendixStylesheets)
    expect(document.adoptedStyleSheets).toEqual(initialDocumentStylesheets)
    expect(Array.from(appendix.children).some(element => element.localName === "slot" && !element.hasAttribute("name"))).toBe(false)
  })

  it("rejects corrupt initial updates before changing host editing state", () => {
    document.designMode = "off"
    document.body.contentEditable = "false"
    document.body.spellcheck = true

    expect(() => new DOMEditor({initialState: {update: [255]}}))
      .toThrow("invalid Yjs update")
    expect(document.designMode).toBe("off")
    expect(document.body.contentEditable).toBe("false")
    expect(document.body.spellcheck).toBe(true)
    expect(document.body.shadowRoot?.querySelector("#◆transform-overlay-anchor") ?? null).toBeNull()
    expect(document.body.shadowRoot?.adoptedStyleSheets ?? []).toHaveLength(0)
  })

  it("rejects non-WebSocket collaboration URLs before changing host editing state", () => {
    document.designMode = "off"
    document.body.contentEditable = "false"
    document.body.spellcheck = true

    expect(() => new DOMEditor({syncUrl: "https://example.com/session"}))
      .toThrow("must use ws: or wss:")
    expect(document.designMode).toBe("off")
    expect(document.body.contentEditable).toBe("false")
    expect(document.body.spellcheck).toBe(true)
    expect(document.body.shadowRoot?.querySelector("#◆transform-overlay-anchor") ?? null).toBeNull()
  })

  it("rejects a second live editor because document listeners and appendix UI are global", () => {
    document.designMode = "off"
    document.body.contentEditable = "false"
    document.body.spellcheck = true
    const first = new DOMEditor()

    expect(() => new DOMEditor()).toThrow("Only one DOMEditor can be active")
    expect(document.designMode).toBe("on")
    expect(document.body.contentEditable).toBe("true")
    expect(document.body.spellcheck).toBe(false)

    first.destroy()
    expect(document.designMode).toBe("off")
    expect(document.body.contentEditable).toBe("false")
    expect(document.body.spellcheck).toBe(true)

    const replacement = new DOMEditor()
    replacement.destroy()
  })
})
