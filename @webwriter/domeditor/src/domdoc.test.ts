// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {SharedDOMDoc} from "./domdoc"

const sharedDocs: SharedDOMDoc[] = []

function createShared(html = "", ydoc?: Y.Doc) {
  const root = document.createElement("main")
  root.innerHTML = html
  const shared = new SharedDOMDoc(undefined, undefined, ["contenteditable", "spellcheck"], ["◆"], {
    root,
    ydoc,
  })
  sharedDocs.push(shared)
  return {root, shared}
}

function cloneShared(source: SharedDOMDoc, staleHTML = "") {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(source.doc), "initial-sync")
  return createShared(staleHTML, ydoc)
}

function createDocumentShared(headHTML = "", bodyHTML = "", language = "", ydoc?: Y.Doc) {
  const owner = document.implementation.createHTMLDocument("")
  owner.head.innerHTML = headHTML
  owner.body.innerHTML = bodyHTML
  if(language) owner.documentElement.setAttribute("lang", language)
  const shared = new SharedDOMDoc(undefined, undefined, ["contenteditable", "spellcheck"], ["◆"], {
    root: owner.body,
    ydoc,
  })
  sharedDocs.push(shared)
  return {owner, shared}
}

function cloneDocumentShared(source: SharedDOMDoc, staleHead = "", staleLanguage = "") {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(source.doc), "initial-sync")
  return createDocumentShared(staleHead, "", staleLanguage, ydoc)
}

