/** Edit: type a new template strand and watch the double strand build. Use: place helicase at the fork and watch it unzip the DNA. */
const tab = label => `element => element.localName === "button" && element.classList.contains("nav-tab") && element.textContent.trim() === ${JSON.stringify(label)}`
// Shoelace labels the clear button in the document's language; its part name stays the same.
const clearStrand = `element => element.localName === "button" && element.getAttribute("part") === "clear-button"`
const helicase = name => `element => element.classList.contains("baukasten-chip") && element.title === ${JSON.stringify(name)}`
const toolkit = `element => element.classList.contains("baukasten-toolbar")`
/** Where the edit take leaves the pointer, relative to the widget, so the use take can continue there. */
const rest = widget => ({x: widget.x + widget.width * .62, y: widget.y + widget.height * .89})

export default {
  package: "@webwriter/dna-sim", version: "2.0.0", snippet: "snippets/dna-simulation.html", tag: "webwriter-dna-simulation",
  // The widget is at least 400 px tall; at this width it is square and a short strand fits without panning.
  width: 459, height: 720,
  // A slightly tighter margin than the default keeps the 400 px widget close to its page size.
  crop: widget => ({x: widget.x + widget.width / 2 - 192, y: widget.y + widget.height / 2 - 192, width: 384, height: 384}),
  async edit({at, mouse, keyboard, locate, widget, t}) {
    const start = rest(widget), sequence = await locate(tab(t("Sequence")))
    await mouse.place(start.x, start.y)
    await at(350); await mouse.move(sequence.x, sequence.y, 550)
    await at(950); await mouse.click()
    const clear = await locate(clearStrand)
    await at(1250); await mouse.move(clear.x, clear.y, 450)
    await at(1750); await mouse.click()
    // Each base the author types adds a base pair to the strand; five fit beside the enzyme slot.
    await at(2000); await keyboard.type("TACGG", 180)
    await at(3200); await mouse.move(start.x, start.y, 650)
  },
  async prepareUse({mouse, locate, t}) {
    await mouse.clickAt(await locate(tab(t("Toolkit"))))
    // The toolkit shuffles its molecules into a narrow strip; scroll helicase into view, as a learner would.
    const strip = await locate(toolkit), chip = await locate(helicase(t("Helicase")))
    await mouse.place(strip.x, strip.y)
    await mouse.wheel(chip.x - strip.x, 0)
    await new Promise(resolve => setTimeout(resolve, 800))
    await mouse.blur()
  },
  async use({at, mouse, locate, widget, t}) {
    const start = rest(widget), chip = await locate(helicase(t("Helicase")))
    await mouse.place(start.x, start.y)
    await at(550); await mouse.move(chip.x, chip.y - 6, 500)
    await at(1100); await mouse.click()
    await at(1450); await mouse.move(start.x, start.y, 700)
  },
}
