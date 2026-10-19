// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {applyPreviewWidgetSnapshot, cleanPreviewEditorArtifacts, LivePreview, previewElementAtPath} from "./live-preview"
import {WidgetDataBindings} from "./widget-data"
import * as Y from "yjs"
import {previewFrameHTML} from "./frame-document"

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
  it("publishes authored changes without resending the initial widget runtime", async () => {
    const {frame, owner, preview} = mount()
    const script = `data:text/javascript,${"x".repeat(100_000)}`
    const style = "data:text/css,demo-widget%7Bdisplay%3Ablock%7D"
    const source = new DOMParser().parseFromString('<style>.authored {color: red}</style><section><!--keep--><demo-widget><script type="application/json" slot="data">{"answer":1}</script></demo-widget></section>', "text/html")
    const html = previewFrameHTML(source, {bridgeNonce: "", hostOrigin: location.origin, frameOrigin: location.origin,
      entryURL: "", standalone: true, executeScripts: false, importMap: null,
      packages: [{name: "demo", version: "1", label: "Demo", authors: [], keywords: [], links: {}, scripts: [script], styles: [style],
        members: [{id: "widget", packageName: "demo", packageVersion: "1", exportName: "./widget", kind: "widget", label: "Widget", tagName: "demo-widget", insertable: true}]}],
    })
    const prepared = new DOMParser().parseFromString(html, "text/html")
    owner.head.replaceChildren(...Array.from(prepared.head.childNodes, node => owner.importNode(node, true)))
    owner.body.replaceChildren(...Array.from(prepared.body.childNodes, node => owner.importNode(node, true)))
    const publish = vi.fn()
    preview.observeLearner(frame, owner, publish)
    owner.querySelector("demo-widget")!.setAttribute("answer", "2")
    await new Promise<void>(resolve => queueMicrotask(resolve))
    await new Promise<void>(resolve => queueMicrotask(resolve))
    const documents = publish.mock.calls.map(([step]) => step).filter(step => step.kind === "document")
    expect(documents.length).toBeGreaterThan(1)
    for(const step of documents) {
      expect(step.html).not.toContain("data:text/javascript")
      expect(step.html).not.toContain("data:text/css")
      expect(step.html).not.toContain("◆")
      expect(step.html).toContain(".authored {color: red}")
      expect(step.html).toContain("<!--keep-->")
      expect(step.html).toContain('{"answer":1}')
    }
    expect(owner.head.querySelector("script[src]")!.getAttribute("src")).toBe(script)
    expect(owner.querySelector("demo-widget")!.getAttribute("answer")).toBe("2")
  })

  it("cleans editor-only artifacts and markers inside nested template contents", () => {
    const template = document.createElement("template")
    template.innerHTML = '<div class="authored ◆widget-editable" contenteditable=""><span class="◆editor-only">remove</span><i data-webwriter-editor-only></i></div>'
    const nested = document.createElement("template")
    nested.innerHTML = '<b class="◆caret authored">text</b>'
    template.content.querySelector("div")!.append(nested)

    cleanPreviewEditorArtifacts(template.content)

    expect(template.content.querySelector("[contenteditable], [data-webwriter-editor-only], .◆editor-only")).toBeNull()
    expect(template.content.querySelector("div")?.className).toBe("authored")
    expect((template.content.querySelector("template") as HTMLTemplateElement).content.querySelector("b")?.className).toBe("authored")
  })

  it("applies widget snapshots identically and ignores malformed HTML values", () => {
    const {owner} = mount()
    const widget = owner.body.firstElementChild as HTMLElement
    const result = applyPreviewWidgetSnapshot(owner, {path: [0], html: 42 as unknown as string, state: {answer: 42}})
    expect(result).toBe(widget)
    expect(widget.localName).toBe("demo-widget")
    expect((widget as unknown as {answer: number}).answer).toBe(42)
    expect(applyPreviewWidgetSnapshot(owner, {path: [0], html: "<p>wrong</p>"})).toBeNull()
  })

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

