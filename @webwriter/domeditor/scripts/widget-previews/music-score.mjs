/** Edit: double-click the rest in the first bar to place a D there. Use: play the phrase; the playhead highlights each note, the new D included. */
const tag = "webwriter-music-score"

/** Boxes in the widget that match a predicate, in page coordinates. */
async function find({evaluate, widget}, predicate) {
  const boxes = await evaluate(`(() => {
    const host = document.querySelector("${tag}"), frame = host.getBoundingClientRect(), found = []
    const walk = root => { for(const element of root.querySelectorAll("*")) { if((${predicate})(element)) found.push(element); if(element.shadowRoot) walk(element.shadowRoot) } }
    walk(host.shadowRoot ?? host)
    return found.map(element => element.getBoundingClientRect()).filter(box => box.width > 0)
      .map(box => ({x: box.x - frame.x, y: box.y - frame.y, width: box.width, height: box.height}))
  })()`)
  return boxes.map(box => ({x: widget.x + box.x + box.width / 2, y: widget.y + box.y + box.height / 2}))
}
const targets = (take, kind) => find(take, `element => element.dataset?.kind === ${JSON.stringify(kind)}`)

// The pointer rests right of the staves, between the two systems, at the end of the edit and the start of the use take.
const rest = widget => ({x: widget.x + widget.width - 16, y: widget.y + widget.height * .56})

export default {
  package: "@webwriter/music-score", version: "1.0.0", snippet: "snippets/practice-phrase.html", tag,
  // A slight zoom draws the notes larger while the score keeps its narrowest layout of one bar per line;
  // the space above lets the square center the score below the editor's toolbar.
  width: 425, style: `${tag} {zoom: 1.2; margin-top: 30px}`,
  settle: 2500,
  async edit(take) {
    const {at, mouse, widget} = take
    // The beats of the first bar: C, a rest, E and G. A D between C and E fills the rest.
    const [, gap] = await targets(take, "insert"), [c, e] = await targets(take, "note"), end = rest(widget)
    const d = {x: gap.x, y: (c.y + e.y) / 2}
    await mouse.place(end.x, end.y)
    await at(450); await mouse.move(d.x, d.y, 600)
    // A single click would open the pitch list; the double-click places the note directly.
    await at(1150); await mouse.doubleClick()
    await at(1600); await mouse.move(end.x, end.y, 600)
  },
  async use(take) {
    const {at, mouse, widget} = take
    const [play] = await find(take, `element => element.id === "play"`), end = rest(widget)
    await mouse.place(end.x, end.y)
    await at(500); await mouse.move(play.x, play.y, 450)
    // At 112 beats per minute the two bars take 4.3 s, so the playhead reaches the last note as the take ends.
    await at(1000); await mouse.click()
    await at(1300); await mouse.move(end.x, end.y, 600)
  },
}
