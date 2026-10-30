// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
vi.mock("virtual:app-version", () => ({default: "installed-version"}))
import {AppUpdateNotice} from "./app-update-notice"

let notice: AppUpdateNotice
let anchor: HTMLButtonElement
let fetcher: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetcher = vi.fn().mockResolvedValue(Response.json({version: "installed-version"}))
  vi.stubGlobal("fetch", fetcher)
  vi.spyOn(document, "hidden", "get").mockReturnValue(false)
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
  anchor = document.createElement("button")
  document.body.append(anchor)
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({left: 16, top: 8, bottom: 40, width: 32, height: 32, right: 48} as DOMRect)
  notice = new AppUpdateNotice()
  notice.anchor = () => anchor
  vi.spyOn(notice, "getBoundingClientRect").mockReturnValue({width: 352, height: 140} as DOMRect)
})

afterEach(() => {
  notice.remove()
  anchor.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function flush() {
  await vi.advanceTimersByTimeAsync(0)
  await notice.updateComplete
}

async function mount(version = "installed-version") {
  fetcher.mockResolvedValue(Response.json({version}))
  document.body.append(notice)
  await flush()
}

it("checks an uncached build marker and stays hidden for the running version", async () => {
  await mount()
  expect(fetcher.mock.calls[0][0].pathname).toBe("/version.json")
  expect(fetcher.mock.calls[0][1]).toMatchObject({cache: "no-store", credentials: "same-origin", redirect: "error"})
  expect(notice.hidden).toBe(true)
  expect(notice.shadowRoot!.querySelector("section")).toBeNull()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it("shows a closable speech bubble at the icon without reloading or moving focus", async () => {
  const reload = vi.spyOn(location, "reload").mockImplementation(() => {})
  anchor.focus()
  await mount("new-version")
  expect(notice.hidden).toBe(false)
  expect(notice.style.left).toBe("16px")
  expect(notice.style.top).toBe("52px")
  expect(notice.dataset.placement).toBe("below")
  expect(notice.shadowRoot!.querySelector('[role="status"]')!.textContent).toContain("Save your work")
  expect(document.activeElement).toBe(anchor)
  expect(reload).not.toHaveBeenCalled()

  const close = notice.shadowRoot!.querySelector<HTMLButtonElement>(".close")!
  close.focus()
  close.click()
  await notice.updateComplete
  expect(notice.hidden).toBe(true)
  expect(document.activeElement).toBe(anchor)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(notice.hidden).toBe(true)
  fetcher.mockResolvedValue(Response.json({version: "another-version"}))
  window.dispatchEvent(new Event("focus"))
  await flush()
  expect(notice.hidden).toBe(false)
  notice.shadowRoot!.querySelector<HTMLButtonElement>(".reload")!.click()
  expect(reload).toHaveBeenCalledOnce()
})

it("closes on Escape and clears a notice when the deployed version returns to the running build", async () => {
  await mount("new-version")
  notice.shadowRoot!.querySelector("section")!.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
  await notice.updateComplete
  expect(notice.hidden).toBe(true)
  fetcher.mockResolvedValue(Response.json({version: "another-version"}))
  window.dispatchEvent(new Event("online"))
  await flush()
  expect(notice.hidden).toBe(false)
  fetcher.mockResolvedValue(Response.json({version: "installed-version"}))
  window.dispatchEvent(new Event("focus"))
  await flush()
  expect(notice.hidden).toBe(true)
})

it("ignores unavailable or malformed markers and retries after failures", async () => {
  fetcher.mockRejectedValue(new Error("Offline"))
  document.body.append(notice)
  await flush()
  for(const response of [new Response("Missing", {status: 404}), new Response("<html>Not JSON</html>"), Response.json({version: 42})]) {
    fetcher.mockResolvedValue(response)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(notice.hidden).toBe(true)
  }
  fetcher.mockResolvedValue(Response.json({version: "new-version"}))
  await vi.advanceTimersByTimeAsync(60_000)
  expect(notice.hidden).toBe(false)
})

it("pauses background polling and checks when the tab becomes visible or comes online", async () => {
  await mount()
  vi.spyOn(document, "hidden", "get").mockReturnValue(true)
  await vi.advanceTimersByTimeAsync(60_000)
  window.dispatchEvent(new Event("focus"))
  expect(fetcher).toHaveBeenCalledTimes(1)
  vi.spyOn(document, "hidden", "get").mockReturnValue(false)
  document.dispatchEvent(new Event("visibilitychange"))
  await flush()
  expect(fetcher).toHaveBeenCalledTimes(2)
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
  window.dispatchEvent(new Event("online"))
  await flush()
  expect(fetcher).toHaveBeenCalledTimes(3)
})

it("times out a stalled check and allows the next scheduled check to succeed", async () => {
  fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("Timed out")), {once: true})
  }))
  document.body.append(notice)
  await flush()
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal
  await vi.advanceTimersByTimeAsync(10_000)
  expect(signal.aborted).toBe(true)
  expect(notice.hidden).toBe(true)
  fetcher.mockResolvedValue(Response.json({version: "new-version"}))
  await vi.advanceTimersByTimeAsync(50_000)
  expect(notice.hidden).toBe(false)
})

it("prevents overlapping checks and aborts requests and listeners on disconnect", async () => {
  let resolve!: (response: Response) => void
  fetcher.mockReturnValue(new Promise<Response>(done => {resolve = done}))
  document.body.append(notice)
  await flush()
  window.dispatchEvent(new Event("focus"))
  expect(fetcher).toHaveBeenCalledOnce()
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal
  notice.remove()
  expect(signal.aborted).toBe(true)
  resolve(Response.json({version: "new-version"}))
  await flush()
  expect(notice.hidden).toBe(true)
  await vi.advanceTimersByTimeAsync(60_000)
  window.dispatchEvent(new Event("online"))
  document.dispatchEvent(new Event("visibilitychange"))
  expect(fetcher).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
