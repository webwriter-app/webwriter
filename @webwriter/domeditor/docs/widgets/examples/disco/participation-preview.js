import {mountWidgetEffects} from "#preview-widget-effects"

const preview = document.getElementById("preview")
let effects = mountWidgetEffects(preview)
document.addEventListener("live-example-editing", event => {
  effects?.destroy()
  effects = event.detail ? undefined : mountWidgetEffects(preview)
})
window.addEventListener("pagehide", () => effects?.destroy(), {once: true})

preview.addEventListener("change", event => {
  if(event.target.id !== "allow-dance-tips") return
  const widget = preview.querySelector("ww-ghost-disco")
  if(widget) widget.allowTips = event.target.checked
})

function syncControls() {
  const widget = preview.querySelector("ww-ghost-disco")
  const checkbox = preview.querySelector("#allow-dance-tips")
  if(widget && checkbox) checkbox.checked = widget.hasAttribute("allow-tips")
}

new MutationObserver(syncControls).observe(preview, {
  subtree: true, childList: true, attributes: true, attributeFilter: ["allow-tips"],
})
syncControls()

preview.addEventListener("click", event => {
  if(event.target.id !== "submit-move") return
  const widget = preview.querySelector("ww-ghost-disco")
  if(!widget || !widget.reportValidity()) return
  widget.setAttribute("submitted", "")
  widget.dispatchEvent(new Event("submit"))
})
