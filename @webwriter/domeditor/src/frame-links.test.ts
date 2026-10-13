// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {Window as TestWindow} from "happy-dom"
import {openFrameLinksInNewTabs} from "./frame-links"

let disconnect: (() => void) | undefined
const navigation = (window as unknown as TestWindow).happyDOM.settings.navigation
const originalNavigation = {...navigation}
beforeEach(() => Object.assign(navigation, {disableMainFrameNavigation: true, disableChildPageNavigation: true, disableFallbackToSetURL: true}))
afterEach(() => { disconnect?.(); document.body.replaceChildren(); Object.assign(navigation, originalNavigation); vi.restoreAllMocks() })

describe("frame links", () => {
  it("opens external links in new tabs without changing the document", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    disconnect = openFrameLinksInNewTabs(window)
    for(const target of ["", "_self", "_top", "_parent", "existing", "_blank"]) {
      document.body.innerHTML = `<a href="https://example.test/page" target="${target}"><b>Link</b></a>`
      const before = document.body.innerHTML
      const event = new MouseEvent("click", {bubbles: true, cancelable: true})
      document.querySelector("b")!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(open).toHaveBeenLastCalledWith("https://example.test/page", "_blank", "noopener,noreferrer")
      expect(document.body.innerHTML).toBe(before)
    }
  })

  it("navigates fragments in the frame despite authored targets and a different base URL", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {})
    disconnect = openFrameLinksInNewTabs(window)
    const base = document.createElement("base")
    base.href = "https://parent.test/page"
    document.head.append(base)
    try {
      for(const href of ["#chapter", "#chapter%20two", "#", " #chapter ", `${window.location.href.split("#")[0]}#chapter`]) {
        for(const target of ["", "_self", "_top", "_parent", "existing", "_blank"]) {
          document.body.innerHTML = `<a href="${href}" target="${target}"><b>Link</b></a><p id="chapter">Chapter</p>`
          const before = document.body.innerHTML
          const event = new MouseEvent("click", {bubbles: true, cancelable: true})
          document.querySelector("b")!.dispatchEvent(event)
          expect(event.defaultPrevented).toBe(true)
          expect(assign).toHaveBeenLastCalledWith(new URL(href, window.location.href).href)
          expect(document.body.innerHTML).toBe(before)
        }
      }
      expect(open).not.toHaveBeenCalled()
    }
    finally { base.remove() }
  })

  it("handles middle clicks, SVG and widget shadow links added later, and cleans up", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    disconnect = openFrameLinksInNewTabs(window)
    document.body.innerHTML = '<demo-widget></demo-widget><svg><a href="https://svg.test"><text>SVG</text></a></svg>'
    const shadow = document.querySelector("demo-widget")!.attachShadow({mode: "open"})
    shadow.innerHTML = '<a href="https://widget.test">Widget</a>'
    shadow.querySelector("a")!.dispatchEvent(new MouseEvent("auxclick", {button: 1, bubbles: true, composed: true, cancelable: true}))
    expect(open).toHaveBeenLastCalledWith("https://widget.test/", "_blank", "noopener,noreferrer")
    document.querySelector("text")!.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
    expect(open).toHaveBeenLastCalledWith("https://svg.test/", "_blank", "noopener,noreferrer")
    disconnect()
    document.querySelector("text")!.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}))
    expect(open).toHaveBeenCalledTimes(2)
  })

  it("respects consumed reference/widget clicks and prevents executable link navigation", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    disconnect = openFrameLinksInNewTabs(window)
    document.body.innerHTML = '<a href="#ref">Reference</a><a href="javascript:location.replace(\'/lost\')">Script</a>'
    document.querySelector("a")!.addEventListener("click", event => event.preventDefault())
    document.querySelector("a")!.click()
    const event = new MouseEvent("click", {bubbles: true, cancelable: true})
    document.querySelectorAll("a")[1].dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(open).not.toHaveBeenCalled()
  })
})
