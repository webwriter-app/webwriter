// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "./domeditor"
import * as Y from "yjs"

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute("contenteditable")
  document.body.removeAttribute("spellcheck")
  document.body.inert = false
  document.designMode = "off"
  document.documentElement.removeAttribute("id")
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

  it("assigns a persistent UUIDv4 document ID to the html element", () => {
    const editor = new DOMEditor()
    const id = document.documentElement.id
    try {
      expect(id).toMatch(/^ww[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(editor.toHTML()).toContain(`<html id="${id}"`)
      expect(editor.doc.widgetData.documentId).toBe(id)
      expect(editor.doc.snapshot().widgetDataDocumentId).toBe(id)
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      document.body.querySelector("p")!.textContent = "Edited"
      editor.doc.syncFromDOM()
      editor.doc.undo()
      expect(document.documentElement.id).toBe(id)
      editor.doc.redo()
      expect(document.documentElement.id).toBe(id)
    }
    finally {
      editor.destroy()
    }
    const reopened = new DOMEditor()
    try {
      expect(document.documentElement.id).toBe(id)
    }
    finally {
      reopened.destroy()
    }
  })

  it("preserves an authored document ID", () => {
    document.documentElement.id = `ww${crypto.randomUUID()}`
    const id = document.documentElement.id
    const editor = new DOMEditor()
    try {
      expect(document.documentElement.id).toBe(id)
      expect(editor.doc.widgetData.documentId).toBe(id)
    }
    finally {
      editor.destroy()
    }
  })

  it("restores the document ID from a shared snapshot instead of the host ID", () => {
    const original = new DOMEditor()
    const id = document.documentElement.id
    const snapshot = original.doc.snapshot()
    original.destroy()
    document.documentElement.id = "stale-host-id"
    const restored = new DOMEditor({initialState: snapshot})
    try {
      expect(document.documentElement.id).toBe(id)
      expect(restored.doc.widgetData.documentId).toBe(id)
      expect(restored.toHTML()).toContain(`id="${id}"`)
    }
    finally {
      restored.destroy()
    }
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

  it("preserves authored widget editability in live, shared and serialized DOM", async () => {
    document.body.innerHTML = '<section><demo-widget contenteditable="false"></demo-widget></section>'
    const widget = document.querySelector("demo-widget")!
    const editor = new DOMEditor()
    try {
      expect(widget.getAttribute("contenteditable")).toBe("false")
      expect(editor.doc.body.toString()).toContain('contenteditable="false"')
      expect(editor.toHTML(true)).toContain('contenteditable="false"')
    }
    finally {
      editor.destroy()
    }
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(widget.getAttribute("contenteditable")).toBe("false")
  })

  it("preserves editability of widgets restored from shared state and remote updates", async () => {
    const remote = new Y.Doc()
    const body = remote.getXmlElement("body")
    const initial = new Y.XmlElement("demo-widget")
    initial.setAttribute("contenteditable", "false")
    body.insert(0, [initial])
    const editor = new DOMEditor({initialState: {update: Array.from(Y.encodeStateAsUpdate(remote))}})
    try {
      expect(document.querySelector("demo-widget")?.getAttribute("contenteditable")).toBe("false")
      body.insert(1, [new Y.XmlElement("remote-widget")])
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote))
      await vi.waitFor(() => expect(document.querySelector("remote-widget")).not.toBeNull())
      expect(document.querySelector("remote-widget")?.getAttribute("contenteditable")).toBeNull()
      expect(editor.toHTML(true)).toContain('contenteditable="false"')
    }
    finally {
      editor.destroy()
      remote.destroy()
    }
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
    expect(document.body.contentEditable).toBe("false")
    expect(document.body.spellcheck).toBe(true)

    first.destroy()
    expect(document.designMode).toBe("off")
    expect(document.body.contentEditable).toBe("false")
    expect(document.body.spellcheck).toBe(true)

    const replacement = new DOMEditor()
    replacement.destroy()
  })
})
