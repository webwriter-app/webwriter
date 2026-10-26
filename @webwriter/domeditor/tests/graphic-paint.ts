import type {DOMEditor} from "../src/domeditor"
import {defaultDocumentTheme} from "../src/document-themes"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layoutFrame = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

export async function checkGraphicPaint() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><p></p><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
    for(let attempt = 0; !view.editor && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, "graphic paint fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const theme = doc.createElement("style")
    theme.textContent = defaultDocumentTheme.source; doc.head.append(theme)
    for(const layout of ["document", "canvas", "slides"] as const) {
      const current = editor.getDocumentLayoutState().mode
      if(current !== layout) assert(editor.setDocumentLayout(layout, current), `could not switch to ${layout}`)
      for(const standalone of [false, true]) for(const direction of ["horizontal", "vertical", "diagonal"]) {
        editor.features.graphic.actions.insertGraphic({type: "insertGraphic", ...(standalone ? {shape: "line" as const} : {})})
        if(!standalone) editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line"})
        const graphic = doc.querySelector("svg")!, line = graphic.querySelector("line")!
        graphic.setAttribute("viewBox", "0 0 640 360")
        Object.assign(graphic.style, {width: "640px", height: "360px", rotate: "15deg", transformOrigin: "25% 75%"})
        for(const [name, value] of Object.entries({x1: "240", y1: "180", x2: direction === "vertical" ? "240" : "400", y2: direction === "horizontal" ? "180" : "240"})) line.setAttribute(name, value)
        editor.features.selection.captureElement(graphic)
        editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "set-zoom", zoom: 200})
        if(standalone) {
          editor.features.selection.selectElement(graphic)
        }
        else {
          line.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, button: 0}))
          doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, button: 0}))
        }
        await layoutFrame()
        const before = line.getBoundingClientRect()
        const viewport = graphic.getAttribute("viewBox")
        const styles = graphic.getAttribute("style")
        const geometry = ["x1", "y1", "x2", "y2"].map(name => line.getAttribute(name)).join(" ")
        for(const color of ["#ef4444", "#22c55e", "#3b82f6"]) {
          editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "stroke", value: color})
          await layoutFrame()
          const after = line.getBoundingClientRect()
          assert(line.getAttribute("stroke") === color, `${layout}/${standalone}: stroke color did not change`)
          assert(["x1", "y1", "x2", "y2"].map(name => line.getAttribute(name)).join(" ") === geometry, "painting changed line endpoints")
          assert((["x", "y", "width", "height"] as const).every(key => Math.abs(after[key] - before[key]) < 1),
            `${layout}/${standalone}/${direction}: painting moved the line: ${JSON.stringify(before)} -> ${JSON.stringify(after)}; ${graphic.outerHTML}`)
          assert(graphic.getAttribute("viewBox") === viewport, `${layout}/${standalone}: painting rewrote the graphic viewport: ${viewport} -> ${graphic.getAttribute("viewBox")}`)
          assert(graphic.getAttribute("style") === styles, "painting changed the graphic's authored styles")
          assert(editor.features.graphic.selectedShape === line, "painting lost the line selection")
        }
        graphic.remove()
        await layoutFrame()
      }
    }
  }
  finally { (frame.contentWindow as Window & {editor?: DOMEditor}).editor?.destroy(); frame.remove() }
}
