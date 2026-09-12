// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {LivePreview, previewElementAtPath} from "./live-preview"

const previews: LivePreview[] = []
afterEach(() => {
  previews.forEach(preview => preview.disconnect())
  previews.length = 0
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const mount = () => {
  const frame = document.createElement("iframe")
  document.body.append(frame)
  const owner = frame.contentDocument!
  owner.body.innerHTML = "<demo-widget></demo-widget>text"
  const preview = new LivePreview()
  previews.push(preview)
  return {frame, owner, preview}
}

describe("live preview lifecycle", () => {
  it("resolves widget paths across iframe realms and rejects text/missing targets", () => {
    const {owner} = mount()
    const widget = owner.body.firstElementChild
    vi.stubGlobal("Element", class ForeignElement {})
    expect(previewElementAtPath([0], owner)).toBe(widget)
    expect(previewElementAtPath([1], owner)).toBeNull()
    expect(previewElementAtPath([2], owner)).toBeNull()
  })

  it("keeps learner widget identifiers stable when siblings are inserted", () => {
    const {frame, owner, preview} = mount()
    preview.observeLearner(frame, owner, vi.fn())
    owner.body.prepend(owner.createElement("p"))
    expect(preview.captureWidgetStates(owner)[0]?.path).toEqual([0])
  })

  it("replaces host listeners and releases snapshots when disconnected", () => {
    const {frame, owner, preview} = mount()
    const oldUpdate = vi.fn()
    const update = vi.fn()
    preview.observeHost(frame, owner, oldUpdate)
    preview.observeHost(frame, owner, update)
    frame.contentWindow!.dispatchEvent(new Event("resize"))
    expect(oldUpdate).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(2)
    expect(preview.baseWidgetStates.size).toBe(1)
    preview.disconnect()
    frame.contentWindow!.dispatchEvent(new Event("resize"))
    expect(update).toHaveBeenCalledTimes(2)
    expect(preview.baseWidgetStates.size).toBe(0)
  })

  it("cancels deferred learner events and ignores mutations from an old binding", async () => {
    vi.useFakeTimers()
    const {frame, owner, preview} = mount()
    const callbacks: MutationCallback[] = []
    class Observer {
      constructor(callback: MutationCallback) { callbacks.push(callback) }
      observe() {}
      disconnect() {}
    }
    Object.defineProperty(frame.contentWindow, "MutationObserver", {value: Observer, configurable: true})
    const oldPublish = vi.fn()
    const publish = vi.fn()
    preview.observeLearner(frame, owner, oldPublish)
    owner.dispatchEvent(new Event("scroll"))
    callbacks[0]([{target: owner.body} as unknown as MutationRecord], {} as MutationObserver)
    preview.observeLearner(frame, owner, publish)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100)
    expect(oldPublish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
    preview.disconnect()
    owner.dispatchEvent(new Event("input"))
    expect(publish).toHaveBeenCalledTimes(1)
  })
})
