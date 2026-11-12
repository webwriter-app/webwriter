// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {html} from "lit"
import {HttpWidgetResultStorage, LitElementWw, WidgetDrawer, WidgetResultConflict} from "@webwriter/lit"

class TestDrawer extends WidgetDrawer {}
customElements.define("test-widget-drawer", TestDrawer)

class ResultWidget extends LitElementWw {
  static options = {
    answer: {type: "select" as const, options: [{value: "yes"}, {value: "no"}]},
    hidden: {hidden: true},
  }
  static actions = {reset: {confirm: "Reset the answer?"}}
  static convertFrom = {".json": "importResult", p: "importResult"}
  static convertTo = {"text/plain": "exportResult"}
  importResult = vi.fn(async (_file: File) => () => { this.data = '{"answer":"imported"}' })
  exportResult = vi.fn(() => new File(["result"], "result.txt", {type: "text/plain"}))
  reset() { this.setAttribute("answer", "no") }
  protected createRenderRoot() { return this.attachShadow({mode: "open"}) }
  render() { return html`<slot></slot>` }
}
customElements.define("result-test-widget", ResultWidget)

async function widget(standalone?: string, id = "result") {
  const widget = document.createElement("result-test-widget") as ResultWidget
  widget.id = id
  if(standalone !== undefined) widget.standalone = standalone
  widget.innerHTML = '<script type="application/json" slot="data">{"answer":""}</script>'
  document.body.append(widget)
  await widget.updateComplete
  return widget
}

async function mount(widget: ResultWidget) {
  const drawer = document.createElement("test-widget-drawer") as TestDrawer
  drawer.widget = widget
  widget.shadowRoot!.append(drawer)
  await drawer.updateComplete
  return drawer
}

const storageSelect = (drawer: TestDrawer) => drawer.shadowRoot!.querySelector<HTMLSelectElement>("#storage-kind")!
const storageURL = (drawer: TestDrawer) => drawer.shadowRoot!.querySelector<HTMLInputElement>("#storage-url")
const persistenceStates = (widget: ResultWidget) => {
  const states: string[] = []
  widget.addEventListener("datapersistence", event => states.push((event as CustomEvent<{state: string}>).detail.state))
  return states
}
const button = (drawer: TestDrawer, label: string) =>
  Array.from(drawer.shadowRoot!.querySelectorAll("button")).find(button => button.textContent?.trim() === label)!
