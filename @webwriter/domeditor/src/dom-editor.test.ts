// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import {executeCompleteEvent, executeFailureEvent} from "./editor-bridge"

async function mountEditor() {
  const editor = new DomEditor()
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  iframe.dispatchEvent(new Event("load"))
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("DomEditor.execute()", () => {
  it("posts an action and resolves with the completion result", async () => {
    const {editor, iframe, editorWindow} = await mountEditor()
    const postMessage = vi.spyOn(editorWindow, "postMessage").mockImplementation((message: any) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: executeCompleteEvent,
          detail: {requestId: message.requestId, result: "done"},
        },
        source: editorWindow,
      }))
    })
    const completed = vi.fn()
    editor.addEventListener(executeCompleteEvent, completed)

    await expect(editor.execute({type: "lift"})).resolves.toBe("done")
    expect(postMessage).toHaveBeenCalledWith({type: "lift", requestId: "1"}, "*")
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({detail: {requestId: "1", result: "done"}}))
    expect(editor.shadowRoot?.contains(iframe)).toBe(true)
  })

  it("rejects with the error returned by the inner editor", async () => {
    const {editor, editorWindow} = await mountEditor()
    vi.spyOn(editorWindow, "postMessage").mockImplementation((message: any) => {
      window.dispatchEvent(new MessageEvent("message", {
        data: {
          type: executeFailureEvent,
          detail: {
            requestId: message.requestId,
            error: {name: "NotAllowedError", message: "Clipboard access denied"},
          },
        },
        source: editorWindow,
      }))
    })

    await expect(editor.execute({type: "copy"})).rejects.toMatchObject({
      name: "NotAllowedError",
      message: "Clipboard access denied",
    })
  })
})
