// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {clearPresentationState, hasPresentationState, presentationElementSelector, presentationStateElements, resolvePresentationSelector, setPresentationState, trackPresentationStyles} from "./presentation-state.js"

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
      expect(selector()).toContain("p:first-child")
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

  it("decides a BODY:has() state test itself and leaves no :has() for the style engine", async () => {
    document.body.innerHTML = "<section><p>one</p></section><p>two</p>"
    const direct = document.body.lastElementChild!
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
      body:not(.plain):has(> p:state(ww-element-hovered):last-child)::part(caret) { color: red; }
      section:has(> :state(ww-element-hovered)) { color: blue; }
    `)
    // Happy DOM answers :has(:where(…)) incorrectly. Stand in for the engine:
    // the probe is supported, and BODY's answer is what the test dictates.
    const matches = Element.prototype.matches
    let answer = false
    const asked: string[] = []
    const engine = vi.spyOn(Element.prototype, "matches").mockImplementation(function(this: Element, selector: string) {
      if(selector === ":has(:where(p))") return true
      if(selector === ":has(:where(div))") return false
      if(this === document.body && selector.startsWith(":has(")) { asked.push(selector); return answer }
      return matches.call(this, selector)
    })
    const release = trackPresentationStyles(document, sheet)
    const selector = (index: number) => (sheet.cssRules[index] as CSSStyleRule).selectorText
    try {
      // No element is in the state: decided without asking the engine.
      expect(asked).toEqual([])
      expect(selector(0)).toBe("body:not(.plain):is(p.ww-inactive-presentation:not(*):last-child):not(*)::part(caret)")
      // Another element's test stays in CSS, where its effect is local.
      expect(selector(1)).toContain("section:has(> ")

      answer = true
      setPresentationState(direct, "element-hovered")
      expect(asked).toHaveLength(1)
      expect(asked[0]).toMatch(/^:has\(> p:where\(.*body > p:last-child\):not\(\.ww-inactive-presentation\):last-child\)$/)
      // True, with the specificity of the test it replaces.
      expect(selector(0)).toBe("body:not(.plain):not(:is(p.ww-inactive-presentation:not(*):last-child):not(*))::part(caret)")
      expect(selector(0)).not.toContain(":has(")

      // The decision follows the document around the element, not only the state.
      answer = false
      direct.after(document.createElement("p"))
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(asked).toHaveLength(2)
      expect(selector(0)).toBe("body:not(.plain):is(p.ww-inactive-presentation:not(*):last-child):not(*)::part(caret)")
      expect(direct.outerHTML).toBe("<p>two</p>")
    }
    finally {
      clearPresentationState(direct, "element-hovered")
      release()
      engine.mockRestore()
      expect(selector(0)).toContain(":has(> p:state(ww-element-hovered):last-child)")
    }
  })

  it("leaves a BODY:has() state test to CSS where the engine cannot decide it", () => {
    document.body.innerHTML = "<p>one</p>"
    const sheet = new CSSStyleSheet()
    sheet.replaceSync("body:has(:state(ww-element-hovered))::part(caret) { display: block; }")
    const engine = vi.spyOn(Element.prototype, "matches").mockImplementation(() => false)
    const release = trackPresentationStyles(document, sheet)
    try {
      setPresentationState(document.body.firstElementChild, "element-hovered")
      expect((sheet.cssRules[0] as CSSStyleRule).selectorText).toMatch(/^body:has\(:where\(.*\):not\(\.ww-inactive-presentation\)\)::part\(caret\)$/)
    }
    finally {
      clearPresentationState(document.body.firstElementChild, "element-hovered")
      release()
      engine.mockRestore()
    }
  })

  it("states a position only where an edge child or an authored ID cannot identify the element", () => {
    document.body.innerHTML = '<main><p>one</p><figure id="figure"><img><span></span><figcaption>two</figcaption></figure><p>three</p></main>'
    const [first, figure, last] = Array.from(document.querySelector("main")!.children)
    expect(presentationElementSelector(first, true)).toBe(":root > body > main:first-child > p:first-child")
    expect(presentationElementSelector(last, true)).toBe(":root > body > main:first-child > p:last-child")
    expect(presentationElementSelector(figure, true)).toBe("#figure")
    expect(presentationElementSelector(figure)).toBe(":root > body > main:first-child > figure:nth-child(2)")
    // Below the ID no rule tests the position of a block among its siblings.
    expect(presentationElementSelector(figure.children[0], true)).toBe("#figure > img:first-child")
    expect(presentationElementSelector(figure.children[1], true)).toBe("#figure > span:nth-child(2)")
    expect(presentationElementSelector(figure.children[2], true)).toBe("#figure > figcaption:last-child")
    for(const element of [first, last, figure, ...Array.from(figure.children)]) {
      expect(document.querySelectorAll(presentationElementSelector(element, true)!)).toHaveLength(1)
      expect(document.querySelector(presentationElementSelector(element, true)!)).toBe(element)
    }
    // An ambiguous ID identifies nothing.
    last.id = "figure"
    expect(presentationElementSelector(figure.children[0], true)).toBe(":root > body > main:first-child > figure:nth-child(2) > img:first-child")
    expect(document.body.innerHTML).toBe('<main><p>one</p><figure id="figure"><img><span></span><figcaption>two</figcaption></figure><p id="figure">three</p></main>')
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
