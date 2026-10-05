// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {WebWriterPackageRegistry} from "../packages"
import {DomEditor} from "./dom-editor"
import {proofreadingStateChangeEvent, proofreadingDictionaryAddEvent, isProofreadingStateChangeMessage, emptyProofreadingState, type ProofreadingAction, type ProofreadingState} from "../editor-bridge"
import {APP_SETTINGS_STORAGE_KEY, defaultAppSettings, loadAppSettings, persistAppSettings} from "../app-settings"
import type {DomEditorToolbox} from "./toolbox"

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
})

it.each<ProofreadingAction>([
  {type: "retryProofreading"},
  {type: "selectProofreadingIssue", id: "issue-1"},
  {type: "applyProofreadingSuggestion", id: "issue-1", index: 1},
  {type: "ignoreProofreadingIssue", id: "issue-1"},
  {type: "addProofreadingWord", id: "issue-1"},
  {type: "setDocumentProofreadingEnabled", enabled: false},
  {type: "setDocumentProofreadingEnabled", enabled: true},
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
  for(const detail of [null, {type: "other"}, {type: "selectProofreadingIssue", id: 1}, {type: "applyProofreadingSuggestion", id: "1", index: -1},
    {type: "setDocumentProofreadingEnabled", enabled: "false"}]) send(detail)
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
  const add = toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".proofreading-add-word")!
  const action = vi.fn()
  toolbox.addEventListener("proofreading-action", action)
  add.click()
  expect(action.mock.calls.at(-1)![0].detail).toEqual({type: "addProofreadingWord", id: "1"})
  relay([{...issue, kind: "grammar"}])
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-add-word")).toBeNull()
  relay([])
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).toBeNull()
})

it("keeps cards through a package reload, loading and checking, then replaces them together", async () => {
  const editor = new DomEditor()
  const execute = vi.spyOn(editor, "execute").mockResolvedValue({update: []})
  const host = editor as unknown as {reloadEditor(packages: []): Promise<void>, waitForEditorWindow(): Promise<Window>}
  vi.spyOn(host, "waitForEditorWindow").mockResolvedValue(window)
  Object.assign(editor, {frameStarted: true})
  document.body.append(editor)
  await editor.updateComplete
  const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
  toolbox.selectTool("Review")
  const issue: ProofreadingState["issues"][number] = {id: "old", start: 0, end: 3, text: "teh", kind: "spelling",
    message: "Check this spelling", suggestions: [{kind: "replace", text: "the"}]}
  const relay = (state: Partial<ProofreadingState>) => window.dispatchEvent(new MessageEvent("message", {
    source: editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe")!.contentWindow, origin: window.location.origin,
    data: {type: proofreadingStateChangeEvent, bridgeNonce: (editor as unknown as {bridgeNonce: string}).bridgeNonce,
      detail: {...emptyProofreadingState(), ...state}},
  }))
  relay({ready: true, issues: [issue]})
  await editor.updateComplete
  await toolbox.updateComplete
  const card = toolbox.shadowRoot!.querySelector(".proofreading-card")
  await host.reloadEditor([])
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).toBe(card)
  for(const state of [{loading: true}, {ready: true, checking: true}, {error: "WASM unavailable"}]) {
    relay(state)
    await editor.updateComplete
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).toBe(card)
    expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".proofreading-suggestion")!.disabled).toBe(true)
  }
  execute.mockClear()
  toolbox.dispatchEvent(new CustomEvent("proofreading-action", {detail: {type: "addProofreadingWord", id: "old"}, bubbles: true, composed: true}))
  expect(execute).not.toHaveBeenCalled()
  const replacement = {...issue, id: "new", text: "recieve", end: 7}
  relay({ready: true, checking: true, issues: [replacement]})
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).toBe(card)
  relay({ready: true, issues: [replacement]})
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).not.toBe(card)
  expect(toolbox.shadowRoot!.querySelector(".proofreading-issue")?.textContent).toContain("recieve")
  expect(toolbox.shadowRoot!.querySelector<HTMLButtonElement>(".proofreading-suggestion")!.disabled).toBe(false)
  relay({ready: true, issues: []})
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.shadowRoot!.querySelector(".proofreading-card")).toBeNull()
})

