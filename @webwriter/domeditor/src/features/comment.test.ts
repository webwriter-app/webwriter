// @vitest-environment happy-dom
import {clearPresentationState, setPresentationState} from "../presentation-state.js"
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
  setPresentationState(paragraph, "text-selected")
  await flush()
  expect(post).not.toHaveBeenCalled()
  clearPresentationState(paragraph, "text-selected")
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
    vi.stubGlobal("CSS", Object.assign(Object.create(CSS), {highlights}))
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
    vi.stubGlobal("CSS", Object.assign(Object.create(CSS), {highlights}))
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

// The pairwise comparison CommentFeature used before threads were grouped by
// boundary. It stays here as the reference for which comments share a thread
// and which comments a selection activates.
type ReferenceComment = {kind: "node", id: string, marker: Comment}
  | {kind: "span", id: string, marker: Comment, start: Comment, end: Comment}

function referenceComments() {
  const comments: ReferenceComment[] = []
  const starts = new Map<string, Comment>()
  for(const {node, marker} of markers()) {
    if(marker.kind === "node") comments.push({kind: "node", id: marker.id, marker: node})
    else if(marker.kind === "start") {
      if(!starts.has(marker.id)) starts.set(marker.id, node)
    }
    else {
      const start = starts.get(marker.id)
      if(!start) continue
      comments.push({kind: "span", id: marker.id, marker: start, start, end: node})
      starts.delete(marker.id)
    }
  }
  return comments.sort((a, b) => a.marker.compareDocumentPosition(b.marker) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1)
}

function referenceRange(comment: ReferenceComment) {
  const parent = comment.marker.parentNode
  if(!comment.marker.isConnected || !parent) return null
  const range = document.createRange()
  if(comment.kind === "span") {
    if(!comment.end.isConnected) return null
    range.setStartAfter(comment.start)
    range.setEndBefore(comment.end)
  }
  else if(parent === document.body) range.selectNodeContents(document.body)
  else range.selectNode(parent)
  return range
}

function referencePointsHaveNoAuthoredContentBetween(aContainer: Node, aOffset: number, bContainer: Node, bOffset: number) {
  const a = document.createRange()
  const b = document.createRange()
  a.setStart(aContainer, aOffset)
  a.collapse(true)
  b.setStart(bContainer, bOffset)
  b.collapse(true)
  const order = a.compareBoundaryPoints(Range.START_TO_START, b)
  if(order === 0) return true
  const between = document.createRange()
  if(order < 0) {
    between.setStart(aContainer, aOffset)
    between.setEnd(bContainer, bOffset)
  }
  else {
    between.setStart(bContainer, bOffset)
    between.setEnd(aContainer, aOffset)
  }
  const hasAuthoredContent = (node: Node): boolean => {
    if(!between.intersectsNode(node)) return false
    if(node instanceof Text) {
      const start = between.startContainer === node ? between.startOffset : 0
      const end = between.endContainer === node ? between.endOffset : node.length
      return end > start
    }
    if(node instanceof Comment) return !parseCommentMarker(node)
    if(node instanceof Element) return true
    return Array.from(node.childNodes).some(hasAuthoredContent)
  }
  const root = between.commonAncestorContainer
  if(root instanceof Text || root instanceof Comment) return !hasAuthoredContent(root)
  return !Array.from(root.childNodes).some(hasAuthoredContent)
}

function referenceRangesHaveSameContent(a: Range, b: Range) {
  return referencePointsHaveNoAuthoredContentBetween(a.startContainer, a.startOffset, b.startContainer, b.startOffset)
    && referencePointsHaveNoAuthoredContentBetween(a.endContainer, a.endOffset, b.endContainer, b.endOffset)
}

function referenceThreads(comments = referenceComments()) {
  const threads: {comments: ReferenceComment[], range: Range}[] = []
  for(const comment of comments) {
    const range = referenceRange(comment)
    if(!range) continue
    const thread = threads.find(candidate => referenceRangesHaveSameContent(candidate.range, range))
    if(thread) thread.comments.push(comment)
    else threads.push({comments: [comment], range})
  }
  return threads.map(thread => thread.comments.map(comment => comment.id))
}

function referenceComparePoints(a: Range, aStart: boolean, b: Range, bStart: boolean) {
  const first = document.createRange()
  const second = document.createRange()
  first.setStart(aStart ? a.startContainer : a.endContainer, aStart ? a.startOffset : a.endOffset)
  first.collapse(true)
  second.setStart(bStart ? b.startContainer : b.endContainer, bStart ? b.startOffset : b.endOffset)
  second.collapse(true)
  return first.compareBoundaryPoints(Range.START_TO_START, second)
}

