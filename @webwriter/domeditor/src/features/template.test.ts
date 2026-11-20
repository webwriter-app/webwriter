// @vitest-environment happy-dom
import {hasPresentationState} from "../presentation-state.js"
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

    const paragraph = document.createElement("p")
    document.body.append(paragraph)
    expect(getDocumentTemplate()).toBe(widget)
    paragraph.textContent = "Other content"
    expect(getDocumentTemplate()).toBeNull()
    expect(getDocumentRoot()).toBe(document.body)
  })

  it("mirrors template state to a temporary BODY marker", async () => {
    document.body.innerHTML = '<slides-widget role="document"></slides-widget>'
    await Promise.resolve()
    expect(hasPresentationState(document.body, "template-active")).toBe(true)

    document.body.firstElementChild!.removeAttribute("role")
    await Promise.resolve()
    expect(hasPresentationState(document.body, "template-active")).toBe(false)
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
    expect(hasPresentationState(document.body, "template-active")).toBe(false)
  })
})


describe("Fill viewport", () => {
  const toggle = (enabled: boolean) => editor.features.template.actions.setFillViewport({type: "setFillViewport", enabled})

  it.each(["img", "custom-widget", "figure", "table"])("fills a sole %s beside empty containers without rebuilding it", tag => {
    document.body.innerHTML = `<p><br></p> <!--keep--><${tag} id="keep" role="group"></${tag}><div><p> </p></div>`
    const target = document.getElementById("keep")!
    editor.features.selection.captureElement(target)
    expect(editor.features.manipulation.getStyleState([], target, false).target?.canFillViewport).toBe(true)
    expect(toggle(true)).toBe(true)
    expect(target.getAttribute("role")).toBe("document group")
    expect(target.isConnected).toBe(true)
    expect(document.body.querySelectorAll("p, div").length).toBeGreaterThan(0)
    expect(editor.features.manipulation.getStyleState([], target, false).target?.fillViewport).toBe(true)
    expect(editor.toHTML(true)).toContain('role="document group"')
    expect(editor.toHTML(false)).toContain("100dvh")
    expect(toggle(false)).toBe(true)
    expect(target.getAttribute("role")).toBe("group")
  })

  it("keeps a sole positioned viewport element without adding or selecting a placeholder", async () => {
    document.body.innerHTML = '<figure id="target" style="position:absolute">Only content</figure>'
    const target = document.getElementById("target")!
    editor.features.selection.captureElement(target)
    expect(toggle(true)).toBe(true)
    // Simulate the computed positioning supplied by the viewport stylesheet.
    ;(target as HTMLElement).style.position = "absolute"
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.body.children).toHaveLength(1)
    expect(editor.features.manipulation.styleTarget).toBe(target)
  })

  it.each(["p", "h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "ul", "ol", "menu", "dl", "details"])("refuses a sole selected %s", tag => {
    document.body.innerHTML = `<${tag} id="target">Only content</${tag}>`
    const target = document.getElementById("target")!
    editor.features.selection.captureElement(target)
    expect(editor.features.template.canFillViewport(target)).toBe(false)
    expect(editor.features.manipulation.getStyleState([], target, false).target?.canFillViewport).toBe(false)
    expect(toggle(true)).toBe(false)
    expect(target.hasAttribute("role")).toBe(false)
  })

  it("requires element or capture selection and rechecks it when toggling", () => {
    document.body.innerHTML = '<figure><figcaption>Caption</figcaption><img></figure>'
    const target = document.querySelector("figure")!
    $.selectElement(target)
    expect($.isElementSelection).toBe(true)
    expect(editor.features.selection.isCaptureSelection).toBe(false)
    expect(editor.features.template.canFillViewport(target)).toBe(true)

    const text = target.querySelector("figcaption")!.firstChild!
    $.selectRange(text, 0, text, 3)
    expect(editor.features.template.canFillViewport(target)).toBe(false)
    expect(toggle(true)).toBe(false)
    $.move(text, 1)
    expect(editor.features.template.canFillViewport(target)).toBe(false)
    expect(toggle(true)).toBe(false)
    expect(target.hasAttribute("role")).toBe(false)
    expect(target.querySelector("figcaption")?.textContent).toBe("Caption")

    editor.features.selection.captureElement(target)
    expect(editor.features.template.canFillViewport(target)).toBe(true)
    expect(toggle(true)).toBe(true)
  })

  it.each(['<p>Other</p>', 'Other text', '<img>', '<video></video>', '<other-widget></other-widget>', '<div><span>Nested</span></div>'])("refuses after new content %s arrives", html => {
    document.body.innerHTML = '<custom-widget></custom-widget>'
    const target = document.body.firstElementChild!
    editor.features.selection.captureElement(target)
    document.body.insertAdjacentHTML("beforeend", html)
    expect(toggle(true)).toBe(false)
    expect(target.hasAttribute("role")).toBe(false)
  })

  it.each(["ww-canvas", "ww-slides", "ww-board"])("refuses the %s layout", name => {
    document.body.innerHTML = '<custom-widget></custom-widget>'
    const target = document.body.firstElementChild!
    editor.features.selection.captureElement(target)
    document.body.className = name
    expect(toggle(true)).toBe(false)
  })

  it("clears placement and captions in one undo item and preserves opaque widget content", () => {
    document.body.innerHTML = '<figure id="item" class="authored ww-float-right ww-full-width ww-float-sticky" style="float:right;position:sticky;top:1px;margin-left:auto;--ww-float-size:400px;color:red"><custom-widget><figcaption>Private</figcaption></custom-widget><!--keep--><figcaption>Caption</figcaption></figure>'
    const target = document.querySelector<HTMLElement>("figure")!
    editor.doc.syncFromDOM(); editor.doc.stopCapturing()
    const original = target.outerHTML
    editor.features.selection.captureElement(target)
    expect(toggle(true)).toBe(true)
    expect(target.className).toBe("authored")
    expect(target.style.cssText).toBe("color: red;")
    expect(target.querySelector(":scope > figcaption")).toBeNull()
    expect(target.querySelector("custom-widget > figcaption")?.textContent).toBe("Private")
    expect(editor.features.manipulation.setCaption("below")).toBe(false)
    expect(editor.features.manipulation.setFloat(target, "far-left")).toBe(false)
    expect(editor.features.layout.canSetFullWidth(target)).toBe(false)
    expect(editor.features.manipulation.setElementStyles(target, {width: {value: "25px", priority: ""}, "border-radius": {value: "5px", priority: ""}})).toBe(false)
    editor.doc.syncFromDOM()
    expect(editor.doc.body.toString()).toContain('role="document"')
    editor.doc.undo()
    expect(document.getElementById("item")!.outerHTML).toBe(original)
    editor.doc.redo()
    expect(document.getElementById("item")!.getAttribute("role")).toBe("document")
  })

  it("refuses locked editing", () => {
    document.body.innerHTML = '<custom-widget></custom-widget>'
    editor.features.selection.captureElement(document.body.firstElementChild!)
    const owner = Symbol("test")
    editor.lockEditing(owner)
    try { expect(toggle(true)).toBe(false) }
    finally { editor.unlockEditing(owner) }
  })

  it("refuses a disconnected target", () => {
    document.body.innerHTML = '<custom-widget></custom-widget>'
    const target = document.body.firstElementChild!
    editor.features.selection.captureElement(target)
    target.remove()
    expect(toggle(true)).toBe(false)
  })
})
