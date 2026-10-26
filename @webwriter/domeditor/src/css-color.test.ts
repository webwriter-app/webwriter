// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {colorHex, isCssColor, safeCssColor} from "./css-color"

describe("CSS color validation", () => {
  it("preserves valid browser color values", () => {
    expect(isCssColor(" rebeccapurple ")).toBe(true)
    expect(safeCssColor("rgb(20, 30, 40)")).toBe("rgb(20, 30, 40)")
  })

  it("rejects declaration injection and falls back to a safe color", () => {
    const attack = "red; background-image: url(https://attacker.test/pixel)"
    expect(isCssColor(attack)).toBe(false)
    expect(safeCssColor(attack)).toBe("#64748b")
  })
})

describe("CSS color hex matching", () => {
  it.each(["", "transparent", "currentColor", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.5)", "rgb(0 0 0 / 50%)"])("does not turn %s into an opaque swatch", value => {
    expect(colorHex(value, "")).toBe("")
    expect(colorHex(value)).toBe("#000000")
  })

  it.each([
    ["#000000", "#000000"], ["#000", "#000000"],
    ["rgb(0, 0, 0)", "#000000"], ["rgba(0, 0, 0, 1)", "#000000"],
    ["rgb(0 0 0 / 100%)", "#000000"], ["rgb(55, 60, 68)", "#373c44"],
    [" #5B9BD5 ", "#5b9bd5"], ["rgb(91, 155, 213)", "#5b9bd5"],
  ])("normalizes opaque %s to %s", (value, hex) => {
    expect(colorHex(value, "")).toBe(hex)
  })
})
