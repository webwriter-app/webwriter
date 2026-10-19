// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import * as Y from "yjs"
import {SharedDOMDoc, sharedDOMBody} from "./domdoc"
import {WidgetDataBindings, type WidgetDataOptions, type WidgetDataRequest} from "./widget-data"

const cleanups: (() => void)[] = []
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
const supports = (element: Element) => element.localName === "data-widget"
const html = (shared = "", value = '{"a":1,"b":1}', type = "application/json") =>
  `<data-widget id="widget" ${shared}><script type="${type}" slot="data">${value}</script></data-widget>`
function create(markup = html(), options: WidgetDataOptions = {}) {
  const root = document.createElement("main")
  root.innerHTML = markup
  const shared = new SharedDOMDoc(undefined, undefined, [], ["◆"], {root, supportsWidgetData: supports, widgetData: options})
  cleanups.push(() => shared.destroy())
  return {root, shared, block: () => root.querySelector<HTMLScriptElement>('script[slot="data"]')!, widget: () => root.querySelector("data-widget")!}
}
const read = (peer: ReturnType<typeof create>) => JSON.parse(peer.block().textContent!)

describe("grouped document and widget data history", () => {
  it("reports widget-only history through undo, redo, new branches and binding removal", async () => {
    const peer = create()
    const states: boolean[][] = []
    const unobserve = peer.shared.observeHistoryState(() => states.push([peer.shared.canUndo, peer.shared.canRedo]))
    expect([peer.shared.canUndo, peer.shared.canRedo]).toEqual([false, false])
    write(peer, {a: 2, b: 1})
    await tick()
    expect(states.at(-1)).toEqual([true, false])
    peer.shared.undo()
    await tick()
    expect(states.at(-1)).toEqual([false, true])
    peer.shared.redo()
    await tick()
    expect(states.at(-1)).toEqual([true, false])
    peer.shared.undo()
    await tick()
    write(peer, {a: 3, b: 1})
    await tick()
    expect(states.at(-1)).toEqual([true, false])
    // A remote widget removal can discard its local data history without
    // creating an undo item in the document manager.
    peer.shared.body.delete(0, peer.shared.body.length)
    await tick()
    expect(states.at(-1)).toEqual([false, false])
    unobserve()
    states.length = 0
    peer.root.append(document.createElement("p"))
    peer.shared.syncFromDOM()
    await tick()
    expect(states).toEqual([])
  })

  it("undoes and redoes DOM and multiple widget data edits together, retaining remote data", async () => {
    const connection = resolver()
    const peer = create(html("shared") + html("shared").replace('id="widget"', 'id="second"'), connection)
    const blocks = [...peer.root.querySelectorAll<HTMLScriptElement>('script[slot="data"]')]
    peer.shared.stopCapturing()
    const end = peer.shared.beginUndoGroup()
    const nested = peer.shared.beginUndoGroup()
    peer.widget().setAttribute("status", "answered")
    for(const block of blocks) block.textContent = '{"a":2,"b":1}'
    end()
    nested()
    for(const doc of connection.docs.values()) doc.transact(() =>
      (doc.getMap("data").get("value") as Y.Map<unknown>).set("b", 9), "remote")
    await tick()
    peer.shared.undo()
    await tick()
    expect(peer.widget().hasAttribute("status")).toBe(false)
    expect(blocks.map(block => JSON.parse(block.textContent!))).toEqual([{a: 1, b: 9}, {a: 1, b: 9}])
    peer.shared.redo()
    await tick()
    expect(peer.widget().getAttribute("status")).toBe("answered")
    expect(blocks.map(block => JSON.parse(block.textContent!))).toEqual([{a: 2, b: 9}, {a: 2, b: 9}])
  })

  it.each(["document", "data"])("clears the complete grouped redo branch after a new %s edit", async kind => {
    const peer = create()
    const end = peer.shared.beginUndoGroup()
    peer.widget().setAttribute("status", "answered")
    peer.block().textContent = '{"a":2,"b":1}'
    end()
    peer.shared.undo()
    await tick()
    if(kind === "document") peer.widget().setAttribute("title", "new edit")
    else peer.block().textContent = '{"a":3,"b":1}'
    peer.shared.syncFromDOM()
    peer.shared.redo()
    await tick()
    expect(peer.widget().hasAttribute("status")).toBe(false)
    expect(read(peer).a).toBe(kind === "data" ? 3 : 1)
  })
})
const write = (peer: ReturnType<typeof create>, value: unknown) => {
  peer.block().textContent = JSON.stringify(value)
  peer.shared.syncFromDOM()
}
function resolver() {
  const docs = new Map<string, Y.Doc>()
  cleanups.push(() => { docs.forEach(doc => doc.destroy()) })
  return {
    docs,
    resolve: (request: WidgetDataRequest) => {
      const key = `${request.widget}:${request.mode}:${request.format}`
      let doc = docs.get(key)
      if(!doc) { doc = new Y.Doc(); docs.set(key, doc) }
      return {doc}
    },
  }
}
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

