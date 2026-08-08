// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {DomEditor} from "./dom-editor"
import {executeCompleteEvent, executeFailureEvent} from "../editor-bridge"

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

  it("executes the matching insert action from the expanded Insert ribbon", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const paragraph = ribbon.shadowRoot!.querySelector('ribbon-group[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<p></p>"})
  })

  it("executes undo and redo from the top ribbon controls", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const historyButtons = Array.from(ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".history-button"))

    expect(historyButtons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Undo",
      "Redo",
    ])
    expect(historyButtons[0].querySelector(".icon-tabler-arrow-back-up")).not.toBeNull()
    expect(historyButtons[1].querySelector(".icon-tabler-arrow-forward-up")).not.toBeNull()
    expect(historyButtons[1].nextElementSibling?.getAttribute("aria-label")).toBe("Collapse ribbon")

    historyButtons[0].click()
    historyButtons[1].click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "undo"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "redo"})
  })

  it("prevents pointer interactions from focusing ribbon controls", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const tab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!
    const button = tab.shadowRoot!.querySelector("button")!
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})

    expect(button.dispatchEvent(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  it("allows ribbon inputs to receive pointer focus", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const root = ribbon.shadowRoot!.querySelector(".ribbon")!
    const input = document.createElement("input")
    root.append(input)
    const event = new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0})

    expect(input.dispatchEvent(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it("restores the editor selection after a ribbon input loses focus", async () => {
    const {editor, iframe} = await mountEditor()
    const frameDocument = iframe.contentDocument!
    frameDocument.body.innerHTML = "<p>hello</p>"
    const text = frameDocument.querySelector("p")!.firstChild!
    const selection = frameDocument.getSelection()!
    selection.setBaseAndExtent(text, 1, text, 4)
    iframe.focus()
    iframe.dispatchEvent(new Event("blur"))

    const focus = vi.spyOn(iframe, "focus")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const root = ribbon.shadowRoot!.querySelector(".ribbon")!
    const input = document.createElement("input")
    root.append(input)

    input.dispatchEvent(new MouseEvent("pointerdown", {bubbles: true, cancelable: true, composed: true, button: 0}))
    input.dispatchEvent(new FocusEvent("focusin", {bubbles: true, composed: true}))
    input.dispatchEvent(new FocusEvent("focusout", {bubbles: true, composed: true, relatedTarget: null}))
    await Promise.resolve()

    expect(focus).toHaveBeenCalledWith({preventScroll: true})
    expect(selection.anchorNode).toBe(text)
    expect(selection.anchorOffset).toBe(1)
    expect(selection.focusNode).toBe(text)
    expect(selection.focusOffset).toBe(4)
  })

  it("restores iframe focus after a ribbon command", async () => {
    const {editor, iframe} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const focus = vi.spyOn(iframe, "focus")
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const paragraph = ribbon.shadowRoot!.querySelector('ribbon-group[label="Text"] ribbon-button[label="Paragraph"]')!
    await paragraph.updateComplete
    paragraph.shadowRoot!.querySelector("button")!.click()
    await execute.mock.results[0].value

    expect(focus).toHaveBeenCalledWith({preventScroll: true})
  })

  it("uses one Heading ribbon button with a submenu for the other heading levels", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    const heading = ribbon.shadowRoot!.querySelector('ribbon-group[label="Text"] ribbon-button[label="Heading"]')!
    expect(ribbon.shadowRoot!.querySelector('ribbon-group[label="Text"] ribbon-button[label="Heading 2"]')).toBeNull()
    await heading.updateComplete

    heading.shadowRoot!.querySelector('button[title="Heading"]')!.click()
    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<h1></h1>"})

    heading.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete
    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    await submenu.updateComplete
    submenu.shadowRoot!.querySelector('button[title="Heading 3"]')!.click()

    expect(execute).toHaveBeenLastCalledWith({type: "insert", html: "<h3></h3>"})
  })

  it("closes expanded ribbon-button menus when the editor receives focus", async () => {
    const {editor, iframe} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const heading = ribbon.shadowRoot!.querySelector('ribbon-group[label="Text"] ribbon-button[label="Heading"]')!
    await heading.updateComplete
    heading.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await heading.updateComplete

    const submenu = heading.shadowRoot!.querySelector("ribbon-menu")!
    expect(submenu.hidden).toBe(false)
    iframe.contentDocument!.dispatchEvent(new Event("focusin", {bubbles: true}))
    await heading.updateComplete

    expect(submenu.hidden).toBe(true)
  })

  it("executes the matching insert action from the collapsed Insert menu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    const paragraph = menu.shadowRoot!.querySelector('button[title="Paragraph"]')!
    paragraph.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<p></p>"})
  })

  it("renders heading levels 2 to 6 as a submenu in the collapsed Insert menu", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete

    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).toBeNull()
    menu.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await menu.updateComplete
    menu.shadowRoot!.querySelector('button[title="Heading 2"]')!.click()

    expect(execute).toHaveBeenCalledWith({type: "insert", html: "<h2></h2>"})
  })

  it("closes Insert submenus when the collapsed ribbon menu closes", async () => {
    const {editor} = await mountEditor()
    const ribbon = editor.shadowRoot!.querySelector("app-ribbon")!
    ribbon.expanded = false
    await ribbon.updateComplete
    const insertTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="Insert"]')!

    insertTab.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector('button[aria-label="Show more Heading options"]')!.click()
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).not.toBeNull()

    ribbon.menuOpen = false
    await ribbon.updateComplete
    ribbon.menuOpen = true
    await ribbon.updateComplete
    await menu.updateComplete

    expect(menu.shadowRoot!.querySelector('button[title="Heading 2"]')).toBeNull()
  })
})
