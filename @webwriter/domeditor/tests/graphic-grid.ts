import type {DOMEditor} from "../src/domeditor"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkGraphicGrid() {
  const inspect = new URLSearchParams(location.search).has("inspect-grid")
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:650px;border:0;max-width:none"
  frame.srcdoc = '<!doctype html><body><script class="◆editor-only" type="module" src="/tests/native-browser-frame.ts"></script></body>'
  document.querySelector("#fixture")!.append(frame)
  const view = frame.contentWindow as Window & typeof globalThis & {editor?: DOMEditor, editorError?: string}
  try {
    for(let attempt = 0; !view.editor && attempt < 80; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    assert(view.editor && !view.editorError, view.editorError ?? "Grid fixture did not initialize")
    const editor = view.editor!, doc = frame.contentDocument!
    const layout = async () => {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
    doc.body.innerHTML = '<svg viewBox="100 50 1200 600" style="display:block;margin:40px;width:600px;height:360px"></svg>'
    const graphic = doc.querySelector("svg")!
    editor.features.selection.captureElement(graphic)
    let pointerId = 1
    for(const [aspect, width, height, zoom, rotation] of [
      ["xMidYMid meet", 600, 360, 100, 0],
      ["none", 620, 310, 150, 12],
      ["xMaxYMin slice", 510, 270, 75, 0],
    ] as const) {
      graphic.replaceChildren()
      graphic.setAttribute("preserveAspectRatio", aspect)
      Object.assign(graphic.style, {width: `${width}px`, height: `${height}px`, rotate: `${rotation}deg`})
      editor.features.graphic.actions.navigateGraphic({type: "navigateGraphic", operation: "set-zoom", zoom})
      const panId = pointerId++
      doc.dispatchEvent(new view.KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: " ", code: "Space"}))
      graphic.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, cancelable: true, button: 0,
        pointerId: panId, clientX: 200, clientY: 200}))
      doc.dispatchEvent(new view.PointerEvent("pointermove", {bubbles: true, buttons: 1, pointerId: panId, clientX: 217, clientY: 189}))
      doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, pointerId: panId, clientX: 217, clientY: 189}))
      doc.dispatchEvent(new view.KeyboardEvent("keyup", {bubbles: true, key: " ", code: "Space"}))
      await layout()
      // Locate the visual CSS background from the fixture's known CSS rotation
      // and rendered bounds, independently of SVG's pan/zoom transforms.
      const rect = graphic.getBoundingClientRect(), rotated = new DOMMatrix().rotate(rotation)
      const css = new DOMMatrix([rotated.a, rotated.b, rotated.c, rotated.d,
        rect.left - Math.min(0, rotated.a * width, rotated.c * height, rotated.a * width + rotated.c * height),
        rect.top - Math.min(0, rotated.b * width, rotated.d * height, rotated.b * width + rotated.d * height)])
      const screen = DOMMatrix.fromMatrix(graphic.getScreenCTM()!)
      const click = (x: number, y: number, altKey = false) => {
        const client = new DOMPoint(x, y).matrixTransform(css), id = pointerId++
        graphic.dispatchEvent(new view.PointerEvent("pointerdown", {bubbles: true, cancelable: true, isPrimary: true,
          button: 0, pointerId: id, clientX: client.x, clientY: client.y, altKey}))
        doc.dispatchEvent(new view.PointerEvent("pointerup", {bubbles: true, pointerId: id, clientX: client.x, clientY: client.y, altKey}))
      }
      editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "lines"})
      click(121, 95)
      click(167, 145)
      click(210, 185, true)
      doc.dispatchEvent(new view.KeyboardEvent("keydown", {bubbles: true, cancelable: true, key: "Enter"}))
      await layout()
      const path = graphic.querySelector("path")!
      assert(path, `${aspect}/${zoom}: drawing did not commit`)
      const points = path.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
      for(const [index, expected] of [[0, [120, 96]], [1, [168, 144]], [2, [210, 185]]] as const) {
        const actual = new DOMPoint(points[index * 2], points[index * 2 + 1]).matrixTransform(screen).matrixTransform(css.inverse())
        assert(Math.abs(actual.x - expected[0]) < .05 && Math.abs(actual.y - expected[1]) < .05,
          `${aspect}/${zoom}: point ${index} misses the visible grid (${actual.x}, ${actual.y})`)
      }
      assert(view.getComputedStyle(graphic).backgroundSize.includes("24px 24px"), "grid tile spacing changed")
      assert(!editor.toHTML(true).includes("◆") && !editor.doc.body.toString().includes("◆"), "grid artifacts entered document content")
      editor.features.graphic.actions.setGraphicMode({type: "setGraphicMode", mode: "select"})
    }
    if(inspect) {
      // Highlight the path for the visual check of its snapped vertices.
      const path = graphic.querySelector("path")!
      path.setAttribute("stroke", "#ef4444")
      path.setAttribute("stroke-width", "6")
      await layout()
    }
  }
  finally {
    if(!inspect) { view.editor?.destroy(); frame.remove() }
  }
}
