/** Edit: allow learners to move the map and zoom in on Aachen. Use: drag the map around the old town. */
const zoomIn = `element => element.localName === "a" && element.classList.contains("leaflet-control-zoom-in")`
const mapArea = `element => element.getAttribute("part") === "map"`
/** The editor take frames the toolbox above the map, the preview take the map alone. */
let crops = 0
/** Where the edit take leaves the pointer, relative to the crop, so the use take continues there. */
let handoff

export default {
  package: "@webwriter/map", version: "3.0.1", snippet: "snippets/Example-Location.html", tag: "webwriter-map",
  // A square map; the vector tiles load from the network, so give them time before recording.
  width: 430, style: "webwriter-map::part(map) {height: 365px !important}", settle: 5000,
  crop: widget => crops++ === 0 ? {x: widget.x, y: widget.y, width: widget.width, height: 365} : widget,
  async edit({at, mouse, locate, clip, t}) {
    const movement = await locate(`element => element.localName === "sl-details" && element.getAttribute("summary") === ${JSON.stringify(t("Movement"))}`)
    await mouse.place(clip.x + clip.width * .62, clip.y + clip.height * .78)
    await at(450); await mouse.move(movement.left + 70, movement.top + 29, 450)
    await at(950); await mouse.click()
    await at(1250)
    const toggle = await locate(`element => element.localName === "sl-switch"`)
    await mouse.move(toggle.left + 14, toggle.y, 300)
    await at(1600); await mouse.click()
    await at(1850)
    const zoom = await locate(zoomIn)
    await mouse.move(zoom.x, zoom.y, 450)
    await at(2400); await mouse.click()
    await at(2650)
    const map = await locate(mapArea)
    await mouse.move(map.x + 40, Math.min(map.top + 150, clip.y + clip.height - 40), 500)
    handoff = {x: mouse.position.x - clip.x, y: mouse.position.y - clip.y}
  },
  async use({at, mouse, locate, clip}) {
    await mouse.place(clip.x + handoff.x, clip.y + handoff.y)
    const map = await locate(mapArea)
    // Drag the map, which learners may do now; one gesture keeps the detailed video small.
    await at(600); await mouse.move(map.x - 30, map.y - 20, 500)
    await at(1200); await mouse.down()
    await mouse.move(map.x + 50, map.y + 40, 1300, t => [0, -Math.sin(Math.PI * t) * 12])
    await at(2600); await mouse.up()
    await at(2900); await mouse.move(map.x + 75, map.y + 85, 600)
  },
}