it("persists authenticated dictionary additions and sends settings removals to the checker", async () => {
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe")!
  const nonce = (editor as unknown as {bridgeNonce: string}).bridgeNonce
  const add = (word: unknown, bridgeNonce = nonce, source: MessageEventSource | null = iframe.contentWindow) => {
    window.dispatchEvent(new MessageEvent("message", {source, origin: window.location.origin,
      data: {type: proofreadingDictionaryAddEvent, bridgeNonce, word}}))
  }
  for(const word of [null, "", "two words"]) add(word)
  add("forged", "wrong")
  add("forged", nonce, window)
  expect(loadAppSettings().proofreadingDictionary).toEqual([])
  add("WebWriter")
  add("webwriter")
  expect(loadAppSettings().proofreadingDictionary).toEqual(["WebWriter"])
  expect(execute).toHaveBeenCalledWith({type: "setProofreadingDictionary", words: ["WebWriter"]})
  editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
    detail: {...loadAppSettings(), proofreadingDictionary: []}, bubbles: true, composed: true,
  }))
  expect(execute).toHaveBeenLastCalledWith({type: "setProofreadingDictionary", words: []})
})

it("provides saved dictionary words when initializing the editor frame", async () => {
  persistAppSettings({...defaultAppSettings(), proofreadingDictionary: ["WebWriter"]})
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  const host = editor as unknown as {postToEditor(message: unknown): void, initializeEditorFrame(frame: HTMLIFrameElement): void}
  const post = vi.spyOn(host, "postToEditor").mockImplementation(() => {})
  document.body.append(editor)
  await editor.updateComplete
  host.initializeEditorFrame(editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe")!)
  expect(post).toHaveBeenCalledWith(expect.objectContaining({type: "initialize-editor", proofreadingDictionary: ["WebWriter"]}))
})

it("initializes new frames with the global preference and retains it during reload", async () => {
  persistAppSettings({...defaultAppSettings(), disableSpellChecking: true})
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  const host = editor as unknown as {postToEditor(message: unknown): void, initializeEditorFrame(frame: HTMLIFrameElement): void,
    retainProofreadingDuringReload(): void, proofreadingState: ProofreadingState}
  const post = vi.spyOn(host, "postToEditor").mockImplementation(() => {})
  document.body.append(editor)
  await editor.updateComplete
  host.initializeEditorFrame(editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe")!)
  expect(post).toHaveBeenCalledWith(expect.objectContaining({type: "initialize-editor", disableSpellChecking: true}))
  host.retainProofreadingDuringReload()
  expect(host.proofreadingState).toMatchObject({loading: false, checking: false})
  expect(editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!.disableSpellChecking).toBe(true)
})

it("applies global changes immediately and rejects stale enabled state without changing the document preference", async () => {
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true, proofreadingState: {...emptyProofreadingState(), documentEnabled: false, enabled: false}})
  const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
  document.body.append(editor)
  await editor.updateComplete
  const change = (disableSpellChecking: boolean) => editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("app-settings-change", {
    detail: {...defaultAppSettings(), disableSpellChecking}, bubbles: true, composed: true,
  }))
  change(true)
  expect(execute).toHaveBeenCalledWith({type: "setProofreadingEnabled", enabled: false})
  const iframe = editor.shadowRoot!.querySelector<HTMLIFrameElement>("iframe")!
  window.dispatchEvent(new MessageEvent("message", {source: iframe.contentWindow, origin: window.location.origin,
    data: {type: proofreadingStateChangeEvent, bridgeNonce: (editor as unknown as {bridgeNonce: string}).bridgeNonce,
      detail: {...emptyProofreadingState(), documentEnabled: false, checking: true, error: "stale error"}}}))
  await editor.updateComplete
  const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
  expect(toolbox.proofreadingState).toMatchObject({enabled: false, documentEnabled: false, checking: false, error: null, issues: []})
  change(false)
  expect(execute).toHaveBeenLastCalledWith({type: "setProofreadingEnabled", enabled: true})
  await editor.updateComplete
  expect(toolbox.proofreadingState.documentEnabled).toBe(false)
})

it("allows disabling the current document while proofreading reloads", async () => {
  const editor = new DomEditor()
  Object.assign(editor, {proofreadingReloading: true})
  const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
  document.body.append(editor)
  await editor.updateComplete
  editor.shadowRoot!.querySelector("dom-editor-toolbox")!.dispatchEvent(new CustomEvent("proofreading-action", {
    detail: {type: "setDocumentProofreadingEnabled", enabled: false}, bubbles: true, composed: true,
  }))
  expect(execute).toHaveBeenCalledWith({type: "setDocumentProofreadingEnabled", enabled: false})
})
