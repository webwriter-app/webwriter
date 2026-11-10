// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {editorFrameControlMessage, initializeEditorMessage} from "./editor-bridge"
import {EditorDocumentReplica, isEditorDocumentUpdate, publishEditorDocument, type EditorDocumentUpdate} from "./editor-document-sync"
import {SharedDOMDoc} from "./domdoc"
import {shouldCaptureFrameShortcut} from "./editor-entry"

const {providerDisconnect, sharedDocs, replicas} = vi.hoisted(() => ({providerDisconnect: vi.fn(), sharedDocs: [] as any[], replicas: [] as any[]}))
const {graphicInputState} = vi.hoisted(() => ({graphicInputState: {
  graphic: {textEditingRange: null as Range | null, focusTextInput: vi.fn()},
  media: {isPlaceholderInteraction: false},
  mark: {isSVGTextSelection: false}, selection: {captureSelectedElement: null as Element | null},
}}))
vi.mock("./domeditor", () => ({
  DOMEditor: class {
    editingLocks = new Set<unknown>()
    lockEditing(owner: unknown) { this.editingLocks.add(owner) }
    unlockEditing(owner: unknown) { this.editingLocks.delete(owner) }
    hasEditingLock(owner: unknown) { return this.editingLocks.has(owner) }
    doc = new SharedDOMDoc(undefined, undefined, ["contenteditable"], ["◆"], {root: document.body})
    constructor() {
      sharedDocs.push(this.doc)
      vi.spyOn(this.doc, "disconnectCollaboration").mockImplementation(providerDisconnect)
    }
    destroy = vi.fn(() => this.doc.destroy())
    features = {
      graphic: graphicInputState.graphic,
      media: graphicInputState.media,
      mark: graphicInputState.mark,
      selection: graphicInputState.selection,
      proofreading: {setChecking: vi.fn(), setDocumentChecking: vi.fn(), setDictionary: vi.fn()},
      comment: {setCommentHighlighting: vi.fn()},
    }
  },
}))

const flushMutations = async() => {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  for(const replica of replicas.splice(0)) replica.destroy()
  for(const doc of sharedDocs.splice(0)) doc.destroy()
  document.body.replaceChildren()
  document.body.removeAttribute("contenteditable")
  if(document.doctype) document.replaceChild(document.implementation.createDocumentType("html", "", ""), document.doctype)
  vi.restoreAllMocks()
})

