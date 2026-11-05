// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {getElementPresentation, imageMapPopupImage, imageMapPopups, popupDisplayToggle} from "./element-names"
import {elementAttributeState} from "./element-attributes"
import {descendantElements, type ReadableElement} from "./dom-readers"

afterEach(() => vi.unstubAllGlobals())

describe("descendantElements", () => {
  it("uses native descendant order and supports elements from another document", () => {
    const foreignDocument = document.implementation.createHTMLDocument()
    foreignDocument.body.innerHTML = "<section><span></span><svg><circle></circle><g><path></path></g></svg><div><b></b></div></section>"
    const section = foreignDocument.querySelector("section")!
    expect([...descendantElements(section)].map(element => element.localName)).toEqual(["span", "svg", "circle", "g", "path", "div", "b"])
    expect([...descendantElements(section)].find(element => element.localName === "circle")?.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  it("walks readable views without native querySelectorAll", () => {
    const leaf = {localName: "leaf", children: []}
    const branch = {localName: "branch", children: [leaf]}
    const root = {localName: "root", children: [branch, {localName: "sibling", children: []}]}
    expect([...descendantElements(root as unknown as ReadableElement)].map(element => element.localName)).toEqual(["branch", "leaf", "sibling"])
  })
})

describe("widget element presentation", () => {
  it.each(["webwriter-task-prompt", "acme-task-prompt"])("formats %s with the existing widget name helper", tag => {
    expect(getElementPresentation(tag)).toEqual({name: "Task Prompt", icon: "Packages"})
  })

  it("uses installed metadata for child widgets even when they are not insertable", () => {
    vi.stubGlobal("DOMEDITOR_PACKAGE_ITEMS", [{section: "Packages", kind: "widget", packageName: "@webwriter/quiz",
      tag: "webwriter-task-prompt", name: "Task Prompt", iconUrl: "https://example.test/quiz.svg", insertable: false}])
    const prompt = document.createElement("webwriter-task-prompt")
    expect(getElementPresentation(prompt)).toEqual({name: "Task Prompt", icon: "Packages", iconUrl: "https://example.test/quiz.svg"})
    expect(elementAttributeState(prompt, [0])).toMatchObject({name: "Task Prompt", icon: "Packages", iconUrl: "https://example.test/quiz.svg"})
  })

  it("preserves custom labels and native element names", () => {
    expect(getElementPresentation("webwriter-task-prompt", [{section: "Packages", kind: "widget", packageName: "@webwriter/quiz",
      tag: "webwriter-task-prompt", name: "Aufgabenstellung", iconUrl: "https://example.test/quiz.svg"}]).name).toBe("Aufgabenstellung")
    expect(getElementPresentation("p")).toEqual({name: "Paragraph", icon: "Paragraph"})
  })
})

describe("Popup element presentation", () => {
  it("re-reads shared maps and replaced or disconnected popup targets", () => {
    document.body.innerHTML = '<img usemap="#plan"><img usemap="#plan"><map name="plan"><area interestfor="note"></map><div id="note" popover>Content</div>'
    const images = document.querySelectorAll("img"), popup = document.getElementById("note")!
    expect(imageMapPopups(images[0])).toEqual([popup])
    expect(imageMapPopups(images[1])).toEqual([popup])
    expect(imageMapPopupImage(popup)).toBe(images[0])
    images[0].remove()
    expect(imageMapPopupImage(popup)).toBe(images[1])
    const replacement = popup.cloneNode(true) as Element
    popup.replaceWith(replacement)
    expect(imageMapPopupImage(popup)).toBeNull()
    expect(imageMapPopups(images[1])).toEqual([replacement])
    replacement.removeAttribute("popover")
    expect(imageMapPopups(images[1])).toEqual([])
    document.body.replaceChildren()
  })

  it("resolves click and hover hotspots through irregular maps and picture elements", () => {
    document.body.innerHTML = '<picture><img usemap="#plan"></picture><map name="plan"><span><!--keep--><area popovertarget="one"><area interestfor="two"><area popovertarget="one"><custom-widget><area popovertarget="private"></custom-widget></span></map><section><div id="one" popover>One</div><span id="two" popover>Two</span><div id="private" popover>Private</div></section>'
    const image = document.querySelector("picture")!, one = document.getElementById("one")!, two = document.getElementById("two")!
    expect(imageMapPopups(image)).toEqual([one, two])
    expect(imageMapPopupImage(two)).toBe(image)
    expect(getElementPresentation(one)).toEqual({name: "Popup", icon: "Popup"})
    expect(getElementPresentation(two)).toEqual({name: "Popup", icon: "Popup"})
    expect(imageMapPopupImage(document.getElementById("private")!)).toBeNull()
    document.querySelector("img")!.removeAttribute("usemap")
    expect(imageMapPopupImage(one)).toBeNull()
    expect(getElementPresentation(one).name).toBe("Section")
    document.body.replaceChildren()
  })
  it("resolves a linked dialog outside the inline paragraph", () => {
    document.body.innerHTML = '<p>Before <span class="ww-popup"><button popovertarget="note">Open</button></span> after</p><div class="ww-popup-content" id="note" role="dialog" popover="auto"><p>Content</p></div>'
    const button = document.querySelector("button")!, content = document.querySelector(".ww-popup-content")!
    expect(getElementPresentation(button).name).toBe("Popup")
    expect(getElementPresentation(content).name).toBe("Popup Content")
    expect(popupDisplayToggle(content)).toBe(button)
  })
  it("names only related native popup parts and follows the current DOM", () => {
    const root = document.createElement("div")
    root.innerHTML = '<div class="ww-popup"><button popovertarget="note">Open</button><!--keep--><div id="note" popover="auto"><p>Content</p></div><button popovertarget="other">Other</button><custom-widget><div popover>Widget content</div></custom-widget></div>'
    const wrapper = root.firstElementChild!, [button, content, other] = Array.from(wrapper.children)
    expect(getElementPresentation(wrapper)).toEqual({name: "Popup", icon: "Popup"})
    expect(getElementPresentation(button)).toEqual({name: "Popup", icon: "Popup"})
    expect(getElementPresentation(content)).toEqual({name: "Popup Content", icon: "Popup"})
    expect(getElementPresentation(other).name).toBe("Button")
    expect(getElementPresentation(wrapper.querySelector("custom-widget div")!).name).toBe("Section")
    content.id = "changed"
    expect(getElementPresentation(button).name).toBe("Button")
    expect(getElementPresentation(document.createElement("div")).name).toBe("Section")
  })
})
