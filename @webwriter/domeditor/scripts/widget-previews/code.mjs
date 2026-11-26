/** Edit: extend the list with 6 and 7. Use: run the program, add 8 and run it again. */
// Scheme runs in the browser without a runtime download, so the result appears at once.
const tag = "webwriter-code-scheme"
const button = label => `element => element.localName === "sl-button" && element.textContent.trim().startsWith(${JSON.stringify(label)})`

/** Page coordinates of text in a line of the code editor, read with a Range. */
async function code({evaluate, widget}, line, text) {
  const box = await evaluate(`(() => {
    const host = document.querySelector("${tag}"), content = host.shadowRoot.querySelectorAll(".cm-content .cm-line")[${line - 1}]
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
    for(let node; node = walker.nextNode();) {
      const index = node.data.indexOf(${JSON.stringify(text)})
      if(index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + ${text.length})
      const box = range.getBoundingClientRect(), frame = host.getBoundingClientRect()
      return {x: box.x - frame.x, y: box.y - frame.y, width: box.width, height: box.height}
    }
  })()`)
  return {left: widget.x + box.x, right: widget.x + box.x + box.width, y: widget.y + box.y + box.height / 2}
}

/** Waits up to two seconds for a run to finish, so a slow machine does not click Run while it still runs. */
async function finished({evaluate, t}) {
  const busy = JSON.stringify([t("Running…"), t("Downloading runtime"), "Running", "Downloading"])
  for(let attempt = 0; attempt < 40; attempt++) {
    const running = await evaluate(`[...document.querySelector("${tag}").shadowRoot.querySelectorAll("sl-button")].some(button => ${busy}.some(label => button.textContent.includes(label)))`)
    if(!running) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

// Positions for the use take, read before it starts so that a busy machine keeps its timing.
let positions = null

// The pointer rests below the buttons at the end of the edit and the start of the use take.
const rest = widget => ({x: widget.x + 290, y: widget.y + 150})

export default {
  package: "@webwriter/code", version: "4.0.0", snippet: "snippets/scheme.html", tag,
  // Space above the short widget lets the square center it below the editor's toolbar.
  width: 425, style: `${tag} {font-size: 15px; margin-top: 86px}`,
  // The square centers the widget together with the output line that the use take adds.
  crop: widget => ({...widget, height: widget.height + 40}),
  async edit(take) {
    const {at, mouse, keyboard, widget} = take
    // The caret goes between "5" and the closing parenthesis of the list.
    const five = await code(take, 2, "5"), end = rest(widget)
    await mouse.place(widget.x + 300, widget.y + 120)
    await at(450); await mouse.move(five.right + 1, five.y, 550)
    await at(1050); await mouse.click()
    await at(1300); await keyboard.type(" 6 7", 160)
    await at(2200); await mouse.move(end.x, end.y, 550)
  },
  async prepareUse(take) {
    positions = {run: await take.locate(button(take.t("Run"))), seven: await code(take, 2, "7")}
  },
  async use(take) {
    const {at, mouse, keyboard, widget} = take
    const end = rest(widget), {run, seven} = positions
    await mouse.place(end.x, end.y)
    await at(500); await mouse.move(run.x, run.y, 450)
    await at(1000); await mouse.click()
    await finished(take)
    await at(1500); await mouse.move(seven.right + 1, seven.y, 500)
    await at(2050); await mouse.click()
    await at(2250); await keyboard.type(" 8", 160)
    await at(2700); await mouse.move(run.x, run.y, 450)
    await at(3200); await mouse.click()
    await at(3500); await mouse.move(end.x, end.y, 450)
  },
}
