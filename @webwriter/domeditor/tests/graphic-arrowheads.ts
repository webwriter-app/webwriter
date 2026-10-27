import type {DOMEditor} from "../src/domeditor"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicArrowheads() {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:850px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.body.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor}
  try {
    for(let attempt = 0; !view.editor && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.editor, "arrowhead fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    editor.features.graphic.actions.insertGraphic({type: "insertGraphic"})
    const graphic = doc.querySelector("svg")!
    graphic.setAttribute("viewBox", "0 0 800 500")
    graphic.setAttribute("preserveAspectRatio", "none")
    Object.assign(graphic.style, {width: "640px", height: "350px"})
    editor.features.graphic.actions.addGraphicShape({type: "addGraphicShape", shape: "line-both-arrows"})
    const connector = graphic.querySelector("polyline")!
    connector.setAttribute("points", "100,200 500,200")
    connector.setAttribute("transform", "rotate(-35 300 200)")
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "start-arrow-size", value: "8"})
    editor.features.graphic.actions.setGraphicParameter({type: "setGraphicParameter", name: "end-arrow-size", value: "12"})
    const marker = (endpoint: string) => graphic.querySelector<SVGMarkerElement>(`[id="${connector.getAttribute(`marker-${endpoint}`)!.slice(5, -1)}"]`)!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    await layout()
    const matrix = DOMMatrix.fromMatrix(connector.getScreenCTM()!)
    const headPoint = matrix.transformPoint(new DOMPoint(520, 200))
    graphic.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: 10, clientY: 10}))
    doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, button: 0}))
    assert(editor.features.graphic.selectedShape === null, "could not clear connector selection")
    // Native markers are not separate DOM shape roots. A hit on their painted
    // area must resolve back to the authored connector, even beyond its shaft.
    graphic.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, button: 0, clientX: headPoint.x, clientY: headPoint.y}))
    doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, button: 0}))
    assert(editor.features.graphic.selectedShape === connector, "arrowhead click did not select its connector")
    await layout()
    const outline = editor.appendix.querySelector<SVGPolygonElement>(".◆graphic-selection-outline")!
    const bounds = outline.getBBox(), inverse = DOMMatrix.fromMatrix(outline.getScreenCTM()!).inverse()
    for(const [endpoint, x, sign] of [["start", 100, -1], ["end", 500, 1]] as const) {
      const size = Number(marker(endpoint).getAttribute("markerWidth")) * 6
      for(const [along, across] of [[-size / 2, -size / 2], [size / 2, 0], [-size / 2, size / 2]]) {
        const point = inverse.transformPoint(matrix.transformPoint(new DOMPoint(x + sign * along, 200 + sign * across)))
        assert(point.x >= bounds.x - .01 && point.x <= bounds.x + bounds.width + .01
          && point.y >= bounds.y - .01 && point.y <= bounds.y + bounds.height + .01, `${endpoint}: selection outline excludes arrowhead`)
      }
    }
    const handle = editor.appendix.querySelector<HTMLElement>('[data-graphic-handle="arrowhead-end"]')!
    const rect = handle.getBoundingClientRect(), start = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}
    const dx = matrix.a * -6 + matrix.c * -6, dy = matrix.b * -6 + matrix.d * -6
    handle.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, composed: true, button: 0, clientX: start.x, clientY: start.y}))
    doc.dispatchEvent(new view.PointerEvent("pointermove", {bubbles: true, buttons: 1, clientX: start.x + dx, clientY: start.y + dy}))
    await layout()
    assert(marker("end").getAttribute("markerWidth") === "12", "size preview mutated authored marker")
    assert(editor.appendix.querySelector('.◆graphic-preview marker[markerWidth="14"]'), "size preview lost its marker definition")
    doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, button: 0}))
    await layout()
    assert(marker("end").getAttribute("markerWidth") === "14", "rotated arrowhead size drag did not commit")
    assert(marker("start").getAttribute("markerWidth") === "8", "resizing end arrowhead changed start arrowhead")
    assert(!editor.appendix.querySelector('.◆graphic-preview'), "size drag leaked its preview")
  }
  finally { view.editor?.destroy(); frame.remove() }
}
