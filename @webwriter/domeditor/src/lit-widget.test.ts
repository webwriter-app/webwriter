// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {html} from "lit"
import * as Y from "yjs"
import {LitElementWw, type WidgetDataContext} from "../../lit/index"
import {WidgetDataBindings, type WidgetDataConnection, type WidgetDataOptions} from "./widget-data"

const cleanups: (() => void)[] = []
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
let nextTag = 0
function nextTagName() { return `lit-probe-${++nextTag}` }
function defineProbe(tag: string) {
  class Widget extends ProbeWidget {}
  customElements.define(tag, Widget)
}

class ProbeWidget extends LitElementWw {
  changes: {value: string | null, context: WidgetDataContext}[] = []
  pending: WidgetDataContext[] = []
  errors: {error: Error, context: WidgetDataContext}[] = []

  protected createRenderRoot() { return this.attachShadow({mode: "open"}) }
  protected dataPending(context: WidgetDataContext) { this.pending.push(context) }
  protected dataChanged(value: string | null, context: WidgetDataContext) { this.changes.push({value, context}) }
  protected dataError(error: Error, context: WidgetDataContext) { this.errors.push({error, context}) }
  render() { return html`<slot></slot>` }
}

function makeWidget(shared?: string) {
  const tag = nextTagName()
  defineProbe(tag)
  const widget = document.createElement(tag) as ProbeWidget
  widget.id = `widget-${nextTag}`
  if(shared !== undefined) widget.setAttribute("shared", shared)
  const block = document.createElement("script")
  block.type = "application/json"
  block.slot = "data"
  block.textContent = '{"answer":"default"}'
  widget.append(block)
  return {widget, block}
}

function manage(widget: ProbeWidget, options: WidgetDataOptions = {}) {
  const root = document.createElement("main")
  root.append(widget)
  const bindings = new WidgetDataBindings(root, node => node.localName.startsWith("lit-probe-"), options)
  bindings.sync()
  cleanups.push(() => bindings.destroy())
  document.body.append(root)
  cleanups.push(() => root.remove())
  return bindings
}

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
})

