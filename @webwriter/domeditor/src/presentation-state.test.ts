// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {clearPresentationState, hasPresentationState, presentationStateElements, setPresentationState, trackPresentationStyles} from "./presentation-state.js"

afterEach(() => document.body.replaceChildren())

describe("presentation state", () => {
  it("targets a live element after a sibling insertion without changing its attributes", async () => {
    document.body.innerHTML = '<p class="authored">one</p><p>two</p>'
    const target = document.body.firstElementChild!
    const sheet = new CSSStyleSheet()
    sheet.replaceSync("p:state(ww-element-selected) { color: red; }")
    const release = trackPresentationStyles(document, sheet)
    const selector = () => (sheet.cssRules[0] as CSSStyleRule).selectorText
    try {
      setPresentationState(target, "element-selected")
      expect(selector()).toContain(":nth-child(1)")
      target.before(document.createElement("p"))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(selector()).toContain(":nth-child(2)")
      expect(target.outerHTML).toBe('<p class="authored">one</p>')
      expect(presentationStateElements(document, "element-selected")).toEqual([target])
      expect(hasPresentationState(target.cloneNode(true) as Element, "element-selected")).toBe(false)
    }
    finally {
      clearPresentationState(target, "element-selected")
      expect(document.querySelector(selector())).toBeNull()
      release()
    }
  })

  it("uses an authored ID for dialog presentation and revalidates changes to it", async () => {
    document.body.innerHTML = '<dialog id="original"></dialog>'
    const target = document.querySelector("dialog")!
    const sheet = new CSSStyleSheet()
    sheet.replaceSync("dialog:state(ww-dialog-editing) { display: block; }")
    const release = trackPresentationStyles(document, sheet)
    try {
      setPresentationState(target, "dialog-editing")
      expect((sheet.cssRules[0] as CSSStyleRule).selectorText).toContain("#original")
      target.id = "updated"
      await new Promise(resolve => setTimeout(resolve, 0))
      expect((sheet.cssRules[0] as CSSStyleRule).selectorText).toContain("#updated")
      expect(target.getAttribute("open")).toBeNull()
      expect(target.getAttribute("class")).toBeNull()
    }
    finally {
      clearPresentationState(target, "dialog-editing")
      release()
    }
  })
})
