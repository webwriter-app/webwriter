/** Edit: add an edge from Ina to Ana. Use: run a breadth-first search from Ina, which reaches Ana over the new edge. */
const node = name => `element => element.getAttribute("part")?.includes("node") && element.textContent.trim() === ${JSON.stringify(name)}`
const button = label => `element => element.localName === "sl-button" && element.textContent.trim() === ${JSON.stringify(label)}`
const option = (select, label) => `element => element.localName === "sl-option" && element.textContent.trim() === ${JSON.stringify(label)} && element.closest("#${select}")`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// Where the pointer rests between the takes, relative to the widget: beside Ina, below the buttons on the right.
const rest = {x: 335, y: 125}
// German labels are longer; at 65 % the toolbar keeps Pause and Stop in its row while the search runs.
const zoom = {en: .7, de: .65}

export default ({lang}) => ({
  package: "@webwriter/graph", version: "2.0.1", snippet: "snippets/people.html", tag: "ww-graph",
  // The scene is at least 560 px tall. At 70 % the toolbar fits one row and the nodes stay legible;
  // the crop keeps the toolbar and the graph down to Frank and Ethan and leaves out Hanes and George below.
  width: 445, height: 760, style: `ww-graph {zoom: ${zoom[lang] ?? zoom.en}}`,
  crop: widget => ({x: widget.x + 190 - 183, y: widget.y + 194 - 183, width: 366, height: 366}),
  async edit({at, mouse, locate, widget, t}) {
    const add = await locate(button(t("Add edge"))), ina = await locate(node("Ina")), ana = await locate(node("Ana"))
    await mouse.place(widget.x + 300, widget.y + 360)
    await at(400); await mouse.move(add.x, add.y, 550)
    await at(1050); await mouse.click()
    await at(1250); await mouse.move(ina.x, ina.y, 550)
    await at(1900); await mouse.click()
    await at(2050); await mouse.move(ana.x, ana.y, 650)
    await at(2800); await mouse.click()
    await at(3050); await mouse.move(widget.x + rest.x, widget.y + rest.y, 500)
  },
  async prepareUse({mouse, keyboard, locate, widget, evaluate, t}) {
    const press = async target => { await mouse.move(target.x, target.y, 250); await sleep(350); await mouse.click(); await sleep(450) }
    const outside = async () => { await mouse.clickAt({x: widget.x + widget.width / 2, y: widget.y + widget.height + 25}); await sleep(600) }
    // Under zoom, an open tooltip's hover bridge catches clicks on the toolbar's left buttons,
    // so the keyboard switches to the Algorithm mode and sets the playback speed to 2x.
    const focused = () => evaluate(`(() => { let element = document.activeElement; while(element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement; const host = element?.getRootNode().host; return host?.localName === "sl-button" ? (host.classList.contains("playback-rate-button") ? "speed" : host.textContent.trim()) : "" })()`)
    const active = () => evaluate(`[...document.querySelector("ww-graph").shadowRoot.querySelectorAll("sl-tab-panel")].find(panel => panel.active)?.name`)
    const rate = () => evaluate(`document.querySelector("ww-graph").shadowRoot.querySelector("top-bar").shadowRoot.querySelector(".playback-rate-button")?.textContent.trim()`)
    const tabTo = async name => { for(let step = 0; step < 8 && await focused() !== name; step++) { await keyboard.press("Tab"); await sleep(250) } return await focused() === name }
    await outside()
    if(await tabTo(t("Algorithm"))) { await keyboard.press(" "); await sleep(500) }
    if(await active() !== "algo") throw new Error("The graph did not switch to the Algorithm mode")
    if(await tabTo("speed")) for(let step = 0; step < 4 && await rate() !== "2x"; step++) { await keyboard.press(" "); await sleep(300) }
    if(await rate() !== "2x") throw new Error("The graph did not switch to 2x playback")
    await outside()
    // Choosing the search again shows its name in the widget's language: the select keeps the label it had before
    // the translations loaded.
    await press(await locate(`element => element.localName === "sl-select" && !element.id && element.getRootNode().host?.localName === "algorithm-bar"`))
    await press(await locate(`element => element.localName === "sl-option" && element.getAttribute("value") === "bfs"`))
    await press(await locate(`element => element.id === "start-select"`))
    await press(await locate(option("start-select", "Ina")))
    await press(await locate(`element => element.id === "target-select"`))
    await press(await locate(option("target-select", "Ana")))
    // Ina has the id 7 and Ana the id 0.
    const ends = await evaluate(`(({startNode, targetNode}) => [startNode, targetNode].join())(document.querySelector("ww-graph"))`)
    if(ends !== "7,0") throw new Error(`The search runs between nodes ${ends} instead of Ina and Ana`)
    // Like mouse.blur(), but below the widget: the crop's lower edge cuts through the graph.
    await outside()
  },
  async use({at, mouse, locate, widget, t}) {
    const execute = await locate(button(t("Execute")))
    await mouse.place(widget.x + rest.x, widget.y + rest.y)
    // The search takes four steps of a second each, so it starts early to hold its result.
    await at(250); await mouse.move(execute.x, execute.y, 400)
    await at(700); await mouse.click()
    // Away from the button, which turns into Pause and would show its tooltip.
    await at(900); await mouse.move(widget.x + rest.x, widget.y + rest.y + 10, 500)
  },
})
