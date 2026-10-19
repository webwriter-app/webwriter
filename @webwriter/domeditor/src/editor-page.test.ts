// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
  discoverHostBackend: vi.fn(),
  probeDevelopmentBackend: vi.fn(),
  editorFrameOrigin: vi.fn(() => "https://editor.test"),
}))
vi.mock("./backend-client", () => mocks)
vi.mock("./frame-origins", () => ({editorFrameOrigin: mocks.editorFrameOrigin}))
vi.mock("./components/dom-editor", () => ({}))

const locationState = vi.hoisted(() => ({href: "https://app.test/", replace: vi.fn()}))

describe("editor page startup", () => {
  beforeEach(() => {
    vi.stubGlobal("location", locationState)
    locationState.replace.mockClear()
    locationState.href = "https://app.test/"
    document.body.replaceChildren()
    mocks.discoverHostBackend.mockReset()
    mocks.probeDevelopmentBackend.mockReset()
  })
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it("redirects live learners without mounting the editor and uses a discovery timeout", async () => {
    locationState.href = "https://app.test/?liveSession=room&liveToken=abc&open=ignored"
    mocks.discoverHostBackend.mockResolvedValue({collaborationUrl: "wss://collab.test"})
    const {startEditorPage} = await import("./editor-page")
    await startEditorPage()
    expect(locationState.replace).toHaveBeenCalledWith(expect.stringContaining("/live/?liveSession=room&liveToken=abc&liveServer=wss%3A%2F%2Fcollab.test"))
    expect(mocks.discoverHostBackend).toHaveBeenCalledWith(expect.objectContaining({aborted: false}))
    const signal = mocks.discoverHostBackend.mock.calls[0][0]
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
    expect(document.querySelector("dom-editor")).toBeNull()
    expect(mocks.probeDevelopmentBackend).not.toHaveBeenCalled()
  })

  it("uses an explicit endpoint without discovery", async () => {
    locationState.href = "https://app.test/?liveSession=room&liveToken=abc&liveServer=wss%3A%2F%2Fexplicit.test"
    const {startEditorPage} = await import("./editor-page")
    await startEditorPage()
    expect(locationState.replace).toHaveBeenCalledWith(expect.stringContaining("liveServer=wss%3A%2F%2Fexplicit.test"))
    expect(mocks.discoverHostBackend).not.toHaveBeenCalled()
    expect(mocks.probeDevelopmentBackend).not.toHaveBeenCalled()
  })

  it("shows an accessible error without mounting the editor when discovery fails", async () => {
    locationState.href = "https://app.test/?liveSession=room&liveToken=abc"
    mocks.discoverHostBackend.mockResolvedValue(null)
    mocks.probeDevelopmentBackend.mockResolvedValue(null)
    const {startEditorPage} = await import("./editor-page")
    await startEditorPage()
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/collaboration server/)
    expect(mocks.probeDevelopmentBackend).toHaveBeenCalledWith(mocks.discoverHostBackend.mock.calls[0][0])
    expect(document.querySelector("dom-editor")).toBeNull()
  })

  it("loads the editor for ordinary pages", async () => {
    const {startEditorPage} = await import("./editor-page")
    await startEditorPage()
    expect(document.querySelector("dom-editor")).not.toBeNull()
  })
})
