/** Edit: wire input A's splitter to the AND gate, completing the half adder. Use: switch on both inputs, which lights the carry through the new wire. */
const port = (gate, name) => `element => element.dataset?.wwPort === ${JSON.stringify(name)} && element.closest("ww-node")?.dataset.wwKey === ${JSON.stringify(gate)}`
const input = gate => `element => element.localName === "button" && element.classList.contains("gatepointer") && element.closest("ww-node")?.dataset.wwKey === ${JSON.stringify(gate)}`
const fitButton = `element => element.localName === "button" && element.closest("[data-ww-viewport-controls]") && element.textContent.trim() === ""`
// Where the pointer rests between the takes, relative to the widget.
const rest = {x: 250, y: 450}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** Fits the circuit into the board, which the view does not save, and waits until the view stops moving. */
async function fit({mouse, locate}) {
  await mouse.clickAt(await locate(fitButton))
  let last = ""
  for(let check = 0; check < 20; check++) {
    await sleep(250)
    const {x, y} = await locate(port("andGate1", "In1"))
    const position = `${Math.round(x)},${Math.round(y)}`
    if(position === last) return
    last = position
  }
}

export default {
  package: "@webwriter/logic-circuit", version: "2.0.0", snippet: "snippets/halfadder.html", tag: "webwriter-logic-circuit",
  // A 390 px widget fits the 400 px crop at 1:1; its fitted circuit renders at about 64 %.
  width: 455, height: 840,
  // The board with its toolbar, below the gate palette, which the takes do not use.
  crop: widget => ({x: widget.x + widget.width / 2 - 183, y: widget.y + 338 - 183, width: 366, height: 366}),
  async prepareEdit({mouse, locate, keyboard, evaluate}) {
    await fit({mouse, locate})
    // The take draws this wire again: select it on its last segment and delete it.
    const wire = "splitterGate4Out3|andGate1In1"
    const selected = () => evaluate(`[...document.querySelector("webwriter-logic-circuit").selection].join()`)
    for(let attempt = 0; attempt < 3 && await selected() !== wire; attempt++) {
      const target = await locate(port("andGate1", "In1"))
      await mouse.clickAt({x: target.x - 22, y: target.y})
      await sleep(400)
    }
    if(await selected() !== wire) throw new Error("Cannot select the wire to the AND gate")
    await keyboard.press("Delete")
    await sleep(400)
    const wires = await evaluate(`JSON.parse(document.querySelector("webwriter-logic-circuit script[slot=data]").textContent).connections.join()`)
    if(wires.includes(wire)) throw new Error("The wire to the AND gate was not deleted")
    await mouse.blur()
  },
  async edit({at, mouse, locate, widget}) {
    const from = await locate(port("splitterGate4", "Out3")), to = await locate(port("andGate1", "In1"))
    await mouse.place(widget.x + 330, widget.y + 300)
    await at(350); await mouse.move(from.x, from.y, 650)
    await at(1150); await mouse.down()
    await mouse.move(to.x, to.y, 1250, t => [Math.sin(Math.PI * t) * 18, 0])
    await at(2550); await mouse.up()
    await at(2750); await mouse.move(widget.x + rest.x, widget.y + rest.y, 500)
  },
  async prepareUse({mouse, locate}) {
    await fit({mouse, locate})
    await mouse.blur()
  },
  async use({at, mouse, locate, widget}) {
    const a = await locate(input("inputGate2")), b = await locate(input("inputGate3"))
    await mouse.place(widget.x + rest.x, widget.y + rest.y)
    await at(450); await mouse.move(a.x, a.y, 550)
    await at(1050); await mouse.click()
    await at(1600); await mouse.move(b.x, b.y, 400)
    await at(2050); await mouse.click()
    await at(2400); await mouse.move(widget.x + rest.x - 40, widget.y + rest.y, 600)
  },
}
