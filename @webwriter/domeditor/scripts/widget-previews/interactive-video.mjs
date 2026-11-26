/** Edit: write a question into a new popup at 0:38. Use: play the moon landing up to the popup, which pauses the video and asks the question. */
const progress = `element => element.localName === "sl-range" && element.id === "progress-bar"`
// The add button is named by its id, which holds in every language.
const addPopup = `element => element.localName === "sl-button" && element.id === "add-button"`
const newPopup = `element => element.localName === "p" && element.parentElement?.localName === "webwriter-video-interaction" && element.parentElement.id === "2"`
/** The question the author types, per language; English is the default. */
const questions = {en: "Who climbs down the ladder?", de: "Wer steigt die Leiter hinunter?"}
/** Popups appear at this time; the use take starts playback shortly before it. */
const time = 38, duration = 61
/** Where the pointer rests between the takes, relative to the widget. */
const rest = widget => ({x: widget.x + widget.width * .74, y: widget.y + widget.width * .62})
/** The runner's blur would click the progress bar under the crop; the margin beside the widget is safe. */
const blur = async ({mouse, widget}) => { await mouse.clickAt({x: widget.x - 16, y: widget.y + widget.width * .3}); await new Promise(resolve => setTimeout(resolve, 600)) }
const seek = async ({mouse, locate}, seconds) => {
  const bar = await locate(progress)
  await mouse.clickAt({x: bar.left + bar.width * seconds / duration, y: bar.y})
  await new Promise(resolve => setTimeout(resolve, 800))
}

export default {
  package: "@webwriter/interactive-video", version: "4.0.1", snippet: "snippets/Mondlandung.html", tag: "webwriter-interactive-video",
  // Popups scale with the player against an 800 px base, so the player is wide enough for legible popup text
  // and the crop frames the middle of the video, where a new popup appears.
  width: 665, height: 820,
  ready: `document.querySelector("webwriter-interactive-video")?.videoLoaded`,
  crop: widget => ({x: widget.x + widget.width / 2 - 185, y: widget.y + widget.width * .375 - 185, width: 370, height: 370}),
  async prepareEdit(take) {
    // The author adds a popup at the current time with the player's own button, which sits below the crop.
    await seek(take, time)
    await take.mouse.clickAt(await take.locate(addPopup))
    await new Promise(resolve => setTimeout(resolve, 800))
    await blur(take)
  },
  async edit({at, mouse, keyboard, locate, widget, lang}) {
    const paragraph = await locate(newPopup)
    const start = rest(widget)
    await mouse.place(start.x + 30, start.y + 40)
    await at(450); await mouse.move(paragraph.left + 14, paragraph.y, 600)
    await at(1100); await mouse.click()
    await at(1400); await keyboard.type(questions[lang] ?? questions.en, 45)
    await at(3500); await mouse.move(start.x, start.y, 600)
  },
  async prepareUse(take) {
    await seek(take, time - 2)
    await blur(take)
  },
  async use({at, mouse, widget}) {
    const start = rest(widget)
    await mouse.place(start.x, start.y)
    // A click on the video plays it.
    await at(500); await mouse.move(widget.x + widget.width * .62, widget.y + widget.width * .5, 450)
    await at(1000); await mouse.click()
    await at(1300); await mouse.move(start.x, start.y, 600)
  },
}
