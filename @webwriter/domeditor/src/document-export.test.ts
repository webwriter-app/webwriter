// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it} from "vitest"
import {parse} from "es-module-lexer"
import {DOMEditor} from "./domeditor"

let editor: DOMEditor | undefined
const originalHead = document.head.innerHTML
beforeEach(() => {
  document.body.className = ""
  document.body.innerHTML = '<h1>Technical summary</h1><figure><img alt="Diagram"><figcaption>Diagram</figcaption></figure><table><caption>Results</caption><tbody><tr><td>Value</td></tr></tbody></table>'
})
afterEach(() => {
  editor?.destroy(); editor = undefined
  document.head.innerHTML = originalHead
  document.body.replaceChildren()
  document.body.removeAttribute("class")
  document.body.shadowRoot?.replaceChildren(document.createElement("slot"))
  document.designMode = "off"
})

describe("document reader export", () => {
  it("includes document actions even when there are no permalink targets", () => {
    document.body.innerHTML = '<p>Plain document</p>'
    editor = new DOMEditor()
    const parsed = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    expect(parsed.getElementById("webwriter-document-viewer")!.textContent).toContain("creativecommons.org/licenses/by/4.0/")
    expect(parsed.getElementById("webwriter-document-viewer")!.textContent).toContain("data:image/svg+xml,")
    expect(parsed.body.innerHTML).toBe('<p>Plain document</p>')
  })
  it("embeds an import-free optional reader with authored fragment IDs in normal and offline saves", async () => {
    editor = new DOMEditor()
    for(const html of [editor.toHTML(), await editor.serializeHTML(), await editor.serializeHTML(true)]) {
      const parsed = new DOMParser().parseFromString(html, "text/html")
      const script = parsed.getElementById("webwriter-document-viewer")!
      expect(script.getAttribute("type")).toBe("module")
      expect(script.hasAttribute("src")).toBe(false)
      expect((await parse(script.textContent!))[0]).toHaveLength(0)
      expect(parsed.body.querySelector("h1")!.id).toBe("technical-summary")
      expect(parsed.body.querySelector("figure")!.id).toBe("diagram")
      expect(parsed.body.querySelector("table")!.id).toBe("results")
      script.remove()
      expect(parsed.body.textContent).toContain("Technical summary")
      expect(parsed.body.innerHTML).not.toContain("◆")
      expect(parsed.body.querySelector("button, slot, .ww-figure-controls")).toBeNull()
      expect(parsed.head.querySelectorAll('meta[name="webwriter-generated-id"]')).toHaveLength(3)
    }
    expect(document.getElementById("webwriter-document-viewer")).toBeNull()
    expect(editor.toHTML(true)).not.toContain("webwriter-document-viewer")
    expect(editor.toHTML(false, false)).not.toContain("webwriter-document-viewer")
  })

  it("replaces stale runtime assets and removes them after layout conversion", () => {
    editor = new DOMEditor()
    const parsed = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    parsed.getElementById("webwriter-document-viewer")!.textContent = "untrusted()"
    editor.features.dependency.appendSerializedAssets(parsed)
    expect(parsed.querySelectorAll("#webwriter-document-viewer")).toHaveLength(1)
    expect(parsed.getElementById("webwriter-document-viewer")!.textContent).toContain("mountDocumentReader(")
    expect(parsed.getElementById("webwriter-document-viewer")!.textContent).not.toContain("untrusted()")
    parsed.body.className = "ww-canvas"
    editor.features.dependency.appendSerializedAssets(parsed)
    expect(parsed.getElementById("webwriter-document-viewer")).toBeNull()
    expect(parsed.getElementById("webwriter-canvas-viewer")).not.toBeNull()
    parsed.body.className = "ww-slides"
    editor.features.dependency.appendSerializedAssets(parsed)
    expect(parsed.querySelector("script")).toBeNull()
  })

  it("saves a direct edit with its matching slug before observer delivery", () => {
    editor = new DOMEditor()
    const heading = document.body.querySelector("h1")!
    heading.firstChild!.textContent = "Implementation notes"
    const parsed = new DOMParser().parseFromString(editor.toHTML(), "text/html")
    expect(parsed.body.querySelector("h1")!.id).toBe("implementation-notes")
    editor.doc.undo()
    expect(heading.textContent).toBe("Technical summary")
    expect(heading.id).toBe("technical-summary")
  })
})
