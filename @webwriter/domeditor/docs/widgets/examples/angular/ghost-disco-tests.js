import "./dist/ww-ghost-disco.js"

const report = detail => window.dispatchEvent(new CustomEvent("test-update", {detail}))
const test = {id: "lighting-and-move", path: ["Ghost Disco", "keeps lighting and dance moves separate"]}
const widget = document.createElement("ww-ghost-disco")
const block = document.createElement("script")
block.type = "application/json"
block.slot = "data"
block.textContent = '{"move":""}'
widget.append(block)
const sendSnapshot = () => block.dispatchEvent(new CustomEvent("datachange", {bubbles: true}))
block.addEventListener("datarequest", sendSnapshot)
const render = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

report({type: "beforeAll"})
report({type: "beforeOne", ...test})
try {
  widget.lighting = "neon"
  document.body.append(widget)
  await render()
  const shadow = widget.shadowRoot
  if(shadow.querySelector(".stage").dataset.lighting !== "neon") throw new Error("Neon lighting was not rendered")
  shadow.querySelector('button[value="twirl"]').click()
  await render()
  if(JSON.parse(block.textContent).move !== "twirl") throw new Error("The dance move was not saved")
  widget.resetLighting()
  await render()
  if(widget.getAttribute("lighting") !== "moonlight") throw new Error("Reset did not save moonlight")
  if(shadow.querySelector("output").textContent.trim() !== "The ghost twirls!") throw new Error("Reset changed the dance move")
  block.textContent = '{"move":"float"}'
  sendSnapshot()
  await render()
  if(shadow.querySelector('button[value="float"]').getAttribute("aria-pressed") !== "true") throw new Error("The shared move was not rendered")
  report({type: "afterOne", ...test, passed: true})
}
catch(error) {
  console.error(error)
  report({type: "afterOne", ...test, passed: false})
}
finally {
  widget.remove()
  report({type: "afterAll"})
}
