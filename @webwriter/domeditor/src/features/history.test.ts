// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import {executeFailureEvent, type VersionHistoryState} from "../editor-bridge"

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
    expect(document.body.inert).toBe(true)
    expect(document.body.contentEditable).toBe("false")
    expect(document.designMode).toBe("off")
    expect(document.body).toHaveClass("◆editing-locked")
    const lockedAffordanceRule = editor.appendix.adoptedStyleSheets
      .flatMap(stylesheet => Array.from(stylesheet.cssRules))
      .find(rule => (rule as CSSStyleRule).selectorText === ":host(.◆editing-locked) > :not(slot)") as CSSStyleRule
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
    expect(document.body.contentEditable).toBe("true")
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
    expect(latest.preview).toBeNull()
    expect(latest.appliedQueuedChanges).toBe(false)
    expect(document.querySelector("custom-widget")).not.toBeNull()
    expect(document.querySelector("custom-widget")?.getAttribute("data-state")).toBe("ready")
    expect(document.querySelector("section")?.lastChild).toBeInstanceOf(Comment)
    expect(document.body.querySelectorAll("[data-webwriter-history]")).toHaveLength(0)
    expect(document.body.inert).toBe(false)
    expect(document.body.contentEditable).toBe("true")
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
    expect(restored.checkpoints).toHaveLength(beforeRestore.checkpoints.length)
    expect(restored.checkpoints.map(checkpoint => checkpoint.id)).toEqual(
      beforeRestore.checkpoints.map(checkpoint => checkpoint.id),
    )
    expect(restored.checkpoints.every(checkpoint => !checkpoint.label.startsWith("Restored "))).toBe(true)
    expect(restored.currentCheckpointId).toBe(baselineId)
    expect(restored.preview).toBeNull()
    expect(restored.currentUserId).toBe(editor.doc.awareness.clientID)
    expect(document.body.inert).toBe(false)
    expect(document.body.contentEditable).toBe("true")

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
    const remoteParagraph = remote.getXmlElement("body").firstChild as Y.XmlElement
    const remoteText = remoteParagraph.firstChild as Y.XmlText
    remote.transact(() => {
      remoteText.delete(0, remoteText.length)
      remoteText.insert(0, "Remote")
    }, "remote-edit")
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote, editorVector), "remote-client")

    expect(editor.doc.body.toString()).toContain("Remote")
    expect(document.body.innerHTML).toBe("<p>Hello</p>")
    const resumed = history.actions.previewVersionCheckpoint({type: "previewVersionCheckpoint", checkpointId: currentId})
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
})
