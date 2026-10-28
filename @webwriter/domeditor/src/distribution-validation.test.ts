// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {emptyDistributionConfig} from "./distribution.js"
import type {DistributionConfig} from "./distribution.js"
import {validateDistributionChange, type DistributionNode} from "./distribution-validation.js"

const htmlNamespace = "http://www.w3.org/1999/xhtml"

function snapshot(node: Node): DistributionNode {
  if(node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element
    const attrs = Object.fromEntries(Array.from(element.attributes)
      .sort((a, b) => a.name.localeCompare(b.name)).map(attribute => [attribute.name, attribute.value]))
    return {name: element.localName, namespace: element.namespaceURI ?? undefined, attrs,
      children: Array.from(element.childNodes, snapshot)}
  }
  if(node.nodeType === Node.TEXT_NODE) return {name: "#text", value: node.nodeValue ?? ""}
  if(node.nodeType === Node.COMMENT_NODE) return {name: "#comment", value: node.nodeValue ?? ""}
  if(node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
    const instruction = node as ProcessingInstruction
    return {name: instruction.target, value: instruction.data}
  }
  return {name: `#node-${node.nodeType}`, value: node.nodeValue ?? ""}
}

function parseDocument(markup: string): Document {
  return new DOMParser().parseFromString(markup, "text/html")
}

function parseFragment(html: string): DistributionNode[] {
  const template = document.createElement("template")
  template.innerHTML = html
  return Array.from(template.content.childNodes, snapshot)
}

function validate(beforeMarkup: string, afterMarkup: string, configs: DistributionConfig[] = []) {
  return validateDistributionChange(snapshot(parseDocument(beforeMarkup).documentElement), snapshot(parseDocument(afterMarkup).documentElement), configs, parseFragment)
}

function rootConfig(permissions: DistributionConfig["permissions"] = [], add: string[] = [], items: DistributionConfig["items"] = []) {
  return {...emptyDistributionConfig("root"), permissions, add, items}
}

const emptyRoot = '<html id="root"><head></head><body></body></html>'

