// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {printingClass, watchPrinting} from "./print-class.js"

class FakeMedia extends EventTarget {
  matches = false
  set(value: boolean) {
    this.matches = value
    this.dispatchEvent(Object.assign(new Event("change"), {matches: value}))
  }
}

const isWidget = (element: Element) => element.localName.includes("-")

describe("watchPrinting", () => {
  let stop: (() => void) | undefined
  afterEach(() => {
    stop?.()
    stop = undefined
    document.body.innerHTML = ""
  })

  const start = (media = new FakeMedia()) => {
    const view = Object.assign(window, {matchMedia: () => media})
    stop = watchPrinting(view, document.body, isWidget)
    return media
  }

  it("marks widgets for the print media query, which a print to PDF without a window sends alone", () => {
    document.body.innerHTML = '<demo-widget></demo-widget><p>text</p>'
    const media = start()
    const widget = document.querySelector("demo-widget")!
    expect(widget.classList.contains(printingClass)).toBe(false)
    media.set(true)
    expect(widget.classList.contains(printingClass)).toBe(true)
    expect(document.querySelector("p")!.hasAttribute("class")).toBe(false)
    media.set(false)
    expect(widget.hasAttribute("class")).toBe(false)
  })

  it("marks widgets when printing is already going on at the start", () => {
    document.body.innerHTML = '<demo-widget class="own"></demo-widget>'
    const media = new FakeMedia()
    media.matches = true
    start(media)
    expect(document.querySelector("demo-widget")!.className).toBe("own ww-beforeprint")
  })

  it("marks widgets that appear while printing, nested ones included, and the two signals do not conflict", async () => {
    const media = start()
    window.dispatchEvent(new Event("beforeprint"))
    media.set(true)
    const outer = document.createElement("demo-outer")
    outer.innerHTML = "<demo-inner></demo-inner>"
    document.body.append(outer)
    await new Promise(resolve => setTimeout(resolve))
    expect(outer.classList.contains(printingClass)).toBe(true)
    expect(outer.firstElementChild!.classList.contains(printingClass)).toBe(true)
    window.dispatchEvent(new Event("afterprint"))
    expect(outer.hasAttribute("class")).toBe(false)
    expect(outer.firstElementChild!.hasAttribute("class")).toBe(false)
  })

  it("removes the class everywhere and stops listening when stopped", () => {
    document.body.innerHTML = '<demo-widget></demo-widget>'
    start()
    window.dispatchEvent(new Event("beforeprint"))
    const widget = document.querySelector("demo-widget")!
    expect(widget.classList.contains(printingClass)).toBe(true)
    stop!()
    stop = undefined
    expect(widget.hasAttribute("class")).toBe(false)
    window.dispatchEvent(new Event("beforeprint"))
    expect(widget.hasAttribute("class")).toBe(false)
  })
})