describe("live widget data snapshots", () => {
  it("captures actual scoped Yjs updates and undo/redo without changing authored defaults", async () => {
    const {owner, frame, preview} = mount()
    owner.body.innerHTML = '<demo-widget id="quiz" shared><script type="application/json" slot="data">{"choice":"a"}</script></demo-widget>'
    const doc = new Y.Doc()
    const bindings = new WidgetDataBindings(owner.body, element => element.localName === "demo-widget", {
      resolve: () => ({doc, scopeId: "public-room"}),
    })
    const publish = vi.fn()
    try {
      preview.observeLearner(frame, owner, publish)
      const block = owner.querySelector("script")!
      const value = doc.getMap("data").get("value") as Y.Map<unknown>
      doc.transact(() => value.set("remote", true), "remote")
      await vi.waitFor(() => expect(JSON.parse(preview.captureWidgetStates(owner)[0].data!.text!)).toEqual({choice: "a", remote: true}))
      block.textContent = '{"choice":"b","remote":true}'
      bindings.sync()
      await vi.waitFor(() => expect(publish.mock.calls.at(-1)?.[0].widgets[0].data.text).toContain('"choice":"b"'))
      bindings.history("undo")!.undo()
      await vi.waitFor(() => expect(JSON.parse(publish.mock.calls.at(-1)?.[0].widgets[0].data.text)).toEqual({choice: "a", remote: true}))
      bindings.history("redo")!.redo()
      await vi.waitFor(() => expect(JSON.parse(publish.mock.calls.at(-1)?.[0].widgets[0].data.text)).toEqual({choice: "b", remote: true}))
      expect(preview.captureWidgetStates(owner)[0].data).toMatchObject({status: "ready", mode: "all", scopeId: "public-room"})
      const copy = owner.body.cloneNode(true) as HTMLElement
      bindings.writeDefaults(copy)
      expect(copy.querySelector("script")?.textContent).toBe('{"choice":"a"}')
    }
    finally { bindings.destroy(); doc.destroy() }
  })

  it("captures portable local JSON/XML data and authored IDs instead of private fields", () => {
    const {owner, preview} = mount()
    owner.body.innerHTML = '<demo-widget id="quiz"><script type="application/json" slot="data">{"choice":"a"}</script></demo-widget><xml-widget id="xml"><script type="application/xml" slot="data"><answer choice="b"/></script></xml-widget>'
    ;(owner.getElementById("quiz") as unknown as {privateAnswer: number}).privateAnswer = 42
    const snapshots = preview.captureWidgetStates(owner)
    expect(snapshots[0]).toMatchObject({id: "quiz", data: {status: "ready", mode: "local", format: "json", text: '{"choice":"a"}'}})
    expect(snapshots[0].state).toBeUndefined()
    expect(snapshots[1]).toMatchObject({id: "xml", data: {status: "ready", mode: "local", format: "xml", text: '<answer choice="b"/>'}})
    owner.querySelector("script")!.textContent = "{"
    expect(preview.captureWidgetStates(owner)[0].data).toEqual({status: "error", mode: "local", format: "json"})
  })

  it("requests accepted managed data, tracks scope changes, and never reads pending writes", async () => {
    const {owner, frame, preview} = mount()
    owner.body.innerHTML = '<demo-widget id="quiz"><script type="application/json" slot="data">{"choice":"a"}</script></demo-widget>'
    const block = owner.querySelector("script")!
    const notify = (type: string, detail: object) => block.dispatchEvent(new CustomEvent(type, {bubbles: true, detail}))
    const request = vi.fn((event: Event) => {
      event.preventDefault()
      notify("datachange", {mode: "group", scopeId: "group-1"})
    })
    block.addEventListener("datarequest", request)
    const publish = vi.fn()
    preview.observeLearner(frame, owner, publish)
    expect(preview.captureWidgetStates(owner)[0].data).toMatchObject({status: "ready", mode: "group", scopeId: "group-1", text: '{"choice":"a"}'})
    expect(request).toHaveBeenCalledTimes(1)
    block.textContent = '{"choice":"unaccepted"}'
    expect(preview.captureWidgetStates(owner)[0].data?.text).toBe('{"choice":"a"}')
    notify("datapending", {mode: "all"})
    expect(preview.captureWidgetStates(owner)[0].data).toEqual({status: "pending", format: "json", mode: "all"})
    notify("dataerror", {message: "Not ready"})
    expect(preview.captureWidgetStates(owner)[0].data?.status).toBe("error")
    block.textContent = '{"choice":"remote"}'
    notify("datachange", {mode: "all", scopeId: "everyone"})
    await Promise.resolve()
    expect(publish.mock.calls.at(-1)?.[0].widgets[0].data).toMatchObject({status: "ready", mode: "all", scopeId: "everyone", text: '{"choice":"remote"}'})
    preview.disconnect()
    const count = publish.mock.calls.length
    notify("datachange", {mode: "all"})
    await Promise.resolve()
    expect(publish).toHaveBeenCalledTimes(count)
  })

  it("observes accepted remote changes and undo without requiring a click or input", async () => {
    const {owner, frame, preview} = mount()
    owner.body.innerHTML = '<demo-widget id="quiz"><script type="application/json" slot="data">{"choice":"a"}</script></demo-widget>'
    const publish = vi.fn()
    preview.observeLearner(frame, owner, publish)
    const block = owner.querySelector("script")!
    for(const choice of ["remote", "a", "remote"]) {
      block.textContent = JSON.stringify({choice})
      block.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode: "individual"}}))
      await Promise.resolve()
      expect(publish.mock.calls.at(-1)?.[0].widgets[0].data.text).toBe(JSON.stringify({choice}))
    }
  })

  it("invalidates data when a block is replaced and ignores incidental shadow events", async () => {
    const {owner, frame, preview} = mount()
    owner.body.innerHTML = '<demo-widget id="quiz"><script type="application/json" slot="data">{"choice":"a"}</script></demo-widget>'
    const publish = vi.fn()
    preview.observeLearner(frame, owner, publish)
    const widget = owner.getElementById("quiz")!
    const shadow = widget.attachShadow({mode: "open"})
    shadow.innerHTML = '<script slot="data" type="application/json">{"private":true}</script>'
    shadow.querySelector("script")!.dispatchEvent(new CustomEvent("datachange", {bubbles: true, composed: true, detail: {mode: "all"}}))
    expect(preview.captureWidgetStates(owner)[0].data?.mode).toBe("local")
    widget.innerHTML = '<script type="application/json" slot="data">{"choice":"replacement"}</script>'
    expect(preview.captureWidgetStates(owner)[0].data?.text).toBe('{"choice":"replacement"}')
  })

  it("applies ID-addressed snapshots after sibling insertion without modifying another widget", () => {
    const {owner} = mount()
    owner.body.innerHTML = '<p>Inserted</p><demo-widget id="quiz"><script type="application/json" slot="data">{}</script></demo-widget><demo-widget id="other"></demo-widget>'
    const result = applyPreviewWidgetSnapshot(owner, {id: "quiz", path: [0], data: {status: "ready", mode: "individual", format: "json", text: '{"choice":"a"}'}})
    expect(result?.id).toBe("quiz")
    expect(owner.querySelector("p")?.textContent).toBe("Inserted")
    expect(owner.getElementById("other")?.innerHTML).toBe("")
    expect(owner.getElementById("quiz")?.querySelector("script")?.textContent).toBe('{"choice":"a"}')
    owner.getElementById("quiz")!.remove()
    expect(applyPreviewWidgetSnapshot(owner, {id: "quiz", path: [0], state: {answer: "bad"}})).toBeNull()
  })
})
