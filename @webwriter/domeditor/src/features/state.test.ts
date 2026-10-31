// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {sharedDOMBody} from "../domdoc"
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

describe("document state operation boundaries", () => {
  it.each(["document", "selection", "operations"])("preserves another owner's editing lock when a %s preview is rejected", async scope => {
    await withAIEditor("<p>Before</p><aside>Keep</aside>", editor => {
      const state = editor.features.state.actions
      const text = document.querySelector("p")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 0, text, 6)
      const target = aiElementTarget(editor, "p")
      const owner = {}
      editor.lockEditing(owner)
      const preview = () => scope === "document"
        ? state.previewAIDocument({type: "previewAIDocument", editId: "locked", summary: "Revise", html: "<p>After</p>"})
        : scope === "selection"
          ? state.previewAISelection({type: "previewAISelection", editId: "locked", summary: "Revise", html: "After"})
          : state.previewAIOperations({type: "previewAIOperations", editId: "locked", summary: "Revise", operations: [{type: "set_text", target, text: "After"}]})
      expect(preview).toThrow("currently locked")
      expect(editor.hasEditingLock(owner)).toBe(true)
      expect(editor.toHTML(true)).toBe("<p>Before</p><aside>Keep</aside>")
      expect(editor.appendix.querySelector(".◆ai-review-toolbar")).toBeNull()
      editor.unlockEditing(owner)
      expect(preview()).toMatchObject({status: "previewing"})
      state.rejectAIEdit({type: "rejectAIEdit", editId: "locked"})
      expect(editor.isEditingLocked).toBe(false)
      expect(editor.toHTML(true)).toBe("<p>Before</p><aside>Keep</aside>")
    })
  })

  it("reads a captured SVG selection without serializing capture markers", async () => {
    await withAIEditor('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"></circle></svg><p>Keep</p>', editor => {
      const graphic = document.querySelector("svg")!
      editor.features.selection.captureElement(graphic)
      const result = editor.features.state.actions.readAISelection({type: "readAISelection"})
      expect(result.kind).toBe("capture")
      expect(result.html).toContain('<circle r="5"')
      expect(result.html).not.toContain("◆")
      expect(result).toMatchObject({context: {tagName: "body"}})
      expect(editor.toHTML(true)).not.toContain("◆")
    })
  })

  it("distinguishes an exact native element selection from a text range", async () => {
    await withAIEditor("<p>Hello</p><aside>Keep</aside>", editor => {
      const paragraph = document.querySelector("p")!
      editor.features.selection.selectElement(paragraph)
      expect(editor.features.state.actions.readAISelection({type: "readAISelection"})).toMatchObject({kind: "element", html: "<p>Hello</p>", collapsed: false})
      document.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 1, paragraph.firstChild!, 4)
      editor.features.selection.processSelection(false, {scrollIntoView: false})
      expect(editor.features.state.actions.readAISelection({type: "readAISelection"})).toMatchObject({kind: "range", html: "ell", text: "ell", collapsed: false})
    })
  })

  it("paginates inspection while preserving authored attributes and excluding editor markers", async () => {
    await withAIEditor('<p class="authored">First</p><p title="Second">Second</p><p>Third</p>', editor => {
      const state = editor.features.state.actions
      const first = document.querySelector("p")!
      editor.features.selection.selectElement(first)
      const page = state.inspectAIElements({type: "inspectAIElements", selector: "p", limit: 1})
      expect(page.total).toBe(3)
      expect(page.nextOffset).toBe(1)
      expect(page.elements[0].attributes.class).toBe("authored")
      const tail = state.inspectAIElements({type: "inspectAIElements", selector: "p", offset: 1, limit: 2})
      expect(tail.total).toBe(3)
      expect(tail.nextOffset).toBeUndefined()
      expect(tail.elements.map(element => element.text)).toEqual(["Second", "Third"])
      expect(tail.elements[0].attributes.title).toBe("Second")
      expect(editor.toHTML(true)).not.toContain("◆")
    })
  })

  it.each(["smooth", "instant"] as const)("locates and accepts a reviewed element with %s scrolling", async behavior => {
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]})
    try {
      await withAIEditor(behavior === "instant" ? '<p style="--ww-ui-transition:none">Before</p><aside>Keep</aside>' : "<p>Before</p><aside>Keep</aside>", editor => {
        const state = editor.features.state.actions
        const paragraph = document.querySelector("p")!
        const aside = document.querySelector("aside")!
        const scroll = vi.spyOn(paragraph, "scrollIntoView").mockImplementation(() => {})
        state.previewAIOperations({type: "previewAIOperations", editId: "review-location", summary: "Revise text", operations: [
          {type: "set_text", target: aiElementTarget(editor, "p"), text: "After"},
        ]})
        const marker = Array.from(paragraph.classList).find(name => name.startsWith("◆ai-edit-"))!
        expect(marker).toBeDefined()
        const pulse = {animationName: "◆ai-preview-pulse", currentTime: 80, play: vi.fn()}
        Object.defineProperty(paragraph, "getAnimations", {configurable: true, value: () => [pulse]})
        vi.spyOn(paragraph, "offsetWidth", "get").mockImplementation(() => { throw new Error("layout read") })
        scroll.mockClear()
        expect(state.gotoAIEdit({type: "gotoAIEdit", editId: "review-location"})).toEqual({status: "located"})
        expect(scroll).toHaveBeenCalledExactlyOnceWith({block: "center", behavior})
        expect(paragraph.classList.contains("◆ai-preview-pulse")).toBe(true)
        expect(pulse.currentTime).toBe(0)
        expect(pulse.play).toHaveBeenCalledOnce()
        vi.advanceTimersByTime(600)
        pulse.currentTime = 80
        expect(state.gotoAIEdit({type: "gotoAIEdit", editId: "review-location"})).toEqual({status: "located"})
        expect(pulse.currentTime).toBe(0)
        expect(pulse.play).toHaveBeenCalledTimes(2)
        vi.advanceTimersByTime(600)
        expect(paragraph.classList.contains("◆ai-preview-pulse")).toBe(true)
        vi.advanceTimersByTime(600)
        expect(paragraph.classList.contains("◆ai-preview-pulse")).toBe(false)
        expect(state.acceptAIEdit({type: "acceptAIEdit", editId: "review-location"})).toMatchObject({status: "applied"})
        expect(document.querySelector("p")).toBe(paragraph)
        expect(document.querySelector("aside")).toBe(aside)
        expect(paragraph.classList.contains(marker)).toBe(true)
        expect(paragraph.classList.contains("◆ai-preview-change")).toBe(false)
        expect(editor.toHTML(true)).not.toContain("◆")
        expect(editor.isEditingLocked).toBe(false)
      })
    }
    finally { vi.useRealTimers() }
  })

  it("rolls back when a widget removes its own style target during an earlier attribute operation", async () => {
    customElements.define("state-removing-widget", class extends HTMLElement {
      static observedAttributes = ["title"]
      attributeChangedCallback(_name: string, _old: string | null, value: string | null) {
        if(this.isConnected && value === "Remove") this.remove()
      }
    })
    await withAIEditor('<state-removing-widget title="Before"></state-removing-widget><aside>Keep</aside>', editor => {
      const state = editor.features.state.actions
      const target = aiElementTarget(editor, "state-removing-widget")
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "widget-concurrent", summary: "Configure", availableWidgets: ["state-removing-widget"], operations: [
        {type: "set_attributes", target, attributes: {title: "Remove"}},
        {type: "set_styles", target, styles: {color: "red"}},
      ]})).toThrow("style target is unavailable")
      expect(editor.toHTML(true)).toBe('<state-removing-widget title="Before"></state-removing-widget><aside>Keep</aside>')
      expect(editor.isEditingLocked).toBe(false)
      expect(editor.appendix.querySelector(".◆ai-review-toolbar")).toBeNull()
      expect(document.querySelector(".◆ai-preview-change")).toBeNull()
    })
  })

  it.each([
    {path: [0], expected: "<p>First</p>"},
    {path: [0, 0], expected: "<p>First</p>"},
    {path: [], expected: "<p>First</p><!--keep--><aside>Other</aside>"},
    {path: [99], expected: "<p>First</p><!--keep--><aside>Other</aside>"},
    {path: [0, 0, 0], expected: "<p>First</p><!--keep--><aside>Other</aside>"},
  ])("opens HTML from fallback path $path when native selection is absent", async ({path, expected}) => {
    await withAIEditor("<p>First</p><!--keep--><aside>Other</aside>", editor => {
      editor.features.selection.disable()
      document.getSelection()!.removeAllRanges()
      const nodes = Array.from(document.body.childNodes)
      const state = editor.features.state.actions
      expect(state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit", path})).toEqual({html: expected})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      expect(editor.isEditingLocked).toBe(true)
      expect(editor.toHTML(true)).toBe("<p>First</p><!--keep--><aside>Other</aside>")
      state.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
      expect(Array.from(document.body.childNodes)).toEqual(nodes)
      expect(editor.isEditingLocked).toBe(false)
      expect(document.querySelector(".◆html-source-pending, .◆style-target-hovered")).toBeNull()
    })
  })

  it("keeps a pending HTML selection and its lock when a second edit is refused", async () => {
    await withAIEditor("<p>Keep</p><aside>Other</aside>", editor => {
      const state = editor.features.state.actions
      const paragraph = document.querySelector("p")!
      document.getSelection()!.setPosition(paragraph.firstChild!, 2)
      state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})

      expect(() => state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit", path: [1]})).toThrow("pending HTML change")
      expect(editor.features.state.isHTMLSelectionEditPending).toBe(true)
      expect(editor.isEditingLocked).toBe(true)
      expect(paragraph.classList.contains("◆html-source-pending")).toBe(true)
      expect(editor.toHTML(true)).toBe("<p>Keep</p><aside>Other</aside>")

      state.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
      expect(editor.isEditingLocked).toBe(false)
      expect(paragraph.classList.contains("◆html-source-pending")).toBe(false)
    })
  })

  it("marks the body for a comment-only pending range and restores the exact range on discard", async () => {
    await withAIEditor("<p>Keep</p><!--note--><aside>Other</aside>", editor => {
      editor.features.selection.disable()
      const selection = document.getSelection()!
      const comment = document.body.childNodes[1]
      const range = document.createRange()
      range.selectNode(comment)
      selection.removeAllRanges()
      selection.addRange(range)
      const state = editor.features.state.actions
      expect(state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})).toEqual({html: "<!--note-->"})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      expect(document.body.classList.contains("◆html-source-pending")).toBe(true)
      expect(editor.toHTML(true)).toBe("<p>Keep</p><!--note--><aside>Other</aside>")
      selection.setPosition(document.querySelector("aside")!.firstChild!, 2)
      state.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
      expect(selection.getRangeAt(0).startContainer).toBe(document.body)
      expect(selection.getRangeAt(0).startOffset).toBe(1)
      expect(selection.getRangeAt(0).endOffset).toBe(2)
      expect(document.body.childNodes[1]).toBe(comment)
      expect(document.body.classList.contains("◆html-source-pending")).toBe(false)
    })
  })

  it("marks each intersected body child for a pending range across independent flows", async () => {
    await withAIEditor("<section><p>First</p></section><!--keep--><aside>Other</aside><p>Outside</p>", editor => {
      editor.features.selection.disable()
      const section = document.querySelector("section")!
      const aside = document.querySelector("aside")!
      const outside = document.body.lastElementChild!
      document.getSelection()!.setBaseAndExtent(section.querySelector("p")!.firstChild!, 2, aside.firstChild!, 3)
      const state = editor.features.state.actions
      state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      expect(section.classList.contains("◆html-source-pending")).toBe(true)
      expect(aside.classList.contains("◆html-source-pending")).toBe(true)
      expect(outside.classList.contains("◆html-source-pending")).toBe(false)
      state.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
      expect(document.querySelector(".◆html-source-pending")).toBeNull()
      expect(editor.toHTML(true)).toBe("<section><p>First</p></section><!--keep--><aside>Other</aside><p>Outside</p>")
    })
  })

  it("releases review presentation after a pending HTML application fails during synchronization", async () => {
    await withAIEditor("<p>Before</p><aside>Keep</aside>", editor => {
      const state = editor.features.state.actions
      document.getSelection()!.setPosition(document.querySelector("p")!.firstChild!, 2)
      state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      const syncFromDOM = editor.doc.syncFromDOM.bind(editor.doc)
      let failed = false
      const sync = vi.spyOn(editor.doc, "syncFromDOM").mockImplementation((...args) => {
        // Happy DOM dispatches selection changes synchronously while replacing
        // the range. Fail the command's explicit sync after those notifications.
        if(!failed && args.length === 0) {
          failed = true
          throw new Error("Sync failed")
        }
        return syncFromDOM(...args)
      })
      expect(() => state.applyHTMLSelectionEdit({type: "applyHTMLSelectionEdit", html: "<p>After</p>"})).toThrow("Sync failed")
      expect(editor.features.state.isHTMLSelectionEditPending).toBe(true)
      expect(editor.isEditingLocked).toBe(true)
      sync.mockRestore()
      state.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
      expect(editor.isEditingLocked).toBe(false)
      expect(document.querySelector(".◆html-source-pending, .◆style-target-hovered")).toBeNull()
      expect(document.documentElement.classList.contains("◆html-source-review-active")).toBe(false)
      editor.doc.syncFromDOM()
      expect(editor.doc.body.toString()).toContain("After")
      expect(document.querySelector("aside")!.textContent).toBe("Keep")
    })
  })

  it("validates template content inside a documented widget's public contract", async () => {
    customElements.define("state-template-widget", class extends HTMLElement {})
    await withAIEditor("<p>Keep</p>", editor => {
      const state = editor.features.state.actions
      state.previewAIOperations({type: "previewAIOperations", editId: "template-widget", summary: "Add exercise", availableWidgets: ["state-template-widget"], operations: [
        {type: "insert_html", target: aiElementTarget(editor, "p"), position: "after", html: '<state-template-widget><template><label>Answer<input type="text"></label></template></state-template-widget>'},
      ]})
      const template = document.querySelector("template")!
      expect(template.content.querySelector("label")?.textContent).toBe("Answer")
      expect(template.content.querySelector("input")?.type).toBe("text")
      state.rejectAIEdit({type: "rejectAIEdit", editId: "template-widget"})
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
    })
  })

  it.each(["empty", "outside"])("refuses replacing an %s document selection", async kind => {
    await withAIEditor("<p>Keep</p>", editor => {
      editor.features.selection.disable()
      const selection = document.getSelection()!
      if(kind === "empty") selection.removeAllRanges()
      else selection.setPosition(document.head, 0)
      expect(() => editor.features.state.actions.replaceAISelection({type: "replaceAISelection", html: "New"})).toThrow("no document selection")
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
    })
  })

  it("reads text and comment targets without exposing them as element targets", async () => {
    await withAIEditor("<p>Hello<!--note--> world</p>", editor => {
      const state = editor.features.state.actions
      const paragraph = aiElementTarget(editor, "p")
      const outline = state.readAIDocument({type: "readAIDocument", target: paragraph, mode: "outline"})
      if(!("nodes" in outline)) throw new Error("Expected an outline")
      expect(outline.nodes.map(node => node.nodeType)).toEqual([Node.TEXT_NODE, Node.COMMENT_NODE, Node.TEXT_NODE])
      const textTarget = state.readAIDocument({type: "readAIDocument", target: outline.nodes[0].target}).target
      expect(state.inspectAIElements({type: "inspectAIElements", targets: [textTarget, outline.nodes[1].target]}).elements).toEqual([])
      state.previewAIOperations({type: "previewAIOperations", editId: "text-node", summary: "Revise text", operations: [
        {type: "set_text", target: textTarget, text: "Goodbye"},
      ]})
      expect(editor.toHTML(true)).toBe("<p>Goodbye<!--note--> world</p>")
      state.rejectAIEdit({type: "rejectAIEdit", editId: "text-node"})
      expect(editor.toHTML(true)).toBe("<p>Hello<!--note--> world</p>")
    })
  })

  it.each(["set_attributes", "set_styles", "insert_html"] as const)("rejects %s on a text target before changing authored DOM", async type => {
    await withAIEditor("<p>Keep</p>", editor => {
      const state = editor.features.state.actions
      const outline = state.readAIDocument({type: "readAIDocument", target: aiElementTarget(editor, "p"), mode: "outline"})
      if(!("nodes" in outline)) throw new Error("Expected an outline")
      const target = state.readAIDocument({type: "readAIDocument", target: outline.nodes[0].target}).target
      const operation: AIChangeOperation = type === "set_attributes" ? {type, target, attributes: {title: "New"}}
        : type === "set_styles" ? {type, target, styles: {color: "red"}}
        : {type, target, position: "append", html: "<em>New</em>"}
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: type, summary: "Invalid", operations: [operation]})).toThrow()
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it("rejects a saved selection overlapping an earlier removal during preparation", async () => {
    await withAIEditor("<section><p>Hello</p></section><aside>Keep</aside>", editor => {
      const state = editor.features.state.actions
      const section = document.querySelector("section")!
      const text = section.querySelector("p")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 1, text, 4)
      const selectionId = state.readAISelection({type: "readAISelection"}).selectionId!
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "removed-selection", summary: "Invalid", operations: [
        {type: "remove", target: aiElementTarget(editor, "section")},
        {type: "replace_selection", selectionId, html: "New"},
      ]})).toThrow("overlap the saved selection")
      expect(document.querySelector("section")).toBe(section)
      expect(document.getSelection()!.toString()).toBe("ell")
      expect(editor.toHTML(true)).toBe("<section><p>Hello</p></section><aside>Keep</aside>")
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it.each(["removed", "replaced", "edited"])("rejects a saved selection whose content was %s by direct DOM editing", async mutation => {
    await withAIEditor("<p>Hello</p><aside>Keep</aside>", editor => {
      const state = editor.features.state.actions
      const paragraph = document.querySelector("p")!
      const text = paragraph.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 1, text, 4)
      const selectionId = state.readAISelection({type: "readAISelection"}).selectionId!
      if(mutation === "removed") paragraph.remove()
      else if(mutation === "replaced") paragraph.replaceWith(paragraph.cloneNode(true))
      else text.textContent = "Changed"
      const before = editor.toHTML(true)
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "stale-range", summary: "Invalid", operations: [
        {type: "replace_selection", selectionId, html: "New"},
      ]})).toThrow("saved selection changed")
      expect(editor.toHTML(true)).toBe(before)
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it("allows documented widget attributes and styles while keeping its light DOM intact", async () => {
    await withAIEditor('<state-config-widget title="Old"><p>Owned</p></state-config-widget><aside>Keep</aside>', editor => {
      const state = editor.features.state.actions
      const widget = document.querySelector("state-config-widget")!
      const child = widget.firstChild
      const target = aiElementTarget(editor, "state-config-widget")
      state.previewAIOperations({type: "previewAIOperations", editId: "configure", summary: "Configure widget", availableWidgets: ["state-config-widget"], operations: [
        {type: "set_attributes", target, attributes: {title: "New"}},
        {type: "set_styles", target, styles: {color: "red"}},
      ]})
      expect(widget.getAttribute("title")).toBe("New")
      expect((widget as HTMLElement).style.color).toBe("red")
      expect(widget.firstChild).toBe(child)
      expect(state.inspectAIElements({type: "inspectAIElements", selector: "state-config-widget p"}).elements).toEqual([])
      state.acceptAIEdit({type: "acceptAIEdit", editId: "configure"})
      expect(document.querySelector("state-config-widget")).toBe(widget)
      expect(widget.firstChild).toBe(child)
      expect(editor.toHTML(true)).not.toContain("◆")
    })
  })

  it("retains unfamiliar content in a whole-body proposal and validates newly inserted siblings", async () => {
    await withAIEditor('<unlisted-widget answer="7"></unlisted-widget><p>Before</p>', editor => {
      const state = editor.features.state.actions
      const target = state.readAIDocument({type: "readAIDocument"}).target
      state.previewAIOperations({type: "previewAIOperations", editId: "whole-body", summary: "Revise paragraph", operations: [
        {type: "replace_document", target, html: '<unlisted-widget answer="7"></unlisted-widget><p>After</p>'},
      ]})
      expect(editor.toHTML(true)).toBe('<unlisted-widget answer="7"></unlisted-widget><p>After</p>')
      state.rejectAIEdit({type: "rejectAIEdit", editId: "whole-body"})
      expect(editor.toHTML(true)).toBe('<unlisted-widget answer="7"></unlisted-widget><p>Before</p>')
    })
  })

  it("enforces the total operation-size limit before applying a valid first operation", async () => {
    await withAIEditor("<p>Keep</p>", editor => {
      const state = editor.features.state.actions
      const target = aiElementTarget(editor, "p")
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "oversized", summary: "Invalid", operations: [
        {type: "set_text", target, text: "New"},
        {type: "insert_html", target, position: "after", html: "x".repeat(1_000_000)},
      ]})).toThrow("operation batch is too large")
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it.each([null, [7]])("rejects malformed widget capabilities: %j", async availableWidgets => {
    await withAIEditor("<p>Keep</p>", editor => {
      const state = editor.features.state.actions
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "capabilities", summary: "Invalid", availableWidgets: availableWidgets as never, operations: [
        {type: "set_text", target: aiElementTarget(editor, "p"), text: "New"},
      ]})).toThrow("Invalid widget capabilities")
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
    })
  })
})

