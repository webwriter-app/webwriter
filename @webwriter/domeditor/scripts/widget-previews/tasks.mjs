/** Edit: turn the word "page" into a new gap. Use: drag the three terms, including the new one, into their gaps. */
// The published snippet holds every task type; only the drag-and-drop gap task is shown.
const task = "body > webwriter-gap:nth-of-type(2)"
// Some task types keep `display: block !important` on their host, so the other tasks also leave the layout and view.
const hide = `body > :not(webwriter-gap:nth-of-type(2)) {display: none !important; position: fixed !important; visibility: hidden !important; left: -9999px !important}`

/** Page coordinates of authored light-DOM boxes in the task, read relative to the widget. */
async function boxes({evaluate, widget}, expression) {
  const found = await evaluate(`(() => {
    const host = document.querySelector(${JSON.stringify(task)}).getBoundingClientRect()
    return (${expression})(document.querySelector(${JSON.stringify(task)})).map(box => ({x: box.x - host.x, y: box.y - host.y, width: box.width, height: box.height}))
  })()`)
  return found.map(box => ({x: widget.x + box.x + box.width / 2, y: widget.y + box.y + box.height / 2, left: widget.x + box.x, right: widget.x + box.x + box.width}))
}
const word = (take, text) => boxes(take, `host => {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  for(let node; node = walker.nextNode();) {
    const index = node.data.indexOf(${JSON.stringify(text)})
    if(index < 0 || node.parentElement.closest("[slot]")) continue
    const range = document.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + ${text.length})
    return [range.getBoundingClientRect()]
  }
  return []
}`).then(([box]) => box)
const gaps = take => boxes(take, `host => [...host.querySelectorAll("webwriter-gap-item")].map(gap => gap.getBoundingClientRect())`)
// Direct queries into the shown task keep the takes on time; a search would also walk every hidden task.
const toggle = take => boxes(take, `host => [...host.shadowRoot.querySelectorAll("button.toggle-gap")].map(button => button.getBoundingClientRect())`).then(([box]) => box)
const chip = (take, text) => boxes(take, `host => [...host.shadowRoot.querySelectorAll("button.choice")].filter(button => button.textContent.trim() === ${JSON.stringify(text)}).map(button => button.getBoundingClientRect())`).then(([box]) => box)

// The pointer rests on the same widget-relative point at the end of the edit and the start of the use take.
const rest = widget => ({x: widget.x + 300, y: widget.y + 286})

// The word that becomes a gap and the terms in sentence order, per language; the snippet itself has no translations.
const words = {
  en: {page: "page", terms: ["theme", "page", "snippet"]},
  de: {page: "Seite", terms: ["Design", "Seite", "Baustein"]},
}
const localization = {
  "Drag each term into the right blank.#1": {de: "Ziehe jeden Begriff in die passende Lücke."},
  "A#1": {de: "Ein"},
  "theme#1": {de: "Design"},
  "styles the page, while a#1": {de: "gestaltet die Seite, während ein"},
  "snippet#1": {de: "Baustein"},
  "inserts prepared content.#1": {de: "vorbereitete Inhalte einfügt."},
}

export default ({lang}) => ({
  package: "@webwriter/tasks", version: "3.0.1", snippet: "snippets/about-webwriter.html", tag: task,
  width: 425, style: hide, localization,
  // The task grows by one line when the new gap wraps the sentence, so both takes frame the larger card;
  // the region reaches below the card so that the square starts under the editor's toolbar.
  crop: widget => ({...widget, height: 362}),
  async edit(take) {
    const {at, mouse, widget} = take
    const page = await word(take, (words[lang] ?? words.en).page)
    await mouse.place(widget.x + 330, widget.y + 250)
    await at(450); await mouse.move(page.left + 1, page.y, 550)
    await at(1050); await mouse.down()
    await mouse.move(page.right - 1, page.y, 350)
    await at(1450); await mouse.up()
    const button = await toggle(take)
    await at(1600); await mouse.move(button.x, button.y, 500)
    await at(2250); await mouse.click()
    const end = rest(widget)
    await at(2500); await mouse.move(end.x, end.y, 550)
  },
  async use(take) {
    const {at, mouse, widget} = take
    const end = rest(widget)
    await mouse.place(end.x, end.y)
    let time = 450
    for(const [index, term] of (words[lang] ?? words.en).terms.entries()) {
      const [from, targets] = await Promise.all([chip(take, term), gaps(take)]), to = targets[index]
      await at(time); await mouse.move(from.x, from.y, 330)
      await at(time + 360); await mouse.down()
      await mouse.move(to.x, to.y, 480, t => [0, -Math.sin(Math.PI * t) * 18])
      await at(time + 900); await mouse.up()
      time += 1000
    }
    await at(time); await mouse.move(end.x, end.y, 450)
  },
})
