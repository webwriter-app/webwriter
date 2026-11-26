/** Edit: switch the first chart from bars to lines. Use: hide two series through the legend, which leaves the rain days. */
const option = label => `element => element.localName === "sl-option" && element.textContent.trim() === ${JSON.stringify(label)}`
// The legend's items in the order of the series: rain days, high and low temperature.
const legend = index => `element => element.localName === "li" && element.dataset.idx === "${index}" && element.closest("#html-legend")`
// Where the pointer rests between the takes, relative to the widget: below the legend, so that leaving it
// restores the colors its hover dimmed, and below the plot, so that the chart shows no tooltip.
const rest = {x: 520, y: 648}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const typeSelect = `element => element.localName === "wwci-select" && element.classList.contains("select-chart-type")`

async function chooseType({mouse, locate, t}, type) {
  await mouse.clickAt(await locate(typeSelect))
  await sleep(500)
  await mouse.clickAt(await locate(option(t(type))))
  await sleep(500)
  await mouse.blur()
}

export default {
  package: "@webwriter/chart", version: "2.0.1", snippet: "snippets/bar+line-chart.html", tag: "webwriter-chart",
  // The snippet explains the widget in paragraphs around it; the preview shows the widget alone.
  // Below 600 px the widget is 640 px tall; at 560 px wide its controls share one row.
  width: 625, height: 900, style: "body > :not(webwriter-chart) {display: none}",
  // The controls, the plot and the legend, from just below the tabs: two thirds of their size.
  crop: widget => ({x: widget.x + 4, y: widget.y + 88, width: 552, height: 552}),
  // The chart type keeps the label it showed before the widget's translations loaded,
  // so choosing the current type again shows it in the widget's language.
  prepareEdit: take => chooseType(take, "Bar Chart"),
  async edit({at, mouse, locate, widget, t}) {
    const type = await locate(typeSelect)
    await mouse.place(widget.x + 500, widget.y + 117)
    await at(400); await mouse.move(type.x, type.y, 550)
    await at(1050); await mouse.click()
    const line = await locate(option(t("Line Chart")))
    await at(1350); await mouse.move(line.x, line.y, 400)
    await at(1850); await mouse.click()
    await at(2200); await mouse.move(widget.x + rest.x, widget.y + rest.y, 600)
  },
  prepareUse: take => chooseType(take, "Line Chart"),
  async use({at, mouse, locate, widget}) {
    const high = await locate(legend(1)), low = await locate(legend(2))
    await mouse.place(widget.x + rest.x, widget.y + rest.y)
    await at(500); await mouse.move(high.x, high.y, 500)
    await at(1100); await mouse.click()
    await at(1500); await mouse.move(low.x, low.y, 400)
    await at(2000); await mouse.click()
    await at(2400); await mouse.move(widget.x + rest.x, widget.y + rest.y, 500)
  },
}
