// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"

const loadEditor = vi.hoisted(() => vi.fn())

beforeEach(() => {
  vi.resetModules()
  loadEditor.mockReset().mockResolvedValue({})
  vi.doMock("./components/dom-editor", () => loadEditor())
  vi.spyOn(document, "addEventListener")
  vi.spyOn(window, "addEventListener")
  document.body.innerHTML = '<a href="/packages/">Widgets</a><a href="/editor/"><span>Open WebWriter</span></a><a href="https://elsewhere.test/editor/">External editor</a>'
})

afterEach(() => {
  for(const target of [document, window]) {
    for(const [type, listener, options] of vi.mocked(target.addEventListener).mock.calls) {
      target.removeEventListener(type, listener, options)
    }
  }
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it("loads the lazy editor UI once on hover without navigating or mounting it", async () => {
  await import("./site-entry")
  expect(loadEditor).not.toHaveBeenCalled()
  for(const link of document.querySelectorAll('a:not([href="/editor/"])')) {
    link.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
    link.dispatchEvent(new FocusEvent("focusin", {bubbles: true}))
  }
  expect(loadEditor).not.toHaveBeenCalled()

  const link = document.querySelector<HTMLAnchorElement>('a[href="/editor/"]')!
  const event = new PointerEvent("pointerover", {bubbles: true, cancelable: true})
  link.firstElementChild!.dispatchEvent(event)
  await vi.dynamicImportSettled()
  expect(loadEditor).toHaveBeenCalledOnce()
  link.dispatchEvent(new PointerEvent("pointerover", {bubbles: true}))
  link.dispatchEvent(new FocusEvent("focusin", {bubbles: true}))
  await vi.dynamicImportSettled()
  expect(loadEditor).toHaveBeenCalledOnce()
  expect(document.querySelector("dom-editor")).toBeNull()
  expect(link.getAttribute("href")).toBe("/editor/")
  expect(event.defaultPrevented).toBe(false)
})

it("also warms the editor on keyboard focus", async () => {
  await import("./site-entry")
  document.querySelector('a[href="/editor/"]')!.dispatchEvent(new FocusEvent("focusin", {bubbles: true}))
  await vi.dynamicImportSettled()
  expect(loadEditor).toHaveBeenCalledOnce()
  expect(document.querySelector("dom-editor")).toBeNull()
})

it("handles a failed speculative import without blocking the editor link", async () => {
  loadEditor.mockRejectedValue(new Error("Network unavailable"))
  await import("./site-entry")
  const link = document.querySelector('a[href="/editor/"]')!
  const event = new PointerEvent("pointerover", {bubbles: true, cancelable: true})
  link.dispatchEvent(event)
  await vi.dynamicImportSettled()
  expect(loadEditor).toHaveBeenCalledOnce()
  expect(event.defaultPrevented).toBe(false)
  expect(link.getAttribute("href")).toBe("/editor/")
})
