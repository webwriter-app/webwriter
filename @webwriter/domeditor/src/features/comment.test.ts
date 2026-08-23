// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DOMEditor} from "../domeditor"
import {parseCommentMarker} from "./comment"
import {$} from "../utility"

const editor = new DOMEditor()
const feature = editor.features.comment

beforeEach(() => {
  document.body.innerHTML = ""
  document.getSelection()?.removeAllRanges()
})

afterEach(() => {
  vi.unstubAllGlobals()
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
    expect(feature.getState()).toEqual({
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
  it("inserts a collapsed comment after the node at the caret and toggles it off", () => {
    const paragraph = setContent("<p>abcd</p>")
    $.move(paragraph.firstChild!, 2)

    expect(feature.toggleComment("About ab")).toBe(true)
    expect(paragraph.childNodes).toHaveLength(3)
    expect(paragraph.childNodes[0].textContent).toBe("ab")
    expect(parseCommentMarker(paragraph.childNodes[1])).toMatchObject({kind: "node", text: "About ab"})
    expect(paragraph.childNodes[2].textContent).toBe("cd")
    expect(feature.getState()).toMatchObject({active: true, activeCount: 1, count: 1})

    expect(feature.toggleComment("ignored")).toBe(true)
    expect(editor.toHTML(true)).toBe("<p>abcd</p>")
  })

  it("refers to the parent when no sibling precedes the marker", () => {
    const paragraph = setContent("<p>text</p>")
    $.move(paragraph.firstChild!, 0)
    feature.toggleComment("Paragraph note")

    $.move(paragraph.lastChild!, 2)
    expect(feature.getState()).toMatchObject({active: true, text: "Paragraph note"})
    expect(feature.nextComment()).toBe(true)
    expect(document.getSelection()?.toString()).toBe("text")
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
    expect(highlights.delete).toHaveBeenLastCalledWith(commentHighlightNameForTest())
    feature.setCommentHighlighting(true)
  })

  it("shows an appendix bauble and manages primary comments and replies in one thread", () => {
    editor.doc.setUser({name: "Grace Hopper"})
    const paragraph = setContent("<p>abcd</p>")
    selectTextOffsets(paragraph, 1, 3)
    feature.toggleComment("Primary")
    document.dispatchEvent(new Event("selectionchange"))

    const appendix = editor.appendix
    const bauble = appendix.querySelector<HTMLButtonElement>(".◆comment-bauble")!
    expect(bauble).not.toBeNull()
    expect(document.body.querySelector(".◆comment-bauble")).toBeNull()
    bauble.click()

    let pane = appendix.querySelector<HTMLElement>(".◆comment-thread-pane")!
    expect(pane.querySelectorAll(".◆comment-thread")).toHaveLength(1)
    expect(pane.textContent).toContain("Grace Hopper")
    expect(pane.textContent).toContain("Primary")

    const reply = pane.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply text"]')!
    reply.value = "A reply"
    Array.from(pane.querySelectorAll("button")).find(button => button.textContent === "Add reply")!.click()

    expect(markers(paragraph).filter(({marker}) => marker.kind === "start").map(({marker}) => marker.text))
      .toEqual(["Primary", "A reply"])
    pane = appendix.querySelector<HTMLElement>(".◆comment-thread-pane")!
    expect(pane.querySelectorAll(".◆comment-card")).toHaveLength(2)

    const replyEditor = Array.from(pane.querySelectorAll<HTMLTextAreaElement>(".◆comment-card textarea"))[1]
    replyEditor.value = "Edited reply"
    replyEditor.dispatchEvent(new Event("change"))
    expect(markers(paragraph).filter(({marker}) => marker.kind === "start")[1].marker.text).toBe("Edited reply")

    pane = appendix.querySelector<HTMLElement>(".◆comment-thread-pane")!
    Array.from(pane.querySelectorAll("button")).find(button => button.textContent === "Remove reply")!.click()
    expect(markers(paragraph).filter(({marker}) => marker.kind === "start")).toHaveLength(1)
    appendix.querySelector<HTMLButtonElement>('[aria-label="Close comment threads"]')!.click()
    expect(appendix.querySelector(".◆comment-thread-pane")).toBeNull()
  })

  it("offers a new overlapping thread when the current selection has no exact thread", () => {
    const paragraph = setContent("<p>abcdef</p>")
    selectTextOffsets(paragraph, 0, 6)
    feature.toggleComment("Broad")
    selectTextOffsets(paragraph, 2, 4)
    document.dispatchEvent(new Event("selectionchange"))
    editor.appendix.querySelector<HTMLButtonElement>(".◆comment-bauble")!.click()

    let pane = editor.appendix.querySelector<HTMLElement>(".◆comment-thread-pane")!
    expect(pane.textContent).toContain("Start a new thread for this selection")
    const input = pane.querySelector<HTMLTextAreaElement>('textarea[aria-label="New thread comment"]')!
    input.value = "Narrow"
    Array.from(pane.querySelectorAll("button")).find(button => button.textContent === "Start thread")!.click()

    expect(markers(paragraph).filter(({marker}) => marker.kind === "start").map(({marker}) => marker.text))
      .toEqual(["Broad", "Narrow"])
    pane = editor.appendix.querySelector<HTMLElement>(".◆comment-thread-pane")!
    expect(pane.querySelectorAll(".◆comment-thread:not(.◆comment-new-thread)")).toHaveLength(2)
    expect(pane.querySelector(".◆comment-new-thread")).toBeNull()
    pane.querySelector<HTMLButtonElement>('[aria-label="Close comment threads"]')!.click()
  })

  it("groups replies to a node comment without adding authored UI elements", () => {
    const paragraph = setContent("<p>abcd</p>")
    $.move(paragraph.firstChild!, 2)
    feature.toggleComment("Node primary")
    document.dispatchEvent(new Event("selectionchange"))
    editor.appendix.querySelector<HTMLButtonElement>(".◆comment-bauble")!.click()

    let pane = editor.appendix.querySelector<HTMLElement>(".◆comment-thread-pane")!
    const input = pane.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply text"]')!
    input.value = "Node reply"
    Array.from(pane.querySelectorAll("button")).find(button => button.textContent === "Add reply")!.click()

    expect(markers(paragraph).filter(({marker}) => marker.kind === "node").map(({marker}) => marker.text))
      .toEqual(["Node primary", "Node reply"])
    expect(paragraph.querySelector(".◆comment-thread-pane")).toBeNull()
    pane = editor.appendix.querySelector<HTMLElement>(".◆comment-thread-pane")!
    expect(pane.querySelectorAll(".◆comment-card")).toHaveLength(2)
    pane.querySelector<HTMLButtonElement>('[aria-label="Close comment threads"]')!.click()
  })
})

function commentHighlightNameForTest() {
  return "webwriter-comments"
}
