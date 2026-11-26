/** Edit: raise the convolution's number of kernels in the model designer. Use: draw a digit in the prediction widget, whose trained model reads it. */
const field = label => `element => element.localName === "sl-input" && element.label === ${JSON.stringify(label)}`
const drawing = `element => element.localName === "canvas" && element.getRootNode().host?.localName === "drawing-canvas"`
/** Where the pointer rests between the takes, relative to the crop, so it stays put across the wipe. */
const rest = clip => ({x: clip.x + clip.width * .12, y: clip.y + clip.height * .8})

export default {
  package: "@webwriter/deep-learning-model", version: "2.0.0", snippet: "snippets/MNIST.html",
  // The snippet chains five widgets; the editor take frames the designer and the preview take the prediction widget.
  tag: kind => kind === "editor" ? "webwriter-model-designing" : "webwriter-model-prediction",
  // The document column is about 400 px wide: the designer fills it, and the prediction widget keeps 371 px.
  width: 465, height: 800,
  // Only the two framed widgets show, each in its own take: installed widgets carry contenteditable in the editor only.
  // The designer's height ends below its parameter count, so the page cannot scroll when a field takes focus, and its
  // width shows the input and convolution layers side by side without panning: a pan is view state that can reset
  // while the take waits for the recording lock.
  // The prediction widget sets the drawing beside the predicted classes instead of stacking them at this width.
  style: `body > :not(webwriter-model-designing, webwriter-model-prediction) {display: none !important}
    webwriter-model-prediction[contenteditable], webwriter-model-designing:not([contenteditable]) {display: none !important}
    webwriter-model-designing {width: 400px; height: 425px; overflow: hidden}
    webwriter-model-prediction {width: 371px}
    webwriter-model-prediction::part(inputs) {flex: 0 0 auto; min-width: 0; max-width: none}
    webwriter-model-prediction::part(outputs) {min-width: 0}`,
  // The editor waits for the designer's fields, the preview for the predicted classes.
  ready: `(() => {
    const designer = document.querySelector("webwriter-model-designing")
    return designer?.hasAttribute("contenteditable") ? !!designer.shadowRoot?.querySelector("model-editor")?.shadowRoot?.querySelector("sl-input") : !!document.querySelector("webwriter-model-prediction")?.shadowRoot?.querySelector("#outputs")
  })()`,
  settle: 2500,
  // The designer's input and convolution layers with the parameter count below its zoom buttons, or the drawing with the
  // predicted classes below the model select. Regions of 366 px keep the 400 px crop at 1:1.
  crop: widget => widget.height < 430 ? {x: widget.x + 12, y: widget.y + 90, width: 366, height: 312} : {x: widget.x + widget.width / 2 - 183, y: widget.y + 140, width: 366, height: 347},
  async prepareEdit({mouse}) {
    await mouse.blur()
  },
  async edit({at, mouse, keyboard, locate, clip, t}) {
    const kernels = await locate(field(t("# of Kernels")))
    await mouse.place(clip.x + clip.width * .85, clip.y + clip.height * .75)
    await at(450); await mouse.move(kernels.left + 22, kernels.y + 12, 600)
    await at(1100); await mouse.click()
    for(const time of [1500, 1850, 2200, 2550]) { await at(time); await keyboard.press("ArrowUp") }
    await at(2900); await keyboard.press("Enter")
    const {x, y} = rest(clip)
    await at(3200); await mouse.move(x, y, 600)
  },
  async prepareUse({mouse}) {
    await mouse.blur()
  },
  async use({at, mouse, locate, button: named, clip}) {
    const button = await named("Clear"), canvas = await locate(drawing)
    const start = rest(clip)
    await mouse.place(start.x, start.y)
    await at(500); await mouse.move(button.x, button.y, 550)
    await at(1100); await mouse.click()
    // A three: an upper and a lower bow, drawn in one stroke.
    const point = t => {
      const [cx, cy, rx, ry, a] = t < .5 ? [.5, .32, .2, .15, -Math.PI * .8 + t / .5 * Math.PI * 1.3] : [.5, .64, .22, .17, -Math.PI * .5 + (t - .5) / .5 * Math.PI * 1.3]
      return {x: canvas.left + (cx + rx * Math.cos(a)) * canvas.width, y: canvas.top + (cy + ry * Math.sin(a)) * canvas.height}
    }
    const first = point(0)
    await at(1300); await mouse.move(first.x, first.y, 400)
    await at(1750); await mouse.down()
    const begin = performance.now()
    for(let t = 0; t < 1;) {
      t = Math.min(1, (performance.now() - begin) / 1500)
      const {x, y} = point(t)
      await mouse.move(x, y, 16)
    }
    await mouse.up()
    await at(3400); await mouse.move(canvas.left + canvas.width * .3, canvas.top + canvas.height + 24, 600)
  },
}
