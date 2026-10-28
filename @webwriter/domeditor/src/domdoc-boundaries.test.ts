// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {SharedDOMDoc, sharedDOMBody} from "./domdoc"

const sharedDocs: SharedDOMDoc[] = []
const boundary = (element: Element) => element.id === "inner"
const createOuter = (html: string, ydoc?: Y.Doc, scopeBoundary = boundary) => {
  const root = document.createElement("section")
  root.innerHTML = html
  document.body.append(root)
  const shared = new SharedDOMDoc(undefined, undefined, [], [], {root, ydoc, scopeBoundary})
  sharedDocs.push(shared)
  return {root, shared}
}
const cloneYDoc = (source: SharedDOMDoc) => {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(source.doc), "initial-sync")
  return ydoc
}
const mutationsDelivered = async () => {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

afterEach(() => {
  sharedDocs.splice(0).forEach(shared => shared.destroy())
  document.body.replaceChildren()
})

describe("SharedDOMDoc scope boundaries", () => {
  it("hydrates a wide existing root without rereading its full child list per shared child", () => {
    const html = Array.from({length: 1000}, (_, index) => `<p data-index="${index}">Text ${index}</p>`).join("")
    const sourceRoot = document.createElement("section")
    sourceRoot.innerHTML = html
    document.body.append(sourceRoot)
    const source = new SharedDOMDoc(undefined, undefined, [], [], {root: sourceRoot})
    sharedDocs.push(source)

    const root = document.createElement("section")
    root.innerHTML = html
    document.body.append(root)
    const childNodes = vi.spyOn(root, "childNodes", "get")
    const hydrated = new SharedDOMDoc(undefined, undefined, [], [], {root, ydoc: cloneYDoc(source)})
    sharedDocs.push(hydrated)

    expect(childNodes.mock.calls.length).toBeLessThan(5)
    expect(root.innerHTML).toBe(html)
    expect(root.children).toHaveLength(1000)
  })

  it("indexes many boundary candidates once while preserving private live nodes across remote updates and undo", async () => {
    const count = 120
    const html = `${Array.from({length: count}, (_, index) => `<section id="inner-${index}" data-boundary title="default"><p>Default ${index}</p></section>`).join("")}<p id="outside">Before</p>`
    const source = createOuter(html, undefined, element => element.hasAttribute("data-boundary"))

    const peerRoot = document.createElement("section")
    peerRoot.innerHTML = html
    document.body.append(peerRoot)
    const privateNodes = Array.from(peerRoot.querySelectorAll<HTMLElement>("section[data-boundary]"))
    privateNodes.forEach((element, index) => {
      element.title = `private ${index}`
      element.firstElementChild!.textContent = `Private ${index}`
    })
    const scopeBoundary = vi.fn((element: Element) => element.hasAttribute("data-boundary"))
    const peer = new SharedDOMDoc(undefined, undefined, [], [], {
      root: peerRoot,
      ydoc: cloneYDoc(source.shared),
      scopeBoundary,
    })
    sharedDocs.push(peer)

    expect(scopeBoundary.mock.calls.length).toBeLessThan(count * 8)
    privateNodes.forEach((element, index) => {
      expect(peerRoot.children[index]).toBe(element)
      expect(element.title).toBe(`private ${index}`)
      expect(element.textContent).toBe(`Private ${index}`)
    })

    source.shared.stopCapturing()
    source.root.querySelector("#outside")!.textContent = "Remote edit"
    source.shared.syncFromDOM()
    await mutationsDelivered()
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(source.shared.doc), "remote")
    expect(peerRoot.querySelector("#outside")!.textContent).toBe("Remote edit")
    privateNodes.forEach((element, index) => {
      expect(peerRoot.children[index]).toBe(element)
      expect(element.textContent).toBe(`Private ${index}`)
    })

    source.shared.undo()
    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(source.shared.doc), "remote-undo")
    expect(peerRoot.querySelector("#outside")!.textContent).toBe("Before")
    privateNodes.forEach((element, index) => expect(peerRoot.children[index]).toBe(element))
  })

  it("matches explicit and idless boundaries in order and rejects type or namespace mismatches", () => {
    const html = '<section id="explicit" data-boundary title="default"></section><section data-boundary title="first"></section><section data-boundary title="second"></section><section id="wrong-type" data-boundary></section><section id="wrong-namespace" data-boundary></section>'
    const source = createOuter(html, undefined, element => element.hasAttribute("data-boundary"))
    const root = document.createElement("section")
    root.innerHTML = '<section id="explicit" data-boundary title="private explicit"></section><section data-boundary title="private first"></section><section data-boundary title="private second"></section><div id="wrong-type" data-boundary title="must be discarded"></div>'
    const wrongNamespace = document.createElementNS("urn:private", "section")
    wrongNamespace.id = "wrong-namespace"
    wrongNamespace.setAttribute("data-boundary", "")
    wrongNamespace.setAttribute("title", "must also be discarded")
    root.append(wrongNamespace)
    document.body.append(root)
    const explicit = root.children[0]
    const firstIdless = root.children[1]
    const secondIdless = root.children[2]
    const wrongType = root.children[3]
    const scopeBoundary = (element: Element) => element.hasAttribute("data-boundary")

    const peer = new SharedDOMDoc(undefined, undefined, [], [], {
      root,
      ydoc: cloneYDoc(source.shared),
      scopeBoundary,
    })
    sharedDocs.push(peer)

    expect(root.children[0]).toBe(explicit)
    expect(root.children[0].getAttribute("title")).toBe("private explicit")
    expect(root.children[1]).toBe(firstIdless)
    expect(root.children[1].getAttribute("title")).toBe("private first")
    expect(root.children[2]).toBe(secondIdless)
    expect(root.children[2].getAttribute("title")).toBe("private second")
    expect(wrongType.isConnected).toBe(false)
    expect(wrongNamespace.isConnected).toBe(false)
    expect(root.children[3].localName).toBe("section")
    expect(root.children[3].namespaceURI).toBe("http://www.w3.org/1999/xhtml")
    expect(root.children[3].id).toBe("wrong-type")
    expect(root.children[4].localName).toBe("section")
    expect(root.children[4].namespaceURI).toBe("http://www.w3.org/1999/xhtml")
    expect(root.children[4].id).toBe("wrong-namespace")
  })

  it("keeps a boundary installed by a custom-element constructor during hydration", () => {
    let replaceBoundaryDuringHydration = false
    let peerRoot: HTMLElement | null = null
    let originalBoundary: Element | null = null
    let replacementBoundary: Element | null = null
    customElements.define("hydration-boundary-refresh-test", class extends HTMLElement {
      constructor() {
        super()
        if(!replaceBoundaryDuringHydration || !peerRoot || !originalBoundary) return
        replacementBoundary = peerRoot.ownerDocument.createElement("section")
        replacementBoundary.id = "inner"
        replacementBoundary.setAttribute("data-boundary", "")
        replacementBoundary.setAttribute("title", "new private state")
        replacementBoundary.innerHTML = "<p>New private state</p>"
        peerRoot.replaceChild(replacementBoundary, originalBoundary)
      }
    })

    const source = createOuter('<hydration-boundary-refresh-test></hydration-boundary-refresh-test><section id="inner" data-boundary title="shared"><p>Shared baseline</p></section>', undefined,
      element => element.hasAttribute("data-boundary"))
    peerRoot = document.createElement("section")
    peerRoot.innerHTML = '<hydration-boundary-refresh-test></hydration-boundary-refresh-test><section id="inner" data-boundary title="old private state"><p>Old private state</p></section>'
    document.body.append(peerRoot)
    originalBoundary = peerRoot.querySelector("#inner")
    replaceBoundaryDuringHydration = true
    const peer = new SharedDOMDoc(undefined, undefined, [], [], {
      root: peerRoot,
      ydoc: cloneYDoc(source.shared),
      scopeBoundary: element => element.hasAttribute("data-boundary"),
    })
    replaceBoundaryDuringHydration = false
    sharedDocs.push(peer)

    expect(replacementBoundary).not.toBeNull()
    expect(peerRoot.querySelector("#inner")).toBe(replacementBoundary)
    expect(replacementBoundary!.getAttribute("title")).toBe("new private state")
    expect(replacementBoundary!.textContent).toBe("New private state")
  })

  it("seeds the boundary's authored defaults, filters its edits before widget data and outer reconciliation, and never treats root as a boundary", async () => {
    const {root, shared} = createOuter('<section id="inner" title="authored"><p>Default</p></section><p id="outside">Before</p>')
    const inner = root.querySelector<HTMLElement>("#inner")!
    const initialMirror = sharedDOMBody(shared.doc).toJSON()
    expect(initialMirror).toContain('title="authored"')
    expect(initialMirror).toContain("Default")

    const innerShared = new SharedDOMDoc(undefined, undefined, [], [], {
      root: inner,
      scopeBoundary: element => element === inner,
    })
    sharedDocs.push(innerShared)
    inner.setAttribute("title", "private")
    inner.querySelector("p")!.textContent = "Participant edit"
    await mutationsDelivered()

    expect(sharedDOMBody(shared.doc).toJSON()).toBe(initialMirror)
    expect(sharedDOMBody(innerShared.doc).toJSON()).toContain("Participant edit")

    // The callback may match the shared root itself, but the root is always
    // the scope being synchronized and therefore cannot be cut off.
    inner.setAttribute("data-root-edit", "kept")
    innerShared.syncFromDOM()
    expect(sharedDOMBody(innerShared.doc).getAttribute("data-root-edit")).toBe("kept")
  })

  it("keeps live boundary DOM intact across outer edits, undo/redo, and remote rendering", async () => {
    const source = createOuter('<section id="inner" title="source"><p>Default</p></section><p id="outside">Before</p>')
    const sourceInner = source.root.querySelector<HTMLElement>("#inner")!
    const sourceInside = sourceInner.querySelector("p")!
    sourceInner.setAttribute("title", "private source")
    sourceInside.textContent = "private source state"
    await mutationsDelivered()
    const sourceBaseline = sharedDOMBody(source.shared.doc).toJSON()

    const peerRoot = document.createElement("section")
    peerRoot.innerHTML = '<section id="inner" title="private peer"><p>Peer state</p></section><p id="outside">Before</p>'
    document.body.append(peerRoot)
    const peerYDoc = cloneYDoc(source.shared)
    const peer = new SharedDOMDoc(undefined, undefined, [], [], {root: peerRoot, ydoc: peerYDoc, scopeBoundary: boundary})
    sharedDocs.push(peer)
    const peerInner = peerRoot.querySelector<HTMLElement>("#inner")!
    const peerInside = peerInner.querySelector("p")!
    expect(peerInner.getAttribute("title")).toBe("private peer")
    expect(peerInside.textContent).toBe("Peer state")

    source.shared.stopCapturing()
    source.root.querySelector("#outside")!.textContent = "Outer edit"
    source.shared.syncFromDOM()
    await mutationsDelivered()
    expect(sharedDOMBody(source.shared.doc).toJSON()).toBe(sourceBaseline.replace("Before", "Outer edit"))
    expect(sourceInner.getAttribute("title")).toBe("private source")
    expect(sourceInside.textContent).toBe("private source state")

    source.shared.undo()
    await mutationsDelivered()
    expect(source.root.querySelector("#outside")!.textContent).toBe("Before")
    expect(sourceInner.getAttribute("title")).toBe("private source")
    expect(sourceInside.textContent).toBe("private source state")
    source.shared.redo()
    await mutationsDelivered()
    expect(source.root.querySelector("#outside")!.textContent).toBe("Outer edit")
    expect(sourceInside.textContent).toBe("private source state")

    Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(source.shared.doc), "remote")
    expect(peerRoot.querySelector("#outside")!.textContent).toBe("Outer edit")
    expect(peerRoot.querySelector("#inner")).toBe(peerInner)
    expect(peerInner.getAttribute("title")).toBe("private peer")
    expect(peerInside.textContent).toBe("Peer state")
  })

  it("retains the outer baseline when a boundary moves between outer parents", async () => {
    const {root, shared} = createOuter('<div id="left"><section id="inner" title="default"><p>Default</p></section></div><div id="right"></div>')
    const inner = root.querySelector<HTMLElement>("#inner")!
    inner.setAttribute("title", "private")
    inner.querySelector("p")!.textContent = "Private"
    await mutationsDelivered()
    const beforeMove = sharedDOMBody(shared.doc).toJSON()

    root.querySelector("#right")!.append(inner)
    await mutationsDelivered()

    const afterMove = sharedDOMBody(shared.doc).toJSON()
    expect(afterMove).toContain('title="default"')
    expect(afterMove).toContain("Default")
    expect(afterMove).not.toContain("Private")
    expect(afterMove).not.toContain('title="private"')
    expect(beforeMove).toContain("Default")
    expect(inner.getAttribute("title")).toBe("private")
    expect(inner.querySelector("p")!.textContent).toBe("Private")
  })
})
