// This page hosts the examples; widgets themselves use only the public widget interface.
const query = new URLSearchParams(location.search)
const libraries = {vanilla: "JS", lit: "Lit", react: "React", vue: "Vue", angular: "Angular", svelte: "Svelte"}
const library = Object.hasOwn(libraries, query.get("library")) ? query.get("library") : "lit"
const steps = {1: "01-setup", 2: "02-rendering", 3: "03-content", 4: "04-state", 5: "05-options", 6: "06-collaboration"}
const step = Object.hasOwn(steps, query.get("step")) ? query.get("step") : "6"
const directory = library === "vanilla" ? "" : `${library}/`
const extension = ({react: "jsx", angular: "ts", svelte: "svelte"})[library] ?? "js"
document.title = `Quiz widget tutorial · ${libraries[library]}`
const source = `./${directory}${steps[step]}.${extension}`
await import(/* @vite-ignore */ source)

if(step === "6") {
  const [{SharedDOMDoc}, Y] = await Promise.all([
    import("../../../src/domdoc.ts"),
    import("yjs"),
  ])
  const participants = document.querySelector(".participants")
  const second = participants.firstElementChild.cloneNode(true)
  second.querySelector("h1").textContent = "Another participant"
  second.querySelector("ww-quiz").id = "quiz-example-peer"
  participants.append(second)
  // Reuse the real runtime with an in-memory connection, without a server.
  const data = new Y.Doc()
  const docs = [...participants.querySelectorAll("main")].map(root =>
    new SharedDOMDoc(undefined, undefined, [], ["◆"], {
      root,
      supportsWidgetData: widget => widget.localName === "ww-quiz",
      widgetData: {resolve: () => ({doc: data})},
    }),
  )
  window.addEventListener("pagehide", () => {
    docs.forEach(doc => doc.destroy())
    data.destroy()
  }, {once: true})
}
