/** Edit: draw the missing association from BookCopy to its CopyStatus enum. Use: drag CopyStatus aside; the new association follows it. */
const umlClass = name => `element => element.localName === "ww-node" && element.textContent.replace(/\\s+/g, " ").trim().replace("<<enum>> ", "").startsWith(${JSON.stringify(name + " ")})`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// The close-up, relative to the widget: the toolbar and the canvas below it, from the Relation button across
// the hint that the canvas shows while relating; only the left end of the zoom controls shows at its edge.
const view = {x: 256, y: 237}
// Where BookCopy's top left corner sits in the close-up, with CopyStatus below it.
const corner = {x: 159, y: 79}
// Where the pointer rests between the takes, relative to the widget: right of CopyStatus.
const rest = {x: 330, y: 330}

/** Zooms in twice, to 74 % at this width, and drags the canvas until BookCopy and CopyStatus fill the close-up; the view is not saved. */
async function closeUp({mouse, locate, widget, t}) {
  const zoomIn = await locate(`element => element.localName === "sl-icon-button" && element.getAttribute("label") === ${JSON.stringify(t("Zoom In"))}`)
  for(let step = 0; step < 2; step++) { await mouse.clickAt(zoomIn); await sleep(500) }
  const scene = await locate(`element => element.localName === "ww-scene"`)
  const book = await locate(umlClass("Book")), copy = await locate(umlClass("BookCopy"))
  // An empty spot between the columns of classes, low on the canvas, moves the view rather than a class.
  const from = {x: (book.left + book.width + copy.left) / 2, y: scene.top + scene.height - 40}
  await mouse.place(from.x, from.y)
  await mouse.down()
  await mouse.move(from.x + widget.x + corner.x - copy.left, from.y + widget.y + corner.y - copy.top, 500)
  await mouse.up()
  await sleep(400)
  await mouse.blur()
}

export default {
  package: "@webwriter/uml-diagram", version: "2.0.1", snippet: "snippets/library-loan.html", tag: "webwriter-uml-diagram",
  // Below about 590 px the canvas squeezes its hint into a narrow column; the close-up shows 400 px of the widget.
  width: 665, height: 800, style: "webwriter-uml-diagram {height: 440px}",
  // Slightly more than 400 px, so that the toolbar keeps a margin above it: about 98 %.
  crop: widget => ({x: widget.x + view.x - 188, y: widget.y + view.y - 188, width: 376, height: 376}),
  prepareEdit: closeUp,
  async edit({at, mouse, locate, widget, t}) {
    const relation = await locate(`element => element.localName === "sl-button" && element.textContent.trim() === ${JSON.stringify(t("Relation"))}`)
    await mouse.place(widget.x + rest.x, widget.y + rest.y - 80)
    await at(350); await mouse.move(relation.x, relation.y, 500)
    await at(900); await mouse.click()
    const association = await locate(`element => element.localName === "sl-menu-item" && element.textContent.trim().startsWith(${JSON.stringify(t("Association (Directed)"))})`)
    await at(1150); await mouse.move(association.x - 40, association.y, 400)
    await at(1600); await mouse.click()
    // On the headers beside the names, which stay readable, and above the hint at the canvas's bottom edge.
    const copy = await locate(umlClass("BookCopy")), status = await locate(umlClass("CopyStatus"))
    await at(1850); await mouse.move(copy.x + 60, copy.top + 14, 450)
    await at(2400); await mouse.click()
    await at(2600); await mouse.move(status.left + 100, status.top + 14, 450)
    await at(3150); await mouse.click()
    await at(3400); await mouse.move(widget.x + rest.x, widget.y + rest.y, 450)
  },
  prepareUse: closeUp,
  async use({at, mouse, locate, widget}) {
    const status = await locate(umlClass("CopyStatus"))
    const grip = {x: status.left + 100, y: status.top + 14}
    await mouse.place(widget.x + rest.x, widget.y + rest.y)
    await at(500); await mouse.move(grip.x, grip.y, 450)
    await at(1100); await mouse.down()
    await mouse.move(grip.x + 130, grip.y - 10, 1100)
    await at(2350); await mouse.up()
    await at(2550); await mouse.move(grip.x + 115, grip.y - 50, 500)
  },
}
