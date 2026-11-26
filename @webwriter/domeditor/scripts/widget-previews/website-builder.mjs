/** Edit: switch the page to the grid layout and add a button. Use: open the generated code and scroll to the new button. */
const titled = label => `element => element.localName === "button" && (element.title === ${JSON.stringify(label)} || element.getAttribute("aria-label") === ${JSON.stringify(label)})`
const codeBody = `(() => { const find = root => { for(const element of root.querySelectorAll("*")) { if(element.matches("pre.code-body")) return element; const found = element.shadowRoot && find(element.shadowRoot); if(found) return found } }; return find(document) })()`
/** Where the edit take leaves the pointer, relative to the crop, so the use take continues there. */
let handoff

/**
 * Long words set the minimum width of a grid column. Soft hyphens let them break like the English words do,
 * so the four grid columns, with the added button, fit the canvas as in English.
 */
const breakable = {de: ["Fluss·layout", "an·ge·ord·net", "Navi·ga·tions·leis·ten"]}

export default ({lang}) => ({
  package: "@webwriter/website-builder", version: "2.0.0", snippet: "snippets/flow-starter.html", tag: "webwriter-website-builder",
  markup: html => (breakable[lang] ?? []).reduce((result, word) => result.replaceAll(word.replaceAll("·", ""), word.replaceAll("·", "\u00ad")), html),
  // The builder is 850 px high by default; a square keeps the page and its controls in view.
  width: 430, style: "webwriter-website-builder {height: 365px; min-height: 0}",
  async edit({at, mouse, locate, widget, clip, t}) {
    const layout = await locate(`element => element.localName === "button" && element.textContent.includes("▼")`)
    await mouse.place(widget.x + widget.width * .55, widget.y + widget.height * .62)
    await at(450); await mouse.move(layout.x, layout.y, 450)
    await at(950); await mouse.click()
    await at(1100)
    const grid = await locate(`element => element.localName === "button" && element.textContent.trim() === ${JSON.stringify(t("Grid"))}`)
    await mouse.move(grid.x, grid.y, 350)
    await at(1550); await mouse.click()
    await at(1800)
    const add = await locate(titled(t("Add component")))
    await mouse.move(add.x, add.y, 400)
    await at(2300); await mouse.click()
    await at(2450)
    const button = await locate(titled(t("Button")))
    await mouse.move(button.x, button.y, 400)
    await at(2950); await mouse.click()
    await at(3200); await mouse.move(widget.x + widget.width * .55, widget.y + widget.height * .9, 500)
    handoff = {x: mouse.position.x - clip.x, y: mouse.position.y - clip.y}
  },
  async use({at, mouse, locate, evaluate, clip, t}) {
    await mouse.place(clip.x + handoff.x, clip.y + handoff.y)
    const code = await locate(titled(t("Code")))
    await at(600); await mouse.move(code.x, code.y, 500)
    await at(1150); await mouse.click()
    await at(1500)
    const body = await locate(`element => element.matches("pre.code-body")`)
    await mouse.move(body.x + 20, body.y + 30, 500)
    // Scroll the markup to its end, where the new button is.
    await at(2200)
    const rest = await evaluate(`(pre => pre.scrollHeight - pre.clientHeight - pre.scrollTop)(${codeBody})`)
    const start = performance.now()
    for(let done = 0, t = 0; t < 1;) {
      t = Math.min(1, (performance.now() - start) / 1300)
      const delta = Math.round(rest * (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) - done)
      if(delta) await mouse.wheel(0, delta)
      done += delta
      await new Promise(resolve => setTimeout(resolve, 16))
    }
    // Rest right of the closing tags at the end, off the markup of the button.
    await at(3700); await mouse.move(body.left + body.width * .45, body.top + body.height - 22, 500)
  },
})