async function mutationsDelivered() {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

afterEach(() => {
  sharedDocs.splice(0).reverse().forEach(shared => shared.destroy())
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  vi.restoreAllMocks()
})

describe("SharedDOMDoc initialization", () => {
  it("always initializes a Y document from the complete editable light DOM", () => {
    const {root, shared} = createShared("text<!--note--><section id=one><p>Hello</p></section>")
    root.setAttribute("lang", "en")
    shared.syncFromDOM()

    expect(shared.doc).toBeInstanceOf(Y.Doc)
    expect(shared.body.getAttribute("lang")).toBe("en")
    expect(shared.body.toArray()).toHaveLength(3)
    expect(shared.body.toArray()[0]).toBeInstanceOf(Y.XmlText)
    expect(shared.body.toArray()[2].toString()).toContain("<section id=\"one\"><p>Hello</p></section>")
  })

  it("hydrates stale DOM from an already initialized Y document", () => {
    const source = createShared("<article data-state=ready><p>Shared</p><!--tail--></article>").shared
    const {root} = cloneShared(source, "<p>stale</p>")

    expect(root.innerHTML).toBe("<article data-state=\"ready\"><p>Shared</p><!--tail--></article>")
  })

  it("preserves empty attributes and filters editing attributes and marker classes", () => {
    const root = document.createElement("main")
    root.innerHTML = '<p hidden class="content ◆ ◆text-selected">Hello</p>'
    root.contentEditable = "true"
    root.spellcheck = false
    const shared = new SharedDOMDoc(undefined, undefined, ["contenteditable", "spellcheck"], ["◆"], {root})
    sharedDocs.push(shared)

    const yParagraph = shared.body.firstChild as Y.XmlElement
    expect(shared.body.getAttribute("contenteditable")).toBeUndefined()
    expect(shared.body.getAttribute("spellcheck")).toBeUndefined()
    expect(yParagraph.getAttribute("hidden")).toBe("")
    expect(yParagraph.getAttribute("class")).toBe("content")
  })

  it("keeps editor-only elements and shadow contents out of the shared tree", async () => {
    const {root, shared} = createShared("<p>content</p>")
    const helper = document.createElement("button")
    helper.classList.add("◆", "◆editor-only")
    helper.textContent = "helper"
    root.append(helper)
    const shadow = root.attachShadow({mode: "open"})
    shadow.innerHTML = "<div>overlay</div>"
    await mutationsDelivered()

    expect(shared.body.toArray()).toHaveLength(1)
    expect(shared.body.toString()).not.toContain("helper")
    expect(shared.body.toString()).not.toContain("overlay")
  })

  it("round-trips SVG namespaces and case-sensitive SVG node names", () => {
    const {shared} = createShared('<svg viewBox="0 0 10 10"><linearGradient id="g"></linearGradient><circle cx="5"></circle></svg>')
    const {root} = cloneShared(shared)
    const svg = root.firstElementChild!

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(svg.firstElementChild?.localName).toBe("linearGradient")
    expect(svg.lastElementChild?.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  it("shares the same Y document and awareness instance with its websocket provider", () => {
    const root = document.createElement("main")
    const shared = new SharedDOMDoc("ws://localhost:1234", "room", [], ["◆"], {root, connect: false})
    sharedDocs.push(shared)

    expect(shared.provider?.doc).toBe(shared.doc)
    expect(shared.provider?.awareness).toBe(shared.awareness)
    expect(shared.provider?.shouldConnect).toBe(false)
  })
})

describe("DOM to Yjs synchronization", () => {
  it("captures character-data, attribute add/update/removal, and body attributes", async () => {
    const {root, shared} = createShared('<p title="old">Hello</p>')
    const paragraph = root.firstElementChild!
    paragraph.firstChild!.textContent = "Hello world"
    paragraph.setAttribute("title", "new")
    paragraph.setAttribute("hidden", "")
    paragraph.removeAttribute("title")
    root.setAttribute("lang", "de")
    await mutationsDelivered()

    const yParagraph = shared.body.firstChild as Y.XmlElement
    expect((yParagraph.firstChild as Y.XmlText).toString()).toBe("Hello world")
    expect(yParagraph.getAttribute("title")).toBeUndefined()
    expect(yParagraph.getAttribute("hidden")).toBe("")
    expect(shared.body.getAttribute("lang")).toBe("de")
  })

  it("captures arbitrary compound widget mutations in one Yjs update", async () => {
    const {root, shared} = createShared("<interactive-widget><p>old</p></interactive-widget>")
    const widget = root.firstElementChild!
    const updates: Uint8Array[] = []
    shared.doc.on("update", update => updates.push(update))

    widget.setAttribute("data-step", "2")
    widget.replaceChildren()
    const heading = document.createElement("h2")
    heading.textContent = "Widget title"
    const output = document.createElement("output")
    output.append("42")
    widget.append(heading, output)
    await mutationsDelivered()

    expect(updates).toHaveLength(1)
    const {root: peerRoot} = cloneShared(shared)
    expect(peerRoot.innerHTML).toBe('<interactive-widget data-step="2"><h2>Widget title</h2><output>42</output></interactive-widget>')
  })

  it("captures insertion, replacement, removal, and moves while retaining unaffected Y nodes", async () => {
    const {root, shared} = createShared("<p>A</p><p>B</p><p>C</p>")
    const yA = shared.body.toArray()[0]
    const [a, b, c] = Array.from(root.children)
    const aside = document.createElement("aside")
    aside.textContent = "X"
    b.replaceWith(aside)
    root.insertBefore(c, a)
    await mutationsDelivered()

    expect(shared.body.toArray()[0].toString()).toBe("<p>C</p>")
    expect(shared.body.toArray()[1]).toBe(yA)
    expect(shared.body.toArray()[2].toString()).toContain("<aside>X</aside>")
    expect(shared.body.toString()).not.toContain("<p>B</p>")
  })

  it("captures innerHTML replacement and adjacent-text normalization", async () => {
    const {root, shared} = createShared("<div><span>old</span></div>")
    const div = root.firstElementChild!
    div.innerHTML = "new <b>content</b>"
    div.append(document.createTextNode(" one"), document.createTextNode(" two"))
    div.normalize()
    await mutationsDelivered()

    const yDiv = shared.body.firstChild as Y.XmlElement
    expect(yDiv.toArray()).toHaveLength(3)
    expect(yDiv.toString()).toBe("<div>new <b>content</b> one two</div>")
  })

  it("captures comments and comment data changes", async () => {
    const {root, shared} = createShared("<p>A</p><!--before-->")
    const comment = root.lastChild as Comment
    comment.data = "after"
    root.insertBefore(document.createComment("middle"), comment)
    await mutationsDelivered()

    const {root: peerRoot} = cloneShared(shared)
    expect(peerRoot.innerHTML).toBe("<p>A</p><!--middle--><!--after-->")
  })

  it("does not create updates for editor marker-only class mutations", async () => {
    const {root, shared} = createShared('<p class="content">A</p>')
    const updates = vi.fn()
    shared.doc.on("update", updates)
    const paragraph = root.firstElementChild!
    paragraph.classList.add("◆", "◆text-selected", "◆presence-caret-anchor-1")
    paragraph.classList.remove("◆text-selected")
    await mutationsDelivered()

    expect(updates).not.toHaveBeenCalled()
    expect((shared.body.firstChild as Y.XmlElement).getAttribute("class")).toBe("content")
  })

  it("does synchronize user class changes made alongside editor marker classes", async () => {
    const {root, shared} = createShared('<p class="before ◆ ◆text-selected">A</p>')
    root.firstElementChild!.classList.replace("before", "after")
    await mutationsDelivered()

    expect((shared.body.firstChild as Y.XmlElement).getAttribute("class")).toBe("after")
  })
})

describe("document head synchronization", () => {
  it("mirrors arbitrary authored head elements and the document language", () => {
    const {shared} = createDocumentShared(
      '<meta charset="utf-8"><style>body { color: red }</style><!--head note-->',
      "<p>Body</p>",
      "de-DE",
    )
    const {owner: peer} = cloneDocumentShared(shared, '<meta name="stale" content="yes">', "fr")

    expect(peer.documentElement.getAttribute("lang")).toBe("de-DE")
    expect(peer.head.innerHTML).toBe('<meta charset="utf-8"><style>body { color: red }</style><!--head note-->')
    expect(peer.body.innerHTML).toBe("<p>Body</p>")
  })

  it("propagates direct head and language mutations without sharing editor resources", async () => {
    const {owner, shared} = createDocumentShared('<title>Before</title>', "", "en")
    const editorScript = owner.createElement("script")
    editorScript.setAttribute("data-webwriter-editor-only", "")
    owner.head.append(editorScript)
    owner.title = "After"
    owner.documentElement.setAttribute("lang", "nl")
    const link = owner.createElement("link")
    link.setAttribute("rel", "stylesheet")
    link.setAttribute("href", "data:text/css,")
    owner.head.insertBefore(link, editorScript)
    await mutationsDelivered()

    const {owner: peer} = cloneDocumentShared(shared)
    expect(peer.title).toBe("After")
    expect(peer.documentElement.getAttribute("lang")).toBe("nl")
    expect(peer.head.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe("data:text/css,")
    expect(peer.head.querySelector("[data-webwriter-editor-only]")).toBeNull()
    expect(shared.headElement?.toString()).not.toContain("data-webwriter-editor-only")
  })
})

describe("Yjs to DOM synchronization", () => {
  it("applies remote text and attribute changes without replacing the existing DOM element", () => {
    const {root, shared} = createShared('<p title="old">Hello</p>')
    const paragraph = root.firstElementChild!
    const yParagraph = shared.body.firstChild as Y.XmlElement
    const yText = yParagraph.firstChild as Y.XmlText

    shared.doc.transact(() => {
      yText.insert(5, " remote")
      yParagraph.setAttribute("title", "new")
      yParagraph.setAttribute("hidden", "")
    }, "remote-client")

    expect(root.firstElementChild).toBe(paragraph)
    expect(paragraph.textContent).toBe("Hello remote")
    expect(paragraph.getAttribute("title")).toBe("new")
    expect(paragraph.getAttribute("hidden")).toBe("")
  })

  it("applies remote insertion, deletion, and nested content", () => {
    const {root, shared} = createShared("<p>A</p><p>B</p>")
    const section = new Y.XmlElement("section")
    const heading = new Y.XmlElement("h2")
    heading.insert(0, [new Y.XmlText("Remote")])
    section.insert(0, [heading])

    shared.doc.transact(() => {
      shared.body.delete(0, 1)
      shared.body.insert(1, [section])
    }, "remote-client")

    expect(root.innerHTML).toBe("<p>B</p><section><h2>Remote</h2></section>")
  })

  it("captures a widget's own light-DOM changes after remote insertion", async () => {
    const tagName = "interactive-widget"
    const {root, shared} = createShared()

    shared.doc.transact(() => shared.body.insert(0, [new Y.XmlElement(tagName)]), "remote-client")
    const output = document.createElement("output")
    output.textContent = "initialized"
    root.firstElementChild!.append(output)
    await mutationsDelivered()

    expect(root.innerHTML).toBe(`<${tagName}><output>initialized</output></${tagName}>`)
    expect(shared.body.toString()).toContain("<output>initialized</output>")
  })

  it("preserves ignored editing attributes and marker classes during remote rendering", () => {
    const {root, shared} = createShared('<p class="content">A</p>')
    root.contentEditable = "true"
    root.spellcheck = false
    const paragraph = root.firstElementChild!
    paragraph.classList.add("◆", "◆text-selected")
    const yParagraph = shared.body.firstChild as Y.XmlElement

    shared.doc.transact(() => yParagraph.setAttribute("class", "remote"), "remote-client")

    expect(root.contentEditable).toBe("true")
    expect(root.spellcheck).toBe(false)
    expect(paragraph.classList.contains("remote")).toBe(true)
    expect(paragraph.classList.contains("◆text-selected")).toBe(true)
  })

  it("synchronizes changes between two clients in both directions", async () => {
    const left = createShared("<p>Hello</p>")
    const right = cloneShared(left.shared)

    left.root.firstElementChild!.append(" left")
    await mutationsDelivered()
    Y.applyUpdate(right.shared.doc, Y.encodeStateAsUpdate(left.shared.doc), "left-client")
    expect(right.root.innerHTML).toBe("<p>Hello left</p>")

    right.root.firstElementChild!.setAttribute("data-peer", "right")
    right.root.append(document.createElement("hr"))
    await mutationsDelivered()
    Y.applyUpdate(left.shared.doc, Y.encodeStateAsUpdate(right.shared.doc), "right-client")
    expect(left.root.innerHTML).toBe('<p data-peer="right">Hello left</p><hr>')
  })

  it("converges concurrent text and structural edits from two clients", async () => {
    const left = createShared("<p>A</p>")
    const right = cloneShared(left.shared)

    left.root.querySelector("p")!.firstChild!.textContent = "AL"
    const leftAside = document.createElement("aside")
    leftAside.textContent = "left"
    left.root.append(leftAside)
    right.root.querySelector("p")!.firstChild!.textContent = "AR"
    const rightAside = document.createElement("aside")
    rightAside.textContent = "right"
    right.root.append(rightAside)
    await mutationsDelivered()

    const leftUpdate = Y.encodeStateAsUpdate(left.shared.doc)
    const rightUpdate = Y.encodeStateAsUpdate(right.shared.doc)
    Y.applyUpdate(left.shared.doc, rightUpdate, "right-client")
    Y.applyUpdate(right.shared.doc, leftUpdate, "left-client")

    expect(Y.encodeStateAsUpdate(left.shared.doc)).toEqual(Y.encodeStateAsUpdate(right.shared.doc))
    expect(left.root.innerHTML).toBe(right.root.innerHTML)
    expect(left.root.textContent).toContain("L")
    expect(left.root.textContent).toContain("R")
    expect(left.root.querySelectorAll("aside")).toHaveLength(2)
  })
})

describe("relative selections and history", () => {
  it("keeps a local caret attached to shared text across remote edits", () => {
    document.body.innerHTML = "<p>Hello</p>"
    const shared = new SharedDOMDoc(undefined, undefined, ["contenteditable", "spellcheck"], ["◆"])
    sharedDocs.push(shared)
    const text = document.querySelector("p")!.firstChild as Text
    document.getSelection()!.setPosition(text, 3)
    shared.updateLocalSelection()
    const yText = (shared.body.firstChild as Y.XmlElement).firstChild as Y.XmlText

    shared.doc.transact(() => yText.insert(0, "X"), "remote-client")

    expect(document.querySelector("p")!.textContent).toBe("XHello")
    expect(document.getSelection()!.anchorNode).toBe(text)
    expect(document.getSelection()!.anchorOffset).toBe(4)
  })

  it("undoes and redoes compound direct DOM mutations in both DOM and Yjs", async () => {
    const {root, shared} = createShared("<p>before</p>")
    const paragraph = root.firstElementChild!
    paragraph.textContent = "after"
    paragraph.setAttribute("data-state", "changed")
    const aside = document.createElement("aside")
    aside.textContent = "new"
    root.append(aside)
    await mutationsDelivered()

    expect(root.innerHTML).toBe('<p data-state="changed">after</p><aside>new</aside>')
    shared.undo()
    expect(root.innerHTML).toBe("<p>before</p>")
    expect(shared.body.toString()).toContain("<p>before</p>")

    shared.redo()
    expect(root.innerHTML).toBe('<p data-state="changed">after</p><aside>new</aside>')
    expect(shared.body.toString()).toContain('<p data-state="changed">after</p><aside>new</aside>')
  })

  it("does not put remote transactions on the local undo stack", async () => {
    const left = createShared("<p>start</p>")
    const right = cloneShared(left.shared)
    left.root.querySelector("p")!.textContent = "remote"
    await mutationsDelivered()
    Y.applyUpdate(right.shared.doc, Y.encodeStateAsUpdate(left.shared.doc), "left-client")

    right.shared.undo()
    expect(right.root.innerHTML).toBe("<p>remote</p>")

    right.root.querySelector("p")!.setAttribute("data-local", "yes")
    await mutationsDelivered()
    right.shared.undo()
    expect(right.root.innerHTML).toBe("<p>remote</p>")
  })
})
