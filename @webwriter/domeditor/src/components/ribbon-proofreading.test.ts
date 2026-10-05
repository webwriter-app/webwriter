// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {WebWriterPackageRegistry} from "../packages"
import {DomEditor} from "./dom-editor"
import {proofreadingStateChangeEvent, isProofreadingStateChangeMessage, emptyProofreadingState, type ProofreadingAction} from "../editor-bridge"
import type {DomEditorToolbox} from "./toolbox"

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it.each<ProofreadingAction>([
  {type: "retryProofreading"},
  {type: "selectProofreadingIssue", id: "issue-1"},
  {type: "applyProofreadingSuggestion", id: "issue-1", index: 1},
  {type: "ignoreProofreadingIssue", id: "issue-1"},
])("routes Review card action $type to the editor", async action => {
  const editor = new DomEditor()
  const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
  const focus = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
  document.body.append(editor)
  await editor.updateComplete
  editor.shadowRoot!.querySelector("dom-editor-toolbox")!.dispatchEvent(new CustomEvent("proofreading-action", {
    detail: action, bubbles: true, composed: true,
  }))
  expect(execute).toHaveBeenCalledWith(action)
  await Promise.resolve()
  expect(focus).toHaveBeenCalledTimes(action.type === "selectProofreadingIssue" || action.type === "applyProofreadingSuggestion" ? 1 : 0)
})

it("rejects malformed and locked Review card actions", async () => {
  const editor = new DomEditor()
  const execute = vi.spyOn(editor, "execute").mockResolvedValue(false)
  document.body.append(editor)
  await editor.updateComplete
  const toolbox = editor.shadowRoot!.querySelector("dom-editor-toolbox")!
  const send = (detail: unknown) => toolbox.dispatchEvent(new CustomEvent("proofreading-action", {detail, bubbles: true, composed: true}))
  for(const detail of [null, {type: "other"}, {type: "selectProofreadingIssue", id: 1}, {type: "applyProofreadingSuggestion", id: "1", index: -1}]) send(detail)
  Object.assign(editor, {htmlPending: true})
  send({type: "applyProofreadingSuggestion", id: "1", index: 0})
  expect(execute).not.toHaveBeenCalled()
})

it("relays authenticated checker failures to Review and clears them after a successful retry", async () => {
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe")!
  const nonce = (editor as unknown as {bridgeNonce: string}).bridgeNonce
  const relay = (error: string | null, bridgeNonce = nonce, source: MessageEventSource | null = iframe.contentWindow) => {
    window.dispatchEvent(new MessageEvent("message", {
      source, origin: window.location.origin,
      data: {type: proofreadingStateChangeEvent, bridgeNonce, detail: {...emptyProofreadingState(), ready: !error, error}},
    }))
  }
  const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
  relay("Wrong sender", nonce, window)
  relay("Wrong nonce", "untrusted")
  await editor.updateComplete
  expect(toolbox.proofreadingState.error).toBeNull()
  relay("WASM unavailable")
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.proofreadingState.error).toBe("WASM unavailable")
  expect(toolbox.shadowRoot!.querySelector('button[data-tool="Review"] .proofreading-error-badge')).not.toBeNull()
  relay(null)
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.proofreadingState.error).toBeNull()
  expect(toolbox.shadowRoot!.querySelector(".proofreading-error-badge")).toBeNull()
})

it("rejects malformed proofreading bridge state", () => {
  const message = {type: proofreadingStateChangeEvent, detail: emptyProofreadingState()}
  expect(isProofreadingStateChangeMessage(message)).toBe(true)
  for(const detail of [{...message.detail, loading: 1}, {...message.detail, ready: "yes"}, {...message.detail, enabled: null}, {...message.detail, error: {}}, {...message.detail, checking: 1}, {...message.detail, hoveredIssueId: 1}, {...message.detail, issues: [{id: "1"}]}, null]) {
    expect(isProofreadingStateChangeMessage({...message, detail})).toBe(false)
  }
})

it("relays cards and their invalidation over the authenticated bridge", async () => {
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe")!
  const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
  toolbox.selectTool("Review")
  const issue = {id: "1", start: 0, end: 3, text: "teh", kind: "spelling", message: "Check this spelling", suggestions: [{kind: "replace", text: "the"}]}
  const relay = (issues: unknown[]) => window.dispatchEvent(new MessageEvent("message", {
    source: iframe.contentWindow, origin: window.location.origin,
    data: {type: proofreadingStateChangeEvent, bridgeNonce: (editor as unknown as {bridgeNonce: string}).bridgeNonce,
      detail: {...emptyProofreadingState(), ready: true, issues}},
  }))
  relay([issue])
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-issue")?.textContent).toContain("teh")
  expect(toolbox.shadowRoot!.querySelector(".proofreading-suggestion")?.textContent).toContain("the")
  relay([])
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).toBeNull()
})
