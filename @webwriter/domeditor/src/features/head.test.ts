import * as Y from "yjs"
import {SharedDOMDoc} from "../domdoc"
import {captionEnumerationCSS, defaultCaptionEnumeration, readCaptionEnumeration, writeCaptionEnumeration} from "../caption-enumeration"
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
  it("applies the default theme as an editor-owned stylesheet", () => {
    const enabledStylesheets = [...document.adoptedStyleSheets]
    editor.features.head.disable()
    const themeStylesheets = enabledStylesheets.filter(stylesheet => !document.adoptedStyleSheets.includes(stylesheet))
    expect(themeStylesheets).toHaveLength(1)

    editor.features.head.enable()
    expect(document.adoptedStyleSheets).toContain(themeStylesheets[0])
    expect(document.head.querySelector("style")).toBeNull()
  })

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

  it("applies the generic unsafe-attribute and URL rules to head edits", () => {
    document.head.innerHTML = '<link rel="alternate" href="feed.xml">'
    editor.doc.syncFromDOM()
    const link = document.head.querySelector("link")!
    const id = editor.features.head.state().elements[0].id
    const setAttribute = editor.features.head.actions.setDocumentHeadElementAttribute

    expect(setAttribute({type: "setDocumentHeadElementAttribute", id, name: "onerror", value: "run()"})).toBe(false)
    expect(setAttribute({type: "setDocumentHeadElementAttribute", id, name: "srcdoc", value: "<script>run()</script>"})).toBe(false)
    expect(setAttribute({type: "setDocumentHeadElementAttribute", id, name: "href", value: " java\nscript:run()"})).toBe(false)
    expect(link).not.toHaveAttribute("onerror")
    expect(link).not.toHaveAttribute("srcdoc")
    expect(link).toHaveAttribute("href", "feed.xml")

    expect(setAttribute({type: "setDocumentHeadElementAttribute", id, name: "href", value: "https://example.com/feed"})).toBe(true)
    expect(link).toHaveAttribute("href", "https://example.com/feed")

    expect(editor.features.head.actions.setDocumentHeadField({
      type: "setDocumentHeadField", field: "license", value: "data:image/svg+xml,<svg/>",
    })).toBe(false)
    expect(document.head.querySelector('link[rel="license"]')).toBeNull()
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


describe("caption numbering settings", () => {
  it("shares and exports settings, with undo and redo", () => {
    const config = defaultCaptionEnumeration()
    config.figure.start = 3
    config.figure.labels.de = "Abbildung"
    document.body.innerHTML = '<figure><img><figcaption lang="de">A caption</figcaption></figure>'
    editor.doc.syncFromDOM()
    editor.features.head.actions.setCaptionEnumeration({type: "setCaptionEnumeration", value: config})
    expect(editor.features.head.state().captionEnumeration).toEqual(config)
    expect(editor.toHTML(false, false)).toContain("data-ww-caption-enumeration")
    expect(document.querySelector("figcaption")!.textContent).toBe("A caption")
    editor.doc.undo()
    expect(readCaptionEnumeration(document.head)).toBeUndefined()
    editor.doc.redo()
    expect(readCaptionEnumeration(document.head)).toEqual(config)
  })

  it("applies only validated generated CSS and cleans up its editing stylesheet", async () => {
    const before = [...document.adoptedStyleSheets]
    const config = defaultCaptionEnumeration()
    writeCaptionEnumeration(document.head, config)
    document.head.querySelector("style")!.append("body { display: none }")
    await new Promise(resolve => setTimeout(resolve, 0))
    const sheets = document.adoptedStyleSheets.filter(sheet => !before.includes(sheet))
    expect(sheets).toHaveLength(1)
    const source = Array.from(sheets[0].cssRules).map(rule => rule.cssText).join("\n")
    expect(source).toContain("ww-figures")
    expect(source).not.toContain("display: none")
    editor.features.head.disable()
    expect(document.adoptedStyleSheets).not.toContain(sheets[0])
    expect(readCaptionEnumeration(document.head)).toEqual(config)
  })

  it("updates numbering when direct head changes arrive", async () => {
    const config = defaultCaptionEnumeration()
    writeCaptionEnumeration(document.head, config)
    await new Promise(resolve => setTimeout(resolve, 0))
    const previous = [...document.adoptedStyleSheets]
    config.figure.start = 7
    writeCaptionEnumeration(document.head, config)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(editor.features.head.state().captionEnumeration!.figure.start).toBe(7)
    expect(document.adoptedStyleSheets.some(sheet => !previous.includes(sheet))).toBe(true)
    document.head.querySelector("style")!.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(editor.features.head.state().captionEnumeration).toBeUndefined()
  })

  it("preserves explicitly disabled numbering when adding another caption", () => {
    const config = defaultCaptionEnumeration()
    config.figure.enabled = false
    config.table.enabled = false
    writeCaptionEnumeration(document.head, config)
    editor.features.head.ensureCaptionEnumeration()
    expect(readCaptionEnumeration(document.head)).toEqual(config)
    expect(captionEnumerationCSS(config)).not.toContain("::before")
  })

  it("rejects invalid and locked settings without changing the authored head", () => {
    const config = defaultCaptionEnumeration()
    config.figure.start = -1
    expect(editor.features.head.actions.setCaptionEnumeration({type: "setCaptionEnumeration", value: config})).toBe(false)
    expect(document.head.querySelector("style")).toBeNull()
    editor.lockEditing("test")
    try {
      expect(editor.features.head.actions.setCaptionEnumeration({type: "setCaptionEnumeration", value: defaultCaptionEnumeration()})).toBe(false)
      expect(document.head.querySelector("style")).toBeNull()
    } finally { editor.unlockEditing("test") }
  })
})


it("receives caption numbering through collaboration without adding caption text", async () => {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(editor.doc.doc))
  const owner = document.implementation.createHTMLDocument()
  const peer = new SharedDOMDoc(undefined, undefined, ["contenteditable", "spellcheck"], ["◆"], {root: owner.body, ydoc, connect: false})
  try {
    const config = defaultCaptionEnumeration()
    config.table.start = 8
    config.table.labels.fr = "Tableau"
    writeCaptionEnumeration(owner.head, config)
    peer.syncFromDOM()
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(ydoc), "remote-test")
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(editor.features.head.state().captionEnumeration).toEqual(config)
    expect(document.adoptedStyleSheets.some(sheet => Array.from(sheet.cssRules).some(rule => rule.cssText.includes("ww-tables 7")))).toBe(true)
  }
  finally { peer.destroy() }
})
