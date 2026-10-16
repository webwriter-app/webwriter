// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {DOMEditor} from "./domeditor"

let editor: DOMEditor | undefined
const originalHead = document.head.innerHTML

beforeEach(() => {
  document.body.className = ""
  document.head.innerHTML = ""
  document.body.innerHTML = '<h1>First heading</h1><figure><img><figcaption>First caption</figcaption></figure><h2 id="authored">Authored</h2><p><a href="#first-heading">heading</a><a href="#first-caption">caption</a><a href="#authored">authored</a><a href="https://example.test/#first-heading">external</a><a href="./#first-heading">relative</a></p><test-widget><a href="#first-heading">widget</a></test-widget>'
})

afterEach(() => {
  editor?.destroy(); editor = undefined
  document.head.innerHTML = originalHead
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
  document.designMode = "off"
})

describe("generated document permalinks", () => {
  it("retargets local links with heading and caption edits and restores them on undo", () => {
    editor = new DOMEditor()
    const heading = document.querySelector("h1")!
    const figure = document.querySelector("figure")!
    const headingLink = document.querySelector<HTMLAnchorElement>('a[href="#first-heading"]')!
    const captionLink = document.querySelector<HTMLAnchorElement>('a[href="#first-caption"]')!
    heading.textContent = "Updated heading"
    document.querySelector("figcaption")!.textContent = "Updated caption"
    editor.doc.syncFromDOM()

    expect(heading.id).toBe("updated-heading")
    expect(figure.id).toBe("updated-caption")
    expect(headingLink.getAttribute("href")).toBe("#updated-heading")
    expect(captionLink.getAttribute("href")).toBe("#updated-caption")
    expect(document.querySelector('a[href="#authored"]')).not.toBeNull()
    expect(document.querySelector('a[href="https://example.test/#first-heading"]')).not.toBeNull()
    expect(document.querySelector('a[href="./#first-heading"]')).not.toBeNull()
    expect(document.querySelector("test-widget a")!.getAttribute("href")).toBe("#first-heading")

    editor.doc.undo()
    expect(heading.textContent).toBe("First heading")
    expect(heading.id).toBe("first-heading")
    expect(figure.id).toBe("first-caption")
    expect(headingLink.getAttribute("href")).toBe("#first-heading")
    expect(captionLink.getAttribute("href")).toBe("#first-caption")

    editor.doc.redo()
    expect(heading.textContent).toBe("Updated heading")
    expect(heading.id).toBe("updated-heading")
    expect(figure.id).toBe("updated-caption")
    expect(headingLink.getAttribute("href")).toBe("#updated-heading")
    expect(captionLink.getAttribute("href")).toBe("#updated-caption")
  })

  it("retargets references through generated-ID collisions and leaves authored references alone", () => {
    document.body.innerHTML = '<h1>First</h1><h2>Second</h2><p><a href="#second">generated</a><a href="#taken">authored</a></p><div id="taken"></div>'
    editor = new DOMEditor()
    const heading = document.querySelector("h2")!
    const generatedLink = document.querySelector<HTMLAnchorElement>('a[href="#second"]')!
    heading.textContent = "Taken"
    editor.doc.syncFromDOM()

    expect(heading.id).toBe("taken-2")
    expect(generatedLink.getAttribute("href")).toBe("#taken-2")
    expect(document.querySelector('a[href="#taken"]')).not.toBeNull()
  })

  it("leaves fragment references unchanged when generated IDs were already duplicated", () => {
    document.body.innerHTML = '<h1>Shared</h1><h2>Shared</h2><p><a href="#shared">ambiguous</a></p>'
    editor = new DOMEditor()
    const headings = Array.from(document.querySelectorAll("h1, h2"))
    const link = document.querySelector<HTMLAnchorElement>('a[href="#shared"]')!
    headings[1].id = "shared"
    headings[0].textContent = "First changed"
    headings[1].textContent = "Second changed"
    editor.doc.syncFromDOM()

    expect(headings.map(heading => heading.id)).toEqual(["first-changed", "second-changed"])
    expect(link.getAttribute("href")).toBe("#shared")
  })

  it("retargets encoded and raw Unicode fragments while preserving malformed and external URLs", () => {
    document.body.innerHTML = '<h1>日本語見出し</h1><p><a href="#%E6%97%A5%E6%9C%AC%E8%AA%9E%E8%A6%8B%E5%87%BA%E3%81%97">encoded</a><a href="#日本語見出し">raw</a><a href="#bad%ZZ">malformed</a><a href="https://example.test/#日本語見出し">external</a></p>'
    editor = new DOMEditor()
    const heading = document.querySelector("h1")!
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"))
    heading.textContent = "新しい見出し"
    editor.doc.syncFromDOM()

    expect(heading.id).toBe("新しい見出し")
    expect(links[0].getAttribute("href")).toBe("#%E6%96%B0%E3%81%97%E3%81%84%E8%A6%8B%E5%87%BA%E3%81%97")
    expect(links[1].getAttribute("href")).toBe("#%E6%96%B0%E3%81%97%E3%81%84%E8%A6%8B%E5%87%BA%E3%81%97")
    expect(links[2].getAttribute("href")).toBe("#bad%ZZ")
    expect(links[3].getAttribute("href")).toBe("https://example.test/#日本語見出し")
  })
})
