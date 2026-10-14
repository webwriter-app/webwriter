import "./dist/ww-quiz.js"

const report = detail => window.dispatchEvent(new CustomEvent("test-update", {detail}))
const test = {id: "answer", path: ["Quiz", "restores the correct answer"]}
report({type: "beforeAll"})
report({type: "beforeOne", ...test})
const widget = document.createElement("ww-quiz")
try {
  widget.setAttribute("answer", "true")
  document.body.append(widget)
  if(widget.getAttribute("answer") !== "true") throw new Error("Answer was not restored")
  widget.resetAnswer()
  if(widget.getAttribute("answer") !== "false") throw new Error("Reset action did not update the answer")
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
