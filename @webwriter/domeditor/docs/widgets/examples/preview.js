import {loadExample} from "./example-loader.js"

// This page hosts the examples; widgets themselves use only the public widget interface.
const query = new URLSearchParams(location.search)
const libraries = {vanilla: "JS", lit: "Lit", react: "React", vue: "Vue", angular: "Angular", svelte: "Svelte"}
const library = Object.hasOwn(libraries, query.get("library")) ? query.get("library") : "lit"
const guideExamples = {
  theming: () => import("./guide-theming.js"),
  reactivity: () => import("./guide-reactivity.js"),
  state: () => import("./guide-state.js"),
  "live-sessions": () => import("./guide-live-sessions.js"),
  publishing: () => import("./guide-publishing.js"),
}
const guide = query.get("guide")
if(Object.hasOwn(guideExamples, guide)) {
  const root = document.createElement("main")
  document.querySelector(".participants").replaceWith(root)
  document.title = "WebWriter widget guide example"
  const {mount} = await guideExamples[guide]()
  const dispose = await mount(root)
  if(typeof dispose === "function") window.addEventListener("pagehide", dispose, {once: true})
}
else await mountTutorial()

async function mountTutorial() {
  const steps = {1: "01-setup", 2: "02-rendering", 3: "03-content", 4: "04-state", 5: "05-options", 6: "06-collaboration"}
  const step = Object.hasOwn(steps, query.get("step")) ? query.get("step") : "6"
  const disco = query.get("example") === "ghost-disco"
  const tag = disco ? "ww-ghost-disco" : "ww-quiz"
  if(disco) {
    document.querySelector(".participants main").replaceChildren(
      document.getElementById("ghost-disco-example").content.cloneNode(true),
    )
  }
  document.title = `${disco ? "Ghost Disco" : "Quiz widget"} tutorial · ${libraries[library]}`
  await loadExample(library, disco ? steps[step].replace("-", "-disco-") : steps[step])

  if(step === "6") {
    const [{SharedDOMDoc}, Y] = await Promise.all([
      import("../../../src/domdoc.ts"),
      import("yjs"),
    ])
    const participants = document.querySelector(".participants")
    const second = participants.firstElementChild.cloneNode(true)
    second.querySelector("h1").textContent = "Another participant"
    const peer = second.querySelector(tag)
    peer.id += "-peer"
    participants.append(second)
    // Reuse the real runtime with an in-memory connection, without a server.
    const data = new Y.Doc()
    const docs = [...participants.querySelectorAll("main")].map(root =>
      new SharedDOMDoc(undefined, undefined, [], ["◆"], {
        root,
        supportsWidgetData: widget => widget.localName === tag,
        widgetData: {resolve: () => ({doc: data})},
      }),
    )
    window.addEventListener("pagehide", () => {
      docs.forEach(doc => doc.destroy())
      data.destroy()
    }, {once: true})
  }
}