describe("LitElementWw scoped data lifecycle", () => {
  it("keeps ordinary data in place, observes direct changes, and rejects executable blocks", async () => {
    const {widget, block} = makeWidget()
    block.removeAttribute("slot")
    block.setAttribute("data-author", "keep")
    widget.prepend(document.createComment("authored"))
    document.body.append(widget)
    cleanups.push(() => widget.remove())
    await tick()
    widget.data = '{"answer":"</script>"}'
    await tick()
    expect(JSON.parse(widget.data!)).toEqual({answer: "</script>"})
    expect(widget.data).not.toContain("</script>")
    expect(widget.querySelector("script")).toBe(block)
    expect(block.getAttribute("data-author")).toBe("keep")
    expect(widget.firstChild?.nodeType).toBe(Node.COMMENT_NODE)
    block.textContent = '{"answer":"external"}'
    await tick()
    expect(widget.changes.at(-1)?.value).toBe(block.textContent)
    expect(widget.changes.at(-1)?.context.mode).toBe("local")
    expect(() => widget.setData("text/javascript", "alert(1)")).toThrow(TypeError)
    expect(() => widget.setData("application/json", "{}", {SRC: "script.js"})).toThrow(TypeError)
    expect(() => widget.setData("application/xml", "<data></script></data>")).toThrow(TypeError)
    expect(block.textContent).toBe('{"answer":"external"}')
  })

  it("localizes inherited language without reflecting it and cleans up its observers", async () => {
    const tag = nextTagName()
    class LocalizedWidget extends ProbeWidget {
      locales: string[] = []
      localize = {getLocale: () => this.lang, setLocale: async (locale: string) => { this.locales.push(locale) }}
    }
    customElements.define(tag, LocalizedWidget)
    const parent = document.createElement("section")
    parent.lang = "de"
    const widget = document.createElement(tag) as LocalizedWidget
    parent.append(widget)
    document.body.append(parent)
    cleanups.push(() => parent.remove())
    await tick()
    expect(widget.lang).toBe("de")
    expect(widget.hasAttribute("lang")).toBe(false)
    parent.lang = "en"
    await tick()
    expect(widget.locales.at(-1)).toBe("en")
    widget.lang = ""
    parent.lang = "fr"
    await tick()
    expect(widget.lang).toBe("")
    expect(widget.locales.at(-1)).toBe("")
    widget.removeAttribute("lang")
    await tick()
    expect(widget.lang).toBe("fr")
    widget.remove()
    const count = widget.locales.length
    parent.lang = "it"
    await tick()
    expect(widget.locales).toHaveLength(count)
    parent.append(widget)
    await tick()
    expect(widget.locales.at(-1)).toBe("it")
  })

  it("reports localization failures without an unhandled rejection", async () => {
    const tag = nextTagName()
    class FailedLocaleWidget extends ProbeWidget {
      localize = {getLocale: () => this.lang, setLocale: async () => { throw new Error("locale unavailable") }}
    }
    customElements.define(tag, FailedLocaleWidget)
    const widget = document.createElement(tag) as FailedLocaleWidget
    const failures = vi.fn()
    widget.addEventListener("localizationerror", failures)
    document.body.append(widget)
    cleanups.push(() => widget.remove())
    await tick()
    expect(failures).toHaveBeenCalledOnce()
    expect((failures.mock.calls[0][0] as CustomEvent).detail.error.message).toBe("locale unavailable")
  })

  it("requests and receives the current runtime snapshot when it connects late", async () => {
    const doc = new Y.Doc()
    doc.getMap("data").set("value", new Y.Map())
    ;(doc.getMap("data").get("value") as Y.Map<unknown>).set("answer", "persisted")
    const {widget, block} = makeWidget()
    const bindings = manage(widget, {resolve: () => ({doc})})
    await tick()
    expect(widget.dataReady).toBe(true)
    expect(widget.data).toBe('{"answer":"persisted"}')
    expect(widget.changes.at(-1)).toMatchObject({value: '{"answer":"persisted"}', context: {block, mode: "individual"}})
    expect(widget.pending).toEqual([])
    bindings.destroy()
    doc.destroy()
  })

  it("blocks data writes while an asynchronous runtime connection is pending", async () => {
    let resolveReady!: () => void
    const doc = new Y.Doc()
    const ready = new Promise<void>(resolve => { resolveReady = resolve })
    const {widget, block} = makeWidget("")
    manage(widget, {resolve: () => ({doc, ready})})
    expect(widget.dataReady).toBe(false)
    expect(widget.pending.at(-1)).toMatchObject({block, mode: "all"})
    expect(() => { widget.data = '{"answer":"early"}' }).toThrowError(DOMException)
    expect(block.textContent).toBe('{"answer":"default"}')
    resolveReady()
    await tick()
    expect(widget.dataReady).toBe(true)
    doc.destroy()
  })

  it("notifies for accepted local and remote snapshots while preserving the block", async () => {
    const doc = new Y.Doc()
    const {widget, block} = makeWidget()
    const originalAttributes = [...block.attributes].map(({name, value}) => [name, value])
    const bindings = manage(widget, {resolve: () => ({doc})})
    await tick()
    widget.data = '{"answer":"local"}'
    bindings.sync()
    await tick()
    expect(widget.changes.at(-1)?.value).toBe('{"answer":"local"}')
    doc.transact(() => (doc.getMap("data").get("value") as Y.Map<unknown>).set("answer", "remote"), "remote")
    await tick()
    expect(widget.data).toBe('{"answer":"remote"}')
    expect(widget.changes.at(-1)?.value).toBe('{"answer":"remote"}')
    expect(widget.dataReady).toBe(true)
    expect(widget.querySelector('script[slot="data"]')).toBe(block)
    expect([...block.attributes].map(({name, value}) => [name, value])).toEqual(originalAttributes)
    doc.destroy()
  })

  it("delivers undo and redo snapshots without losing an unrelated remote field", async () => {
    const doc = new Y.Doc()
    const {widget} = makeWidget()
    const bindings = manage(widget, {resolve: () => ({doc})})
    await tick()
    widget.data = '{"answer":"local"}'
    bindings.sync()
    await tick()
    doc.transact(() => (doc.getMap("data").get("value") as Y.Map<unknown>).set("remote", true), "remote")
    await tick()
    bindings.history("undo")!.undo()
    await tick()
    expect(JSON.parse(widget.changes.at(-1)!.value!)).toEqual({answer: "default", remote: true})
    bindings.history("redo")!.redo()
    await tick()
    expect(JSON.parse(widget.changes.at(-1)!.value!)).toEqual({answer: "local", remote: true})
    doc.destroy()
  })

  it("prefers the scoped XML block and preserves unrelated authored data and content", async () => {
    const {widget, block} = makeWidget()
    block.type = "application/xml"
    block.textContent = '<data xmlns="urn:example"><!--keep--><answer>default</answer></data>'
    const unrelated = document.createElement("script")
    unrelated.type = "text/plain"
    unrelated.textContent = "unfamiliar authored data"
    widget.prepend(unrelated)
    const doc = new Y.Doc()
    const bindings = manage(widget, {resolve: () => ({doc})})
    await tick()
    expect(widget.dataType).toBe("application/xml")
    widget.data = '<data xmlns="urn:example"><!--keep--><answer>updated</answer></data>'
    bindings.sync()
    await tick()
    expect(widget.changes.at(-1)?.value).toContain("updated")
    expect(widget.changes.at(-1)?.context.block).toBe(block)
    expect(widget.data).toContain("<!--keep-->")
    expect(unrelated.textContent).toBe("unfamiliar authored data")
    expect(widget.children).toHaveLength(2)
    doc.destroy()
  })

  it("switches scopes without copying answers and restores each scope's own value", async () => {
    const docs = new Map<string, Y.Doc>()
    const resolve = (request: {mode: string}): WidgetDataConnection => {
      let doc = docs.get(request.mode)
      if(!doc) { doc = new Y.Doc(); docs.set(request.mode, doc) }
      return {doc}
    }
    const {widget} = makeWidget()
    const bindings = manage(widget, {resolve})
    await tick()
    widget.data = '{"answer":"individual"}'
    bindings.sync()
    await tick()
    widget.setAttribute("shared", "")
    await tick()
    expect(widget.data).toBe('{"answer":"default"}')
    expect(widget.dataReady).toBe(true)
    widget.data = '{"answer":"all"}'
    bindings.sync()
    await tick()
    widget.removeAttribute("shared")
    await tick()
    expect(widget.data).toBe('{"answer":"individual"}')
    expect(widget.changes.at(-1)?.context.mode).toBe("individual")
    docs.forEach(doc => doc.destroy())
  })

  it("uses local mode without a runtime and ignores nested, stale, or disconnected events", async () => {
    const {widget, block} = makeWidget()
    const nested = document.createElement("div")
    const nestedBlock = document.createElement("script")
    nestedBlock.type = "application/json"
    nestedBlock.slot = "data"
    nestedBlock.textContent = "{}"
    nested.append(nestedBlock)
    widget.append(nested)
    document.body.append(widget)
    cleanups.push(() => widget.remove())
    await tick()
    expect(widget.dataReady).toBe(true)
    expect(widget.changes.at(-1)?.context.mode).toBe("local")
    widget.data = '{"answer":"local standalone"}'
    expect(widget.data).toBe('{"answer":"local standalone"}')
    expect(widget.changes.at(-1)?.context.mode).toBe("local")
    const count = widget.changes.length
    nestedBlock.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode: "all"}}))
    expect(widget.changes).toHaveLength(count)
    const stale = block
    const replacement = document.createElement("script")
    replacement.type = "application/json"
    replacement.slot = "data"
    replacement.textContent = '{"answer":"replacement"}'
    stale.replaceWith(replacement)
    await tick()
    const afterReplacement = widget.changes.length
    stale.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode: "all"}}))
    expect(widget.changes).toHaveLength(afterReplacement)
    widget.remove()
    replacement.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode: "all"}}))
    expect(widget.changes).toHaveLength(afterReplacement)
  })

  it("recovers after an invalid write, but stays blocked when the initial connection fails", async () => {
    const doc = new Y.Doc()
    const {widget, block} = makeWidget()
    const bindings = manage(widget, {resolve: () => ({doc})})
    await tick()
    block.textContent = "{invalid"
    bindings.sync()
    expect(widget.errors.at(-1)?.error.message).toContain("JSON")
    expect(widget.dataReady).toBe(true)
    widget.data = '{"answer":"repaired"}'
    bindings.sync()
    await tick()
    expect(widget.data).toBe('{"answer":"repaired"}')
    doc.destroy()

    let rejectReady!: (error: Error) => void
    const failedDoc = new Y.Doc()
    const failed = makeWidget("")
    manage(failed.widget, {resolve: () => ({doc: failedDoc, ready: new Promise<void>((_resolve, reject) => { rejectReady = reject })})})
    rejectReady(new Error("unavailable"))
    await tick()
    expect(failed.widget.errors.at(-1)?.error.message).toBe("unavailable")
    expect(failed.widget.dataReady).toBe(false)
    expect(() => { failed.widget.data = '{"answer":"blocked"}' }).toThrowError(DOMException)
    failedDoc.destroy()
  })
})