describe("Focused AI proposals", () => {
  it("reviews authored attribute changes while preserving surrounding document nodes", async () => {
    await withAIEditor('<p title="Old" lang="en">Keep</p><!--retain--><aside>Other</aside>', async editor => {
      const paragraph = document.querySelector("p")!
      const comment = paragraph.nextSibling
      const aside = document.querySelector("aside")
      const state = editor.features.state.actions
      state.previewAIOperations({type: "previewAIOperations", editId: "attributes", summary: "Describe the paragraph", operations: [
        {type: "set_attributes", target: aiElementTarget(editor, "p"), attributes: {title: "New", lang: null, "aria-label": "Description"}},
      ]})
      expect(document.querySelector("p")).toBe(paragraph)
      expect(paragraph.getAttribute("title")).toBe("New")
      expect(paragraph.hasAttribute("lang")).toBe(false)
      expect(paragraph.getAttribute("aria-label")).toBe("Description")
      await new Promise<void>(resolve => queueMicrotask(resolve))
      expect(state.gotoAIEdit({type: "gotoAIEdit", editId: "attributes"})).toMatchObject({status: "located"})
      state.acceptAIEdit({type: "acceptAIEdit", editId: "attributes"})
      expect(document.querySelector("p")).toBe(paragraph)
      expect(paragraph.nextSibling).toBe(comment)
      expect(document.querySelector("aside")).toBe(aside)
      expect(editor.toHTML(true)).toBe('<p title="New" aria-label="Description">Keep</p><!--retain--><aside>Other</aside>')
      expect(document.querySelector(".◆ai-preview-change")).toBeNull()
      expect(editor.appendix.querySelector(".◆ai-review-toolbar")).toBeNull()
    })
  })

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
      const documentHTML = html.replace("<h2>", '<h2 id="practice">')
      expect(editor.toHTML(true)).toBe(`<p>Existing introduction</p>${documentHTML}<!--preserve-->`)
      expect(editor.doc.body.toString()).not.toContain(html)
      state.acceptAIEdit({type: "acceptAIEdit", editId: proposalId})
      expect(editor.toHTML(true)).toContain(documentHTML)
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

  it("rejects unknown widgets and no-op proposals", async () => {
    await withAIEditor("<p>Before</p>", editor => {
      let target = aiElementTarget(editor, "p")
      const preview = editor.getActionHandler("previewAIOperations")
      expect(() => preview({type: "previewAIOperations", editId: "widget", summary: "Add widget", operations: [{type: "insert_html", target, position: "after", html: "<invented-widget></invented-widget>"}]})).toThrow("unavailable or undocumented")
      expect(() => preview({type: "previewAIOperations", editId: "noop", summary: "Edit", operations: [{type: "set_text", target, text: "Before"}]})).toThrow("does not change")
    })
  })
})

