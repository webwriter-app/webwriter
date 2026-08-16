// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import type {EditorStateSnapshot} from "../editor-state"
import {restoreOriginalResourceURLs} from "../serialization"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("StateFeature", () => {
  it("reconstructs document HTML and the exact relative selection in a new editor realm", () => {
    document.body.innerHTML = "<p>Hello <strong>world</strong></p><webwriter-demo value=\"7\"></webwriter-demo>"
    const editor = new DOMEditor()
    const text = document.querySelector("strong")!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 1, text, 4)

    const snapshot = editor.getActionHandler("snapshotState")({type: "snapshotState"}) as EditorStateSnapshot
    editor.destroy()
    document.body.replaceChildren()

    const restored = new DOMEditor({initialState: snapshot})
    const restoredText = document.querySelector("strong")!.firstChild!
    const selection = document.getSelection()!
    expect(restored.toHTML(true)).toBe("<p>Hello <strong>world</strong></p><webwriter-demo value=\"7\"></webwriter-demo>")
    expect(selection.anchorNode).toBe(restoredText)
    expect(selection.anchorOffset).toBe(1)
    expect(selection.focusNode).toBe(restoredText)
    expect(selection.focusOffset).toBe(4)
    restored.destroy()
  })

  it("strips editor artifacts from normal serialization", async () => {
    document.body.innerHTML = '<p class="authored ◆element-selected">Hello</p><span class="◆editor-only">helper</span>'
    const editor = new DOMEditor()

    const html = await editor.getActionHandler("serializeDocument")({type: "serializeDocument"})

    expect(html).toContain('<p class="authored">Hello</p>')
    expect(html).not.toContain("◆")
    expect(html).not.toContain("contenteditable")
    editor.destroy()
  })

  it("embeds media and scripts for offline saves and preserves restorable source URLs", async () => {
    document.body.innerHTML = '<img src="/photo.png"><script src="/app.js"></script>'
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input)
      if(url.endsWith("app.js")) {
        return new Response("window.offline = true", {headers: {"content-type": "text/javascript"}})
      }
      return new Response(new Uint8Array([1, 2, 3]), {headers: {"content-type": "image/png"}})
    })
    const editor = new DOMEditor()

    const html = await editor.getActionHandler("serializeDocument")({
      type: "serializeDocument",
      offline: true,
    }) as string

    expect(html).toContain('data-webwriter-original-src="/photo.png"')
    expect(html).toContain('src="data:image/png;base64,AQID"')
    expect(html).toContain('data-webwriter-original-src="/app.js"')
    expect(html).toContain("window.offline = true")
    expect(html).not.toContain('<script src="/app.js"')

    const parsed = new DOMParser().parseFromString(html, "text/html")
    restoreOriginalResourceURLs(parsed)
    expect(parsed.querySelector("img")?.getAttribute("src")).toBe("/photo.png")
    expect(parsed.querySelector("script")?.getAttribute("src")).toBe("/app.js")
    expect(parsed.querySelector("script")?.textContent).toBe("")
    expect(parsed.querySelector("[data-webwriter-original-src]")).toBeNull()
    editor.destroy()
  })

  it("reads document context and sanitizes an approved whole-document replacement", () => {
    document.body.innerHTML = "<h1>Before</h1><p>Keep me informed</p>"
    const editor = new DOMEditor()

    const context = editor.getActionHandler("readAIDocument")({type: "readAIDocument"}) as {html: string, text: string}
    expect(context.html).toContain("<h1>Before</h1>")
    expect(context.text).toContain("Keep me informed")

    const result = editor.getActionHandler("replaceAIDocument")({
      type: "replaceAIDocument",
      html: '<main><h1 onclick="steal()">After</h1><a href="javascript:steal()">Link</a><script>steal()</script></main>',
    }) as {status: string, removedUnsafeItems: number}

    expect(result.status).toBe("applied")
    expect(result.removedUnsafeItems).toBeGreaterThan(0)
    expect(editor.toHTML(true)).toBe("<main><h1>After</h1><a>Link</a></main>")
    editor.destroy()
  })

  it("reads and safely replaces the current selection", () => {
    document.body.innerHTML = "<p>Hello world</p>"
    const editor = new DOMEditor()
    const text = document.querySelector("p")!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 6, text, 11)

    const context = editor.getActionHandler("readAISelection")({type: "readAISelection"}) as {text: string, html: string}
    expect(context).toMatchObject({text: "world", html: "world"})

    editor.getActionHandler("replaceAISelection")({
      type: "replaceAISelection",
      html: '<strong onmouseover="steal()">WebWriter</strong>',
    })
    expect(editor.toHTML(true)).toBe("<p>Hello <strong>WebWriter</strong></p>")
    editor.destroy()
  })
})
