/** Edit: plug the zinc electrode's lead into the voltmeter. Use: switch the voltmeter on and read the cell voltage of the Daniell cell. */
// The experiment is drawn on a canvas; after "Fit all objects" its parts sit at fixed points of the 361 × 360 px widget.
const relative = (widget, x, y) => ({x: widget.x + x, y: widget.y + y})
const jack = [195, 107], unplugged = [285, 85], voltmeter = [180, 35], rest = [312, 160]
const power = `element => element.id === "activateEComp"`
// The package has no XLIFF for the runner to translate labels with; "Fit all objects" is the button before full screen.
const fit = `element => element.localName === "sl-button" && element.nextElementSibling?.id === "buttonFullscreen"`

export default {
  package: "@webwriter/chemlab", version: "2.0.0", snippet: "snippets/Beispiel-Batterie.html", tag: "webwriter-chemlab",
  // The widget takes the column width; a 360 px canvas keeps the cell square and lets "Fit all objects" zoom to about 100 %.
  width: 425, height: 720, style: "webwriter-chemlab {height: 360px}",
  async prepareEdit({mouse, locate, widget}) {
    await mouse.clickAt(await locate(fit))
    await new Promise(resolve => setTimeout(resolve, 1200))
    // Start with the lead pulled out of the voltmeter's second jack, hanging beside it.
    const from = relative(widget, ...jack), to = relative(widget, ...unplugged)
    await mouse.move(from.x, from.y, 300)
    await mouse.down()
    await mouse.move(to.x, to.y, 500)
    await mouse.up()
    // The widget stays selected: a click into the empty document would show the editor's caret beside it instead.
    await new Promise(resolve => setTimeout(resolve, 800))
  },
  async edit({at, mouse, widget}) {
    const plug = relative(widget, ...unplugged), socket = relative(widget, ...jack), end = relative(widget, ...rest)
    await mouse.place(end.x - 10, end.y + 90)
    await at(400); await mouse.move(plug.x, plug.y, 650)
    await at(1150); await mouse.down()
    // The jack lights up as the plug comes near and takes it on release.
    await mouse.move(socket.x, socket.y, 1150, t => [0, -Math.sin(Math.PI * t) * 14])
    await at(2450); await mouse.up()
    await at(2700); await mouse.move(end.x, end.y, 650)
  },
  async prepareUse({mouse, locate}) {
    await mouse.clickAt(await locate(fit))
    await new Promise(resolve => setTimeout(resolve, 1200))
    await mouse.blur()
  },
  async use({at, mouse, locate, widget}) {
    const meter = relative(widget, ...voltmeter), end = relative(widget, ...rest)
    await mouse.place(end.x, end.y)
    await at(550); await mouse.move(meter.x, meter.y, 550)
    await at(1150); await mouse.click()
    const on = await locate(power)
    await at(1550); await mouse.move(on.x, on.y, 450)
    await at(2100); await mouse.click()
    await at(2450); await mouse.move(end.x, end.y, 650)
  },
}
