// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {graphicShapePresets, type GraphicShapePreset} from "./graphic-shape-presets"
import {adjustGraphicPreset, graphicPresetFillRule, graphicPresetHandles, graphicPresetOptions, graphicPresetPath, readGraphicPreset, writeGraphicPreset} from "./graphic-shapes"

const bounds = {x: -137.25, y: 219.75, width: 273.5, height: 146.25}

describe("native SVG shape presets", () => {
  it("limits callouts to the six requested types and excludes freehand and omitted shapes", () => {
    expect(graphicPresetOptions.filter(option => option.category === "Callouts")).toHaveLength(6)
    expect(graphicPresetOptions.some(option => /smiley|bevel|freehand|scribble/i.test(option.type))).toBe(false)
    expect(new Set(graphicPresetOptions.map(option => option.type)).size).toBe(graphicPresetOptions.length)
  })

  it.each([
    "square-rectangle", "rounded-rectangle", "snip-one", "snip-same-side", "snip-diagonal", "snip-round",
    "round-one", "round-same-side", "round-diagonal", "parallelogram", "trapezoid", "octagon", "plaque", "cube",
    "process", "alternate-process", "data", "preparation",
  ] as const)("moves the %s corner POI across the full left half of its top edge", type => {
    const definition = graphicShapePresets[type]
    expect(definition.adjustments.length).toBeGreaterThan(0)
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", definition.label)
    element.setAttribute("d", graphicPresetPath(type, bounds))
    const name = `adjust-${definition.adjustments[0].name}`
    for(const [input, value] of [[bounds.x - bounds.width, 0], [bounds.x + bounds.width, 50]] as const) {
      expect(adjustGraphicPreset(element, readGraphicPreset(element)!, name, {x: input, y: bounds.y})).toBe(true)
      const state = readGraphicPreset(element)!
      expect(state.type).toBe(type)
      expect(state.values[0]).toBeCloseTo(value, 3)
      const handle = graphicPresetHandles(state)[0]
      expect(handle.point.x).toBeCloseTo(bounds.x + bounds.width * value / 100, 3)
      expect(handle.point.y).toBeCloseTo(bounds.y, 3)
      const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
      expect(readGraphicPreset(reloaded)!.values[0]).toBeCloseTo(value, 3)
    }
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
        before.values.forEach((previous, i) => {
          if(i !== index) expect(after!.values[i]).toBeCloseTo(previous, 3)
        })
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

  it.each(["square-rectangle", "rounded-rectangle", "snip-same-side", "snip-diagonal", "snip-round", "round-same-side", "round-diagonal"] as const)("retains legacy shared %s corners and edits them independently", type => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("aria-label", graphicShapePresets[type].label)
    element.setAttribute("d", graphicPresetPath(type, bounds, [18]))
    const state = readGraphicPreset(element)!
    expect(state.type).toBe(type)
    expect(state.values.every(value => Math.abs(value - 18) < 1e-4)).toBe(true)
    const last = state.definition.adjustments.at(-1)!
    expect(adjustGraphicPreset(element, state, `adjust-${last.name}`, 37)).toBe(true)
    const reloaded = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${element.outerHTML}</svg>`, "image/svg+xml").querySelector("path")!
    const after = readGraphicPreset(reloaded)!
    after.values.forEach((value, index) => expect(value).toBeCloseTo(index === after.values.length - 1 ? 37 : 18, 3))
  })

  it.each(["cylinder", "cube", "folded-corner", "ribbon-up", "ribbon-down", "magnetic-disk", "direct-access-storage", "sequential-access-storage"] as const)("retains saved %s paths and upgrades their fill when edited", type => {
    const definition = graphicShapePresets[type]
    const values = definition.adjustments.map(adjustment => (adjustment.min + adjustment.max) / 2)
    let index = 0
    const legacy = definition.draw(values).replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g, value => {
      const horizontal = index++ % 2 === 0
      return String((horizontal ? bounds.x : bounds.y) + Number(value) / 100 * (horizontal ? bounds.width : bounds.height))
    })
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("d", legacy)
    element.setAttribute("aria-label", definition.label)
    element.setAttribute("fill-rule", "evenodd")
    const state = readGraphicPreset(element)!
    expect(state.type).toBe(type)
    expect(state.values[0]).toBeCloseTo(values[0], 3)
    writeGraphicPreset(element, state)
    expect(element.getAttribute("d")).not.toBe(legacy)
    expect(element.getAttribute("fill-rule")).toBe("nonzero")
    expect(readGraphicPreset(element)?.type).toBe(type)
    expect(readGraphicPreset(element)!.values[0]).toBeCloseTo(values[0], 3)
  })

  it("keeps the intentional cutouts in frames, donuts and prohibited signs", () => {
    for(const type of ["frame", "donut", "prohibited"] as const) expect(graphicPresetFillRule(type)).toBe("evenodd")
  })

  it.each([20, 35, 40])("keeps prohibited cutouts symmetric at inner radius %s", radius => {
    const path = graphicPresetPath("prohibited", bounds, [radius])
    const holes = path.split(/(?=M)/).slice(1).map(contour => Array.from(contour.matchAll(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g), match => Number(match[0])))
    expect(holes).toHaveLength(2)
    expect(holes[0]).toHaveLength(14)
    holes[0].forEach((value, i) => expect(value + holes[1][i]).toBeCloseTo(i % 2 ? 2 * bounds.y + bounds.height : 2 * bounds.x + bounds.width, 4))
  })

  it.each([20, 35, 40])("retains saved prohibited symbols at radius %s and corrects their asymmetry when edited", radius => {
    const outer = graphicShapePresets.prohibited.draw([0]).split(/(?=M)/)[0]
    const r = radius
    const legacy = `${outer} M ${50-r*.7} ${50-r*.7} C ${50-r*1.5} ${50+r*.2} ${50-r*.2} ${50+r*1.5} ${50+r*.7} ${50+r*.7} Z M ${50+r*.7} ${50+r*.7-12} C ${50+r*1.5} ${50-r*.2} ${50+r*.2} ${50-r*1.5} ${50-r*.7+12} ${50-r*.7} Z`
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path")
    element.setAttribute("d", legacy)
    element.setAttribute("id", "authored-symbol")
    element.setAttribute("fill", "red")
    const state = readGraphicPreset(element)!
    expect(state.type).toBe("prohibited")
    expect(state.values[0]).toBeCloseTo(radius)
    writeGraphicPreset(element, state)
    expect(element.getAttribute("d")).not.toBe(legacy)
    expect(element.getAttribute("id")).toBe("authored-symbol")
    expect(element.getAttribute("fill")).toBe("red")
    expect(readGraphicPreset(element)?.values[0]).toBeCloseTo(radius)
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
