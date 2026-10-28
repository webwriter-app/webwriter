// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from "vitest"
import {decodeDistributionConfig, distributionTarget, encodeDistributionConfig, emptyDistributionConfig} from "./distribution.js"
import type {DistributionPermission} from "./distribution.js"
import {effectiveDistribution, ensureDistributionTarget, getDistributionSelection, hydrateDistributionInstructions, readDistributionConfigs, writeDistributionConfig} from "./distribution-dom"

function config(target: string, permissions: DistributionPermission[] = ["edit"]) {
  return {version: 1 as const, target, scope: "individual" as const, permissions, add: [], items: []}
}

describe("distribution DOM instructions", () => {
  beforeEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
  })

  it("reads encoded head instructions and rejects malformed or duplicate instructions", () => {
    const root = document
    const target = root.createElement("div")
    target.id = "target"
    root.body.append(target)
    root.head.append(root.createProcessingInstruction(distributionTarget, encodeDistributionConfig(config("target"))))
    expect(readDistributionConfigs(root)).toEqual([config("target")])

    root.head.append(root.createProcessingInstruction(distributionTarget, "bad"))
    expect(() => readDistributionConfigs(root)).toThrow("Invalid distribution instruction")
  })

  it("hydrates only recognized validated carriers, including nested templates", () => {
    const root = document.createElement("div")
    const ordinary = document.createComment("ordinary comment")
    const outer = document.createElement("template")
    const inner = document.createElement("template")
    const encoded = encodeDistributionConfig(config("from-template"))
    const carrier = document.createComment(`?${distributionTarget} ${encoded}?`)
    inner.content.append(carrier)
    outer.content.append(inner)
    root.append(ordinary, outer)

    hydrateDistributionInstructions(root)

    const instruction = inner.content.firstChild as ProcessingInstruction
    expect(instruction.target).toBe(distributionTarget)
    expect(decodeDistributionConfig(instruction.data)).toEqual(config("from-template"))
    expect(ordinary.data).toBe("ordinary comment")
  })

  it("fails closed on malformed carriers and duplicate targets", () => {
    const malformed = document.createComment(`?${distributionTarget} %?`)
    const root = document.createElement("div")
    root.append(malformed)
    expect(() => hydrateDistributionInstructions(root)).toThrow("Invalid distribution instruction")
    expect(malformed.parentNode).toBe(root)

    const duplicateRoot = document.createElement("div")
    const encoded = encodeDistributionConfig(config("same"))
    duplicateRoot.append(document.createComment(`?${distributionTarget} ${encoded}?`), document.createComment(`?${distributionTarget} ${encoded}?`))
    expect(() => hydrateDistributionInstructions(duplicateRoot)).toThrow("Duplicate distribution instruction")
  })

  it("writes instructions to head for void elements and removes only that target", () => {
    const root = document
    const image = root.createElement("img")
    root.body.append(image)
    const first = config("", ["edit"])
    const secondTarget = root.createElement("div")
    secondTarget.id = "other"
    root.body.append(secondTarget)
    writeDistributionConfig(secondTarget, config("other", ["move"]))

    writeDistributionConfig(image, first)
    expect(image.id).toMatch(/^ww/)
    expect(readDistributionConfigs(root)).toEqual([config("other", ["move"]), config(image.id, ["edit"])])
    writeDistributionConfig(image, null)
    expect(readDistributionConfigs(root)).toEqual([config("other", ["move"])])
  })

  it("validates explicit targets and allocates only when requested", () => {
    const root = document
    const element = root.createElement("x-widget")
    root.body.append(element)
    expect(element.id).toBe("")
    expect(ensureDistributionTarget(element)).toMatch(/^ww/)
    expect(() => writeDistributionConfig(element, config("different"))).toThrow("does not match")
    expect(readDistributionConfigs(root)).toEqual([])
  })

  it("returns the nearest whole config, including an empty child override", () => {
    const root = document
    const parent = root.createElement("section")
    const child = root.createElement("button")
    parent.id = "parent"
    child.id = "child"
    parent.append(child)
    root.body.append(parent)
    writeDistributionConfig(parent, config("parent", ["edit", "move"]))
    writeDistributionConfig(child, emptyDistributionConfig("child"))

    expect(effectiveDistribution(child)).toEqual({config: emptyDistributionConfig("child"), element: child})
    writeDistributionConfig(child, null)
    expect(effectiveDistribution(child)).toEqual({config: config("parent", ["edit", "move"]), element: parent})
    expect(getDistributionSelection(child)).toMatchObject({target: "child", local: null, effective: config("parent", ["edit", "move"]), inheritedFrom: "parent"})
  })

  it("reports duplicate referenced ids and does not mutate during selection reads", () => {
    const root = document
    const first = root.createElement("span")
    const duplicate = root.createElement("strong")
    first.id = duplicate.id = "duplicate"
    root.body.append(first, duplicate)
    root.head.append(root.createProcessingInstruction(distributionTarget, encodeDistributionConfig(config("duplicate"))))

    expect(() => effectiveDistribution(first)).toThrow("Duplicate DOM id")
    expect(getDistributionSelection(first).error).toContain("Duplicate DOM id")
    expect(first.id).toBe("duplicate")
  })

  it("keeps unrelated comments and rejects duplicate local instructions", () => {
    const root = document
    const target = root.createElement("hr")
    target.id = "target"
    root.body.append(target)
    const unrelated = root.createComment("keep")
    root.head.append(unrelated, root.createProcessingInstruction(distributionTarget, encodeDistributionConfig(config("target"))), root.createProcessingInstruction(distributionTarget, encodeDistributionConfig(config("target"))))
    expect(() => readDistributionConfigs(root)).toThrow("Duplicate distribution instruction")
    expect(unrelated.parentNode).toBe(root.head)
  })
})