function referenceIsActive(comment: ReferenceComment, range: Range) {
  const commentRange = referenceRange(comment)
  if(!range.collapsed) return commentRange !== null && referenceRangesHaveSameContent(commentRange, range)
  const parent = comment.marker.parentNode
  if(comment.kind === "node" && parent && range.startContainer === parent
    && range.startOffset === Array.from(parent.childNodes).indexOf(comment.marker) + 1) return true
  return commentRange !== null && referenceComparePoints(commentRange, true, range, true) <= 0
    && referenceComparePoints(commentRange, false, range, true) >= 0
}

const startMarker = (id: string) => `<!--webwriter:comment:start:${id}:${id}-->`
const endMarker = (id: string) => `<!--webwriter:comment:end:${id}-->`
const nodeMarker = (id: string) => `<!--webwriter:comment:node:${id}:${id}-->`

/** Three separate comments in each paragraph: plain text, inside a mark, and across a nested mark. */
function commentedSections(sections: number, paragraphs: number) {
  let html = ""
  for(let section = 0; section < sections; section++) {
    html += "<section>"
    for(let paragraph = 0; paragraph < paragraphs; paragraph++) {
      const id = `s${section}p${paragraph}`
      html += `<p>lead ${startMarker(`${id}a`)}plain${endMarker(`${id}a`)} and <b>${startMarker(`${id}b`)}bold${endMarker(`${id}b`)}</b>`
        + ` then ${startMarker(`${id}c`)}mixed <i>nested</i>${endMarker(`${id}c`)} tail</p>`
    }
    html += "</section>"
  }
  return html
}

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

