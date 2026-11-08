// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {createAnchorPositioner} from "./anchor-positioning.js"
import {presentationStateElements} from "./presentation-state.js"

const sheets = () => [...document.adoptedStyleSheets]
const source = (sheet: CSSStyleSheet) => Array.from(sheet.cssRules, rule => rule.cssText).join("\n")
const anchorIndex = (css: string) => css.match(/--ww-ui-anchor-(\d+)/)?.[1]
let positioners: ReturnType<typeof createAnchorPositioner>[] = []

const positioner = () => {
  const value = createAnchorPositioner(document)
  positioners.push(value)
  return value
}

afterEach(() => {
  for(const value of positioners) value.destroy()
  positioners = []
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("shared UI anchor positioning", () => {
  it("does not recompute another owner's stable anchors for an empty refresh", () => {
    document.body.innerHTML = "<button></button><div>Target</div>"
    const control = document.querySelector("button")!, target = document.querySelector("div")!
    const owner = positioner(), idle = positioner()
    owner.bind(control, target)
    owner.refresh()
    const style = vi.spyOn(window, "getComputedStyle")
    idle.refresh()
    expect(style).not.toHaveBeenCalled()
    owner.release(control)
    idle.refresh()
    expect(control.className).toBe("")
    expect(target.className).toBe("")
    expect(sheets().some(sheet => source(sheet).includes("--ww-ui-anchor-"))).toBe(false)
  })

  it("calibrates a Gecko frame against its target when the gutter estimate is short", () => {
    document.body.innerHTML = '<button id="frame"></button><p>Target</p>'
    const frame = document.querySelector("button")!
    const target = document.querySelector("p")!
    const root = document.documentElement
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Firefox")
    vi.spyOn(root, "clientWidth", "get").mockReturnValue(window.innerWidth - 30)
    const computed = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
      element === root ? {scrollbarGutter: "stable both-edges"} as CSSStyleDeclaration : computed(element, pseudo))
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({left: 100, width: 200, height: 30} as DOMRect)
    vi.spyOn(frame, "getBoundingClientRect").mockImplementation(() => {
      const css = (document as any)[Symbol.for("webwriter.anchor-positioning")].sheets.get(document).source as string
      const offset = Number(css.match(/anchor\(left\) - ([\d.]+)px/)?.[1] ?? 0)
      return {left: 130 - offset, width: 200, height: 30} as DOMRect
    })
    const ui = positioner()
    ui.bind(frame, target)
    ui.refresh()
    const css = (document as any)[Symbol.for("webwriter.anchor-positioning")].sheets.get(document).source as string
    expect(css).toContain("anchor(left) - 30px")
  })

  it("corrects the Gecko leading gutter for default frames and refreshes when the gutter changes", () => {
    document.body.innerHTML = '<button id="frame"></button><button id="custom"></button><p>Target</p>'
    const [frame, custom] = document.querySelectorAll("button")
    const target = document.querySelector("p")!
    const root = document.documentElement
    let gutter = "stable both-edges"
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Firefox")
    vi.spyOn(root, "clientWidth", "get").mockReturnValue(window.innerWidth - 30)
    const computed = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
      element === root ? {scrollbarGutter: gutter} as CSSStyleDeclaration : computed(element, pseudo))
    const ui = positioner()
    ui.bind(frame, target)
    ui.bind(custom, target, "left:anchor(right);top:anchor(top)")
    ui.refresh()
    const css = () => (document as any)[Symbol.for("webwriter.anchor-positioning")].sheets.get(document).source as string
    expect(css()).toContain("anchor(left) - 15px")
    expect(css()).toContain("anchor(right)")

    gutter = "auto"
    ui.refresh()
    expect(css()).not.toContain("anchor(left) - 15px")
    expect(css()).toContain("anchor(right)")
  })

  it("binds controls to authored targets through a shared stylesheet and removes markers on release", () => {
    document.body.innerHTML = '<button class="authored-control"></button><div class="authored-target"></div>'
    const control = document.querySelector("button")!
    const target = document.querySelector("div")!
    const initialSheets = sheets()
    const ui = positioner()

    ui.bind(control, target, "left:anchor(right);top:anchor(bottom)")
    ui.refresh()

    expect(control.className).toBe("authored-control")
    expect(target.className).toBe("authored-target")
    expect(document.adoptedStyleSheets).toHaveLength(initialSheets.length + 1)
    const css = source(document.adoptedStyleSheets.at(-1)!)
    expect(css).toMatch(/position-anchor: ?--ww-ui-anchor-/)
    expect(css).toMatch(/anchor-name: ?--ww-ui-anchor-/)
    const index = anchorIndex(css)!
    expect(presentationStateElements(document, `anchor-control-${index}`)).toContain(control)
    expect(presentationStateElements(document, `anchor-target-${index}`)).toContain(target)

    ui.release(control)
    ui.refresh()
    expect(control.className).toBe("authored-control")
    expect(target.className).toBe("authored-target")
    expect(document.adoptedStyleSheets).toEqual(initialSheets)
  })

  it("keeps existing anchor names and independent bindings on a shared target", () => {
    document.body.innerHTML = '<div style="anchor-name: --authored"></div><button></button><button></button>'
    const [target, first, second] = [document.querySelector("div")!, ...document.querySelectorAll("button")]
    const ui = positioner()
    ui.bind(first, target)
    ui.bind(second, target)
    ui.refresh()
    const css = source(document.adoptedStyleSheets.at(-1)!)
    expect(css).toContain("--authored")
    expect(css.match(/anchor-name:/g)).toHaveLength(1)
    expect(css).toContain(",--ww-ui-anchor-")

    ui.release(first)
    ui.refresh()
    expect(source(document.adoptedStyleSheets.at(-1)!)).toMatch(/position-anchor: ?--ww-ui-anchor-/)
    expect(first.className).toBe("")
    expect(second.className).toBe("")
    expect(target.className).toBe("")
  })

  it("replaces a control binding when its target changes", () => {
    document.body.innerHTML = '<button></button><div id="one"></div><div id="two"></div>'
    const control = document.querySelector("button")!
    const [one, two] = [...document.querySelectorAll("div")]
    const ui = positioner()
    ui.bind(control, one)
    ui.refresh()
    ui.bind(control, two)
    ui.refresh()
    const css = source(document.adoptedStyleSheets.at(-1)!)
    expect(css).not.toContain("#one")
    expect(css).toMatch(/anchor-name: ?--ww-ui-anchor-\d+/)
    expect(one.className).toBe("")
    expect(two.className).toBe("")
  })

  it("refreshes structural and ID selectors after authored DOM changes", async () => {
    document.body.innerHTML = '<button></button><div id="before"></div><p></p>'
    const control = document.querySelector("button")!
    const target = document.querySelector("div")!
    const ui = positioner()
    ui.bind(control, target)
    ui.refresh()
    const sheet = document.adoptedStyleSheets.at(-1)!
    expect(source(sheet)).toContain("#before")

    target.id = "after"
    await Promise.resolve()
    ui.refresh()
    expect(source(sheet)).toContain("#after")
    expect(source(sheet)).not.toContain("#before")

    target.removeAttribute("id")
    target.parentElement!.insertBefore(document.createElement("span"), target)
    await Promise.resolve()
    ui.refresh()
    expect(source(sheet)).not.toContain("#after")
    expect(source(sheet)).toContain(":nth-child(3)")
    expect(target.className).toBe("")
  })

  it("rejects disconnected targets without mutating either node", () => {
    const control = document.createElement("button")
    const target = document.createElement("div")
    control.className = "kept-control"
    target.className = "kept-target"
    document.body.append(control)
    const initialSheets = sheets()
    positioner().bind(control, target)
    expect(control.className).toBe("kept-control")
    expect(target.className).toBe("kept-target")
    expect(sheets()).toEqual(initialSheets)
  })

  it("forwards shadow target parts through nested hosts and restores authored tokens", () => {
    document.body.innerHTML = '<button></button><x-outer exportparts="outer:renamed"></x-outer>'
    const outerHost = document.querySelector("x-outer")!
    const outerShadow = outerHost.attachShadow({mode: "open"})
    outerShadow.innerHTML = '<x-inner exportparts="inner:renamed"></x-inner>'
    const innerHost = outerShadow.querySelector("x-inner")!
    const innerShadow = innerHost.attachShadow({mode: "open"})
    innerShadow.innerHTML = '<div part="existing"></div>'
    const target = innerShadow.querySelector("div")!
    const control = document.querySelector("button")!
    const ui = positioner()
    ui.bind(control, target)
    ui.refresh()
    expect(target.getAttribute("part")).toMatch(/^existing .*anchor-target-/)
    expect(innerHost.getAttribute("exportparts")).toMatch(/^inner:renamed, .*anchor-target-/)
    expect(outerHost.getAttribute("exportparts")).toBe("outer:renamed")
    ui.destroy()
    expect(target.getAttribute("part")).toBe("existing")
    expect(innerHost.getAttribute("exportparts")).toBe("inner:renamed")
    expect(outerHost.getAttribute("exportparts")).toBe("outer:renamed")
    expect(document.adoptedStyleSheets).toEqual([])
  })

  it("cleans bindings and styles on destroy without copying presentation state", () => {
    document.body.innerHTML = '<button></button><div></div>'
    const control = document.querySelector("button")!
    const target = document.querySelector("div")!
    const ui = positioner()
    ui.bind(control, target)
    ui.refresh()
    const clone = target.cloneNode() as Element
    target.classList.add("◆")
    document.body.append(clone)
    expect(clone.className).toBe("")
    ui.destroy()
    expect(target.className).toBe("◆")
    expect(clone.hasAttribute("class")).toBe(false)
    expect(control.hasAttribute("class")).toBe(false)
    expect(document.adoptedStyleSheets).toEqual([])
  })

  it("supports pseudo element targets", () => {
    document.body.innerHTML = '<button></button><div></div>'
    const control = document.querySelector("button")!
    const target = document.querySelector("div")!
    const ui = positioner()
    ui.bind(control, target, "top:anchor(bottom)", "::after")
    ui.refresh()
    expect(source(document.adoptedStyleSheets.at(-1)!)).toMatch(/::after \{ anchor-name:/)
  })
})