const change = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  element.value = value
  element.dispatchEvent(new Event("change", {bubbles: true}))
}

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("standalone widget drawer", () => {
  it("leaves placement to the widget and applies declared options and confirmed actions", async () => {
    const target = await widget("")
    expect(target.shadowRoot!.querySelector("test-widget-drawer")).toBeNull()
    const drawer = await mount(target)
    await vi.waitFor(() => expect(target.dataReady).toBe(true))
    expect(drawer.shadowRoot!.querySelector<HTMLDetailsElement>(".drawer")?.open).toBe(false)
    expect(drawer.shadowRoot!.querySelector('[aria-label="Hidden"]')).toBeNull()
    change(drawer.shadowRoot!.querySelector<HTMLSelectElement>('[aria-label="Answer"]')!, "yes")
    expect(target.getAttribute("answer")).toBe("yes")
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal("confirm", confirm)
    button(drawer, "Reset").click()
    expect(target.getAttribute("answer")).toBe("yes")
    button(drawer, "Reset").click()
    await vi.waitFor(() => expect(target.getAttribute("answer")).toBe("no"))
    expect(confirm).toHaveBeenCalledWith("Reset the answer?")
    target.standalone = null
    await vi.waitFor(() => expect(drawer.shadowRoot!.querySelector(".drawer")).toBeNull())
    expect(target.dataReady).toBe(true)
  })

  it("saves and restores the scoped result in browser storage by default", async () => {
    const target = await widget("")
    const drawer = await mount(target)
    expect(storageSelect(drawer).value).toBe("browser")
    expect(storageURL(drawer)).toBeNull()
    expect(button(drawer, "Apply")).toBeUndefined()
    const states = persistenceStates(target)
    await vi.waitFor(() => expect(target.dataReady).toBe(true))
    target.data = '{"answer":"yes"}'
    await vi.waitFor(() => expect(states.at(-1)).toBe("saved"))
    expect(target.querySelector("script")?.textContent).toBe('{"answer":"yes"}')
    target.remove()
    const replacement = await widget("")
    await mount(replacement)
    await vi.waitFor(() => expect(replacement.data).toBe('{"answer":"yes"}'))
    expect(replacement.dataReady).toBe(true)
    const other = await widget("", "other")
    await mount(other)
    expect(other.data).toBe('{"answer":""}')
  })

  it("selects the remote endpoint from the attribute, keeps a conflicting draft, and loads the selected store", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"answer":"saved"}', {headers: {"Content-Type": "application/json", ETag: '"v1"'}}))
      .mockResolvedValueOnce(new Response(null, {status: 412}))
    vi.stubGlobal("fetch", request)
    const target = await widget("https://storage.example/quiz")
    const drawer = await mount(target)
    await vi.waitFor(() => expect(target.data).toBe('{"answer":"saved"}'))
    expect(storageSelect(drawer).value).toBe("http")
    expect(storageURL(drawer)?.value).toBe("https://storage.example/quiz")
    const states = persistenceStates(target)
    target.data = '{"answer":"draft"}'
    await vi.waitFor(() => expect(states.at(-1)).toBe("error"))
    expect(target.data).toBe('{"answer":"draft"}')
    expect(request).toHaveBeenNthCalledWith(2, "https://storage.example/quiz", expect.objectContaining({
      method: "PUT", headers: {"Content-Type": "application/json", "If-Match": '"v1"'}, body: '{"answer":"draft"}',
    }))
    vi.stubGlobal("confirm", vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true))
    change(storageSelect(drawer), "browser")
    await drawer.updateComplete
    expect(storageSelect(drawer).value).toBe("http")
    expect(target.data).toBe('{"answer":"draft"}')
    change(storageSelect(drawer), "browser")
    await vi.waitFor(() => expect(target.data).toBe('{"answer":""}'))
    expect(storageSelect(drawer).value).toBe("browser")
    expect(storageURL(drawer)).toBeNull()
    expect(button(drawer, "Apply")).toBeUndefined()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("shows Apply only for the remote URL and switches to browser storage on selection", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('{"answer":"remote"}', {headers: {"Content-Type": "application/json", ETag: '"v1"'}}),
    )
    vi.stubGlobal("fetch", request)
    const target = await widget("")
    const drawer = await mount(target)
    change(storageSelect(drawer), "http")
    await drawer.updateComplete
    expect(request).not.toHaveBeenCalled()
    const input = storageURL(drawer)!
    const apply = button(drawer, "Apply")
    expect(apply.parentElement).toBe(input.parentElement)
    input.value = "https://storage.example/quiz"
    apply.click()
    await vi.waitFor(() => expect(target.data).toBe('{"answer":"remote"}'))
    change(storageSelect(drawer), "browser")
    await vi.waitFor(() => expect(target.data).toBe('{"answer":""}'))
    expect(request).toHaveBeenCalledTimes(1)
    expect(storageURL(drawer)).toBeNull()
  })

  it("does not overwrite an existing remote result with a direct DOM change made during load", async () => {
    let resolve!: (response: Response) => void
    const request = vi.fn<typeof fetch>(() => new Promise(done => { resolve = done }))
    vi.stubGlobal("fetch", request)
    const target = await widget("https://storage.example/quiz")
    expect(request).not.toHaveBeenCalled()
    const states = persistenceStates(target)
    await mount(target)
    expect(target.dataReady).toBe(false)
    target.querySelector("script")!.textContent = '{"answer":"local"}'
    resolve(new Response('{"answer":"remote"}', {headers: {"Content-Type": "application/json", ETag: '"v1"'}}))
    await vi.waitFor(() => expect(states.at(-1)).toBe("error"))
    expect(target.data).toBe('{"answer":"local"}')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("runs only advertised file conversions, and applies an import after preparation", async () => {
    const target = await widget("")
    const drawer = await mount(target)
    await vi.waitFor(() => expect(target.dataReady).toBe(true))
    const group = drawer.shadowRoot!.querySelector('[aria-label="Import and export"]')!
    expect(Array.from(group.querySelectorAll("button")).map(button => button.textContent?.trim())).toEqual([
      "Import .json", "Export text/plain",
    ])
    const input = drawer.shadowRoot!.querySelector<HTMLInputElement>('input[type="file"]')!
    const pick = vi.spyOn(input, "click").mockImplementation(() => {})
    button(drawer, "Import .json").click()
    expect(pick).toHaveBeenCalledOnce()
    expect(input.accept).toBe(".json")
    input.dispatchEvent(new Event("cancel"))
    expect(target.importResult).not.toHaveBeenCalled()
    button(drawer, "Import .json").click()
    const file = new File(["{}"], "test.json", {type: "application/json"})
    Object.defineProperty(input, "files", {value: [file]})
    input.dispatchEvent(new Event("change"))
    await vi.waitFor(() => expect(target.data).toBe('{"answer":"imported"}'))
    expect(target.importResult).toHaveBeenCalledWith(file)
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    button(drawer, "Export text/plain").click()
    await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(target.exportResult).toHaveBeenCalledOnce()
  })
})

describe("HTTP result storage", () => {
  it("uses conditional creation and update with the returned revision", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, {status: 404}))
      .mockResolvedValueOnce(new Response(null, {status: 201, headers: {ETag: '"created"'}}))
      .mockResolvedValueOnce(new Response(null, {status: 412}))
    const adapter = new HttpWidgetResultStorage(new URL("https://storage.example/quiz"), fetch)
    const {signal} = new AbortController()
    const data = {type: "application/xml", text: "<result/>"} as const
    expect(await adapter.load(signal)).toBeNull()
    const revision = await adapter.save(data, null, signal)
    expect(revision).toBe('"created"')
    expect(fetch).toHaveBeenNthCalledWith(2, "https://storage.example/quiz", expect.objectContaining({
      method: "PUT", headers: {"Content-Type": "application/xml", "If-None-Match": "*"}, body: "<result/>", signal: expect.any(AbortSignal),
    }))
    await expect(adapter.save(data, revision, signal)).rejects.toBeInstanceOf(WidgetResultConflict)
    expect(fetch).toHaveBeenNthCalledWith(3, "https://storage.example/quiz", expect.objectContaining({
      method: "PUT", headers: {"Content-Type": "application/xml", "If-Match": '"created"'},
    }))
  })

  it("checks the returned snapshot before adopting a revision from a follow-up GET", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, {status: 204}))
      .mockResolvedValueOnce(new Response('{"answer":"someone else"}', {headers: {"Content-Type": "application/json", ETag: '"v3"'}}))
    const adapter = new HttpWidgetResultStorage(new URL("https://storage.example/quiz"), fetch)
    await expect(adapter.save({type: "application/json", text: '{"answer":"mine"}'}, '"v1"', new AbortController().signal))
      .rejects.toBeInstanceOf(WidgetResultConflict)
  })
})
