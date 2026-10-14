// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"

const key = "webwriter-docs-sidebar-scroll"

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  document.body.innerHTML = "<aside><nav>Documentation</nav></aside>"
  Object.defineProperty(document.querySelector("aside"), "clientHeight", {value: 400, configurable: true})
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ""
  sessionStorage.clear()
})

it("retains the sidebar position when another documentation page loads", async () => {
  await import("./documentation.js")
  const sidebar = document.querySelector("aside")!
  sidebar.scrollTop = 275
  sidebar.dispatchEvent(new Event("scroll"))

  document.body.innerHTML = "<aside><nav>A different page</nav></aside>"
  vi.resetModules()
  await import("./documentation.js")
  expect(document.querySelector("aside")!.scrollTop).toBe(275)
})

it("does not overwrite the desktop position while the sidebar is hidden", async () => {
  sessionStorage.setItem(key, "275")
  await import("./documentation.js")
  const sidebar = document.querySelector("aside")!
  Object.defineProperty(sidebar, "clientHeight", {value: 0})
  sidebar.scrollTop = 0
  sidebar.dispatchEvent(new Event("scroll"))
  expect(sessionStorage.getItem(key)).toBe("275")
})

it("ignores invalid stored positions", async () => {
  sessionStorage.setItem(key, "invalid")
  await import("./documentation.js")
  expect(document.querySelector("aside")!.scrollTop).toBe(0)
})

it("continues when browser storage is disabled", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage disabled") })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled") })
  await expect(import("./documentation.js")).resolves.toBeDefined()
  expect(() => document.querySelector("aside")!.dispatchEvent(new Event("scroll"))).not.toThrow()
})
