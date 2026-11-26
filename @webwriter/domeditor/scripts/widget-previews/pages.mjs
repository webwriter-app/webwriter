/** Edit: add a page, name its tab "Try it" and write on it. Use: read through the tabs up to the new page. */
const tab = label => `element => element.localName === "button" && element.classList.contains("page-select") && element.title === ${JSON.stringify(label)}`
const activePage = `element => element.localName === "webwriter-page" && element.matches(":state(ww-page-active)")`
/** The typed tab name and text, and the snippet's tab labels, which are attributes that its localization leaves out. */
const words = {
  en: {tab: "Try it", text: "Your turn!", labels: {}},
  // Short names keep the tabs and the label field of the new tab readable.
  de: {tab: "Üben", text: "Du bist dran!", labels: {Create: "Erstellen", Explore: "Erkunden", Collaborate: "Gemeinsam", Extend: "Erweitern"}},
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** An element's box once the tab strip has stopped scrolling it. */
async function settled(locate, predicate) {
  let box = await locate(predicate)
  for(let attempt = 0; attempt < 8; attempt++) {
    await sleep(100)
    const next = await locate(predicate)
    if(Math.abs(next.x - box.x) < 1) return next
    box = next
  }
  return box
}

/** The middle of the visible part of a tab, once the tab strip has stopped scrolling. */
async function tabTarget(locate, label) {
  const box = await settled(locate, tab(label))
  const strip = await locate(`element => element.classList.contains("page-tabs-wrapper")`)
  const left = Math.max(box.left, strip.left), right = Math.min(box.left + box.width, strip.left + strip.width)
  return {x: (left + right) / 2, y: box.y}
}

export default ({lang}) => {
  const {tab: newTab, text, labels} = words[lang] ?? words.en
  const label = english => labels[english] ?? english
  return {
    package: "@webwriter/pages", version: "3.0.1", snippet: "snippets/what-is-webwriter.html", tag: "webwriter-pages",
    // A top margin centers the 16:9 tabs in the square without the editor's ribbon or the preview's header.
    width: 430, style: "webwriter-pages {margin-block-start: 64px}",
    markup: html => html.replace(/(<webwriter-page\b[^>]*\blabel=")([^"]*)"/g, (_, start, english) => `${start}${label(english)}"`),
    async edit({at, mouse, keyboard, locate, button, widget}) {
      const add = await button("Add page")
      await mouse.place(widget.x + widget.width * .62, widget.y + widget.height * .7)
      await at(450); await mouse.move(add.x, add.y, 450)
      await at(950); await mouse.click()
      // The tab strip scrolls the new tab into view first.
      await at(1250)
      const name = await settled(locate, `element => element.localName === "input" && element.classList.contains("page-label-input")`)
      await mouse.move(name.x, name.y, 300)
      await at(1800); await mouse.click()
      await at(1900); await keyboard.type(newTab, lang === "en" ? 100 : 60)
      const page = await locate(activePage)
      await at(2550); await mouse.move(page.left + 40, page.top + 26, 400)
      await at(3000); await mouse.click()
      await at(3100); await keyboard.type(text, lang === "en" ? 75 : 60)
      await at(4000); await mouse.move(page.left + page.width * .6, page.top + page.height * .6, 500)
    },
    async use({at, mouse, locate, button}) {
      // Continue from the point in the page where the edit take left the pointer.
      const page = await locate(activePage)
      await mouse.place(page.left + page.width * .6, page.top + page.height * .6)
      const explore = await tabTarget(locate, label("Explore"))
      await at(500); await mouse.move(explore.x, explore.y, 400)
      await at(950); await mouse.click()
      const collaborate = await tabTarget(locate, label("Collaborate"))
      await at(1250); await mouse.move(collaborate.x, collaborate.y, 400)
      await at(1700); await mouse.click()
      await at(1850)
      const forward = await button("Scroll tabs forward")
      await mouse.move(forward.x, forward.y, 400)
      await at(2300); await mouse.click()
      await at(2650)
      const tryIt = await tabTarget(locate, newTab)
      await mouse.move(tryIt.x, tryIt.y, 400)
      await at(3100); await mouse.click()
      await at(3350); await mouse.move(page.left + page.width * .6, page.top + page.height * .6, 550)
    },
  }
}
