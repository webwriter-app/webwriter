import {DOMEditor} from "../src/domeditor"
import {$} from "../src/utility"

customElements.define("float-layout-widget", class extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = '<style>:host { display: block; width: 100%; min-width: 900px; height: 120px; border: 2px solid teal; background: #e7f4f4; }</style>Widget with full-width defaults'
  }
})

// Real layout complements the focused Happy DOM transformation tests.
const editor = new DOMEditor()
const feature = editor.features.transformation
const controls = document.createElement("div")
controls.style.cssText = "position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;background:white;border:1px solid #888;padding:1rem;z-index:2147483647;font:14px system-ui"
controls.innerHTML = '<button type="button">Run transformation checks</button><p role="status">Ready</p><pre style="white-space:pre-wrap"></pre>'
editor.addAppendix(controls)
const button = controls.querySelector("button")!
const status = controls.querySelector("p")!
const report = controls.querySelector("pre")!
const closeTo = (actual: number, expected: number, message: string) => {
  if(Math.abs(actual - expected) > 1) throw new Error(`${message}: ${actual} instead of ${expected}`)
}
const assert = (condition: boolean, message: string) => { if(!condition) throw new Error(message) }

function targetElement(writingMode = "horizontal-tb", boxSizing = "border-box", position = "static") {
  feature.clearTransform()
  const target = document.createElement("demo-widget")
  target.style.cssText = `display:block;position:${position};box-sizing:${boxSizing};width:320px;height:180px;max-inline-size:unset;margin:30px auto;padding:8px;border:2px solid teal;writing-mode:${writingMode}`
  target.attachShadow({mode: "open"}).innerHTML = "<p>Widget content stays here.</p>"
  target.append(document.createComment("Keep authored content"))
  document.body.replaceChildren(target)
  return target
}

function drag(target: HTMLElement, direction: string, dx: number, dy: number, modifiers: MouseEventInit = {}) {
  feature.startTransform(target)
  const handle = feature.overlay.querySelector<HTMLElement>(`#◆transform-overlay-scale-${direction}`)!
  const rect = target.getBoundingClientRect()
  const clientX = direction.includes("left") ? rect.left : rect.right
  const clientY = direction.includes("up") ? rect.top : rect.bottom
  // Public mouse handlers exercise the gesture without synthetic pointer capture.
  handle.addEventListener("mousedown", event => feature.handleScaleStart(event), {once: true})
  handle.dispatchEvent(new MouseEvent("mousedown", {button: 0, clientX, clientY}))
  feature.handleScaleDrag(new MouseEvent("mousemove", {clientX: clientX + dx, clientY: clientY + dy, altKey: true, ...modifiers}))
  feature.handleScaleEnd()
}

