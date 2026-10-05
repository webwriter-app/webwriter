// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {WebWriterPackageRegistry} from "../packages"
import {DomEditor} from "./dom-editor"
import {proofreadingStateChangeEvent, isProofreadingStateChangeMessage} from "../editor-bridge"
import type {DomEditorToolbox} from "./toolbox"

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it.each(["Spelling", "Grammar"])("starts local proofreading from the %s ribbon action", async label => {
  const editor = new DomEditor()
  const execute = vi.spyOn(editor, "execute").mockResolvedValue({enabled: true})
  document.body.append(editor)
  await editor.updateComplete
  editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("ribbon-button-click", {
    detail: {label}, bubbles: true, composed: true,
  }))
  expect(execute).toHaveBeenCalledWith({type: "checkProofreading", kind: label === "Spelling" ? "spelling" : "grammar"})
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
      data: {type: proofreadingStateChangeEvent, bridgeNonce, detail: {enabled: true, loading: false, ready: !error, error}},
    }))
  }
  const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
  relay("Wrong sender", nonce, window)
  relay("Wrong nonce", "untrusted")
  await editor.updateComplete
  expect(toolbox.proofreadingError).toBe("")
  relay("WASM unavailable")
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.proofreadingError).toBe("WASM unavailable")
  expect(toolbox.shadowRoot!.querySelector('button[data-tool="Review"] .proofreading-error-badge')).not.toBeNull()
  relay(null)
  await editor.updateComplete
  await toolbox.updateComplete
  expect(toolbox.proofreadingError).toBe("")
  expect(toolbox.shadowRoot!.querySelector(".proofreading-error-badge")).toBeNull()
})

it("rejects malformed proofreading bridge state", () => {
  const message = {type: proofreadingStateChangeEvent, detail: {enabled: true, loading: false, ready: false, error: null}}
  expect(isProofreadingStateChangeMessage(message)).toBe(true)
  for(const detail of [{...message.detail, loading: 1}, {...message.detail, ready: "yes"}, {...message.detail, enabled: null}, {...message.detail, error: {}}, null]) {
    expect(isProofreadingStateChangeMessage({...message, detail})).toBe(false)
  }
})
