// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {getElementPresentation, popupDisplayToggle} from "./element-names"
import {elementAttributeState} from "./element-attributes"

afterEach(() => vi.unstubAllGlobals())

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