describe("CommentFeature thread grouping", () => {
  type Identified = {id: string}
  const internals = feature as unknown as {
    comments(): Identified[]
    activeComments(comments: Identified[], range: Range): Identified[]
    groupThreads(comments: Identified[]): {comments: Identified[]}[]
    isContent(node: Node): boolean
  }
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))
  const grouping = () => feature.getState().threads!.map(thread => thread.comments.map(comment => comment.id))

  /** Regular sections between two body comments, then a section of threads that are or are not shared. */
  function setSharedThreadDocument(sections: number, paragraphs: number) {
    document.body.innerHTML = nodeMarker("body1") + commentedSections(sections, paragraphs) + "<section>"
      + `<p>${startMarker("same1")}${startMarker("same2")}same${endMarker("same2")}${endMarker("same1")}</p>`
      + `<p id="empty">${startMarker("empty1")}${startMarker("empty2")}empty${endMarker("empty2")}${endMarker("empty1")}</p>`
      + `<p>${startMarker("space1")} ${startMarker("space2")}space${endMarker("space2")}${endMarker("space1")}</p>`
      + `<p>${startMarker("around1")}${startMarker("inner")}${endMarker("inner")}${startMarker("around2")}around${endMarker("around2")}${endMarker("around1")}</p>`
      + `<p>${startMarker("authored1")}<!--authored-->${startMarker("authored2")}authored${endMarker("authored2")}${endMarker("authored1")}</p>`
      + `<p>${startMarker("broken1")}<!--webwriter:comment:start:broken id:x-->${startMarker("broken2")}broken${endMarker("broken2")}${endMarker("broken1")}</p>`
      + `<p>${endMarker("orphan")}${startMarker("wrap")}<em>element${nodeMarker("element1")}${nodeMarker("element2")}</em>${endMarker("wrap")} tail</p>`
      + `<p>${startMarker("outer")}<b>${startMarker("marked")}marked${endMarker("marked")}</b>${endMarker("outer")}</p>`
      + `<p><b><i>${startMarker("cross1")}${startMarker("cross2")}deep${endMarker("cross1")}${endMarker("cross2")}</i></b></p>`
      + `<p>${startMarker("ends1")}${startMarker("ends2")}ends${endMarker("ends2")}.${endMarker("ends1")}</p>`
      + "</section>" + nodeMarker("body2")
    const empty = document.querySelector("#empty")!
    empty.insertBefore(document.createTextNode(""), empty.childNodes[1])
    empty.insertBefore(document.createTextNode(""), empty.lastChild)
    const separate: string[][] = []
    for(let section = 0; section < sections; section++) {
      for(let paragraph = 0; paragraph < paragraphs; paragraph++) {
        separate.push([`s${section}p${paragraph}a`], [`s${section}p${paragraph}b`], [`s${section}p${paragraph}c`])
      }
    }
    return [
      // Both body comments cover the whole body, however far apart their markers are.
      ["body1", "body2"],
      ...separate,
      ["same1", "same2"],
      // Empty text and other comments' markers are not content between two boundaries.
      ["empty1", "empty2"],
      ["space1"], ["space2"],
      ["around1", "around2"], ["inner"],
      // Authored comments and markers that do not parse are content.
      ["authored1"], ["authored2"],
      ["broken1"], ["broken2"],
      // A span around exactly one element shares the thread of that element's own comments.
      ["wrap", "element1", "element2"],
      ["outer"], ["marked"],
      ["cross1", "cross2"],
      ["ends1"], ["ends2"],
    ]
  }

  it("groups a few hundred comments spread over many paragraphs", () => {
    const expected = setSharedThreadDocument(12, 8)
    expect(feature.getState().count).toBe(12 * 8 * 3 + 24)
    expect(grouping()).toEqual(expected)
  })

  it("groups shared and separate threads exactly as the pairwise comparison did", () => {
    // happy-dom needs about a millisecond for each pairwise comparison, so
    // the reference runs over the same shapes in fewer regular paragraphs.
    const expected = setSharedThreadDocument(3, 6)
    expect(referenceThreads()).toEqual(expected)
    expect(grouping()).toEqual(expected)
  }, 30_000)

  it("matches the pairwise comparison for threads, selections and carets in irregular documents", () => {
    const random = seededRandom(20261116)
    const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)]
    let compared = 0
    const seen = {shared: 0, selected: 0, atCaret: 0}
    for(let round = 0; round < 30; round++) {
      let nextId = 0
      const open: string[] = []
      // What may sit between two markers: nothing, empty text or a stray
      // marker (no content), or whitespace or an authored comment (content).
      const separate = (parent: Node) => {
        const roll = random()
        if(roll < 0.2) parent.appendChild(document.createTextNode(""))
        else if(roll < 0.3) parent.appendChild(document.createComment("webwriter:comment:end:orphan"))
        else if(roll < 0.4) parent.appendChild(document.createTextNode(" "))
        else if(roll < 0.45) parent.appendChild(document.createComment("authored"))
      }
      const fill = (parent: Node, depth: number) => {
        for(let count = 2 + Math.floor(random() * 6); count > 0; count--) {
          const roll = random()
          if(roll < 0.1) {
            const ids = Array.from({length: 2 + Math.floor(random() * 2)}, () => `s${nextId++}`)
            for(const id of ids) {
              parent.appendChild(document.createComment(`webwriter:comment:start:${id}:t`))
              separate(parent)
            }
            if(random() < 0.5) parent.appendChild(document.createTextNode("reply"))
            else fill(parent.appendChild(document.createElement("u")), 3)
            for(const id of ids.sort(() => random() - 0.5)) {
              separate(parent)
              parent.appendChild(document.createComment(`webwriter:comment:end:${id}`))
            }
          }
          else if(roll < 0.18) parent.appendChild(document.createTextNode(pick(["ab", "c", " "])))
          else if(roll < 0.28) parent.appendChild(document.createTextNode(""))
          else if(roll < 0.34) parent.appendChild(document.createComment(
            pick(["authored", "webwriter:comment:start:bad id:x", "webwriter:comment:node:untexted", "webwriter:comment:end:orphan"])))
          else if(roll < 0.54) {
            const id = `s${nextId++}`
            parent.appendChild(document.createComment(`webwriter:comment:start:${id}:t`))
            open.push(id)
          }
          else if(roll < 0.74) {
            if(open.length) parent.appendChild(document.createComment(
              `webwriter:comment:end:${open.splice(Math.floor(random() * open.length), 1)[0]}`))
          }
          else if(roll < 0.82) parent.appendChild(document.createComment(`webwriter:comment:node:n${nextId++}:t`))
          else if(depth < 3) {
            const element = document.createElement(depth ? pick(["b", "i", "span"]) : pick(["p", "div"]))
            parent.appendChild(element)
            fill(element, depth + 1)
          }
        }
      }
      document.body.replaceChildren()
      fill(document.body, 0)

      const reference = referenceComments()
      const threads = referenceThreads(reference)
      expect(grouping(), document.body.innerHTML).toEqual(threads)
      seen.shared += threads.filter(thread => thread.length > 1).length

      const nearby = (container: Node, offset: number) => {
        const points: [Node, number][] = [[container, offset]]
        if(offset > 0) points.push([container, offset - 1])
        if(offset < container.childNodes.length) points.push([container, offset + 1])
        for(const child of [container.childNodes[offset - 1], container.childNodes[offset]]) {
          if(child instanceof CharacterData) points.push([child, 0], [child, child.length], [child, Math.min(1, child.length)])
          else if(child) points.push([child, 0], [child, child.childNodes.length])
        }
        return points
      }
      const selections: Range[] = []
      const select = (start: [Node, number], end: [Node, number]) => {
        const range = document.createRange()
        range.setStart(...start)
        range.setEnd(...end)
        selections.push(range)
      }
      for(const comment of reference) {
        const range = referenceRange(comment)!
        const starts = nearby(range.startContainer, range.startOffset)
        const ends = nearby(range.endContainer, range.endOffset)
        select(starts[0], ends[0])
        for(let sample = 0; sample < 6; sample++) select(pick(starts), pick(ends))
        for(const point of [...starts, ...ends]) select(point, point)
      }
      const walker = document.createTreeWalker(document.body)
      const nodes: Node[] = [document.body]
      while(walker.nextNode()) nodes.push(walker.currentNode)
      for(let sample = 0; sample < 12; sample++) {
        const node = pick(nodes)
        const length = node instanceof CharacterData ? node.length : node.childNodes.length
        const point: [Node, number] = [node, Math.floor(random() * (length + 1))]
        select(point, point)
      }

      const comments = internals.comments()
      for(const range of selections) {
        const expected = reference.filter(comment => referenceIsActive(comment, range)).map(comment => comment.id)
        const where = `${document.body.innerHTML} @ ${range.startContainer.nodeName}:${range.startOffset}–${range.endContainer.nodeName}:${range.endOffset}`
        expect(internals.activeComments(comments, range).map(comment => comment.id), where).toEqual(expected)
        compared++
        if(expected.length) seen[range.collapsed ? "atCaret" : "selected"]++
      }
    }
    expect(compared).toBeGreaterThan(1000)
    expect(seen.shared).toBeGreaterThan(20)
    expect(seen.selected).toBeGreaterThan(300)
    expect(seen.atCaret).toBeGreaterThan(300)
  }, 60_000)

  it("keeps Range work linear in the number of comments", async () => {
    const highlights = {set: vi.fn(), delete: vi.fn()}
    vi.stubGlobal("CSS", Object.assign(Object.create(CSS), {highlights}))
    vi.stubGlobal("Highlight", class {})
    const intersects = vi.spyOn(Range.prototype, "intersectsNode")
    const ranges = vi.spyOn(document, "createRange")
    document.body.innerHTML = commentedSections(10, 10)
    const paragraphs = Array.from(document.querySelectorAll("p"))

    let count = 0
    for(let step = 0; step < 6; step++) {
      const text = paragraphs[step * 17].firstChild!
      $.move(text, step % 4)
      document.dispatchEvent(new Event("selectionchange"))
      await flush()
      count = feature.getState().count
    }
    const bold = paragraphs[42].querySelector("b")!.childNodes[1]
    $.selectRange(bold, 0, bold, 4)
    document.dispatchEvent(new Event("selectionchange"))
    await flush()
    expect(feature.getState()).toMatchObject({active: true, activeCount: 1, text: "s4p2b"})

    expect(count).toBe(300)
    // Other features react to the same selection changes, so the counts are
    // not zero. Comments add one live range per highlighted span, created
    // once; the pairwise comparison created six ranges for each of the
    // 44,850 pairs and walked the content between them.
    expect(intersects.mock.calls.length).toBeLessThanOrEqual(count)
    expect(ranges.mock.calls.length).toBeLessThanOrEqual(2 * count)
  })

  it("inspects each marker of a long reply chain once", () => {
    const replies = 150
    const ids = Array.from({length: replies}, (_, index) => `r${index}`)
    document.body.innerHTML = `<p>before ${ids.map(startMarker).join("")}shared${ids.reverse().map(endMarker).join("")} after</p>`
    const inspected = vi.spyOn(internals, "isContent")
    const threads = internals.groupThreads(internals.comments())
    expect(threads).toHaveLength(1)
    expect(threads[0].comments).toHaveLength(replies)
    expect(inspected.mock.calls.length).toBeLessThanOrEqual(3 * replies)
  })

  it("merges and splits threads when text between their markers is emptied or filled", async () => {
    const paragraph = setContent("<p></p>")
    const betweenStarts = document.createTextNode("x")
    const betweenEnds = document.createTextNode("")
    paragraph.append(
      document.createComment("webwriter:comment:start:first:First"),
      betweenStarts,
      document.createComment("webwriter:comment:start:second:Second"),
      "shared",
      document.createComment("webwriter:comment:end:second"),
      betweenEnds,
      document.createComment("webwriter:comment:end:first"),
    )
    expect(grouping()).toEqual([["first"], ["second"]])

    betweenStarts.data = ""
    expect(grouping()).toEqual([["first", "second"]])
    betweenStarts.data = "y"
    await flush()
    expect(grouping()).toEqual([["first"], ["second"]])
    betweenStarts.deleteData(0, 1)
    await flush()
    expect(grouping()).toEqual([["first", "second"]])
    betweenEnds.data = "z"
    expect(grouping()).toEqual([["first"], ["second"]])
    expect(grouping()).toEqual(referenceThreads())

    // Text that stays non-empty cannot change the grouping, so it is not regrouped.
    const group = vi.spyOn(internals, "groupThreads")
    const walkers = vi.spyOn(document, "createTreeWalker")
    betweenEnds.data = "zz"
    expect(grouping()).toEqual([["first"], ["second"]])
    ;(paragraph.childNodes[3] as Text).data = "shared text"
    await flush()
    expect(grouping()).toEqual([["first"], ["second"]])
    expect(group).not.toHaveBeenCalled()
    expect(walkers.mock.calls.filter(([, filter]) => filter === NodeFilter.SHOW_COMMENT)).toHaveLength(0)

    betweenEnds.data = ""
    expect(grouping()).toEqual([["first", "second"]])
    expect(group).toHaveBeenCalledTimes(1)
  })

  it("groups threads once per document change, however often the selection changes", async () => {
    document.body.innerHTML = commentedSections(2, 4)
    const text = document.querySelector("p")!.firstChild!
    await flush()
    const group = vi.spyOn(internals, "groupThreads")
    document.querySelector("section")!.append(document.createElement("hr"))
    $.move(text, 1)
    document.dispatchEvent(new Event("selectionchange"))
    await flush()
    expect(feature.getState().threads).toHaveLength(24)
    expect(group).toHaveBeenCalledTimes(1)

    for(let offset = 2; offset < 5; offset++) {
      $.move(text, offset)
      document.dispatchEvent(new Event("selectionchange"))
      await flush()
      feature.getState()
    }
    expect(group).toHaveBeenCalledTimes(1)
  })

  it("keeps the registered highlight until the comments change", async () => {
    class TestHighlight {
      readonly ranges: Range[]
      constructor(...ranges: Range[]) {
        this.ranges = ranges
      }
    }
    const highlights = {set: vi.fn(), delete: vi.fn()}
    vi.stubGlobal("CSS", Object.assign(Object.create(CSS), {highlights}))
    vi.stubGlobal("Highlight", TestHighlight)
    const texts = () => (highlights.set.mock.calls.at(-1)![1] as TestHighlight).ranges.map(range => range.toString())
    const paragraph = setContent(`<p>a${startMarker("one")}bc${endMarker("one")}d</p>`)

    for(let index = 0; index < 3; index++) {
      document.dispatchEvent(new Event("selectionchange"))
      await flush()
    }
    expect(highlights.set).toHaveBeenCalledTimes(1)
    ;(paragraph.childNodes[2] as Text).data = "xyz"
    document.dispatchEvent(new Event("selectionchange"))
    await flush()
    expect(highlights.set).toHaveBeenCalledTimes(1)
    expect(texts()).toEqual(["xyz"])

    paragraph.insertAdjacentHTML("beforeend", `${startMarker("two")}e${endMarker("two")}`)
    document.dispatchEvent(new Event("selectionchange"))
    expect(highlights.set).toHaveBeenCalledTimes(2)
    expect(texts()).toEqual(["xyz", "e"])

    highlights.delete.mockClear()
    feature.setCommentHighlighting(false)
    expect(highlights.delete).toHaveBeenCalledWith(commentHighlightNameForTest())
    document.dispatchEvent(new Event("selectionchange"))
    expect(highlights.set).toHaveBeenCalledTimes(2)
    feature.setCommentHighlighting(true)
    expect(highlights.set).toHaveBeenCalledTimes(3)
    expect(texts()).toEqual(["xyz", "e"])
  })
})