describe("frame document updates", () => {
  const connectReplica = () => {
    const shared = new SharedDOMDoc(undefined, undefined, ["contenteditable"], ["◆"], {root: document.body, connect: false})
    sharedDocs.push(shared)
    const updates: EditorDocumentUpdate[] = []
    let replica: EditorDocumentReplica | null = null
    const publication = publishEditorDocument(shared, "template-test-replica", message => {
      updates.push(message)
      if(message.reset) {
        replica?.destroy()
        replica = new EditorDocumentReplica(message)
        replicas.push(replica)
      }
      else replica?.apply(message.update)
    })
    return {shared, updates, publication, replica: () => replica}
  }

  it("publishes nested template edits and stops syncing a removed template", async() => {
    document.body.innerHTML = "<p>Document</p>"
    const {shared, updates, publication, replica} = connectReplica()
    const template = document.createElement("template")
    document.body.append(template)
    await flushMutations()
    shared.flushDOMChanges()

    template.content.append(document.createTextNode("Direct template edit"))
    await flushMutations()
    shared.flushDOMChanges()
    const directEditCount = updates.length
    expect(directEditCount).toBeGreaterThan(1)
    expect(updates.at(-1)?.update.byteLength).toBeGreaterThan(0)

    const nested = document.createElement("template")
    template.content.append(nested)
    await flushMutations()
    shared.flushDOMChanges()
    nested.content.append(document.createElement("b"))
    nested.content.firstElementChild!.textContent = "Nested template edit"
    await flushMutations()
    shared.flushDOMChanges()
    expect(updates.length).toBeGreaterThan(directEditCount)
    expect(updates.at(-1)?.update.byteLength).toBeGreaterThan(0)

    const beforeRemoval = updates.length
    document.body.removeChild(template)
    await flushMutations()
    shared.flushDOMChanges()
    const afterRemoval = updates.length
    expect(afterRemoval).toBeGreaterThan(beforeRemoval)
    template.content.append(document.createTextNode("Detached edit"))
    await flushMutations()
    shared.flushDOMChanges()
    expect(updates).toHaveLength(afterRemoval)
    expect(Array.from(replica()?.body?.children ?? [], child => child.localName)).toEqual(["p"])
    publication.destroy()
  })

  it("publishes foreign SVG template attribute changes as regular node updates", async() => {
    document.body.innerHTML = ""
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    const template = document.createElementNS("http://www.w3.org/2000/svg", "template")
    svg.append(template)
    document.body.append(svg)
    const {shared, updates, publication, replica} = connectReplica()

    template.setAttribute("data-label", "changed")
    document.body.append(document.createElement("i"))
    await flushMutations()
    shared.flushDOMChanges()
    expect(updates.filter(message => !message.reset).length).toBeGreaterThan(0)
    const replicaSVG = replica()?.body?.children[0]
    expect(replicaSVG?.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(replicaSVG?.children[0]?.getAttribute("data-label")).toBe("changed")
    expect(Array.from(replica()?.body?.children ?? []).at(-1)?.localName).toBe("i")
    publication.destroy()
  })
})

describe("frame shortcut ownership", () => {
  it("keeps document shortcuts while leaving fields, widgets, and appendix controls native", () => {
    document.body.setAttribute("contenteditable", "")
    document.body.innerHTML = '<p><input></p><demo-widget></demo-widget>'
    const shortcut = (target: EventTarget) => {
      const event = new KeyboardEvent("keydown", {key: "z", ctrlKey: true, bubbles: true, composed: true, cancelable: true})
      target.dispatchEvent(event)
      return shouldCaptureFrameShortcut(event)
    }

    expect(shortcut(document.querySelector("p")!)).toBe(true)
    expect(shortcut(document.querySelector("input")!)).toBe(false)

    const widgetRoot = document.querySelector("demo-widget")!.attachShadow({mode: "open"})
    const widgetControl = document.createElement("button")
    widgetRoot.append(widgetControl)
    expect(shortcut(widgetControl)).toBe(false)

    const appendix = document.body.attachShadow({mode: "open"})
    const appendixControl = document.createElement("button")
    appendix.append(appendixControl)
    expect(shortcut(appendixControl)).toBe(false)
  })
})

it("publishes document updates, owns only document shortcuts, and disconnects collaboration", async() => {
  providerDisconnect.mockClear()
  const nonce = "frame-control-nonce-1234"
  const origin = window.location.origin
  document.doctype?.remove()
  document.insertBefore(document.implementation.createDocumentType("html", "-//WebWriter//DTD HTML 5.0//EN",
    "https://example.test/webwriter.dtd"), document.documentElement)
  document.body.setAttribute("contenteditable", "")
  document.body.innerHTML = '<template><p>Before</p></template><p>Document</p><input><demo-widget></demo-widget>'
  const paragraph = document.querySelector("p")!
  ;(paragraph.firstChild as Text).splitText(3)
  paragraph.append(document.createTextNode(""))
  const postMessage = vi.spyOn(window, "postMessage")
  window.dispatchEvent(new MessageEvent("message", {source: window, origin, data: {
    type: initializeEditorMessage, syncUrl: "ws://localhost:1234", bridgeNonce: nonce,
    shortcuts: {"editor.undo": "Ctrl+Z", "document.print": "Ctrl+P"},
  }}))
  await flushMutations()

  document.querySelector("template")!.content.querySelector("p")!.textContent = "After template edit"
  await flushMutations()
  const updatedParagraph = document.createElement("p")
  updatedParagraph.textContent = "Updated document"
  paragraph.after(updatedParagraph)
  await flushMutations()
  const updates = postMessage.mock.calls.map(([message]) => message as EditorDocumentUpdate & {bridgeNonce?: string})
    .filter(message => message.type === "editor-frame-update")
  expect(updates.length).toBeGreaterThan(0)
  expect(updates.every(isEditorDocumentUpdate)).toBe(true)
  const replicaUpdates = updates.filter(message => message.reset)
  expect(replicaUpdates.length).toBeGreaterThan(0)
  let replica: EditorDocumentReplica | null = null
  for(const update of updates) {
    if(update.reset) {
      replica?.destroy()
      replica = new EditorDocumentReplica(update)
      replicas.push(replica)
    }
    else replica?.apply(update.update)
  }
  expect(Array.from(replica?.body?.children ?? []).map(child => child.localName)).toEqual(["template", "p", "p", "input", "demo-widget"])
  expect(replica?.body?.textContent).toContain("Updated document")
  expect(updates.some(message => message.update instanceof Uint8Array && message.update.length > 0)).toBe(true)

  const beforeMarker = updates.length
  paragraph.classList.add("◆temporary-test-marker")
  await flushMutations()
  expect(postMessage.mock.calls.map(([message]) => message as {type?: string})
    .filter(message => message.type === "editor-frame-update")).toHaveLength(beforeMarker)
  paragraph.classList.remove("◆temporary-test-marker")
  await flushMutations()

  const doctype = '<!DOCTYPE html PUBLIC "-//WebWriter//DTD HTML 5.0//EN" "https://example.test/webwriter.dtd">'

  window.dispatchEvent(new MessageEvent("message", {source: window, origin, data: {
    type: editorFrameControlMessage, bridgeNonce: nonce, command: "snapshot", requestId: "doctype-snapshot",
  }}))
  const snapshotResponse = postMessage.mock.calls.map(([message]) => message as {type?: string, requestId?: string, html?: string, textNodeRuns?: unknown})
    .find(message => message.type === "editor-frame-response" && message.requestId === "doctype-snapshot")
  expect(snapshotResponse?.html?.startsWith(doctype)).toBe(true)
  expect(snapshotResponse?.textNodeRuns).toEqual([{path: [1, 0], lengths: [3, 5, 0]}])

  const shortcutEvent = (target: EventTarget) => {
    const event = new KeyboardEvent("keydown", {key: "z", ctrlKey: true, bubbles: true, composed: true, cancelable: true})
    target.dispatchEvent(event)
    return event
  }
  const documentShortcut = shortcutEvent(document.querySelector("p")!)
  expect(documentShortcut.defaultPrevented).toBe(true)
  const nativeInputShortcut = shortcutEvent(document.querySelector("input")!)
  expect(nativeInputShortcut.defaultPrevented).toBe(false)
  const widgetRoot = document.querySelector("demo-widget")!.attachShadow({mode: "open"})
  const widgetShortcut = shortcutEvent(widgetRoot.appendChild(document.createElement("button")))
  expect(widgetShortcut.defaultPrevented).toBe(false)
  const shortcuts = postMessage.mock.calls.map(([message]) => message as {type?: string, action?: string})
    .filter(message => message.type === "editor-frame-shortcut")
  expect(shortcuts.map(message => message.action)).toEqual(["Undo"])

  const germanUndo = new KeyboardEvent("keydown", {key: "z", code: "KeyY", ctrlKey: true,
    bubbles: true, composed: true, cancelable: true})
  document.querySelector("p")!.dispatchEvent(germanUndo)
  expect(germanUndo.defaultPrevented).toBe(true)
  expect(postMessage.mock.calls.filter(([message]) => message.type === "editor-frame-shortcut" && message.action === "Undo")).toHaveLength(2)

  const appendix = document.body.shadowRoot ?? document.body.attachShadow({mode: "open"})
  const appendixControl = appendix.appendChild(document.createElement("input"))
  for(const target of [document.querySelector("p")!, document.querySelector("input")!, widgetRoot.firstChild!, appendixControl]) {
    const event = new KeyboardEvent("keydown", {key: "p", code: "KeyP", ctrlKey: true,
      bubbles: true, composed: true, cancelable: true})
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
  const prints = () => postMessage.mock.calls.map(([message]) => message as {type?: string, action?: string})
    .filter(message => message.type === "editor-frame-shortcut" && message.action === "Print")
  expect(prints()).toHaveLength(4)

  window.dispatchEvent(new MessageEvent("message", {source: window, origin, data: {
    type: editorFrameControlMessage, bridgeNonce: nonce, command: "shortcuts", shortcuts: {
      "editor.undo": "Alt+Shift+1", "document.print": "Ctrl+P", "editor.focusAI": "Alt+Shift+J", "toolbox.review": "Alt+Shift+4",
    },
  }}))
  const graphic = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  document.body.append(graphic)
  graphicInputState.selection.captureSelectedElement = graphic
  const shapeShortcut = () => {
    const event = new KeyboardEvent("keydown", {key: "1", code: "Digit1", altKey: true, shiftKey: true, bubbles: true, cancelable: true})
    graphic.dispatchEvent(event)
    return event
  }
  const undoCount = () => postMessage.mock.calls.filter(([message]) => message.type === "editor-frame-shortcut" && message.action === "Undo").length
  const beforeShape = undoCount()
  expect(shapeShortcut().defaultPrevented).toBe(false)
  expect(undoCount()).toBe(beforeShape)
  for(const [key, code, action] of [["J", "KeyJ", "focus-ai-bar"], ["4", "Digit4", "toolbox:Review"]]) {
    const event = new KeyboardEvent("keydown", {key, code, altKey: true, shiftKey: true, bubbles: true, cancelable: true})
    graphic.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({type: "editor-frame-shortcut", action}), origin)
  }
  graphicInputState.mark.isSVGTextSelection = true
  expect(shapeShortcut().defaultPrevented).toBe(true)
  expect(undoCount()).toBe(beforeShape + 1)
  graphicInputState.mark.isSVGTextSelection = false
  graphicInputState.selection.captureSelectedElement = null
  for(const extra of [{repeat: true}, {isComposing: true}]) {
    const event = new KeyboardEvent("keydown", {key: "p", code: "KeyP", ctrlKey: true,
      bubbles: true, composed: true, cancelable: true, ...extra})
    appendixControl.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(extra.repeat === true)
  }
  expect(prints()).toHaveLength(4)

  const focusBody = vi.spyOn(document.body, "focus")
  graphicInputState.graphic.textEditingRange = document.createRange()
  window.dispatchEvent(new MessageEvent("message", {source: window, origin, data: {
    type: editorFrameControlMessage, bridgeNonce: nonce, command: "focus",
  }}))
  expect(graphicInputState.graphic.focusTextInput).toHaveBeenCalledOnce()
  expect(focusBody).not.toHaveBeenCalled()
  graphicInputState.graphic.textEditingRange = null
  graphicInputState.media.isPlaceholderInteraction = true
  window.dispatchEvent(new MessageEvent("message", {source: window, origin, data: {
    type: editorFrameControlMessage, bridgeNonce: nonce, command: "focus",
  }}))
  expect(focusBody).not.toHaveBeenCalled()
  graphicInputState.media.isPlaceholderInteraction = false
  window.dispatchEvent(new MessageEvent("message", {source: window, origin, data: {
    type: editorFrameControlMessage, bridgeNonce: nonce, command: "focus",
  }}))
  expect(focusBody).toHaveBeenCalledOnce()

  window.dispatchEvent(new MessageEvent("message", {source: window, origin, data: {
    type: editorFrameControlMessage, bridgeNonce: nonce, command: "disconnect-collaboration",
  }}))
  expect(providerDisconnect).toHaveBeenCalledOnce()

  const updateCount = () => postMessage.mock.calls.filter(([message]) => message.type === "editor-frame-update").length
  const beforePageHide = updateCount()
  const editor = (window as any).editor
  window.dispatchEvent(Object.assign(new Event("pagehide"), {persisted: true}))
  expect(editor.destroy).not.toHaveBeenCalled()
  window.dispatchEvent(Object.assign(new Event("pageshow"), {persisted: true}))
  paragraph.append("After cache restore")
  await flushMutations()
  const afterRestore = updateCount()
  expect(afterRestore).toBeGreaterThan(beforePageHide)

  window.dispatchEvent(Object.assign(new Event("pagehide"), {persisted: false}))
  expect(editor.destroy).toHaveBeenCalledOnce()
  expect((window as any).editor).toBeUndefined()
  paragraph.append("After teardown")
  await flushMutations()
  expect(updateCount()).toBe(afterRestore)
})
