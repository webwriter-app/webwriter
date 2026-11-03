import type {DOMEditor} from "../src/domeditor"

/** Real selection and nested scrolling regression for #319. */
export async function checkHistorySelection() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.title = "Undo and redo selection restoration"
  frame.style.cssText = "width:700px;height:420px;border:1px solid #ccc"
  frame.srcdoc = '<!doctype html><head><style>:root{--ww-ui-transition:none}</style></head><body><p>Undo / redo restores the selected word below.</p><div style="height:250px;overflow:auto"><div style="height:650px"></div><details open><summary>Edited content</summary><p>Hello world</p></details><div style="height:650px"></div></div><p>Elsewhere</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts?proofreading-disabled"></script></body>'
  document.body.append(frame)
  const automated = new URLSearchParams(location.search).has("run")
  let passed = false
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "history fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    editor.doc.stopCapturing()
    const scroller = () => doc.querySelector("div")!
    const details = () => {
      const element = doc.querySelector("details")
      assert(element, `history disclosure is missing from live DOM: ${doc.body.innerHTML}`)
      return element!
    }
    const text = () => {
      const paragraph = details().querySelector("p")!
      assert(paragraph.firstChild, `history text is missing from live DOM: ${doc.body.innerHTML}`)
      return paragraph.firstChild as Text
    }
    const other = () => doc.body.querySelector(":scope > p:last-of-type")!.firstChild!
    const settle = () => new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    selection.setBaseAndExtent(text(), 11, text(), 6)
    const input = new view.InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "deleteContentForward"})
    details().querySelector("p")!.dispatchEvent(input)
    if(!input.defaultPrevented) assert(doc.execCommand("delete"), "native deletion failed")
    editor.doc.syncFromDOM()
    const afterText = text().data
    assert(afterText.replaceAll("\u00a0", " ") === "Hello ", "native deletion removed the wrong text")
    selection.collapse(other(), 0)
    editor.doc.updateLocalSelection()
    details().open = false
    // Closing the disclosure is a separate authored step, so undo it first.
    editor.doc.stopCapturing()
    editor.doc.syncFromDOM()
    editor.doc.undo()
    scroller().scrollTop = 0
    editor.features.history.actions.undo({type: "undo"})
    await settle()
    let currentText = text()
    assert(selection.toString() === "world" && selection.anchorOffset === 11 && selection.focusOffset === 6,
      `undo lost the backwards pre-deletion selection: text=${JSON.stringify(selection.toString())}; anchor=${selection.anchorNode?.nodeName}:${selection.anchorOffset}; focus=${selection.focusNode?.nodeName}:${selection.focusOffset}; restored=${currentText.data}; current=${currentText.isConnected}`)
    const visible = () => {
      const range = doc.createRange()
      range.setStart(currentText, selection.focusOffset)
      range.collapse(true)
      const rect = range.getBoundingClientRect(), viewport = scroller().getBoundingClientRect()
      return rect.height > 0 && rect.top >= viewport.top && rect.bottom <= viewport.bottom
    }
    assert(scroller().scrollTop > 0 && visible(), "undo did not reveal the restored selection in its nested scroller")
    selection.collapse(other(), 0)
    editor.doc.updateLocalSelection()
    scroller().scrollTop = 0
    editor.features.history.actions.redo({type: "redo"})
    await settle()
    currentText = text()
    assert(currentText.data === afterText && selection.isCollapsed && selection.anchorNode === currentText && selection.focusOffset === 6,
      "redo did not restore the post-deletion caret")
    assert(scroller().scrollTop > 0 && visible(), "redo did not reveal the final caret")
    // Leave the restored word selected for interactive visual inspection.
    editor.features.history.actions.undo({type: "undo"})
    await settle()
    assert(!editor.toHTML(true).includes("history-selection"), "history metadata leaked into serialized HTML")
    passed = true
    if(!automated) frame.scrollIntoView({block: "center"})
  }
  finally {
    if(automated || !passed) { frame.contentWindow?.editor?.destroy(); frame.remove() }
  }
}
