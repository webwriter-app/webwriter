import {DOMEditor} from "../src/domeditor"
import {createFigureLayout} from "../src/figure-layout.js"
import {defaultDocumentTheme} from "../src/document-themes"

const standalone = new URLSearchParams(location.search).has("standalone")
const editor = standalone ? null : new DOMEditor()
Object.assign(window, {editor})
if(standalone) {
  const style = document.createElement("style")
  style.textContent = defaultDocumentTheme.source
  document.head.append(style)
}
const figure = document.createElement("figure")
figure.style.cssText = "width:420px;max-width:100%;margin:60px auto"
const image = document.createElement("img")
image.alt = "Rotated diagram"
image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100"><rect width="360" height="100" fill="#225e77"/><path d="M20 75L90 20L180 65L260 25L340 75" fill="none" stroke="#95d7cf" stroke-width="6"/><text x="20" y="94" fill="white" font-size="14">A rotated diagram with an upright caption</text></svg>')}`
image.style.cssText = "display:block;width:360px;height:100px;rotate:30deg;transform-origin:20% 80%"
const caption = document.createElement("figcaption")
caption.textContent = "The caption flows through the available space beside the rotated diagram. Longer descriptions continue below it without covering the content."
caption.style.textAlign = "left"
figure.append(document.createComment("Keep authored content"), image, caption)
document.body.replaceChildren(figure)
const layout = standalone ? createFigureLayout(document) : editor!.features.layout
layout.refresh()
editor?.features.head.ensureCaptionEnumeration()
editor?.features.selection.selectElement(figure)
const controls = document.createElement("div")
controls.style.cssText = "position:fixed;bottom:20px;left:20px;background:white;padding:12px;border:1px solid #ddd;font:14px system-ui;z-index:1000"
for(const alignment of ["left", "center", "right"] as const) {
  const button = document.createElement("button")
  button.textContent = alignment
  button.onclick = () => { caption.style.textAlign = alignment; layout.refresh() }
  controls.append(button)
}
const above = document.createElement("button")
above.textContent = "Above / below"
above.onclick = () => { caption === figure.firstElementChild ? figure.append(caption) : figure.prepend(caption); layout.refresh() }
const rotate = document.createElement("button")
rotate.textContent = "Rotate"
rotate.onclick = () => { image.style.rotate = `${parseFloat(image.style.rotate) + 30}deg`; layout.refresh() }
controls.append(above, rotate)
const select = document.createElement("button")
select.textContent = "Select figure"
select.onclick = () => editor?.features.selection.captureElement(figure)
controls.append(select)
if(editor) editor.addAppendix(controls)
else {
  const appendix = document.body.attachShadow({mode: "open"})
  appendix.append(document.createElement("slot"), controls)
}
