// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {createFigureLayout} from "./figure-layout.js"
import {cloneWithoutEditorMarkers} from "./utility"

let layout: ReturnType<typeof createFigureLayout> | undefined
beforeEach(() => {
  document.body.innerHTML = '<figure class="authored"><!--keep--><custom-diagram style="width: 360px; height: 100px; rotate: 30deg; transform-origin: 0px 0px"><unfamiliar-element></unfamiliar-element></custom-diagram><figcaption><em>Caption</em></figcaption></figure>'
  Object.defineProperty(document.querySelector("figure"), "clientWidth", {configurable: true, value: 420})
})
afterEach(() => { layout?.destroy(); layout = undefined; vi.restoreAllMocks() })

const css = () => Array.from(document.adoptedStyleSheets.at(-1)!.cssRules, rule => rule.cssText).join("\n")

it.each(["left", "center", "right"])("uses a polygon float for an upright %s caption without changing authored content", alignment => {
  const figure = document.querySelector<HTMLElement>("figure")!, caption = figure.querySelector<HTMLElement>("figcaption")!
  caption.style.textAlign = alignment
  const children = Array.from(figure.childNodes), original = figure.outerHTML
  layout = createFigureLayout(document)
  expect(css()).toContain("shape-outside: polygon(")
  expect(css()).toContain(`float: ${alignment === "right" ? "left" : "right"}`)
  expect(css()).toContain("padding-top: 133.")
  expect(Array.from(figure.childNodes)).toEqual(children)
  expect(cloneWithoutEditorMarkers(figure, true).outerHTML).toBe(original)
  layout.destroy()
  expect(figure.outerHTML).toBe(original)
})

it("supports captions before content, negative rotation, and refreshed live geometry", () => {
  const figure = document.querySelector<HTMLElement>("figure")!, content = figure.querySelector<HTMLElement>("custom-diagram")!
  figure.prepend(figure.querySelector("figcaption")!)
  content.style.setProperty("rotate", "-30deg")
  layout = createFigureLayout(document)
  expect(css()).toContain("padding-top: 0px")
  const before = css()
  content.style.height = "200px"
  layout.refresh()
  expect(css()).not.toBe(before)
  content.style.setProperty("rotate", "none")
  layout.refresh()
  expect(css()).toBe("")
  expect(figure.className).toBe("authored")
})

it("cleans disconnected figures and does not impose a shape on multi-content figures or widget internals", () => {
  const figure = document.querySelector<HTMLElement>("figure")!
  layout = createFigureLayout(document)
  expect(figure.className).toContain("◆figure-flow-")
  const replacement = figure.cloneNode(true) as HTMLElement
  replacement.className = "replacement"
  figure.replaceWith(replacement)
  Object.defineProperty(replacement, "clientWidth", {configurable: true, value: 420})
  layout.refresh()
  expect(figure.className).toBe("authored")
  expect(replacement.className).toContain("◆figure-flow-")
  replacement.append(document.createElement("aside"))
  layout.refresh()
  expect(replacement.className).toBe("replacement")
  replacement.lastElementChild!.remove()
  const widget = document.createElement("atomic-widget")
  replacement.before(widget); widget.append(replacement)
  layout.refresh()
  expect(css()).toBe("")
})

it("removes its stylesheet and pending observers on destruction", async () => {
  const sheets = [...document.adoptedStyleSheets]
  layout = createFigureLayout(document)
  layout.destroy()
  document.querySelector<HTMLElement>("custom-diagram")!.style.setProperty("rotate", "60deg")
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(document.adoptedStyleSheets).toEqual(sheets)
  expect(document.body.innerHTML).not.toContain("◆")
})
