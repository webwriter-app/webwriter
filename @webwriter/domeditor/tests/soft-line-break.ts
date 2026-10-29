import type {DOMEditor} from "../src/domeditor"

/** #311: the first soft break must render a new line and accept native typing. */
export async function checkSoftLineBreak() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:600px"
  frame.srcdoc = '<!doctype html><body><p>Ready</p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `soft break fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    const layout = () => new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    for(const input of ["key", "beforeinput"]) for(const html of [
      "<p>Text</p>",
      "<ul><li>Text</li></ul>",
      "<p><b>Text</b> \n</p>",
      "<ol><li><p><b><i>Text</i></b><!--keep--></p></li></ol>",
      "<ul><li>Parent<ul><li><b>Text</b></li></ul></li></ul>",
    ]) {
      doc.body.innerHTML = html
      const block = Array.from(doc.querySelectorAll("p, li")).at(-1)!
      const walker = doc.createTreeWalker(block, view.NodeFilter.SHOW_TEXT)
      let text = walker.nextNode()!
      while(text.textContent !== "Text") text = walker.nextNode()!
      selection.setPosition(text, 4)
      await layout()
      const before = block.getBoundingClientRect()
      const lineHeight = parseFloat(view.getComputedStyle(block).lineHeight)
      const press = () => {
        const event = input === "key"
          ? new view.KeyboardEvent("keydown", {key: "Enter", shiftKey: true, bubbles: true, cancelable: true})
          : new view.InputEvent("beforeinput", {inputType: "insertLineBreak", bubbles: true, cancelable: true})
        doc.dispatchEvent(event)
        assert(event.defaultPrevented, `${input}: soft break was not handled`)
      }
      press()
      await layout()
      assert(block.querySelectorAll("br").length === 2, `${html}: final empty line has no terminating break`)
      assert(block.getBoundingClientRect().height >= before.height + lineHeight - 1, `${html}: first soft break did not render a new line`)

      // Native insertion canonicalizes invalid caret positions back onto the
      // preceding line, so checking height alone would miss the original bug.
      doc.execCommand("insertText", false, "Next")
      const typed = selection.focusNode!
      const typedRange = doc.createRange()
      typedRange.selectNodeContents(typed)
      const firstRange = doc.createRange()
      firstRange.selectNodeContents(text)
      assert(typed.textContent === "Next" && typedRange.getBoundingClientRect().top > firstRange.getBoundingClientRect().top,
        `${html}: native typing did not start on the new line: ${block.innerHTML}`)
      press()
      press()
      await layout()
      assert(block.querySelectorAll("br").length === 4, `${html}: repeated soft breaks added extra lines`)
      assert(block.getBoundingClientRect().height >= before.height + 3 * lineHeight - 1, `${html}: repeated breaks lost a line`)
      assert(doc.querySelectorAll("li").length === (html.match(/<li>/g)?.length ?? 0), `${html}: soft break split a list item`)
      assert(!editor.toHTML(true).includes("◆"), "soft breaks leaked editor markers")
    }
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
