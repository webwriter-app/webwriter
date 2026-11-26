/** Edit: create a new simulation with more berry bushes. Use: run the island at full speed and watch the creatures forage. */
const control = label => `element => element.localName === "sl-button" && element.textContent.trim() === ${JSON.stringify(label)}`
const input = label => `element => element.localName === "sl-input" && element.label === ${JSON.stringify(label)}`
/** Where the edit take leaves the pointer, relative to the widget, so the use take can continue there. */
const rest = widget => ({x: widget.x + widget.width * .7, y: widget.y + widget.height * .62})

/**
 * The 401 px widget and the "New" dialog in each language. A viewport of at most 600 px keeps the editor's compact toolbar,
 * so the dialog, which grows with the viewport, fits over the widget. In the editor, which sits higher, the square ends below
 * the dialog's buttons; in the preview it ends at the viewport.
 */
const layouts = {
  // The controls keep one row, even while running, and the widget fills the square at 99 %.
  en: {height: 500, crop: widget => ({x: widget.x + widget.width / 2 - 186, y: widget.y + (widget.y < 90 ? 14.5 : -2.5), width: 372, height: 372})},
  // Longer labels wrap the controls into two rows; the 420 px widget is shown whole at 88 %, so the viewport grows with it.
  de: {height: 552, crop: widget => ({x: widget.x, y: widget.y + (widget.y < 90 ? 16.75 : -1.5), width: widget.width, height: widget.height})},
}

export default ({lang}) => ({
  package: "@webwriter/evolution-sim", version: "2.0.0", snippet: "snippets/island-evolution.html", tag: "webwriter-evolution-sim",
  // The snippet's introduction and quiz stay out of view.
  width: 465, height: (layouts[lang] ?? layouts.en).height, style: "body > :not(webwriter-evolution-sim) {display: none}",
  crop: (layouts[lang] ?? layouts.en).crop,
  async edit({at, mouse, keyboard, locate, widget, t}) {
    const start = rest(widget), create = await locate(control(t("New")))
    await mouse.place(start.x, start.y + 60)
    await at(350); await mouse.move(create.x, create.y, 550)
    await at(950); await mouse.click()
    const seed = await locate(input(t("Seed")))
    await at(1350); await mouse.move(seed.x + 60, seed.y + 12, 450)
    await at(1850); await mouse.click()
    // Tab skips the locked world size and scrolls the number of berry bushes into view.
    await at(2050); await keyboard.press("Tab")
    await at(2350); await keyboard.press("Backspace"); await keyboard.press("Backspace")
    await at(2500); await keyboard.type("70", 140)
    // The button straddles the widget's lower edge, where the editor's resize strip would take the click;
    // aim at whichever end of the button lies farther from that edge.
    const confirm = await locate(control(t("Create"))), edge = widget.y + widget.height
    const upper = confirm.top + 8, lower = confirm.top + confirm.height - 8
    await at(2800); await mouse.move(confirm.x, Math.abs(upper - edge) >= Math.abs(lower - edge) ? upper : lower, 450)
    await at(3350); await mouse.click()
    await at(3650); await mouse.move(start.x, start.y, 600)
  },
  async use({at, mouse, locate, widget, t}) {
    const start = rest(widget), speed = await locate(control("1x")), run = await locate(control(t("Start")))
    await mouse.place(start.x, start.y)
    await at(550); await mouse.move(speed.x, speed.y, 500)
    await at(1100); await mouse.click()
    await at(1350); await mouse.click()
    await at(1550); await mouse.move(run.x, run.y, 400)
    await at(2000); await mouse.click()
    await at(2300); await mouse.move(start.x, start.y + 40, 600)
  },
})
