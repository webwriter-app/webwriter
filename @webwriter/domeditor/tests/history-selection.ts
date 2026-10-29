import type {DOMEditor} from "../src/domeditor"

/** Real selection and nested scrolling regression for #319. */
export async function checkHistorySelection() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.title = "Undo and redo selection restoration"
  frame.style.cssText = "width:700px;height:420px;border:1px solid #ccc"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts?proofreading-disabled"></script></body>'
  document.body.append(frame)
  const automated = new URLSearchParams(location.search).has("run")
  let passed = false
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, "history fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    doc.body.innerHTML = '<p>Undo / redo restores the selected word below.</p><div style="height:250px;overflow:auto"><div style="height:650px"></div><details open><summary>Edited content</summary><p>Hello world</p></details><div style="height:650px"></div></div><p>Elsewhere</p>'
    doc.documentElement.style.setProperty("--ww-ui-transition", "none")
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    const scroller = doc.querySelector("div")!, details = doc.querySelector("details")!
    const text = details.querySelector("p")!.firstChild! as Text
    const other = doc.body.lastChild!.firstChild!
    const settle = () => new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    selection.setBaseAndExtent(text, 11, text, 6)
    const input = new view.InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "deleteContentForward"})
    details.querySelector("p")!.dispatchEvent(input)
    if(!input.defaultPrevented) assert(doc.execCommand("delete"), "native deletion failed")
    editor.doc.syncFromDOM()
    const afterText = text.data
    assert(afterText.replaceAll("\u00a0", " ") === "Hello ", "native deletion removed the wrong text")
    selection.collapse(other, 0)
    editor.doc.updateLocalSelection()
    details.open = false
    // Closing the disclosure is a separate authored step, so undo it first.
    editor.doc.stopCapturing()
    editor.doc.syncFromDOM()
    editor.doc.undo()
    scroller.scrollTop = 0
    editor.features.history.actions.undo({type: "undo"})
    await settle()
    assert(selection.toString() === "world" && selection.anchorOffset === 11 && selection.focusOffset === 6,
      "undo lost the backwards pre-deletion selection")
    const visible = () => {
      const range = doc.createRange()
      range.setStart(text, selection.focusOffset)
      range.collapse(true)
      const rect = range.getBoundingClientRect(), viewport = scroller.getBoundingClientRect()
      return rect.height > 0 && rect.top >= viewport.top && rect.bottom <= viewport.bottom
    }
    assert(scroller.scrollTop > 0 && visible(), "undo did not reveal the restored selection in its nested scroller")
    selection.collapse(other, 0)
    editor.doc.updateLocalSelection()
    scroller.scrollTop = 0
    editor.features.history.actions.redo({type: "redo"})
    await settle()
    assert(text.data === afterText && selection.isCollapsed && selection.anchorNode === text && selection.focusOffset === 6,
      "redo did not restore the post-deletion caret")
    assert(scroller.scrollTop > 0 && visible(), "redo did not reveal the final caret")
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
