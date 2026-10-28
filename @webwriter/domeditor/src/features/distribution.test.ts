// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {DOMEditor} from "../domeditor"
import {decodeDistributionConfig, distributionTarget, encodeDistributionConfig, validateDistributionConfig} from "../distribution.js"
import type {DistributionConfig} from "../distribution.js"
import {pathFromNode} from "../utility"

let editor: DOMEditor
const originalHead = document.head.cloneNode(true)
const settle = async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
const feature = () => editor.features.distribution
const restoreHead = () => document.head.replaceChildren(...Array.from(originalHead.childNodes, node => node.cloneNode(true)))
const setConfig = (element: Element, config: DistributionConfig | null) => {
  const state = feature().getState(element)!
  return feature().actions.setDistributionConfig({type: "setDistributionConfig", path: state.path, identity: state.identity, config})
}
const makeConfig = (target: string, permissions: DistributionConfig["permissions"] = ["edit"]): DistributionConfig => ({
  version: 1, target, scope: "individual", permissions, add: [], items: [],
})

beforeEach(() => {
  document.body.replaceChildren()
  restoreHead()
  editor = new DOMEditor()
})

afterEach(() => {
  editor.destroy()
  document.body.replaceChildren()
  restoreHead()
})

describe("DistributionFeature", () => {
  it("uses the current feature path and identity, then changes only the target id and head instruction", async () => {
    document.body.innerHTML = '<section data-keep="yes"><p><!--keep--><em>Authored</em></p><br></section>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const target = document.querySelector("em")!
    const beforeMarkup = document.body.innerHTML
    const state = feature().getState(target)!
    expect(state.path).toEqual(pathFromNode(document.body, target))
    expect(state.identity).toMatch(/^element-/)

    expect(setConfig(target, makeConfig("pending-target"))).toBe(true)

    const afterState = feature().getState(target)!
    expect(afterState.path).toEqual(state.path)
    expect(afterState.identity).toBe(state.identity)
    expect(target.id).toMatch(/^ww/)
    expect(document.body.innerHTML).toBe(beforeMarkup.replace("<em>", `<em id="${target.id}">`))
    expect(Array.from(document.head.childNodes).filter(node => node.nodeType === 7)).toHaveLength(1)
    const instruction = Array.from(document.head.childNodes).find(node => node.nodeType === 7) as ProcessingInstruction
    expect(instruction.target).toBe(distributionTarget)
    expect(decodeDistributionConfig(instruction.data)?.target).toBe(target.id)
    await settle()
  })

  it("inherits the nearest whole config and removes a local config to resume inheritance", () => {
    document.body.innerHTML = "<section><button>Go</button></section>"
    editor.doc.syncFromDOM()
    const parent = document.querySelector("section")!
    const child = document.querySelector("button")!
    setConfig(parent, makeConfig("pending-parent", ["edit", "move"]))
    setConfig(child, makeConfig("pending-child", []))

    expect(feature().getState(child)).toMatchObject({local: expect.objectContaining({permissions: []}), effective: expect.objectContaining({permissions: []}), inheritedFrom: null})
    expect(setConfig(child, null)).toBe(true)
    expect(feature().getState(child)).toMatchObject({local: null, effective: expect.objectContaining({permissions: ["edit", "move"]}), inheritedFrom: parent.id})
  })

  it("rejects stale identities after a same-path replacement", () => {
    document.body.innerHTML = "<div><x-card></x-card></div>"
    editor.doc.syncFromDOM()
    const previous = document.querySelector("x-card")!
    const state = feature().getState(previous)!
    const replacement = document.createElement("x-card")
    previous.replaceWith(replacement)
    expect(feature().getState(replacement)!.path).toEqual(state.path)
    expect(feature().getState(replacement)!.identity).not.toBe(state.identity)

    expect(feature().actions.setDistributionConfig({type: "setDistributionConfig", path: state.path, identity: state.identity, config: makeConfig("pending-target")})).toBe(false)
    expect(replacement.id).toBe("")
    expect(Array.from(document.head.childNodes).some(node => node.nodeType === 7 && (node as ProcessingInstruction).target === distributionTarget)).toBe(false)
  })

  it("undoes and redoes the generated ID and PI as one edit", async () => {
    document.body.innerHTML = "<img alt='unchanged'>"
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const image = document.querySelector("img")!
    expect(setConfig(image, makeConfig("pending-target"))).toBe(true)
    const generatedId = image.id
    expect(generatedId).toMatch(/^ww/)
    expect(document.head.querySelector("ww-distribute")).toBeNull()
    expect(editor.doc.canUndo).toBe(true)

    editor.doc.undo()
    await settle()
    expect(image.id).toBe("")
    expect(Array.from(document.head.childNodes).some(node => node.nodeType === 7 && (node as ProcessingInstruction).target === distributionTarget)).toBe(false)
    expect(editor.doc.canRedo).toBe(true)

    editor.doc.redo()
    await settle()
    expect(image.id).toBe(generatedId)
    expect(feature().getState(image)?.local?.target).toBe(generatedId)
  })

  it("validates malformed configs and executable palette templates without document side effects", () => {
    document.body.innerHTML = "<article><p>Keep</p></article>"
    editor.doc.syncFromDOM()
    const target = document.querySelector("article")!
    const beforeBody = document.body.innerHTML
    const beforeHead = document.head.innerHTML
    const state = feature().getState(target)!
    const invalid = {...makeConfig("pending-target"), permissions: ["invalid"]} as unknown as DistributionConfig
    expect(() => feature().actions.setDistributionConfig({type: "setDistributionConfig", path: state.path, identity: state.identity, config: invalid})).toThrow()
    expect(target.id).toBe("")
    expect(document.body.innerHTML).toBe(beforeBody)
    expect(document.head.innerHTML).toBe(beforeHead)

    const executable = validateDistributionConfig({
      ...makeConfig("pending-target"), add: ["element:x-card"],
      items: [{id: "element:x-card", label: "Card", html: "<x-card><script>alert(1)</script></x-card>"}],
    })
    expect(() => feature().actions.setDistributionConfig({type: "setDistributionConfig", path: state.path, identity: state.identity, config: executable})).toThrow("executable content")
    expect(target.id).toBe("")
    expect(document.body.innerHTML).toBe(beforeBody)
    expect(document.head.innerHTML).toBe(beforeHead)
  })

  it("builds valid builtin palette factories for elements, shapes, math, and list styles", () => {
    const items = feature().actions.getDistributionInsertionItems({type: "getDistributionInsertionItems"})
    const ids = new Set(items.map(item => item.id))
    expect(ids.has("element:p")).toBe(true)
    expect([...ids].some(id => id.startsWith("insert-graphic-shape:"))).toBe(true)
    expect([...ids].some(id => id.startsWith("insert-math:"))).toBe(true)
    expect(ids.has("list-style:ul:disc")).toBe(true)
    expect(ids.has("list-style:ol:decimal")).toBe(true)
    expect(new Set(items.map(item => item.id)).size).toBe(items.length)
    const config = validateDistributionConfig({version: 1, target: "target", scope: "all", permissions: [], add: items.map(item => item.id), items})
    expect(config.items).toEqual(items)
    expect(items.find(item => item.id.startsWith("insert-graphic-shape:"))?.html).toContain("svg")
    expect(items.find(item => item.id.startsWith("insert-math:"))?.html).not.toBe("")
  })

  it("round trips head PIs through export, HTML parsing, and editor import", async () => {
    document.body.innerHTML = '<p data-preserve="yes">Content</p>'
    editor.doc.syncFromDOM()
    const paragraph = document.querySelector("p")!
    setConfig(paragraph, makeConfig("pending-target", ["edit", "style"]))
    const id = paragraph.id
    const exported = await editor.serializeHTML()
    expect(exported).toContain(`<?${distributionTarget} `)

    editor.destroy()
    const imported = new DOMParser().parseFromString(exported, "text/html")
    document.body.replaceChildren(...Array.from(imported.body.childNodes, node => document.importNode(node, true)))
    restoreHead()
    document.head.append(...Array.from(imported.head.childNodes, node => document.importNode(node, true)))
    editor = new DOMEditor()

    const loaded = document.querySelector("p")!
    expect(loaded.id).toBe(id)
    const state = feature().getState(loaded)!
    expect(state.local).toEqual(makeConfig(id, ["edit", "style"]))
    expect(document.head.querySelector("ww-distribute")).toBeNull()
    expect(Array.from(document.head.childNodes).some(node => node.nodeType === 7 && (node as ProcessingInstruction).target === distributionTarget)).toBe(true)
  })
})
