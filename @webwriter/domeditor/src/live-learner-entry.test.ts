// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const mocks = vi.hoisted(() => ({
  LiveSession: vi.fn(function(this: object, options: unknown) {Object.assign(this, {options})}),
  liveSessionLearnerIdentity: vi.fn(() => ({id: "ada", name: "Ada", color: "#f00"})),
  connectLiveLearner: vi.fn(),
}))
vi.mock("./live-session", () => mocks)
vi.mock("./live-learner", () => ({connectLiveLearner: mocks.connectLiveLearner}))

const locationState = vi.hoisted(() => ({href: "https://editor.test/live/"}))

describe("standalone live learner entry", () => {
  beforeEach(() => {
    vi.stubGlobal("location", locationState)
    locationState.href = "https://editor.test/live/"
    document.body.replaceChildren()
    sessionStorage.clear()
    mocks.LiveSession.mockClear()
    mocks.liveSessionLearnerIdentity.mockClear()
    mocks.connectLiveLearner.mockClear()
  })
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.clear()
    document.body.replaceChildren()
  })

  it("validates and connects a well-formed learner URL", async () => {
    locationState.href = "https://editor.test/live/?liveSession=lesson-1&liveToken=abcdefghijklmnopqrstuvwxyz123456&liveServer=wss%3A%2F%2Fcollab.test"
    const {startLiveLearner} = await import("./live-learner-entry")
    startLiveLearner()
    expect(mocks.LiveSession).toHaveBeenCalledWith(expect.objectContaining({
      id: "lesson-1", role: "learner", serverUrl: "wss://collab.test/",
      token: "abcdefghijklmnopqrstuvwxyz123456", learner: expect.any(Object),
    }))
    expect(mocks.connectLiveLearner).toHaveBeenCalledOnce()
    expect(document.querySelector("dom-editor")).toBeNull()
  })

  it.each([
    ["bad token", "liveSession=lesson&liveToken=short&liveServer=wss%3A%2F%2Fcollab.test"],
    ["bad protocol", "liveSession=lesson&liveToken=abcdefghijklmnopqrstuvwxyz123456&liveServer=https%3A%2F%2Fcollab.test"],
    ["URL credentials", "liveSession=lesson&liveToken=abcdefghijklmnopqrstuvwxyz123456&liveServer=wss%3A%2F%2Fuser%3Apass%40collab.test"],
    ["missing endpoint", "liveSession=lesson&liveToken=abcdefghijklmnopqrstuvwxyz123456"],
  ])("does not connect or mount an editor for %s", async (_label, query) => {
    locationState.href = `https://editor.test/live/?${query}`
    const {startLiveLearner} = await import("./live-learner-entry")
    startLiveLearner()
    expect(mocks.LiveSession).not.toHaveBeenCalled()
    expect(mocks.connectLiveLearner).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(document.querySelector("dom-editor")).toBeNull()
  })

  it("shows a constructor error without connecting or mounting an editor", async () => {
    locationState.href = "https://editor.test/live/?liveSession=lesson&liveToken=abcdefghijklmnopqrstuvwxyz123456&liveServer=wss%3A%2F%2Fcollab.test"
    mocks.LiveSession.mockImplementationOnce(function() {throw new Error("Session construction failed")})
    const {startLiveLearner} = await import("./live-learner-entry")
    startLiveLearner()
    expect(mocks.LiveSession).toHaveBeenCalledOnce()
    expect(mocks.connectLiveLearner).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Session construction failed")
    expect(document.querySelector("dom-editor")).toBeNull()
  })
})
