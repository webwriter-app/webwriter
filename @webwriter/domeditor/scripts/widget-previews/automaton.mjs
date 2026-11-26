/** Edit: draw a transition from q1 back to q0. Use: step through the word "ba", which the new transition accepts. */
const node = label => `element => element.localName === "ww-node" && element.textContent.trim() === ${JSON.stringify(label)}`
const tooltipButton = label => `element => element.localName === "sl-button" && element.closest("sl-tooltip")?.content === ${JSON.stringify(label)}`

export default {
  package: "@webwriter/automaton", version: "4.1.1", snippet: "snippets/nfa-simple.html", tag: "webwriter-automaton",
  // A square widget keeps its whole interface inside the card at a legible scale.
  width: 425, style: "webwriter-automaton {height: 360px}",
  async edit({at, mouse, locate}) {
    const q0 = await locate(node("q0")), q1 = await locate(node("q1"))
    await mouse.place(q1.x + 70, q1.y + 95)
    await at(450); await mouse.move(q1.x, q1.y, 600)
    await at(1100); await mouse.click()
    await at(1250); await mouse.move(q1.x, q1.y + q1.r, 300)
    await at(1650); await mouse.down()
    // Follow the arc that the new transition takes back to q0.
    await mouse.move(q0.x + q0.r * .6, q0.y + q0.r * .6, 1050, t => [0, Math.sin(Math.PI * t) * 22])
    await at(2800); await mouse.up()
    await at(2950); await mouse.move(q0.x + 40, q0.y + 105, 600)
  },
  async prepareUse({button, mouse}) {
    await mouse.clickAt(await button("Simulate"))
    await mouse.blur()
  },
  async use({at, mouse, keyboard, locate, field, t}) {
    const q0 = await locate(node("q0")), input = await field("Input Word"), start = await locate(tooltipButton(t("Step by Step")))
    // Continue from where the edit take left the pointer.
    await mouse.place(q0.x + 40, q0.y + 105)
    await at(450); await mouse.move(input.x - 20, input.y, 450)
    await at(950); await mouse.click()
    await at(1100); await keyboard.type("ba", 160)
    await at(1450); await mouse.move(start.x, start.y, 400)
    await at(1900); await mouse.click()
    for(const time of [2450, 3000, 3550, 4100]) {
      const next = await locate(tooltipButton(t("Next")))
      await mouse.move(next.x, next.y, 150)
      await at(time); await mouse.click()
    }
    await at(4300); await mouse.move(start.x + 30, start.y + 45, 450)
  },
}
