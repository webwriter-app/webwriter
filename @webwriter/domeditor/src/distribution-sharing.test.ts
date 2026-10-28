// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import * as Y from "yjs"
import {DOMEditor} from "./domeditor"
import {SharedDOMDoc} from "./domdoc"
import {emptyDistributionConfig, encodeDistributionConfig, distributionTarget} from "./distribution.js"
import {writeDistributionConfig} from "./distribution-dom"
import {Schema} from "./schema"
import {WidgetDataBindings, type WidgetDataRequest} from "./widget-data"
import {distributionGroupingRevision} from "./widget-grouping.js"

const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
const cleanups: (() => void)[] = []
const makeConfig = (target: string, scope: "individual" | "group" | "all") => ({...emptyDistributionConfig(target), scope})

function createBindings(markup = '<data-widget id="sharing-widget"><script type="application/json" slot="data">{"answer":0}</script></data-widget>') {
  const root = document.createElement("main")
  root.innerHTML = markup
  document.body.append(root)
  const requests: WidgetDataRequest[] = []
  const docs = new Map<string, Y.Doc>()
  const bindings = new WidgetDataBindings(root, element => element.localName === "data-widget", {
    resolve: request => {
      requests.push(request)
      const key = `${request.widget}:${request.mode}:${request.groupingRevision ?? ""}`
      let doc = docs.get(key)
      if(!doc) { doc = new Y.Doc(); docs.set(key, doc) }
      return {doc}
    },
  })
  cleanups.push(() => { bindings.destroy(); docs.forEach(doc => doc.destroy()); root.remove() })
  return {root, requests, bindings, widget: root.querySelector("data-widget")!, block: root.querySelector<HTMLScriptElement>("script[slot=data]")!}
}

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  document.head.replaceChildren()
  document.body.replaceChildren()
})

describe("widget data distribution sharing", () => {
  it("inherits numbered grouping and rebinds when the requested group size changes", async () => {
    const peer = createBindings()
    const parent = document.createElement("section")
    parent.id = "numbered-groups"
    parent.append(peer.widget)
    peer.root.append(parent)
    const config = {...makeConfig(parent.id, "group"), groupSize: 2}
    writeDistributionConfig(parent, config)
    peer.bindings.sync()
    await tick()
    expect(peer.requests.at(-1)?.groupingRevision).toBe(distributionGroupingRevision(config))
    const rules = JSON.parse(decodeURIComponent(peer.requests.at(-1)!.groupingRevision!))
    expect(rules).toMatchObject({method: "automatic", groupBy: "members", number: 2})
    peer.block.textContent = '{"answer":42}'
    peer.bindings.sync()
    writeDistributionConfig(parent, {...config, groupSize: 4})
    peer.bindings.sync()
    await tick()
    expect(peer.requests.at(-1)?.groupingRevision).not.toBe(distributionGroupingRevision(config))
    expect(peer.block.textContent).toBe('{"answer":0}')
  })

  it("inherits scope, applies a complete local override, and never copies answers across scopes", async () => {
    const peer = createBindings()
    const parent = document.createElement("section")
    parent.id = "shared-parent"
    parent.append(peer.widget)
    peer.root.append(parent)
    writeDistributionConfig(parent, makeConfig(parent.id, "all"))
    peer.bindings.sync()
    await tick()
    expect(peer.requests.at(-1)?.mode).toBe("all")

    peer.block.textContent = '{"answer":42}'
    peer.bindings.sync()
    await tick()
    const local = {...makeConfig(peer.widget.id, "individual"), permissions: ["edit" as const], add: ["element:div"], items: []}
    writeDistributionConfig(peer.widget, local)
    peer.bindings.sync()
    await tick()

    expect(peer.requests.map(request => request.mode)).toEqual(["all", "individual"])
    expect(peer.block.textContent).toBe('{"answer":0}')
  })

  it("fails closed on malformed distribution instructions without resolving shared data", () => {
    const peer = createBindings()
    const errors: string[] = []
    peer.block.addEventListener("dataerror", event => errors.push((event as CustomEvent).detail.message))
    document.head.append(document.createProcessingInstruction(distributionTarget, "bad"))
    peer.bindings.sync()
    expect(peer.requests).toEqual([])
    expect(errors).toHaveLength(1)
    expect(peer.block.textContent).toBe('{"answer":0}')
  })

  it("writes Share settings to an explicit distribution PI and preserves existing policy", () => {
    const editor = new DOMEditor()
    cleanups.push(() => editor.destroy())
    editor.schema = new Schema()
    editor.schema.extendWidgets([{tagName: "share-widget", editingConfig: {sharedData: true}}])
    document.body.innerHTML = '<share-widget id="share-target"></share-widget>'
    editor.features.widget.refresh()
    const widget = document.querySelector("share-widget")!
    writeDistributionConfig(widget, {...makeConfig(widget.id, "individual"), permissions: ["edit"], add: ["element:div"]})

    expect(editor.features.widget.setSharing(widget, true)).toBe(true)
    expect(widget.hasAttribute("shared")).toBe(false)
    expect(document.head.firstChild?.nodeType).toBe(7)
    const instruction = document.head.firstChild as ProcessingInstruction
    const config = JSON.parse(decodeURIComponent(instruction.data))
    expect(config).toMatchObject({target: widget.id, scope: "all", permissions: ["edit"], add: ["element:div"], items: []})
  })
})
