// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {parseCommentMarker} from "./comment"
import {$} from "../utility"
import {commentReviewRequestEvent} from "../editor-bridge"

const editor = new DOMEditor()
const feature = editor.features.comment

beforeEach(() => {
  document.body.innerHTML = ""
  document.getSelection()?.removeAllRanges()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it("does not publish comment selection state for editor marker changes", async () => {
  document.body.innerHTML = "<p>Text</p>"
  const paragraph = document.querySelector("p")!
  const flush = () => new Promise(resolve => setTimeout(resolve, 20))
  await flush()
  const post = vi.spyOn(editor, "postSelectionPath")
  paragraph.classList.add("◆", "◆text-selected")
  await flush()
  expect(post).not.toHaveBeenCalled()
  paragraph.classList.remove("◆text-selected")
  await flush()
  expect(post).not.toHaveBeenCalled()
  paragraph.style.display = "none"
  await flush()
  expect(post).toHaveBeenCalled()
})

function setContent(html: string) {
  document.body.innerHTML = html
  return document.body.firstElementChild!
}

function textPoint(root: Node, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  while(walker.nextNode()) {
    const node = walker.currentNode as Text
    if(remaining <= node.length) return {node, offset: remaining}
    remaining -= node.length
  }
  throw new RangeError(`Text offset ${offset} is outside the node`)
}

function selectTextOffsets(root: Node, start: number, end: number) {
  const first = textPoint(root, start)
  const last = textPoint(root, end)
  $.selectRange(first.node, first.offset, last.node, last.offset)
}

function markers(root: Node = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  const result: {node: Comment, marker: NonNullable<ReturnType<typeof parseCommentMarker>>}[] = []
  while(walker.nextNode()) {
    const node = walker.currentNode as Comment
    const marker = parseCommentMarker(node)
    if(marker) result.push({node, marker})
  }
  return result
}

describe("CommentFeature spans", () => {
  it("adds a comment on an already commented selection without removing the original", () => {
    const paragraph = setContent("<p>abcd</p>")
    selectTextOffsets(paragraph, 1, 3)
    feature.toggleComment("Original")
    expect(feature.actions.addComment({type: "addComment", text: "First reply"})).toBe(true)
    expect(feature.getState().threads?.flatMap(thread => thread.comments.map(comment => comment.text))).toEqual(["Original", "First reply"])
    expect(document.getSelection()?.toString()).toBe("bc")
    expect(feature.addComment("  ")).toBe(false)
    const detached = document.createTextNode("detached")
    const getSelection = vi.spyOn(document, "getSelection").mockReturnValue({
      anchorNode: detached, focusNode: detached, rangeCount: 1,
    } as unknown as Selection)
    expect(feature.addComment("Disconnected")).toBe(false)
    getSelection.mockRestore()
  })

  it("does not construct widget copies while comparing comment boundaries", () => {
    const constructed = vi.fn()
    const tag = "comment-query-widget"
    customElements.define(tag, class extends HTMLElement {
      constructor() {
        super()
        constructed()
      }
    })
    const paragraph = setContent(`<p>before<${tag}>inside</${tag}>after</p>`)
    const before = paragraph.firstChild!
    const after = paragraph.lastChild!
    $.selectRange(before, 0, after, after.textContent!.length)
    expect(feature.toggleComment("Around widget")).toBe(true)
    constructed.mockClear()

    $.selectRange(after, 0, after, after.textContent!.length)
    feature.getState()

    expect(constructed).not.toHaveBeenCalled()
  })

  it("toggles a plain-text comment around the selected fragment", () => {
    const paragraph = setContent("<p>abcd</p>")
    selectTextOffsets(paragraph, 1, 3)

    expect(feature.toggleComment("Review -- café 💬")).toBe(true)
    expect(document.getSelection()?.toString()).toBe("bc")
    expect(markers().map(({marker}) => marker)).toEqual([
      expect.objectContaining({kind: "start", text: "Review -- café 💬"}),
      expect.objectContaining({kind: "end", text: ""}),
    ])
    expect(markers()[0].marker.id).toBe(markers()[1].marker.id)
    expect(editor.toHTML(true)).not.toContain("-- café")
    expect(feature.getState()).toMatchObject({
      canComment: true,
      active: true,
      text: "Review -- café 💬",
      activeCount: 1,
      count: 1,
      highlighting: true,
    })

    expect(feature.toggleComment("ignored while removing")).toBe(true)
    expect(editor.toHTML(true)).toBe("<p>abcd</p>")
    expect(document.getSelection()?.toString()).toBe("bc")
  })

  it("supports crossing comments without changing unfamiliar DOM structure", () => {
    const paragraph = setContent("<p><b>ab</b><custom-widget></custom-widget><i>cdef</i></p>")
    selectTextOffsets(paragraph, 1, 4)
    feature.toggleComment("first")

    selectTextOffsets(paragraph, 2, 5)
    feature.toggleComment("second")

    expect(markers(paragraph).map(({marker}) => marker.kind)).toEqual(["start", "start", "end", "end"])
    expect(markers(paragraph).map(({marker}) => marker.id)).toEqual([
      markers(paragraph)[0].marker.id,
      markers(paragraph)[1].marker.id,
      markers(paragraph)[0].marker.id,
      markers(paragraph)[1].marker.id,
    ])
    expect(paragraph.querySelector("custom-widget")).not.toBeNull()
    expect(paragraph.querySelector("b")?.textContent).toBe("ab")
    expect(paragraph.querySelector("i")?.textContent).toBe("cdef")

    const overlap = textPoint(paragraph, 3)
    $.move(overlap.node, overlap.offset)
    expect(feature.getState()).toMatchObject({active: true, activeCount: 2, count: 2, text: ""})

    expect(feature.nextComment()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("bcd")
    expect(feature.nextComment()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("cde")
    expect(feature.toggleComment("remove only this range")).toBe(true)
    expect(feature.getState().count).toBe(1)
    expect(markers(paragraph).map(({marker}) => marker.id)).toEqual([
      markers(paragraph)[0].marker.id,
      markers(paragraph)[0].marker.id,
    ])
  })

  it("coexists with ordinary marks and preserves comment boundaries", () => {
    const paragraph = setContent("<p>some text</p>")
    selectTextOffsets(paragraph, 0, 9)
    feature.toggleComment("mark integration")

    selectTextOffsets(paragraph, 5, 9)
    expect(editor.features.mark.toggleMark("b")).toBe(true)
    expect(Array.from(paragraph.querySelectorAll("b")).map(element => element.textContent).join("")).toBe("text")
    expect(markers(paragraph).map(({marker}) => marker.kind)).toEqual(["start", "end"])

    const marked = textPoint(paragraph, 6)
    $.move(marked.node, marked.offset)
    expect(feature.getState()).toMatchObject({active: true, text: "mark integration"})
  })
})

describe("CommentFeature node comments", () => {
  it("does not create comments from collapsed text, element, or empty-paragraph carets", () => {
    const paragraph = setContent("<p>abcd</p>")
    $.move(paragraph.firstChild!, 2)

    expect(feature.getState().canComment).toBe(false)
    expect(feature.addComment("About ab")).toBe(false)
    expect(feature.toggleComment("About ab")).toBe(false)
    expect(editor.toHTML(true)).toBe("<p>abcd</p>")
    expect(markers()).toHaveLength(0)

    const element = document.createElement("span")
    paragraph.append(element)
    $.move(paragraph, 1)
    expect(feature.getState().canComment).toBe(false)
    expect(feature.addComment("Element caret")).toBe(false)
    expect(feature.toggleComment("Element caret")).toBe(false)
    expect(editor.toHTML(true)).toBe("<p>abcd<span></span></p>")
    expect(markers()).toHaveLength(0)

    const empty = setContent("<p></p>")
    $.move(empty, 0)
    expect(feature.getState().canComment).toBe(false)
    expect(feature.addComment("Empty paragraph")).toBe(false)
    expect(feature.toggleComment("Empty paragraph")).toBe(false)
    expect(editor.toHTML(true)).toBe("<p></p>")
    expect(markers()).toHaveLength(0)
  })

  it("refers to the parent when no sibling precedes the marker", () => {
    const paragraph = setContent("<p>text</p>")
    $.selectElement(paragraph)
    feature.toggleComment("Paragraph note")

    $.move(paragraph.firstChild!, 2)
    expect(feature.getState()).toMatchObject({active: true, text: "Paragraph note"})
    expect(feature.nextComment()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("text")
  })

  it("selects the complete text range across irregular wrappers by comment id", () => {
    const paragraph = setContent("<p>ab<strong>cd</strong><em><span>ef</span>gh</em></p>")
    selectTextOffsets(paragraph, 1, 7)
    expect(feature.toggleComment("Across wrappers")).toBe(true)
    const id = markers(paragraph)[0].marker.id

    $.move(paragraph.firstChild!, 0)
    expect(feature.selectComment(id)).toBe(true)
    expect(document.getSelection()?.toString()).toBe("bcdefg")
  })

  it("selects moved element and custom-widget targets by comment id", () => {
    const section = setContent("<section><aside><b>note</b></aside><custom-note>inside</custom-note></section>")
    const aside = section.querySelector("aside")!
    $.selectElement(aside)
    expect(feature.toggleComment("Aside note")).toBe(true)
    const asideId = markers(aside)[0].marker.id
    section.append(aside)
    $.move(aside.querySelector("b")!.firstChild!, 2)
    expect(feature.selectComment(asideId)).toBe(true)
    expect(document.getSelection()?.toString()).toBe("note")

    const widget = section.querySelector("custom-note")!
    $.selectElement(widget)
    expect(feature.toggleComment("Widget note")).toBe(true)
    const widgetId = markers(widget)[0].marker.id
    section.insertBefore(widget, section.firstChild)
    $.move(widget.firstChild!, 1)
    expect(feature.selectComment(widgetId)).toBe(true)
    expect(document.getSelection()?.toString()).toBe("inside")
  })

  it("fails safely when the selected comment target has been removed", () => {
    const paragraph = setContent("<p>abcd</p>")
    selectTextOffsets(paragraph, 1, 3)
    expect(feature.toggleComment("Removed target")).toBe(true)
    const id = markers(paragraph)[0].marker.id
    paragraph.remove()
    expect(feature.selectComment(id)).toBe(false)
  })
  it("attaches an explicit element selection to that element and follows moves and copies", () => {
    const section = setContent('<section><aside><b>unfamiliar</b><!--authored--></aside><p>Other</p></section>')
    const target = section.querySelector("aside")!
    const text = target.firstChild
    $.selectElement(target)
    expect(feature.toggleComment("Element note")).toBe(true)
    expect(target.firstChild).toBe(text)
    expect(markers(target)[0].node).toBe(target.lastChild)
    const copy = target.cloneNode(true)
    section.append(copy)
    expect(markers(copy)[0].marker.text).toBe("Element note")
    section.querySelector("p")!.append(target)
    $.move(target.querySelector("b")!.firstChild!, 1)
    expect(feature.getState()).toMatchObject({active: true, text: "Element note"})
    expect(editor.toHTML(true)).not.toMatch(/◆|comment-thread-pane|comment-bauble/)
  })

  it("synchronizes element comments and replies with undo and redo", () => {
    const paragraph = setContent("<p>Original</p>")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    $.selectElement(paragraph)
    feature.toggleComment("Element note")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const id = markers()[0].marker.id
    feature.actions.addCommentReply({type: "addCommentReply", id, text: "Reply"})
    editor.doc.syncFromDOM()
    expect(editor.doc.yxmlToDomNode(editor.doc.body)?.textContent).toContain("Original")
    expect(editor.doc.yxmlToDomNode(editor.doc.body)!.querySelector("p")!.innerHTML).toContain("webwriter:comment:node:")
    editor.doc.undo()
    expect(feature.getState().threads![0].comments.map(comment => comment.text)).toEqual(["Element note"])
    editor.doc.redo()
    expect(feature.getState().threads![0].comments.map(comment => comment.text)).toEqual(["Element note", "Reply"])
    expect(markers().every(({node}) => node.parentNode === document.querySelector("p"))).toBe(true)
  })

  it("fails safely for void element targets that cannot retain child comments in HTML", () => {
    const image = setContent('<img src="example.png">')
    $.selectElement(image)
    expect(feature.toggleComment("Image note")).toBe(false)
    expect(markers()).toHaveLength(0)
  })

})

describe("CommentFeature document commands", () => {
  it("steps through comments in document order and wraps", () => {
    const paragraph = setContent("<p>one two three</p>")
    selectTextOffsets(paragraph, 0, 3)
    feature.toggleComment("one")
    selectTextOffsets(paragraph, 8, 13)
    feature.toggleComment("three")

    $.move(textPoint(paragraph, 4).node, textPoint(paragraph, 4).offset)
    expect(feature.nextComment()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("three")
    expect(feature.nextComment()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("one")
    expect(feature.previousComment()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("three")
  })

  it("updates active comment text and removes only structured comment nodes", () => {
    const paragraph = setContent("<p><!--authored-->hello world</p>")
    selectTextOffsets(paragraph, 0, 5)
    feature.toggleComment("old")
    expect(feature.setCommentText("new -- text")).toBe(true)
    expect(feature.getState().text).toBe("new -- text")

    expect(feature.removeAllComments()).toBe(true)
    expect(editor.toHTML(true)).toBe("<p><!--authored-->hello world</p>")
    expect(feature.getState()).toMatchObject({active: false, activeCount: 0, count: 0})
  })

  it("fails safely for selections inside non-editable and custom-element content", () => {
    let paragraph = setContent('<p><span contenteditable="false">locked</span></p>')
    $.move(paragraph.querySelector("span")!.firstChild!, 2)
    expect(feature.toggleComment("no")).toBe(false)

    paragraph = setContent("<p><custom-widget>internal</custom-widget></p>")
    $.move(paragraph.querySelector("custom-widget")!.firstChild!, 2)
    expect(feature.toggleComment("no")).toBe(false)
    expect(markers()).toHaveLength(0)
  })
})

describe("CommentFeature highlights and threads", () => {
  const bubbles = () => Array.from(editor.appendix.querySelectorAll<HTMLButtonElement>('[part~="comment-bubble"]'))
  const bounds = (element: Element, left = 100, top = 50, width = 200) =>
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(left, top, width, 80))

  it("represents element comments and replies with one appendix bubble without text highlighting", () => {
    const highlights = {set: vi.fn(), delete: vi.fn()}
    vi.stubGlobal("CSS", {...globalThis.CSS, highlights})
    vi.stubGlobal("Highlight", class {})
    const target = setContent("<aside><custom-note>note</custom-note><p>More</p></aside>")
    bounds(target)
    $.selectElement(target)
    feature.addComment("Element note")
    const id = markers(target)[0].marker.id
    feature.actions.addCommentReply({type: "addCommentReply", id, text: "Reply"})
    expect(bubbles()).toHaveLength(1)
    expect(bubbles()[0].getAttribute("aria-label")).toBe("Show 2 comments")
    expect(bubbles()[0].title).toBe("Element note\nReply")
    const html = editor.toHTML(true)
    const post = vi.spyOn(editor, "postHostMessage")
    bubbles()[0].click()
    expect(post).toHaveBeenCalledWith({type: commentReviewRequestEvent})
    expect(feature.getState().activeThreadId).toBe(id)
    expect(bubbles()[0].getAttribute("aria-pressed")).toBe("true")
    expect(highlights.set).not.toHaveBeenCalled()
    expect(target.querySelector("button, svg")).toBeNull()
    expect(editor.toHTML(true)).toBe(html)
    editor.doc.syncFromDOM()
    expect(editor.doc.yxmlToDomNode(editor.doc.body)!.querySelector("button, svg")).toBeNull()

    feature.setCommentHighlighting(false)
    expect(bubbles()).toHaveLength(0)
    feature.setCommentHighlighting(true)
    expect(bubbles()).toHaveLength(1)
    feature.removeAllComments()
    expect(bubbles()).toHaveLength(0)
  })

  it("leaves bubble placement to CSS anchors while retaining float-side handling", () => {
    const target = setContent('<aside style="float:left"><custom-note>note</custom-note></aside>')
    const widget = target.firstElementChild!
    bounds(widget)
    $.selectElement(widget)
    feature.addComment("Widget note")
    expect(bubbles()[0].style.left).toBe("")
    expect(bubbles()[0].style.top).toBe("")
    expect(bubbles()[0].hidden).toBe(false)
    ;(target as HTMLElement).style.float = "right"
    document.dispatchEvent(new Event("selectionchange"))
    expect(bubbles()[0].style.left).toBe("")
    ;(target as HTMLElement).style.float = "none"
    document.dispatchEvent(new Event("selectionchange"))
    expect(bubbles()[0].style.top).toBe("")
  })

  it.each(["canvas", "slides", "board"])("places %s bubbles just outside the top right even for left floats", mode => {
    const target = setContent('<aside style="float:left">note</aside>')
    bounds(target)
    document.body.classList.add(`ww-${mode}`)
    try {
      $.selectElement(target)
      feature.addComment("Element note")
      expect(bubbles()[0].style.left).toBe("")
      expect(bubbles()[0].style.top).toBe("")
      expect(bubbles()[0].hidden).toBe(false)
    }
    finally { document.body.classList.remove(`ww-${mode}`) }
  })

  it("keeps placement in CSS and does not open stale comments after targets disappear", async () => {
    const target = setContent("<aside>note</aside>")
    bounds(target)
    $.selectElement(target)
    feature.addComment("Element note")
    const button = bubbles()[0]
    document.dispatchEvent(new Event("scroll"))
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(button.style.left).toBe("")
    expect(button.style.top).toBe("")
    target.remove()
    const post = vi.spyOn(editor, "postHostMessage")
    button.click()
    expect(post).not.toHaveBeenCalledWith({type: commentReviewRequestEvent})
  })

  it("selects the clicked copy when cloned elements retain the same comment id", () => {
    const target = setContent("<aside>note</aside>")
    bounds(target)
    $.selectElement(target)
    feature.addComment("Element note")
    const copy = target.cloneNode(true) as Element
    document.body.append(copy)
    bounds(copy)
    document.dispatchEvent(new Event("selectionchange"))
    expect(bubbles()).toHaveLength(2)
    bubbles()[1].click()
    const range = document.getSelection()!.getRangeAt(0)
    expect(range.startContainer).toBe(document.body)
    expect(document.body.childNodes[range.startOffset]).toBe(copy)
    expect(range.endOffset).toBe(range.startOffset + 1)
  })

  it("refreshes bubbles after edits and copies and removes them when targets disappear or the feature is disabled", async () => {
    const section = setContent("<section><custom-note>note</custom-note><aside>Other</aside></section>")
    const target = section.firstElementChild!
    bounds(target)
    $.selectElement(target)
    feature.addComment("Widget note")
    const marker = markers(target)[0].node
    const copy = target.cloneNode(true) as Element
    section.append(copy)
    const copyMarker = markers(copy)[0].node
    const other = section.querySelector("aside")!
    other.append(marker)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(bubbles()).toHaveLength(2)
    copyMarker.remove()
    other.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(bubbles()).toHaveLength(0)
    target.append(marker)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(bubbles()).toHaveLength(1)
    feature.disable()
    expect(bubbles()).toHaveLength(0)
    feature.enable()
    expect(bubbles()).toHaveLength(1)
  })

  it("stores author and timestamps in a backwards-compatible HTML marker", () => {
    editor.doc.setUser({name: "Ada Lovelace"})
    const paragraph = setContent("<p>annotated</p>")
    selectTextOffsets(paragraph, 0, 9)

    feature.toggleComment("Primary")

    const opening = markers(paragraph)[0].marker
    expect(opening).toMatchObject({
      kind: "start",
      text: "Primary",
      author: {id: String(editor.doc.awareness.clientID), name: "Ada Lovelace"},
    })
    expect(opening.createdAt).toBeGreaterThan(0)
    expect(opening.editedAt).toBe(opening.createdAt)
    expect(editor.toHTML(true)).toContain("webwriter:comment:start:")
    expect(editor.toHTML(true)).toContain(":v2:")

    expect(parseCommentMarker(document.createComment("webwriter:comment:node:Legacy:old%20text"))).toMatchObject({
      kind: "node",
      text: "old text",
      author: {name: "Unknown user"},
      createdAt: 0,
      editedAt: 0,
    })
  })

  it("registers native comment highlights and can turn them off", () => {
    class TestHighlight {
      readonly ranges: Range[]
      constructor(...ranges: Range[]) {
        this.ranges = ranges
      }
    }
    const highlights = {set: vi.fn(), delete: vi.fn()}
    vi.stubGlobal("CSS", {...globalThis.CSS, highlights})
    vi.stubGlobal("Highlight", TestHighlight)
    const paragraph = setContent("<p>abcd</p>")
    selectTextOffsets(paragraph, 1, 3)
    feature.toggleComment("Highlighted")

    document.dispatchEvent(new Event("selectionchange"))
    expect(highlights.set).toHaveBeenCalledWith(commentHighlightNameForTest(), expect.any(TestHighlight))
    const highlight = highlights.set.mock.calls.at(-1)?.[1] as TestHighlight
    expect(highlight.ranges.map(range => range.toString())).toEqual(["bc"])

    expect(feature.setCommentHighlighting(false)).toBe(true)
    expect(feature.getState().highlighting).toBe(false)
    expect(highlights.delete).toHaveBeenCalledWith(commentHighlightNameForTest())
    feature.setCommentHighlighting(true)
  })

  it("exposes all threads without a popup or margin bubble and selects them by id", () => {
    const paragraph = setContent("<p>abcdef</p>")
    selectTextOffsets(paragraph, 0, 2)
    feature.toggleComment("First")
    selectTextOffsets(paragraph, 3, 5)
    feature.toggleComment("Second")
    document.getSelection()?.removeAllRanges()
    const state = feature.getState()
    expect(state.threads).toHaveLength(2)
    expect(feature.selectComment(state.threads![0].id)).toBe(true)
    expect(feature.getState().threads?.[0].active).toBe(true)
    expect(editor.appendix.querySelector(".◆comment-thread-pane, .◆comment-bauble")).toBeNull()
  })

  it("rejects replies when concurrent edits collapse the thread target", () => {
    const paragraph = setContent("<p>abcd</p>")
    selectTextOffsets(paragraph, 1, 3)
    feature.addComment("Original")
    const id = markers(paragraph)[0].marker.id
    const selected = document.getSelection()!.getRangeAt(0)
    selected.deleteContents()
    const before = editor.toHTML(true)
    expect(feature.actions.addCommentReply({type: "addCommentReply", id, text: "Reply"})).toBe(false)
    expect(editor.toHTML(true)).toBe(before)
  })

  it("manages range replies by id while preserving paired markers", () => {
    const paragraph = setContent("<p>abcd</p>")
    selectTextOffsets(paragraph, 1, 3)
    feature.toggleComment("Primary")
    const id = markers()[0].marker.id
    expect(feature.actions.addCommentReply({type: "addCommentReply", id, text: "Reply"})).toBe(true)
    const thread = feature.getState().threads![0]
    expect(thread.comments.map(comment => comment.text)).toEqual(["Primary", "Reply"])
    expect(markers().map(({marker}) => marker.kind)).toEqual(["start", "start", "end", "end"])
    const replyId = thread.comments[1].id
    expect(feature.actions.updateComment({type: "updateComment", id: replyId, text: "Edited"})).toBe(true)
    expect(feature.actions.removeComment({type: "removeComment", id: replyId})).toBe(true)
    expect(feature.getState().threads![0].comments).toHaveLength(1)
    expect(feature.selectComment("disconnected")).toBe(false)
  })

  it("reuses parsed comment markers until the document changes", () => {
    const paragraph = setContent("<p>abcd</p>")
    $.selectElement(paragraph)
    feature.toggleComment("Cached")
    document.dispatchEvent(new Event("selectionchange"))
    const walkers = vi.spyOn(document, "createTreeWalker")
    const commentWalks = () => walkers.mock.calls.filter(([, filter]) => filter === NodeFilter.SHOW_COMMENT).length
    for(let index = 0; index < 5; index++) {
      feature.getState()
      document.dispatchEvent(new Event("selectionchange"))
    }
    expect(commentWalks()).toBe(0)
    expect(feature.getState().count).toBe(1)
    paragraph.append(document.createComment("unrelated"))
    feature.getState()
    expect(commentWalks()).toBe(1)
    walkers.mockRestore()
  })

  it("groups replies to a node comment without adding authored UI elements", () => {
    const paragraph = setContent("<p>abcd</p>")
    $.selectElement(paragraph)
    feature.toggleComment("Node primary")
    document.dispatchEvent(new Event("selectionchange"))

    const id = markers()[0].marker.id
    feature.actions.addCommentReply({type: "addCommentReply", id, text: "Node reply"})
    expect(markers(paragraph).map(({marker}) => marker.text)).toEqual(["Node primary", "Node reply"])
    expect(paragraph.childNodes).toHaveLength(3)
    expect(feature.getState().threads).toHaveLength(1)
    expect(feature.getState().threads![0].comments).toHaveLength(2)
    expect(editor.appendix.querySelector(".◆comment-thread-pane")).toBeNull()
  })
})

function commentHighlightNameForTest() {
  return "webwriter-comments"
}
