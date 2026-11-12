import {describe, expect, it} from "vitest"
import {fixedPopupPosition} from "./popup-position"

describe("fixedPopupPosition", () => {
  it("keeps a popup below its trigger when there is room", () => {
    expect(fixedPopupPosition(
      {left: 24, top: 40, bottom: 64},
      {width: 120, height: 80},
      {width: 500, height: 400},
    )).toEqual({left: 24, top: 68})
  })

  it("clamps the popup to the viewport edge and places it above when needed", () => {
    expect(fixedPopupPosition(
      {left: 440, top: 330, bottom: 354},
      {width: 120, height: 100},
      {width: 500, height: 400},
    )).toEqual({left: 372, top: 226})
  })

  it("prefers above the trigger when requested and there is room", () => {
    expect(fixedPopupPosition(
      {left: 24, top: 140, bottom: 164},
      {width: 120, height: 80},
      {width: 500, height: 400},
      8,
      4,
      "above",
    )).toEqual({left: 24, top: 56})
  })

  it("uses below when above is requested but there is not enough room", () => {
    expect(fixedPopupPosition(
      {left: 24, top: 40, bottom: 64},
      {width: 120, height: 80},
      {width: 500, height: 400},
      8,
      4,
      "above",
    )).toEqual({left: 24, top: 68})
  })

  it("preserves the existing origin clamp for popups larger than the viewport", () => {
    expect(fixedPopupPosition(
      {left: 40, top: 40, bottom: 64},
      {width: 700, height: 600},
      {width: 500, height: 400},
    )).toEqual({left: 8, top: 8})
  })
})
