/** Edit: replace "Apple" with "Kiwi" in the word list and generate the puzzle again. Use: find KIWI and PEAR by dragging over their letters. */
const tag = "webwriter-word-puzzle"

/** Page coordinates of the elements in the widget's shadow trees that match a predicate; `widget` is the box before scrolling. */
async function find({evaluate, widget}, predicate) {
  const boxes = await evaluate(`(() => {
    const host = document.querySelector("${tag}"), frame = host.getBoundingClientRect(), found = []
    const walk = root => { for(const element of root.querySelectorAll("*")) { if((${predicate})(element)) found.push(element); if(element.shadowRoot) walk(element.shadowRoot) } }
    walk(host.shadowRoot)
    return found.map(element => element.getBoundingClientRect()).filter(box => box.width > 0)
      .map(box => ({x: box.x - frame.x - scrollX, y: box.y - frame.y - scrollY, width: box.width, height: box.height}))
  })()`)
  return boxes.map(box => ({x: widget.x + box.x + box.width / 2, y: widget.y + box.y + box.height / 2, right: widget.x + box.x + box.width}))
}
/** The first match once it stops moving, for controls that slide in; a match that keeps moving counts after a while. */
async function settled(take, predicate) {
  let previous
  for(let attempt = 0; attempt < 40; attempt++) {
    const [box] = await find(take, predicate)
    if(box && previous && Math.abs(box.x - previous.x) < .5 && Math.abs(box.y - previous.y) < .5) return box
    previous = box
    await new Promise(resolve => setTimeout(resolve, 60))
  }
  if(previous) return previous
  throw new Error(`No element for ${predicate}`)
}
const cell = (take, row, column) => find(take, `element => element.classList?.contains("cell") && element.getAttribute("grid-row") === "${row}" && element.getAttribute("grid-col") === "${column}"`).then(([box]) => box)

/** The first and last letter of a word in the generated grid, read from the widget's saved layout. */
async function ends(take, text) {
  const {wordsClues} = JSON.parse(await take.evaluate(`document.querySelector("${tag} script[slot=data]").textContent`))
  const word = wordsClues.find(entry => entry.word === text)
  const last = word.across ? [word.x, word.y + text.length - 1] : [word.x + text.length - 1, word.y]
  return Promise.all([cell(take, word.x, word.y), cell(take, ...last)])
}

/** Focusing the word list scrolls the editor by the widget's top margin, so the edit take starts scrolled by that much. */
const scroll = async ({mouse, widget}) => {
  await mouse.place(widget.x + widget.width / 2, widget.y + 100)
  await mouse.wheel(0, 20)
  await new Promise(resolve => setTimeout(resolve, 800))
}
// Readers get the grid alone: the clipped puzzle is short, and the editor's full puzzle is tall.
const editing = widget => widget.height > 500
// The pointer rests beside the grid at the end of the edit and the start of the use take, in the same place of the square.
const rest = widget => ({x: widget.x + widget.width + 9, y: widget.y + (editing(widget) ? 250 : 270)})

// The snippet's own translation brings a word list in German with its own order. The edit replaces the first word
// of the list, and the use finds the new word and one more.
const words = {
  en: {old: "Apple", added: "Kiwi", found: ["Kiwi", "Pear"]},
  de: {old: "Pflaume", added: "Kiwi", found: ["Kiwi", "Birne"]},
}

export default ({lang}) => ({
  package: "@webwriter/word-puzzle", version: "2.0.1", snippet: "snippets/Find-The-Words-Fruits.html", tag,
  // The narrowest puzzle keeps the grid and the button below it inside the square at about 1:1.
  // For readers the puzzle ends below the grid, so the word list below it stays out of the square.
  width: 425, height: 760, style: `${tag} {width: 320px; margin-inline: auto} ${tag}:not([contenteditable]) {height: 316px; overflow: hidden}`,
  // The grid and the button below it; the editor's take stands scrolled by 20 px, and the square starts under the toolbar.
  crop: widget => ({...widget, y: widget.y + (editing(widget) ? -3 : 17), height: widget.width + 46}),
  prepareEdit: scroll,
  async edit(take) {
    const {at, mouse, keyboard, widget} = take
    const {old, added} = words[lang] ?? words.en
    const edit = await settled(take, `element => element.id === "edit-words"`), end = rest(widget)
    await mouse.place(end.x, end.y + 60)
    await at(400); await mouse.move(edit.x, edit.y, 450)
    await at(900); await mouse.click()
    // The drawer slides in over the grid; then the caret goes to the end of the first word.
    await at(1150)
    const first = await settled(take, `element => element.localName === "td" && element.textContent.trim() === ${JSON.stringify(old)}`)
    await mouse.move(first.right - 12, first.y, 280)
    await at(1650); await mouse.click()
    // One Backspace per letter, then the new word; longer words shift the rest of the take a little.
    for(let letter = 0; letter < old.length; letter++) { await at(1800 + letter * 110); await keyboard.press("Backspace") }
    const typed = 1830 + old.length * 110
    await at(typed); await keyboard.type(added, 110)
    // Ctrl+Enter generates the puzzle; Escape closes the drawer.
    const generated = typed + added.length * 110 + 130
    await at(generated); await keyboard.press("Enter", 2)
    await at(generated + 250); await keyboard.press("Escape")
    await at(generated + 450); await mouse.move(end.x, end.y, 450)
  },
  prepareUse: take => take.mouse.blur(),
  async use(take) {
    const {at, mouse, widget} = take
    const found = await Promise.all((words[lang] ?? words.en).found.map(word => ends(take, word))), end = rest(widget)
    await mouse.place(end.x, end.y)
    let time = 500
    for(const [first, last] of found) {
      await at(time); await mouse.move(first.x, first.y, 450)
      await at(time + 500); await mouse.down()
      await mouse.move(last.x, last.y, 600)
      await at(time + 1200); await mouse.up()
      time += 1450
    }
    await at(time); await mouse.move(end.x, end.y, 450)
  },
})
