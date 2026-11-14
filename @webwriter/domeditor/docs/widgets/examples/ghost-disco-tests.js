import "./dist/ww-ghost-disco.js"
import {checkLighting} from "./disco/checks.js"

const report = detail => window.dispatchEvent(new CustomEvent("test-update", {detail}))
const test = {id: "lighting", path: ["Ghost Disco", "restores and resets lighting"]}
report({type: "beforeAll"})
report({type: "beforeOne", ...test})
const widget = document.createElement("ww-ghost-disco")
try {
  widget.setAttribute("lighting", "neon")
  document.body.append(widget)
  await checkLighting(widget)
  report({type: "afterOne", ...test, passed: true})
} catch(error) {
  console.error(error)
  report({type: "afterOne", ...test, passed: false})
} finally {
  widget.remove()
  report({type: "afterAll"})
}
