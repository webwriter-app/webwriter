/** Edit: add the concept "Teachers" and relate it to WebWriter. Use: open the pages of two concepts from the map. */
const node = label => `element => element.dataset?.itemId && element.textContent.trim() === ${JSON.stringify(label)}`
const nodeId = id => `element => element.dataset?.itemId === ${JSON.stringify(id)}`
/**
 * The snippet has no translations. `localization` covers the text of its pages; the concept and relation labels
 * live in the data block, which `markup` translates.
 */
const languages = {
  en: {concept: "Teachers", labels: {}},
  de: {
    concept: "Lehrkräfte",
    labels: {
      "Documents": "Dokumente", "Live sessions": "Live-Sitzungen", "Themes": "Designs", "Snippets": "Codeausschnitte", "Shared data": "Geteilte Daten",
      "authors": "erstellt", "offers": "bietet", "hosts": "veranstaltet", "styled by": "gestaltet durch", "reused in": "wiederverwendet in", "collect": "sammeln",
    },
    localization: Object.fromEntries(Object.entries({
      "Concepts of WebWriter": "Konzepte von WebWriter",
      "WebWriter brings text, media, and interactive widgets together in HTML documents. This map introduces the ideas behind authoring and using those documents.": "WebWriter verbindet Text, Medien und interaktive Widgets in HTML-Dokumenten. Diese Übersicht stellt die Ideen vor, die hinter dem Erstellen und Nutzen dieser Dokumente stehen.",
      "Return to the map and open a concept to explore it. Follow the arrows to see how the concepts relate.": "Kehre zur Übersicht zurück und öffne ein Konzept, um es zu erkunden. Folge den Pfeilen, um zu sehen, wie die Konzepte zusammenhängen.",
      "Documents hold the learning content, and themes give it a consistent appearance.": "Dokumente enthalten die Lerninhalte, und Designs geben ihnen ein einheitliches Erscheinungsbild.",
      "Widgets add interaction, and snippets provide ready-made examples.": "Widgets ergänzen Interaktion, und Codeausschnitte liefern fertige Beispiele.",
      "Live sessions let participants use the content together, with shared data where a widget supports it.": "In Live-Sitzungen nutzen Teilnehmende die Inhalte gemeinsam, mit geteilten Daten, wo ein Widget das unterstützt.",
      "Documents": "Dokumente",
      "A WebWriter document combines ordinary HTML content, such as headings, paragraphs, lists, and images, with interactive widgets.": "Ein WebWriter-Dokument verbindet gewöhnliche HTML-Inhalte wie Überschriften, Absätze, Listen und Bilder mit interaktiven Widgets.",
      "Authors arrange and edit the content. Readers explore the resulting material and use the interactions that its widgets provide.": "Autorinnen und Autoren ordnen und bearbeiten die Inhalte. Lesende erkunden das entstandene Material und nutzen die Interaktionen seiner Widgets.",
      "Widgets add activities and visualizations to a document. Examples include quizzes, simulations, diagrams, and this advance organizer.": "Widgets ergänzen ein Dokument um Aktivitäten und Visualisierungen, zum Beispiel Quizze, Simulationen, Diagramme und diesen Advance Organizer.",
      "Each widget supplies its own controls. Authors configure it in edit mode; readers use the interactions offered in reading mode.": "Jedes Widget bringt eigene Bedienelemente mit. Autorinnen und Autoren richten es im Bearbeitungsmodus ein; Lesende nutzen seine Interaktionen im Lesemodus.",
      "Live sessions": "Live-Sitzungen",
      "A live session connects a host with participants who use a document. Widgets that support sessions can collect responses and let the host review them.": "Eine Live-Sitzung verbindet die Leitung mit Teilnehmenden, die ein Dokument nutzen. Widgets, die Sitzungen unterstützen, können Antworten sammeln und der Leitung zur Durchsicht zeigen.",
      "The available participant actions depend on the widget and the permissions chosen by the author or host.": "Welche Aktionen Teilnehmenden offenstehen, hängt vom Widget und von den Berechtigungen ab, die Autorin, Autor oder Leitung festlegen.",
      "Themes": "Designs",
      "A theme gives a document a consistent visual style through choices such as fonts and colors. Widgets that support theming can follow those choices too.": "Ein Design gibt einem Dokument mit Schriften, Farben und weiteren Vorgaben einen einheitlichen Stil. Widgets, die Designs unterstützen, können diesen Vorgaben ebenfalls folgen.",
      "The content stays the same when its presentation changes.": "Der Inhalt bleibt gleich, wenn sich seine Darstellung ändert.",
      "Snippets": "Codeausschnitte",
      "A snippet is a prepared piece of content that an author can insert into a document. It can contain a configured widget, example data, and supporting text.": "Ein Codeausschnitt ist ein vorbereiteter Inhalt, den Autorinnen und Autoren in ein Dokument einfügen können. Er kann ein eingerichtetes Widget, Beispieldaten und erläuternden Text enthalten.",
      "This concept map is a snippet. After inserting it, an author can rename concepts, move them, change relations, and edit these explanations.": "Diese Concept-Map ist ein Codeausschnitt. Nach dem Einfügen lassen sich Konzepte umbenennen und verschieben, Relationen ändern und diese Erklärungen bearbeiten.",
      "Shared data": "Geteilte Daten",
      "Widgets that support sharing can keep data for one participant, for a group, or for everyone in a session.": "Widgets, die das Teilen unterstützen, können Daten für eine Person, für eine Gruppe oder für alle in einer Sitzung speichern.",
      "Individual data lets participants work on their own responses.": "Mit individuellen Daten bearbeiten Teilnehmende ihre eigenen Antworten.",
      "Group data supports a shared activity within a group.": "Gruppendaten unterstützen eine gemeinsame Aktivität innerhalb einer Gruppe.",
      "Data shared with everyone supports a common result.": "Mit allen geteilte Daten ermöglichen ein gemeinsames Ergebnis.",
      "The available sharing choices depend on the widget.": "Welche Möglichkeiten zum Teilen es gibt, hängt vom Widget ab.",
    }).map(([text, de]) => [`${text}#1`, {de}])),
  },
}
const anchor = (side, test) => `element => element.localName === "circle" && element.dataset.anchorPosition === "${side}" && (${test})(element.closest("[data-anchor-node-id]")?.dataset.anchorNodeId)`
const tooltipButton = label => `element => element.localName === "sl-button" && element.closest("sl-tooltip")?.content?.startsWith(${JSON.stringify(label)})`
const canvas = `element => element.getAttribute("part") === "canvas"`
const scale = `(() => { const find = root => { for(const element of root.querySelectorAll("*")) { if(element.matches("g.viewport")) return element; const found = element.shadowRoot && find(element.shadowRoot); if(found) return found } }; return Number(/scale\\(([\\d.]+)\\)/.exec(find(document)?.getAttribute("transform"))?.[1] ?? 0) })()`
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
/** Where the edit take leaves the pointer, relative to the crop, so the use take continues there. */
let handoff