describe("mutation-driven widget data", () => {
  it.each(["textContent", "characterData", "split text"])("only reads the edited block after %s writes", async change => {
    const connection = resolver()
    const peer = create(html() + html().replace('id="widget"', 'id="second"'), connection)
    const [first, second] = [...peer.root.querySelectorAll<HTMLScriptElement>("script")]
    await tick()
    const unrelated = vi.spyOn(second, "textContent", "get")
    const discovery = vi.spyOn(peer.root, "querySelectorAll")
    cleanups.push(() => { unrelated.mockRestore(); discovery.mockRestore() })
    const value = '{"a":2,"b":1}'
    if(change === "textContent") first.textContent = value
    else if(change === "characterData") (first.firstChild as Text).data = value
    else first.replaceChildren(document.createTextNode('{"a":'), document.createTextNode('2,"b":1}'))
    await tick()
    expect(connection.docs.get("widget:individual:json")!.getMap("data").toJSON()).toEqual({value: {a: 2, b: 1}})
    expect(unrelated).not.toHaveBeenCalled()
    expect(discovery).not.toHaveBeenCalledWith('script[slot="data"]')
    expect(sharedDOMBody(peer.shared.doc).toString()).toContain('{"a":1,"b":1}')
    peer.shared.undo()
    await tick()
    expect(JSON.parse(first.textContent!)).toEqual({a: 1, b: 1})
    peer.shared.redo()
    await tick()
    expect(JSON.parse(first.textContent!)).toEqual({a: 2, b: 1})
    expect(unrelated).not.toHaveBeenCalled()
  })

  it("routes XML edits without reading unrelated blocks", async () => {
    const connection = resolver()
    const peer = create(html("", '<board a="1"/>', "application/xml") + html().replace('id="widget"', 'id="second"'), connection)
    const [first, second] = [...peer.root.querySelectorAll<HTMLScriptElement>("script")]
    await tick()
    const unrelated = vi.spyOn(second, "textContent", "get")
    cleanups.push(() => unrelated.mockRestore())
    ;(first.firstChild as Text).data = '<board a="2"/>'
    await tick()
    expect(connection.docs.get("widget:individual:xml")!.getMap("data").toJSON()).toMatchObject({
      value: {root: {attributes: {a: {value: "2"}}}},
    })
    expect(unrelated).not.toHaveBeenCalled()
  })

  it("routes pending edits during explicit synchronization without reading unrelated blocks", async () => {
    const connection = resolver()
    const peer = create(html() + html().replace('id="widget"', 'id="second"'), connection)
    const [first, second] = [...peer.root.querySelectorAll<HTMLScriptElement>("script")]
    await tick()
    const unrelated = vi.spyOn(second, "textContent", "get")
    cleanups.push(() => unrelated.mockRestore())
    first.textContent = '{"a":2,"b":1}'
    peer.shared.syncFromDOM()
    expect(connection.docs.get("widget:individual:json")!.getMap("data").toJSON()).toEqual({value: {a: 2, b: 1}})
    expect(unrelated).not.toHaveBeenCalled()
  })

  it("only reads the receiving binding when remote widget data changes", async () => {
    const connection = resolver()
    const peer = create(html() + html().replace('id="widget"', 'id="second"'), connection)
    const [first, second] = [...peer.root.querySelectorAll<HTMLScriptElement>("script")]
    await tick()
    const unrelated = vi.spyOn(second, "textContent", "get")
    cleanups.push(() => unrelated.mockRestore())
    const doc = connection.docs.get("widget:individual:json")!
    doc.transact(() => (doc.getMap("data").get("value") as Y.Map<unknown>).set("b", 4), "remote")
    await tick()
    expect(JSON.parse(first.textContent!)).toEqual({a: 1, b: 4})
    expect(unrelated).not.toHaveBeenCalled()
  })

  it("does not read widget state for ordinary local or remote document edits", async () => {
    const peer = create('<p>Before</p>' + html())
    await tick()
    const unrelated = vi.spyOn(peer.block(), "textContent", "get")
    cleanups.push(() => unrelated.mockRestore())
    const paragraph = peer.root.querySelector("p")!
    ;(paragraph.firstChild as Text).data = "Typed"
    paragraph.setAttribute("title", "Authored")
    await tick()
    paragraph.textContent = "Replaced text"
    await tick()
    const text = (sharedDOMBody(peer.shared.doc).get(0) as Y.XmlElement).get(0) as Y.XmlText
    peer.shared.doc.transact(() => text.insert(text.length, " remote"), "remote")
    await tick()
    expect(paragraph.textContent).toBe("Replaced text remote")
    expect(unrelated).not.toHaveBeenCalled()
  })

  it("captures deliberate writes to another widget made by a datachange callback", async () => {
    const connection = resolver()
    const peer = create(html() + html().replace('id="widget"', 'id="second"'), connection)
    const [first, second] = [...peer.root.querySelectorAll<HTMLScriptElement>("script")]
    await tick()
    first.addEventListener("datachange", () => { second.textContent = '{"a":3,"b":1}' }, {once: true})
    first.textContent = '{"a":2,"b":1}'
    await tick()
    expect(connection.docs.get("second:individual:json")!.getMap("data").toJSON()).toEqual({value: {a: 3, b: 1}})
  })

  it("discovers replaced and copied widgets through the observer without exporting their participant state", async () => {
    const peer = create()
    peer.block().textContent = '{"secret":"individual-answer"}'
    await tick()
    peer.widget().replaceWith(peer.widget().cloneNode(true))
    await tick()
    const copy = peer.widget().cloneNode(true) as Element
    peer.root.prepend(copy)
    await tick()
    expect(copy.id).not.toBe("widget")
    expect(JSON.parse(copy.querySelector("script")!.textContent!)).toEqual({a: 1, b: 1})
    const clone = peer.root.cloneNode(true) as HTMLElement
    peer.shared.widgetData.writeDefaults(clone)
    expect(clone.innerHTML).not.toContain("individual-answer")
    expect(sharedDOMBody(peer.shared.doc).toString()).not.toContain("individual-answer")
  })

  it("checks scope changes across the whole batch before committing any edited block", async () => {
    const connection = resolver()
    const peer = create(html() + html().replace('id="widget"', 'id="second"'), connection)
    const [first, second] = [...peer.root.querySelectorAll<HTMLScriptElement>("script")]
    await tick()
    // The data edit arrives first, but must not publish into the previous scope.
    first.textContent = '{"secret":"new-scope-only"}'
    second.textContent = '{"a":4,"b":1}'
    peer.widget().setAttribute("shared", "")
    await tick()
    expect(JSON.parse(first.textContent!)).toEqual({a: 1, b: 1})
    expect(connection.docs.get("widget:individual:json")!.getMap("data").toJSON()).toEqual({value: {a: 1, b: 1}})
    expect(connection.docs.get("widget:all:json")!.getMap("data").toJSON()).toEqual({value: {a: 1, b: 1}})
    expect(connection.docs.get("second:individual:json")!.getMap("data").toJSON()).toEqual({value: {a: 4, b: 1}})
  })

  it("rebinds when a grouping instruction's character data changes", async () => {
    const requests: WidgetDataRequest[] = [], docs: Y.Doc[] = []
    const peer = create(html('shared="group"'), {resolve: request => {
      requests.push(request)
      const doc = new Y.Doc(); docs.push(doc)
      return {doc}
    }})
    cleanups.push(() => docs.forEach(doc => doc.destroy()))
    const instruction = document.createProcessingInstruction("ww-grouping", "first-grouping")
    peer.widget().append(instruction)
    await tick()
    peer.block().textContent = '{"secret":"previous-group"}'
    await tick()
    instruction.data = "second-grouping"
    await tick()
    expect(requests.map(request => request.groupingRevision)).toEqual([undefined, "first-grouping", "second-grouping"])
    expect(read(peer)).toEqual({a: 1, b: 1})
    expect(docs[2].getMap("data").toJSON()).toEqual({value: {a: 1, b: 1}})
  })

  it("rechecks support predicates when widget attributes change", async () => {
    const root = document.createElement("main")
    root.innerHTML = html()
    const shared = new SharedDOMDoc(undefined, undefined, [], ["◆"], {
      root, supportsWidgetData: widget => supports(widget) && widget.hasAttribute("enabled"),
    })
    cleanups.push(() => shared.destroy())
    const widget = root.firstElementChild!, block = widget.querySelector("script")!
    widget.setAttribute("enabled", "")
    await tick()
    block.textContent = '{"secret":"participant"}'
    await tick()
    widget.removeAttribute("enabled")
    await tick()
    expect(JSON.parse(block.textContent!)).toEqual({a: 1, b: 1})
    expect(sharedDOMBody(shared.doc).toString()).not.toContain("participant")
  })

  it("discovers a valid repair of an initially invalid block", async () => {
    const connection = resolver(), peer = create(html("", "{broken"), connection)
    peer.block().textContent = '{"a":2,"b":1}'
    await tick()
    expect(connection.docs.get("widget:individual:json")!.getMap("data").toJSON()).toEqual({value: {a: 2, b: 1}})
  })

  it("synchronously mirrors identities assigned during explicit discovery after a configuration change", async () => {
    const root = document.createElement("main")
    root.innerHTML = html().replace(' id="widget"', '')
    let configured = false
    const shared = new SharedDOMDoc(undefined, undefined, [], ["◆"], {
      root, supportsWidgetData: widget => configured && supports(widget),
    })
    cleanups.push(() => shared.destroy())
    await tick()
    configured = true
    shared.syncFromDOM()
    expect(root.firstElementChild!.id).not.toBe("")
    expect(sharedDOMBody(shared.doc).toString()).toContain(`id="${root.firstElementChild!.id}"`)
  })
})

