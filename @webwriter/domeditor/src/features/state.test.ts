// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import type {EditorStateSnapshot} from "../editor-state"
import {restoreOriginalResourceURLs} from "../serialization"
import {aiEditReviewEvent} from "../editor-bridge"

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
    // Keep the resource fixture inert in Happy DOM while exercising the same
    // script[src] serialization path used for executable scripts.
    document.body.innerHTML = '<img src="/photo.png"><script type="application/json" src="/app.js"></script>'
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

  it("shows a read-only in-document AI preview and restores the document when rejected", () => {
    document.body.innerHTML = "<p>Before</p>"
    const editor = new DOMEditor()

    const preview = editor.getActionHandler("previewAIDocument")({
      type: "previewAIDocument",
      editId: "edit-reject",
      summary: "Replace the paragraph",
      html: '<p onclick="unsafe()">After</p>',
    }) as {status: string, removedUnsafeItems: number}

    expect(preview.status).toBe("previewing")
    expect(preview.removedUnsafeItems).toBeGreaterThan(0)
    expect(editor.toHTML(true)).toBe("<p>After</p>")
    expect(editor.doc.body.toString()).toContain("Before")
    expect(editor.doc.body.toString()).not.toContain("After")
    expect(document.body.inert).toBe(true)
    expect(document.body.contentEditable).toBe("false")
    expect(document.querySelector(".◆ai-review-toolbar")?.textContent).toContain("Replace the paragraph")
    expect(document.querySelector(".◆ai-preview-change")).not.toBeNull()
    const beforeInput = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "x"})
    document.querySelector("p")!.dispatchEvent(beforeInput)
    expect(beforeInput.defaultPrevented).toBe(true)
    const toolbarPointer = new PointerEvent("pointerdown", {bubbles: true, cancelable: true})
    document.querySelector(".◆ai-review-toolbar")!.dispatchEvent(toolbarPointer)
    expect(toolbarPointer.defaultPrevented).toBe(false)
    const reviewChoice = vi.fn((event: Event) => event.preventDefault())
    window.addEventListener(aiEditReviewEvent, reviewChoice, {once: true})
    document.querySelector<HTMLButtonElement>('.◆ai-review-toolbar button[data-action="reject"]')!.click()
    expect(reviewChoice).toHaveBeenCalledWith(expect.objectContaining({
      detail: {editId: "edit-reject", action: "reject"},
    }))

    editor.getActionHandler("rejectAIEdit")({type: "rejectAIEdit", editId: "edit-reject"})

    expect(editor.toHTML(true)).toBe("<p>Before</p>")
    expect(document.body.inert).toBe(false)
    expect(document.body.contentEditable).toBe("true")
    expect(document.querySelector(".◆ai-review-toolbar")).toBeNull()
    editor.destroy()
  })

  it("accepts an AI preview and selectively undoes it without removing later edits", async () => {
    document.body.innerHTML = "<p>Before</p>"
    const editor = new DOMEditor()

    editor.getActionHandler("previewAIDocument")({
      type: "previewAIDocument",
      editId: "edit-accept",
      summary: "Replace the paragraph",
      html: "<main>After</main>",
    })
    editor.getActionHandler("acceptAIEdit")({type: "acceptAIEdit", editId: "edit-accept"})

    expect(editor.toHTML(true)).toBe("<main>After</main>")
    expect(document.querySelector(".◆ai-preview-change")).toBeNull()
    expect(document.getElementsByClassName("◆ai-edit-1")).toHaveLength(1)

    const aside = document.createElement("aside")
    aside.textContent = "Later local edit"
    document.body.append(aside)
    await new Promise<void>(resolve => queueMicrotask(resolve))

    const undone = editor.getActionHandler("undoAIEdit")({
      type: "undoAIEdit",
      editId: "edit-accept",
    }) as {status: string}

    expect(undone.status).toBe("undone")
    expect(editor.toHTML(true)).toContain("<p>Before</p>")
    expect(editor.toHTML(true)).toContain("<aside>Later local edit</aside>")
    editor.destroy()
  })

  it("cleans up when accepting a preview with a duplicate captured change id fails", async () => {
    document.body.innerHTML = "<p>Before</p>"
    const editor = new DOMEditor()
    const previewAction = editor.getActionHandler("previewAIDocument")
    const acceptAction = editor.getActionHandler("acceptAIEdit")

    previewAction({type: "previewAIDocument", editId: "duplicate", summary: "First", html: "<p>First</p>"})
    acceptAction({type: "acceptAIEdit", editId: "duplicate"})

    previewAction({type: "previewAIDocument", editId: "duplicate", summary: "Second", html: "<p>Second</p>"})
    expect(() => acceptAction({type: "acceptAIEdit", editId: "duplicate"})).toThrow("already exists")
    expect(document.body.textContent).toBe("First")

    document.querySelector("p")!.textContent = "After failed preview"
    await new Promise<void>(resolve => queueMicrotask(resolve))
    await new Promise<void>(resolve => queueMicrotask(resolve))
    expect(editor.doc.body.toString()).toContain("After failed preview")
    editor.destroy()
  })
})
