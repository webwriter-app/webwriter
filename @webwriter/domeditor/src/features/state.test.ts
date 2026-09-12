// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import type {EditorStateSnapshot} from "../editor-state"
import {restoreOriginalResourceURLs} from "../serialization"
import {aiEditReviewEvent, executeFailureEvent} from "../editor-bridge"
import {markNames} from "../marks"
import * as Y from "yjs"
import {completeAIConversation} from "../ai-client"
import {createAIProvider} from "../ai-provider"
import type {AIChangeOperation} from "../ai-tools"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const withAIEditor = async (html: string, run: (editor: DOMEditor) => void | Promise<void>) => {
  document.body.innerHTML = html
  const editor = new DOMEditor()
  try { await run(editor) }
  finally { editor.destroy() }
}

const aiElementTarget = (editor: DOMEditor, selector: string) => (
  editor.getActionHandler("inspectAIElements")({type: "inspectAIElements", selector}) as {elements: {target: string}[]}
).elements[0].target

describe("Focused AI proposals", () => {
  it.each([
    {prompt: "Can you improve this?", invalid: "<section><h2>Practice</h2><p>Try it</p></section>", diagnostic: "unnecessary", html: "<h2>Practice</h2><p>Try it</p>", summary: "Add a short practice activity."},
    {prompt: "Add a hologram widget", invalid: "<invented-hologram></invented-hologram>", diagnostic: "unavailable", html: "<details><summary>Explore the idea</summary><p>Compare what you observe.</p></details>", summary: "Add a native interactive activity because the requested widget is unavailable."},
  ])("repairs a proposal for '$prompt' privately and queues a real document change", async ({prompt, invalid, diagnostic, html, summary}) => {
    await withAIEditor("<p>Existing introduction</p><!--preserve-->", async editor => {
      let round = 0, target = "", proposalId = ""
      const state = editor.features.state.actions
      const message = (value: unknown) => new Response(JSON.stringify({choices: [{message: value}]}), {headers: {"content-type": "application/json"}})
      const toolCall = (id: string, name: string, args: unknown) => ({id, type: "function", function: {name, arguments: JSON.stringify(args)}})
      const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(init!.body as string)
        switch(++round) {
          case 1: return message({content: "Which approach would you like?"})
          case 2: return message({tool_calls: [toolCall("read", "inspect_elements", {selector: "p"}), toolCall("catalog", "list_widgets", {})]})
          case 3:
            target = JSON.parse(body.messages.find((item: any) => item.role === "tool" && item.tool_call_id === "read").content).elements[0].target
            return message({tool_calls: [toolCall("invalid", "queue_document_change", {summary, operations: [{type: "insert_html", target, position: "after", html: invalid}]})]})
          default:
            expect(JSON.parse(body.messages.at(-1).content)).toMatchObject({status: "error", message: expect.stringContaining(diagnostic)})
            expect(editor.toHTML(true)).toBe("<p>Existing introduction</p><!--preserve-->")
            return message({tool_calls: [toolCall("repaired", "queue_document_change", {summary, operations: [{type: "insert_html", target, position: "after", html}]})]})
        }
      })
      const result = await completeAIConversation({provider: createAIProvider("ollama"), model: "test", effort: "low", messages: [{role: "user", content: prompt}], fetch,
        toolHandler: async call => {
          if(call.name === "read_editor_capabilities") return state.readAIEditorCapabilities({type: "readAIEditorCapabilities"})
          if(call.name === "inspect_elements") return state.inspectAIElements({...call.arguments, type: "inspectAIElements"})
          if(call.name === "list_widgets") return {members: [], total: 0}
          if(call.name !== "queue_document_change") throw new Error("Unexpected tool")
          const result = state.previewAIOperations({type: "previewAIOperations", editId: call.id, summary: call.arguments.summary as string, operations: call.arguments.operations as AIChangeOperation[]})
          expect(result.status).toBe("previewing")
          proposalId = call.id
          return {status: "queued", proposalId}
        },
      })
      expect(result).toBe(`Queued: ${summary}`)
      expect(fetch).toHaveBeenCalledTimes(4)
      expect(editor.toHTML(true)).toBe(`<p>Existing introduction</p>${html}<!--preserve-->`)
      expect(editor.doc.body.toString()).not.toContain(html)
      state.acceptAIEdit({type: "acceptAIEdit", editId: proposalId})
      expect(editor.toHTML(true)).toContain(html)
    })
  })

  it("preserves existing wrappers and unfamiliar widgets while validating newly proposed structure", async () => {
    await withAIEditor('<section><p>Before</p><authored-widget answer="7"></authored-widget></section>', editor => {
      const target = aiElementTarget(editor, "section")
      editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "authored", summary: "Revise the paragraph.", operations: [
        {type: "replace_html", target, html: '<section><p>After</p><authored-widget answer="7"></authored-widget></section>'},
      ]})
      expect(document.querySelectorAll("section")).toHaveLength(1)
      expect(document.querySelector("authored-widget")?.getAttribute("answer")).toBe("7")
    })
  })

  it("preserves documented widget light-DOM structure without exposing its internals as edit targets", async () => {
    customElements.define("ai-public-content-widget", class extends HTMLElement {})
    await withAIEditor("<p>Introduction</p>", editor => {
      const target = aiElementTarget(editor, "p")
      editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "widget-light-dom", summary: "Add an exercise.", availableWidgets: ["ai-public-content-widget"], operations: [
        {type: "insert_html", target, position: "after", html: '<ai-public-content-widget><section slot="question"><label>Answer<input type="text"></label></section></ai-public-content-widget>'},
      ]})
      expect(document.querySelector("ai-public-content-widget > section[slot=question] input")).not.toBeNull()
      expect(editor.features.state.actions.inspectAIElements({type: "inspectAIElements", selector: "input"}).elements).toHaveLength(0)
    })
  })

  it("previews targeted changes privately, preserves node identity, merges remote edits, and selectively undoes", async () => {
    await withAIEditor('<p class="authored">Before</p><!--keep--><unknown-widget answer="7"></unknown-widget>', async editor => {
      const paragraph = document.querySelector("p")!, widget = document.querySelector("unknown-widget")!, comment = paragraph.nextSibling
      const target = aiElementTarget(editor, "p")
      editor.getActionHandler("previewAIOperations")({type: "previewAIOperations", editId: "focused", summary: "Update the paragraph", operations: [
        {type: "set_text", target, text: "After"}, {type: "set_styles", target, styles: {color: "red"}},
      ]})
      expect(paragraph.textContent).toBe("After")
      expect(editor.doc.body.toString()).toContain("Before")
      expect(document.querySelector("unknown-widget")).toBe(widget)
      expect(paragraph.nextSibling).toBe(comment)
      const remote = new Y.XmlElement("aside")
      remote.insert(0, [new Y.XmlText("Remote")])
      editor.doc.doc.transact(() => editor.doc.body.insert(editor.doc.body.length, [remote]), "remote-client")
      editor.getActionHandler("acceptAIEdit")({type: "acceptAIEdit", editId: "focused"})
      expect(document.querySelector("p")).toBe(paragraph)
      expect(document.querySelector("unknown-widget")).toBe(widget)
      expect(editor.toHTML(true)).toContain("Remote")
      editor.getActionHandler("undoAIEdit")({type: "undoAIEdit", editId: "focused"})
      expect(paragraph.textContent).toBe("Before")
      expect(editor.toHTML(true)).toContain("Remote")
      expect(editor.toHTML(true)).not.toContain("◆")
    })
  })

  it("keeps a saved range attached to its original content when the user moves the caret", async () => {
    await withAIEditor('<p>Hello world</p><aside>Elsewhere</aside>', editor => {
      const text = document.querySelector("p")!.firstChild!, aside = document.querySelector("aside")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 6, text, 11)
      const {selectionId} = editor.getActionHandler("readAISelection")({type: "readAISelection"}) as {selectionId: string}
      document.getSelection()!.setPosition(aside, 3)
      editor.getActionHandler("previewAIOperations")({type: "previewAIOperations", editId: "range", summary: "Emphasize the greeting", operations: [
        {type: "replace_selection", selectionId, html: "<strong>WebWriter</strong>"},
      ]})
      expect(editor.toHTML(true)).toBe("<p>Hello <strong>WebWriter</strong></p><aside>Elsewhere</aside>")
      editor.getActionHandler("rejectAIEdit")({type: "rejectAIEdit", editId: "range"})
      expect(editor.toHTML(true)).toBe("<p>Hello world</p><aside>Elsewhere</aside>")
    })
  })

  it("rejects replaced targets, incomplete reads, and invalid batches before changing content", async () => {
    await withAIEditor("<p>Before</p><aside>Keep</aside>", editor => {
      const target = aiElementTarget(editor, "p")
      const preview = editor.getActionHandler("previewAIOperations")
      expect(() => preview({type: "previewAIOperations", editId: "invalid", summary: "Edit", operations: [
        {type: "set_text", target, text: "After"}, {type: "set_attributes", target, attributes: {onclick: "unsafe()"}},
      ]})).toThrow()
      expect(editor.toHTML(true)).toBe("<p>Before</p><aside>Keep</aside>")
      const incomplete = editor.getActionHandler("readAIDocument")({type: "readAIDocument", limit: 2}) as {target: string}
      expect(() => preview({type: "previewAIOperations", editId: "incomplete", summary: "Edit", operations: [{type: "replace_document", target: incomplete.target, html: "<p>After</p>"}]})).toThrow("incomplete")
      document.querySelector("p")!.outerHTML = "<p>Replacement</p>"
      expect(() => preview({type: "previewAIOperations", editId: "stale", summary: "Edit", operations: [{type: "set_text", target, text: "After"}]})).toThrow("target changed")
      expect(editor.toHTML(true)).toContain("Replacement")
    })
  })

  it("rolls back an entire batch when applying a later operation fails", async () => {
    await withAIEditor("<p>Before</p>", editor => {
      const target = aiElementTarget(editor, "p")
      vi.spyOn(editor.features.manipulation, "setElementStyles").mockImplementation(() => { throw new Error("Concurrent change") })
      expect(() => editor.getActionHandler("previewAIOperations")({type: "previewAIOperations", editId: "rollback", summary: "Edit", operations: [
        {type: "set_text", target, text: "After"}, {type: "set_styles", target, styles: {color: "red"}},
      ]})).toThrow("Concurrent change")
      expect(editor.toHTML(true)).toBe("<p>Before</p>")
      expect(editor.isEditingLocked).toBe(false)
      expect(editor.appendix.querySelector(".◆ai-review-toolbar")).toBeNull()
    })
  })

  it("inserts ordered siblings and contextual table content without unwrapping supported elements", async () => {
    await withAIEditor('<table><tbody><tr><td>A</td></tr></tbody></table><p>End</p>', editor => {
      const row = aiElementTarget(editor, "tr"), paragraph = aiElementTarget(editor, "p")
      editor.getActionHandler("previewAIOperations")({type: "previewAIOperations", editId: "insert", summary: "Add content", operations: [
        {type: "insert_html", target: row, position: "append", html: "<td>B</td>"},
        {type: "insert_html", target: row, position: "append", html: "<td>C</td>"},
        {type: "insert_html", target: paragraph, position: "before", html: "<hgroup><h2>Heading</h2><p>Subtitle</p></hgroup><dialog open><p>Dialog</p></dialog>"},
        {type: "replace_html", target: paragraph, html: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" /></svg>'},
      ]})
      expect(Array.from(document.querySelectorAll("td"), node => node.textContent)).toEqual(["A", "B", "C"])
      expect(document.querySelector("hgroup h2")?.textContent).toBe("Heading")
      expect(document.querySelector("dialog p")?.textContent).toBe("Dialog")
      expect(document.querySelector("circle")?.namespaceURI).toBe("http://www.w3.org/2000/svg")
    })
  })

  it("rejects unknown widgets and no-op proposals and creates layouts with direct children", async () => {
    await withAIEditor("<p>Before</p>", editor => {
      let target = aiElementTarget(editor, "p")
      const preview = editor.getActionHandler("previewAIOperations")
      expect(() => preview({type: "previewAIOperations", editId: "widget", summary: "Add widget", operations: [{type: "insert_html", target, position: "after", html: "<invented-widget></invented-widget>"}]})).toThrow("unavailable or undocumented")
      expect(() => preview({type: "previewAIOperations", editId: "noop", summary: "Edit", operations: [{type: "set_text", target, text: "Before"}]})).toThrow("does not change")
      target = aiElementTarget(editor, "p")
      preview({type: "previewAIOperations", editId: "layout", summary: "Add two columns", operations: [{type: "insert_layout", target, position: "after", preset: "two-columns"}]})
      expect(document.querySelector("section")?.style.display).toBe("grid")
      expect(document.querySelectorAll("section > p")).toHaveLength(2)
      expect(document.querySelector("section section")).toBeNull()
    })
  })
})

