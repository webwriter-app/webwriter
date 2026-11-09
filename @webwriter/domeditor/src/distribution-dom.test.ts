// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from "vitest"
import {distributionTarget, emptyDistributionConfig, encodeDistributionConfig} from "./distribution.js"
import {effectiveDistribution, filterLiveSessionDocument, getDistributionSelection, hydrateDistributionInstructions, localDistributionInstruction, readDistributionConfigs, writeDistributionConfig} from "./distribution-dom"

const config = {...emptyDistributionConfig(), permissions: ["edit" as const]}
const carrier = (policy = config) => `?${distributionTarget} ${encodeDistributionConfig(policy)}?`

describe("distribution DOM instructions", () => {
  beforeEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
  })

  it("appends and removes a local policy without assigning or changing element IDs", () => {
    document.body.innerHTML = '<section><p id="same">First</p><p id="same">Second</p></section>'
    const section = document.querySelector("section")!
    const [first, second] = section.children
    writeDistributionConfig(section, config)
    writeDistributionConfig(first, emptyDistributionConfig())
    expect(section.id).toBe("")
    expect(section.lastChild?.nodeType).toBe(7)
    expect(readDistributionConfigs(document)).toEqual(new Map([[section, config], [first, emptyDistributionConfig()]]))
    expect(effectiveDistribution(second)).toEqual({config, element: section})

    first.id = "changed"
    expect(effectiveDistribution(first)).toEqual({config: emptyDistributionConfig(), element: first})
    writeDistributionConfig(first, null)
    expect(getDistributionSelection(first)).toEqual({local: null, effective: config})
    expect(document.head.childNodes).toHaveLength(0)
  })

  it("uses BODY for document-wide settings", () => {
    writeDistributionConfig(document.documentElement, config)
    expect(readDistributionConfigs(document)).toEqual(new Map([[document.body, config]]))
    expect(document.body.lastChild?.nodeType).toBe(7)
  })

  it.each(["hr", "img", "input"])("rejects writing permissions on void %s", name => {
    const target = document.body.appendChild(document.createElement(name))
    expect(() => writeDistributionConfig(target, config)).toThrow("void")
    expect(target.childNodes).toHaveLength(0)
    expect(target.id).toBe("")
  })

  it("hydrates independent policies inside nested templates and puts them last", () => {
    const root = document.createElement("div")
    root.innerHTML = `<!--ordinary--><template><template><!--${carrier()}--><b>keep</b></template></template>`
    const inner = (root.querySelector("template") as HTMLTemplateElement).content.querySelector("template")!
    hydrateDistributionInstructions(root)
    expect(inner.content.lastChild?.nodeType).toBe(7)
    expect(localDistributionInstruction(inner)?.config).toEqual(config)
    expect(root.firstChild?.nodeValue).toBe("ordinary")
  })

  it("hydrates a trailing instruction parsed as raw text without changing authored fallback text", () => {
    const frame = document.createElement("iframe")
    frame.textContent = `fallback<${carrier()}>`
    hydrateDistributionInstructions(frame)
    expect(frame.textContent).toBe("fallback")
    expect(frame.lastChild?.nodeType).toBe(7)
    expect(localDistributionInstruction(frame)?.config).toEqual(config)
  })

  it("rejects malformed and duplicate instructions without partially hydrating", () => {
    const root = document.createElement("section")
    const first = root.appendChild(document.createElement("p"))
    const second = root.appendChild(document.createElement("p"))
    first.append(document.createComment(carrier()))
    const malformed = second.appendChild(document.createComment(`?${distributionTarget} %?`))
    expect(() => hydrateDistributionInstructions(root)).toThrow("Invalid distribution instruction")
    expect(first.firstChild?.nodeType).toBe(8)
    malformed.data = carrier()
    second.append(document.createComment(carrier()))
    expect(() => hydrateDistributionInstructions(root)).toThrow("Duplicate distribution instruction")
  })

  it("removes hidden subtrees without requiring IDs and preserves visible policies", () => {
    const hidden = {...config, view: false, add: ["element:p"], items: [{id: "element:p", label: "Private recipe", html: "<p>secret</p>"}]}
    const source = new DOMParser().parseFromString(`<main><!--keep--><section><x-widget>secret<!--${carrier()}--></x-widget><!--${carrier(hidden)}--></section>
      <template><span>inert secret<!--${carrier(hidden)}--></span><b>keep</b></template><svg><g><!--${carrier()}--></g></svg></main>`, "text/html")
    expect(getDistributionSelection(source.querySelector("x-widget")!)).toMatchObject({local: config, hiddenByAncestor: true})

    const copy = source.cloneNode(true) as Document
    expect(filterLiveSessionDocument(copy)).toBe(true)
    expect(copy.body.innerHTML).not.toMatch(/secret|private|x-widget/)
    expect(copy.body.innerHTML).toContain("<!--keep-->")
    expect(copy.querySelector("template")?.innerHTML).toBe("<b>keep</b>")
    expect(readDistributionConfigs(copy)).toEqual(new Map([[copy.querySelector("g"), config]]))
    expect(source.querySelector("x-widget")?.textContent).toBe("secret")
  })
})
