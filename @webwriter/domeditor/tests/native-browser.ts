type Check = {name: string, error?: string}
import {DOMEditor} from "../src/domeditor"
import {$} from "../src/utility"

const checks: Check[] = []
const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const check = async (name: string, run: () => void | Promise<void>) => {
  try { await run(); checks.push({name}) }
  catch(error) { checks.push({name, error: String(error)}) }
}
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
const fixture = document.querySelector<HTMLElement>("#fixture")!

customElements.define("native-audit-widget", class extends HTMLElement {
  connectedCallback() { if(!this.shadowRoot) this.attachShadow({mode: "open"}).innerHTML = "<button>private</button>" }
})

const editor = new DOMEditor()
editor.schema.extendWidgets([{tagName: "native-audit-widget"}])

await check("editor command preserves a live selection", () => {
  const text = document.querySelector("#before")!.firstChild!
  const selection = getSelection()!
  selection.setBaseAndExtent(text, 2, text, 2)
  const inserted = document.createElement("span")
  inserted.textContent = " inserted"
  editor.features.manipulation.insert(inserted)
  assert(selection.anchorNode?.isConnected && selection.focusNode?.isConnected, "command left disconnected selection endpoints")
  assert(document.querySelector("#before > span")?.textContent === " inserted", `command did not insert at the selected caret: ${document.body.innerHTML}`)
})

await check("selection feature treats custom element as atomic", () => {
  const widget = fixture.querySelector("native-audit-widget")!
  $.selectElement(widget)
  editor.features.selection.processSelection()
  assert($.isElementSelection && $.selectedElement === widget, "selection feature did not select the widget host")
  assert(widget.classList.contains("◆element-selected"), "selection marker missing from widget host")
  assert(widget.shadowRoot!.querySelector("button"), "widget shadow DOM missing")
  assert(widget.getAttribute("contenteditable") === "true", "editor did not mark widget host as editable boundary")
})

await check("layout based hit testing returns the rendered target", async () => {
  await nextFrame()
  const target = document.querySelector<HTMLElement>("#hit-target")!
  const rect = target.getBoundingClientRect()
  assert(rect.width > 0 && rect.height > 0, "target has no rendered box")
  assert(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === target, "elementFromPoint missed target")
  const point = $.pointFromCoords(rect.left + rect.width / 2, rect.top + rect.height / 2, target, editor.schema)
  assert(point?.node, "editor hit testing returned no point")
})

await check("iframe lifecycle reaches load and cleans up", async () => {
  const frame = document.querySelector<HTMLIFrameElement>("#lifecycle")!
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("iframe load timed out")), 2000)
    if(frame.contentDocument?.readyState === "complete") { clearTimeout(timer); resolve(); return }
    frame.addEventListener("load", () => { clearTimeout(timer); resolve() }, {once: true})
  })
  assert(frame.contentDocument?.querySelector("p")?.textContent === "ready", "iframe document did not load")
  const frameWindow = frame.contentWindow as Window & {editor?: DOMEditor, editorError?: string, reinitializeEditor?: () => void}
  for(let attempt = 0; !frameWindow.editor && attempt < 40; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
  assert(frameWindow.editor, `iframe editor did not initialize${frameWindow.editorError ? `: ${frameWindow.editorError}` : ""}`)
  const iframeEditor = frameWindow.editor!
  iframeEditor.destroy()
  assert(!frame.contentDocument?.querySelector("[class*='◆']"), "iframe destroy left authored markers")
  assert(!frame.contentDocument?.body.shadowRoot?.querySelector("[class*='◆']"), "iframe destroy left appendix markers")
  assert(frameWindow.reinitializeEditor, "iframe reinitialization function missing")
  frameWindow.reinitializeEditor!()
  frameWindow.editor!.destroy()
  frame.remove()
  assert(!frame.isConnected && !document.querySelector("#lifecycle"), "iframe was not removed")
})

editor.destroy()

const failed = checks.filter(item => item.error)
document.querySelector("#status")!.textContent = `${checks.length - failed.length} passed, ${failed.length} failed`
document.querySelector("#report")!.textContent = JSON.stringify(checks, null, 2)
document.documentElement.dataset.nativeStatus = failed.length ? "failed" : "passed"
if(new URLSearchParams(location.search).has("run")) {
  await fetch("/__native-result", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({checks})})
}
