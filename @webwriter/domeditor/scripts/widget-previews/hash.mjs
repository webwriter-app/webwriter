/** Edit: switch the hash function from SHA-256 to MD5. Use: type a password and watch its hash appear. */
// The station's lesson text and its other widgets stay in the document but out of view.
const hide = "body > :not(webwriter-hash) {display: none !important}"
const tag = "webwriter-hash"

/** Boxes in the widget's shadow trees that match a predicate, in page coordinates. */
async function find({evaluate, widget}, predicate) {
  const boxes = await evaluate(`(() => {
    const host = document.querySelector("${tag}"), frame = host.getBoundingClientRect(), found = []
    const walk = root => { for(const element of root.querySelectorAll("*")) { if((${predicate})(element)) found.push(element); if(element.shadowRoot) walk(element.shadowRoot) } }
    walk(host.shadowRoot)
    return found.map(element => element.getBoundingClientRect()).filter(box => box.width > 0)
      .map(box => ({x: box.x - frame.x, y: box.y - frame.y, width: box.width, height: box.height}))
  })()`)
  return boxes.map(box => ({x: widget.x + box.x + box.width / 2, y: widget.y + box.y + box.height / 2, left: widget.x + box.x, top: widget.y + box.y, width: box.width, height: box.height}))
}
/** The first match, waiting while the scene renders or a control slides in until it stops moving; a match that keeps moving counts after a while. */
async function settled(take, predicate) {
  let previous
  for(let attempt = 0; attempt < 60; attempt++) {
    const [box] = await find(take, predicate)
    if(box && previous && Math.abs(box.x - previous.x) < .5 && Math.abs(box.y - previous.y) < .5) return box
    previous = box
    await new Promise(resolve => setTimeout(resolve, 60))
  }
  if(previous) return previous
  throw new Error(`No element for ${predicate}`)
}
const node = (take, kind) => settled(take, `element => element.localName === "ww-node" && element.classList.contains(${JSON.stringify(kind)})`)
const tool = (take, label) => settled(take, `element => element.localName === "button" && element.getAttribute("aria-label") === ${JSON.stringify(take.t(label))}`)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// The fitted graph sits in the middle of the scene, which fills the widget.
const center = widget => ({x: widget.x + widget.width / 2, y: widget.y + widget.height / 2})
const rest = widget => ({x: center(widget).x + 150, y: center(widget).y + 150})

/**
 * The station lays its three nodes out in a row, too wide to read in a square. Untimed, the hash value node moves under the key
 * node, the node menu closes, the view fits the nodes and zooms in two wheel steps, so the graph fills the square legibly.
 * Only the move changes the document; the menu and the view are the reader's own state, so the use take repeats them.
 */
async function compact(take, move) {
  const {mouse, widget} = take
  await mouse.clickAt(await tool(take, "Toggle node menu"))
  await sleep(600)
  if(move) {
    const key = await node(take, "key"), value = await node(take, "hash-value")
    // Grab the hash value node by its title bar and drop it below the key node.
    await mouse.place(value.x, value.top + 4)
    await mouse.down()
    await mouse.move(key.x, key.top + key.height * 1.3 + 4, 500)
    await mouse.up()
    await sleep(400)
  }
  await mouse.clickAt(await tool(take, "Focus on nodes"))
  await still(take)
  // A click on the empty scene clears the selection; mouse.blur() would land on the editor's caption handle below the widget.
  await mouse.clickAt({x: widget.x + 30, y: widget.y + widget.height - 30})
  const {x, y} = center(widget)
  await mouse.place(x, y)
  for(let step = 0; step < 2; step++) {
    await mouse.wheel(0, -100)
    await still(take)
  }
}

/** Waits until the view has stopped moving, so that fitting and zooming end in the same place on a slow machine. */
async function still(take) {
  let previous = ""
  for(let attempt = 0; attempt < 40; attempt++) {
    await sleep(150)
    const boxes = await find(take, `element => element.localName === "ww-node"`)
    const current = JSON.stringify(boxes.map(({left, top, width}) => [left, top, width].map(Math.round)))
    if(boxes.length === 3 && current === previous) return
    previous = current
  }
}

export default {
  package: "@webwriter/hash", version: "2.0.0", snippet: "snippets/password-pioneers-station-1.html", tag,
  width: 450, height: 760, style: hide,
  // The square sits a little low so that the view tools at the top of the scene stay out of it.
  crop: widget => ({x: center(widget).x - 184, y: center(widget).y - 170, width: 368, height: 368}),
  prepareEdit: take => compact(take, true),
  async edit(take) {
    const {at, mouse, keyboard, widget} = take
    const end = rest(widget), select = await settled(take, `element => element.localName === "sl-select"`)
    await mouse.place(end.x, end.y)
    await at(450); await mouse.move(select.x, select.y, 550)
    await at(1050); await mouse.click()
    // In the open list, SHA-1 sits right above SHA-256; the scene keeps pointer releases, so the keyboard picks it.
    await at(1550); await keyboard.press("ArrowUp")
    await at(2050); await keyboard.press("Enter")
    await at(2350); await mouse.move(end.x, end.y, 550)
  },
  prepareUse: take => compact(take, false),
  async use(take) {
    const {at, mouse, keyboard, widget} = take
    const end = rest(widget), key = await settled(take, `element => element.localName === "textarea" && element.placeholder === ${JSON.stringify(take.t("Enter a key..."))}`)
    await mouse.place(end.x, end.y)
    await at(500); await mouse.move(key.x, key.y, 500)
    await at(1050); await mouse.click()
    await at(1300); await keyboard.type("infodot", 140)
    await at(2650); await mouse.move(end.x, end.y, 550)
  },
}
