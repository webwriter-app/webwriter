// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from "vitest"
import "@testing-library/jest-dom/vitest"
import {DOMEditor} from "../domeditor"
import {getDocumentRoot, getDocumentTemplate} from "../document-template"
import {$} from "../utility"

const editor = new DOMEditor()

beforeEach(async () => {
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  $.selectDocumentStart()
  editor.features.selection.processSelection()
  await Promise.resolve()
})

describe("document templates", () => {
  it("derives a template only from a sole role=document widget", () => {
    document.body.innerHTML = '<main role="document"></main>'
    expect(getDocumentTemplate()).toBeNull()

    document.body.innerHTML = "\n<slides-widget role=\"document\"></slides-widget>\n<!-- kept -->"
    const widget = document.querySelector("slides-widget")!

    expect(getDocumentTemplate()).toBe(widget)
    expect(getDocumentRoot()).toBe(widget)

    document.body.append(document.createElement("p"))
    expect(getDocumentTemplate()).toBeNull()
    expect(getDocumentRoot()).toBe(document.body)
  })

  it("mirrors template state to a temporary BODY marker", async () => {
    document.body.innerHTML = '<slides-widget role="document"></slides-widget>'
    await Promise.resolve()
    expect(document.body).toHaveClass("◆", "◆template-active")

    document.body.firstElementChild!.removeAttribute("role")
    await Promise.resolve()
    expect(document.body).not.toHaveClass("◆template-active")
  })

  it("returns to BODY without rebuilding the widget or removing other role fallbacks", () => {
    document.body.innerHTML = '<slides-widget role="document application"><p>Slide</p></slides-widget>'
    const widget = document.body.firstElementChild!
    const content = widget.firstElementChild

    expect(editor.features.template.setTemplate("body")).toBe(true)

    expect(document.body.firstElementChild).toBe(widget)
    expect(widget.firstElementChild).toBe(content)
    expect(widget).toHaveAttribute("role", "application")
    expect(getDocumentRoot()).toBe(document.body)
    expect($.selectedElement).toBe(document.body)
    expect(document.body).not.toHaveClass("◆template-active")
  })
})
