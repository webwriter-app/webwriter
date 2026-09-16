import {DOMEditor} from "../src/domeditor"
import {$} from "../src/utility"
const editor = new DOMEditor()
const controls = document.createElement("div")
controls.style.cssText = "font:16px system-ui;margin:40px 0;display:flex;gap:12px"
const math = document.querySelector("math")!
const rootContent = math.innerHTML
for(const label of ["Empty formula", "Root", "Text formula", "Select formula", "Radicand", "Inner end", "Row end", "Outside", "Unfocused"]) {
  const button = document.createElement("button")
  button.textContent = label
  button.onclick = () => {
    if(label === "Empty formula") math.innerHTML = "<mrow></mrow>"
    if(label === "Root") math.innerHTML = rootContent
    if(label === "Text formula") math.innerHTML = "<mrow><mi>rterteet</mi></mrow>"
    if(label === "Select formula") {
      $.selectElement(math)
      editor.features.selection.processSelection(undefined, {scrollIntoView: false})
      editor.features.math.refresh()
      return
    }
    const row = math.firstElementChild!
    const point: [Node, number] = ["Radicand", "Empty formula", "Root", "Text formula"].includes(label)
      ? [math.querySelector("mroot")?.firstElementChild ?? row, 0]
      : label === "Inner end" ? [math, 1] : label === "Row end" ? [row, 1]
      : [math.nextSibling!, label === "Outside" ? 0 : 1]
    $.move(...point)
    editor.features.selection.processSelection(undefined, {scrollIntoView: false})
    editor.features.math.refresh()
  }
  controls.append(button)
}
editor.addAppendix(controls)

const blinkLabel = document.createElement("label")
const blink = document.createElement("input")
blink.type = "checkbox"
blink.checked = true
blink.onchange = () => {
  if(blink.checked) document.documentElement.style.removeProperty("--ww-ui-animation")
  else document.documentElement.style.setProperty("--ww-ui-animation", "none")
}
blinkLabel.append(blink, "Blink caret")
controls.append(blinkLabel)
