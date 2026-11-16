// @vitest-environment happy-dom
import {hasPresentationState} from "../presentation-state.js"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {SharedDOMDoc, sharedDOMBody} from "../domdoc"
import {executeFailureEvent, type VersionHistoryState} from "../editor-bridge"
import {defaultGroupingRules} from "../widget-grouping.js"
import {readWidgetGrouping, writeWidgetGrouping} from "../widget-grouping-dom"
import {checkpointCoalescingWindow, maxAutomaticCheckpoints} from "./history"

let editor: DOMEditor
let clock: {mockRestore(): void} | undefined

function setClock(now: number) {
  clock = vi.spyOn(Date, "now").mockReturnValue(now)
}

/** One author's automatic checkpoints coalesce within a window. Tests that
 * need separate entries move the clock past it. */
function startNewCheckpointWindow() {
  setClock(Date.now() + checkpointCoalescingWindow)
}

/** A pending automatic checkpoint is recorded once its window has ended and
 * the debounce elapsed. Requires fake timers. */
function elapseCheckpointWindow() {
  startNewCheckpointWindow()
  vi.advanceTimersByTime(700)
}

async function mutationsDelivered() {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

beforeEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.body.innerHTML = "<p>Hello</p>"
  document.documentElement.removeAttribute("lang")
  editor = new DOMEditor()
})

afterEach(() => {
  clock?.mockRestore()
  clock = undefined
  editor.destroy()
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.documentElement.removeAttribute("lang")
})

describe("history shortcut modifiers", () => {
  it.each([true, false])("requires exact primary modifiers and supports standard redo (Apple: %s)", apple => {
    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue(apple ? "MacIntel" : "Win32")
    const undo = vi.spyOn(editor.doc, "undo").mockImplementation(() => {})
    const redo = vi.spyOn(editor.doc, "redo").mockImplementation(() => {})
    const primary = apple ? {metaKey: true} : {ctrlKey: true}
    try {
      const press = (key: string, modifiers: KeyboardEventInit) => {
        const event = new KeyboardEvent("keydown", {key, cancelable: true, ...modifiers})
        editor.features.history.activeListeners.keydown!(event)
        return event.defaultPrevented
      }
      expect(press("z", primary)).toBe(true)
      expect(press("Z", {...primary, shiftKey: true})).toBe(true)
      if(!apple) expect(press("y", primary)).toBe(true)
      for(const letter of ["z", "y"]) {
        expect(press(letter, {...primary, altKey: true})).toBe(false)
        expect(press(letter, {metaKey: true, ctrlKey: true})).toBe(false)
      }
      expect(press("y", {...primary, shiftKey: true})).toBe(false)
      expect(undo).toHaveBeenCalledOnce()
      expect(redo).toHaveBeenCalledTimes(apple ? 1 : 2)
    }
    finally { platform.mockRestore(); undo.mockRestore(); redo.mockRestore() }
  })
})

describe("history selection restoration", () => {
  it("captures the live native selection before editing handlers and reveals undo/redo", async () => {
    const text = document.querySelector("p")!.firstChild! as Text
    const selection = document.getSelection()!
    selection.setBaseAndExtent(text, 1, text, 4)
    const remember = vi.spyOn(editor.doc, "updateLocalSelection")
    // No selectionchange has fired yet. Native beforeinput must remember it.
    const input = new InputEvent("beforeinput", {
      bubbles: true, inputType: "deleteContentForward",
      cancelable: true,
    })
    document.querySelector("p")!.dispatchEvent(input)
    expect(remember).toHaveBeenCalled()
    expect(editor.doc.domSelection).toMatchObject({anchorNode: text, anchorOffset: 1, focusOffset: 4})
    if(!input.defaultPrevented) text.deleteData(1, 3)
    selection.collapse(text, 1)
    await mutationsDelivered()
    selection.collapse(text, 0)
    const reveal = vi.spyOn(editor.features.selection, "revealSelection")
    editor.features.history.actions.undo({type: "undo"})
    expect(selection.toString()).toBe("ell")
    expect(reveal).toHaveBeenCalledOnce()
    editor.features.history.actions.redo({type: "redo"})
    expect(text.data).toBe("Ho")
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(1)
    expect(selection.isCollapsed).toBe(true)
    expect(reveal).toHaveBeenCalledTimes(2)
    editor.features.history.disable()
    reveal.mockClear()
    editor.doc.undo()
    expect(reveal).not.toHaveBeenCalled()
  })

  it("ignores incidental shadow-widget input when remembering authored selections", () => {
    const text = document.querySelector("p")!.firstChild! as Text
    const selection = document.getSelection()!
    selection.setBaseAndExtent(text, 1, text, 4)
    editor.doc.updateLocalSelection()
    const widget = document.createElement("history-widget")
    document.body.append(widget)
    const shadow = widget.attachShadow({mode: "open"})
    shadow.innerHTML = "<input>"
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const remember = vi.spyOn(editor.doc, "updateLocalSelection")
    shadow.querySelector("input")!.dispatchEvent(new InputEvent("beforeinput", {bubbles: true, composed: true, inputType: "insertText"}))
    expect(remember).not.toHaveBeenCalled()
  })

  it("routes native history input through collaborative undo and redo", () => {
    const undo = vi.spyOn(editor.doc, "undo").mockImplementation(() => {})
    const redo = vi.spyOn(editor.doc, "redo").mockImplementation(() => {})
    for(const inputType of ["historyUndo", "historyRedo"]) {
      const event = new InputEvent("beforeinput", {inputType, cancelable: true})
      editor.features.history.activeListeners.beforeinput!(event)
      expect(event.defaultPrevented).toBe(true)
    }
    expect(undo).toHaveBeenCalledOnce()
    expect(redo).toHaveBeenCalledOnce()
  })

  it("remembers the current selection for a bridge command before selectionchange arrives", () => {
    const selection = document.getSelection()!, text = document.querySelector("p")!.firstChild!
    selection.setBaseAndExtent(text, 1, text, 4)
    window.dispatchEvent(new MessageEvent("message", {data: {type: "delete", direction: "forward"}}))
    editor.doc.syncFromDOM()
    editor.doc.undo()
    expect(selection.toString()).toBe("ell")
  })

  it("releases a later widget capture when restoring an earlier text selection", () => {
    const widget = document.createElement("history-widget")
    document.body.append(widget)
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const text = document.querySelector("p")!.firstChild! as Text
    const selection = document.getSelection()!
    selection.setBaseAndExtent(text, 1, text, 4)
    editor.doc.updateLocalSelection()
    text.deleteData(1, 3)
    selection.collapse(text, 1)
    editor.doc.syncFromDOM()
    editor.features.selection.captureElement(widget)
    expect(editor.features.selection.captureSelectedElement).toBe(widget)
    editor.doc.undo()
    expect(selection.toString()).toBe("ell")
    expect(editor.features.selection.captureSelectedElement).toBeNull()
  })
})

