/** Edit: drag a hotspot onto the map. Use: run the outbreak and watch the infection spread from the crowd at the hotspot. */
const token = `element => element.localName === "sl-button" && element.classList.contains("hotspot-toolbox__token")`
const canvas = `element => element.id === "simulation-canvas"`
const hotspotsSwitch = label => `element => element.localName === "sl-switch" && element.closest(".side-menu__title-row")?.textContent.includes(${JSON.stringify(label)})`
/** The map's buttons by their label in the recording's language. */
const action = label => `element => element.localName === "button" && element.getAttribute("aria-label") === ${JSON.stringify(label)}`
const mapCard = `element => element.localName === "sl-card" && element.getAttribute("part") === "map"`
const menu = `element => element.classList.contains("side-panel")`
/** Where the edit take leaves the pointer: in the gap between the map card and the menu, whose height depends on the language. */
const rest = async locate => {
  const card = await locate(mapCard), panel = await locate(menu)
  return {x: card.x, y: (card.top + card.height + panel.top) / 2}
}
/** The runner's blur clicks below the crop, where this widget keeps its sliders; the margin beside the widget is safe. */
const blur = async ({mouse, widget}) => { await mouse.clickAt({x: widget.x - 16, y: widget.y + 300}); await new Promise(resolve => setTimeout(resolve, 600)) }
const playLabel = `document.querySelector("webwriter-epidemic-sim").shadowRoot.querySelector(".simulation-actions__icon-button--play-pause").getAttribute("aria-label")`

export default ({lang}) => ({
  package: "@webwriter/epidemic-sim", version: "2.0.1", snippet: "snippets/corona-verlauf.html", tag: "webwriter-epidemic-sim",
  // The snippet's German introduction stays out of view; the widget stacks curves, map and controls at this width.
  width: 425, height: 1000, style: "body > :not(webwriter-epidemic-sim) {display: none}",
  // The square starts just above the map card, below the 246 px curves card and its 12 px gap, and ends in the menu's first section.
  // The German hint wraps below the hotspot, so the square starts 18 px higher and ends above the menu's first heading.
  crop: widget => ({x: widget.x, y: widget.y + (lang === "de" ? 234 : 252) + 200 - 180.5, width: 361, height: 361}),
  async prepareEdit(take) {
    // Learners and authors switch hotspots on in the widget's own menu; the switch sits below the crop.
    const {t} = take
    await take.mouse.clickAt(await take.locate(hotspotsSwitch(t("Hotspots"))))
    // A paused crowd keeps the placement easy to follow.
    if(await take.evaluate(playLabel) === t("Pause")) await take.mouse.clickAt(await take.locate(action(t("Pause"))))
    await blur(take)
  },
  async edit({at, mouse, keyboard, locate}) {
    const chip = await locate(token), map = await locate(canvas), {x, y} = await rest(locate)
    await mouse.place(map.left + map.width * .85, y)
    await at(400); await mouse.move(chip.x, chip.y, 650)
    await at(1150); await mouse.down()
    await mouse.move(map.left + map.width * .62, map.top + map.height * .42, 1100, t => [0, -Math.sin(Math.PI * t) * 30])
    await at(2450); await mouse.up()
    // Escape ends placing, so the toolbox shows its resting hint again.
    await at(2650); await keyboard.press("Escape")
    await at(2750); await mouse.move(x, y, 650)
  },
  async prepareUse(take) {
    // Restart the outbreak and pause it after a few days, so the learner's run shows it spreading around the hotspot.
    const {t} = take
    await take.mouse.clickAt(await take.locate(action(t("Reset simulation"))))
    if(await take.evaluate(playLabel) === t("Start")) await take.mouse.clickAt(await take.locate(action(t("Start"))))
    await new Promise(resolve => setTimeout(resolve, 3500))
    await take.mouse.clickAt(await take.locate(action(t("Pause"))))
    await blur(take)
  },
  async use({at, mouse, locate, t}) {
    const start = await locate(action(t("Start"))), {x, y} = await rest(locate)
    await mouse.place(x, y)
    await at(550); await mouse.move(start.x, start.y, 550)
    await at(1200); await mouse.click()
    await at(1500); await mouse.move(x - 40, y + 20, 600)
  },
})
