// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {commentStateChangeEvent} from "../editor-bridge"
import {WebWriterPackageRegistry} from "../packages"
import {DomEditor} from "./dom-editor"
import {AppRibbon} from "./ribbon"
import {DomEditorToolbox} from "./toolbox"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
})

async function mountEditor() {
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  iframe.dispatchEvent(new Event("load"))
  return {editor, editorWindow: iframe.contentWindow!}
}

function dispatchEditorMessage(editor: DomEditor, editorWindow: Window, data: object) {
  const bridgeNonce = (editor as unknown as {bridgeNonce: string}).bridgeNonce
  window.dispatchEvent(new MessageEvent("message", {
    data: {...data, bridgeNonce},
    source: editorWindow,
    origin: window.location.origin,
  }))
}

describe("comment ribbon controls", () => {
  it("highlights the Review toolbox tab and shows the document comment count", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.commentState = {
      canComment: false, active: false, text: "", activeCount: 0, count: 5, highlighting: true,
      threads: [
        {id: "a", target: "element", active: false, comments: [{id: "a", text: "One", author: {id: "u", name: "Ari"}, createdAt: 0, editedAt: 0}]},
        {id: "b", target: "text", active: false, comments: [{id: "b", text: "Two", author: {id: "u", name: "Ari"}, createdAt: 0, editedAt: 0}]},
      ], activeThreadId: null,
    }
    document.body.append(toolbox)
    await toolbox.updateComplete
    const tab = toolbox.shadowRoot!.querySelector<HTMLElement>('.toolbox-tab:has([data-tool="Review"])')!
    expect(tab.hasAttribute("data-comments")).toBe(true)
    expect(tab.querySelector(".toolbox-tab-comment-count")?.textContent).toBe("5")
  })

  it("renders a dedicated Edit drawer with text, toggle, cleanup, and navigation controls", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.commentState = {
      canComment: true,
      active: true,
      text: "Review this",
      activeCount: 1,
      count: 2,
      highlighting: true,
    }
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Comments"]')!
    await drawer.updateComplete
    const highlighting = drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    const buttons = Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"))

    expect(drawer.layout).toBe("comments")
    expect(highlighting.checked).toBe(true)
    expect(buttons.map(button => button.label)).toEqual([
      "Remove comment", "Remove all", "Previous comment", "Next comment",
    ])
    expect(buttons.every(button => !button.disabled)).toBe(true)
  })

  it("shows document threads in Review and routes thread actions", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Review"
    toolbox.commentState = {
      canComment: true, active: false, text: "", activeCount: 0, count: 1, highlighting: true,
      threads: [{id: "thread-1", target: "text", active: true, comments: [
        {id: "comment-1", text: "Check this sentence", author: {id: "u1", name: "Ari"}, createdAt: 0, editedAt: 0},
      ]}],
      activeThreadId: "comment-1",
    }
    const actions: CustomEvent[] = []
    toolbox.addEventListener("comment-action", event => actions.push(event as CustomEvent))
    document.body.append(toolbox)
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Comments"]')!
    expect(drawer.textContent).toContain("Check this sentence")
    expect(drawer.textContent).toContain("Ari")
    expect(drawer.querySelector<HTMLElement>(".comment-thread[data-thread-id]")!.hasAttribute("data-active")).toBe(true)
    drawer.querySelector<HTMLElement>(".comment-thread[data-thread-id]")!.click()
    const reply = drawer.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply to comment"]')!
    reply.value = "Agreed"
    reply.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await toolbox.updateComplete
    expect(drawer.querySelector<HTMLButtonElement>(".comment-thread[data-thread-id] .comment-reply button")!.disabled).toBe(false)
    drawer.querySelector<HTMLFormElement>(".comment-thread[data-thread-id] .comment-reply")!.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}))
    expect(actions.map(event => event.detail)).toEqual([
      {action: "select", id: "comment-1"},
      {action: "reply", id: "comment-1", text: "Agreed"},
    ])
  })

  it("selects a thread from its card or keyboard without interfering with its controls", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Review"
    toolbox.commentState = {
      canComment: false, active: false, text: "", activeCount: 0, count: 1, highlighting: true,
      threads: [{id: "thread", target: "element", active: false, comments: [
        {id: "comment", text: "Review this", author: {id: "u", name: "Ari"}, createdAt: 1, editedAt: 1},
      ]}], activeThreadId: null,
    }
    const actions = vi.fn()
    toolbox.addEventListener("comment-action", actions)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const card = toolbox.shadowRoot!.querySelector<HTMLElement>(".comment-thread[data-thread-id]")!
    expect(card.tabIndex).toBe(0)
    card.querySelector<HTMLElement>(".comment-message p")!.click()
    card.querySelector<HTMLElement>(".comment-message-meta strong")!.click()
    for(const key of ["Enter", " "]) card.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
    expect(actions.mock.calls.map(([event]) => event.detail)).toEqual(Array(4).fill({action: "select", id: "comment"}))
    actions.mockClear()
    const reply = card.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply to comment"]')!
    reply.click()
    reply.dispatchEvent(new KeyboardEvent("keydown", {key: "Enter", bubbles: true}))
    card.querySelector<HTMLFormElement>("form")!.click()
    expect(actions).not.toHaveBeenCalled()
    card.querySelector<HTMLButtonElement>(".comment-message-actions button")!.click()
    await toolbox.updateComplete
    expect(card.querySelector('textarea[aria-label="Edit comment"]')).not.toBeNull()
    expect(actions).not.toHaveBeenCalled()
    card.querySelector<HTMLButtonElement>(".comment-delete")!.click()
    expect(actions.mock.calls.map(([event]) => event.detail)).toEqual([{action: "remove", id: "comment"}])
  })

  it("combines Review comments with header actions and an always visible empty thread", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Review"
    toolbox.commentState = {
      canComment: true, active: true, text: "Existing", activeCount: 1, count: 1, highlighting: true,
      threads: [{id: "root", target: "element", active: true, comments: [
        {id: "root", text: "Existing", author: {id: "u", name: "Ari"}, createdAt: 1, editedAt: 1},
      ]}], activeThreadId: "root",
    }
    const actions = vi.fn()
    toolbox.addEventListener("comment-action", actions)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Comments"]')!
    expect(drawer.querySelector("h3")).toBeNull()
    const highlight = drawer.querySelector<HTMLInputElement>('input[aria-label="Highlight"]')!
    expect(highlight.closest('[slot="heading-action"]')).not.toBeNull()
    expect(highlight.parentElement!.textContent).not.toContain("Highlight")
    highlight.click()
    expect(actions.mock.calls.at(-1)![0].detail).toEqual({action: "highlight", enabled: false})
    actions.mockClear()
    expect(drawer.textContent).not.toContain("Element comment")
    expect(drawer.querySelector('ribbon-button[action="toggle"]')).toBeNull()
    expect(Array.from(drawer.querySelectorAll('[slot="heading-action"] button'), button => button.getAttribute("aria-label")))
      .toEqual(["Previous comment", "Next comment", "Clear comments"])
    expect(drawer.querySelector(".comment-delete svg")).not.toBeNull()
    expect(drawer.querySelector(".comment-message-actions button svg")).not.toBeNull()
    const form = drawer.querySelector<HTMLFormElement>(".comment-thread-empty form")!
    form.dispatchEvent(new Event("submit", {cancelable: true}))
    expect(actions).not.toHaveBeenCalled()
    const input = form.querySelector<HTMLTextAreaElement>("textarea")!
    input.value = "First reply"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await toolbox.updateComplete
    form.dispatchEvent(new Event("submit", {cancelable: true}))
    expect(actions.mock.calls[0][0].detail).toEqual({action: "add", text: "First reply"})
    await toolbox.updateComplete
    expect(input.value).toBe("")
    toolbox.commentState = {...toolbox.commentState, canComment: false, count: 0, threads: []}
    await toolbox.updateComplete
    expect(input.disabled).toBe(true)
    expect(drawer.querySelectorAll('[slot="heading-action"] button:disabled')).toHaveLength(3)
  })

  it("emits the add-comment action", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.commentState = {
      canComment: true,
      active: false,
      text: "",
      activeCount: 0,
      count: 0,
      highlighting: true,
    }
    const actions = vi.fn()
    ribbon.addEventListener("comment-action", actions)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Comments"]')!
    const input = drawer.querySelector<HTMLTextAreaElement>('textarea[aria-label="New comment"]')!
    input.value = "New note"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    const toggle = drawer.querySelector<RibbonButton>('ribbon-button[action="toggle"]')!
    await toggle.updateComplete
    toggle.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()

    expect(actions).toHaveBeenCalledWith(expect.objectContaining({
      detail: {action: "toggle", text: "New note"},
    }))
  })

  it("clears the Review tab indicator when the document has no comments", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.commentState = {canComment: false, active: false, text: "", activeCount: 0, count: 0, highlighting: true, threads: [], activeThreadId: null}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const tab = toolbox.shadowRoot!.querySelector<HTMLElement>('.toolbox-tab:has([data-tool="Review"])')!
    expect(tab.hasAttribute("data-comments")).toBe(false)
    expect(tab.querySelector(".toolbox-tab-comment-count")).toBeNull()
  })
})

