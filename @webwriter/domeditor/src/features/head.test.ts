// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import {WEBWRITER_GENERATOR, creativeCommonsLicenses} from "../document-head"

let editor: DOMEditor

beforeEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.documentElement.removeAttribute("lang")
  editor = new DOMEditor()
})

afterEach(() => {
  editor.destroy()
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.documentElement.removeAttribute("lang")
})

describe("document head editing", () => {
  it("maps the common form fields onto standard authored HTML", () => {
    const set = editor.features.head.actions.setDocumentHeadField
    set({type: "setDocumentHeadField", field: "title", value: "Lesson"})
    set({type: "setDocumentHeadField", field: "description", value: "A short lesson"})
    set({type: "setDocumentHeadField", field: "keywords", value: "math, geometry"})
    set({type: "setDocumentHeadField", field: "author", value: "Ada"})
    set({type: "setDocumentHeadField", field: "language", value: "de-DE"})
    set({type: "setDocumentHeadField", field: "license", value: creativeCommonsLicenses[1].url})

    expect(document.title).toBe("Lesson")
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute("content", "A short lesson")
    expect(document.head.querySelector('meta[name="keywords"]')).toHaveAttribute("content", "math, geometry")
    expect(document.head.querySelector('meta[name="author"]')).toHaveAttribute("content", "Ada")
    expect(document.documentElement).toHaveAttribute("lang", "de-DE")
    expect(document.head.querySelector("style")).toBeNull()
    expect(document.head.querySelector('link[rel="license"]')).toHaveAttribute("href", creativeCommonsLicenses[1].url)

    const state = editor.features.head.state()
    expect(state).toMatchObject({
      title: "Lesson",
      description: "A short lesson",
      keywords: "math, geometry",
      author: "Ada",
      language: "de-DE",
      theme: "",
      license: creativeCommonsLicenses[1].url,
    })
  })

  it("removes a common field without rebuilding unrelated head elements", () => {
    document.head.innerHTML = '<meta name="description" content="old"><meta property="og:title" content="Keep"><style>.keep { color: red }</style>'
    editor.doc.syncFromDOM()
    editor.features.head.postState()
    const social = document.head.querySelector('meta[property="og:title"]')
    const style = document.head.querySelector("style")

    editor.features.head.actions.setDocumentHeadField({
      type: "setDocumentHeadField",
      field: "description",
      value: "",
    })

    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
    expect(document.head.querySelector('meta[property="og:title"]')).toBe(social)
    expect(document.head.querySelector("style")).toBe(style)
  })

  it("preserves existing authored scripts and styles but blocks creating or editing them", () => {
    document.head.innerHTML = '<script type="module">start()</script><style>body { color: red }</style><link rel="stylesheet"><link rel="alternate" href="feed.xml">'
    editor.doc.syncFromDOM()
    const add = editor.features.head.actions.addDocumentHeadElement
    expect(add({type: "addDocumentHeadElement", kind: "script"})).toBe(false)
    expect(add({type: "addDocumentHeadElement", kind: "stylesheet"})).toBe(false)
    expect(add({type: "addDocumentHeadElement", kind: "style"})).toBe(false)
    expect(editor.features.head.actions.setDocumentHeadField({
      type: "setDocumentHeadField", field: "theme", value: "base",
    })).toBe(false)

    const state = editor.features.head.state()
    const scriptId = state.elements.find(element => element.preset === "script")!.id
    const styleId = state.elements.find(element => element.preset === "style")!.id
    const stylesheetId = state.elements.find(element => element.preset === "stylesheet")!.id
    const alternateId = state.elements.find(element => element.preset === "link")!.id
    expect(editor.features.head.actions.setDocumentHeadElementAttribute({
      type: "setDocumentHeadElementAttribute",
      id: scriptId,
      name: "type",
      value: "text/plain",
    })).toBe(false)
    expect(editor.features.head.actions.setDocumentHeadElementContent({
      type: "setDocumentHeadElementContent",
      id: styleId,
      value: "body { color: blue }",
    })).toBe(false)
    expect(editor.features.head.actions.setDocumentHeadElementAttribute({
      type: "setDocumentHeadElementAttribute",
      id: stylesheetId,
      name: "media",
      value: "screen",
    })).toBe(false)
    expect(editor.features.head.actions.setDocumentHeadElementAttribute({
      type: "setDocumentHeadElementAttribute",
      id: alternateId,
      name: "rel",
      value: "stylesheet",
    })).toBe(false)

    editor.features.head.actions.removeDocumentHeadElement({type: "removeDocumentHeadElement", id: stylesheetId})
    expect(document.head.querySelector('link[rel="stylesheet"]')).toBeNull()
    expect(document.head.querySelector("script")?.textContent).toBe("start()")
    expect(document.head.querySelector("style")?.textContent).toContain("color: red")
    expect(document.head.querySelector('link[rel="alternate"]')).toBeTruthy()
  })

  it("uses the package version for newly added generator metadata", () => {
    editor.features.head.actions.addDocumentHeadElement({type: "addDocumentHeadElement", kind: "generator"})

    expect(document.head.querySelector('meta[name="generator"]')).toHaveAttribute("content", WEBWRITER_GENERATOR)
    expect(editor.features.head.state().generator).toBe(WEBWRITER_GENERATOR)
  })

  it("excludes editor resources while preserving arbitrary authored head elements and attributes", () => {
    const authored = document.createElement("meta")
    authored.setAttribute("property", "og:image")
    authored.setAttribute("content", "cover.png")
    const editorOnly = document.createElement("script")
    editorOnly.setAttribute("data-webwriter-editor-only", "")
    document.head.append(authored, editorOnly)
    editor.doc.syncFromDOM()

    const state = editor.features.head.state()
    expect(state.elements).toHaveLength(1)
    expect(state.elements[0]).toMatchObject({tagName: "meta", label: "Metadata"})
    expect(state.elements[0].attributes).toEqual([
      {name: "property", value: "og:image"},
      {name: "content", value: "cover.png"},
    ])
    expect(editor.doc.headElement?.toString()).not.toContain("data-webwriter-editor-only")
  })

  it("uses live direct-child preconditions and safely ignores stale or duplicate singleton actions", () => {
    document.head.innerHTML = '<x-document-data><meta name="description" content="nested"></x-document-data><title>Existing</title>'
    editor.doc.syncFromDOM()
    const title = editor.features.head.state().elements.find(element => element.preset === "title")!

    editor.features.head.actions.setDocumentHeadField({
      type: "setDocumentHeadField",
      field: "description",
      value: "Direct",
    })
    expect(document.head.querySelector("x-document-data meta")?.getAttribute("content")).toBe("nested")
    expect(Array.from(document.head.children).find(element =>
      element.localName === "meta" && element.getAttribute("name") === "description",
    )).toHaveAttribute("content", "Direct")

    document.head.querySelector("title")!.remove()
    expect(editor.features.head.actions.removeDocumentHeadElement({
      type: "removeDocumentHeadElement",
      id: title.id,
    })).toBe(false)

    expect(editor.features.head.actions.addDocumentHeadElement({
      type: "addDocumentHeadElement",
      kind: "generator",
    })).toBe(true)
    expect(editor.features.head.actions.addDocumentHeadElement({
      type: "addDocumentHeadElement",
      kind: "generator",
    })).toBe(false)
    expect(document.head.querySelectorAll('meta[name="generator"]')).toHaveLength(1)
  })

  it("includes head edits in undo and redo", () => {
    editor.features.head.actions.setDocumentHeadField({
      type: "setDocumentHeadField",
      field: "title",
      value: "Undoable",
    })
    expect(document.title).toBe("Undoable")

    editor.doc.undo()
    expect(document.head.querySelector("title")).toBeNull()

    editor.doc.redo()
    expect(document.title).toBe("Undoable")
  })
})