describe("validateDistributionChange", () => {
  it("denies edits by default and permits inherited text changes where configured", () => {
    const before = '<html id="root"><head></head><body><p>Hello</p></body></html>'
    const after = '<html id="root"><head></head><body><p>Goodbye</p></body></html>'
    expect(validate(before, after)).toBe(false)
    expect(validate(before, after, [rootConfig(["edit"])])).toBe(true)
  })

  it("uses the nearest complete override, including an empty policy that denies inherited text", () => {
    const before = '<html id="root"><head></head><body><section id="restricted"><p>Before</p></section></body></html>'
    const after = '<html id="root"><head></head><body><section id="restricted"><p>After</p></section></body></html>'
    const configs = [rootConfig(["edit"]), emptyDistributionConfig("restricted")]
    expect(validate(before, after, configs)).toBe(false)
  })

  it("allows presentation styles while denying executable URL values", () => {
    const before = '<html id="root"><head></head><body><div style="width: 100px; color: red"></div></body></html>'
    const resized = '<html id="root"><head></head><body><div style="width: 200px; color: red"></div></body></html>'
    const recolored = '<html id="root"><head></head><body><div style="width: 100px; color: blue"></div></body></html>'
    const repositioned = '<html id="root"><head></head><body><div style="width: 100px; color: red; position: fixed"></div></body></html>'
    const executableStyle = '<html id="root"><head></head><body><div style="width: 100px; background-image: url(javascript:alert(1))"></div></body></html>'
    const configs = [rootConfig(["style"])]
    expect(validate(before, resized, configs)).toBe(true)
    expect(validate(before, recolored, configs)).toBe(true)
    expect(validate(before, repositioned, configs)).toBe(true)
    expect(validate(before, executableStyle, configs)).toBe(false)
  })

  it("protects HTML attributes, head resources, and distribution processing instructions", () => {
    const before = '<html id="root"><head></head><body><p>Text</p></body></html>'
    const eventHandler = '<html id="root"><head></head><body><p onclick="alert(1)">Text</p></body></html>'
    const editable = '<html id="root"><head></head><body><p contenteditable="true">Text</p></body></html>'
    const rootAttribute = '<html id="root" lang="en"><head></head><body><p>Text</p></body></html>'
    expect(validate(before, eventHandler, [rootConfig(["edit", "style"])] )).toBe(false)
    expect(validate(before, editable, [rootConfig(["edit", "style"])] )).toBe(false)
    expect(validate(before, rootAttribute, [rootConfig(["edit", "style"])] )).toBe(false)

    const piBefore = parseDocument(before)
    const piAfter = parseDocument(before)
    piBefore.head.append(piBefore.createProcessingInstruction("ww-distribute", "before"))
    piAfter.head.append(piAfter.createProcessingInstruction("ww-distribute", "after"))
    expect(validateDistributionChange(snapshot(piBefore.documentElement), snapshot(piAfter.documentElement), [rootConfig(["edit", "style"])], parseFragment)).toBe(false)
  })

  it("requires exact approved templates for widget insertion, even with an element wildcard", () => {
    const before = emptyRoot
    const forgedWidget = '<html id="root"><head></head><body><x-forged></x-forged></body></html>'
    const exactWidget = '<html id="root"><head></head><body><x-safe data-approved="yes"></x-safe></body></html>'
    const approved = rootConfig([], ["element:*"] , [{id: "element:x-safe", label: "Safe", html: '<x-safe data-approved="yes"></x-safe>'}])
    expect(validate(before, forgedWidget, [rootConfig([], ["element:*"])])).toBe(false)
    expect(validate(before, forgedWidget, [approved])).toBe(false)
    expect(validate(before, exactWidget, [approved])).toBe(true)
  })

  it("allows exact widget and user snippet templates but rejects forged payloads inside them", () => {
    const widget = '<x-safe><span>Original</span></x-safe>'
    const snippet = '<em>Approved snippet</em>'
    const config = rootConfig([], ["element:x-safe", "user-snippet:one"], [
      {id: "element:x-safe", label: "Safe", html: widget},
      {id: "user-snippet:one", label: "Snippet", html: snippet},
    ])
    const exact = `<html id="root"><head></head><body>${widget}${snippet}</body></html>`
    const forged = '<html id="root"><head></head><body><x-safe><script>alert(1)</script></x-safe><em>Approved snippet</em></body></html>'
    expect(validate(emptyRoot, exact, [config])).toBe(true)
    expect(validate(emptyRoot, forged, [config])).toBe(false)
  })

  it("protects nested configured content from deletion and cross-policy movement", () => {
    const beforeDelete = '<html id="root"><head></head><body><section id="outer"><article id="protected"><p>Keep</p></article></section></body></html>'
    const afterDelete = '<html id="root"><head></head><body><section id="outer"></section></body></html>'
    expect(validate(beforeDelete, afterDelete, [
      {...emptyDistributionConfig("outer"), permissions: ["delete"]},
      emptyDistributionConfig("protected"),
    ])).toBe(false)

    const beforeMove = '<html id="root"><head></head><body><section id="source"><p id="moving">Move</p></section><section id="destination"></section></body></html>'
    const afterMove = '<html id="root"><head></head><body><section id="source"></section><section id="destination"><p id="moving">Move</p></section></body></html>'
    expect(validate(beforeMove, afterMove, [
      {...emptyDistributionConfig("source"), permissions: ["move"]},
      {...emptyDistributionConfig("destination"), permissions: ["move"]},
    ])).toBe(false)
    expect(validate(beforeMove, afterMove, [rootConfig(["move"])] )).toBe(true)
  })

  it("preserves comments and namespace identity, rejects comment edits and duplicate IDs", () => {
    const before = '<html id="root"><head></head><body><p><!--keep--><span>Text</span></p><svg xmlns="http://www.w3.org/2000/svg"><circle cx="1"></circle></svg></body></html>'
    const unchanged = '<html id="root"><head></head><body><p><!--keep--><span>Text</span></p><svg xmlns="http://www.w3.org/2000/svg"><circle cx="1"></circle></svg></body></html>'
    const commentChanged = '<html id="root"><head></head><body><p><!--changed--><span>Text</span></p><svg xmlns="http://www.w3.org/2000/svg"><circle cx="1"></circle></svg></body></html>'
    const duplicateIds = '<html id="root"><head></head><body><p id="same">One</p><p id="same">Two</p></body></html>'
    expect(validate(before, unchanged, [rootConfig(["edit"])])).toBe(true)
    expect(validate(before, commentChanged, [rootConfig(["edit"])])).toBe(false)
    expect(validate(emptyRoot, duplicateIds, [rootConfig(["edit"])])).toBe(false)
    expect(snapshot(parseDocument(before).documentElement).children?.[1].children?.some(node => node.namespace === "http://www.w3.org/2000/svg")).toBe(true)
  })

  it("does not allow changing an inserted input's kind outside its approved template", () => {
    const inputConfig = rootConfig([], ["element:input"], [{
      id: "element:input", label: "Text input", html: '<input type="text" aria-label="Name">',
    }])
    const approved = '<html id="root"><head></head><body><input type="text" aria-label="Name"></body></html>'
    const forgedKind = '<html id="root"><head></head><body><input type="password" aria-label="Name"></body></html>'
    expect(validate(emptyRoot, approved, [inputConfig])).toBe(true)
    expect(validate(approved, forgedKind, [inputConfig])).toBe(false)
  })
})
