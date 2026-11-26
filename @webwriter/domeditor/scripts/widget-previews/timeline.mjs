/** Edit: add a dated event at the end of the timeline. Use: scroll down the timeline to the new event. */
const title = text => `element => element.localName === "h2" && element.slot === "title" && element.textContent.trim() === ${JSON.stringify(text)}`
const scrollTop = `document.scrollingElement.scrollTop`
const scrollRest = `document.scrollingElement.scrollHeight - innerHeight - document.scrollingElement.scrollTop`
/** Where the edit take leaves the pointer, relative to the crop, so the use take continues there. */
let handoff

/** Scrolls the frame with wheel input until `delta` pixels have passed, eased over `duration` milliseconds. */
async function scrollBy({mouse, evaluate}, delta, duration) {
  const from = await evaluate(scrollTop), start = performance.now()
  for(let t = 0; t < 1;) {
    t = Math.min(1, (performance.now() - start) / duration)
    const eased = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    const step = Math.round(from + delta * eased - await evaluate(scrollTop))
    if(step) await mouse.wheel(0, step)
    await new Promise(resolve => setTimeout(resolve, 16))
  }
}

export default {
  package: "@webwriter/timeline", version: "3.0.0", snippet: "snippets/history-of-olympic-games.html", tag: "webwriter-timeline",
  // A smaller type size keeps two events in view; the dated entries must be rendered before recording.
  width: 430, style: `webwriter-timeline {font-size: 15px} webwriter-timeline h2[slot="title"] {font-size: 1.2em; line-height: 1.25}`,
  ready: `customElements.get("webwriter-timeline-event") && document.querySelectorAll("webwriter-timeline-event").length > 6 && [...document.querySelectorAll("webwriter-timeline-event")].every(event => event.shadowRoot?.querySelector(".marker"))`,
  settle: 2000,
  // The end of the timeline lies at the bottom of each frame, so the crop sits low in the viewport,
  // above the preview's floating buttons.
  crop: widget => ({x: widget.x, y: 275, width: widget.width, height: 370}),
  async prepareEdit({mouse, widget}) {
    await mouse.place(widget.x + widget.width - 30, 450)
    await mouse.wheel(0, 5000)
    await new Promise(resolve => setTimeout(resolve, 800))
  },
  async edit({at, mouse, keyboard, locate, button, clip}) {
    const add = await button("Add Event")
    await at(450); await mouse.move(add.x, add.y, 450)
    await at(950); await mouse.click()
    // The new event focuses its date field.
    await at(1250); await keyboard.type("2024", 130)
    await at(1850); await keyboard.press("Enter")
    await at(1950)
    const heading = await locate(title(""))
    await mouse.move(heading.left + 30, heading.y, 400)
    await at(2450); await mouse.click()
    await at(2550); await keyboard.type("Paris 2024", 80)
    await at(3550); await mouse.move(heading.left + heading.width - 40, heading.y + 45, 500)
    handoff = {x: mouse.position.x - clip.x, y: mouse.position.y - clip.y}
  },
  async prepareUse(take) {
    const {mouse, locate, clip} = take
    await mouse.place(clip.x + clip.width - 40, clip.y + clip.height / 2)
    // Start with the last original event, the one before the new event, low in the crop; a short scroll keeps the text readable.
    const last = await locate(`element => element.localName === "h2" && element.slot === "title" && element.parentElement === element.parentElement.parentElement.lastElementChild?.previousElementSibling`)
    await mouse.wheel(0, Math.round(last.top - clip.y - 250))
    await new Promise(resolve => setTimeout(resolve, 600))
  },
  async use(take) {
    const {at, mouse, evaluate, clip} = take
    await mouse.place(clip.x + handoff.x, clip.y + handoff.y)
    await at(700); await scrollBy(take, await evaluate(scrollRest), 2000)
  },
}
