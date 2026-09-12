import {describe, expect, it} from "vitest"
import {
  layoutPlacement,
  parseLayoutTracks,
  remapLayoutPlacement,
} from "./layouts"

describe("layout track parsing", () => {
  it("keeps finite track tokens, including nested sizing functions", () => {
    expect(parseLayoutTracks("minmax(0, 1fr) 240px 25% auto")).toEqual([
      "minmax(0, 1fr)",
      "240px",
      "25%",
      "auto",
    ])
    expect(parseLayoutTracks("fit-content(30rem) calc(50% - 1rem)")).toEqual([
      "fit-content(30rem)",
      "calc(50% - 1rem)",
    ])
  })

  it("expands supported integer repeat declarations", () => {
    expect(parseLayoutTracks("repeat(2, minmax(0, 1fr)) auto")).toEqual([
      "minmax(0, 1fr)",
      "minmax(0, 1fr)",
      "auto",
    ])
    expect(parseLayoutTracks("REPEAT(2, 10ch 1fr)")).toEqual(["10ch", "1fr", "10ch", "1fr"])
  })

  it("rejects topology and values that cannot be edited safely", () => {
    expect(parseLayoutTracks("")).toBeNull()
    expect(parseLayoutTracks("none")).toBeNull()
    expect(parseLayoutTracks("[content] 1fr")).toBeNull()
    expect(parseLayoutTracks("var(--tracks)")).toBeNull()
    expect(parseLayoutTracks("env(--tracks)")).toBeNull()
    expect(parseLayoutTracks("subgrid")).toBeNull()
    expect(parseLayoutTracks("repeat(auto-fit, minmax(12rem, 1fr))")).toBeNull()
    expect(parseLayoutTracks("-1px 1fr")).toBeNull()
    expect(parseLayoutTracks("1fr bad-function(1rem)")).toBeNull()
  })
})

describe("layout placement", () => {
  it("resolves automatic, numeric, negative, and span placements", () => {
    expect(layoutPlacement("auto", "auto", 4)).toBe("auto")
    expect(layoutPlacement("1", "3", 4)).toEqual([1, 3])
    expect(layoutPlacement("2", "auto", 4)).toEqual([2, 3])
    expect(layoutPlacement("auto", "3", 4)).toEqual([2, 3])
    expect(layoutPlacement("-2", "-1", 4)).toEqual([4, 5])
    expect(layoutPlacement("2", "span 2", 4)).toEqual([2, 4])
    expect(layoutPlacement("span 2", "4", 4)).toEqual([2, 4])
  })

  it("rejects ambiguous or out-of-range placements", () => {
    expect(layoutPlacement("0", "2", 4)).toBeNull()
    expect(layoutPlacement("1", "6", 4)).toBeNull()
    expect(layoutPlacement("named", "2", 4)).toBeNull()
    expect(layoutPlacement("1", "span 0", 4)).toBeNull()
    expect(layoutPlacement("auto", "span 2", 4)).toBeNull()
    expect(layoutPlacement("span 2", "span 3", 4)).toBeNull()
  })
})

describe("layout placement remapping", () => {
  it("shifts lines around an inserted boundary", () => {
    // index is the zero-based track index; insertion happens at its line.
    expect(remapLayoutPlacement([1, 2], 0, false)).toEqual([2, 3])
    expect(remapLayoutPlacement([2, 3], 0, false)).toEqual([3, 4])
    expect(remapLayoutPlacement([1, 2], 1, false)).toEqual([1, 2])
    expect(remapLayoutPlacement([2, 3], 1, false)).toEqual([3, 4])
    expect(remapLayoutPlacement([1, 3], 1, false)).toEqual([1, 4])
  })

  it("preserves surviving placements and makes removed-only items automatic", () => {
    expect(remapLayoutPlacement([1, 2], 0, true)).toBe("auto")
    expect(remapLayoutPlacement([2, 3], 0, true)).toEqual([1, 2])
    expect(remapLayoutPlacement([1, 3], 0, true)).toEqual([1, 2])
    expect(remapLayoutPlacement([1, 2], 1, true)).toEqual([1, 2])
    expect(remapLayoutPlacement([2, 3], 1, true)).toBe("auto")
    expect(remapLayoutPlacement([1, 3], 1, true)).toEqual([1, 2])
  })
})