button.onclick = async () => {
  button.disabled = true
  const results: string[] = []
  let failed = 0
  const check = (name: string, run: () => void) => {
    try { run(); results.push(`PASS ${name}`) }
    catch(error) { failed++; results.push(`FAIL ${name}: ${error}`) }
  }
  try {
    check("native floats preserve authored structure and serialize without editor artifacts", () => {
      const section = document.createElement("section")
      section.innerHTML = '<p style="color: rebeccapurple; width: 240px">Before</p><demo-widget style="color: teal; width: 180px; height: 90px; margin: 7px">Widget</demo-widget><p>After</p>'
      document.body.replaceChildren(section)
      const target = section.querySelector("demo-widget") as HTMLElement
      const siblings = Array.from(section.childNodes)
      for(const side of ["left", "none", "right"] as const) {
        $.selectElement(target)
        assert(editor.features.layout.actions.setFloat({type: "setFloat", side}), `Could not set ${side} float`)
        assert(target.style.float === (side === "none" ? "" : side), `${side} float was not applied`)
        assert(target.style.width === "180px" && target.style.height === "90px" && target.style.color === "teal", "Float changed unrelated styles")
        assert(target.style.margin === (side === "none" ? "" : "5px"), "Float did not apply or clear its 5px margin")
        assert(Array.from(section.childNodes).every((node, index) => node === siblings[index]), "Float changed authored siblings")
        assert(!section.querySelector(".ww-column-group, [class*=ww-column-]"), "Float created column markup")
      }
      editor.doc.syncFromDOM()
      const html = editor.toHTML(true)
      assert(html.includes("float: right") && !html.includes("◆") && !html.includes("ww-column"), "Float serialization retained editing artifacts or lost the authored float")
    })
    for(const writingMode of ["horizontal-tb", "vertical-rl", "vertical-lr", "sideways-rl"]) {
      for(const edge of ["left", "right", "up", "down"]) {
        check(`${writingMode}, ${edge} edge`, () => {
          const target = targetElement(writingMode, "border-box", "relative")
          const originalContent = target.innerHTML
          const before = target.getBoundingClientRect()
          const horizontal = edge === "left" || edge === "right"
          const dx = edge === "left" ? 40 : edge === "right" ? -40 : 0
          const dy = edge === "up" ? 40 : edge === "down" ? -40 : 0
          drag(target, edge, dx, dy)
          const rect = target.getBoundingClientRect()
          closeTo(rect.width, before.width - (horizontal ? 40 : 0), "Rendered width")
          closeTo(rect.height, before.height - (horizontal ? 0 : 40), "Rendered height")
          closeTo(edge === "left" ? rect.right : rect.left, edge === "left" ? before.right : before.left, "Horizontal anchor")
          closeTo(edge === "up" ? rect.bottom : rect.top, edge === "up" ? before.bottom : before.top, "Vertical anchor")
          assert(target.style.getPropertyValue(horizontal ? "max-width" : "max-height") !== "", "Affected physical maximum")
          assert(target.style.getPropertyValue(horizontal ? "max-height" : "max-width") === "", "Unaffected physical maximum")
          assert(target.style.width === "320px" && target.style.height === "180px", "Authored dimensions preserved")
          assert(target.innerHTML === originalContent, "Authored content preserved")
        })
      }
    }
    for(const boxSizing of ["border-box", "content-box"]) {
      check(`${boxSizing}, corner resize`, () => {
        const target = targetElement("horizontal-tb", boxSizing, "relative")
        const before = target.getBoundingClientRect()
        drag(target, "up-left", 40, 30)
        const rect = target.getBoundingClientRect()
        closeTo(rect.width, before.width - 40, "Width including padding and border")
        closeTo(rect.height, before.height - 30, "Height including padding and border")
        closeTo(rect.right, before.right, "Opposite horizontal edge")
        closeTo(rect.bottom, before.bottom, "Opposite vertical edge")
      })
    }
    check("centered resize with Ctrl/Cmd", () => {
      const target = targetElement()
      const before = target.getBoundingClientRect()
      drag(target, "right", -20, 0, {ctrlKey: true, metaKey: true})
      const rect = target.getBoundingClientRect()
      closeTo(rect.width, before.width - 40, "Symmetric width")
      closeTo(rect.left + rect.width / 2, before.left + before.width / 2, "Center")
    })
    check("fixed dimensions do not drift when the maximum grows", () => {
      const target = targetElement()
      const before = target.getBoundingClientRect()
      drag(target, "down-right", 40, 30)
      const rect = target.getBoundingClientRect()
      closeTo(rect.width, before.width, "Fixed width")
      closeTo(rect.height, before.height, "Fixed height")
      closeTo(rect.left, before.left, "Left edge")
      closeTo(rect.top, before.top, "Top edge")
      assert(target.style.maxWidth === "360px" && target.style.maxHeight === "210px", "Maximums authored")
    })
    check("fluid widget expands beyond the prose cap and still fits a narrow parent", () => {
      const target = targetElement()
      target.style.width = "100%"
      target.style.removeProperty("max-inline-size")
      const parent = document.createElement("div")
      parent.style.cssText = "width:1200px;max-inline-size:none"
      target.replaceWith(parent)
      parent.append(target)
      target.style.maxWidth = "720px"
      drag(target, "right", 200, 0)
      closeTo(target.getBoundingClientRect().width, 920, "Expanded widget")
      parent.style.width = "280px"
      closeTo(target.getBoundingClientRect().width, 280, "Narrow allocation")
      assert(target.style.width === "100%" && target.style.maxWidth === "920px", "Responsive width retained")
    })
    check("Shift retains CSS scaling", () => {
      const target = targetElement("horizontal-tb", "border-box", "relative")
      const before = target.getBoundingClientRect()
      drag(target, "right", 40, 0, {shiftKey: true})
      const rect = target.getBoundingClientRect()
      closeTo(rect.width, before.width + 40, "Scaled width")
      closeTo(rect.left, before.left, "Opposite edge")
      assert(target.style.maxInlineSize === "unset" && target.style.maxBlockSize === "", "Maximums unchanged")
      assert(target.style.scale !== "", "Scale authored")
    })
    check("static edge resize stays centered in normal flow", () => {
      const target = targetElement()
      target.style.width = "100%"
      target.style.removeProperty("max-inline-size")
      target.style.maxWidth = "320px"
      const before = target.getBoundingClientRect()
      drag(target, "right", 40, 0)
      const rect = target.getBoundingClientRect()
      closeTo(rect.width, before.width + 40, "Expanded flow width")
      closeTo(rect.left + rect.width / 2, before.left + before.width / 2, "Centered flow allocation")
      closeTo(rect.top, before.top, "Flow position")
      closeTo(rect.height, before.height, "Flow height")
      assert(target.style.position === "static" && target.style.left === "" && target.style.top === "", "Static positioning preserved")
    })
    check("static corner resize stays centered in normal flow", () => {
      const target = targetElement()
      target.style.width = "100%"
      target.style.removeProperty("max-inline-size")
      target.style.maxWidth = "320px"
      const before = target.getBoundingClientRect()
      drag(target, "down-right", 40, 30)
      const rect = target.getBoundingClientRect()
      closeTo(rect.width, before.width + 40, "Expanded flow width")
      closeTo(rect.left + rect.width / 2, before.left + before.width / 2, "Centered flow allocation")
      closeTo(rect.top, before.top, "Flow position")
      closeTo(rect.height, before.height, "Flow height")
      assert(target.style.position === "static" && target.style.left === "" && target.style.top === "", "Static positioning preserved")
    })
    check("one undo restores a resize and redo reapplies it", () => {
      const target = targetElement()
      drag(target, "down-right", -40, -30)
      editor.doc.syncFromDOM()
      editor.doc.undo()
      const restored = document.querySelector<HTMLElement>("demo-widget")!
      assert(restored.style.maxInlineSize === "unset" && restored.style.maxWidth === "" && restored.style.maxHeight === "", "Initial maximums restored")
      editor.doc.redo()
      const redone = document.querySelector<HTMLElement>("demo-widget")!
      assert(redone.style.maxWidth === "280px" && redone.style.maxHeight === "150px", "Resized maximums restored")
    })
  }
  finally {
    feature.clearTransform()
    report.textContent = results.join("\n")
    status.textContent = `${results.length - failed} passed, ${failed} failed`
    button.disabled = false
  }
}
