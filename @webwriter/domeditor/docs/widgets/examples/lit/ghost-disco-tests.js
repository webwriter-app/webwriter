import "./ww-ghost-disco.js"

const report = detail => window.dispatchEvent(new CustomEvent("test-update", {detail}))
const test = {id: "lighting", path: ["Ghost Disco", "restores the lighting"]}
report({type: "beforeAll"})
report({type: "beforeOne", ...test})
const widget = document.createElement("ww-ghost-disco")
try {
  widget.setAttribute("lighting", "neon")
  document.body.append(widget)
  if(widget.lighting !== "neon") throw new Error("Lighting was not restored")
  widget.setAttribute("lighting", "moonlight")
  if(widget.lighting !== "moonlight") throw new Error("Lighting did not update")
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
