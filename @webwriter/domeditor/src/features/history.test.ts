// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import "@testing-library/jest-dom/vitest"
import * as Y from "yjs"
import {DOMEditor} from "../domeditor"
import type {VersionHistoryState} from "../editor-bridge"

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
  it("captures authored checkpoints and previews live changes with temporary marker classes", async () => {
    const history = editor.features.history
    const initial = history.actions.getVersionHistory({type: "getVersionHistory"})
    expect(initial.checkpoints).toHaveLength(1)

    document.querySelector("p")!.textContent = "Changed"
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
    expect(document.querySelector("p")).toHaveClass("◆history-modified")
    expect(editor.toHTML()).not.toContain("◆history-")
    expect(editor.doc.body.toString()).not.toContain("◆history-")

    history.actions.clearVersionPreview({type: "clearVersionPreview"})
    expect(document.querySelector("[class*='◆history-']")).toBeNull()
  })

  it("highlights inserted and removed structure without adding editor wrappers", async () => {
    const history = editor.features.history
    const baselineId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    const section = document.createElement("section")
    section.innerHTML = "<custom-widget><span>New</span></custom-widget>"
    document.body.append(section)
    await mutationsDelivered()

    const preview = history.actions.previewVersionCheckpoint({
      type: "previewVersionCheckpoint",
      checkpointId: baselineId,
    })
    expect(preview.preview!.added).toBeGreaterThan(0)
    expect(section).toHaveClass("◆history-added")
    expect(document.querySelector("custom-widget")).not.toBeNull()
    expect(document.body.querySelectorAll("[data-webwriter-history]")).toHaveLength(0)
  })

  it("restores body, head, and language as one undoable collaborative change", async () => {
    const history = editor.features.history
    const baselineId = history.actions.getVersionHistory({type: "getVersionHistory"}).checkpoints[0].id
    document.querySelector("p")!.textContent = "Later"
    document.body.append(document.createElement("aside"))
    document.head.innerHTML = "<title>Later title</title><meta name='author' content='Ada'>"
    document.documentElement.lang = "de"
    await mutationsDelivered()
    history.actions.getVersionHistory({type: "getVersionHistory"})

    const restored = history.actions.revertVersionCheckpoint({
      type: "revertVersionCheckpoint",
      checkpointId: baselineId,
    })
    expect(document.body.innerHTML).toBe("<p>Hello</p>")
    expect(document.head.innerHTML).toBe("")
    expect(document.documentElement.hasAttribute("lang")).toBe(false)
    expect(editor.doc.body.toString()).toContain("<p>Hello</p>")
    expect(restored.checkpoints[0].label).toContain("Restored")
    expect(restored.preview?.isCurrent).toBe(true)

    history.actions.undo({type: "undo"})
    expect(document.body.textContent).toContain("Later")
    expect(document.querySelector("aside")).not.toBeNull()
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
