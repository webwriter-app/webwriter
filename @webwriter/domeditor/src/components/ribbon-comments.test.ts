// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {commentStateChangeEvent} from "../editor-bridge"
import {WebWriterPackageRegistry} from "../packages"
import {DomEditor} from "./dom-editor"
import {AppRibbon} from "./ribbon"
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
    const textarea = drawer.querySelector<HTMLTextAreaElement>('textarea[aria-label="Comment text"]')!
    const highlighting = drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    const buttons = Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"))

    expect(drawer.layout).toBe("comments")
    expect(textarea.value).toBe("Review this")
    expect(highlighting.checked).toBe(true)
    expect(buttons.map(button => button.label)).toEqual([
      "Remove comment", "Remove all", "Previous comment", "Next comment",
    ])
    expect(buttons.every(button => !button.disabled)).toBe(true)
  })

  it("emits comment actions with the current plain-text draft", async () => {
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
    const textarea = drawer.querySelector<HTMLTextAreaElement>("textarea")!
    textarea.value = "A plain-text note"
    textarea.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    const toggle = drawer.querySelector<RibbonButton>('ribbon-button[action="toggle"]')!
    await toggle.updateComplete
    toggle.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()

    expect(actions).toHaveBeenCalledWith(expect.objectContaining({
      detail: {action: "toggle", text: "A plain-text note"},
    }))
  })
})

describe("comment ribbon bridge", () => {
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
    const textarea = drawer.querySelector<HTMLTextAreaElement>("textarea")!
    textarea.value = "Updated text"
    textarea.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    textarea.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    for(const action of ["toggle", "remove-all", "previous", "next"]) {
      const button = drawer.querySelector<RibbonButton>(`ribbon-button[action="${action}"]`)!
      await button.updateComplete
      button.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    }
    const highlighting = drawer.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    highlighting.checked = false
    highlighting.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "setCommentText", text: "Updated text"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "toggleComment", text: "Updated text"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "removeAllComments"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "previousComment"})
    expect(execute).toHaveBeenNthCalledWith(5, {type: "nextComment"})
    expect(execute).toHaveBeenNthCalledWith(6, {type: "setCommentHighlighting", enabled: false})
  })
})