describe("scoped widget data", () => {
  it("dispatches datapending before a synchronous initial datachange", () => {
    const root = document.createElement("main")
    root.innerHTML = html()
    const block = root.querySelector<HTMLScriptElement>("script")!
    const events: string[] = []
    block.addEventListener("datapending", () => events.push("datapending"))
    block.addEventListener("datachange", () => events.push("datachange"))
    const bindings = new WidgetDataBindings(root, supports)
    bindings.sync()
    cleanups.push(() => bindings.destroy())
    expect(events).toEqual(["datapending", "datachange"])
  })

  it("dispatches pending for an asynchronous scope switch and ignores the disposed resolver failure", async () => {
    const pending: Record<string, {resolve: (connection: {doc: Y.Doc}) => void, reject: (error: Error) => void}> = {}
    const docs: Y.Doc[] = []
    const root = document.createElement("main")
    root.innerHTML = html()
    const widget = root.querySelector("data-widget")!
    const block = root.querySelector<HTMLScriptElement>("script")!
    const modes: string[] = [], errors = vi.fn()
    block.addEventListener("datapending", event => modes.push((event as CustomEvent<{mode: string}>).detail.mode))
    block.addEventListener("dataerror", errors)
    const bindings = new WidgetDataBindings(root, supports, {resolve: request => new Promise((resolve, reject) => {
      pending[request.mode] = {resolve, reject}
    })})
    cleanups.push(() => { bindings.destroy(); docs.forEach(doc => doc.destroy()) })
    bindings.sync()
    widget.setAttribute("shared", "")
    bindings.sync()
    expect(modes).toEqual(["individual", "all"])
    pending.individual.reject(new Error("stale failure"))
    await tick()
    expect(errors).not.toHaveBeenCalled()
    const doc = new Y.Doc()
    docs.push(doc)
    pending.all.resolve({doc})
    await tick()
  })

  it("ignores a ready failure from a disposed connection", async () => {
    let rejectReady!: (error: Error) => void
    const docs: Y.Doc[] = []
    const root = document.createElement("main")
    root.innerHTML = html()
    const widget = root.querySelector("data-widget")!
    const block = root.querySelector<HTMLScriptElement>("script")!
    const errors = vi.fn()
    block.addEventListener("dataerror", errors)
    const bindings = new WidgetDataBindings(root, supports, {resolve: request => {
      const doc = new Y.Doc()
      docs.push(doc)
      return request.mode === "individual"
        ? {doc, ready: new Promise<void>((_resolve, reject) => { rejectReady = reject })}
        : {doc}
    }})
    cleanups.push(() => { bindings.destroy(); docs.forEach(doc => doc.destroy()) })
    bindings.sync()
    widget.setAttribute("shared", "")
    bindings.sync()
    rejectReady(new Error("stale ready failure"))
    await tick()
    expect(errors).not.toHaveBeenCalled()
  })

  it("answers a late datarequest with the current ready or pending state", () => {
    const root = document.createElement("main")
    root.innerHTML = html()
    const block = root.querySelector<HTMLScriptElement>("script")!
    const bindings = new WidgetDataBindings(root, supports)
    bindings.sync()
    cleanups.push(() => bindings.destroy())
    const changes = vi.fn(), pending = vi.fn()
    block.addEventListener("datachange", changes)
    block.addEventListener("datapending", pending)
    const readyRequest = new CustomEvent("datarequest", {bubbles: true, cancelable: true})
    block.dispatchEvent(readyRequest)
    expect(readyRequest.defaultPrevented).toBe(true)
    expect(changes).toHaveBeenCalledTimes(1)

    bindings.destroy()
    const later = document.createElement("main")
    later.innerHTML = html()
    let resolve!: (connection: {doc: Y.Doc}) => void
    const waiting = new Promise<{doc: Y.Doc}>(done => { resolve = done })
    const waitingBindings = new WidgetDataBindings(later, supports, {resolve: () => waiting})
    waitingBindings.sync()
    const waitingBlock = later.querySelector<HTMLScriptElement>("script")!
    const waitingPending = vi.fn()
    waitingBlock.addEventListener("datapending", waitingPending)
    const pendingRequest = new CustomEvent("datarequest", {bubbles: true, cancelable: true})
    waitingBlock.dispatchEvent(pendingRequest)
    expect(pendingRequest.defaultPrevented).toBe(true)
    expect(waitingPending).toHaveBeenCalledTimes(1)
    const doc = new Y.Doc()
    cleanups.push(() => { waitingBindings.destroy(); doc.destroy() })
    resolve({doc})
  })

  it("exposes only the opaque connection scope on initial, remote, and late datachange events", async () => {
    const root = document.createElement("main")
    root.innerHTML = html("shared", '{"choice":"default"}')
    const block = root.querySelector<HTMLScriptElement>("script")!
    const doc = new Y.Doc()
    doc.getMap("data").set("value", {choice: "initial"})
    const connection = {doc, scopeId: "opaque-scope", accessToken: "private-token", resolverMetadata: {secret: true}}
    const bindings = new WidgetDataBindings(root, supports, {
      resolve: () => connection,
    })
    cleanups.push(() => { bindings.destroy(); doc.destroy() })
    const changes: {detail: unknown; value: unknown}[] = []
    block.addEventListener("datachange", event => {
      changes.push({detail: (event as CustomEvent).detail, value: JSON.parse(block.textContent!)})
    })
    bindings.sync()

    expect(changes).toEqual([{detail: {mode: "all", scopeId: "opaque-scope"}, value: {choice: "initial"}}])
    doc.transact(() => doc.getMap("data").set("value", {choice: "remote"}), "remote")
    await tick()
    expect(changes[1]).toEqual({detail: {mode: "all", scopeId: "opaque-scope"}, value: {choice: "remote"}})

    const request = new CustomEvent("datarequest", {bubbles: true, cancelable: true})
    block.dispatchEvent(request)
    expect(request.defaultPrevented).toBe(true)
    expect(changes[2]).toEqual({detail: {mode: "all", scopeId: "opaque-scope"}, value: {choice: "remote"}})
    for(const change of changes) {
      expect(Object.keys(change.detail as object).sort()).toEqual(["mode", "scopeId"])
      expect(change.detail).not.toHaveProperty("accessToken")
      expect(change.detail).not.toHaveProperty("resolverMetadata")
    }
  })

  it("replays a binding error to a late requester and ignores requests from nested non-widgets", async () => {
    const root = document.createElement("main")
    root.innerHTML = `${html()}<section><script type="application/json" slot="data">{}</script></section>`
    const block = root.querySelector<HTMLScriptElement>("data-widget > script")!
    const nested = root.querySelector<HTMLScriptElement>("section > script")!
    const bindings = new WidgetDataBindings(root, supports, {resolve: () => Promise.reject(new Error("offline"))})
    bindings.sync()
    cleanups.push(() => bindings.destroy())
    await tick()
    const errors = vi.fn()
    block.addEventListener("dataerror", errors)
    const request = new CustomEvent("datarequest", {bubbles: true, cancelable: true})
    block.dispatchEvent(request)
    expect(request.defaultPrevented).toBe(true)
    expect(errors).toHaveBeenCalledTimes(1)
    const nestedRequest = new CustomEvent("datarequest", {bubbles: true, cancelable: true})
    nested.dispatchEvent(nestedRequest)
    expect(nestedRequest.defaultPrevented).toBe(false)
  })

  it("removes the datarequest handler when bindings are destroyed", () => {
    const root = document.createElement("main")
    root.innerHTML = html()
    const block = root.querySelector<HTMLScriptElement>("script")!
    const bindings = new WidgetDataBindings(root, supports)
    bindings.sync()
    bindings.destroy()
    const request = new CustomEvent("datarequest", {bubbles: true, cancelable: true})
    block.dispatchEvent(request)
    expect(request.defaultPrevented).toBe(false)
  })

  it("skips parsing unchanged XML after the initial render", () => {
    const source = '<board xmlns="urn:test"><card>Text</card></board>'
    const peer = create(html("shared", source, "application/xml"))
    const parseFromString = vi.spyOn(DOMParser.prototype, "parseFromString")
    const callsForSource = () => parseFromString.mock.calls.filter(([text]) => text === source).length
    const before = callsForSource()
    peer.shared.syncFromDOM()
    peer.shared.syncFromDOM()
    expect(callsForSource()).toBe(before)
    parseFromString.mockRestore()
  })

  it("parses local edits after remote renders and undo/redo", async () => {
    const doc = new Y.Doc()
    cleanups.push(() => doc.destroy())
    const peer = create(html("shared"), {resolve: () => ({doc})})
    write(peer, {a: 2, b: 1})
    await tick()
    doc.transact(() => (doc.getMap("data").get("value") as Y.Map<unknown>).set("b", 4), "remote")
    await tick()
    expect(read(peer)).toEqual({a: 2, b: 4})
    peer.shared.undo()
    await tick()
    expect(read(peer)).toEqual({a: 1, b: 4})
    peer.shared.redo()
    await tick()
    expect(read(peer)).toEqual({a: 2, b: 4})
    peer.block().textContent = '{"a":3,"b":4}'
    peer.shared.syncFromDOM()
    expect(read(peer)).toEqual({a: 3, b: 4})
  })

  it("parses a changed source once and retries source text whose parse failed", () => {
    const peer = create()
    const source = '{"a":4,"b":1}'
    const parse = vi.spyOn(JSON, "parse")
    const sourceCalls = () => parse.mock.calls.filter(([text]) => text === source).length
    peer.block().textContent = source
    peer.shared.syncFromDOM()
    expect(sourceCalls()).toBe(1)
    peer.shared.syncFromDOM()
    expect(sourceCalls()).toBe(1)

    const invalid = '{"a":'
    peer.block().textContent = invalid
    peer.shared.syncFromDOM()
    peer.shared.syncFromDOM()
    expect(parse.mock.calls.filter(([text]) => text === invalid)).toHaveLength(2)
    parse.mockRestore()
  })

  it("uses the authored document ID and rebinds data when that identity changes", () => {
    const owner = document.implementation.createHTMLDocument("")
    owner.body.innerHTML = html()
    const requests: WidgetDataRequest[] = []
    const docs: Y.Doc[] = []
    const shared = new SharedDOMDoc(undefined, undefined, [], ["◆"], {
      root: owner.body,
      supportsWidgetData: supports,
      widgetData: {resolve: request => {
        requests.push(request)
        const doc = new Y.Doc()
        docs.push(doc)
        return {doc}
      }},
    })
    cleanups.push(() => { shared.destroy(); docs.forEach(doc => doc.destroy()) })
    expect(requests[0].document).toBe(owner.documentElement.id)
    const block = owner.body.querySelector("script")!
    block.textContent = '{"answer":"previous-document"}'
    shared.syncFromDOM()
    owner.documentElement.id = `ww${crypto.randomUUID()}`
    shared.syncFromDOM()
    expect(requests).toHaveLength(2)
    expect(requests[1].document).toBe(owner.documentElement.id)
    expect(block.textContent).toBe('{"a":1,"b":1}')
    expect(shared.snapshot().widgetDataDocumentId).toBe(owner.documentElement.id)
  })

  it("keeps individual data out of the body mirror and normal exports", async () => {
    const peer = create()
    const events = vi.fn()
    peer.block().addEventListener("datachange", events)
    write(peer, {a: 7, secret: "individual-answer"})
    await tick()
    expect(read(peer)).toEqual({a: 7, secret: "individual-answer"})
    expect(events).toHaveBeenCalled()
    expect(sharedDOMBody(peer.shared.doc).toString()).not.toContain("individual-answer")
    const clone = peer.root.cloneNode(true) as HTMLElement
    peer.shared.widgetData.writeDefaults(clone)
    expect(clone.querySelector("script")!.textContent).toBe('{"a":1,"b":1}')
    const remoteDoc = new Y.Doc()
    Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(peer.shared.doc))
    expect(sharedDOMBody(remoteDoc).toString()).not.toContain("individual-answer")
    remoteDoc.destroy()
  })

  it("keeps participant data private while a DOM preview is accepted", async () => {
    const peer = create()
    write(peer, {secret: "individual-answer"})
    await tick()
    const preview = peer.shared.beginDOMPreview()
    expect(read(peer)).toEqual({secret: "individual-answer"})
    peer.block().textContent = '{"secret":"preview-answer"}'
    await tick()
    preview.accept("preview-with-widget-data")
    expect(sharedDOMBody(peer.shared.doc).toString()).not.toContain("preview-answer")
    expect(read(peer)).toEqual({secret: "preview-answer"})
  })

  it.each(["replace", "remove", "sharing"])("restores participant scopes after rejecting a preview that changes widget %s", async change => {
    const connection = resolver()
    const peer = create(html(), connection)
    write(peer, {secret: "individual-answer"})
    await tick()
    const defaults = sharedDOMBody(peer.shared.doc).toString()
    const preview = peer.shared.beginDOMPreview()
    if(change === "replace") peer.widget().replaceWith(peer.widget().cloneNode(true))
    else if(change === "remove") peer.widget().remove()
    else peer.widget().setAttribute("shared", "")
    await tick()
    expect(preview.reject()).toBe(true)
    expect(read(peer)).toEqual({secret: "individual-answer"})
    expect(sharedDOMBody(peer.shared.doc).toString()).toBe(defaults)
    const secondPreview = peer.shared.beginDOMPreview()
    expect(read(peer)).toEqual({secret: "individual-answer"})
    secondPreview.reject()
    write(peer, {secret: "after-preview"})
    await tick()
    expect(read(peer)).toEqual({secret: "after-preview"})
    expect(sharedDOMBody(peer.shared.doc).toString()).not.toContain("after-preview")
  })

  it("releases participant connections once when the owner is destroyed with an active preview", () => {
    const doc = new Y.Doc(), destroy = vi.fn()
    cleanups.push(() => doc.destroy())
    const peer = create(html(), {resolve: () => ({doc, destroy})})
    const preview = peer.shared.beginDOMPreview()
    peer.shared.destroy()
    cleanups.pop()
    expect(preview.active).toBe(false)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it("keeps rendered participant data out of defaults after a data block is replaced", async () => {
    const peer = create()
    write(peer, {secret: "individual-answer"})
    await tick()
    peer.block().replaceWith(peer.block().cloneNode(true))
    peer.shared.syncFromDOM()
    const clone = peer.root.cloneNode(true) as HTMLElement
    peer.shared.widgetData.writeDefaults(clone)
    expect(clone.innerHTML).not.toContain("individual-answer")
    expect(JSON.parse(clone.querySelector("script")!.textContent!)).toEqual({a: 1, b: 1})
  })

  it("keeps defaults when a widget is replaced by another node with the same authored identity", async () => {
    const peer = create()
    write(peer, {secret: "individual-answer"})
    await tick()
    peer.widget().replaceWith(peer.widget().cloneNode(true))
    peer.shared.syncFromDOM()
    const clone = peer.root.cloneNode(true) as HTMLElement
    peer.shared.widgetData.writeDefaults(clone)
    expect(clone.innerHTML).not.toContain("individual-answer")
    expect(JSON.parse(clone.querySelector("script")!.textContent!)).toEqual({a: 1, b: 1})
  })

  it("merges concurrent object properties, deletes keys, and replaces arrays atomically", async () => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc()
    cleanups.push(() => { leftDoc.destroy(); rightDoc.destroy() })
    const left = create(html("shared", '{"nested":{"a":1,"b":1},"remove":true,"list":[1]}'), {resolve: () => ({doc: leftDoc})})
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc))
    const right = create(html("shared"), {resolve: () => ({doc: rightDoc})})
    write(left, {nested: {a: 2, b: 1}, list: [2, 3]})
    write(right, {nested: {a: 1, b: 3}, remove: true, list: [1]})
    const leftUpdate = Y.encodeStateAsUpdate(leftDoc), rightUpdate = Y.encodeStateAsUpdate(rightDoc)
    Y.applyUpdate(leftDoc, rightUpdate)
    Y.applyUpdate(rightDoc, leftUpdate)
    await tick()
    expect(read(left)).toEqual({nested: {a: 2, b: 3}, list: [2, 3]})
    expect(read(right)).toEqual(read(left))
  })

  it("captures a pending DOM write before a remote update renders", async () => {
    const doc = new Y.Doc()
    cleanups.push(() => doc.destroy())
    const peer = create(html("shared"), {resolve: () => ({doc})})
    peer.block().textContent = '{"a":2,"b":1}'
    const remote = new Y.Doc()
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc))
    ;(remote.getMap("data").get("value") as Y.Map<unknown>).set("b", 4)
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote))
    await tick()
    expect(read(peer)).toEqual({a: 2, b: 4})
    remote.destroy()
  })

  it("switches scopes without copying participant state and restores each existing scope", async () => {
    const connection = resolver()
    const peer = create(html(), connection)
    write(peer, {a: 8, b: 1})
    await tick()
    peer.widget().setAttribute("shared", "")
    peer.shared.syncFromDOM()
    expect(read(peer)).toEqual({a: 1, b: 1})
    write(peer, {a: 1, b: 9})
    await tick()
    peer.widget().setAttribute("shared", "group")
    peer.shared.syncFromDOM()
    expect(read(peer)).toEqual({a: 1, b: 1})
    peer.widget().removeAttribute("shared")
    peer.shared.syncFromDOM()
    expect(read(peer)).toEqual({a: 8, b: 1})
    peer.widget().setAttribute("shared", "")
    peer.shared.syncFromDOM()
    expect(read(peer)).toEqual({a: 1, b: 9})
  })

  it("does not publish the previous snapshot while an asynchronous scope connects", async () => {
    const connection = resolver()
    const peer = create(html(), connection)
    write(peer, {a: 8, b: 1})
    await tick()
    let resolve!: (value: {doc: Y.Doc}) => void
    const pending = new Promise<{doc: Y.Doc}>(ready => { resolve = ready })
    const root = document.createElement("main")
    root.innerHTML = html("shared")
    const binding = new WidgetDataBindings(root, supports, {resolve: () => pending})
    binding.sync()
    root.querySelector("script")!.textContent = '{"a":900,"b":1}'
    const doc = connection.resolve({document: "test", widget: "widget", mode: "all", format: "json"}).doc
    resolve({doc})
    await tick()
    expect(JSON.parse(root.querySelector("script")!.textContent!)).toEqual({a: 1, b: 1})
    binding.destroy()
  })

  it("rejects malformed JSON without changing shared state, then accepts a valid repair", async () => {
    const connection = resolver(), peer = create(html("shared"), connection)
    const error = vi.fn()
    peer.block().addEventListener("dataerror", error)
    peer.block().textContent = "{broken"
    peer.shared.syncFromDOM()
    expect(error).toHaveBeenCalled()
    expect(connection.docs.values().next().value!.getMap("data").toJSON()).toEqual({value: {a: 1, b: 1}})
    write(peer, {a: 5, b: 1})
    await tick()
    expect(read(peer)).toEqual({a: 5, b: 1})
  })

  it("keeps special JSON keys as data and treats property order as insignificant", async () => {
    const connection = resolver(), peer = create(html("shared", '{"__proto__":{"value":1},"a":2}'), connection)
    expect(Object.hasOwn(read(peer), "__proto__")).toBe(true)
    const changes = vi.fn()
    peer.block().addEventListener("datachange", changes)
    peer.block().textContent = '{"a":2,"__proto__":{"value":1}}'
    peer.shared.syncFromDOM()
    await tick()
    expect(changes).not.toHaveBeenCalled()
    expect(Object.hasOwn(read(peer), "__proto__")).toBe(true)
  })

  it("serializes JSON closing-script strings without changing their meaning", async () => {
    const peer = create(html("shared"))
    const value = {text: "</script><p>content</p>"}
    write(peer, value)
    await tick()
    expect(read(peer)).toEqual(value)
    expect(peer.block().textContent).not.toContain("</script>")
    const snapshot = peer.root.cloneNode(true) as HTMLElement
    peer.shared.widgetData.writeDefaults(snapshot, true)
    const parsed = document.createElement("template")
    parsed.innerHTML = snapshot.innerHTML
    expect(parsed.content.querySelector("p")).toBeNull()
    expect(JSON.parse(parsed.content.querySelector("script")!.textContent!)).toEqual(value)
  })

  it("elects one initial value when independently initialized mirrors synchronize", async () => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc()
    cleanups.push(() => { leftDoc.destroy(); rightDoc.destroy() })
    const left = create(html("shared"), {resolve: () => ({doc: leftDoc})})
    const right = create(html("shared"), {resolve: () => ({doc: rightDoc})})
    const update = Y.encodeStateAsUpdate(leftDoc)
    Y.applyUpdate(leftDoc, Y.encodeStateAsUpdate(rightDoc)); Y.applyUpdate(rightDoc, update)
    await tick()
    expect(read(left)).toEqual({a: 1, b: 1})
    expect(read(right)).toEqual(read(left))
    write(left, {a: 7, b: 1})
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc))
    await tick()
    expect(read(right)).toEqual({a: 7, b: 1})
  })

  it("restores defaults when the opt-in or sharing mode becomes invalid", async () => {
    const peer = create(html("shared"))
    write(peer, {secret: "answer"})
    await tick()
    peer.widget().setAttribute("shared", "false")
    peer.shared.syncFromDOM()
    expect(peer.block().textContent).not.toContain("answer")
    peer.widget().removeAttribute("shared")
    peer.shared.syncFromDOM()
    write(peer, {secret: "another-answer"})
    await tick()
    peer.block().removeAttribute("slot")
    peer.shared.syncFromDOM()
    expect(sharedDOMBody(peer.shared.doc).toString()).not.toContain("another-answer")
  })

  it("supports data undo/redo without losing unrelated remote changes", async () => {
    const connection = resolver(), peer = create(html("shared"), connection)
    write(peer, {a: 3, b: 1})
    await tick()
    const doc = [...connection.docs.values()][0]
    doc.transact(() => (doc.getMap("data").get("value") as Y.Map<unknown>).set("b", 4), "remote")
    await tick()
    peer.shared.undo()
    await tick()
    expect(read(peer)).toEqual({a: 1, b: 4})
    peer.shared.redo()
    await tick()
    expect(read(peer)).toEqual({a: 3, b: 4})
  })

  it("orders undo and redo across independent widget data histories", async () => {
    const peer = create(html() + html().replace('id="widget"', 'id="second"'))
    const blocks = Array.from(peer.root.querySelectorAll<HTMLScriptElement>('script[slot="data"]'))
    let clock = 1000
    const time = vi.spyOn(performance, "now").mockImplementation(() => ++clock)
    cleanups.push(() => time.mockRestore())
    const values = () => blocks.map(block => JSON.parse(block.textContent!))
    for(const index of [0, 1]) {
      blocks[index].textContent = JSON.stringify({a: index + 2, b: 1})
      peer.shared.syncFromDOM()
      await tick()
      peer.shared.stopCapturing()
    }
    expect(values()).toEqual([{a: 2, b: 1}, {a: 3, b: 1}])
    peer.shared.undo()
    await tick()
    expect(values()).toEqual([{a: 2, b: 1}, {a: 1, b: 1}])
    peer.shared.undo()
    await tick()
    expect(values()).toEqual([{a: 1, b: 1}, {a: 1, b: 1}])
    peer.shared.redo()
    await tick()
    expect(values()).toEqual([{a: 2, b: 1}, {a: 1, b: 1}])
    peer.shared.redo()
    await tick()
    expect(values()).toEqual([{a: 2, b: 1}, {a: 3, b: 1}])
  })

  it("reads legacy offline individual data and isolates users without IndexedDB", () => {
    const legacy = new Y.Doc()
    legacy.getMap("data").set("value", new Y.Map(Object.entries({answer: 42})))
    localStorage.setItem(`webwriter-widget-data:${JSON.stringify(["lesson", "widget", "json", "individual", "alice"])}`,
      JSON.stringify([...Y.encodeStateAsUpdate(legacy)]))
    legacy.destroy()
    const second = create(html(), {documentId: "lesson", userId: "alice"})
    expect(read(second)).toEqual({answer: 42})
    const other = create(html(), {documentId: "lesson", userId: "bob"})
    expect(read(other)).toEqual({a: 1, b: 1})
  })

  it("isolates unrelated offline documents and preserves the scope identity in snapshots", async () => {
    const connection = resolver()
    const first = create(html(), connection)
    write(first, {answer: "one-document"})
    await tick()
    const snapshot = first.shared.snapshot()
    // IndexedDB persistence/reload is covered in native Chrome. Happy DOM has
    // no IndexedDB; seed a legacy snapshot to check scope identity here.
    localStorage.setItem(`webwriter-widget-data:${JSON.stringify([snapshot.widgetDataDocumentId, "widget", "json", "individual", "local-development"])}`,
      JSON.stringify([...Y.encodeStateAsUpdate([...connection.docs.values()][0])]))
    const unrelated = create()
    expect(read(unrelated)).toEqual({a: 1, b: 1})
    expect(unrelated.shared.snapshot().widgetDataDocumentId).not.toBe(snapshot.widgetDataDocumentId)
    const resumed = create(html(), {documentId: snapshot.widgetDataDocumentId})
    expect(read(resumed)).toEqual({answer: "one-document"})
  })

  it("assigns a new identity to copied widgets and cleans up removed/replaced blocks", async () => {
    const peer = create(html("shared"))
    const old = peer.block()
    const replacement = old.cloneNode(true) as HTMLScriptElement
    old.replaceWith(replacement)
    peer.shared.syncFromDOM()
    write(peer, {a: 5, b: 1})
    await tick()
    const copy = peer.widget().cloneNode(true) as Element
    peer.root.prepend(copy)
    peer.shared.syncFromDOM()
    expect(copy.id).not.toBe("widget")
    expect(JSON.parse(copy.querySelector("script")!.textContent!)).toEqual({a: 1, b: 1})
    expect(peer.root.querySelector('[id="widget"]')!.id).toBe("widget")
    const oldEvents = vi.fn()
    old.addEventListener("datachange", oldEvents)
    replacement.textContent = '{"a":6,"b":1}'
    peer.shared.syncFromDOM()
    await tick()
    expect(oldEvents).not.toHaveBeenCalled()
  })

  it("ignores unconfigured widgets and shadow DOM data blocks", () => {
    const peer = create('<unknown-widget><script type="application/json" slot="data">{"a":1}</script></unknown-widget>')
    const host = document.createElement("data-widget")
    host.attachShadow({mode: "open"}).innerHTML = html("shared")
    peer.root.append(host)
    peer.shared.syncFromDOM()
    expect(host.id).toBe("")
    expect(sharedDOMBody(peer.shared.doc).toString()).toContain('{"a":1}')
  })

  it("round trips XML namespaces/comments and merges root attributes independently", async () => {
    const leftDoc = new Y.Doc(), rightDoc = new Y.Doc()
    cleanups.push(() => { leftDoc.destroy(); rightDoc.destroy() })
    const xml = '<board xmlns="urn:test" x="1" y="1"><!--note--><card>Text</card></board>'
    const left = create(html("shared", xml, "application/xml"), {resolve: () => ({doc: leftDoc})})
    Y.applyUpdate(rightDoc, Y.encodeStateAsUpdate(leftDoc))
    const right = create(html("shared", xml, "application/xml"), {resolve: () => ({doc: rightDoc})})
    left.block().textContent = xml.replace('x="1"', 'x="2"')
    right.block().textContent = xml.replace('y="1"', 'y="3"')
    left.shared.syncFromDOM(); right.shared.syncFromDOM()
    const update = Y.encodeStateAsUpdate(leftDoc)
    Y.applyUpdate(leftDoc, Y.encodeStateAsUpdate(rightDoc)); Y.applyUpdate(rightDoc, update)
    await tick()
    const parsed = new DOMParser().parseFromString(left.block().textContent!, "application/xml")
    expect(parsed.documentElement.getAttribute("x")).toBe("2")
    expect(parsed.documentElement.getAttribute("y")).toBe("3")
    expect(parsed.documentElement.namespaceURI).toBe("urn:test")
    expect(left.block().textContent).toContain("<!--note-->")
    expect(left.block().textContent).toBe(right.block().textContent)
  })
})
