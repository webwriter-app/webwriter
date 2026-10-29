// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {
  filterPresetsChangeEvent,
  filterPresetsStorageKey,
  filterPresetValue,
  loadFilterPresets,
  newFilterPreset,
  saveFilterPreset,
  type FilterPreset,
  type FilterType,
} from "./filter-presets"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.removeItem(filterPresetsStorageKey)
})

describe("filter preset CSS values", () => {
  it.each([
    {type: "blur", values: [0], expected: "blur(0px)"},
    {type: "brightness", values: [0], expected: "brightness(0)"},
    {type: "contrast", values: [250], expected: "contrast(2.5)"},
    {type: "drop-shadow", values: [-2.5, 3.25, 0], color: "#a1B2c3", expected: "drop-shadow(-2.5px 3.25px 0px #a1B2c3)"},
    {type: "grayscale", values: [100], expected: "grayscale(1)"},
    {type: "hue-rotate", values: [-45.5], expected: "hue-rotate(-45.5deg)"},
    {type: "invert", values: [50], expected: "invert(0.5)"},
    {type: "opacity", values: [75.25], expected: "opacity(0.7525)"},
    {type: "saturate", values: [0], expected: "saturate(0)"},
    {type: "sepia", values: [100], expected: "sepia(1)"},
  ] as {type: FilterType, values: number[], color?: string, expected: string}[])("generates $expected", ({type, values, color, expected}) => {
    expect(filterPresetValue({type, values, color: color ?? "#000000"})).toBe(expected)
  })

  it.each([
    ["blur", [-0.01]],
    ["blur", [Number.POSITIVE_INFINITY]],
    ["brightness", [-1]],
    ["grayscale", [100.01]],
    ["hue-rotate", [Number.NaN]],
    ["invert", [-0.01]],
    ["opacity", [100.01]],
    ["sepia", [101]],
    ["drop-shadow", [1, 2, -0.01]],
    ["drop-shadow", [1, 2, 3, 4]],
  ] as [FilterType, number[]][])("rejects out-of-bounds or malformed %s values %j", (type, values) => {
    expect(filterPresetValue({type, values, color: "#000000"})).toBeNull()
  })

  it("requires a six-digit hex color for drop shadow", () => {
    for(const color of ["red", "#fff", "#12345678", "url(x)", ""]) {
      expect(filterPresetValue({type: "drop-shadow", values: [1, 2, 3], color})).toBeNull()
    }
    expect(filterPresetValue({type: "drop-shadow", values: [1, 2, 3], color: "#ABCDEF"})).toContain("#ABCDEF")
  })

  it("uses the declared defaults for each filter type", () => {
    expect(newFilterPreset("drop-shadow")).toEqual({type: "drop-shadow", values: [2, 2, 4], color: "#000000"})
    expect(newFilterPreset("hue-rotate")).toEqual({type: "hue-rotate", values: [90], color: "#000000"})
  })
})

describe("filter preset storage", () => {
  it("round trips presets, deduplicates by generated CSS, and merges with current storage", () => {
    const original = newFilterPreset("blur")
    saveFilterPreset(original)
    saveFilterPreset({...original, values: [2]})
    expect(loadFilterPresets()).toEqual([original])

    const newerStored = newFilterPreset("sepia")
    localStorage.setItem(filterPresetsStorageKey, JSON.stringify([newerStored]))
    const contrast = newFilterPreset("contrast")
    const changed = vi.fn()
    window.addEventListener(filterPresetsChangeEvent, changed)
    saveFilterPreset(contrast)
    window.removeEventListener(filterPresetsChangeEvent, changed)

    expect(loadFilterPresets()).toEqual([newerStored, contrast])
    expect(JSON.parse(localStorage.getItem(filterPresetsStorageKey)!)).toEqual([newerStored, contrast])
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it("filters malformed, invalid, duplicate, and untrusted stored entries", () => {
    const valid = newFilterPreset("brightness")
    localStorage.setItem(filterPresetsStorageKey, JSON.stringify([
      valid,
      {...valid, ignored: "extra field"},
      null,
      42,
      "brightness(1)",
      {type: "unknown", values: [1], color: "#000000"},
      {type: "brightness", values: [Infinity], color: "#000000"},
      {type: "opacity", values: [1000], color: "#000000"},
      {type: "drop-shadow", values: [1, 2, 3], color: "url(https://example.test)"},
      {type: "blur", values: [1, 2], color: "#000000"},
    ]))

    expect(loadFilterPresets()).toEqual([valid])
    localStorage.setItem(filterPresetsStorageKey, "not JSON")
    expect(loadFilterPresets()).toEqual([])
    localStorage.setItem(filterPresetsStorageKey, JSON.stringify({type: "blur", values: [2]}))
    expect(loadFilterPresets()).toEqual([])
  })

  it("returns an empty list when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    expect(loadFilterPresets()).toEqual([])
  })

  it("rejects invalid presets and propagates storage write errors", () => {
    expect(() => saveFilterPreset({type: "blur", values: [-1], color: "#000000"})).toThrow("Choose valid filter settings.")
    const preset: FilterPreset = newFilterPreset("blur")
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("quota exceeded") })
    expect(() => saveFilterPreset(preset)).toThrow("quota exceeded")
  })
})
