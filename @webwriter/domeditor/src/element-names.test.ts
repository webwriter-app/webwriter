// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {getElementPresentation} from "./element-names"
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
