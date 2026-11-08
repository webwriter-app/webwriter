// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {createFigureLayout} from "./figure-layout.js"
import {cloneWithoutEditorMarkers} from "./utility"

let layout: ReturnType<typeof createFigureLayout> | undefined
beforeEach(() => {
  document.body.innerHTML = '<figure class="authored"><!--keep--><custom-diagram style="width: 360px; height: 100px; rotate: 30deg; transform-origin: 0px 0px"><unfamiliar-element></unfamiliar-element></custom-diagram><figcaption><em>Caption</em></figcaption></figure>'
  document.querySelector("figure")!.id = "flow-figure"
  Object.defineProperty(document.querySelector("figure"), "clientWidth", {configurable: true, value: 420})
})
afterEach(() => { layout?.destroy(); layout = undefined; vi.restoreAllMocks() })

const css = () => Array.from(document.adoptedStyleSheets.at(-1)!.cssRules, rule => rule.cssText).join("\n")

it("leaves the empty stylesheet untouched until a live figure appears", () => {
  const figure = document.querySelector<HTMLElement>("figure")!
  figure.remove()
  layout = createFigureLayout(document)
  const sheet = document.adoptedStyleSheets.at(-1)!
  const replace = vi.spyOn(sheet, "replaceSync")
  layout.refresh()
  expect(replace).not.toHaveBeenCalled()
  document.body.append(figure)
  layout.refresh()
  expect(css()).toContain("shape-outside: polygon(")
})

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

it("measures all figures without changing authored classes", () => {
  const first = document.querySelector<HTMLElement>("figure")!
  const second = first.cloneNode(true) as HTMLElement
  second.id = "flow-figure-2"
  first.after(second)
  Object.defineProperty(second, "clientWidth", {configurable: true, value: 420})
  const classSnapshots: string[] = []
  for(const content of document.querySelectorAll("custom-diagram")) {
    Object.defineProperty(content, "offsetWidth", {configurable: true, get() {
      classSnapshots.push(first.className + second.className)
      return 360
    }})
  }
  layout = createFigureLayout(document)
  expect(classSnapshots).toEqual(["authoredauthored", "authoredauthored"])
  expect(layout.isActive(first)).toBe(true)
  expect(layout.isActive(second)).toBe(true)
})

it("refreshes one figure without measuring or replacing unrelated figure rules", async () => {
  const first = document.querySelector<HTMLElement>("figure")!
  const second = first.cloneNode(true) as HTMLElement
  second.id = "flow-figure-2"
  first.after(second)
  Object.defineProperty(second, "clientWidth", {configurable: true, value: 420})
  layout = createFigureLayout(document)
  const content = second.querySelector<HTMLElement>("custom-diagram")!
  const measure = vi.spyOn(content, "offsetWidth", "get")
  const sheet = document.adoptedStyleSheets.at(-1)!
  const untouched = Array.from(sheet.cssRules).filter(rule => rule.cssText.includes("flow-figure-2"))
  const before = css()
  first.querySelector<HTMLElement>("custom-diagram")!.style.setProperty("rotate", "65deg")
  layout.refresh(first)
  expect(css()).not.toBe(before)
  expect(measure).not.toHaveBeenCalled()
  const retained = Array.from(sheet.cssRules).filter(rule => rule.cssText.includes("flow-figure-2"))
  expect(retained).toHaveLength(untouched.length)
  retained.forEach((rule, index) => expect(rule).toBe(untouched[index]))
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(measure).not.toHaveBeenCalled()
  expect(sheet.cssRules).toHaveLength(8)
})

it.each(["other figure", "stylesheet", "structure"])("retains broad invalidation for pending %s changes", change => {
  const first = document.querySelector<HTMLElement>("figure")!
  const second = first.cloneNode(true) as HTMLElement
  second.id = "flow-figure-2"
  first.after(second)
  Object.defineProperty(second, "clientWidth", {configurable: true, value: 420})
  layout = createFigureLayout(document)
  const content = second.querySelector<HTMLElement>("custom-diagram")!
  const measure = vi.spyOn(content, "offsetWidth", "get")
  let style: HTMLStyleElement | undefined
  if(change === "other figure") content.style.setProperty("rotate", "65deg")
  else if(change === "stylesheet") {
    style = document.createElement("style")
    style.textContent = "figure { font-size: 18px }"
    document.head.append(style)
  }
  else first.append(document.createElement("aside"))
  try {
    layout.refresh(first)
    expect(measure).toHaveBeenCalled()
    if(change === "structure") expect(first.className).toBe("authored")
    expect(cloneWithoutEditorMarkers(document.body, true).innerHTML).not.toContain("◆")
  }
  finally { style?.remove() }
})

it("cleans disconnected figures and does not impose a shape on multi-content figures or widget internals", () => {
  const figure = document.querySelector<HTMLElement>("figure")!
  layout = createFigureLayout(document)
  expect(layout.isActive(figure)).toBe(true)
  const replacement = figure.cloneNode(true) as HTMLElement
  replacement.className = "replacement"
  figure.replaceWith(replacement)
  Object.defineProperty(replacement, "clientWidth", {configurable: true, value: 420})
  layout.refresh()
  expect(figure.className).toBe("authored")
  expect(layout.isActive(replacement)).toBe(true)
  replacement.append(document.createElement("aside"))
  layout.refresh()
  expect(replacement.className).toBe("replacement")
  expect(layout.isActive(replacement)).toBe(false)
  replacement.lastElementChild!.remove()
  const widget = document.createElement("atomic-widget")
  replacement.before(widget); widget.append(replacement)
  layout.refresh()
  expect(css()).toBe("")
})

it("drops flow safely when its ID becomes missing or duplicated", () => {
  const figure = document.querySelector<HTMLElement>("figure")!
  layout = createFigureLayout(document)
  expect(layout.isActive(figure)).toBe(true)
  figure.removeAttribute("id")
  layout.refresh()
  expect(layout.isActive(figure)).toBe(false)
  figure.id = "shared"
  const duplicate = figure.cloneNode(true) as HTMLElement
  duplicate.id = "shared"
  Object.defineProperty(duplicate, "clientWidth", {configurable: true, value: 420})
  figure.after(duplicate)
  layout.refresh()
  expect(layout.isActive(figure)).toBe(false)
  expect(layout.isActive(duplicate)).toBe(false)
  duplicate.id = "unique"
  layout.refresh()
  expect(layout.isActive(figure)).toBe(true)
  expect(layout.isActive(duplicate)).toBe(true)
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
