/** Edit: add two neurons to the second hidden layer. Use: train the network for an epoch, which colors its weights. */
// Controls are named by structure where the widget allows it, and otherwise by their translated labels (`t`).
const neuron = id => `element => element.localName === "ww-node" && element.dataset.wwKey === ${JSON.stringify(id)}`
const tooltipButton = label => `element => element.localName === "sl-button" && element.closest("sl-tooltip")?.content === ${JSON.stringify(label)}`
const tab = name => `element => element.localName === "c-tab" && element.getAttribute("name") === ${JSON.stringify(name)}`
const addNeuron = label => `element => element.localName === "sl-button" && element.textContent.trim() === ${JSON.stringify(label)} && element.getRootNode().host?.localName === "layer-neurons-card"`
const train = `element => element.localName === "sl-button" && element.getAttribute("variant") === "primary" && element.getRootNode().host?.localName === "training-train-card"`
const epochs = `element => element.localName === "input" && element.type === "range" && element.getRootNode().host?.id === "numberOfEpochsRange"`
const discard = `element => element.localName === "sl-button" && element.getRootNode().host?.localName === "core-model-features-unavailable-card"`
/** Where the pointer rests between the takes, relative to the widget: the empty canvas left of the output layer. */
const rest = widget => ({x: widget.x + widget.width * .1, y: widget.y + widget.height * .1})
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Pans the canvas up and left, so the output layer and the whole edited layer show above the open panel and beside the zoom buttons. */
async function pan({mouse, widget}) {
  await mouse.place(widget.x + 90, widget.y + 70)
  await mouse.down()
  await mouse.move(widget.x + 40, widget.y + 15, 400)
  await mouse.up()
  await pause(500)
}

/** Scrolls the open panel until the control sits just above the widget's lower edge. */
async function reveal({mouse, locate, widget}, predicate) {
  const control = await locate(predicate)
  await mouse.place(widget.x + widget.width / 2, widget.y + widget.height - 40)
  await mouse.wheel(0, control.y - (widget.y + widget.height - 50))
  await pause(600)
}

/** Selects the edited layer on its body between two neurons, which opens the layer panel. */
async function selectLayer({mouse, locate}) {
  const left = await locate(neuron("neuron-4n4")), right = await locate(neuron("neuron-4n5"))
  await mouse.clickAt({x: (left.x + right.x) / 2, y: left.y})
  await pause(800)
}

/** Opens the training panel with its button in view, set to one epoch, which finishes within the take. */
async function openTraining(take) {
  const {mouse, locate} = take
  await mouse.clickAt(await locate(tab("train")))
  await pause(600)
  await reveal(take, train)
  const range = await locate(epochs)
  await mouse.clickAt({x: range.left + 2, y: range.y})
  await pause(400)
}

export default {
  package: "@webwriter/neural-network", version: "2.0.0", snippet: "snippets/Pima-Indians-Diabetes.html", tag: "webwriter-neural-network",
  // The snippet authors 800×600 px; a square widget stacks the canvas over the panels, and the crop scales it to about 85 %.
  width: 495, height: 760, style: "webwriter-neural-network {height: 430px !important; min-height: 0 !important}",
  async prepareEdit(take) {
    await selectLayer(take)
    await pan(take)
    await reveal(take, addNeuron(take.t("Add")))
    await take.mouse.blur()
  },
  async edit({at, mouse, locate, widget, t}) {
    // The neuron field's Update does not submit in this version, so the author adds the neurons one by one.
    const add = await locate(addNeuron(t("Add")))
    const {x, y} = rest(widget)
    await mouse.place(widget.x + widget.width * .6, widget.y + widget.height * .97)
    await at(450); await mouse.move(add.x, add.y, 600)
    await at(1100); await mouse.click()
    await at(1750); await mouse.click()
    await at(2300); await mouse.move(x, y, 700)
  },
  async prepareUse(take) {
    const {mouse, locate} = take
    await mouse.clickAt(await locate(tooltipButton(take.t("Toggle Menu"))))
    await pause(600)
    await pan(take)
    // A first training compiles the graphics shaders, which would stall the take; discarding the model restores the
    // untrained network. The layer panel offers the discard button.
    await openTraining(take)
    await mouse.clickAt(await locate(train))
    await locate(tab("predict"), 120_000)
    await selectLayer(take)
    await locate(discard, 10_000)
    await reveal(take, discard)
    await mouse.clickAt(await locate(discard))
    await pause(800)
    await openTraining(take)
    await mouse.blur()
  },
  async use({at, mouse, locate, widget}) {
    const button = await locate(train)
    const {x, y} = rest(widget)
    await mouse.place(x, y)
    await at(500); await mouse.move(button.x, button.y, 550)
    await at(1100); await mouse.click()
    await at(1500); await mouse.move(x, y, 700)
  },
}
