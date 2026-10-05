// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
import {executeFailureEvent, type VersionHistoryState} from "../editor-bridge"
import {defaultGroupingRules} from "../widget-grouping.js"
import {readWidgetGrouping, writeWidgetGrouping} from "../widget-grouping-dom"

let editor: DOMEditor

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
  editor.destroy()
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.documentElement.removeAttribute("lang")
})

describe("collaborative version history", () => {
  it("groups changes under distinct saves and keeps later edits in the unsaved version", async () => {
    const history = editor.features.history
    const initial = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    document.querySelector("p")!.textContent = "First change"
    await mutationsDelivered()
    const first = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
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
    expect(document.body).not.toHaveClass("◆editing-locked")
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
    expect(document.body).toHaveClass("◆editing-locked")
    const lockedAffordanceRule = editor.appendix.adoptedStyleSheets
      .flatMap(stylesheet => Array.from(stylesheet.cssRules))
      .find(rule => (rule as CSSStyleRule).selectorText === ":host(.◆editing-locked) > :not(slot):not(.◆ai-review-toolbar)") as CSSStyleRule
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
    expect(document.body).not.toHaveClass("◆editing-locked")
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