describe("comment ribbon bridge", () => {
  it("routes Review thread selection, reply, edit, and delete commands", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    dispatchEditorMessage(editor, editorWindow, {
      type: commentStateChangeEvent,
      detail: {
        canComment: false, active: false, text: "", activeCount: 0, count: 1, highlighting: true,
        threads: [{id: "thread", target: "text", active: false, comments: [
          {id: "root-comment", text: "Original", author: {id: "u1", name: "Ari"}, createdAt: 1, editedAt: 1},
        ]}], activeThreadId: null,
      },
    })
    await editor.updateComplete
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.selectTool("Review")
    await toolbox.updateComplete
    execute.mockClear()
    const drawer = toolbox.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Comments"]')!
    drawer.querySelector<HTMLElement>(".comment-thread[data-thread-id]")!.click()
    const reply = drawer.querySelector<HTMLTextAreaElement>('textarea[aria-label="Reply to comment"]')!
    reply.value = "Reply"
    reply.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await toolbox.updateComplete
    drawer.querySelector<HTMLFormElement>(".comment-thread[data-thread-id] .comment-reply")!.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}))
    drawer.querySelector<HTMLButtonElement>(".comment-message-actions button")!.click()
    await toolbox.updateComplete
    const edit = drawer.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit comment"]')!
    edit.value = "Edited"
    edit.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    drawer.querySelector<HTMLButtonElement>(".comment-message button:not(.comment-delete)")!.click()
    await toolbox.updateComplete
    drawer.querySelector<HTMLButtonElement>('.comment-delete')!.click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "selectComment", id: "root-comment"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "addCommentReply", id: "root-comment", text: "Reply"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "updateComment", id: "root-comment", text: "Edited"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "removeComment", id: "root-comment"})
    const input = drawer.querySelector<HTMLTextAreaElement>('textarea[aria-label="New comment"]')!
    toolbox.commentState = {...toolbox.commentState, canComment: true}
    await toolbox.updateComplete
    input.value = "New comment"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await toolbox.updateComplete
    drawer.querySelector<HTMLFormElement>(".comment-thread-empty form")!.dispatchEvent(new Event("submit", {cancelable: true}))
    expect(execute).toHaveBeenNthCalledWith(5, {type: "addComment", text: "New comment"})
  })

  it("focuses the editor after a successful thread selection", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(true)
    const focus = vi.spyOn(editor as unknown as {focusEditor(): void}, "focusEditor").mockImplementation(() => {})
    const toolbox = editor.shadowRoot!.querySelector<DomEditorToolbox>("dom-editor-toolbox")!
    toolbox.dispatchEvent(new CustomEvent("comment-action", {
      detail: {action: "select", id: "target"}, bubbles: true, composed: true,
    }))
    await Promise.resolve()
    expect(execute).toHaveBeenCalledWith({type: "selectComment", id: "target"})
    expect(focus).toHaveBeenCalledOnce()
    execute.mockResolvedValue(false)
    toolbox.dispatchEvent(new CustomEvent("comment-action", {
      detail: {action: "select", id: "removed"}, bubbles: true, composed: true,
    }))
    await Promise.resolve()
    expect(focus).toHaveBeenCalledOnce()
  })

  it("updates comment UI state and routes every comment command", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    dispatchEditorMessage(editor, editorWindow, {
      type: commentStateChangeEvent,
      detail: {
        canComment: true,
        active: true,
        text: "Old text",
        activeCount: 1,
        count: 2,
        highlighting: true,
      },
    })
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    ribbon.activeMenu = "Edit"
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Comments"]')!
    for(const action of ["toggle", "remove-all", "previous", "next"]) {
      const button = drawer.querySelector<RibbonButton>(`ribbon-button[action="${action}"]`)!
      await button.updateComplete
      button.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    }
    const highlighting = drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    highlighting.checked = false
    highlighting.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleComment", text: "Old text"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "removeAllComments"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "previousComment"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "nextComment"})
    expect(execute).toHaveBeenNthCalledWith(5, {type: "setCommentHighlighting", enabled: false})
  })
})
