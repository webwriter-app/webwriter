/** Edit: drag the edge "b" one grid step outward, and the lengths 9 and 4 update to 10 and 5. Use: work out a from the figure, enter 7 and check it. */
// The canvas has 1000 × 700 units below the editing toolbar; readers get the canvas alone, as a picture.
const canvasOf = widget => {
  const scale = (widget.width - 2) / 1000, height = 700 * scale
  return {left: widget.x + 1, top: widget.y + widget.height - height - 1, scale, height}
}
const point = (widget, x, y) => {
  const {left, top, scale} = canvasOf(widget)
  return {x: left + x * scale, y: top + y * scale}
}
const editing = widget => widget.height - canvasOf(widget).height > 10

// The figure with its labels spans about 100–700 × 100–600 units after the edit.
const figure = widget => {
  const from = point(widget, 100, 100), to = point(widget, 700, 600)
  return {x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y}
}
// For readers the canvas's empty bottom strip below the figure, in px, is clipped so that the task follows closely.
const clip = 55
// The task about a, about 190 px tall once its result shows, follows under the clipped canvas.
const taskHeight = 190
// Readers answer a question below the figure, so the use take frames the figure from the inner edge 5 down, a, and the task.
const frame = widget => {
  const region = figure(widget)
  if(editing(widget)) return region
  const {top, height} = canvasOf(widget), from = point(widget, 100, 250).y
  return {...region, y: from, height: top + height - clip + taskHeight - from}
}

// For readers the task sits close under the figure at its width; in the editor it stays well below the edit take's square.
// Its numbering stays hidden, as the only task of the document.
const style = `ww-geometry-cloze:not([contenteditable]) {clip-path: inset(0 0 ${clip}px 0); margin-bottom: -${clip}px}
webwriter-numeric {zoom: .75; width: 493px; margin-left: 82px}
webwriter-numeric::part(title) {display: none}`
// The question for readers: a is the top edge 10 less the inner edge 5 plus the step of 2 grid squares at the bottom right.
const questions = {en: "How long is a?", de: "Wie lang ist a?"}
const task = lang => `<webwriter-numeric mode="input" solution="7" hide-scoring><p slot="prompt">${questions[lang] ?? questions.en}</p></webwriter-numeric>`

/** Page coordinates of an element in the task, read from its shadow tree. */
async function control({evaluate, widget}, selector) {
  const box = await evaluate(`(() => {
    const host = document.querySelector("ww-geometry-cloze").getBoundingClientRect(), task = document.querySelector("webwriter-numeric")
    const find = root => root.querySelector(${JSON.stringify(selector)}) ?? [...root.querySelectorAll("*")].map(element => element.shadowRoot && find(element.shadowRoot)).find(Boolean)
    const box = (find(task.shadowRoot) ?? task.querySelector(${JSON.stringify(selector)})).getBoundingClientRect()
    return {x: box.x - host.x + box.width / 2, y: box.y - host.y + box.height / 2}
  })()`)
  return {x: widget.x + box.x, y: widget.y + box.y}
}

// The pointer rests at the same place in the figure at the end of the edit and the start of the use take.
const rest = widget => point(widget, 610, 470)

export default ({lang}) => ({
  package: "@webwriter/geometry-cloze", version: "3.0.0", snippet: "snippets/polygon2.html", tag: "ww-geometry-cloze",
  with: [{package: "@webwriter/tasks", version: "3.0.1", html: task(lang)}],
  // At this width 600 canvas units fill the edit take's square, so the labels stay at about 11 CSS px.
  width: 680, height: 800, style,
  crop: frame,
  async edit({at, mouse, widget}) {
    const start = point(widget, 640, 520), edge = point(widget, 600, 200), moved = point(widget, 650, 200), end = rest(widget)
    await mouse.place(start.x, start.y)
    await at(450); await mouse.move(edge.x, edge.y, 600)
    await at(1150); await mouse.down()
    await at(1250); await mouse.move(moved.x, moved.y, 900)
    await at(2250); await mouse.up()
    await at(2450); await mouse.move(end.x, end.y, 550)
  },
  async use(take) {
    const {at, mouse, keyboard, widget} = take
    const end = rest(widget), left = point(widget, 160, 572), right = point(widget, 490, 572)
    const [input, check] = [await control(take, "input"), await control(take, "sl-button")]
    await mouse.place(end.x, end.y)
    // The reader follows the edge a along the grid, then answers.
    await at(450); await mouse.move(left.x, left.y, 450)
    await at(950); await mouse.move(right.x, right.y, 450)
    await at(1500); await mouse.move(input.x, input.y, 450)
    await at(2000); await mouse.click()
    await at(2200); await keyboard.type("7")
    await at(2400); await mouse.move(check.x, check.y, 450)
    await at(2950); await mouse.click()
    await at(3250); await mouse.move(input.x + 150, input.y - 10, 500)
  },
})
