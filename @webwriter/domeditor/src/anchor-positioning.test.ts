// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {createAnchorPositioner} from "./anchor-positioning.js"

const sheets = () => [...document.adoptedStyleSheets]
const source = (sheet: CSSStyleSheet) => Array.from(sheet.cssRules, rule => rule.cssText).join("\n")
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
})

describe("shared UI anchor positioning", () => {
  it("binds controls to authored targets through a shared stylesheet and removes markers on release", () => {
    document.body.innerHTML = '<button class="authored-control"></button><div class="authored-target"></div>'
    const control = document.querySelector("button")!
    const target = document.querySelector("div")!
    const initialSheets = sheets()
    const ui = positioner()

    ui.bind(control, target, "left:anchor(right);top:anchor(bottom)")
    ui.refresh()

    expect(control.className).toMatch(/^authored-control ◆anchor-control-/)
    expect(target.className).toMatch(/^authored-target ◆anchor-target-/)
    expect(document.adoptedStyleSheets).toHaveLength(initialSheets.length + 1)
    const css = source(document.adoptedStyleSheets.at(-1)!)
    expect(css).toMatch(/position-anchor: ?--ww-ui-anchor-/)
    expect(css).toMatch(/anchor-name: ?--ww-ui-anchor-/)

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
    expect(second.className).toMatch(/◆anchor-control-/)
    expect(target.className).toMatch(/◆anchor-target-/)
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
    expect(two.className).toContain("◆anchor-target-")
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

  it("cleans cloned markers, bindings and styles on destroy", () => {
    document.body.innerHTML = '<button></button><div></div>'
    const control = document.querySelector("button")!
    const target = document.querySelector("div")!
    const ui = positioner()
    ui.bind(control, target)
    ui.refresh()
    const clone = target.cloneNode() as Element
    target.classList.add("◆")
    document.body.append(clone)
    expect(clone.className).toContain("◆anchor-target-")
    ui.destroy()
    expect(target.className).toBe("")
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
    expect(source(document.adoptedStyleSheets.at(-1)!)).toMatch(/anchor-target-\d+::after \{ anchor-name:/)
  })
})
