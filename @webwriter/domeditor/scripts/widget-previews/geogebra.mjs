/** Edit: type a command that labels the fence length. Use: nudge the slider a and watch the area change while the fence stays 24 m. */
// The construction runs in a frame, so its parts are addressed relative to the widget, which the column caps at 720 px.
const relative = (widget, x, y) => ({x: widget.x + x, y: widget.y + y})
const input = [150, 345], slider = [90, 101], step = 17.8, rest = [122, 158]
/** The command the author types, with the label in the recording's language. */
const fence = {en: "Fence", de: "Zaun"}
const command = lang => `Text("${fence[lang] ?? fence.en}: "+2(a+12-a)+" m",(3,14))`

export default ({lang}) => ({
  package: "@webwriter/geogebra", version: "2.0.2", tag: "webwriter-geogebra",
  // The package has no snippets; the construction from the former garden lesson shows rectangles with 24 m of fencing.
  example: {file: "scripts/widget-previews/geogebra.html", selector: "webwriter-geogebra"},
  // The construction names its applet language; other recordings switch GeoGebra's tools and input bar to theirs.
  markup: html => lang === "en" ? html : html.replace(/(<webwriter-geogebra[^>]*?\slanguage=")en"/, `$1${lang}"`),
  width: 865, height: 720,
  ready: `(() => { const api = document.querySelector("webwriter-geogebra")?.shadowRoot?.querySelector("iframe")?.contentWindow?.ggbApplet; return typeof api?.exists === "function" && api.exists("a") })()`,
  settle: 2500,
  // The square holds the tools, the slider, the rectangle up to a = 7 and the input bar at their page size.
  crop: widget => ({x: widget.x + 206 - 184, y: widget.y + 182 - 184, width: 368, height: 368}),
  async edit({at, mouse, keyboard, widget}) {
    const field = relative(widget, ...input), end = relative(widget, ...rest)
    await mouse.place(end.x + 110, end.y + 90)
    await at(400); await mouse.move(field.x, field.y, 550)
    await at(1000); await mouse.click()
    // GeoGebra previews the text while the command is typed.
    await at(1200); await keyboard.type(command(lang), 35)
    await at(3100); await keyboard.press("Enter")
    await at(3300); await mouse.move(end.x, end.y, 650)
  },
  async use({at, mouse, widget}) {
    const end = relative(widget, ...rest)
    let {x, y} = relative(widget, ...slider)
    await mouse.place(end.x, end.y)
    await at(550); await mouse.move(x, y, 550)
    // Each change reloads the construction in the widget, which ends a drag, so the learner nudges the slider step by step.
    for(const time of [1150, 1800, 2450]) {
      await at(time); await mouse.down()
      await mouse.move(x + step, y, 320)
      x += step
      await mouse.up()
    }
    await at(3200); await mouse.move(end.x + 20, end.y + 12, 650)
  },
})
