// @vitest-environment happy-dom
import {afterEach, expect, it, vi} from "vitest"
vi.mock("./example-document", () => ({}))
import {ExampleDialog} from "./example-dialog"

const initialURL = location.href
afterEach(() => {document.body.replaceChildren(); history.replaceState(null, "", initialURL); vi.restoreAllMocks()})

it("dismisses backdrop clicks while keeping clicks inside the dialog open", async () => {
  history.replaceState(null, "", "/?keep=yes#section")
  const view = new ExampleDialog()
  document.body.append(view)
  await view.open("food-chains")
  const dialog = view.shadowRoot!.querySelector("dialog")!
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 500, 400))
  dialog.dispatchEvent(new MouseEvent("click", {clientX: 120, clientY: 120}))
  expect(dialog.open).toBe(true)
  dialog.dispatchEvent(new MouseEvent("click", {clientX: 20, clientY: 20}))
  await view.updateComplete
  expect(dialog.open).toBe(false)
  expect(view.shadowRoot!.querySelector("example-document")).toBeNull()
  expect(location.pathname + location.search + location.hash).toBe("/?keep=yes#section")
})

it("handles Escape, direct links, and browser history on the current page", async () => {
  history.replaceState(null, "", "/?example=printing-press")
  const view = new ExampleDialog()
  document.body.append(view)
  const current = () => view.shadowRoot!.querySelector("example-document")?.getAttribute("example-id")
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector("dialog")?.open).toBe(true))
  expect(current()).toBe("printing-press")
  history.replaceState(null, "", "/?example=machine-learning")
  window.dispatchEvent(new PopStateEvent("popstate"))
  await view.updateComplete
  expect(current()).toBe("machine-learning")
  view.shadowRoot!.querySelector("dialog")!.dispatchEvent(new Event("cancel"))
  await view.updateComplete
  expect(current()).toBeUndefined()
  expect(location.pathname + location.search).toBe("/")
})

it("drops the layout parameter of older links because examples keep their authored layout", async () => {
  history.replaceState(null, "", "/examples/?keep=yes&example=food-chains&layout=canvas#section")
  const view = new ExampleDialog()
  document.body.append(view)
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector("dialog")?.open).toBe(true))
  const document_ = view.shadowRoot!.querySelector("example-document")!
  expect(document_.getAttribute("example-id")).toBe("food-chains")
  expect(document_.hasAttribute("layout")).toBe(false)
  await view.open("heartburn")
  expect(new URL(location.href).searchParams.get("example")).toBe("heartburn")
  expect(new URL(location.href).searchParams.has("layout")).toBe(false)
  view.close()
  await view.updateComplete
  expect(location.search + location.hash).toBe("?keep=yes#section")
})
