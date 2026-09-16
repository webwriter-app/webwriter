import {DOMEditor} from "../src/domeditor"
import {$, isAppendixInteraction} from "../src/utility"

let recording = false
const entries: object[] = []
const output = document.createElement("pre")
output.style.cssText = "white-space:pre-wrap;font:12px monospace;user-select:text"
const math = document.querySelector("math")!
// Register before the editor so canceled events remain visible in the trace.
for(const type of ["keydown", "keyup", "compositionstart", "compositionupdate", "compositionend", "beforeinput", "input"]) {
  document.addEventListener(type, event => {
    if(!recording || isAppendixInteraction(event) && !event.composedPath().some(node =>
      node instanceof HTMLTextAreaElement && node.getAttribute("aria-label") === "Formula exponent input")) return
    const selection = document.getSelection()
    const entry = {
      type, key: (event as KeyboardEvent).key, code: (event as KeyboardEvent).code,
      keyCode: (event as KeyboardEvent).keyCode, composing: (event as KeyboardEvent).isComposing,
      alt: (event as KeyboardEvent).altKey, shift: (event as KeyboardEvent).shiftKey,
      data: (event as InputEvent).data, inputType: (event as InputEvent).inputType,
      cancelable: event.cancelable, prevented: false,
      focus: selection?.focusNode?.nodeName, offset: selection?.focusOffset,
      html: "",
    }
    entries.push(entry)
    setTimeout(() => {
      entry.prevented = event.defaultPrevented
      entry.html = math.outerHTML
      output.textContent = entries.map(item => JSON.stringify(item)).join("\n")
    }, 0)
  }, true)
}
const editor = new DOMEditor()
const panel = document.createElement("section")
panel.style.cssText = "font:16px system-ui;margin:24px;max-width:1000px"
const instructions = document.createElement("p")
instructions.textContent = "In Chrome, click Start, press the dedicated ^ key once, then a, then 2. Click Stop and copy the event log below. Recording is limited to this test page and sends nothing."
const start = document.createElement("button")
start.textContent = "Start"
start.onclick = () => {
  recording = false
  math.innerHTML = "<mi>x</mi>"
  entries.length = 0
  output.textContent = ""
  document.body.focus()
  $.move(math.firstElementChild!.firstChild!, 1)
  editor.features.selection.processSelection(undefined, {scrollIntoView: false})
  editor.features.math.refresh()
  recording = true
}
const stop = document.createElement("button")
stop.textContent = "Stop"
stop.onclick = () => { recording = false }
panel.append(instructions, start, stop, output)
editor.addAppendix(panel)