describe("collaborative version history", () => {
  it("rebinds historical Blob URLs after an editor reload", async () => {
    const file = new File(["old attachment"], "notes.bin", {type: "application/octet-stream"})
    const oldURL = editor.createMediaURL(file)
    document.body.innerHTML = `<p><a download="notes.bin" href="${oldURL}">Notes</a></p>`
    const history = editor.features.history.actions
    const checkpoint = history.getVersionHistory({type: "getVersionHistory"}).currentCheckpointId!
    startNewCheckpointWindow()
    document.querySelector("a")!.setAttribute("href", editor.createMediaURL(new Blob(["updated attachment"])))
    const current = history.getVersionHistory({type: "getVersionHistory"}).currentCheckpointId
    const snapshot = await editor.features.state.actions.snapshotState({type: "snapshotState"})

    editor.destroy()
    document.body.replaceChildren()
    editor = new DOMEditor({initialState: snapshot})
    const restored = editor.features.history.actions
    expect(restored.getVersionHistory({type: "getVersionHistory"}).currentCheckpointId).toBe(current)
    restored.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: checkpoint})
    const restoredURL = document.querySelector("a")!.getAttribute("href")!
    expect(restoredURL).not.toBe(oldURL)
    expect(await editor.mediaSourceBlob(restoredURL)?.text()).toBe("old attachment")
    restored.clearVersionPreview({type: "clearVersionPreview"})
    expect(await editor.mediaSourceBlob(document.querySelector("a")!.getAttribute("href")!)?.text()).toBe("updated attachment")
  })

  it("shares inline media across checkpoints and restores the exact bytes after a snapshot reload", () => {
    const attachment = "data:application/octet-stream;base64," + "ABCD".repeat(4096)
    const replacement = "data:application/octet-stream;base64," + "EFGH".repeat(4096)
    const image = "data:image/png;base64," + "IJKL".repeat(4096)
    document.body.innerHTML = `<p><a download="notes.bin" href="${attachment}">Notes</a></p><img src="${image}">`
    let history = editor.features.history.actions
    const state = () => history.getVersionHistory({type: "getVersionHistory"})
    const first = state().currentCheckpointId!
    startNewCheckpointWindow()
    document.querySelector("a")!.textContent = "Updated notes"
    const textEdit = state()
    expect(textEdit.checkpoints[0].changes).toEqual({added: 0, removed: 0, modified: 1})
    startNewCheckpointWindow()
    document.querySelector("a")!.setAttribute("href", replacement)
    expect(state().checkpoints[0].changes).toEqual({added: 0, removed: 0, modified: 1})

    const checkpoints = editor.doc.doc.getArray("version-history").toArray()
    expect(JSON.stringify(checkpoints)).not.toContain(attachment)
    expect(JSON.stringify(checkpoints)).not.toContain(image)
    expect(Array.from(editor.doc.doc.getMap<string>("version-history-assets").values()).sort())
      .toEqual([attachment, image, replacement].sort())
    const snapshot = structuredClone(editor.doc.snapshot())
    editor.destroy()
    document.body.replaceChildren()
    editor = new DOMEditor({initialState: snapshot})
    history = editor.features.history.actions
    history.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: first})
    expect(document.querySelector("a")?.getAttribute("href")).toBe(attachment)
    expect(document.querySelector("img")?.getAttribute("src")).toBe(image)
    history.clearVersionPreview({type: "clearVersionPreview"})
    expect(document.querySelector("a")?.getAttribute("href")).toBe(replacement)
    history.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: first})
    expect(document.querySelector("a")?.getAttribute("href")).toBe(attachment)
  })

  it("publishes local undo availability immediately without serializing checkpoints, and cleans up", async () => {
    const history = editor.features.history
    history.disable()
    const publish = vi.spyOn(editor, "postUndoState")
    history.enable()
    expect(publish).toHaveBeenLastCalledWith({canUndo: false, canRedo: false})
    const serialize = vi.spyOn(editor, "toHTML")
    document.querySelector("p")!.textContent = "First edit"
    await mutationsDelivered()
    expect(publish).toHaveBeenLastCalledWith({canUndo: true, canRedo: false})
    expect(serialize).not.toHaveBeenCalled()
    const calls = publish.mock.calls.length
    document.querySelector("p")!.textContent = "Same undo group"
    await mutationsDelivered()
    expect(publish).toHaveBeenCalledTimes(calls)

    editor.doc.undo()
    await mutationsDelivered()
    expect(publish).toHaveBeenLastCalledWith({canUndo: false, canRedo: true})
    editor.doc.redo()
    await mutationsDelivered()
    expect(publish).toHaveBeenLastCalledWith({canUndo: true, canRedo: false})
    editor.doc.undo()
    await mutationsDelivered()
    document.querySelector("p")!.textContent = "New branch"
    await mutationsDelivered()
    expect(publish).toHaveBeenLastCalledWith({canUndo: true, canRedo: false})

    history.disable()
    publish.mockClear()
    editor.doc.undo()
    await mutationsDelivered()
    expect(publish).not.toHaveBeenCalled()
  })

  it("keeps remote edits out of local undo availability", async () => {
    const publish = vi.spyOn(editor, "postUndoState")
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
      const paragraph = sharedDOMBody(remote).get(0) as Y.XmlElement
      ;(paragraph.get(0) as Y.XmlText).insert(5, " remotely")
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote")
      await mutationsDelivered()
      expect(document.body.textContent).toBe("Hello remotely")
      expect(editor.doc.canUndo).toBe(false)
      expect(editor.doc.canRedo).toBe(false)
      expect(publish).not.toHaveBeenCalled()
    }
    finally { remote.destroy() }
  })

  it.each([false, true])("attributes remote deletions after the peer leaves (preview: %s)", async preview => {
    const history = editor.features.history
    editor.doc.setUser({name: "Ada Lovelace"})
    const baseline = history.state().checkpoints[0].id
    const peerDocument = document.implementation.createHTMLDocument()
    const peerYDoc = new Y.Doc()
    Y.applyUpdate(peerYDoc, Y.encodeStateAsUpdate(editor.doc.doc))
    const peer = new SharedDOMDoc(undefined, undefined, [], [], {
      root: peerDocument.body, ydoc: peerYDoc, user: {name: "Grace Hopper", color: "#2563eb"},
    })
    try {
      const peerAuthor = {clientId: peer.awareness.clientID, name: "Grace Hopper", initials: "GH", color: "#2563eb"}
      const localVector = Y.encodeStateVector(editor.doc.doc)
      ;(peerDocument.querySelector("p")!.firstChild as Text).deleteData(4, 1)
      peer.flushDOMChanges()
      const update = Y.encodeStateAsUpdate(peerYDoc, localVector)
      const deletedVector = Y.encodeStateVector(peerYDoc)
      peer.undo()
      const undoUpdate = Y.encodeStateAsUpdate(peerYDoc, deletedVector)
      peer.destroy()
      if(preview) history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: baseline})
      Y.applyUpdate(editor.doc.doc, update, "remote-client")
      if(preview) {
        expect(document.body.textContent).toBe("Hello")
        history.clearPreview()
      }
      expect(document.body.textContent).toBe("Hell")
      const remote = history.actions.getVersionHistory({type: "getVersionHistory"})
      expect(remote.checkpoints[0]).toMatchObject({label: preview ? "Collaborative changes" : "Edited by Grace Hopper", user: peerAuthor})
      expect(remote.versions[0].user).toEqual(peerAuthor)

      Y.applyUpdate(editor.doc.doc, undoUpdate, "remote-client")
      expect(document.body.textContent).toBe("Hello")
      const undone = history.actions.getVersionHistory({type: "getVersionHistory"})
      expect(undone.checkpoints[0].id).not.toBe(remote.checkpoints[0].id)
      expect(undone.checkpoints[0].user).toEqual(peerAuthor)

      document.querySelector("p")!.textContent = "Hello again"
      await mutationsDelivered()
      const local = history.actions.getVersionHistory({type: "getVersionHistory"})
      expect(local.checkpoints[0].user).toMatchObject({clientId: local.currentUserId, name: "Ada Lovelace"})
      expect(local.checkpoints[1].user).toEqual(peerAuthor)
      expect(local.versions[0].user).toEqual(local.checkpoints[0].user)
    }
    finally { if(!peerYDoc.isDestroyed) peer.destroy() }
  })

  it.each([false, true])("groups authors only across edits still awaiting a checkpoint (shared checkpoint: %s)", checkpointed => {
    const history = editor.features.history
    editor.doc.setUser({name: "Ada Lovelace"})
    const peerDocument = document.implementation.createHTMLDocument()
    const peerYDoc = new Y.Doc()
    Y.applyUpdate(peerYDoc, Y.encodeStateAsUpdate(editor.doc.doc))
    const peer = new SharedDOMDoc(undefined, undefined, [], [], {
      root: peerDocument.body, ydoc: peerYDoc, user: {name: "Grace Hopper"},
    })
    try {
      document.body.append(document.createElement("hr"))
      editor.doc.flushDOMChanges()
      if(checkpointed) {
        peerYDoc.getArray("version-history").push([{
          id: "shared-checkpoint", timestamp: Date.now(), label: "Edited by Ada Lovelace",
          user: {clientId: editor.doc.awareness.clientID, name: "Ada Lovelace", initials: "AL", color: "#e11d48"},
          changes: {added: 1, removed: 0, modified: 0}, source: editor.toHTML(false, false),
        }])
        Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(peerYDoc, Y.encodeStateVector(editor.doc.doc)))
      }
      ;(peerDocument.querySelector("p")!.firstChild as Text).appendData(" from Grace")
      peer.flushDOMChanges()
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(peerYDoc, Y.encodeStateVector(editor.doc.doc)))
      const state = history.actions.getVersionHistory({type: "getVersionHistory"})
      expect(state.checkpoints[0].user.name.split(", ").sort())
        .toEqual(checkpointed ? ["Grace Hopper"] : ["Ada Lovelace", "Grace Hopper"])
      expect(state.versions[0].user).toEqual(state.checkpoints[0].user)
      expect(state.currentUserId).not.toBe(state.checkpoints[0].user.clientId)
    }
    finally { peer.destroy() }
  })

  it("groups changes under distinct saves and keeps later edits in the unsaved version", async () => {
    const history = editor.features.history
    const initial = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    document.querySelector("p")!.textContent = "First change"
    await mutationsDelivered()
    const first = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    startNewCheckpointWindow()
    document.body.append(document.createElement("custom-widget"))
    await mutationsDelivered()
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    expect(snapshot.source).toContain("First change")
    document.querySelector("p")!.textContent = "While saving"
    await mutationsDelivered()
    const later = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    const saved = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId})
    expect(saved.versions).toHaveLength(2)
    expect(saved.versions[0]).toMatchObject({isUnsaved: true, checkpointIds: [later]})
    expect(saved.versions[1]).toMatchObject({isUnsaved: false, checkpointIds: [snapshot.checkpointId, first, initial]})
    const versionId = saved.versions[1].id
    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: versionId})
    expect(document.body.textContent).toBe("First change")
    expect(document.querySelector("custom-widget")).not.toBeNull()
    history.clearPreview()
    expect(document.body.textContent).toBe("While saving")

    const next = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const latest = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: next.checkpointId})
    expect(latest.versions).toHaveLength(2)
    expect(latest.versions[0]).toMatchObject({isUnsaved: false, checkpointIds: [later], isCurrent: true})
    const repeated = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: next.checkpointId})
    expect(repeated.versions).toHaveLength(3)
    expect(repeated.versions[0].checkpointIds).toEqual([])
    expect(repeated.versions[0].id).not.toBe(latest.versions[0].id)

    const restored = history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: versionId})
    expect(document.body.textContent).toBe("First change")
    expect(restored.versions[0].isUnsaved).toBe(true)
    expect(restored.versions[0].checkpointIds).toEqual([restored.checkpoints[0].id])
    history.actions.undo({type: "undo"})
    expect(document.body.textContent).toBe("While saving")
    history.actions.redo({type: "redo"})
    expect(document.body.textContent).toBe("First change")
  })

  it.each([false, true])("recovers unsaved edits after restoring a saved version (preview: %s)", async preview => {
    const history = editor.features.history
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const savedId = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId}).versions[0].id
    document.body.innerHTML = '<section><p>Unsaved</p><!--note--><custom-widget state="ready"></custom-widget></section>'
    document.head.innerHTML = "<title>Unsaved title</title>"
    document.documentElement.lang = "de"
    await mutationsDelivered()
    const edited = history.actions.getVersionHistory({type: "getVersionHistory"})
    const unsaved = edited.versions[0]
    const source = editor.toHTML(false, false)

    if(preview) history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: savedId})
    const restored = history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: savedId})
    expect(document.body.innerHTML).toBe("<p>Hello</p>")
    expect(restored.versions[0]).toMatchObject({id: unsaved.id, changes: unsaved.changes, isCurrent: false})
    expect(restored.versions[0].checkpointIds[0]).toBe(unsaved.checkpointIds[0])

    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: unsaved.id})
    expect(editor.toHTML(false, false)).toBe(source)
    history.clearPreview()
    expect(editor.toHTML(true, false)).toBe("<p>Hello</p>")
    const reapplied = history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: unsaved.id})
    expect(editor.toHTML(false, false)).toBe(source)
    expect(reapplied.versions[0]).toMatchObject({changes: unsaved.changes, isCurrent: true})
    const widget = document.querySelector("custom-widget")
    const repeated = history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: unsaved.id})
    expect(repeated.checkpoints).toHaveLength(reapplied.checkpoints.length)
    expect(document.querySelector("custom-widget")).toBe(widget)
    history.actions.undo({type: "undo"})
    expect(editor.toHTML(true, false)).toBe("<p>Hello</p>")
    history.actions.redo({type: "redo"})
    expect(editor.toHTML(false, false)).toBe(source)
  })

  it("retains unsaved recovery in shared history and advances it for new edits and saves", async () => {
    let history = editor.features.history
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const savedId = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId}).versions[0].id
    // Restore before MutationObserver delivery: the current edits still need a checkpoint.
    document.querySelector("p")!.textContent = "Pending edit"
    history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: savedId})
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
      editor.destroy()
      editor = new DOMEditor({initialState: {update: Array.from(Y.encodeStateAsUpdate(remote))}})
      history = editor.features.history
      const resumed = history.actions.getVersionHistory({type: "getVersionHistory"})
      expect(resumed.versions[0].isCurrent).toBe(false)
      history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: resumed.versions[0].id})
      expect(document.body.textContent).toBe("Pending edit")

      document.querySelector("p")!.textContent = "New edit"
      const changed = history.actions.getVersionHistory({type: "getVersionHistory"})
      expect(changed.versions[0]).toMatchObject({isCurrent: true, checkpointIds: expect.arrayContaining([changed.checkpoints[0].id])})
      history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: savedId})
      history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: savedId})
      history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: changed.versions[0].id})
      expect(document.body.textContent).toBe("New edit")

      const next = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
      const saved = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: next.checkpointId})
      expect(saved.versions).toHaveLength(2)
      expect(saved.versions[0]).toMatchObject({isUnsaved: false, isCurrent: true})
      expect(saved.checkpoints[0]).not.toHaveProperty("restoredFrom")
      expect(saved.versions[0]).not.toHaveProperty("restoredFrom")
    }
    finally { remote.destroy() }
  })

  it("keeps the previewed unsaved source when a collaborator publishes another checkpoint", async () => {
    const history = editor.features.history
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const savedId = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId}).versions[0].id
    document.querySelector("p")!.textContent = "Unsaved"
    history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: savedId})
    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: "unsaved"})
    const remote = new Y.Doc()
    try {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
      const checkpoints = remote.getArray<any>("version-history")
      const previous = checkpoints.toArray().at(-1)!
      remote.transact(() => {
        const text = (sharedDOMBody(remote).get(0) as Y.XmlElement).get(0) as Y.XmlText
        text.delete(0, text.length)
        text.insert(0, "Remote")
        checkpoints.push([{...previous, id: "remote-checkpoint", restoredFrom: undefined,
          source: previous.source.replace("Hello", "Remote")}])
      })
      Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client")
      expect(document.body.textContent).toBe("Unsaved")
      history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: "unsaved"})
      expect(document.body.textContent).toBe("Unsaved")
      expect(history.state().preview).toBeNull()
    }
    finally { remote.destroy() }
  })

  it("keeps every selected entry in editing mode and rolls back direct DOM and widget mutations", async () => {
    const history = editor.features.history
    document.body.innerHTML = '<section><p>Hello</p><!--note--><custom-widget state="ready"></custom-widget><template><b>Template</b></template></section>'
    await mutationsDelivered()
    const checkpointId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId})
    expect(history.state().preview).toMatchObject({checkpointId, isCurrent: true})
    expect(document.designMode).toBe("on")
    const section = document.querySelector("section")!
    const paragraph = document.querySelector("p")!
    const widget = document.querySelector("custom-widget")!
    const template = document.querySelector("template")!
    const source = editor.toHTML(false, false)
    const runtimeStyle = document.createElement("style")
    runtimeStyle.classList.add("◆editor-only")
    document.head.append(runtimeStyle)
    paragraph.firstChild!.nodeValue = "Blocked"
    paragraph.replaceWith(document.createElement("aside"))
    section.prepend(widget)
    widget.setAttribute("state", "changed")
    section.append(document.createTextNode("extra"))
    template.content.querySelector("b")!.textContent = "Blocked template"
    document.documentElement.lang = "de"
    document.head.append(document.createElement("title"))
    await vi.waitFor(() => expect(editor.toHTML(false, false)).toBe(source))
    expect(runtimeStyle.isConnected).toBe(true)
    expect(document.querySelector("p")).toBe(paragraph)
    expect(document.querySelector("custom-widget")).toBe(widget)
    expect(editor.doc.body.toString()).not.toContain("Blocked")
    history.clearPreview()
    expect(hasPresentationState(document.body, "editing-locked")).toBe(false)
    document.querySelector("p")!.textContent = "Editable again"
    await mutationsDelivered()
    expect(editor.doc.body.toString()).toContain("Editable again")
  })

  it("shares save boundaries and their change entries with remote collaborators", async () => {
    const history = editor.features.history
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const state = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId})
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
    expect(remote.getArray("version-history-saves").toArray()).toContainEqual(expect.objectContaining({
      id: state.versions[0].id, checkpointIds: [snapshot.checkpointId],
    }))
    expect(editor.toHTML()).not.toContain("version-history-saves")
    remote.destroy()
  })

  it("retains undo as a new change even when it returns to an earlier snapshot", async () => {
    const history = editor.features.history
    const initialId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    document.querySelector("p")!.textContent = "Later"
    await mutationsDelivered()
    history.actions.getVersionHistory({type: "getVersionHistory"})
    startNewCheckpointWindow()
    history.actions.undo({type: "undo"})
    expect(history.state().currentCheckpointId).toBe(initialId)
    const state = history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(state.checkpoints).toHaveLength(3)
    expect(state.checkpoints[0].id).not.toBe(initialId)
    expect(state.currentCheckpointId).toBe(state.checkpoints[0].id)
    expect(document.body.textContent).toBe("Hello")
  })

  it("preserves widget grouping instructions through preview, revert, undo, and redo", async () => {
    const history = editor.features.history
    document.body.innerHTML = '<data-widget id="grouped" shared="group"></data-widget><p>Hello</p>'
    writeWidgetGrouping(document.querySelector("data-widget")!, defaultGroupingRules("before"))
    await mutationsDelivered()
    const checkpointId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    startNewCheckpointWindow()
    writeWidgetGrouping(document.querySelector("data-widget")!, defaultGroupingRules("after"))
    await mutationsDelivered()
    history.actions.getVersionHistory({type: "getVersionHistory"})
    const seed = () => readWidgetGrouping(document.querySelector("data-widget")!)?.seed
    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId})
    expect(seed()).toBe("before")
    history.clearPreview()
    expect(seed()).toBe("after")
    history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId})
    expect(seed()).toBe("before")
    editor.doc.undo()
    expect(seed()).toBe("after")
    editor.doc.redo()
    expect(seed()).toBe("before")
  })

  it("defers document serialization until a checkpoint or state boundary during an edit burst", async () => {
    const history = editor.features.history
    history.actions.getVersionHistory({type: "getVersionHistory"})
    const serialize = vi.spyOn(editor, "toHTML")

    for(let index = 0; index < 8; index++) {
      document.querySelector("p")!.textContent = `Edit ${index}`
      await mutationsDelivered()
    }

    expect(serialize).not.toHaveBeenCalled()
    const state = history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(serialize).toHaveBeenCalled()
    expect(state.checkpoints).toHaveLength(2)
    expect(state.checkpoints[0]).not.toHaveProperty("source")
    expect(editor.toHTML()).toContain("Edit 7")
  })

  it("reuses one source snapshot when publishing a checkpoint", async () => {
    const history = editor.features.history
    history.actions.getVersionHistory({type: "getVersionHistory"})
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const serialize = vi.spyOn(editor, "toHTML")
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString")
    const publish = vi.spyOn(editor, "postHistoryState")

    try {
      document.querySelector("p")!.textContent = "Checkpointed"
      await mutationsDelivered()
      // The first edit of a run only reports that no entry is current any more.
      expect(publish).toHaveBeenCalledTimes(1)
      expect(serialize).not.toHaveBeenCalled()
      publish.mockClear()
      elapseCheckpointWindow()

      expect(serialize).toHaveBeenCalledTimes(1)
      expect(parse).toHaveBeenCalledTimes(2)
      expect(publish).toHaveBeenCalledTimes(1)
      expect(publish.mock.calls[0][0].checkpoints[0].changes.modified).toBeGreaterThan(0)
    }
    finally { vi.useRealTimers() }
  })

  it("refreshes the checkpoint publication snapshot after a nested authored DOM mutation", async () => {
    const history = editor.features.history
    history.actions.getVersionHistory({type: "getVersionHistory"})
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const serialize = vi.spyOn(editor, "toHTML")
    const publish = vi.spyOn(editor, "postHistoryState")
    const checkpoints = editor.doc.doc.getArray("version-history")
    const mutateDuringPublication = () => {
      checkpoints.unobserve(mutateDuringPublication)
      document.querySelector("p")!.textContent = "Nested edit"
    }
    checkpoints.observe(mutateDuringPublication)

    try {
      document.querySelector("p")!.textContent = "Checkpoint source"
      await mutationsDelivered()
      publish.mockClear()
      elapseCheckpointWindow()

      expect(serialize).toHaveBeenCalledTimes(2)
      expect(publish).toHaveBeenCalledTimes(1)
      expect(publish.mock.calls[0][0].versions[0].changes.modified).toBeGreaterThan(0)
    }
    finally {
      checkpoints.unobserve(mutateDuringPublication)
      vi.useRealTimers()
    }
  })

  it("publishes checkpoints with foreign elements named template", async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    const foreignTemplate = document.createElementNS(svg.namespaceURI, "template")
    foreignTemplate.textContent = "Before"
    svg.append(foreignTemplate)
    document.body.append(svg)
    await mutationsDelivered()
    // Happy DOM serializes every template name as HTML; isolate observation
    // from that emulation limitation while varying the checkpoint source.
    vi.spyOn(editor, "toHTML").mockImplementation(() => `<p>${foreignTemplate.textContent}</p>`)
    const history = editor.features.history
    const before = history.actions.getVersionHistory({type: "getVersionHistory"})
    startNewCheckpointWindow()
    foreignTemplate.textContent = "After"
    await mutationsDelivered()
    const after = history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(after.checkpoints).toHaveLength(before.checkpoints.length + 1)
    expect(after.checkpoints[0].changes.modified).toBeGreaterThan(0)
    expect(document.querySelector("svg template")).toBe(foreignTemplate)
    expect(editor.toHTML()).toContain("After")
  })

  it("skips HTML parsing when the pending diff has identical sources", () => {
    const history = editor.features.history
    history.actions.getVersionHistory({type: "getVersionHistory"})
    const serialize = vi.spyOn(editor, "toHTML")
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString")

    const state = history.state()

    expect(state.versions[0].changes).toEqual({added: 0, removed: 0, modified: 0})
    expect(serialize).toHaveBeenCalledTimes(1)
    expect(parse).not.toHaveBeenCalled()
  })

  it("yields large background checkpoint parsing and cancels stale work at an explicit history boundary", async () => {
    const history = editor.features.history
    document.body.innerHTML = `<p>Hello</p><aside>${"<p>Unchanged prose and context.</p>".repeat(3500)}</aside>`
    await mutationsDelivered()
    history.actions.getVersionHistory({type: "getVersionHistory"})
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const parse = vi.spyOn(DOMParser.prototype, "parseFromString").mockClear()
    const publish = vi.spyOn(editor, "postHistoryState")
    try {
      document.querySelector("p")!.textContent = "Captured edit"
      await mutationsDelivered()
      publish.mockClear()
      elapseCheckpointWindow()
      expect(parse).not.toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
      document.querySelector("p")!.textContent = "Latest edit"
      const state = history.actions.getVersionHistory({type: "getVersionHistory"})
      expect(state.checkpoints[0].changes).toEqual({added: 0, removed: 0, modified: 1})
      expect(publish).toHaveBeenCalledTimes(1)
      const checkpoints = state.checkpoints.length
      await vi.advanceTimersByTimeAsync(20)
      expect(history.state().checkpoints).toHaveLength(checkpoints)
      expect(publish).toHaveBeenCalledTimes(1)
    }
    finally { vi.useRealTimers() }
  }, 30_000)

  it("publishes the same changes after a large background checkpoint finishes and releases work on disable", async () => {
    const history = editor.features.history
    document.body.innerHTML = `<p>Hello</p><aside>${"<p>Unchanged prose and context.</p>".repeat(3500)}</aside>`
    await mutationsDelivered()
    const initial = history.actions.getVersionHistory({type: "getVersionHistory"})
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const publish = vi.spyOn(editor, "postHistoryState")
    const isEqualNode = vi.spyOn(Node.prototype, "isEqualNode").mockClear()
    try {
      document.querySelector("p")!.textContent = "Background edit"
      await mutationsDelivered()
      publish.mockClear()
      elapseCheckpointWindow()
      await vi.runAllTimersAsync()
      expect(publish).toHaveBeenCalledTimes(1)
      expect(publish.mock.calls[0][0].checkpoints).toHaveLength(initial.checkpoints.length + 1)
      expect(publish.mock.calls[0][0].checkpoints[0].changes).toEqual({added: 0, removed: 0, modified: 1})
      expect(isEqualNode.mock.contexts.some(node => node instanceof Element && node.localName === "aside")).toBe(false)
      document.querySelector("p")!.textContent = "Disabled edit"
      await mutationsDelivered()
      publish.mockClear()
      elapseCheckpointWindow()
      history.disable()
      await vi.runAllTimersAsync()
      expect(publish).not.toHaveBeenCalled()
    }
    finally { vi.useRealTimers() }
  }, 30_000)

  it("skips equal sibling subtrees when diffing a changed document", async () => {
    const history = editor.features.history
    const nested = Array.from({length: 30}, (_, index) => `<span data-index="${index}">Nested ${index}</span>`).join("")
    document.body.innerHTML = `<article>${nested}</article><p>Hello</p>`
    await mutationsDelivered()
    history.actions.getVersionHistory({type: "getVersionHistory"})
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const isEqualNode = vi.spyOn(Node.prototype, "isEqualNode")

    try {
      document.querySelector("p")!.textContent = "Changed"
      await mutationsDelivered()
      elapseCheckpointWindow()

      expect(isEqualNode.mock.calls.some(([other]) => other instanceof Element && other.localName === "article")).toBe(true)
      expect(history.state().checkpoints[0].changes).toEqual({added: 0, removed: 0, modified: 1})
    }
    finally { vi.useRealTimers() }
  })

  it("previews and restores document-level direction, classes and styles", async () => {
    const history = editor.features.history
    const initial = history.actions.getVersionHistory({type: "getVersionHistory"})
    document.documentElement.setAttribute("dir", "rtl")
    document.documentElement.classList.add("theme")
    document.documentElement.setAttribute("style", "color: red")
    await mutationsDelivered()
    const changed = history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(changed.checkpoints).toHaveLength(2)
    expect(changed.checkpoints[0].changes.modified).toBeGreaterThan(0)
    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: initial.checkpoints[0].id})
    expect(history.state().preview?.isCurrent).toBe(false)
    expect(document.documentElement.hasAttribute("dir")).toBe(false)
    expect(document.documentElement.classList.contains("theme")).toBe(false)
    expect(document.documentElement.hasAttribute("style")).toBe(false)
    history.clearPreview()
    expect(document.documentElement.getAttribute("dir")).toBe("rtl")
    expect(document.documentElement.classList.contains("theme")).toBe(true)
    expect(document.documentElement.getAttribute("style")).toBe("color: red")
    document.documentElement.removeAttribute("dir")
    document.documentElement.classList.remove("theme")
    document.documentElement.removeAttribute("style")
  })

  it("transiently applies a checkpoint and blocks local editing until the preview is cleared", async () => {
    const history = editor.features.history
    const initial = history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(initial.checkpoints).toHaveLength(1)

    document.querySelector("p")!.textContent = "Changed"
    document.head.innerHTML = "<title>Changed title</title>"
    document.documentElement.lang = "de"
    await mutationsDelivered()
    const changed = history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(changed.checkpoints).toHaveLength(2)
    expect(changed.checkpoints[0].changes.modified).toBeGreaterThan(0)

    const preview = history.actions.previewVersionCheckpoint({
      type: "previewVersionCheckpoint",
      checkpointId: initial.checkpoints[0].id,
    })
    expect(preview.preview).toMatchObject({
      checkpointId: initial.checkpoints[0].id,
      isCurrent: false,
    })
    expect(preview.preview!.modified).toBeGreaterThan(0)
    expect(document.body.innerHTML).toBe("<p>Hello</p>")
    expect(document.head.innerHTML).toBe("")
    expect(document.documentElement.hasAttribute("lang")).toBe(false)
    expect(editor.doc.body.toString()).toContain("Changed")
    const slot = Array.from(editor.appendix.children)
      .find(element => element.localName === "slot" && !element.hasAttribute("name")) as HTMLSlotElement
    expect(document.body.inert).toBe(false)
    expect(slot.inert).toBe(false)
    expect(document.body.contentEditable).toBe("inherit")
    expect(document.designMode).toBe("on")
    expect(hasPresentationState(document.body, "editing-locked")).toBe(true)
    const lockedAffordanceRule = editor.appendix.adoptedStyleSheets
      .flatMap(stylesheet => Array.from(stylesheet.cssRules))
      .find(rule => (rule as CSSStyleRule).selectorText ?.endsWith("> :not(slot):not(.◆ai-review-toolbar)")) as CSSStyleRule
    expect(lockedAffordanceRule.style.display).toBe("none")

    const beforeInput = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText"})
    document.querySelector("p")!.dispatchEvent(beforeInput)
    expect(beforeInput.defaultPrevented).toBe(true)

    let failure: CustomEvent | undefined
    window.addEventListener(executeFailureEvent, event => failure = event as CustomEvent, {once: true})
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: "undo",
        requestId: "history-preview-undo",
        bridgeNonce: editor.trustedScriptNonce,
      },
    }))
    expect(failure?.detail.error.message).toContain("Close the version preview")
    expect(document.body.innerHTML).toBe("<p>Hello</p>")

    const cleared = history.actions.clearVersionPreview({type: "clearVersionPreview"})
    expect(cleared.appliedQueuedChanges).toBe(false)
    expect(editor.toHTML(true)).toBe("<p>Changed</p>")
    expect(document.head.innerHTML).toBe("<title>Changed title</title>")
    expect(document.documentElement.lang).toBe("de")
    expect(document.body.inert).toBe(false)
    expect(slot.inert).toBe(false)
    expect(document.body.contentEditable).toBe("inherit")
    expect(document.designMode).toBe("on")
    expect(hasPresentationState(document.body, "editing-locked")).toBe(false)
  })

  it("switches between complete version renderings without adding editor wrappers", async () => {
    const history = editor.features.history
    const baselineId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    const section = document.createElement("section")
    section.innerHTML = "<custom-widget data-state='ready'><span>New</span></custom-widget><!--note-->"
    document.body.append(section)
    await mutationsDelivered()
    const latestId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id

    history.actions.previewVersionCheckpoint({
      type: "previewVersionCheckpoint",
      checkpointId: baselineId,
    })
    expect(document.body.innerHTML).toBe("<p>Hello</p>")

    const latest = history.actions.previewVersionCheckpoint({
      type: "previewVersionCheckpoint",
      checkpointId: latestId,
    })
    expect(latest.preview).toMatchObject({checkpointId: latestId, isCurrent: true})
    history.clearPreview()
    expect(latest.appliedQueuedChanges).toBe(false)
    expect(document.querySelector("custom-widget")).not.toBeNull()
    expect(document.querySelector("custom-widget")?.getAttribute("data-state")).toBe("ready")
    expect(document.querySelector("section")?.lastChild).toBeInstanceOf(Comment)
    expect(document.body.querySelectorAll("[data-webwriter-history]")).toHaveLength(0)
    expect(document.body.inert).toBe(false)
    expect(document.body.contentEditable).toBe("inherit")
    expect(document.designMode).toBe("on")
    expect(document.querySelector("custom-widget")).not.toBeNull()
  })

  it("restores body, head, and language as one undoable collaborative change", async () => {
    const history = editor.features.history
    const baselineId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    document.querySelector("p")!.textContent = "Later"
    document.body.append(document.createElement("aside"))
    document.head.innerHTML = "<title>Later title</title><meta name='author' content='Ada'>"
    document.documentElement.lang = "de"
    await mutationsDelivered()
    const beforeRestore = history.actions.getVersionHistory({type: "getVersionHistory"})
    const laterId = beforeRestore.checkpoints[0].id

    history.actions.previewVersionCheckpoint({
      type: "previewVersionCheckpoint",
      checkpointId: baselineId,
    })
    expect(document.body.innerHTML).toBe("<p>Hello</p>")

    const restored = history.actions.revertVersionCheckpoint({
      type: "revertVersionCheckpoint",
      checkpointId: baselineId,
    })
    expect(document.body.innerHTML).toBe("<p>Hello</p>")
    expect(document.head.innerHTML).toBe("")
    expect(document.documentElement.hasAttribute("lang")).toBe(false)
    expect(editor.doc.body.toString()).toContain("<p>Hello</p>")
    expect(restored.checkpoints).toHaveLength(beforeRestore.checkpoints.length + 1)
    expect(restored.checkpoints.slice(1).map(checkpoint => checkpoint.id)).toEqual(
      beforeRestore.checkpoints.map(checkpoint => checkpoint.id),
    )
    expect(restored.checkpoints[0].label).toBe("Restored Document created")
    expect(restored.currentCheckpointId).toBe(restored.checkpoints[0].id)
    expect(restored.preview).toBeNull()
    expect(restored.currentUserId).toBe(editor.doc.awareness.clientID)
    expect(document.body.inert).toBe(false)
    expect(document.body.contentEditable).toBe("inherit")

    history.actions.undo({type: "undo"})
    expect(document.body.textContent).toContain("Later")
    expect(document.querySelector("aside")).not.toBeNull()
    expect(history.state().currentCheckpointId).toBe(laterId)
  })

  it("queues remote document changes while a version is applied and renders them when it closes", async () => {
    const history = editor.features.history
    const baselineId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    document.querySelector("p")!.textContent = "Current"
    await mutationsDelivered()
    const currentId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id

    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
    const editorVector = Y.encodeStateVector(editor.doc.doc)

    history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: baselineId})
    const remoteParagraph = sharedDOMBody(remote).firstChild as Y.XmlElement
    const remoteText = remoteParagraph.firstChild as Y.XmlText
    remote.transact(() => {
      remoteText.delete(0, remoteText.length)
      remoteText.insert(0, "Remote")
    }, "remote-edit")
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, editorVector), "remote-client")

    expect(editor.doc.body.toString()).toContain("Remote")
    expect(document.body.innerHTML).toBe("<p>Hello</p>")
    const resumed = history.actions.clearVersionPreview({type: "clearVersionPreview"})
    expect(resumed.appliedQueuedChanges).toBe(true)
    expect(resumed.preview).toBeNull()
    expect(resumed.checkpoints[0]).toMatchObject({label: "Collaborative changes", user: {name: "Unknown author"}})
    expect(editor.toHTML(true)).toBe("<p>Remote</p>")
    expect(document.body.inert).toBe(false)
    remote.destroy()
  })

  it("stores checkpoint comments in Yjs so remote collaborators receive them", () => {
    const history = editor.features.history
    const checkpointId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    const commented = history.actions.addVersionComment({
      type: "addVersionComment",
      checkpointId,
      text: "Looks ready to publish.",
    })
    expect(commented.comments[0]).toMatchObject({checkpointId, text: "Looks ready to publish."})
    expect(commented.checkpoints[0].commentCount).toBe(1)

    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
    const remoteComments = remote.getArray<VersionHistoryState["comments"][number]>("version-history-comments")
    expect(remoteComments.toArray()[0]).toMatchObject({
      checkpointId,
      text: "Looks ready to publish.",
    })
    remote.destroy()
  })

  it("accepts comments added by another Yjs client and keeps history data out of authored HTML", () => {
    const history = editor.features.history
    const checkpointId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
    const editorVector = Y.encodeStateVector(editor.doc.doc)
    remote.getArray("version-history-comments").push([{
      id: "remote-comment",
      checkpointId,
      timestamp: 1,
      text: "Remote review",
      user: {clientId: remote.clientID, name: "Grace", initials: "GR", color: "#2563eb"},
    }])
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, editorVector), "remote-client")

    expect(history.state().comments).toContainEqual(expect.objectContaining({
      id: "remote-comment",
      text: "Remote review",
    }))
    expect(editor.toHTML()).not.toContain("version-history")
    remote.destroy()
  })

  it("records checkpoints without the runtime assets added to detached copies", async () => {
    const assets = vi.spyOn(editor.features.dependency, "appendSerializedAssets")
    document.querySelector("p")!.textContent = "Changed"
    await mutationsDelivered()
    const state = editor.features.history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(state.checkpoints).toHaveLength(2)
    expect(assets).not.toHaveBeenCalled()
  })
})

