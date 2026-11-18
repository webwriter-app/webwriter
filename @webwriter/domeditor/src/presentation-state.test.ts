// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {clearEditorPresentation, clearPresentationState, deferPresentationPaint, hasPresentationState, presentationElementSelector, presentationStateElements, refreshPresentationStyles, resolvePresentationSelector, setPresentationState, trackPresentationStyles} from "./presentation-state.js"

afterEach(() => document.body.replaceChildren())

describe("presentation state", () => {
  it("mirrors selection to widget-owned native states without changing authored HTML", () => {
    const widget = document.createElement("selection-widget")
    // Happy DOM has no ElementInternals; the browser tests exercise native :state().
    const states = new Set(["widget-owned"])
    Object.defineProperty(widget, "selectionStates", {value: states})
    widget.innerHTML = "<p>Authored</p>"
    document.body.append(widget)
    const html = widget.outerHTML

    setPresentationState(widget, "element-selected")
    setPresentationState(widget, "element-capture-selected")
    setPresentationState(widget, "element-hovered")
    expect([...states]).toEqual(["widget-owned", "ww-element-selected", "ww-element-capture-selected"])
    clearPresentationState(widget, "element-capture-selected")
    expect([...states]).toEqual(["widget-owned", "ww-element-selected"])
    expect(widget.outerHTML).toBe(html)
    expect(widget.cloneNode(true)).not.toHaveProperty("selectionStates")

    widget.remove()
    clearEditorPresentation(document)
    expect([...states]).toEqual(["widget-owned"])
  })

  it("clears native selection states on removed or adopted widgets during refresh", () => {
    for(const adopted of [false, true]) {
      const widget = document.createElement("selection-widget")
      const states = new Set<string>()
      Object.defineProperty(widget, "selectionStates", {value: states})
      document.body.append(widget)
      setPresentationState(widget, "element-selected")
      setPresentationState(widget, "element-capture-selected")
      if(adopted) document.implementation.createHTMLDocument().body.append(widget)
      else widget.remove()
      refreshPresentationStyles(document)
      expect(states.size).toBe(0)
      expect(hasPresentationState(widget, "element-selected")).toBe(false)
    }
  })

  it("does not attach internals or require native states on other elements", () => {
    const widget = document.createElement("ordinary-widget")
    const attach = vi.fn(() => { throw new Error("Already attached") })
    Object.defineProperty(widget, "attachInternals", {value: attach})
    document.body.append(widget)
    setPresentationState(widget, "element-selected")
    expect(hasPresentationState(widget, "element-selected")).toBe(true)
    expect(attach).not.toHaveBeenCalled()
    clearPresentationState(widget, "element-selected")
  })

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

  it("keeps the path of an element out of compounds that name another element type", () => {
    document.body.innerHTML = "<p>one</p><p>two</p><p>three</p>"
    const paragraph = document.body.children[1]
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
      body:state(ww-empty-selected), body:state(ww-empty-selected) * { caret-color: transparent; }
      html:not(:state(ww-canvas-active)) body:state(ww-empty-selected)::part(caret) { display: block; }
      summary:is(:empty, [hidden]):state(ww-empty-selected)::before { content: ""; }
      :state(ww-empty-selected) { outline: 1px solid; }
      :is(td, p):state(ww-empty-selected) { color: red; }
      P:state(ww-empty-selected) > span { color: blue; }
    `)
    const release = trackPresentationStyles(document, sheet)
    const selector = (index: number) => (sheet.cssRules[index] as CSSStyleRule).selectorText
    try {
      setPresentationState(paragraph, "empty-selected")
      // A positional path in front of a descendant makes the style engine
      // restyle every sibling subtree on each insertion, even where the
      // compound can never match the element.
      expect(selector(0)).toBe("body.ww-inactive-presentation:not(*), body.ww-inactive-presentation:not(*) *")
      expect(selector(1)).toBe("html:not(.ww-inactive-presentation:not(*)) body.ww-inactive-presentation:not(*)::part(caret)")
      expect(selector(2)).not.toContain("nth-child")
      expect(selector(3)).toContain("body > p:nth-child(2)")
      expect(selector(4)).toContain("body > p:nth-child(2)")
      expect(selector(5)).toContain("body > p:nth-child(2)")
      expect(resolvePresentationSelector(document, "body:state(ww-empty-selected)")).toBe("body.ww-inactive-presentation:not(*)")
      expect(resolvePresentationSelector(document, "p:state(ww-empty-selected)")).toBe("p:where(:root > body > p:nth-child(2)):not(.ww-inactive-presentation)")

      setPresentationState(document.body, "empty-selected")
      expect(selector(0)).toBe("body:where(body):not(.ww-inactive-presentation), body:where(body):not(.ww-inactive-presentation) *")
      expect(selector(3)).toContain("body > p:nth-child(2), body")
      expect(paragraph.outerHTML).toBe("<p>two</p>")
    }
    finally {
      clearPresentationState(paragraph, "empty-selected")
      clearPresentationState(document.body, "empty-selected")
      release()
      expect(selector(0)).toBe("body:state(ww-empty-selected), body:state(ww-empty-selected) *")
      expect(selector(5).toLowerCase()).toBe("p:state(ww-empty-selected) > span")
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

  it("installs paint-only rules once when an update clears a state and sets it again", () => {
    document.body.innerHTML = "<p>one</p><p>two</p>"
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
      body:state(ww-node-selection-active), body:state(ww-node-selection-active) * { caret-color: transparent !important; cursor: default; }
      body:state(ww-node-selection-active) *::selection { background: transparent; }
      body:state(ww-node-selection-active) { margin-block-end: 1em; caret-color: transparent; }
    `)
    const release = trackPresentationStyles(document, sheet)
    // Read the rules again each time: a DOM without a writable selectorText
    // has them replaced.
    const text = (index: number) => (sheet.cssRules[index] as CSSStyleRule).selectorText
    const writes: string[][] = [[], [], []]
    const snapshot = () => writes.forEach((seen, index) => { if(seen.at(-1) !== text(index)) seen.push(text(index)) })
    const active = "body:where(body):not(.ww-inactive-presentation)", inactive = "body.ww-inactive-presentation:not(*)"
    try {
      setPresentationState(document.body, "node-selection-active")
      snapshot()
      deferPresentationPaint(document, () => {
        clearPresentationState(document.body, "node-selection-active")
        snapshot()
        // Geometry follows the state immediately; caret, cursor and selection
        // paint wait for the end of the update.
        expect(text(0)).toBe(`${active}, ${active} *`)
        expect(text(1)).toBe(`${active} *::selection`)
        expect(text(2)).toBe(inactive)
        setPresentationState(document.body, "node-selection-active")
        snapshot()
      })
      snapshot()
      expect(writes[0]).toEqual([`${active}, ${active} *`])
      expect(writes[1]).toEqual([`${active} *::selection`])
      expect(writes[2]).toEqual([active, inactive, active])

      // A state that stays cleared is installed when the update ends, also
      // when the update throws.
      expect(() => deferPresentationPaint(document, () => {
        clearPresentationState(document.body, "node-selection-active")
        expect(text(0)).toBe(`${active}, ${active} *`)
        throw new Error("failed")
      })).toThrow("failed")
      expect(text(0)).toBe(`${inactive}, ${inactive} *`)
      expect(text(1)).toBe(`${inactive} *::selection`)

      // Outside such an update every rule changes immediately.
      setPresentationState(document.body, "node-selection-active")
      expect(text(0)).toBe(`${active}, ${active} *`)
      expect(document.body.outerHTML).toBe("<body><p>one</p><p>two</p></body>")
    }
    finally {
      clearPresentationState(document.body, "node-selection-active")
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
