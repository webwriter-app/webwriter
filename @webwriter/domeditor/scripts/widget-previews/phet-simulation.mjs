/** Edit: put a proton into the nucleus, which makes a hydrogen ion. Use: add an electron, which makes the atom neutral. */
// The simulation runs in a sandboxed frame, so its parts are addressed relative to the widget at this size.
const at600x384 = (widget, x, y) => ({x: widget.x + x, y: widget.y + y})
const atomScreen = [158, 187], proton = [67, 297], nucleus = [182, 158], electron = [271, 297], shell = [236, 112], rest = [338, 205]

export default {
  package: "@webwriter/phet-simulation", version: "2.1.0", snippet: "snippets/build-an-atom.html", tag: "webwriter-phet-simulation",
  script: "widgets/webwriter-phet-simulation.js",
  // At 600 px the simulation's labels stay legible; the square shows the atom and the particle buckets.
  width: 680, height: 720, style: "webwriter-phet-simulation {width: 600px; height: 384px}",
  // The simulation loads in its own frame after the widget renders.
  settle: 9000,
  crop: widget => ({x: widget.x + 170 - 184, y: widget.y + widget.height / 2 - 184, width: 368, height: 368}),
  async prepareEdit({mouse, widget}) {
    // Open the Atom screen from the simulation's home screen; the checkpoint remembers it for the reader.
    // The widget stays selected: a click into the empty document would show the editor's caret beside it instead.
    await mouse.clickAt(at600x384(widget, ...atomScreen))
    await new Promise(resolve => setTimeout(resolve, 3500))
  },
  async edit({at, mouse, widget}) {
    const point = (x, y) => at600x384(widget, x, y)
    const from = point(...proton), to = point(...nucleus), end = point(...rest)
    await mouse.place(end.x - 20, end.y + 60)
    await at(400); await mouse.move(from.x, from.y, 650)
    await at(1150); await mouse.down()
    await mouse.move(to.x, to.y, 1000, t => [Math.sin(Math.PI * t) * -18, 0])
    await at(2300); await mouse.up()
    await at(2600); await mouse.move(end.x, end.y, 650)
  },
  async use({at, mouse, widget}) {
    const point = (x, y) => at600x384(widget, x, y)
    const from = point(...electron), to = point(...shell), end = point(...rest)
    await mouse.place(end.x, end.y)
    await at(600); await mouse.move(from.x, from.y, 600)
    await at(1300); await mouse.down()
    await mouse.move(to.x, to.y, 900, t => [Math.sin(Math.PI * t) * 16, 0])
    await at(2350); await mouse.up()
    await at(2650); await mouse.move(end.x, end.y, 650)
  },
}
