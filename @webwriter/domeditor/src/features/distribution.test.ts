// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {DOMEditor} from "../domeditor"
import {decodeDistributionConfig, distributionTarget, encodeDistributionConfig, validateDistributionConfig} from "../distribution.js"
import type {DistributionConfig} from "../distribution.js"
import {$, pathFromNode} from "../utility"
import {hasAnchorTarget} from "../anchor-positioning.test-utils"
import {elementAttributeTargetId} from "../element-attributes"

let editor: DOMEditor
const originalHead = document.head.cloneNode(true)
const settle = async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) }
const feature = () => editor.features.distribution
const restoreHead = () => document.head.replaceChildren(...Array.from(originalHead.childNodes, node => node.cloneNode(true)))
const setConfig = (element: Element, config: DistributionConfig | null) => {
  const state = feature().getState(element)!
  return feature().actions.setDistributionConfig({type: "setDistributionConfig", path: state.path, identity: state.identity, config})
}
const makeConfig = (permissions: DistributionConfig["permissions"] = ["edit"]): DistributionConfig => ({
  version: 1, scope: "individual", permissions, add: [], items: [],
})
const privateMarkers = () => editor.appendix.querySelectorAll('[part~="distribution-private-marker"]')

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
  it("uses the current selection identity and appends an instruction without assigning an ID", async () => {
    document.body.innerHTML = '<section data-keep="yes"><p><!--keep--><em>Authored</em></p><br></section>'
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const target = document.querySelector("em")!
    const beforeMarkup = document.body.innerHTML
    const state = feature().getState(target)!
    expect(state.path).toEqual(pathFromNode(document.body, target))
    expect(state.identity).toMatch(/^element-/)

    expect(setConfig(target, makeConfig())).toBe(true)

    const afterState = feature().getState(target)!
    expect(afterState.path).toEqual(state.path)
    expect(afterState.identity).toBe(state.identity)
    expect(target.id).toBe("")
    expect(document.body.innerHTML.replace(/<!--\?ww-distribute [^>]+\?-->|<\?ww-distribute [^>]+>/, "")).toBe(beforeMarkup)
    expect(Array.from(document.head.childNodes).filter(node => node.nodeType === 7)).toHaveLength(0)
    const instruction = target.lastChild as ProcessingInstruction
    expect(instruction.target).toBe(distributionTarget)
    expect(decodeDistributionConfig(instruction.data)).toEqual(makeConfig())
    target.append(document.createTextNode(" More"))
    await settle()
    expect(target.lastChild).toBe(instruction)
  })

  it("inherits the nearest whole config and removes a local config to resume inheritance", () => {
    document.body.innerHTML = "<section><button>Go</button></section>"
    editor.doc.syncFromDOM()
    const parent = document.querySelector("section")!
    const child = document.querySelector("button")!
    setConfig(parent, makeConfig(["edit", "move"]))
    setConfig(child, makeConfig([]))

    expect(feature().getState(child)).toMatchObject({local: expect.objectContaining({permissions: []}), effective: expect.objectContaining({permissions: []})})
    expect(setConfig(child, null)).toBe(true)
    expect(feature().getState(child)).toMatchObject({local: null, effective: expect.objectContaining({permissions: ["edit", "move"]})})
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

    expect(feature().actions.setDistributionConfig({type: "setDistributionConfig", path: state.path, identity: state.identity, config: makeConfig()})).toBe(false)
    expect(replacement.id).toBe("")
    expect(Array.from(document.head.childNodes).some(node => node.nodeType === 7 && (node as ProcessingInstruction).target === distributionTarget)).toBe(false)
  })

  it("rejects a void element even when an action is invoked directly", () => {
    document.body.innerHTML = "<hr>"
    const divider = document.querySelector("hr")!
    expect(feature().getState(divider)).toBeNull()
    expect(feature().actions.setDistributionConfig({type: "setDistributionConfig", path: [0],
      identity: elementAttributeTargetId(divider), config: makeConfig()})).toBe(false)
    expect(divider.childNodes).toHaveLength(0)
    expect(divider.id).toBe("")
  })

  it("undoes and redoes an inline visibility policy and its marker", async () => {
    document.body.innerHTML = "<p>Private</p>"
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const paragraph = document.querySelector("p")!
    expect(setConfig(paragraph, {...makeConfig(), view: false})).toBe(true)
    expect(editor.doc.canUndo).toBe(true)
    await settle()
    expect(privateMarkers()).toHaveLength(1)
    expect(editor.toHTML(false, false)).not.toContain("distribution-private-marker")

    editor.doc.undo()
    await settle()
    expect(paragraph.childNodes).toHaveLength(1)
    expect(editor.doc.canRedo).toBe(true)
    expect(privateMarkers()).toHaveLength(0)

    editor.doc.redo()
    await settle()
    expect(paragraph.id).toBe("")
    expect(paragraph.lastChild?.nodeType).toBe(7)
    expect(feature().getState(paragraph)?.local).toMatchObject({view: false})
    expect(privateMarkers()).toHaveLength(1)
  })

  it("keeps both parts of a private paragraph private when Enter splits it", async () => {
    document.body.innerHTML = "<p>Private answer</p>"
    const paragraph = document.querySelector("p")!
    expect(setConfig(paragraph, {...makeConfig(), view: false})).toBe(true)
    document.getSelection()!.collapse(paragraph.firstChild!, 7)
    editor.features.manipulation.insert()
    await settle()
    const paragraphs = Array.from(document.body.querySelectorAll("p"))
    expect(paragraphs.map(element => element.textContent)).toEqual(["Private", " answer"])
    expect(paragraphs.every(element => feature().getState(element)?.local?.view === false)).toBe(true)
    expect(paragraphs.every(element => element.lastChild?.nodeType === 7)).toBe(true)
  })

  it("keeps document permissions when deleting all body content", async () => {
    document.body.innerHTML = "<p>Delete this</p>"
    expect(setConfig(document.documentElement, makeConfig())).toBe(true)
    const policy = document.body.lastChild
    const selection = document.getSelection()!
    selection.selectAllChildren(document.body)
    $.delete()
    await settle()
    expect(document.body.textContent).not.toContain("Delete this")
    expect(document.body.lastChild).toBe(policy)
    expect(feature().getState(document.documentElement)?.local).toEqual(makeConfig())
  })

  it("marks only the outermost private regions and follows direct DOM policy changes", async () => {
    document.body.innerHTML = '<section id="outer"><p id="inner">Private note</p></section><p>Public note</p>'
    const outer = document.getElementById("outer")!
    const inner = document.getElementById("inner")!
    const markup = document.body.innerHTML
    const privateConfig = {...makeConfig(), view: false}
    expect(setConfig(outer, privateConfig)).toBe(true)
    expect(setConfig(inner, {...makeConfig(), view: false})).toBe(true)
    await settle()
    expect(privateMarkers()).toHaveLength(1)
    expect(hasAnchorTarget(outer)).toBe(true)
    expect(hasAnchorTarget(inner)).toBe(false)
    expect(document.body.innerHTML.replace(/<!--\?ww-distribute [^>]+\?-->|<\?ww-distribute [^>]+>/g, "")).toBe(markup)

    const policy = outer.lastChild as ProcessingInstruction
    policy.data = encodeDistributionConfig(makeConfig())
    await settle()
    expect(privateMarkers()).toHaveLength(1)
    expect(hasAnchorTarget(outer)).toBe(false)
    expect(hasAnchorTarget(inner)).toBe(true)

    const replacement = document.createElement("p")
    replacement.id = inner.id
    replacement.append(...Array.from(inner.childNodes))
    inner.replaceWith(replacement)
    await settle()
    expect(privateMarkers()).toHaveLength(1)
    expect(hasAnchorTarget(inner)).toBe(false)
    expect(hasAnchorTarget(replacement)).toBe(true)

    const appendix = editor.appendix
    feature().disable()
    expect(appendix.querySelector('[part~="distribution-private-markers"]')).toBeNull()
    expect(hasAnchorTarget(replacement)).toBe(false)
    expect(document.body.innerHTML.replace(/<!--\?ww-distribute [^>]+\?-->|<\?ww-distribute [^>]+>/g, "")).toBe(markup)
  })

  it("validates malformed configs and executable palette templates without document side effects", () => {
    document.body.innerHTML = "<article><p>Keep</p></article>"
    editor.doc.syncFromDOM()
    const target = document.querySelector("article")!
    const beforeBody = document.body.innerHTML
    const beforeHead = document.head.innerHTML
    const state = feature().getState(target)!
    const invalid = {...makeConfig(), permissions: ["invalid"]} as unknown as DistributionConfig
    expect(() => feature().actions.setDistributionConfig({type: "setDistributionConfig", path: state.path, identity: state.identity, config: invalid})).toThrow()
    expect(target.id).toBe("")
    expect(document.body.innerHTML).toBe(beforeBody)
    expect(document.head.innerHTML).toBe(beforeHead)

    const executable = validateDistributionConfig({
      ...makeConfig(), add: ["element:x-card"],
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
    const config = validateDistributionConfig({version: 1, scope: "all", permissions: [], add: items.map(item => item.id), items})
    expect(config.items).toEqual(items)
    expect(items.find(item => item.id.startsWith("insert-graphic-shape:"))?.html).toContain("svg")
    expect(items.find(item => item.id.startsWith("insert-math:"))?.html).not.toBe("")
  })

  it("round trips inline PIs through export, HTML parsing, and editor import", async () => {
    document.body.innerHTML = '<p data-preserve="yes">Content</p>'
    editor.doc.syncFromDOM()
    const paragraph = document.querySelector("p")!
    setConfig(paragraph, makeConfig(["edit", "style"]))
    const exported = await editor.serializeHTML()
    expect(exported).toContain(`<?${distributionTarget} `)

    editor.destroy()
    const imported = new DOMParser().parseFromString(exported, "text/html")
    document.body.replaceChildren(...Array.from(imported.body.childNodes, node => document.importNode(node, true)))
    restoreHead()
    document.head.append(...Array.from(imported.head.childNodes, node => document.importNode(node, true)))
    editor = new DOMEditor()

    const loaded = document.querySelector("p")!
    expect(loaded.id).toBe("")
    const state = feature().getState(loaded)!
    expect(state.local).toEqual(makeConfig(["edit", "style"]))
    expect(document.head.querySelector("ww-distribute")).toBeNull()
    expect((loaded.lastChild as ProcessingInstruction).target).toBe(distributionTarget)
  })
})
