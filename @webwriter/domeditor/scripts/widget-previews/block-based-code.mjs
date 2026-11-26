/** Edit: drag a "rotate by" block into the forever loop and set 30 degrees. Use: start the program and watch the bear spin. */
const ownText = `element => [...element.querySelectorAll("text")].filter(text => text.closest("g[data-id]") === element).map(text => text.textContent).join(" ").replace(/\\s+/g, " ")`
/** The own outline of a block, without the blocks nested in it. */
const block = (area, test) => `element => element.localName === "path" && element.classList.contains("blocklyPath") && !!element.parentElement?.matches("${area} g.blocklyDraggable[data-id]") && (${test})((${ownText})(element.parentElement))`
/** The number of the placed "rotate by" block, which sits in a shadow block nested in it. */
const rotateDegrees = rotate => `element => element.localName === "text" && element.textContent.trim() === "0" && !!element.closest(".blocklyBlockCanvas") && (block => !!block && (${ownText})(block).includes(${JSON.stringify(rotate)}))(element.closest("g[data-id]")?.parentElement?.closest("g[data-id]"))`
/** A block's own words in the recording's language: the text of its message up to the first input. */
const words = (t, message) => t(message).split("%1")[0].trim()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** The editor take frames the program, the preview take the end of the program above the stage. */
let crops = 0
/** Where the edit take leaves the pointer, relative to the crop, so the use take continues there. */
let handoff

/** Drags the empty workspace by `dy` pixels, next to a block that has room on its right. */
async function panWorkspace({mouse, locate}, beside, dy) {
  const anchor = await locate(block(".blocklyBlockCanvas", `text => text.includes(${JSON.stringify(beside)})`))
  const from = {x: anchor.left + anchor.width + 40, y: anchor.y}
  await mouse.move(from.x, from.y, 200)
  await mouse.down()
  await mouse.move(from.x, from.y + Math.sign(dy) * 12, 80)
  await mouse.move(from.x, from.y + dy, 300)
  await mouse.up()
  await sleep(400)
}

export default {
  package: "@webwriter/block-based-code", version: "2.0.0", snippet: "snippets/dvd.html", tag: "webwriter-block-based-code",
  // Below 560 px the program and the stage are stacked; the tall viewport keeps the stage of the preview in view.
  width: 430, height: 980, settle: 2500,
  crop: widget => crops++ === 0
    ? {x: widget.x, y: widget.y + 6, width: widget.width, height: 365}
    : {x: widget.x, y: widget.y + 344, width: widget.width, height: 368},
  async prepareEdit(take) {
    // Bring the forever loop up so the inserted block stays in view.
    await panWorkspace(take, "ySpeed", -100)
    // Rest on empty workspace, clear of the zoom buttons and their tooltips.
    await take.mouse.move(take.clip.x + take.clip.width * .8, take.clip.y + take.clip.height * .4, 200)
    await sleep(600)
  },
  async edit({at, mouse, keyboard, locate, clip, t}) {
    const rotateBy = words(t, "rotate by %1 degrees")
    const motions = await locate(`element => element.childElementCount === 0 && element.textContent.trim() === ${JSON.stringify(t("Motions"))}`)
    await at(450); await mouse.move(motions.x, motions.y, 450)
    await at(950); await mouse.click()
    await at(1200)
    const rotate = await locate(block(".blocklyFlyout", `text => text.includes(${JSON.stringify(rotateBy)})`))
    const forever = await locate(block(".blocklyBlockCanvas", `text => text.trim() === ${JSON.stringify(t("forever"))}`))
    await mouse.move(rotate.left + 12, rotate.top + 12, 350)
    await at(1600); await mouse.down()
    await mouse.move(rotate.left + 30, rotate.top + 20, 100)
    // Into the loop's first statement slot, above "set x … and y …".
    await mouse.move(forever.left + 28, forever.top + 52, 650, t => [0, -Math.sin(Math.PI * t) * 20])
    await at(2500); await mouse.up()
    await at(2700)
    const degrees = await locate(rotateDegrees(rotateBy))
    await mouse.move(degrees.x, degrees.y, 350)
    await at(3150); await mouse.click()
    await at(3300); await keyboard.type("30", 130)
    await at(3650); await keyboard.press("Enter")
    await at(3850); await mouse.move(clip.x + clip.width * .8, degrees.y + 70, 500)
    handoff = {x: mouse.position.x - clip.x, y: mouse.position.y - clip.y}
  },
  async prepareUse(take) {
    const {locate, clip, t} = take
    // Show the new block in the strip of the program above the stage.
    const rotate = await locate(block(".blocklyBlockCanvas", `text => text.includes(${JSON.stringify(words(t, "rotate by %1 degrees"))})`))
    await panWorkspace(take, "ySpeed", Math.round(clip.y + 14 - rotate.top))
  },
  async use({at, mouse, locate, clip, t}) {
    await mouse.place(clip.x + handoff.x, clip.y + handoff.y)
    const start = await locate(`element => element.localName === "webwriter-blocks-toolbar-button" && element.getAttribute("label") === ${JSON.stringify(t("Start Execution"))}`)
    await at(600); await mouse.move(start.x, start.y, 500)
    await at(1150); await mouse.click()
    // Leave the button so its tooltip closes while the program runs.
    await at(1350); await mouse.move(clip.x + clip.width * .82, clip.y + clip.height * .9, 600)
  },
}
