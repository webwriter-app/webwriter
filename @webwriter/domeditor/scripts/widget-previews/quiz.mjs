/** Edit: negate the true/false statement by typing "not" and mark it true. Use: answer both questions and submit. */
// @webwriter/quiz publishes no snippets, so the quiz comes from an existing lesson.
const marker = id => `element => element.classList.contains("marker") && element.getRootNode().host?.id === ${JSON.stringify(id)}`
const button = label => `element => element.localName === "sl-button" && element.textContent.trim() === ${JSON.stringify(label)}`
// The quiz's primary action; its label stays English in some languages, so the structure finds it.
const submitButton = `element => element.localName === "sl-button" && element.getAttribute("variant") === "primary" && element.parentElement?.classList.contains("actions")`

/** Page coordinates of a word in the quiz's authored text, read with a Range. */
async function word({evaluate, widget}, text) {
  const box = await evaluate(`(() => {
    const quiz = document.querySelector("webwriter-quiz"), walker = document.createTreeWalker(quiz, NodeFilter.SHOW_TEXT)
    for(let node; node = walker.nextNode();) {
      const index = node.data.indexOf(${JSON.stringify(text)})
      if(index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + ${text.length})
      const box = range.getBoundingClientRect(), host = quiz.getBoundingClientRect()
      return {x: box.x - host.x, y: box.y - host.y, height: box.height}
    }
  })()`)
  return {left: widget.x + box.x, y: widget.y + box.y + box.height / 2}
}

// The pointer rests beside the true/false buttons at the end of the edit and the start of the use take.
const rest = async ({widget, locate, t}) => ({x: widget.x + 300, y: (await locate(button(t("True")))).y})

// The negation is typed in front of the verb of the second statement, per language.
const negation = {
  en: {verb: "change", typed: "not "},
  de: {verb: "ändern", typed: "nicht "},
}
// The lesson is English; these translations read as German, and the German statement turns true with "nicht" as well.
const localization = {
  "How many hydrogen atoms are represented by 3H₂?#1": {de: "Wie viele Wasserstoffatome stellt 3H₂ dar?"},
  "You may change a formula’s subscripts to balance an equation while keeping the same substances.#1": {de: "Um eine Gleichung auszugleichen, darf man die Indizes einer Formel ändern, ohne die Stoffe zu verändern."},
}

export default ({lang}) => ({
  package: "@webwriter/quiz", version: "2.0.0", example: {file: "examples/09-chemistry-conservation.html", selector: "webwriter-quiz"}, tag: "webwriter-quiz",
  localization,
  // The submitted score row needs about 480 px; a slight zoom fits it into the square crop without overflowing the card.
  // Space above the quiz lets the square center it below the editor's toolbar.
  width: 450, style: "webwriter-quiz {zoom: .8; margin-top: 75px}",
  async edit(take) {
    const {at, mouse, keyboard, locate, widget, t} = take
    const {verb, typed} = negation[lang] ?? negation.en
    const change = await word(take, verb), end = await rest(take)
    await mouse.place(widget.x + 320, widget.y + 150)
    await at(450); await mouse.move(change.left + 1.5, change.y, 550)
    await at(1050); await mouse.click()
    await at(1250); await keyboard.type(typed, typed.length > 4 ? 95 : 130)
    const yes = await locate(button(t("True")))
    await at(1900); await mouse.move(yes.x, yes.y, 500)
    await at(2500); await mouse.click()
    await at(2700); await mouse.move(end.x, end.y, 500)
  },
  async use(take) {
    const {at, mouse, locate, t} = take
    const end = await rest(take), six = await locate(marker("atoms-2")), yes = await locate(button(t("True"))), submit = await locate(submitButton)
    await mouse.place(end.x, end.y)
    await at(500); await mouse.move(six.x, six.y, 450)
    await at(1000); await mouse.click()
    await at(1250); await mouse.move(yes.x, yes.y, 450)
    await at(1750); await mouse.click()
    await at(2000); await mouse.move(submit.x, submit.y, 450)
    await at(2500); await mouse.click()
    await at(2750); await mouse.move(end.x, end.y, 500)
  },
})
