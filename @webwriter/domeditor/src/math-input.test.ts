import {describe, expect, it} from "vitest"
import {exactMathCompletion} from "./math-input"

describe("math completion previews", () => {
  it("draws cancellation marks over the placeholder", () => {
    expect([...exactMathCompletion("cancel")!.preview]).toEqual(["□", "\u0338"])
    expect([...exactMathCompletion("bcancel")!.preview]).toEqual(["□", "\u20e5"])
    expect([...exactMathCompletion("xcancel")!.preview]).toEqual(["□", "\u0338", "\u20e5"])
  })
})
