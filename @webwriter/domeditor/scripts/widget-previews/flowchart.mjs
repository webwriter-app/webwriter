/** Edit: fill the condition's blank with "x > 0". Use: complete the Then branch with "print x". */
// What each take types into a blank, by language; the snippet's German reads "Ist ___ wahr?" and "Dann ___".
// "Dann zeige x" is as long as "Then print x", so the step does not grow into the Else step beside it.
const typed = {en: {condition: "x > 0", then: "print x"}, de: {condition: "x > 0", then: "zeige x"}}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const canvas = `element => element.localName === "canvas" && element.getRootNode().host?.localName === "webwriter-flowchart"`
const promptInput = `element => element.localName === "input" && element.getRootNode().host?.id === "text-prompt-input"`
// The centers of the condition and the Then step in chart coordinates, as the chart draws them.
const condition = {x: 493, y: 201}, then = {x: 493, y: 332}
// Where the pointer rests between the takes, relative to the widget: right of the condition.
const rest = {x: 290, y: 235}

/** The page position of a point of the chart. */
async function chartPoint({locate, evaluate}, point) {
  const box = await locate(canvas)
  const {zoom, x, y} = await evaluate(`(({zoomLevel, canvasOffsetX, canvasOffsetY}) => ({zoom: zoomLevel, x: canvasOffsetX, y: canvasOffsetY}))(document.querySelector("webwriter-flowchart"))`)
  return {x: box.left + (point.x + x) * zoom / 100, y: box.top + (point.y + y) * zoom / 100}
}

/** The page position of the blank "___" in the open text prompt. */
async function blank({locate, evaluate}) {
  const input = await locate(promptInput)
  const offset = await evaluate(`(() => {
    const input = document.querySelector("webwriter-flowchart").shadowRoot.getElementById("text-prompt-input").shadowRoot.querySelector("input")
    const style = getComputedStyle(input), context = document.createElement("canvas").getContext("2d")
    context.font = style.font
    const before = input.value.slice(0, input.value.indexOf("___"))
    return parseFloat(style.paddingLeft) + context.measureText(before).width + context.measureText("___").width / 2
  })()`)
  return {x: input.left + offset, y: input.y}
}

/** Hides the node palette, which covers the lower part of the chart, and fits the chart into the canvas. */
async function fit({mouse, keyboard, locate}) {
  await mouse.clickAt(await locate(`element => element.localName === "button" && element.classList.contains("flowchart-menu-handle")`))
  await sleep(500)
  const box = await locate(canvas)
  await mouse.clickAt({x: box.left + 30, y: box.top + 70})
  await keyboard.press("0")
  await sleep(500)
  await mouse.blur()
}

/** Double-clicks a step, selects its blank and types the text that replaces it. */
async function fill(take, step, text, start) {
  const {at, mouse, keyboard} = take
  const target = await chartPoint(take, step)
  await at(start); await mouse.move(target.x, target.y, 550)
  await at(start + 650); await mouse.doubleClick()
  await sleep(450)
  const gap = await blank(take)
  await mouse.move(gap.x, gap.y, 350)
  await at(start + 1600); await mouse.doubleClick()
  // Out of the way of the text that replaces the blank.
  await mouse.move(gap.x + 16, gap.y + 34, 200)
  await at(start + 1850); await keyboard.type(text, 90)
  await at(start + 2450); await keyboard.press("Enter")
}

export default ({lang}) => ({
  package: "@webwriter/flowchart", version: "3.0.1", snippet: "snippets/If-Else.html", tag: "webwriter-flowchart",
  width: 445, height: 760,
  // The canvas fills the crop; the resize handle below it stays out.
  crop: widget => ({x: widget.x + widget.width / 2 - 183, y: widget.y + 201 - 183, width: 366, height: 366}),
  prepareEdit: fit,
  async edit(take) {
    const {at, mouse, widget} = take
    await mouse.place(widget.x + 300, widget.y + 120)
    await fill(take, condition, (typed[lang] ?? typed.en).condition, 300)
    await at(2950); await mouse.move(widget.x + rest.x, widget.y + rest.y, 500)
  },
  prepareUse: fit,
  async use(take) {
    const {at, mouse, widget} = take
    await mouse.place(widget.x + rest.x, widget.y + rest.y)
    await fill(take, then, (typed[lang] ?? typed.en).then, 450)
    await at(3150); await mouse.move(widget.x + rest.x + 20, widget.y + rest.y + 110, 500)
  },
})
