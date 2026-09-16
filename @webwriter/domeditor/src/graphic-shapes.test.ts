// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {graphicShapePresets, type GraphicShapePreset} from "./graphic-shape-presets"
import {adjustGraphicPreset, graphicPresetHandles, graphicPresetOptions, graphicPresetPath, readGraphicPreset, writeGraphicPreset} from "./graphic-shapes"

const bounds = {x: -137.25, y: 219.75, width: 273.5, height: 146.25}

describe("native SVG shape presets", () => {
  it("limits callouts to the six requested types and excludes freehand and omitted shapes", () => {
    expect(graphicPresetOptions.filter(option => option.category === "Callouts")).toHaveLength(6)
    expect(graphicPresetOptions.some(option => /smiley|bevel|freehand|scribble/i.test(option.type))).toBe(false)
    expect(new Set(graphicPresetOptions.map(option => option.type)).size).toBe(graphicPresetOptions.length)
  })

  it.each(graphicPresetOptions)("recovers $label geometry and adjustments from serialized SVG", option => {
    const definition: GraphicShapePreset = graphicShapePresets[option.type]
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", option.label)
    element.setAttribute("d", graphicPresetPath(option.type, bounds))
    expect(element.getAttribute("d")).not.toMatch(/NaN|Infinity/)
    const parsed = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml")
    const reloaded = parsed.querySelector("path")!
    const state = readGraphicPreset(reloaded)
    expect(state?.type).toBe(option.type)
    for(const key of ["x", "y", "width", "height"] as const) expect(state!.bounds[key]).toBeCloseTo(bounds[key], 3)
    definition.adjustments.forEach((adjustment, index) => expect(state!.values[index]).toBeCloseTo(adjustment.default, 3))
    expect(graphicPresetHandles(state!).length).toBeGreaterThan(0)

    definition.adjustments.forEach((adjustment, index) => {
      for(const value of [adjustment.min, (adjustment.min + adjustment.max) / 2, adjustment.max]) {
        const before = readGraphicPreset(reloaded)!
        expect(adjustGraphicPreset(reloaded, before, `adjust-${adjustment.name}`, value)).toBe(true)
        const after = readGraphicPreset(reloaded)
        expect(after?.type, `${adjustment.name}=${value}`).toBe(option.type)
        expect(after!.values[index]).toBeCloseTo(value, 3)
        for(const key of ["x", "y", "width", "height"] as const) expect(after!.bounds[key]).toBeCloseTo(bounds[key], 3)
      }
      const current = readGraphicPreset(reloaded)!
      const target = (adjustment.min + adjustment.max) / 2
      const nextValues = [...current.values]
      nextValues[index] = target
      const handle = adjustment.point(nextValues)
      expect(adjustGraphicPreset(reloaded, current, `adjust-${adjustment.name}`, {
        x: bounds.x + handle.x / 100 * bounds.width,
        y: bounds.y + handle.y / 100 * bounds.height,
      })).toBe(true)
      expect(readGraphicPreset(reloaded)!.values[index]).toBeCloseTo(target, 3)
    })
    const before = readGraphicPreset(reloaded)!
    const moved = {x: 75, y: -40, width: 180, height: 320}
    writeGraphicPreset(reloaded, before, moved)
    const after = readGraphicPreset(reloaded)!
    expect(after.type).toBe(option.type)
    before.values.forEach((value, i) => expect(after.values[i]).toBeCloseTo(value, 3))
    for(const key of ["x", "y", "width", "height"] as const) expect(after.bounds[key]).toBeCloseTo(moved[key], 3)
  })

  it("does not reinterpret an unrelated or externally changed path using its accessible name", () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const option = graphicPresetOptions[0]
    element.setAttribute("aria-label", option.label)
    element.setAttribute("d", graphicPresetPath(option.type, bounds))
    expect(readGraphicPreset(element)).not.toBeNull()
    element.setAttribute("d", "M 0 0 C 3 17 93 22 19 37 L 37 29 Z")
    expect(readGraphicPreset(element)).toBeNull()
    expect(element.getAttribute("d")).toBe("M 0 0 C 3 17 93 22 19 37 L 37 29 Z")
  })
})
