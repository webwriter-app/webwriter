// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
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
