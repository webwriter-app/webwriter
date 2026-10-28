import { describe, expect, it } from "vitest"
import {
  distributionPermissions,
  distributionTarget,
  decodeDistributionConfig,
  encodeDistributionConfig,
  emptyDistributionConfig,
  isDistributionPermission,
  validateDistributionConfig,
} from "./distribution.js"
import type { DistributionConfig } from "./distribution.js"

const config = (overrides: Record<string, unknown> = {}): DistributionConfig => ({
  version: 1,
  target: "article-7",
  scope: "group",
  permissions: ["edit", "move"],
  add: ["element:section"],
  items: [{ id: "element:section", label: "Section", html: "<section>ok ?> <!-- keep --> </section>" }],
  ...overrides,
}) as DistributionConfig

describe("distribution config", () => {
  it("exports the stable target and known permissions", () => {
    expect(distributionTarget).toBe("ww-distribute")
    expect(distributionPermissions).toEqual(["edit", "move", "delete", "duplicate", "style"])
    expect(isDistributionPermission("style")).toBe(true)
    expect(isDistributionPermission("unknown")).toBe(false)
    for (const permission of ["text", "resize", "attributes"]) {
      expect(isDistributionPermission(permission)).toBe(false)
      expect(() => validateDistributionConfig(config({ permissions: [permission] }))).toThrow(TypeError)
    }
  })

  it("canonicalizes and round trips strings containing ?> and comments", () => {
    const input = config({ target: "stable-target", permissions: ["style", "edit"] })
    const canonical = validateDistributionConfig(input)
    expect(canonical).not.toBe(input)
    expect(canonical.items).not.toBe(input.items)
    expect(decodeDistributionConfig(encodeDistributionConfig(input))).toEqual(canonical)
  })

  it("keeps an explicit empty permissions override", () => {
    expect(validateDistributionConfig(config({ permissions: [] })).permissions).toEqual([])
    expect(emptyDistributionConfig("target")).toEqual({
      version: 1, target: "target", scope: "individual", permissions: [], add: [], items: [],
    })
  })

  it.each(["individually", "none", "", null])("rejects invalid scope %s", (scope) => {
    expect(() => validateDistributionConfig(config({ scope }))).toThrow(TypeError)
  })

  it.each(["package:*", "package-member:*", "user-snippet:*", "insert-math:*", "element:**", "widget:*", "snippet:*"])("rejects wildcard add entry %s", (entry) => {
    expect(() => validateDistributionConfig(config({ add: [entry], items: [] }))).toThrow(TypeError)
  })

  it("allows the sole element wildcard only for element item ids", () => {
    expect(validateDistributionConfig(config({ add: ["element:*"] })).items[0].id).toBe("element:section")
    expect(() => validateDistributionConfig(config({ add: ["element:*"], items: [{ id: "package:foo", label: "Foo", html: "<x></x>" }] }))).toThrow(TypeError)
  })

  it("accepts known exact add prefixes and rejects unknown prefixes", () => {
    const add = ["insert-graphic-shape:circle", "insert-math:frac", "list-style:disc", "package-member:pkg/path", "user-snippet:hello", "package:pkg"]
    expect(validateDistributionConfig(config({ add, items: [] })).add).toEqual(add)
    expect(() => validateDistributionConfig(config({ add: ["widget:chart"], items: [] }))).toThrow(TypeError)
  })

  it("rejects duplicate values and unknown fields", () => {
    expect(() => validateDistributionConfig(config({ permissions: ["edit", "edit"] }))).toThrow(TypeError)
    expect(() => validateDistributionConfig(config({ add: ["element:section", "element:section"] }))).toThrow(TypeError)
    expect(() => validateDistributionConfig(config({ items: [config().items[0], config().items[0]] }))).toThrow(TypeError)
    expect(() => validateDistributionConfig({ ...config(), extra: true })).toThrow(TypeError)
    expect(() => validateDistributionConfig(config({ items: [{ ...config().items[0], extra: true }] }))).toThrow(TypeError)
  })

  it("rejects prototype keys, non-plain objects, and malformed encodings", () => {
    const parsed = JSON.parse("{\"version\":1,\"target\":\"x\",\"scope\":\"all\",\"permissions\":[],\"add\":[],\"items\":[],\"__proto__\":{}}")
    expect(() => validateDistributionConfig(parsed)).toThrow(TypeError)
    expect(() => validateDistributionConfig(Object.assign(Object.create({ inherited: true }), config()))).toThrow(TypeError)
    expect(decodeDistributionConfig("%")).toBeNull()
    expect(decodeDistributionConfig(encodeURIComponent("{\"__proto__\":{}}"))).toBeNull()
    expect(decodeDistributionConfig(encodeURIComponent("{\"version\":2}"))).toBeNull()
  })

  it("enforces item count and per-item and aggregate HTML limits", () => {
    expect(() => validateDistributionConfig(config({ items: Array.from({ length: 257 }, (_, i) => ({ id: `element:${i}`, label: "x", html: "<x>" })), add: ["element:*"] }))).toThrow(TypeError)
    expect(() => validateDistributionConfig(config({ items: [{ id: "element:large", label: "Large", html: "x".repeat(1_000_001) }], add: ["element:*"] }))).toThrow(TypeError)
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `element:${i}`, label: "x", html: "x".repeat(900_000) }))
    expect(() => validateDistributionConfig(config({ items, add: ["element:*"] }))).toThrow(TypeError)
    expect(() => validateDistributionConfig(config({ items: [{ id: "element:empty", label: "Empty", html: "" }], add: ["element:*"] }))).toThrow(TypeError)
  })
})
