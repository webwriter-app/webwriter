// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {editorFrameControlMessage, initializeEditorMessage} from "./editor-bridge"
import {observeFrameDocument, shouldCaptureFrameShortcut} from "./editor-entry"

const {providerDisconnect} = vi.hoisted(() => ({providerDisconnect: vi.fn()}))
const {graphicInputState} = vi.hoisted(() => ({graphicInputState: {
  graphic: {textEditingRange: null as Range | null, focusTextInput: vi.fn()},
  media: {isPlaceholderInteraction: false},
  mark: {isSVGTextSelection: false}, selection: {captureSelectedElement: null as Element | null},
}}))
vi.mock("./domeditor", () => ({
  DOMEditor: class {
    doc = {disconnectCollaboration: providerDisconnect}
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
  document.body.replaceChildren()
  document.body.removeAttribute("contenteditable")
  if(document.doctype) document.replaceChild(document.implementation.createDocumentType("html", "", ""), document.doctype)
  vi.restoreAllMocks()
})

describe("frame document snapshots", () => {
  it("publishes direct template edits and rebinds nested and removed template contents", async() => {
    document.body.innerHTML = "<p>Document</p>"
    const snapshots: string[] = []
    const disconnect = observeFrameDocument(document, () => snapshots.push(document.documentElement.outerHTML))
    const template = document.createElement("template")
    document.body.append(template)
    await flushMutations()

    template.content.append(document.createTextNode("Direct template edit"))
    await flushMutations()
    expect(snapshots.at(-1)).toContain("Direct template edit")

    const nested = document.createElement("template")
    template.content.append(nested)
    await flushMutations()
    nested.content.append(document.createElement("b"))
    nested.content.firstElementChild!.textContent = "Nested template edit"
    await flushMutations()
    expect(snapshots.at(-1)).toContain("Nested template edit")

    const beforeRemoval = snapshots.length
    document.body.removeChild(template)
    await flushMutations()
    const afterRemoval = snapshots.length
    expect(afterRemoval).toBeGreaterThan(beforeRemoval)
    template.content.append(document.createTextNode("Detached edit"))
    await flushMutations()
    expect(snapshots).toHaveLength(afterRemoval)
    disconnect()
  })

  it("ignores foreign SVG template elements and delivers queued records before rebinding", async() => {
    document.body.innerHTML = ""
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.append(document.createElementNS("http://www.w3.org/2000/svg", "template"))
    document.body.append(svg)
    let callbacks = 0
    let mutatedDuringCallback = false
    const disconnect = observeFrameDocument(document, () => {
      callbacks++
      if(!mutatedDuringCallback) {
        mutatedDuringCallback = true
        document.body.append(document.createElement("i"))
      }
    })

    document.body.append(document.createElement("template"))
    await flushMutations()
    expect(callbacks).toBeGreaterThanOrEqual(2)
    disconnect()
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

it("publishes template edits, owns only document shortcuts, and disconnects collaboration", async() => {
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
  await new Promise(resolve => setTimeout(resolve, 260))
  const snapshots = postMessage.mock.calls.map(([message]) => message as {type?: string, html?: string, textNodeRuns?: unknown})
    .filter(message => message.type === "editor-frame-snapshot")
  expect(snapshots.some(message => message.html?.includes("After template edit"))).toBe(true)
  const doctype = '<!DOCTYPE html PUBLIC "-//WebWriter//DTD HTML 5.0//EN" "https://example.test/webwriter.dtd">'
  expect(snapshots.some(message => message.html?.startsWith(doctype))).toBe(true)
  expect(snapshots.some(message => JSON.stringify(message.textNodeRuns) === JSON.stringify([{path: [1, 0], lengths: [3, 5, 0]}]))).toBe(true)

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
    type: editorFrameControlMessage, bridgeNonce: nonce, command: "shortcuts", shortcuts: {"editor.undo": "Alt+Shift+1", "document.print": "Ctrl+P"},
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
  window.dispatchEvent(new Event("unload"))
})