describe("automatic checkpoint retention", () => {
  const stored = () => editor.doc.doc.getArray<any>("version-history").toArray()
  const storedIds = () => stored().map(checkpoint => checkpoint.id as string)
  const storedHTML = (checkpoint: any): string => typeof checkpoint.source === "string" ? checkpoint.source : checkpoint.source.html
  const flush = () => editor.features.history.actions.getVersionHistory({type: "getVersionHistory"})
  const largeBody = `<p>Hello</p><aside>${`<p>${"Unchanged prose and context. ".repeat(120)}</p>`.repeat(40)}</aside>`

  /** Edits the first paragraph and lets the checkpoint debounce elapse. */
  async function pause(text: string) {
    document.querySelector("p")!.textContent = text
    await mutationsDelivered()
    vi.advanceTimersByTime(700)
  }

  function remoteReplica() {
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
    const checkpoints = remote.getArray<any>("version-history")
    return {
      remote,
      checkpoints,
      remove: (id: string) => checkpoints.delete(checkpoints.toArray().findIndex(checkpoint => checkpoint.id === id)),
      send: () => Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(editor.doc.doc)), "remote-client"),
    }
  }

  it("replaces one author's automatic checkpoint at state boundaries in a window and appends after it", () => {
    const history = editor.features.history
    const edit = (text: string) => {
      document.querySelector("p")!.textContent = text
      return flush()
    }
    const start = Date.now()
    setClock(start)
    edit("First boundary")
    expect(stored()).toHaveLength(2)
    const first = stored()[1].id
    setClock(start + 60_000)
    edit("Second boundary")
    setClock(start + checkpointCoalescingWindow - 1)
    edit("Third boundary")

    const coalesced = stored()
    expect(coalesced).toHaveLength(2)
    expect(coalesced[1].id).not.toBe(first)
    expect(storedHTML(coalesced[1])).toContain("Third boundary")
    expect(JSON.stringify(coalesced)).not.toContain("Second boundary")
    // Changes are counted from the checkpoint before the replaced one.
    expect(coalesced[1]).toMatchObject({
      startedAt: start, timestamp: start + checkpointCoalescingWindow - 1, changes: {added: 0, removed: 0, modified: 1},
    })
    const state = history.state()
    expect(state.currentCheckpointId).toBe(coalesced[1].id)
    expect(state.checkpoints[0]).not.toHaveProperty("startedAt")
    expect(state.versions[0]).toMatchObject({isUnsaved: true, isCurrent: true, checkpointIds: [coalesced[1].id, coalesced[0].id]})

    // The window starts with the first checkpoint of the run, so a long
    // session without longer breaks still gets one entry per window.
    setClock(start + checkpointCoalescingWindow)
    edit("Fourth boundary")
    expect(storedIds()).toEqual([coalesced[0].id, coalesced[1].id, history.state().currentCheckpointId])
    expect(stored()[2]).not.toHaveProperty("startedAt")
    expect(storedHTML(stored()[2])).toContain("Fourth boundary")
  })

  it("keeps the encoded shared state bounded across state boundaries in a window", async () => {
    document.body.innerHTML = `<p>Hello</p><aside>${`<p>${"Unchanged prose and context. ".repeat(12)}</p>`.repeat(60)}</aside>`
    await mutationsDelivered()
    flush()
    expect(editor.doc.doc.gc).toBe(true)
    const checkpoints = stored().length
    const snapshot = storedHTML(stored().at(-1)).length
    const size = Y.encodeStateAsUpdate(editor.doc.doc).byteLength
    expect(size).toBeGreaterThan(snapshot)
    for(let index = 1; index <= 12; index++) {
      document.querySelector("p")!.textContent = `Boundary ${index}`
      flush()
    }
    expect(stored()).toHaveLength(checkpoints)
    expect(storedHTML(stored().at(-1))).toContain("Boundary 12")
    // Twelve appended snapshots would add twelve times the document.
    expect(Y.encodeStateAsUpdate(editor.doc.doc).byteLength).toBeLessThan(size + snapshot / 4)
  })

  it("prunes the oldest automatic checkpoints beyond the cap but keeps referenced, labelled, and current ones", async () => {
    const history = editor.features.history
    const edit = (text: string) => {
      startNewCheckpointWindow()
      document.querySelector("p")!.textContent = text
      return flush().checkpoints[0].id
    }
    const created = storedIds()[0]
    const saved = edit("Saved")
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    expect(snapshot.checkpointId).toBe(saved)
    history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: saved})
    const commented = edit("Commented")
    history.actions.addVersionComment({type: "addVersionComment", checkpointId: commented, text: "Keep this one"})
    const restoredFrom = edit("Restored from")
    const automatic = [edit("Edit 0")]
    const restored = history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: restoredFrom}).checkpoints[0].id
    const kept = [created, saved, commented, restoredFrom, restored]
    while(automatic.length < maxAutomaticCheckpoints) automatic.push(edit(`Edit ${automatic.length}`))
    expect([...storedIds()].sort()).toEqual([...kept, ...automatic].sort())

    const overflow = edit("Overflow")
    expect([...storedIds()].sort()).toEqual([...kept, ...automatic.slice(1), overflow].sort())

    // The document returns to an old automatic checkpoint, which is then the
    // current one. The next oldest is pruned in its place.
    document.querySelector("p")!.textContent = "Edit 1"
    await mutationsDelivered()
    expect(history.state().currentCheckpointId).toBe(automatic[1])
    startNewCheckpointWindow()
    const latest = flush().checkpoints[0].id
    expect([...storedIds()].sort()).toEqual([...kept, automatic[1], ...automatic.slice(3), overflow, latest].sort())
    expect(flush().versions.at(-1)!.checkpointIds).toEqual([saved, created])
  })

  it("previews and restores a coalesced checkpoint, and undoes and redoes the restore", () => {
    const history = editor.features.history
    document.querySelector("p")!.textContent = "Draft one"
    flush()
    document.querySelector("p")!.textContent = "Draft two"
    const coalesced = flush().checkpoints[0].id
    expect(stored()).toHaveLength(2)
    startNewCheckpointWindow()
    document.querySelector("p")!.textContent = "Later"
    expect(flush().checkpoints).toHaveLength(3)

    const preview = history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: coalesced})
    expect(preview.preview).toMatchObject({checkpointId: coalesced, isCurrent: false})
    expect(document.body.textContent).toBe("Draft two")
    history.actions.clearVersionPreview({type: "clearVersionPreview"})
    expect(document.body.textContent).toBe("Later")

    const restored = history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: coalesced})
    expect(document.body.textContent).toBe("Draft two")
    expect(restored.checkpoints[0].label).toMatch(/^Restored Edited by /)
    expect(restored.currentCheckpointId).toBe(restored.checkpoints[0].id)
    history.actions.undo({type: "undo"})
    expect(document.body.textContent).toBe("Later")
    history.actions.redo({type: "redo"})
    expect(document.body.textContent).toBe("Draft two")
    expect(storedIds()).toContain(coalesced)
  })

  it("recovers when a collaborator removes the local current checkpoint", () => {
    const history = editor.features.history
    document.querySelector("p")!.textContent = "Local"
    const current = flush().currentCheckpointId!
    expect(storedIds().at(-1)).toBe(current)
    const publish = vi.spyOn(editor, "postHistoryState")
    const {remote, remove, send} = remoteReplica()
    try {
      remove(current)
      send()
      const state = publish.mock.lastCall![0]
      expect(state.checkpoints.map(checkpoint => checkpoint.id)).toEqual([storedIds()[0]])
      expect(state.currentCheckpointId).toBe(storedIds()[0])
      expect(state.versions[0]).toMatchObject({isUnsaved: true, isCurrent: true})
      expect(history.state().currentCheckpointId).toBe(storedIds()[0])

      document.querySelector("p")!.textContent = "Local again"
      const next = flush()
      expect(next.checkpoints).toHaveLength(2)
      expect(next.currentCheckpointId).toBe(next.checkpoints[0].id)
    }
    finally { remote.destroy() }
  })

  it("converges when two replicas replace the same checkpoint concurrently", () => {
    const history = editor.features.history
    document.querySelector("p")!.textContent = "Shared"
    const shared = flush().currentCheckpointId!
    const {remote, checkpoints, remove, send} = remoteReplica()
    try {
      const previous = checkpoints.toArray().at(-1)
      remote.transact(() => {
        remove(shared)
        checkpoints.push([{...previous, id: "remote-replacement", source: previous.source.replace("Shared", "Remote")}])
      })
      document.querySelector("p")!.textContent = "Local"
      const local = flush().currentCheckpointId!
      expect(storedIds()).toEqual([storedIds()[0], local])
      const localUpdate = Y.encodeStateAsUpdate(editor.doc.doc, Y.encodeStateVector(remote))
      send()
      Y.applyUpdate(remote, localUpdate)

      expect(storedIds()).toEqual(checkpoints.toArray().map(checkpoint => checkpoint.id))
      expect([...storedIds()].sort()).toEqual([storedIds()[0], local, "remote-replacement"].sort())
      expect(storedIds()).not.toContain(shared)
      expect(history.state().currentCheckpointId).toBe(local)
    }
    finally { remote.destroy() }
  })

  it("keeps a previewed checkpoint restorable after a collaborator removes it", async () => {
    const history = editor.features.history
    document.querySelector("p")!.textContent = "Previewed"
    const previewed = flush().currentCheckpointId!
    startNewCheckpointWindow()
    document.querySelector("p")!.textContent = "Current"
    flush()
    const {remote, remove, send} = remoteReplica()
    try {
      history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: previewed})
      remove(previewed)
      send()
      expect(storedIds()).not.toContain(previewed)
      expect(history.state().preview).toMatchObject({checkpointId: previewed, isCurrent: false})
      expect(document.body.textContent).toBe("Previewed")
      document.querySelector("p")!.textContent = "Blocked"
      await vi.waitFor(() => expect(document.body.textContent).toBe("Previewed"))

      const restored = history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: previewed})
      expect(document.body.textContent).toBe("Previewed")
      expect(restored.preview).toBeNull()
      expect(restored.checkpoints[0].label).toMatch(/^Restored Edited by /)
      expect(() => history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: previewed}))
        .toThrow("no longer available")
    }
    finally { remote.destroy() }
  })

  it("records a prepared save after a collaborator removes its checkpoint", async () => {
    const history = editor.features.history
    document.querySelector("p")!.textContent = "Saved text"
    const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
    const {remote, remove, send} = remoteReplica()
    try {
      remove(snapshot.checkpointId)
      send()
      expect(storedIds()).not.toContain(snapshot.checkpointId)
      const saved = history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId})
      expect(saved.versions).toHaveLength(1)
      expect(saved.versions[0]).toMatchObject({label: "Saved version", isUnsaved: false, isCurrent: true, checkpointIds: [storedIds()[0]]})
      expect(editor.doc.doc.getArray<any>("version-history-saves").toArray()[0]).not.toHaveProperty("startedAt")
      expect(() => history.actions.recordVersionSave({type: "recordVersionSave", checkpointId: snapshot.checkpointId}))
        .toThrow("no longer available")
    }
    finally { remote.destroy() }
  })

  it("serializes a large document once for a due checkpoint while it stays unchanged during background work", async () => {
    document.body.innerHTML = largeBody
    await mutationsDelivered()
    flush()
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const serialize = vi.spyOn(editor, "toHTML")
    try {
      document.querySelector("p")!.textContent = "Background edit"
      await mutationsDelivered()
      const publish = vi.spyOn(editor, "postHistoryState")
      elapseCheckpointWindow()
      expect(publish).not.toHaveBeenCalled()
      await vi.runAllTimersAsync()
      expect(publish).toHaveBeenCalledTimes(1)
      expect(serialize).toHaveBeenCalledTimes(1)
      expect(storedHTML(stored().at(-1))).toContain("Background edit")
      expect(publish.mock.calls[0][0].checkpoints[0].changes).toEqual({added: 0, removed: 0, modified: 1})
    }
    finally { vi.useRealTimers() }
  })

  it("serializes again instead of publishing a stale snapshot after a DOM edit without a collaboration notification", async () => {
    document.body.innerHTML = largeBody
    await mutationsDelivered()
    flush()
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    const serialize = vi.spyOn(editor, "toHTML")
    try {
      document.querySelector("p")!.textContent = "Captured edit"
      await mutationsDelivered()
      elapseCheckpointWindow()
      const checkpoints = stored().length
      editor.doc.stopObserve()
      document.querySelector("p")!.textContent = "Unobserved edit"
      await vi.runAllTimersAsync()
      // The capture, its failed verification, and the repeated capture.
      expect(serialize).toHaveBeenCalledTimes(3)
      expect(stored()).toHaveLength(checkpoints + 1)
      expect(stored().some(checkpoint => storedHTML(checkpoint).includes("Captured edit"))).toBe(false)
      expect(storedHTML(stored().at(-1))).toContain("Unobserved edit")
    }
    finally {
      editor.doc.startObserve()
      vi.useRealTimers()
    }
  })

  describe("deferred recording", () => {
    const historyUpdates: unknown[] = []
    const countHistoryUpdate = (_update: Uint8Array, origin: any) => {
      if(origin?.source === "domeditor-version-history") historyUpdates.push(origin)
    }

    beforeEach(() => {
      flush()
      historyUpdates.length = 0
      editor.doc.doc.on("update", countHistoryUpdate)
      vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "Date"]})
    })

    afterEach(() => {
      vi.useRealTimers()
      editor.doc.doc.off("update", countHistoryUpdate)
    })

    it("records nothing during pauses in a window and one checkpoint with the latest source at its end", async () => {
      const serialize = vi.spyOn(editor, "toHTML")
      const publish = vi.spyOn(editor, "postHistoryState")
      const start = Date.now()
      await pause("Pause 1")
      const size = Y.encodeStateAsUpdate(editor.doc.doc).byteLength
      for(let index = 2; index <= 5; index++) {
        vi.advanceTimersByTime(60_000 - 700)
        await pause(`Pause ${index}`)
      }
      expect(Date.now()).toBe(start + 4 * 60_000 + 700)
      expect(stored()).toHaveLength(1)
      expect(serialize).not.toHaveBeenCalled()
      expect(historyUpdates).toHaveLength(0)
      // Only the typed text reached the shared document.
      expect(Y.encodeStateAsUpdate(editor.doc.doc).byteLength - size).toBeLessThan(200)
      // The host learned once, without a serialization, that no entry is current.
      expect(publish).toHaveBeenCalledTimes(1)
      expect(publish.mock.calls[0][0].currentCheckpointId).toBeNull()
      expect(publish.mock.calls[0][0].versions.map(version => version.isCurrent))
        .toEqual(publish.mock.calls[0][0].versions.map(version => version.isUnsaved))

      vi.advanceTimersByTime(start + checkpointCoalescingWindow - 1 - Date.now())
      expect(stored()).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(stored()).toHaveLength(2)
      expect(storedHTML(stored()[1])).toContain("Pause 5")
      expect(stored()[1]).toMatchObject({
        timestamp: start + checkpointCoalescingWindow, changes: {added: 0, removed: 0, modified: 1},
      })
      expect(serialize).toHaveBeenCalledTimes(1)
      expect(historyUpdates).toHaveLength(1)
      expect(publish).toHaveBeenCalledTimes(2)
      expect(publish.mock.lastCall![0].currentCheckpointId).toBe(stored()[1].id)
      expect(publish.mock.lastCall![0].versions[0]).toMatchObject({isUnsaved: true, isCurrent: true})

      // The next run is recorded as a further entry at the end of its own window.
      await pause("Pause 6")
      await pause("Pause 7")
      expect(stored()).toHaveLength(2)
      expect(serialize).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(checkpointCoalescingWindow)
      expect(storedIds().slice(0, 2)).toEqual(publish.mock.calls[1][0].checkpoints.map(checkpoint => checkpoint.id).reverse())
      expect(stored()).toHaveLength(3)
      expect(storedHTML(stored()[2])).toContain("Pause 7")
      expect(serialize).toHaveBeenCalledTimes(2)
      expect(historyUpdates).toHaveLength(2)
    })

    it("waits for the debounce when the window ends during typing", async () => {
      document.querySelector("p")!.textContent = "Early"
      await mutationsDelivered()
      vi.advanceTimersByTime(checkpointCoalescingWindow - 100)
      document.querySelector("p")!.textContent = "Late"
      await mutationsDelivered()
      vi.advanceTimersByTime(699)
      expect(stored()).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(stored()).toHaveLength(2)
      expect(storedHTML(stored()[1])).toContain("Late")
    })

    it("reports the current entry again when a run ends where it started", async () => {
      const publish = vi.spyOn(editor, "postHistoryState")
      await pause("Changed")
      await pause("Hello")
      expect(publish.mock.lastCall![0].currentCheckpointId).toBeNull()
      vi.advanceTimersByTime(checkpointCoalescingWindow)
      expect(stored()).toHaveLength(1)
      expect(historyUpdates).toHaveLength(0)
      expect(publish).toHaveBeenCalledTimes(2)
      expect(publish.mock.lastCall![0].currentCheckpointId).toBe(storedIds()[0])
    })

    it("records immediately at every state boundary and when the page is hidden", async () => {
      const history = editor.features.history
      const created = storedIds()[0]
      const edit = async (text: string) => {
        document.querySelector("p")!.textContent = text
        await mutationsDelivered()
        expect(JSON.stringify(stored())).not.toContain(text)
      }
      const newest = () => storedHTML(stored().at(-1))

      await edit("History read")
      flush()
      expect(newest()).toContain("History read")

      await edit("Save prepared")
      const snapshot = await history.actions.prepareVersionSave({type: "prepareVersionSave"})
      expect(newest()).toContain("Save prepared")
      expect(stored().at(-1).id).toBe(snapshot.checkpointId)

      await edit("Commented")
      history.actions.addVersionComment({type: "addVersionComment", checkpointId: created, text: "Before the comment"})
      expect(newest()).toContain("Commented")

      await edit("Previewed")
      history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: created})
      expect(newest()).toContain("Previewed")
      history.actions.clearVersionPreview({type: "clearVersionPreview"})

      await edit("Restored over")
      history.actions.revertVersionCheckpoint({type: "revertVersionCheckpoint", checkpointId: created})
      expect(storedHTML(stored().at(-2))).toContain("Restored over")
      expect(stored().at(-1).label).toBe("Restored Document created")

      await edit("Tab hidden")
      document.dispatchEvent(new Event("visibilitychange"))
      expect(JSON.stringify(stored())).not.toContain("Tab hidden")
      Object.defineProperty(document, "visibilityState", {configurable: true, get: () => "hidden"})
      try { document.dispatchEvent(new Event("visibilitychange")) }
      finally { delete (document as any).visibilityState }
      expect(newest()).toContain("Tab hidden")

      await edit("Page closed")
      window.dispatchEvent(new Event("pagehide"))
      expect(newest()).toContain("Page closed")

      // Nothing is left to record afterwards.
      const checkpoints = stored().length
      const serialize = vi.spyOn(editor, "toHTML")
      vi.advanceTimersByTime(2 * checkpointCoalescingWindow)
      expect(stored()).toHaveLength(checkpoints)
      expect(serialize).not.toHaveBeenCalled()
    })

    it("clears the pending checkpoint when the feature is disabled", async () => {
      const history = editor.features.history
      const serialize = vi.spyOn(editor, "toHTML")
      await pause("Abandoned")
      const timers = vi.getTimerCount()
      history.disable()
      expect(vi.getTimerCount()).toBe(timers - 1)
      window.dispatchEvent(new Event("pagehide"))
      vi.advanceTimersByTime(2 * checkpointCoalescingWindow)
      expect(stored()).toHaveLength(1)
      expect(serialize).not.toHaveBeenCalled()
    })

    it("keeps a collaborator's checkpoint that arrives while a local run is pending", async () => {
      await pause("Local run")
      const {remote, checkpoints, send} = remoteReplica()
      try {
        checkpoints.push([{
          id: "remote-checkpoint", timestamp: Date.now(), label: "Edited by Grace Hopper",
          user: {clientId: remote.clientID, name: "Grace Hopper", initials: "GH", color: "#2563eb"},
          changes: {added: 0, removed: 0, modified: 1}, source: stored()[0].source.replace("Hello", "Remote"),
        }])
        send()
        expect(storedIds()).toEqual([storedIds()[0], "remote-checkpoint"])
        vi.advanceTimersByTime(checkpointCoalescingWindow)
        expect(stored()).toHaveLength(3)
        expect(storedIds()[1]).toBe("remote-checkpoint")
        expect(storedHTML(stored()[2])).toContain("Local run")
        expect(stored()[2].user.clientId).toBe(editor.doc.awareness.clientID)

        // A state boundary replaces only this author's own entry.
        document.querySelector("p")!.textContent = "Local again"
        flush()
        expect(stored()).toHaveLength(3)
        expect(storedIds()[1]).toBe("remote-checkpoint")
        expect(storedHTML(stored()[2])).toContain("Local again")
      }
      finally { remote.destroy() }
    })
  })
})
