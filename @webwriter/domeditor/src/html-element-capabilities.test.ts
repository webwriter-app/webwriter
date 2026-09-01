// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {
  htmlElementCapabilities,
  htmlElementSupportCounts,
  htmlLivingStandardElementIndex,
  htmlLivingStandardElementNames,
} from "./html-element-capabilities"
import {
  deliberatelyUnsupportedInsertionTags,
  insertionMenuItems,
} from "./components/insertion-menu"
import {
  deliberatelyUnsupportedElementNames,
  elementEditingLimitation,
} from "./element-attributes"

const sorted = (values: Iterable<string>) => [...values].sort()

describe("HTML Living Standard capability coverage", () => {
  it("tracks every indexed element exactly once and requires one capability decision", () => {
    expect(htmlLivingStandardElementIndex).toEqual({
      url: "https://html.spec.whatwg.org/multipage/indices.html#elements",
      checked: "2026-08-31",
    })
    expect(htmlLivingStandardElementNames).toHaveLength(116)
    expect(new Set(htmlLivingStandardElementNames)).toHaveLength(116)
    expect(Object.keys(htmlElementCapabilities)).toEqual([...htmlLivingStandardElementNames])
  })

  it("keeps the reviewed support totals and remaining gaps explicit", () => {
    expect(htmlElementSupportCounts()).toEqual({full: 103, partial: 11, none: 2})
    expect(sorted(Object.entries(htmlElementCapabilities)
      .filter(([, capability]) => capability.support === "partial")
      .map(([name]) => name))).toEqual(sorted([
      "canvas", "iframe", "link", "math", "noscript", "object", "picture", "slot", "source", "template",
      "autonomous-custom-elements",
    ]))
    expect(sorted(Object.entries(htmlElementCapabilities)
      .filter(([, capability]) => capability.support === "none")
      .map(([name]) => name))).toEqual(["script", "style"])
  })

  it("keeps direct visual insertion in agreement with the actual built-in menu", () => {
    const actual = insertionMenuItems.flatMap(item => item.tag ? [item.tag] : [])
    const declared = Object.entries(htmlElementCapabilities)
      .flatMap(([name, capability]) => capability.insertion === "menu" ? [name] : [])

    expect(sorted(new Set(actual))).toEqual(sorted(declared))
    expect(actual).toHaveLength(new Set(actual).size)
  })

  it("keeps Batch 6 and 7 limitations aligned with policy and insertion", () => {
    expect(deliberatelyUnsupportedElementNames).toEqual([
      "script", "style", "canvas", "template", "noscript", "slot",
    ])
    for(const name of deliberatelyUnsupportedElementNames) {
      expect(htmlElementCapabilities[name].intentionallyRestricted).toBe(true)
      expect(elementEditingLimitation(name)?.guidance).toBeTruthy()
    }
    for(const name of deliberatelyUnsupportedInsertionTags) {
      expect(htmlElementCapabilities[name].insertion).not.toBe("menu")
      expect(insertionMenuItems.some(item => item.tag === name)).toBe(false)
    }
    expect(sorted(Object.entries(htmlElementCapabilities)
      .filter(([, capability]) => capability.intentionallyRestricted)
      .map(([name]) => name))).toEqual(sorted([
      "script", "style", "canvas", "template", "noscript", "slot", "iframe", "link",
      "autonomous-custom-elements",
    ]))
  })

  it("provides concise user-facing documentation and a responsible feature for every entry", () => {
    for(const [name, capability] of Object.entries(htmlElementCapabilities)) {
      expect(capability.comment, name).toMatch(/\S/)
      expect(capability.comment, name).not.toMatch(/[<>]/)
      expect(capability.comment, name).toMatch(/[.!]$/)
      expect(capability.owner, name).toMatch(/^[a-z]+$/)
      expect(typeof capability.contentEditing, name).toBe("boolean")
      expect(typeof capability.attributeEditing, name).toBe("boolean")
      expect(typeof capability.structuralEditing, name).toBe("boolean")
    }
  })

  it("does not claim editable content for void elements or editable attributes for active content", () => {
    const voidElements = [
      "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
    ] as const
    for(const name of voidElements) expect(htmlElementCapabilities[name].contentEditing, name).toBe(false)

    expect(sorted(Object.entries(htmlElementCapabilities)
      .filter(([, capability]) => !capability.attributeEditing)
      .map(([name]) => name))).toEqual(["script", "style"])
  })
})
