// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {SharedDOMDoc} from "./domdoc"
import {EditorDocumentReplica, isEditorDocumentUpdate, publishEditorDocument, type EditorDocumentUpdate} from "./editor-document-sync"
import {DomEditor} from "./components/dom-editor"
import {DOMEditor} from "./domeditor"
import {readableNodePath} from "./dom-readers"
import {widgetLookupForTags} from "./editor-artifacts"

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); vi.restoreAllMocks() })

function fixture(html: string) {
  const owner = document.implementation.createHTMLDocument("")
  owner.body.innerHTML = html
  const shared = new SharedDOMDoc(undefined, undefined, ["spellcheck"], ["◆"], {
    root: owner.body, isWidget: widgetLookupForTags(["custom-widget"]),
  })
  cleanup.push(() => shared.destroy())
  const messages: EditorDocumentUpdate[] = []
  let replica: EditorDocumentReplica | null = null
  const publisher = publishEditorDocument(shared, "test-frame", message => {
    messages.push(message)
    if(message.reset) { replica?.destroy(); replica = new EditorDocumentReplica(message) }
    else replica!.apply(message.update)
  })
  cleanup.push(() => { publisher.destroy(); replica?.destroy() })
  return {owner, shared, messages, publisher, get replica() { return replica! }}
}