describe("StateFeature", () => {
  it("reads paginated DOM targets without losing valid elements, comments, or authored attributes", () => {
    document.body.innerHTML = '<hgroup><h1>Title</h1></hgroup><!--keep--><dialog open><p>Body</p></dialog>'
    const editor = new DOMEditor()
    const read = editor.getActionHandler("readAIDocument")
    const first = read({type: "readAIDocument", limit: 12}) as any
    const second = read({type: "readAIDocument", offset: first.nextOffset}) as any
    expect(first.truncated).toBe(true)
    expect(first).toMatchObject({nodeType: Node.ELEMENT_NODE, tagName: "body", htmlScope: "contents"})
    expect(first.html + second.html).toBe(editor.toHTML(true))
    const outline = read({type: "readAIDocument", mode: "outline", limit: 1}) as any
    expect(outline.nodes[0].tagName).toBe("hgroup")
    expect(read({type: "readAIDocument", target: outline.nodes[0].target})).toMatchObject({html: "<hgroup><h1>Title</h1></hgroup>", truncated: false, tagName: "hgroup", htmlScope: "node"})
    expect(() => read({type: "readAIDocument", offset: -1})).toThrow()
    editor.destroy()
  })

  it("inspects exact targets independently of the selection and excludes widget internals", () => {
    document.body.innerHTML = '<p style="text-align: right">Selected</p><aside class="authored ◆hover" style="text-align: left">Target</aside><read-probe><p>Private</p></read-probe>'
    const editor = new DOMEditor()
    const text = document.querySelector("p")!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 0, text, 8)
    const inspect = editor.getActionHandler("inspectAIElements")
    const result = inspect({type: "inspectAIElements", selector: "aside", properties: ["text-align"]}) as any
    expect(result.elements[0].style.inline["text-align"].value).toBe("left")
    expect(result.elements[0].attributes.class).toBe("authored")
    const all = inspect({type: "inspectAIElements", selector: "p"}) as any
    expect(all.elements).toHaveLength(1)
    const ref = result.elements[0].target
    document.querySelector("aside")!.remove()
    expect(() => inspect({type: "inspectAIElements", targets: [ref]})).toThrow("target changed")
    editor.destroy()
  })

  it("reports capability restrictions and distinguishes absent selections from carets", () => {
    document.body.innerHTML = "<p>Text</p>"
    const editor = new DOMEditor()
    const capabilities = editor.getActionHandler("readAIEditorCapabilities")({type: "readAIEditorCapabilities", topic: "elements"}) as any
    expect(capabilities.elements.script.intentionallyRestricted).toBe(true)
    expect(capabilities.elements.dialog.aiInsertion).toBe(true)
    vi.spyOn(document, "getSelection").mockReturnValueOnce(null)
    expect(editor.getActionHandler("readAISelection")({type: "readAISelection"})).toMatchObject({kind: "none"})
    document.getSelection()!.setPosition(document.querySelector("p")!.firstChild!, 2)
    expect(editor.getActionHandler("readAISelection")({type: "readAISelection"})).toMatchObject({kind: "caret", selectionId: expect.any(String), context: {tagName: "p"}})
    editor.destroy()
  })
  it("rejects unchanged proposals without retaining a preview or review lock", () => {
    document.body.innerHTML = "<p>Unchanged</p>"
    const editor = new DOMEditor()
    expect(() => editor.getActionHandler("previewAIDocument")({
      type: "previewAIDocument", editId: "noop", summary: "No change", html: "<p>Unchanged</p>",
    })).toThrow("does not change")
    expect(editor.appendix.querySelector(".◆ai-review-toolbar")).toBeNull()
    expect(editor.toHTML(true)).toBe("<p>Unchanged</p>")
    editor.destroy()
  })
  it("does not construct widgets while serializing an AI selection", async () => {
    let constructions = 0
    const tag = "state-serialization-probe"
    if(!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {
        constructor() {
          super()
          constructions++
        }
      })
    }
    document.body.innerHTML = `<p class="authored ◆selection-marker">Before </p><${tag}>Widget</${tag}><p> After</p>`
    const editor = new DOMEditor()
    try {
      const [before, after] = Array.from(document.querySelectorAll("p"))
      document.getSelection()!.setBaseAndExtent(before.firstChild!, 0, after.firstChild!, after.textContent!.length)
      await Promise.resolve()
      const baseline = constructions
      const result = editor.getActionHandler("readAISelection")({type: "readAISelection"}) as {html: string, text: string}

      expect(result.text).toBe("Before Widget After")
      expect(result.html).toBe(`<p class="authored">Before </p><${tag}>Widget</${tag}><p> After</p>`)
      const begin = editor.getActionHandler("beginHTMLSelectionEdit")({type: "beginHTMLSelectionEdit"}) as {html: string}
      expect(begin.html).toBe(`<p class="authored">Before </p><${tag}>Widget</${tag}><p> After</p>`)
      expect(constructions).toBe(baseline)
    }
    finally {
      editor.destroy()
    }
  })

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
    const embeddedScript = new DOMParser().parseFromString(html, "text/html").querySelector("script")!
    expect(atob(embeddedScript.src.split(",")[1])).toBe("window.offline = true")
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
      html: '<style>body{display:none}</style><link rel="stylesheet"><main style="color: red"><dialog open><hgroup><h1 onclick="steal()">After</h1></hgroup></dialog><a href="javascript:steal()">Link</a><script>steal()</script></main>',
    }) as {status: string, removedUnsafeItems: number}

    expect(result.status).toBe("applied")
    expect(result.removedUnsafeItems).toBeGreaterThan(0)
    expect(editor.toHTML(true)).toBe('<main style="color: red"><h1>After</h1><a>Link</a></main>')
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

  it("uses the element outside nested mark-drawer wrappers as a collapsed selection's HTML root", () => {
    document.body.innerHTML = '<p class="authored ◆element-selected">Hello <b><i>world</i></b></p>'
    const editor = new DOMEditor()
    const text = document.querySelector("i")!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 2, text, 2)

    const result = editor.getActionHandler("beginHTMLSelectionEdit")({
      type: "beginHTMLSelectionEdit",
    }) as {html: string}

    expect(result.html).toBe('<p class="authored">Hello <b><i>world</i></b></p>')
    expect(result.html).not.toContain("◆")
    editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
    editor.destroy()
  })

  it("never uses any mark-drawer element as the saved-path HTML root", () => {
    for(const tag of [...markNames, "strong", "em"]) {
      document.body.replaceChildren()
      const paragraph = document.createElement("p")
      const mark = document.createElement(tag)
      mark.textContent = "Selected"
      paragraph.append(mark)
      document.body.append(paragraph)
      const editor = new DOMEditor()
      document.getSelection()!.setPosition(document.body, 0)

      const result = editor.getActionHandler("beginHTMLSelectionEdit")({
        type: "beginHTMLSelectionEdit",
        path: [0, 0],
      }) as {html: string}

      expect(result.html, tag).toBe(`<p><${tag}>Selected</${tag}></p>`)
      editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
      editor.destroy()
    }
  })

  it("uses the host selection path when focus leaves only an empty body selection", () => {
    document.body.innerHTML = "<p>First</p><section><p>Selected</p></section>"
    const editor = new DOMEditor()
    document.getSelection()!.setPosition(document.body, 0)

    const result = editor.getActionHandler("beginHTMLSelectionEdit")({
      type: "beginHTMLSelectionEdit",
      path: [1],
    }) as {html: string}

    expect(result.html).toBe("<section><p>Selected</p></section>")
    editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
    editor.destroy()
  })

  it("holds a sanitized HTML selection change pending until it is applied", () => {
    document.body.innerHTML = "<p>Before</p>"
    const editor = new DOMEditor()
    const paragraph = document.querySelector("p")!
    document.getSelection()!.setPosition(paragraph.firstChild!, 3)
    const begin = editor.getActionHandler("beginHTMLSelectionEdit")({
      type: "beginHTMLSelectionEdit",
    }) as {html: string}
    expect(begin.html).toBe("<p>Before</p>")

    editor.getActionHandler("setHTMLSelectionEditPending")({
      type: "setHTMLSelectionEditPending",
      pending: true,
    })

    expect(editor.features.state.isHTMLSelectionEditPending).toBe(true)
    expect(editor.isEditingLocked).toBe(true)
    expect(paragraph.classList.contains("◆html-source-pending")).toBe(true)
    expect(editor.toHTML(true)).toBe("<p>Before</p>")
    const beforeInput = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText"})
    paragraph.dispatchEvent(beforeInput)
    expect(beforeInput.defaultPrevented).toBe(true)
    let failure: CustomEvent | undefined
    window.addEventListener(executeFailureEvent, event => failure = event as CustomEvent, {once: true})
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: "undo",
        requestId: "html-pending-undo",
        bridgeNonce: editor.trustedScriptNonce,
      },
    }))
    expect(failure?.detail.error.message).toContain("Apply or discard")

    const result = editor.getActionHandler("applyHTMLSelectionEdit")({
      type: "applyHTMLSelectionEdit",
      html: '<section style="color: red" onclick="evil()"><p>After</p><style>body{display:none}</style><script>while(true){}</script></section>',
    }) as {status: string, removedUnsafeItems: number}

    expect(result.status).toBe("applied")
    expect(result.removedUnsafeItems).toBeGreaterThan(0)
    expect(editor.toHTML(true)).toBe('<section style="color: red"><p>After</p></section>')
    expect(document.querySelector(".◆html-source-pending")).toBeNull()
    expect(editor.isEditingLocked).toBe(false)
    editor.destroy()
  })

  it("discards a pending HTML selection change without touching the document", () => {
    document.body.innerHTML = "<p>Keep</p>"
    const editor = new DOMEditor()
    document.getSelection()!.setPosition(document.querySelector("p")!.firstChild!, 2)
    editor.getActionHandler("beginHTMLSelectionEdit")({type: "beginHTMLSelectionEdit"})
    editor.getActionHandler("setHTMLSelectionEditPending")({
      type: "setHTMLSelectionEditPending",
      pending: true,
    })

    const result = editor.getActionHandler("discardHTMLSelectionEdit")({
      type: "discardHTMLSelectionEdit",
    }) as {status: string}

    expect(result.status).toBe("discarded")
    expect(editor.toHTML(true)).toBe("<p>Keep</p>")
    expect(editor.features.state.isHTMLSelectionEditPending).toBe(false)
    expect(editor.isEditingLocked).toBe(false)
    editor.destroy()
  })

  it("rejects applying a pending edit after the selected node is replaced", () => {
    document.body.innerHTML = "<p>Keep</p><aside>Elsewhere</aside>"
    const editor = new DOMEditor()
    const paragraph = document.querySelector("p")!
    document.getSelection()!.setPosition(paragraph.firstChild!, 2)
    editor.getActionHandler("beginHTMLSelectionEdit")({type: "beginHTMLSelectionEdit"})
    editor.getActionHandler("setHTMLSelectionEditPending")({
      type: "setHTMLSelectionEditPending",
      pending: true,
    })

    paragraph.replaceWith(document.createElement("p"))
    const apply = () => editor.getActionHandler("applyHTMLSelectionEdit")({
      type: "applyHTMLSelectionEdit",
      html: "<p>Changed</p>",
    })

    expect(apply).toThrow("The selected content changed before the HTML could be applied")
    expect(editor.toHTML(true)).toBe("<p></p><aside>Elsewhere</aside>")
    expect(editor.features.state.isHTMLSelectionEditPending).toBe(true)
    expect(editor.isEditingLocked).toBe(true)
    editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
    expect(editor.isEditingLocked).toBe(false)
    editor.destroy()
  })

  it("allows unrelated edits while a pending HTML selection waits", () => {
    document.body.innerHTML = "<p>Keep</p><aside>Elsewhere</aside>"
    const editor = new DOMEditor()
    const paragraph = document.querySelector("p")!
    document.getSelection()!.setPosition(paragraph.firstChild!, 2)
    editor.getActionHandler("beginHTMLSelectionEdit")({type: "beginHTMLSelectionEdit"})
    editor.getActionHandler("setHTMLSelectionEditPending")({
      type: "setHTMLSelectionEditPending",
      pending: true,
    })
    document.querySelector("aside")!.textContent = "Updated"

    const result = editor.getActionHandler("applyHTMLSelectionEdit")({
      type: "applyHTMLSelectionEdit",
      html: "<p>Changed</p>",
    }) as {status: string}

    expect(result.status).toBe("applied")
    expect(editor.toHTML(true)).toBe("<p>Changed</p><aside>Updated</aside>")
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
    const slot = Array.from(editor.appendix.children)
      .find(element => element.localName === "slot" && !element.hasAttribute("name")) as HTMLSlotElement
    expect(document.body.inert).toBe(false)
    expect(slot.inert).toBe(true)
    expect(document.body.contentEditable).toBe("inherit")
    expect(document.querySelector(".◆ai-review-toolbar")).toBeNull()
    expect(editor.appendix.querySelector(".◆ai-review-toolbar")?.textContent).toContain("Replace the paragraph")
    expect(document.querySelector(".◆ai-preview-change")).not.toBeNull()
    const beforeInput = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "x"})
    const paragraph = document.querySelector("p")!
    Object.defineProperty(beforeInput, "composedPath", {
      value: () => [paragraph, slot, editor.appendix, document.body, document.documentElement, document, window],
    })
    paragraph.dispatchEvent(beforeInput)
    expect(beforeInput.defaultPrevented).toBe(true)
    const toolbarPointer = new PointerEvent("pointerdown", {bubbles: true, cancelable: true})
    editor.appendix.querySelector(".◆ai-review-toolbar")!.dispatchEvent(toolbarPointer)
    expect(toolbarPointer.defaultPrevented).toBe(false)
    const toolbarKey = new KeyboardEvent("keydown", {key: "Enter", bubbles: true, composed: true, cancelable: true})
    editor.appendix.querySelector('.◆ai-review-toolbar button[data-action="reject"]')!.dispatchEvent(toolbarKey)
    expect(toolbarKey.defaultPrevented).toBe(false)
    const reviewChoice = vi.fn((event: Event) => event.preventDefault())
    window.addEventListener(aiEditReviewEvent, reviewChoice, {once: true})
    editor.appendix.querySelector<HTMLButtonElement>('.◆ai-review-toolbar button[data-action="reject"]')!.click()
    expect(reviewChoice).toHaveBeenCalledWith(expect.objectContaining({
      detail: {editId: "edit-reject", action: "reject"},
    }))

    editor.getActionHandler("rejectAIEdit")({type: "rejectAIEdit", editId: "edit-reject"})

    expect(editor.toHTML(true)).toBe("<p>Before</p>")
    expect(document.body.inert).toBe(false)
    expect(slot.inert).toBe(false)
    expect(document.body.contentEditable).toBe("inherit")
    expect(editor.appendix.querySelector(".◆ai-review-toolbar")).toBeNull()
    editor.destroy()
  })

  it("authenticates the fallback AI review message to the host", () => {
    document.body.innerHTML = "<p>Before</p>"
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    const editor = new DOMEditor({
      bridgeNonce: "0123456789abcdef",
      bridgeOrigin: "https://editor-host.example",
    })
    postMessage.mockClear()
    editor.getActionHandler("previewAIDocument")({
      type: "previewAIDocument",
      editId: "edit-fallback",
      summary: "Replace the paragraph",
      html: "<p>After</p>",
    })

    editor.appendix.querySelector<HTMLButtonElement>('.◆ai-review-toolbar button[data-action="accept"]')!.click()

    expect(postMessage).toHaveBeenCalledWith({
      type: aiEditReviewEvent,
      detail: {editId: "edit-fallback", action: "accept"},
      bridgeNonce: "0123456789abcdef",
    }, "https://editor-host.example")
    editor.getActionHandler("rejectAIEdit")({type: "rejectAIEdit", editId: "edit-fallback"})
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