/** Zooms in until labels are legible, then pans so WebWriter sits right of the free space for a new concept. */
async function frameMap({mouse, locate, button, evaluate}) {
  const zoomIn = await button("Zoom in")
  for(let attempt = 0; attempt < 5 && await evaluate(scale) < .7; attempt++) {
    await mouse.clickAt(zoomIn)
    await sleep(600)
  }
  const area = await locate(canvas)
  await mouse.move(area.x, area.top + area.height * .75, 200)
  await sleep(800)
  for(let attempt = 0; attempt < 3; attempt++) {
    const root = await locate(node("WebWriter"))
    const dx = Math.round(root.x - (area.left + area.width * .72)), dy = Math.round(root.y - (area.top + 85))
    if(Math.abs(dx) < 3 && Math.abs(dy) < 3) break
    await mouse.wheel(dx, dy)
    await sleep(500)
  }
  // Rest between the concept columns, away from anchors, so the zoom button's tooltip closes.
  await mouse.move(area.left + area.width * .42, area.top + area.height - 14, 200)
  await sleep(700)
}

export default ({lang}) => {
  const {concept, labels, localization} = languages[lang] ?? languages.en
  return {
    package: "@webwriter/advance-organizer", version: "2.0.0", snippet: "snippets/concepts-of-webwriter.html", tag: "webwriter-advance-organizer",
    localization,
    // The snippet sets lang="en" on the widget, which would keep its controls English.
    markup: html => html.replace(/("text":\s*")([^"]*)"/g, (_, start, label) => `${start}${labels[label] ?? label}"`)
      .replace(/(<webwriter-advance-organizer\b[^>]*\blang=")en"/, `$1${lang}"`),
    // A lower canvas keeps the widget square while a selected concept adds a second toolbar row in the editor.
    // In reading mode the canvas fills the widget's own height instead.
    width: 430, style: "webwriter-advance-organizer::part(canvas) {height: 274px}",
    crop: widget => ({x: widget.x, y: widget.y, width: widget.width, height: 362}),
    prepareEdit: frameMap,
    async edit({at, mouse, keyboard, locate, clip, t}) {
      const area = await locate(canvas), root = await locate(node("WebWriter"))
      const spot = {x: area.left + 66, y: root.y}
      await at(400); await mouse.move(spot.x, spot.y, 450)
      await at(900); await mouse.doubleClick()
      await at(1150)
      const added = await locate(node(t("New concept")))
      await mouse.move(added.x, added.y, 200)
      await at(1450); await mouse.doubleClick()
      await at(1600); await keyboard.type(concept, 75)
      await at(2300); await keyboard.press("Enter")
      await at(2400)
      const relation = await locate(tooltipButton(t("Add relation")))
      await mouse.move(relation.x, relation.y, 400)
      await at(2850); await mouse.click()
      await at(3000)
      const from = await locate(anchor("right", `id => id && !${JSON.stringify(["webwriter", "documents", "widgets", "live-sessions", "themes", "snippets", "shared-data"])}.includes(id)`))
      await mouse.move(from.x, from.y, 300)
      await at(3350); await mouse.click()
      const to = await locate(anchor("left", `id => id === "webwriter"`))
      await at(3450); await mouse.move(to.x, to.y, 300)
      await at(3800); await mouse.click()
      const teachers = await locate(node(concept))
      await at(3950); await mouse.move(teachers.x + 10, teachers.y + teachers.height / 2 + 45, 500)
      handoff = {x: mouse.position.x - clip.x, y: mouse.position.y - clip.y}
    },
    prepareUse: frameMap,
    async use({at, mouse, locate, clip, t}) {
      await mouse.place(clip.x + handoff.x, clip.y + handoff.y)
      const widgets = await locate(nodeId("widgets"))
      const documents = await locate(nodeId("documents"))
      await at(550); await mouse.move(widgets.x, widgets.y, 450)
      await at(1050); await mouse.click()
      await at(1250)
      const back = await locate(tooltipButton(t("Go back")))
      await at(2450); await mouse.move(back.x, back.y, 400)
      await at(2900); await mouse.click()
      await at(3050); await mouse.move(documents.x, documents.y, 400)
      await at(3500); await mouse.click()
      await at(3750); await mouse.move(clip.x + clip.width * .6, clip.y + clip.height * .78, 500)
    },
  }
}
