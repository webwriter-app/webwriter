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

describe("scoped widget data", () => {
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

  it("persists offline individual data and isolates users", async () => {
    const first = create(html(), {documentId: "lesson", userId: "alice"})
    write(first, {answer: 42})
    await tick()
    first.shared.destroy()
    cleanups.pop()
    const second = create(html(), {documentId: "lesson", userId: "alice"})
    expect(read(second)).toEqual({answer: 42})
    const other = create(html(), {documentId: "lesson", userId: "bob"})
    expect(read(other)).toEqual({a: 1, b: 1})
  })

  it("isolates unrelated offline documents and preserves the scope identity in snapshots", async () => {
    const first = create()
    write(first, {answer: "one-document"})
    await tick()
    const snapshot = first.shared.snapshot()
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
