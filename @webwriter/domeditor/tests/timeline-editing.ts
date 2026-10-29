import {DOMEditor} from "../src/domeditor"
import {sanitizePackageSnippet} from "../src/packages"
import {scopedCustomElementRegistryScript} from "../src/scoped-custom-element-registry-script"

// Manual native-input regression: focus/select the date, drag details in both
// directions and between paragraphs, then capture and play the YouTube frame.
// The selection report belongs to the shadow appendix, never authored content.

document.head.append(scopedCustomElementRegistryScript(document))
for(const name of ["webwriter-timeline", "webwriter-timeline-event", "webwriter-timeline-event-title", "webwriter-timeline-event-details"]) {
  await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@webwriter/timeline@2.1.1/dist/${name}.js`)
}
const editor = new DOMEditor()
editor.schema.extendWidgets([
  {tagName: "webwriter-timeline", editingConfig: {content: "webwriter-timeline-event*"}},
  {tagName: "webwriter-timeline-event", editingConfig: {content: "webwriter-timeline-event-title webwriter-timeline-event-details"}},
  {tagName: "webwriter-timeline-event-title", editingConfig: {content: "text*"}},
  {tagName: "webwriter-timeline-event-details", editingConfig: {content: "(p | flow)+"}},
])
const template = document.createElement("template")
template.innerHTML = sanitizePackageSnippet(`<webwriter-timeline>
<webwriter-timeline-event date="1943">
<webwriter-timeline-event-title>Event title</webwriter-timeline-event-title>
<webwriter-timeline-event-details><p>Women have been programming since before it was a thing. The first computer programmers developed algorithms and worked together on early electronic computers.</p><p>A second paragraph lets the selection extend naturally between paragraphs. Select forward and backward without pulling in the title above.</p></webwriter-timeline-event-details>
</webwriter-timeline-event></webwriter-timeline><p>Outside the timeline.</p><iframe title="Women in Tech YouTube video" src="https://www.youtube.com/embed/aPweFhhXFvY"></iframe>`)
document.body.replaceChildren(template.content)
editor.features.widget.refresh()
const report = document.createElement("output")
report.id = "selection-report"
report.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#edf4ff;color:#111;padding:8px;font:12px monospace;white-space:pre-wrap;pointer-events:none"
editor.addAppendix(report)
document.addEventListener("selectionchange", () => {
  const selection = document.getSelection()
  report.textContent = `Selected: ${selection?.toString()}\nBody markers: ${document.body.className}`
})