describe("receive-only editor document synchronization", () => {
  it("preserves exact paths, comments, namespaces, templates and arbitrary widgets without parsing HTML", () => {
    const setup = fixture('<unknown-widget custom="keep"><p>Text<!--comment--></p></unknown-widget><svg><use/></svg><template><b>Inert</b></template>')
    const widget = setup.owner.body.firstElementChild!
    widget.prepend(setup.owner.createTextNode(""), setup.owner.createTextNode(" "), setup.owner.createTextNode(""))
    setup.owner.querySelector("use")!.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#shape")
    setup.owner.querySelector("p")!.setAttribute("__domeditor_node_kind", "authored")
    const parser = vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(() => { throw new Error("Unexpected HTML parse") })
    const create = vi.spyOn(document, "createElement")
    setup.publisher.flush()
    const body = setup.replica.body!
    const mirroredWidget = body.children[0]
    expect(mirroredWidget.localName).toBe("unknown-widget")
    expect(mirroredWidget.getAttribute("custom")).toBe("keep")
    expect(Array.from(mirroredWidget.childNodes).map(node => node.nodeType)).toEqual([3, 3, 3, 1])
    expect(readableNodePath(body, mirroredWidget.children[0])).toEqual([0, 3])
    expect(mirroredWidget.children[0].getAttribute("__domeditor_node_kind")).toBe("authored")
    expect(mirroredWidget.children[0].childNodes[1]).toMatchObject({nodeType: 8, textContent: "comment"})
    expect(body.children[1].namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(body.children[1].children[0].getAttribute("xlink:href")).toBe("#shape")
    expect(body.children[2].childNodes.length).toBe(0)
    expect(setup.replica.authoredSignature()).toContain("Inert")
    expect(parser).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("sends small text and attribute updates for a large document, retains views and ignores markers", () => {
    const setup = fixture('<p arbitrary="keep">' + "Long content ".repeat(200000) + '</p><custom-widget></custom-widget>')
    const baselineBytes = setup.messages[0].update.byteLength
    const paragraph = setup.owner.querySelector("p")!
    const view = setup.replica.body!.children[0]
    setup.messages.length = 0
    vi.spyOn(setup.owner.documentElement, "outerHTML", "get").mockImplementation(() => { throw new Error("Unexpected HTML serialization") })
    ;(paragraph.firstChild as Text).appendData("x")
    setup.publisher.flush()
    expect(setup.messages).toHaveLength(1)
    expect(setup.messages[0].reset).toBe(false)
    expect(setup.messages[0].update.byteLength).toBeLessThan(1024)
    expect(baselineBytes).toBeGreaterThan(2000000)
    expect(setup.replica.body!.children[0]).toBe(view)
    expect(view.textContent?.endsWith("x")).toBe(true)
    paragraph.style.left = "25px"
    setup.publisher.flush()
    expect(setup.messages.at(-1)!.update.byteLength).toBeLessThan(1024)
    expect(view.getAttribute("style")).toContain("25px")
    const count = setup.messages.length
    paragraph.classList.add("◆selected")
    const widget = setup.owner.querySelector("custom-widget")!
    widget.setAttribute("contenteditable", "")
    setup.publisher.flush()
    expect(setup.messages).toHaveLength(count)
    expect(setup.replica.authoredSignature()).not.toContain("◆")
    widget.setAttribute("contenteditable", "false")
    setup.publisher.flush()
    expect(setup.replica.body!.children[1].getAttribute("contenteditable")).toBe("false")
  })

  it("forwards remote edits and undo/redo, then releases subscriptions on destruction", () => {
    const setup = fixture("<p>Before</p>")
    const text = (setup.shared.body.get(0) as Y.XmlElement).get(0) as Y.XmlText
    setup.shared.doc.transact(() => text.insert(text.length, " remote"), "remote")
    expect(setup.replica.body!.textContent).toBe("Before remote")
    setup.shared.stopCapturing()
    ;(setup.owner.querySelector("p")!.firstChild as Text).appendData(" local")
    setup.publisher.flush()
    expect(setup.replica.body!.textContent).toBe("Before remote local")
    setup.shared.undo()
    expect(setup.replica.body!.textContent).toBe("Before remote")
    setup.shared.redo()
    expect(setup.replica.body!.textContent).toBe("Before remote local")
    setup.publisher.destroy()
    const count = setup.messages.length
    setup.shared.doc.transact(() => text.insert(text.length, " later"), "remote")
    expect(setup.messages).toHaveLength(count)
  })

  it.each([false, true])("follows a private review branch and restores the committed tree (accept: %s)", accept => {
    const setup = fixture("<p>Committed</p>")
    const preview = setup.shared.beginDOMPreview()
    setup.owner.querySelector("p")!.textContent = "Preview"
    // Native preview observers run before the bridge's explicit flush barrier.
    setup.publisher.flush()
    // The private binding reconciles at its normal observer checkpoint.
    return new Promise<void>(resolve => queueMicrotask(resolve)).then(() => {
      expect(setup.replica.body!.textContent).toBe("Preview")
      expect((setup.shared.body.get(0) as Y.XmlElement).toString()).toContain("Committed")
      if(accept) preview.accept("review-test")
      else preview.reject()
      expect(setup.replica.body!.textContent).toBe(accept ? "Preview" : "Committed")
      expect(setup.owner.body.textContent).toBe(accept ? "Preview" : "Committed")
      expect(setup.messages.filter(message => message.reset)).toHaveLength(3)
      if(accept) {
        setup.shared.undoCapturedChange("review-test")
        expect(setup.replica.body!.textContent).toBe("Committed")
      }
    })
  })

  it.each([
    '<p>Text <strong>bold</strong></p><!--keep--><section><unknown-widget><p>Nested</p></unknown-widget></section>',
    '<picture><source srcset="x"><img usemap="#map"></picture><map name="map"><area popovertarget="detail"></map><div id="detail" popover><p>Detail</p></div>',
    '<div class="ww-popup"><button popovertarget="content">Open</button><div popover id="content"><p>Popup</p></div></div>',
    '<div class="ww-popup"><button popovertarget="external">Open</button></div><div class="ww-popup-content" popover id="external"><p>External</p></div>',
    '<section class="ww-board-group"><h2>Group</h2><section class="ww-board-column"><h2>Column</h2><article class="ww-board-card"><figure><img><figcaption>Caption</figcaption></figure></article></section></section>',
    '<div class="ww-slides-viewport"><section class="ww-slide"><h1>Title</h1><p>Text</p></section></div>',
    ' \n<custom-template role="document"><section><p>Inside</p></section></custom-template><!--outside-->',
    '<svg><text>Vector</text></svg><math display="block"><mi>x</mi></math><math><mi>y</mi></math><table><tbody><tr><td>Cell</td></tr></tbody></table>',
  ])("builds the same outline from native DOM and the replica: %s", html => {
    const setup = fixture(html)
    if(html.includes("ww-board")) setup.owner.body.className = "ww-board"
    if(html.includes("ww-slides")) setup.owner.body.className = "ww-slides"
    setup.publisher.flush()
    const host = new DomEditor() as any
    host.editorDocument = setup.owner
    const expected = host.buildDocumentTree()
    host.editorDocument = null
    host.documentReplica = setup.replica
    expect(host.buildDocumentTree()).toEqual(expected)
  })

  it("validates binary messages and safely rejects malformed updates", () => {
    const setup = fixture("<p>Text</p>")
    const message = setup.messages[0]
    expect(isEditorDocumentUpdate(message)).toBe(true)
    for(const change of [{update: [1, 2]}, {sequence: NaN}, {sequence: 0}, {reset: "yes"}, {doctype: {name: "html"}}]) {
      expect(isEditorDocumentUpdate({...message, ...change})).toBe(false)
    }
    expect(() => new EditorDocumentReplica({...message, update: new Uint8Array([255])})).toThrow()
  })

  it("builds a large outline without rescanning all siblings for each item's layout", () => {
    const setup = fixture("<p>Text</p>".repeat(5000))
    const mirror = setup.replica.doc.getMap("domeditor").get("document") as Y.Map<Y.XmlElement>
    const scan = vi.spyOn(mirror.get("body")!, "toArray")
    const host = new DomEditor() as any
    host.documentReplica = setup.replica
    expect(host.buildDocumentTree().children).toHaveLength(5000)
    expect(scan.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it("invalidates cached children and attributes after role, namespace and node-kind changes", () => {
    const setup = fixture('<custom-template><p>Content</p></custom-template>')
    const host = new DomEditor() as any
    host.documentReplica = setup.replica
    const initialTree = host.buildDocumentTree()
    const template = setup.owner.querySelector("custom-template")!
    template.setAttribute("role", "document")
    setup.publisher.flush()
    expect(host.buildDocumentTree().path).toEqual([0])
    expect(initialTree.path).toEqual([])
    const svg = setup.owner.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.innerHTML = "<template><text>Vector</text></template>"
    setup.owner.body.append(svg)
    setup.publisher.flush()
    expect(setup.replica.body!.children[1].children[0].children[0].localName).toBe("text")
    const mirrored = (setup.shared.body.get(0) as Y.XmlElement).get(0) as Y.XmlElement
    mirrored.setAttribute("__domeditor_node_kind", "comment")
    expect(setup.replica.body!.children[0].children).toHaveLength(0)
    expect(setup.replica.body!.children[0].childNodes[0].nodeType).toBe(8)
    mirrored.removeAttribute("__domeditor_node_kind")
    expect(setup.replica.body!.children[0].children[0].localName).toBe("p")
  })

  it("recovers from missing or malformed messages and ignores updates from replaced frames", () => {
    const setup = fixture("<p>Before</p>")
    const host = new DomEditor() as any
    host.editorOpaque = true
    host.documentReplicaId = "test-frame"
    host.fileHandle = {}
    host.renderRoot = document.createElement("div")
    host.isEditorMessage = () => true
    host.stylesVisible = () => false
    const resync = vi.spyOn(host, "postFrameControl").mockImplementation(() => {})
    cleanup.push(() => host.documentReplica?.destroy())
    const receive = (message: EditorDocumentUpdate) => host.handleEditorMessage(new MessageEvent("message", {data: message}))
    receive(setup.messages[0])
    const initial = host.documentReplica
    const initialSequence = host.documentChangeSequence
    ;(setup.owner.querySelector("p")!.firstChild as Text).appendData(" changed")
    setup.publisher.flush()
    const edit = setup.messages.at(-1)!
    receive({...edit, replicaId: "old-frame"})
    expect(host.documentReplica.body.textContent).toBe("Before")
    receive({...edit, sequence: edit.sequence + 1})
    receive({...edit, sequence: edit.sequence + 2})
    expect(resync).toHaveBeenCalledTimes(1)
    expect(host.documentReplica).toBe(initial)
    expect(host.documentChangeSequence).toBe(initialSequence)
    setup.publisher.reset()
    receive(setup.messages.at(-1)!)
    expect(host.documentReplica.body.textContent).toBe("Before changed")
    expect(host.documentReplica).not.toBe(initial)
    const currentSequence = host.documentReplicaSequence
    receive({...edit, sequence: currentSequence + 1, update: new Uint8Array([255])})
    expect(resync).toHaveBeenCalledTimes(2)
    setup.publisher.reset()
    receive(setup.messages.at(-1)!)
    expect(host.documentReplica.body.textContent).toBe("Before changed")
    expect(host.documentReplicaSyncPending).toBe(false)
    expect(host.editorDocument).toBeNull()
  })

  it("updates the host after mirror election, head changes and language changes", () => {
    const setup = fixture("<p>Before</p>")
    const host = new DomEditor() as any
    host.editorOpaque = true
    host.documentReplicaId = "test-frame"
    host.fileHandle = {}
    host.renderRoot = document.createElement("div")
    host.isEditorMessage = () => true
    host.stylesVisible = () => false
    cleanup.push(() => host.documentReplica?.destroy())
    const receive = (message: EditorDocumentUpdate) => host.handleEditorMessage(new MessageEvent("message", {data: message}))
    receive(setup.messages[0])
    const replacement = fixture("<unknown-widget>Replacement</unknown-widget>")
    // A document's mirror can be elected after initial synchronization.
    const mirror = new Y.Map<Y.XmlElement | Y.Map<unknown>>()
    mirror.set("body", replacement.shared.body.clone())
    mirror.set("head", replacement.shared.headElement!.clone())
    mirror.set("attributes", replacement.shared.documentAttributes!.clone())
    mirror.set("metadata", new Y.Map())
    setup.shared.doc.getMap("domeditor").set("document", mirror)
    for(const message of setup.messages.slice(1)) receive(message)
    expect(host.documentTree.children[0].name).toBe("Widget")
    expect(host.documentReplica.body.textContent).toBe("Replacement")
    setup.owner.documentElement.lang = "de"
    setup.owner.head.append(setup.owner.createElement("title"))
    setup.owner.title = "Changed title"
    setup.publisher.flush()
    for(const message of setup.messages.slice(1)) receive(message)
    expect(host.documentReplica.documentElement.getAttribute("lang")).toBe("de")
    expect(host.documentReplica.head.textContent).toBe("Changed title")
  })

  it("keeps bridged compound graphic edits in one undo item and publishes their completed structure", async () => {
    document.body.innerHTML = "<p></p>"
    vi.spyOn(window, "postMessage").mockImplementation(() => {})
    const editor = new DOMEditor({documentReplicaId: "graphic-frame"})
    let replica: EditorDocumentReplica | null = null
    const publication = publishEditorDocument(editor.doc, "graphic-frame", message => {
      if(message.reset) { replica?.destroy(); replica = new EditorDocumentReplica(message) }
      else replica!.apply(message.update)
    })
    try {
      editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
      await new Promise<void>(resolve => queueMicrotask(resolve))
      editor.doc.stopCapturing()
      editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line-both-arrows",
        paint: {fill: "#ff0000", stroke: "#123456", "stroke-width": "8"}})
      await new Promise<void>(resolve => queueMicrotask(resolve))
      const graphic = document.querySelector("svg")!
      expect(graphic.querySelectorAll("polyline")).toHaveLength(1)
      expect(graphic.querySelectorAll("marker")).toHaveLength(1)
      expect(replica!.authoredSignature()).toContain("marker-end")
      editor.doc.undo()
      await new Promise<void>(resolve => queueMicrotask(resolve))
      expect(graphic.querySelector("polyline")).toBeNull()
      expect(replica!.authoredSignature()).not.toContain("polyline")
      editor.doc.redo()
      await new Promise<void>(resolve => queueMicrotask(resolve))
      expect(graphic.querySelectorAll("polyline")).toHaveLength(1)
      expect(graphic.querySelectorAll("marker")).toHaveLength(1)
      expect(replica!.authoredSignature()).toContain("marker-end")
    }
    finally { publication.destroy(); (replica as EditorDocumentReplica | null)?.destroy(); editor.destroy(); document.body.replaceChildren() }
  })
})