describe("StateFeature", () => {
  it("expires old DOM read targets while keeping the newest target usable", async () => {
    await withAIEditor("<p>Keep</p>", editor => {
      const state = editor.features.state.actions
      const oldest = state.readAIDocument({type: "readAIDocument"}).target
      let newest = oldest
      for(let index = 0; index < 1000; index++) newest = state.readAIDocument({type: "readAIDocument"}).target
      expect(() => state.readAIDocument({type: "readAIDocument", target: oldest})).toThrow("target changed")
      expect(state.readAIDocument({type: "readAIDocument", target: newest})).toMatchObject({html: "<p>Keep</p>"})
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
    })
  })

  it("expires saved selections without making the live selection an implicit edit target", async () => {
    await withAIEditor("<p>Before</p>", editor => {
      const state = editor.features.state.actions
      const text = document.querySelector("p")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 0, text, 3)
      const oldest = state.readAISelection({type: "readAISelection"}).selectionId!
      for(let index = 0; index < 32; index++) state.readAISelection({type: "readAISelection"})
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "expired", summary: "Invalid", operations: [{type: "replace_selection", selectionId: oldest, html: "New"}]})).toThrow("saved selection changed")
      expect(document.getSelection()!.toString()).toBe("Bef")
      expect(editor.toHTML(true)).toBe("<p>Before</p>")
    })
  })

  it("reads atomic widget outlines without exposing children and includes read-only head state", async () => {
    await withAIEditor('<read-outline-widget><p>Private</p></read-outline-widget>', editor => {
      const state = editor.features.state.actions
      const target = aiElementTarget(editor, "read-outline-widget")
      const result = state.readAIDocument({type: "readAIDocument", target, mode: "outline", includeHead: true})
      expect(result).toMatchObject({nodes: [], total: 0, truncated: false, headWritable: false})
      expect(result.head).toBeDefined()
      expect(result.nextOffset).toBeUndefined()
      expect(state.readAIEditorCapabilities({type: "readAIEditorCapabilities", topic: "styles"})).toMatchObject({writes: expect.stringContaining("read-only")})
    })
  })

  it("rejects truncated selection replacements without opening a preview", async () => {
    await withAIEditor(`<p>${"x".repeat(100001)}</p>`, editor => {
      const state = editor.features.state.actions
      const text = document.querySelector("p")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 0, text, 100001)
      const result = state.readAISelection({type: "readAISelection"})
      expect(result.truncated).toBe(true)
      expect(result.html).toHaveLength(100000)
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "truncated", summary: "Invalid", operations: [{type: "replace_selection", selectionId: result.selectionId!, html: "New"}]})).toThrow("saved selection changed")
      expect(text.textContent).toHaveLength(100001)
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it.each([7, "x".repeat(1000001)])("rejects invalid replacement HTML before parsing it", async html => {
    await withAIEditor("<p>Keep</p>", editor => {
      expect(() => editor.features.state.actions.replaceAIDocument({type: "replaceAIDocument", html: html as string})).toThrow(typeof html === "string" ? RangeError : TypeError)
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it("rejects a saved range inside an atomic widget even if native Selection points into it", async () => {
    await withAIEditor('<selection-guard-widget><p>Private</p></selection-guard-widget>', editor => {
      const state = editor.features.state.actions
      const text = document.querySelector("p")!.firstChild!
      document.getSelection()!.setBaseAndExtent(text, 0, text, 3)
      const selectionId = state.readAISelection({type: "readAISelection"}).selectionId!
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "private-range", summary: "Invalid", operations: [{type: "replace_selection", selectionId, html: "New"}]})).toThrow("whole atomic element")
      expect(editor.toHTML(true)).toBe('<selection-guard-widget><p>Private</p></selection-guard-widget>')
    })
  })

  it("fills an empty pending HTML replacement while preserving unrelated content and a valid selection", async () => {
    await withAIEditor("<p>Remove</p><p>Keep</p>", editor => {
      const state = editor.features.state.actions
      const keep = document.querySelectorAll("p")[1]
      document.getSelection()!.setPosition(document.querySelector("p")!.firstChild!, 2)
      state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      expect(state.applyHTMLSelectionEdit({type: "applyHTMLSelectionEdit", html: ""})).toMatchObject({status: "applied"})
      expect(document.body.lastElementChild).toBe(keep)
      expect(editor.toHTML(true)).toBe("<p></p><p>Keep</p>")
      expect(document.getSelection()!.anchorNode?.isConnected).toBe(true)
      expect(document.getSelection()!.focusNode?.isConnected).toBe(true)
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it("requires a started HTML edit and makes repeated pending-state transitions idempotent", async () => {
    await withAIEditor("<p>Keep</p>", editor => {
      const state = editor.features.state.actions
      expect(() => state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})).toThrow("has not started")
      expect(() => state.applyHTMLSelectionEdit({type: "applyHTMLSelectionEdit", html: "<p>New</p>"})).toThrow("no pending")
      document.getSelection()!.setPosition(document.querySelector("p")!.firstChild!, 2)
      state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      for(const pending of [false, true, true, false, false]) {
        expect(state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending})).toEqual({pending})
        expect(editor.isEditingLocked).toBe(pending)
      }
      state.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
      expect(editor.toHTML(true)).toBe("<p>Keep</p>")
    })
  })

  it.each([
    {name: "remove body", operation: (body: string, _paragraph: string) => ({type: "remove", target: body}), error: "Cannot remove"},
    {name: "move body", operation: (body: string, paragraph: string) => ({type: "move", target: body, destination: paragraph, position: "before"}), error: "Cannot move"},
    {name: "insert outside body", operation: (body: string, _paragraph: string) => ({type: "insert_html", target: body, position: "before", html: "<p>New</p>"}), error: "outside"},
    {name: "replace_html on body", operation: (body: string, _paragraph: string) => ({type: "replace_html", target: body, html: "<p>New</p>"}), error: "replace_document"},
    {name: "replace_document on paragraph", operation: (_body: string, paragraph: string) => ({type: "replace_document", target: paragraph, html: "<p>New</p>"}), error: "replace_document"},
    {name: "move into itself", operation: (_body: string, paragraph: string) => ({type: "move", target: paragraph, destination: paragraph, position: "append"}), error: "itself"},
    {name: "set body text", operation: (body: string, _paragraph: string) => ({type: "set_text", target: body, text: "New"}), error: "text-only"},
    {name: "style attribute", operation: (_body: string, paragraph: string) => ({type: "set_attributes", target: paragraph, attributes: {style: "color:red"}}), error: "set_styles"},
    {name: "numeric attribute", operation: (_body: string, paragraph: string) => ({type: "set_attributes", target: paragraph, attributes: {title: 7}}), error: "strings/null"},
    {name: "unresolved widget", operation: (_body: string, paragraph: string) => ({type: "insert_widget", target: paragraph, position: "after", memberId: "missing"}), error: "Resolve the widget package"},
    {name: "customized built-in", operation: (_body: string, paragraph: string) => ({type: "insert_html", target: paragraph, position: "after", html: '<p is="custom-paragraph">New</p>'}), error: "Customized built-in"},
    {name: "unsupported insertion", operation: (_body: string, paragraph: string) => ({type: "insert_html", target: paragraph, position: "after", html: '<object data="example"></object>'}), error: "unsupported active content"},
  ])("rejects $name before starting a review", async ({operation, error}) => {
    await withAIEditor('<p class="authored">Before</p><!--keep--><aside>Stable</aside>', editor => {
      const state = editor.features.state.actions
      const body = state.readAIDocument({type: "readAIDocument"}).target
      const paragraph = aiElementTarget(editor, "p")
      const nodes = Array.from(document.body.childNodes)
      const authored = editor.toHTML(true)
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "invalid-operation", summary: "Invalid", operations: [operation(body, paragraph) as AIChangeOperation]})).toThrow(error)
      expect(Array.from(document.body.childNodes)).toEqual(nodes)
      expect(editor.toHTML(true)).toBe(authored)
      expect(editor.isEditingLocked).toBe(false)
      expect(editor.appendix.querySelector(".◆ai-review-toolbar")).toBeNull()
    })
  })

  it.each(["attributes", "styles", "prepend", "text"] as const)("protects atomic widget internals from %s operations", async kind => {
    await withAIEditor('<guard-widget><p>Private</p></guard-widget><p>Keep</p>', editor => {
      const widget = aiElementTarget(editor, "guard-widget")
      const operations: AIChangeOperation[] = kind === "attributes"
        ? [{type: "set_attributes", target: widget, attributes: {title: "New"}}]
        : kind === "styles" ? [{type: "set_styles", target: widget, styles: {color: "red"}}]
        : kind === "text" ? [{type: "set_text", target: widget, text: "New"}]
        : [{type: "insert_html", target: widget, position: "prepend", html: "<p>New</p>"}]
      const before = editor.toHTML(true)
      expect(() => editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "widget-guard", summary: "Invalid", operations})).toThrow(kind === "prepend" ? "atomic" : kind === "text" ? "text-only" : "README")
      expect(editor.toHTML(true)).toBe(before)
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it("rejects an overlapping saved selection batch and restores observation after rollback", async () => {
    await withAIEditor("<p>Hello world</p><aside>Keep</aside>", editor => {
      const state = editor.features.state.actions
      const paragraph = document.querySelector("p")!
      const target = aiElementTarget(editor, "p")
      document.getSelection()!.setBaseAndExtent(paragraph.firstChild!, 0, paragraph.firstChild!, 5)
      const selectionId = state.readAISelection({type: "readAISelection"}).selectionId!
      expect(() => state.previewAIOperations({type: "previewAIOperations", editId: "overlap", summary: "Invalid", operations: [
        {type: "set_text", target, text: "Changed"},
        {type: "replace_selection", selectionId, html: "<strong>Hello</strong>"},
      ]})).toThrow("earlier operation")
      expect(editor.toHTML(true)).toBe("<p>Hello world</p><aside>Keep</aside>")
      expect(editor.isEditingLocked).toBe(false)
      paragraph.setAttribute("title", "Later")
      editor.doc.syncFromDOM()
      expect(editor.doc.body.toString()).toContain('title="Later"')
    })
  })

  it("rejects stale targets that move inside an atomic widget without changing their parent", async () => {
    await withAIEditor('<section><p>Public</p></section><guard-widget></guard-widget>', editor => {
      const target = aiElementTarget(editor, "p")
      document.querySelector("guard-widget")!.append(document.querySelector("section")!)
      const authored = editor.toHTML(true)
      expect(() => editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "now-private", summary: "Invalid", operations: [{type: "set_text", target, text: "Changed"}]})).toThrow("Widget internals are atomic")
      expect(editor.toHTML(true)).toBe(authored)
    })
  })

  it("rejects overlapping removed targets without mutating any authored node", async () => {
    await withAIEditor('<section><p>Keep</p></section><aside>Stable</aside>', editor => {
      const section = aiElementTarget(editor, "section"), paragraph = aiElementTarget(editor, "p")
      const nodes = Array.from(document.body.childNodes)
      expect(() => editor.features.state.actions.previewAIOperations({type: "previewAIOperations", editId: "removed-child", summary: "Invalid", operations: [
        {type: "remove", target: section}, {type: "set_text", target: paragraph, text: "Changed"},
      ]})).toThrow("overlap")
      expect(Array.from(document.body.childNodes)).toEqual(nodes)
      expect(editor.toHTML(true)).toBe('<section><p>Keep</p></section><aside>Stable</aside>')
    })
  })

  it.each(["accept", "reject", "undo"] as const)("rejects stale %s review IDs without altering the document", async action => {
    await withAIEditor("<p>Before</p>", editor => {
      const state = editor.features.state.actions
      const authored = editor.toHTML(true)
      if(action === "accept") expect(() => state.acceptAIEdit({type: "acceptAIEdit", editId: "missing"})).toThrow("no longer")
      else if(action === "reject") expect(() => state.rejectAIEdit({type: "rejectAIEdit", editId: "missing"})).toThrow("no longer")
      else expect(state.undoAIEdit({type: "undoAIEdit", editId: "missing"})).toEqual({status: "unavailable"})
      expect(state.gotoAIEdit({type: "gotoAIEdit", editId: "missing"}).status).toBe("unavailable")
      expect(editor.toHTML(true)).toBe(authored)
    })
  })

  it("keeps a pending review when a second proposal or HTML edit is attempted", async () => {
    await withAIEditor("<p>Before</p>", editor => {
      const state = editor.features.state.actions
      state.previewAIDocument({type: "previewAIDocument", editId: "first", summary: "Change", html: "<p>After</p>"})
      expect(() => state.previewAIDocument({type: "previewAIDocument", editId: "second", summary: "Change", html: "<p>Other</p>"})).toThrow("already awaiting")
      expect(() => state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})).toThrow("Finish reviewing")
      expect(() => state.undoAIEdit({type: "undoAIEdit", editId: "first"})).toThrow("Finish reviewing")
      expect(editor.toHTML(true)).toBe("<p>After</p>")
      state.rejectAIEdit({type: "rejectAIEdit", editId: "first"})
      expect(editor.toHTML(true)).toBe("<p>Before</p>")
      expect(editor.isEditingLocked).toBe(false)
    })
  })

  it.each([
    {kind: "caret", anchorPath: [0, 0], anchorOffset: 2, focusPath: [0, 0], focusOffset: 2},
    {kind: "forward range", anchorPath: [0, 0], anchorOffset: 1, focusPath: [2, 0], focusOffset: 3},
    {kind: "backward range", anchorPath: [2, 0], anchorOffset: 3, focusPath: [0, 0], focusOffset: 1},
    {kind: "element", anchorPath: [], anchorOffset: 3, focusPath: [], focusOffset: 4},
    {kind: "gap", anchorPath: [], anchorOffset: 3, focusPath: [], focusOffset: 3},
  ])("round-trips a $kind through a JSON snapshot without normalizing authored DOM", async ({anchorPath, anchorOffset, focusPath, focusOffset}) => {
    document.body.innerHTML = '<p class="authored">Before</p><!--keep--><p>After</p><snapshot-widget value="7"><span>Private</span></snapshot-widget><svg viewBox="0 0 10 10"><path d="M0 0L10 10"></path></svg>'
    const point = (path: number[]) => path.reduce<Node>((node, index) => node.childNodes[index], document.body)
    const editor = new DOMEditor()
    let snapshot: EditorStateSnapshot
    let authored: string
    try {
      document.getSelection()!.setBaseAndExtent(point(anchorPath), anchorOffset, point(focusPath), focusOffset)
      authored = editor.toHTML(true)
      snapshot = JSON.parse(JSON.stringify(await editor.getActionHandler("snapshotState")({type: "snapshotState"})))
    }
    finally { editor.destroy() }
    document.body.replaceChildren()
    const restored = new DOMEditor({initialState: snapshot})
    try {
      const selection = document.getSelection()!
      expect(restored.toHTML(true)).toBe(authored)
      expect(selection.anchorNode).toBe(point(anchorPath))
      expect(selection.anchorOffset).toBe(anchorOffset)
      expect(selection.focusNode).toBe(point(focusPath))
      expect(selection.focusOffset).toBe(focusOffset)
      expect(document.querySelector("svg")!.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(document.body.childNodes[1].nodeType).toBe(Node.COMMENT_NODE)
      expect(restored.toHTML(true)).not.toContain("◆")
    }
    finally { restored.destroy() }
  })

  it.each([
    {type: "readAIDocument", mode: "invalid"},
    {type: "readAIDocument", includeHead: "yes"},
    {type: "inspectAIElements", selector: 1},
    {type: "inspectAIElements", selector: "x".repeat(1001)},
    {type: "inspectAIElements", targets: "target"},
    {type: "inspectAIElements", targets: Array(51).fill("target")},
    {type: "inspectAIElements", targets: [1]},
    {type: "inspectAIElements", selector: "p", properties: "color"},
    {type: "inspectAIElements", selector: "p", properties: Array(51).fill("color")},
    {type: "inspectAIElements", selector: "p", properties: [1]},
    {type: "inspectAIElements", selector: "p", properties: ["x".repeat(101)]},
    {type: "inspectAIElements"},
    {type: "readAIEditorCapabilities", topic: "invalid"},
    {type: "beginHTMLSelectionEdit", path: [-1]},
    {type: "beginHTMLSelectionEdit", path: [0.5]},
    {type: "beginHTMLSelectionEdit", path: "0"},
    {type: "setHTMLSelectionEditPending", pending: "yes"},
  ])("rejects malformed $type inputs without changing state: %j", async options => {
    await withAIEditor('<p class="authored">Keep</p><!--keep-->', editor => {
      const paragraph = document.querySelector("p")!
      document.getSelection()!.setPosition(paragraph.firstChild!, 2)
      const authored = editor.toHTML(true)
      const handler = editor.getActionHandler(options.type as any)
      expect(() => handler(options as any)).toThrow(TypeError)
      expect(editor.toHTML(true)).toBe(authored)
      expect(document.querySelector("p")).toBe(paragraph)
      expect(document.getSelection()!.anchorNode).toBe(paragraph.firstChild)
      expect(document.getSelection()!.anchorOffset).toBe(2)
      expect(editor.isEditingLocked).toBe(false)
      expect(editor.features.state.isHTMLSelectionEditPending).toBe(false)
    })
  })

  it.each(["disable", "destroy"] as const)("cleans a detached pending HTML target on %s", async ending => {
    await withAIEditor('<p class="authored">Selected</p><p>Keep</p>', editor => {
      const paragraph = document.querySelector("p")!
      const keep = document.querySelectorAll("p")[1]
      document.getSelection()!.setPosition(paragraph.firstChild!, 2)
      editor.features.state.actions.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      editor.features.state.actions.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      expect(editor.isEditingLocked).toBe(true)
      expect(paragraph.classList.contains("◆html-source-pending")).toBe(true)
      paragraph.remove()
      if(ending === "disable") editor.features.state.disable()
      else editor.destroy()
      expect(paragraph.classList.contains("authored")).toBe(true)
      expect(paragraph.classList.contains("◆html-source-pending")).toBe(false)
      expect(paragraph.classList.contains("◆style-target-hovered")).toBe(false)
      if(ending === "disable") editor.features.selection.disable()
      expect(paragraph.className).toBe("authored")
      expect(document.documentElement.classList.contains("◆html-source-review-active")).toBe(false)
      expect(editor.isEditingLocked).toBe(false)
      expect(keep.isConnected).toBe(true)
      expect(keep.textContent).toBe("Keep")
    })
  })

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
    expect(read({type: "readAIDocument", target: outline.nodes[0].target})).toMatchObject({html: '<hgroup><h1 id="title">Title</h1></hgroup>', truncated: false, tagName: "hgroup", htmlScope: "node"})
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

  it.each([
    '<video src="SOURCE" poster="COVER" controls=""></video>',
    '<video-widget src="SOURCE"><video poster="COVER"><source src="SOURCE"></video></video-widget>',
    '<template><template><video src="SOURCE" poster="COVER"></video></template></template>',
  ])("keeps uploaded videos and covers in a portable reload snapshot: %s", async markup => {
    const editor = new DOMEditor()
    const source = editor.createMediaURL(new Blob(["local video"], {type: "video/mp4"}))
    const cover = editor.createMediaURL(new Blob(["cover"], {type: "image/png"}))
    document.body.innerHTML = `<p>Keep<!--comment--></p>${markup.replaceAll("SOURCE", source).replaceAll("COVER", cover)}`
    const paragraph = document.querySelector("p")!
    document.getSelection()!.setPosition(paragraph.firstChild!, 2)
    let snapshot: EditorStateSnapshot
    try {
      snapshot = JSON.parse(JSON.stringify(await editor.getActionHandler("snapshotState")({type: "snapshotState"})))
      expect(document.querySelector("p")).toBe(paragraph)
    }
    finally { editor.destroy() }
    document.body.replaceChildren()
    const restored = new DOMEditor({initialState: snapshot})
    try {
      expect(restored.toHTML(true)).toBe(`<p>Keep<!--comment--></p>${markup
        .replaceAll("SOURCE", `data:video/mp4;base64,${btoa("local video")}`)
        .replaceAll("COVER", `data:image/png;base64,${btoa("cover")}`)}`)
      expect(document.getSelection()!.anchorNode).toBe(document.querySelector("p")!.firstChild)
      expect(document.getSelection()!.anchorOffset).toBe(2)
      expect(restored.toHTML(true)).not.toContain("blob:")
    }
    finally { restored.destroy() }
  })

  it("embeds blob sources created by a widget and rejects unreadable sources before reloading", async () => {
    document.body.innerHTML = '<video-widget src="blob:https://editor.example/widget-video"></video-widget>'
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("widget video", {headers: {"content-type": "video/webm"}}))
    const editor = new DOMEditor()
    try {
      await editor.getActionHandler("snapshotState")({type: "snapshotState"})
      expect(fetch).toHaveBeenCalledWith("blob:https://editor.example/widget-video")
      expect(document.querySelector("video-widget")!.getAttribute("src")).toBe(`data:video/webm;base64,${btoa("widget video")}`)
      document.querySelector("video-widget")!.setAttribute("src", "blob:https://editor.example/unreadable")
      fetch.mockRejectedValue(new Error("File not found"))
      await expect(editor.getActionHandler("snapshotState")({type: "snapshotState"})).rejects.toThrow("File not found")
      expect(document.querySelector("video-widget")!.getAttribute("src")).toBe("blob:https://editor.example/unreadable")
    }
    finally { editor.destroy() }
  })

  it("captures current media when a source changes or nodes are added during snapshot preparation", async () => {
    const editor = new DOMEditor()
    const blob = new Blob(["old"], {type: "video/mp4"})
    const source = editor.createMediaURL(blob)
    const replacement = editor.createMediaURL(new Blob(["new"], {type: "video/mp4"}))
    document.body.innerHTML = `<video src="${source}"></video>`
    let finish!: (buffer: ArrayBuffer) => void
    vi.spyOn(blob, "arrayBuffer").mockImplementation(() => new Promise(resolve => { finish = resolve }))
    try {
      const pending = editor.getActionHandler("snapshotState")({type: "snapshotState"})
      await vi.waitFor(() => expect(finish).toBeDefined())
      document.querySelector("video")!.src = replacement
      const audio = document.createElement("audio")
      audio.src = editor.createMediaURL(new Blob(["audio"], {type: "audio/mpeg"}))
      document.body.append(audio)
      finish(new TextEncoder().encode("old").buffer)
      const snapshot = await pending as EditorStateSnapshot
      const copy = new Y.Doc()
      try {
        Y.applyUpdate(copy, Uint8Array.from(snapshot.update))
        expect(sharedDOMBody(copy).toString()).toContain(`data:video/mp4;base64,${btoa("new")}`)
        expect(editor.toHTML(true)).toContain(`data:audio/mpeg;base64,${btoa("audio")}`)
        expect(editor.toHTML(true)).not.toContain("blob:")
      }
      finally { copy.destroy() }
    }
    finally { editor.destroy() }
  })

  it("reconstructs document HTML and the exact relative selection in a new editor realm", async () => {
    document.body.innerHTML = "<p>Hello <strong>world</strong></p><webwriter-demo value=\"7\"></webwriter-demo>"
    const editor = new DOMEditor()
    const text = document.querySelector("strong")!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, 1, text, 4)

    const snapshot = await editor.getActionHandler("snapshotState")({type: "snapshotState"}) as EditorStateSnapshot
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
    const serialized = new DOMParser().parseFromString(html as string, "text/html")
    expect(serialized.body.innerHTML).not.toContain("◆")
    expect(serialized.querySelector("[contenteditable]")).toBeNull()
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
    const embeddedScript = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLScriptElement>('script[data-webwriter-original-src="/app.js"]')!
    expect(atob(embeddedScript.src.split(",")[1])).toBe("window.offline = true")
    expect(html).not.toContain('<script src="/app.js"')

    const parsed = new DOMParser().parseFromString(html, "text/html")
    restoreOriginalResourceURLs(parsed)
    expect(parsed.querySelector("img")?.getAttribute("src")).toBe("/photo.png")
    expect(parsed.querySelector('script[src="/app.js"]')?.getAttribute("src")).toBe("/app.js")
    expect(parsed.querySelector('script[src="/app.js"]')?.textContent).toBe("")
    expect(parsed.querySelector("[data-webwriter-original-src]")).toBeNull()
    editor.destroy()
  })

  it("reads document context and sanitizes an approved whole-document replacement", () => {
    document.body.innerHTML = "<h1>Before</h1><p>Keep me informed</p>"
    const editor = new DOMEditor()

    const context = editor.getActionHandler("readAIDocument")({type: "readAIDocument"}) as {html: string, text: string}
    expect(context.html).toContain('<h1 id="before">Before</h1>')
    expect(context.text).toContain("Keep me informed")

    const result = editor.getActionHandler("replaceAIDocument")({
      type: "replaceAIDocument",
      html: '<style>body{display:none}</style><link rel="stylesheet"><main style="color: red"><dialog open><hgroup><h1 onclick="steal()">After</h1></hgroup></dialog><a href="javascript:steal()">Link</a><script>steal()</script></main>',
    }) as {status: string, removedUnsafeItems: number}

    expect(result.status).toBe("applied")
    expect(result.removedUnsafeItems).toBeGreaterThan(0)
    expect(editor.toHTML(true)).toBe('<main style="color: red"><h1 id="after">After</h1><a>Link</a></main>')
    editor.destroy()
  })

  it("keeps a proposed document inert until it is sanitized", () => {
    document.body.innerHTML = "<p>Before</p>"
    const editor = new DOMEditor()
    try {
      const prepare = vi.spyOn(editor, "prepareHTMLFragment")
      editor.getActionHandler("replaceAIDocument")({
        type: "replaceAIDocument",
        html: "<p>After</p><object><img src=\"https://example.com/tracker.png\"></object>",
      })
      // A document without a browsing context neither upgrades widgets nor loads resources.
      expect(prepare.mock.calls[0][0].ownerDocument.defaultView).toBeNull()
      expect(editor.toHTML(true)).toBe("<p>After</p>")
    }
    finally { editor.destroy() }
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

  it("leaves the native caret unchanged when opening and closing clean HTML", () => {
    document.body.innerHTML = "<p>Hello <b>world</b></p>"
    const editor = new DOMEditor()
    const text = document.querySelector("b")!.firstChild!
    const selection = document.getSelection()!
    selection.setPosition(text, 2)
    editor.getActionHandler("beginHTMLSelectionEdit")({type: "beginHTMLSelectionEdit"})
    expect(selection.isCollapsed).toBe(true)
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(2)
    expect(document.querySelector(".◆style-target-hovered")).toBeNull()
    expect(selection.isCollapsed).toBe(true)
    editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(2)
    expect(selection.isCollapsed).toBe(true)
    expect(document.querySelector(".◆style-target-hovered")).toBeNull()
    editor.destroy()
  })

  it.each(["<p><b>Text</b></p>", "<unknown-widget><!--keep--><span>Text</span></unknown-widget>", '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" /></svg>'])("reads HTML without adding hover markers or changing the selection: %s", html => {
    document.body.innerHTML = html + "<p>Other</p>"
    const expected = document.body.firstElementChild!.outerHTML
    const editor = new DOMEditor()
    const selection = document.getSelection()!
    selection.setPosition(document.body, 0)
    const target = document.body.firstElementChild!
    const before = editor.toHTML(true)
    for(let i = 0; i < 3; i++) {
      expect(editor.features.state.actions.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit", path: [0]})).toEqual({html: expected})
    }
    expect(document.querySelector(".◆style-target-hovered, .◆element-hovered")).toBeNull()
    expect(document.body.firstElementChild).toBe(target)
    expect(editor.toHTML(true)).toBe(before)
    expect(selection.anchorNode).toBe(document.body)
    expect(selection.anchorOffset).toBe(0)
    expect(selection.isCollapsed).toBe(true)
    editor.features.state.actions.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
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

  it.each([...markNames, "strong", "em"])("never uses %s as the saved-path HTML root", tag => {
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
  })

  it("uses a capture-selected widget as the HTML root despite a stale native caret", () => {
    document.body.innerHTML = '<p></p><section><ww-graph nodes="3"></ww-graph></section>'
    const editor = new DOMEditor()
    const widget = document.querySelector("ww-graph")!
    // Focus inside a widget captures it while the native caret stays behind.
    document.getSelection()!.setPosition(document.querySelector("p")!, 0)
    editor.features.selection.captureElement(widget, {preserveNativeSelection: true})
    expect(editor.features.selection.captureSelectedElement).toBe(widget)

    const result = editor.getActionHandler("beginHTMLSelectionEdit")({
      type: "beginHTMLSelectionEdit",
      path: [0],
    }) as {html: string}

    expect(result.html).toBe('<ww-graph nodes="3"></ww-graph>')
    expect(result.html).not.toContain("◆")
    editor.getActionHandler("setHTMLSelectionEditPending")({type: "setHTMLSelectionEditPending", pending: true})
    editor.getActionHandler("applyHTMLSelectionEdit")({
      type: "applyHTMLSelectionEdit",
      html: '<ww-graph nodes="4"></ww-graph>',
    })
    expect(editor.toHTML(true)).toBe('<p></p><section><ww-graph nodes="4"></ww-graph></section>')
    editor.destroy()
  })

  it("uses a selected section as the HTML root although the native caret stays inside it", () => {
    document.body.innerHTML = "<p>Before</p><section><h2>Title</h2><p>Body</p></section>"
    const editor = new DOMEditor()
    const section = document.querySelector("section")!
    document.getSelection()!.setPosition(section.querySelector("p")!.firstChild!, 2)
    expect(editor.features.selection.selectSectionElement(section)).toBe(true)

    const result = editor.getActionHandler("beginHTMLSelectionEdit")({
      type: "beginHTMLSelectionEdit",
    }) as {html: string}

    expect(result.html).toBe('<section><h2 id="title">Title</h2><p>Body</p></section>')
    editor.getActionHandler("discardHTMLSelectionEdit")({type: "discardHTMLSelectionEdit"})
    editor.destroy()
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

  it("rejects unsafe HTML before changing the pending selection and allows a corrected retry", () => {
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

    expect(() => editor.getActionHandler("applyHTMLSelectionEdit")({
      type: "applyHTMLSelectionEdit",
      html: '<section style="color: red" onclick="evil()"><p>After</p><style>body{display:none}</style><script>while(true){}</script></section>',
    })).toThrow("The document has not been changed")
    expect(editor.toHTML(true)).toBe("<p>Before</p>")
    expect(editor.features.state.isHTMLSelectionEditPending).toBe(true)
    expect(editor.isEditingLocked).toBe(true)
    const result = editor.getActionHandler("applyHTMLSelectionEdit")({
      type: "applyHTMLSelectionEdit",
      html: '<section style="color: red"><p>After</p></section>',
    }) as {status: string, removedUnsafeItems: number}

    expect(result.status).toBe("applied")
    expect(result.removedUnsafeItems).toBe(0)
    expect(editor.toHTML(true)).toBe('<section style="color: red"><p>After</p></section>')
    expect(document.querySelector(".◆html-source-pending")).toBeNull()
    expect(editor.isEditingLocked).toBe(false)
    editor.destroy()
  })

  it("preserves a cropped captioned figure, HTTPS embed and unfamiliar authored content during a source edit", async () => {
    const html = '<figure id="photo" style="float:left"><picture><img src="https://example.test/photo.png" style="object-view-box:inset(0% 0% 0% 15%)"></picture><figcaption>Before</figcaption><!--keep--></figure><iframe src="https://example.test/lesson" sandbox="allow-scripts"></iframe><custom-lesson arbitrary="keep"><section><p>Widget content</p></section></custom-lesson>'
    await withAIEditor(html + '<aside>Unrelated</aside>', editor => {
      editor.features.selection.disable()
      const aside = document.querySelector("aside")!
      const range = document.createRange()
      range.setStart(document.body, 0)
      range.setEndBefore(aside)
      document.getSelection()!.removeAllRanges()
      document.getSelection()!.addRange(range)
      editor.doc.syncFromDOM()
      editor.doc.stopCapturing()
      const state = editor.features.state.actions
      state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      expect(state.applyHTMLSelectionEdit({type: "applyHTMLSelectionEdit", html: html.replace("Before", "After")})).toMatchObject({status: "applied", removedUnsafeItems: 0})
      expect(editor.toHTML(true)).toBe(html.replace("Before", "After") + '<aside>Unrelated</aside>')
      expect(document.querySelector("aside")).toBe(aside)
      expect(editor.doc.body.toString()).not.toContain("◆")
      editor.doc.undo()
      expect(editor.toHTML(true)).toBe(html + '<aside>Unrelated</aside>')
      editor.doc.redo()
      expect(document.querySelector("figcaption")!.textContent).toBe("After")
      expect(document.querySelectorAll("img, iframe")).toHaveLength(2)
    })
  })

  it.each(['<iframe srcdoc="<p>Embedded</p>"></iframe>', '<iframe src="http://example.test/lesson"></iframe>'])("keeps the original document when a source replacement contains an unsupported website: %s", async html => {
    await withAIEditor('<p>Keep</p>', editor => {
      const state = editor.features.state.actions
      document.getSelection()!.setPosition(document.querySelector("p")!.firstChild!, 1)
      state.beginHTMLSelectionEdit({type: "beginHTMLSelectionEdit"})
      state.setHTMLSelectionEditPending({type: "setHTMLSelectionEditPending", pending: true})
      expect(() => state.applyHTMLSelectionEdit({type: "applyHTMLSelectionEdit", html})).toThrow("unsupported website sources")
      expect(editor.toHTML(true)).toBe('<p>Keep</p>')
      state.discardHTMLSelectionEdit({type: "discardHTMLSelectionEdit"})
      expect(editor.isEditingLocked).toBe(false)
      expect(editor.toHTML(true)).not.toContain("◆")
    })
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

describe("AI document operations preserve authored layout DOM", () => {
  it("allows nested authored grid/flex markup and nested moves", async () => {
    await withAIEditor('<section style="display:grid"><p>existing</p></section><article><div><p>nested</p></div></article>', editor => {
      const nested = aiElementTarget(editor, "article div")
      const existing = aiElementTarget(editor, "body > section")
      editor.getActionHandler("previewAIOperations")({type: "previewAIOperations", editId: "nested", summary: "Arrange content", operations: [
        {type: "insert_html", target: nested, position: "append", html: '<section style="display:grid"><p>Grid</p></section><div style="display:flex"><p>Flex</p></div>'},
        {type: "move", target: existing, destination: nested, position: "append"},
      ]})
      const nestedElement = document.querySelector("article div")!
      expect(nestedElement.querySelector('section[style="display:grid"] p')?.textContent).toBe("Grid")
      expect(nestedElement.querySelector('div[style="display:flex"] p')?.textContent).toBe("Flex")
      expect(Array.from(document.querySelectorAll("p"), paragraph => paragraph.textContent)).toContain("existing")
      expect(nestedElement.textContent).toContain("existing")
    })
  })

  it.each(["insert_layout", "set_layout"] as const)("rejects the removed AI %s operation", async type => {
    await withAIEditor("<section><p>Existing</p></section>", editor => {
      const target = aiElementTarget(editor, "section")
      const operation = (type === "insert_layout"
        ? {type, target, position: "after", preset: "two-columns"}
        : {type, target, preset: "two-columns"}) as unknown as AIChangeOperation
      expect(() => editor.getActionHandler("previewAIOperations")({type: "previewAIOperations", editId: type, summary: "Arrange", operations: [operation]})).toThrow(/Unsupported operation type/)
    })
  })

  it("no longer advertises a layouts capability topic", async () => {
    await withAIEditor("<p>Text</p>", editor => {
      expect(editor.getActionHandler("readAIEditorCapabilities")({type: "readAIEditorCapabilities"}) as any).toMatchObject({topics: ["elements", "styles"]})
      expect(() => editor.getActionHandler("readAIEditorCapabilities")({type: "readAIEditorCapabilities", topic: "layouts"})).toThrow("Unknown capability topic")
    })
  })
})

it("rejects combining a nested move and layout conversion", async () => {
  await withAIEditor('<section><p>source</p></section><article><p>destination</p></article>', editor => {
    const target = aiElementTarget(editor, "section"), destination = aiElementTarget(editor, "article")
    const before = editor.toHTML(true)
    expect(() => editor.getActionHandler("previewAIOperations")({
      type: "previewAIOperations", editId: "moved-layout", summary: "Move and lay out", operations: [
        {type: "move", target, destination, position: "append"},
        {type: "set_styles", target, styles: {display: "flex"}},
      ],
    })).toThrow(/overlap/)
    expect(editor.toHTML(true)).toBe(before)
  })
})
