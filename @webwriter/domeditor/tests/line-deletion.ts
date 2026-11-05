import type {DOMEditor} from "../src/domeditor"

/** #404: line deletion stops at visual or hard boundaries in the rendered DOM. */
export async function checkLineDeletion() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const frame = document.createElement("iframe")
  frame.title = "Line deletion regression"
  frame.style.cssText = "width:700px;height:500px"
  frame.srcdoc = '<!doctype html><head><style>p{width:190px;font:16px/24px monospace;margin:0}</style></head><body><details open><summary>Line deletion fixture</summary><p></p></details><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && !view.editorError && attempt < 400; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor, `line deletion fixture did not initialize: ${view.editorError ?? "timed out"}`)
    const editor = view.editor!, doc = frame.contentDocument!, selection = doc.getSelection()!
    Object.defineProperty(view.navigator, "platform", {configurable: true, value: "MacIntel"})
    const paragraph = doc.querySelector("p")!
    const settle = () => new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())))
    const command = async (key: string) => {
      const event = new view.KeyboardEvent("keydown", {key, metaKey: true, bubbles: true, cancelable: true})
      doc.dispatchEvent(event)
      assert(event.defaultPrevented, `Command+${key} was not handled`)
      await settle()
    }
    const setText = (html: string) => { paragraph.innerHTML = html; editor.doc.syncFromDOM(); editor.doc.stopCapturing() }
    const content = (text: Text) => text.data.replaceAll("\u00a0", " ")
    const visualLineStart = (text: Text, offset: number) => {
      selection.collapse(text, offset)
      selection.modify("extend", "backward", "lineboundary")
      const point = selection.focusNode === text ? selection.focusOffset : 0
      selection.collapse(text, offset)
      return point
    }
    const sample = "Earlier words remain. This visual line has enough text to wrap clearly. Final wrapped line remains."
    setText(`<!--before--><strong>Keep me. </strong><span>${sample}</span><!--after-->`)
    await settle()
    const text = paragraph.querySelector("span")!.firstChild as Text
    const midOffset = Math.floor(text.length / 2)
    const start = visualLineStart(text, midOffset)
    assert(start > 0 && start < midOffset, "fixture did not wrap before the selected visual line")
    selection.collapse(text, midOffset)
    await command("Backspace")
    assert(text.data === sample.slice(0, start) + sample.slice(midOffset), "Command+Backspace did not stop at the current visual line start")
    assert(paragraph.firstChild?.nodeType === Node.COMMENT_NODE && paragraph.lastChild?.nodeType === Node.COMMENT_NODE && paragraph.querySelector("strong")?.textContent === "Keep me. ", "outside comments or inline markup were lost")
    editor.features.history.actions.undo({type: "undo"}); await settle()
    assert(paragraph.querySelector("span")!.textContent === sample, "undo did not restore visual-line deletion")
    editor.features.history.actions.redo({type: "redo"}); await settle()
    assert(paragraph.querySelector("span")!.textContent === sample.slice(0, start) + sample.slice(midOffset), "redo did not reapply visual-line deletion")

    setText(`<span>${sample}</span>`)
    await settle()
    const selectedText = paragraph.querySelector("span")!.firstChild as Text
    selection.setBaseAndExtent(selectedText, 8, selectedText, 2)
    await command("Backspace")
    assert(selectedText.data === sample.slice(0, 2) + sample.slice(8), "Command+Backspace did not delete the existing noncollapsed selection")
    editor.features.history.actions.undo({type: "undo"}); await settle()
    assert(paragraph.firstChild?.textContent === sample, "undo did not restore the pre-existing selection deletion")
    editor.features.history.actions.redo({type: "redo"}); await settle()
    assert(paragraph.firstChild?.textContent === sample.slice(0, 2) + sample.slice(8), "redo did not reapply the pre-existing selection deletion")

    // A collapsed caret at the end of the final wrapped line deletes only that line.
    setText(`<span>${sample}</span>`); await settle()
    const finalText = paragraph.querySelector("span")!.firstChild as Text
    const finalStart = visualLineStart(finalText, finalText.length)
    assert(finalStart > 0, "fixture did not wrap its final visual line")
    selection.collapse(finalText, finalText.length)
    await command("Backspace")
    assert(content(finalText) === sample.slice(0, finalStart), "Command+Backspace at the final line end removed earlier wrapped lines")

    setText('<b title="authored">Earlier line<br>Delete </b><em>these</em> suffix'); await settle()
    selection.collapse(paragraph.querySelector("em")!.firstChild!, 5)
    await command("Backspace")
    assert(paragraph.textContent === "Earlier line suffix" && paragraph.querySelector("b")?.innerHTML === "Earlier line<br>",
      "Command+Backspace across inline marks changed the preceding line or its formatting")

    // beforeinput line deletion types are intercepted inside details. Soft lines
    // use the wrapped visual line; hard lines use the paragraph or <br> boundary.
    for(const nativeTarget of [false, true])
    for(const [inputType, direction] of [["deleteSoftLineBackward", "backward"], ["deleteSoftLineForward", "forward"], ["deleteHardLineBackward", "backward"], ["deleteHardLineForward", "forward"], ["deleteEntireSoftLine", "entire"]] as const) {
      const firstLine = "first wrapped line carries enough words to wrap here", secondLine = "second hard line keeps its own words"
      setText(`<span>${firstLine}<br>${secondLine}</span>`)
      await settle()
      const span = paragraph.querySelector("span")!
      const backward = direction === "backward"
      const entire = direction === "entire"
      const hard = inputType.startsWith("deleteHard")
      const node = (hard ? span.lastChild : span.firstChild) as Text
      const caretOffset = backward || entire ? Math.floor(node.length * .75) : Math.floor(node.length * .2)
      selection.collapse(node, caretOffset)
      let rangeStart = 0, rangeEnd = 0
      if(hard) {
        rangeStart = backward ? 0 : caretOffset
        rangeEnd = backward ? caretOffset : node.length
      }
      else if(entire) {
        selection.modify("extend", "backward", "lineboundary")
        rangeStart = selection.focusNode === node ? selection.focusOffset : 0
        selection.collapse(node, caretOffset)
        selection.modify("extend", "forward", "lineboundary")
        rangeEnd = selection.focusNode === node ? selection.focusOffset : node.length
      }
      else {
        selection.modify("extend", direction, "lineboundary")
        const boundary = selection.focusNode === node ? selection.focusOffset : (backward ? 0 : node.length)
        rangeStart = backward ? boundary : caretOffset
        rangeEnd = backward ? caretOffset : boundary
      }
      selection.collapse(node, caretOffset)
      const expected = node.data.slice(0, rangeStart) + node.data.slice(rangeEnd)
      const input = new view.InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType})
      // Chromium does not expose this optional input type in its constructor.
      if(inputType === "deleteEntireSoftLine") Object.defineProperty(input, "inputType", {value: inputType})
      if(nativeTarget) Object.defineProperty(input, "getTargetRanges", {value: () => [new view.StaticRange({
        startContainer: node, startOffset: rangeStart, endContainer: node, endOffset: rangeEnd,
      })]})
      paragraph.dispatchEvent(input)
      assert(input.defaultPrevented, `${inputType} was not intercepted inside details`)
      await settle()
      assert(content(node) === expected, `${inputType} deleted the wrong visual-line range: ${JSON.stringify(node.data)}; expected ${JSON.stringify(expected)}`)
      assert(span.querySelector("br")?.isConnected && doc.querySelector("details")?.contains(node), `${inputType} changed its hard break or escaped details`)
      assert((hard ? span.firstChild : span.lastChild)?.textContent === (hard ? firstLine : secondLine), `${inputType} changed text across a hard break`)
    }
    assert(!editor.toHTML(true).includes("◆"), "line deletion leaked editor markers")
  }
  finally { frame.contentWindow?.editor?.destroy(); frame.remove() }
}
