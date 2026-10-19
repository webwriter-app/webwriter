// @vitest-environment happy-dom
import {describe, expect, it} from "vitest"
import {isCssColor, safeCssColor} from "./css-color"

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
